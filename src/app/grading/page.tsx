'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Save, Eye, EyeOff } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import {
  DefectConfig,
  DefectThresholds,
  calculatePrimaryDefects,
  calculateSecondaryDefects,
  calculateTotalDefects,
  getDefectsByCategory,
  validateDefectCounts
} from '@/types/defect-configuration'
import {
  ScreenSizeConstraint,
  getConstraintDisplayText,
  validateScreenSizeDistribution
} from '@/types/screen-size-constraints'
import {
  SampleVisibilitySettings,
  getVisibilitySettings,
  updateVisibilitySetting
} from '@/lib/sample-visibility'
import { useToast } from '@/hooks/use-toast'

// Pastel colors for pie chart
const CHART_COLORS = ['#C7CEEA', '#B8E0D2', '#D4A5A5', '#F4E1D2', '#E9D8FD', '#B5EAD7', '#FFE5D9', '#E0E7FF']

interface Sample {
  id: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type' | 'specialty'
  ico_number?: string
  container_nr?: string
  origin?: string
  exporter_legacy?: string
  supplier?: {
    company: string
  }
  client_id?: string
  quality_spec_id?: string
  laboratory_id?: string
  workflow_stage?: string
  client?: {
    id: string
    company: string
  }
  laboratory?: {
    id: string
    name: string
    code: string
  }
  quality_spec?: {
    id: string
    template_id: string
    custom_parameters?: any
    template?: {
      id: string
      name: string
      name_en?: string
      parameters?: any
    }
  }
}

interface ClientQuality {
  id: string
  custom_name?: string
  template_id: string
}

interface GradingData {
  sample_id: string
  screen_sizes: { [key: string]: number } // Stores grams
  screen_sizes_percentages: { [key: string]: number } // Calculated percentages
  moisture_percentage: number
  quakers_count: number
  defect_counts: { [defectName: string]: number }
  defects_primary: number
  defects_secondary: number
  defects_total: number
  green_aspect?: string
  roast_aspect?: string
}

export default function GradingPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [samples, setSamples] = useState<Sample[]>([])
  const [activeSampleId, setActiveSampleId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Visibility settings using shared utility
  const [visibility, setVisibility] = useState<SampleVisibilitySettings>(() => getVisibilitySettings())

  // Grading data for all samples
  const [gradingDataMap, setGradingDataMap] = useState<Map<string, GradingData>>(new Map())

  // Defect configurations per sample
  const [defectConfigsMap, setDefectConfigsMap] = useState<Map<string, DefectConfig[]>>(new Map())

  // Defect thresholds per sample (for compliance checking)
  const [defectThresholdsMap, setDefectThresholdsMap] = useState<Map<string, DefectThresholds>>(new Map())

  // Screen size constraints per sample
  const [screenConstraintsMap, setScreenConstraintsMap] = useState<Map<string, ScreenSizeConstraint[]>>(new Map())

  // Humidity constraints per sample (min/max)
  const [humidityConstraintsMap, setHumidityConstraintsMap] = useState<Map<string, { min?: number; max?: number }>>(new Map())

  // Green/Roast aspect constraints per sample (either rejectable values or minimum acceptable level)
  const [greenAspectConstraintsMap, setGreenAspectConstraintsMap] = useState<Map<string, string[] | { min_value: number; min_label: string }>>(new Map())
  const [roastAspectConstraintsMap, setRoastAspectConstraintsMap] = useState<Map<string, string[] | { min_value: number; min_label: string }>>(new Map())

  // Client quality per sample (for custom quality names)
  const [clientQualityMap, setClientQualityMap] = useState<Map<string, ClientQuality>>(new Map())

  // Green aspect options per sample (array of objects with label and value)
  const [greenAspectOptionsMap, setGreenAspectOptionsMap] = useState<Map<string, Array<{label: string; value: number}>>>(new Map())

  // Roast aspect options per sample (array of objects with label and value)
  const [roastAspectOptionsMap, setRoastAspectOptionsMap] = useState<Map<string, Array<{label: string; value: number}>>>(new Map())

  useEffect(() => {
    loadSamples()
  }, [])

  const toggleVisibility = (key: keyof SampleVisibilitySettings) => {
    const newValue = !visibility[key]
    const updated = updateVisibilitySetting(key, newValue)
    setVisibility(updated)
  }

  // Separate compliance checking functions for each validation type

  // Defect compliance
  const getDefectCompliance = (sampleId: string): { errors: string[]; violatedTypes: string[] } => {
    const gradingData = gradingDataMap.get(sampleId)
    const defects = defectConfigsMap.get(sampleId)
    const thresholds = defectThresholdsMap.get(sampleId)

    if (!thresholds || Object.keys(thresholds).length === 0 || !defects || !gradingData || defects.length === 0) {
      return { errors: [], violatedTypes: [] }
    }

    const defectValidation = validateDefectCounts(defects, gradingData.defect_counts, thresholds)
    if (!defectValidation.valid) {
      const violatedTypes: string[] = []
      defectValidation.errors.forEach(error => {
        if (error.toLowerCase().includes('primary')) violatedTypes.push('primary')
        if (error.toLowerCase().includes('secondary')) violatedTypes.push('secondary')
        if (error.toLowerCase().includes('total')) violatedTypes.push('total')
      })
      return { errors: defectValidation.errors, violatedTypes }
    }

    return { errors: [], violatedTypes: [] }
  }

  // Screen size compliance
  const getScreenSizeCompliance = (sampleId: string): { errors: string[]; violatedScreens: string[] } => {
    const gradingData = gradingDataMap.get(sampleId)
    const screenConstraints = screenConstraintsMap.get(sampleId)

    if (!screenConstraints || screenConstraints.length === 0 || !gradingData) {
      return { errors: [], violatedScreens: [] }
    }

    const screenValidation = validateScreenSizeDistribution(
      gradingData.screen_sizes_percentages,
      { constraints: screenConstraints }
    )

    if (!screenValidation.is_valid) {
      const violatedScreens = screenValidation.violations.map(v => v.screen_size)
      const errors = screenValidation.violations.map(v => v.message)
      return { errors, violatedScreens }
    }

    return { errors: [], violatedScreens: [] }
  }

  // Humidity compliance
  const getHumidityCompliance = (sampleId: string): { errors: string[]; violated: boolean } => {
    const gradingData = gradingDataMap.get(sampleId)
    const constraints = humidityConstraintsMap.get(sampleId)

    if (!constraints || !gradingData || gradingData.moisture_percentage === 0) {
      return { errors: [], violated: false }
    }

    const errors: string[] = []
    const humidity = gradingData.moisture_percentage

    if (constraints.min !== undefined && humidity < constraints.min) {
      errors.push(`Humidity must be at least ${constraints.min}%, but is ${humidity.toFixed(1)}%`)
    }
    if (constraints.max !== undefined && humidity > constraints.max) {
      errors.push(`Humidity must be at most ${constraints.max}%, but is ${humidity.toFixed(1)}%`)
    }

    return { errors, violated: errors.length > 0 }
  }

  // Green aspect compliance
  const getGreenAspectCompliance = (sampleId: string): { errors: string[]; violated: boolean } => {
    const gradingData = gradingDataMap.get(sampleId)
    const constraint = greenAspectConstraintsMap.get(sampleId)

    if (!constraint || !gradingData || !gradingData.green_aspect) {
      return { errors: [], violated: false }
    }

    // Check if constraint is minimum acceptable level (object with min_value and min_label)
    if (typeof constraint === 'object' && 'min_value' in constraint) {
      const greenOptions = greenAspectOptionsMap.get(sampleId) || []
      const selectedOption = greenOptions.find(opt =>
        typeof opt === 'object' && opt.label === gradingData.green_aspect
      )

      if (selectedOption && typeof selectedOption === 'object' && 'value' in selectedOption) {
        if (selectedOption.value < constraint.min_value) {
          return {
            errors: [`Green aspect must be "${constraint.min_label}" or better`],
            violated: true
          }
        }
      }
    }
    // Check if constraint is rejectable values array
    else if (Array.isArray(constraint)) {
      if (constraint.includes(gradingData.green_aspect)) {
        return { errors: [`Green aspect "${gradingData.green_aspect}" is not acceptable`], violated: true }
      }
    }

    return { errors: [], violated: false }
  }

  // Roast aspect compliance
  const getRoastAspectCompliance = (sampleId: string): { errors: string[]; violated: boolean } => {
    const gradingData = gradingDataMap.get(sampleId)
    const constraint = roastAspectConstraintsMap.get(sampleId)

    if (!constraint || !gradingData || !gradingData.roast_aspect) {
      return { errors: [], violated: false }
    }

    // Check if constraint is minimum acceptable level (object with min_value and min_label)
    if (typeof constraint === 'object' && 'min_value' in constraint) {
      const roastOptions = roastAspectOptionsMap.get(sampleId) || []
      const selectedOption = roastOptions.find(opt =>
        typeof opt === 'object' && opt.label === gradingData.roast_aspect
      )

      if (selectedOption && typeof selectedOption === 'object' && 'value' in selectedOption) {
        if (selectedOption.value < constraint.min_value) {
          return {
            errors: [`Roast aspect must be "${constraint.min_label}" or better`],
            violated: true
          }
        }
      }
    }
    // Check if constraint is rejectable values array
    else if (Array.isArray(constraint)) {
      if (constraint.includes(gradingData.roast_aspect)) {
        return { errors: [`Roast aspect "${gradingData.roast_aspect}" is not acceptable`], violated: true }
      }
    }

    return { errors: [], violated: false }
  }

  // Overall compliance status (for save operation)
  const getComplianceStatus = (sampleId: string): {
    status: 'pass' | 'fail' | 'pending';
    errors: string[];
    color: string;
    label: string;
  } => {
    const defectComp = getDefectCompliance(sampleId)
    const screenComp = getScreenSizeCompliance(sampleId)
    const humidityComp = getHumidityCompliance(sampleId)
    const greenComp = getGreenAspectCompliance(sampleId)
    const roastComp = getRoastAspectCompliance(sampleId)

    const allErrors = [
      ...defectComp.errors,
      ...screenComp.errors,
      ...humidityComp.errors,
      ...greenComp.errors,
      ...roastComp.errors
    ]

    if (allErrors.length === 0) {
      return {
        status: 'pass',
        errors: [],
        color: 'text-green-600 dark:text-green-400',
        label: 'Pass'
      }
    } else {
      return {
        status: 'fail',
        errors: allErrors,
        color: 'text-red-600 dark:text-red-400',
        label: 'Fail'
      }
    }
  }

  // Calculate percentages from gram inputs
  const calculatePercentages = (screenSizesGrams: { [key: string]: number }): { [key: string]: number } => {
    const total = Object.values(screenSizesGrams).reduce((sum, val) => sum + val, 0)
    if (total === 0) return {}

    const percentages: { [key: string]: number } = {}
    Object.entries(screenSizesGrams).forEach(([key, value]) => {
      percentages[key] = Math.round((value / total) * 1000) / 10 // Round to 1 decimal
    })
    return percentages
  }

  const loadSamples = async () => {
    try {
      setLoading(true)
      // Load samples in 'analysis' workflow stage
      const response = await fetch('/api/samples?workflow_stage=analysis&limit=100')
      const data = await response.json()

      if (response.ok && data.samples) {
        // Load full details for each sample
        const sampleIds = data.samples.map((s: Sample) => s.id)

        if (sampleIds.length > 0) {
          const detailsResponse = await fetch('/api/samples/bulk-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sample_ids: sampleIds })
          })

          const detailsData = await detailsResponse.json()

          if (detailsResponse.ok && detailsData.samples) {
            setSamples(detailsData.samples)
            if (detailsData.samples.length > 0) {
              setActiveSampleId(detailsData.samples[0].id)
            }

            // Initialize grading data for each sample
            const newGradingMap = new Map<string, GradingData>()
            const newDefectConfigsMap = new Map<string, DefectConfig[]>()
            const newDefectThresholdsMap = new Map<string, DefectThresholds>()
            const newScreenConstraintsMap = new Map<string, ScreenSizeConstraint[]>()
            const newHumidityConstraintsMap = new Map<string, { min?: number; max?: number }>()
            const newGreenAspectConstraintsMap = new Map<string, string[]>()
            const newRoastAspectConstraintsMap = new Map<string, string[]>()
            const newClientQualityMap = new Map<string, ClientQuality>()
            const newGreenAspectOptionsMap = new Map<string, string[]>()
            const newRoastAspectOptionsMap = new Map<string, string[]>()

            for (const sample of detailsData.samples) {
              console.log(`[LOAD] Processing sample: ${sample.tracking_number} (ID: ${sample.id})`)

              // Initialize grading data with defaults
              const defaultGradingData: GradingData = {
                sample_id: sample.id,
                screen_sizes: {}, // Grams
                screen_sizes_percentages: {}, // Calculated percentages
                moisture_percentage: 0,
                quakers_count: 0,
                defect_counts: {},
                defects_primary: 0,
                defects_secondary: 0,
                defects_total: 0
              }

              // Try to load existing quality assessment data
              try {
                console.log(`[QA LOAD] Fetching quality assessment for sample ${sample.id}`)
                const qaResponse = await fetch(`/api/samples/${sample.id}/quality-assessment`)
                console.log(`[QA LOAD] Response status: ${qaResponse.status}`)
                if (qaResponse.ok) {
                  const qaData = await qaResponse.json()
                  console.log(`[QA LOAD] Loaded assessment:`, qaData)

                  if (qaData.assessment) {
                    const greenBeanData = qaData.assessment.green_bean_data as any
                    const roastData = qaData.assessment.roast_data as any

                    // Populate with existing green bean data
                    if (greenBeanData) {
                      if (greenBeanData.screen_sizes) {
                        defaultGradingData.screen_sizes = greenBeanData.screen_sizes
                        defaultGradingData.screen_sizes_percentages = calculatePercentages(greenBeanData.screen_sizes)
                      }
                      if (greenBeanData.moisture_percentage != null) {
                        defaultGradingData.moisture_percentage = greenBeanData.moisture_percentage
                      }
                      if (greenBeanData.quakers != null) {
                        defaultGradingData.quakers_count = greenBeanData.quakers
                      }
                      if (greenBeanData.green_aspect) {
                        defaultGradingData.green_aspect = greenBeanData.green_aspect
                      }
                      if (greenBeanData.defects) {
                        if (greenBeanData.defects.counts) {
                          defaultGradingData.defect_counts = greenBeanData.defects.counts
                        }
                        if (greenBeanData.defects.primary != null) {
                          defaultGradingData.defects_primary = greenBeanData.defects.primary
                        }
                        if (greenBeanData.defects.secondary != null) {
                          defaultGradingData.defects_secondary = greenBeanData.defects.secondary
                        }
                        if (greenBeanData.defects.total != null) {
                          defaultGradingData.defects_total = greenBeanData.defects.total
                        }
                      }
                    }

                    // Populate with existing roast data
                    if (roastData) {
                      if (roastData.roast_aspect) {
                        defaultGradingData.roast_aspect = roastData.roast_aspect
                      }
                    }
                  }
                }
              } catch (error) {
                console.error(`Error loading quality assessment for sample ${sample.id}:`, error)
              }

              newGradingMap.set(sample.id, defaultGradingData)

              // Load defect configuration and screen constraints for this sample
              await loadSampleConfig(
                sample,
                newDefectConfigsMap,
                newDefectThresholdsMap,
                newScreenConstraintsMap,
                newHumidityConstraintsMap,
                newGreenAspectConstraintsMap,
                newRoastAspectConstraintsMap,
                newGradingMap,
                newClientQualityMap,
                newGreenAspectOptionsMap,
                newRoastAspectOptionsMap
              )
            }

            setClientQualityMap(newClientQualityMap)
            setGradingDataMap(newGradingMap)
            setDefectConfigsMap(newDefectConfigsMap)
            setDefectThresholdsMap(newDefectThresholdsMap)
            setScreenConstraintsMap(newScreenConstraintsMap)
            setHumidityConstraintsMap(newHumidityConstraintsMap)
            setGreenAspectConstraintsMap(newGreenAspectConstraintsMap)
            setRoastAspectConstraintsMap(newRoastAspectConstraintsMap)
            setGreenAspectOptionsMap(newGreenAspectOptionsMap)
            setRoastAspectOptionsMap(newRoastAspectOptionsMap)
          }
        }
      }
    } catch (error) {
      console.error('Error loading samples:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSampleConfig = async (
    sample: Sample,
    defectConfigsMap: Map<string, DefectConfig[]>,
    defectThresholdsMap: Map<string, DefectThresholds>,
    screenConstraintsMap: Map<string, ScreenSizeConstraint[]>,
    humidityConstraintsMap: Map<string, { min?: number; max?: number }>,
    greenAspectConstraintsMap: Map<string, string[]>,
    roastAspectConstraintsMap: Map<string, string[]>,
    gradingDataMap: Map<string, GradingData>,
    clientQualityMap: Map<string, ClientQuality>,
    greenAspectOptionsMap: Map<string, string[]>,
    roastAspectOptionsMap: Map<string, string[]>
  ) => {
    try {
      // Load client quality for custom name and extract template parameters
      let templateParams: any = null
      if (sample.quality_spec_id) {
        const clientQualityResponse = await fetch(`/api/client-qualities/${sample.quality_spec_id}`)
        const clientQualityData = await clientQualityResponse.json()

        if (clientQualityResponse.ok && clientQualityData.client_quality) {
          clientQualityMap.set(sample.id, clientQualityData.client_quality)

          // Extract template parameters from the API response
          templateParams = clientQualityData.client_quality?.template?.parameters

          // Extract and populate green aspect options (using "wordings" array with label and value)
          if (templateParams?.green_aspect_configuration?.wordings && Array.isArray(templateParams.green_aspect_configuration.wordings)) {
            const greenOptions = templateParams.green_aspect_configuration.wordings.map((opt: any) => ({
              label: opt.label || opt.name || opt,
              value: opt.value !== undefined ? opt.value : 0
            }))
            greenAspectOptionsMap.set(sample.id, greenOptions)
          }

          // Extract and populate roast aspect options (using "wordings" array with label and value)
          if (templateParams?.roast_aspect_configuration?.wordings && Array.isArray(templateParams.roast_aspect_configuration.wordings)) {
            const roastOptions = templateParams.roast_aspect_configuration.wordings.map((opt: any) => ({
              label: opt.label || opt.name || opt,
              value: opt.value !== undefined ? opt.value : 0
            }))
            roastAspectOptionsMap.set(sample.id, roastOptions)
          }

          // Extract humidity constraints (moisture requirements)
          const humidityConstraint: { min?: number; max?: number } = {}

          // Try multiple paths for moisture constraints
          if (templateParams?.moisture_requirements) {
            if (templateParams.moisture_requirements.min !== undefined) {
              humidityConstraint.min = templateParams.moisture_requirements.min
            }
            if (templateParams.moisture_requirements.max !== undefined) {
              humidityConstraint.max = templateParams.moisture_requirements.max
            }
          }
          // Direct moisture_min/max at template level
          if (templateParams?.moisture_min !== undefined) {
            humidityConstraint.min = templateParams.moisture_min
          }
          if (templateParams?.moisture_max !== undefined) {
            humidityConstraint.max = templateParams.moisture_max
          }

          if (Object.keys(humidityConstraint).length > 0) {
            console.log(`[CONSTRAINTS] Humidity constraints for ${sample.tracking_number}:`, humidityConstraint)
            humidityConstraintsMap.set(sample.id, humidityConstraint)
          }

          // Extract green aspect constraints
          if (templateParams?.green_aspect_configuration) {
            console.log(`[CONSTRAINTS] Green aspect config for ${sample.tracking_number}:`, templateParams.green_aspect_configuration)

            // Check for minimum acceptable level
            if (templateParams.green_aspect_configuration.minimum_acceptable !== undefined) {
              const minAcceptable = templateParams.green_aspect_configuration.minimum_acceptable
              const greenOptions = greenAspectOptionsMap.get(sample.id) || []
              const minOption = greenOptions.find(opt => opt.value === minAcceptable)

              if (minOption) {
                console.log(`[CONSTRAINTS] Green aspect minimum acceptable:`, minOption)
                greenAspectConstraintsMap.set(sample.id, {
                  min_value: minAcceptable,
                  min_label: minOption.label
                })
              }
            }
            // Check for rejectable values array
            else if (templateParams.green_aspect_configuration.rejectable_values && Array.isArray(templateParams.green_aspect_configuration.rejectable_values)) {
              console.log(`[CONSTRAINTS] Green aspect rejectable values:`, templateParams.green_aspect_configuration.rejectable_values)
              greenAspectConstraintsMap.set(sample.id, templateParams.green_aspect_configuration.rejectable_values)
            } else if (templateParams.green_aspect_configuration.rejectable && Array.isArray(templateParams.green_aspect_configuration.rejectable)) {
              console.log(`[CONSTRAINTS] Green aspect rejectable:`, templateParams.green_aspect_configuration.rejectable)
              greenAspectConstraintsMap.set(sample.id, templateParams.green_aspect_configuration.rejectable)
            }
          }

          // Extract roast aspect constraints
          if (templateParams?.roast_aspect_configuration) {
            console.log(`[CONSTRAINTS] Roast aspect config for ${sample.tracking_number}:`, templateParams.roast_aspect_configuration)

            // Check for minimum acceptable level
            if (templateParams.roast_aspect_configuration.minimum_acceptable !== undefined) {
              const minAcceptable = templateParams.roast_aspect_configuration.minimum_acceptable
              const roastOptions = roastAspectOptionsMap.get(sample.id) || []
              const minOption = roastOptions.find(opt => opt.value === minAcceptable)

              if (minOption) {
                console.log(`[CONSTRAINTS] Roast aspect minimum acceptable:`, minOption)
                roastAspectConstraintsMap.set(sample.id, {
                  min_value: minAcceptable,
                  min_label: minOption.label
                })
              }
            }
            // Check for rejectable values array
            else if (templateParams.roast_aspect_configuration.rejectable_values && Array.isArray(templateParams.roast_aspect_configuration.rejectable_values)) {
              console.log(`[CONSTRAINTS] Roast aspect rejectable values:`, templateParams.roast_aspect_configuration.rejectable_values)
              roastAspectConstraintsMap.set(sample.id, templateParams.roast_aspect_configuration.rejectable_values)
            } else if (templateParams.roast_aspect_configuration.rejectable && Array.isArray(templateParams.roast_aspect_configuration.rejectable)) {
              console.log(`[CONSTRAINTS] Roast aspect rejectable:`, templateParams.roast_aspect_configuration.rejectable)
              roastAspectConstraintsMap.set(sample.id, templateParams.roast_aspect_configuration.rejectable)
            }
          }
        }
      }

      // Fallback: try to get templateParams from sample object if not found in API response
      if (!templateParams) {
        templateParams = sample.quality_spec?.template?.parameters
      }

      // Load defect configuration from quality template first, fallback to client defects
      let defectConfigs: DefectConfig[] = []

      // Try multiple possible locations for defect data
      const customParams = sample.quality_spec?.custom_parameters

      // Path 1: template.parameters.defect_configuration (GRADING DEFECTS)
      if (templateParams?.defect_configuration?.defects && Array.isArray(templateParams.defect_configuration.defects)) {
        defectConfigs = templateParams.defect_configuration.defects.map((defect: any, index: number) => ({
          name: defect.name || defect.name_en,
          weight: defect.weight || defect.point_value || 1,
          category: (defect.category || 'primary') as 'primary' | 'secondary',
          display_order: defect.display_order ?? index,
          description: defect.description || defect.description_en || ''
        }))
      }
      // Path 2: template.parameters.defect_requirements.defects
      else if (templateParams?.defect_requirements?.defects && Array.isArray(templateParams.defect_requirements.defects)) {
        defectConfigs = templateParams.defect_requirements.defects.map((defect: any, index: number) => ({
          name: defect.name || defect.name_en,
          weight: defect.weight || defect.point_value || 1,
          category: (defect.category || 'primary') as 'primary' | 'secondary',
          display_order: defect.display_order ?? index,
          description: defect.description || defect.description_en || ''
        }))
      }
      // Path 3: template.parameters.defects (direct array)
      else if (templateParams?.defects && Array.isArray(templateParams.defects)) {
        defectConfigs = templateParams.defects.map((defect: any, index: number) => ({
          name: defect.name || defect.name_en,
          weight: defect.weight || defect.point_value || 1,
          category: (defect.category || 'primary') as 'primary' | 'secondary',
          display_order: defect.display_order ?? index,
          description: defect.description || defect.description_en || ''
        }))
      }
      // Path 4: custom_parameters.defect_requirements.defects
      else if (customParams?.defect_requirements?.defects && Array.isArray(customParams.defect_requirements.defects)) {
        defectConfigs = customParams.defect_requirements.defects.map((defect: any, index: number) => ({
          name: defect.name || defect.name_en,
          weight: defect.weight || defect.point_value || 1,
          category: (defect.category || 'primary') as 'primary' | 'secondary',
          display_order: defect.display_order ?? index,
          description: defect.description || defect.description_en || ''
        }))
      }
      // Path 5: custom_parameters.defects (direct array)
      else if (customParams?.defects && Array.isArray(customParams.defects)) {
        defectConfigs = customParams.defects.map((defect: any, index: number) => ({
          name: defect.name || defect.name_en,
          weight: defect.weight || defect.point_value || 1,
          category: (defect.category || 'primary') as 'primary' | 'secondary',
          display_order: defect.display_order ?? index,
          description: defect.description || defect.description_en || ''
        }))
      }

      // Fallback to loading from defect definitions API if not in template
      if (defectConfigs.length === 0 && sample.client_id) {
        const defectsResponse = await fetch(
          `/api/defect-definitions?client_id=${sample.client_id}&origin=${sample.origin || ''}&is_active=true`
        )
        if (defectsResponse.ok) {
          const defectsData = await defectsResponse.json()
          if (defectsData.definitions) {
            defectConfigs = defectsData.definitions.map((def: any, index: number) => ({
              name: def.name_en,
              weight: def.point_value,
              category: def.category as 'primary' | 'secondary',
              display_order: index,
              description: def.description_en
            }))
          }
        }
      }

      // Set defect configs if we have any
      if (defectConfigs.length > 0) {
        defectConfigsMap.set(sample.id, defectConfigs)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          // Preserve existing loaded defect counts
          const defectCounts: { [key: string]: number } = { ...gradingData.defect_counts }
          defectConfigs.forEach((defect: DefectConfig) => {
            // Only initialize to 0 if not already loaded from quality assessment
            if (!(defect.name in defectCounts)) {
              defectCounts[defect.name] = 0
            }
          })
          gradingData.defect_counts = defectCounts
        }
      }

      // Load defect thresholds from quality template
      const defectThresholds: DefectThresholds = {}

      // Path 1: template.parameters.defect_requirements (common location)
      if (templateParams?.defect_requirements) {
        if (templateParams.defect_requirements.max_primary !== undefined) {
          defectThresholds.max_primary = templateParams.defect_requirements.max_primary
        }
        if (templateParams.defect_requirements.max_secondary !== undefined) {
          defectThresholds.max_secondary = templateParams.defect_requirements.max_secondary
        }
        if (templateParams.defect_requirements.max_total !== undefined) {
          defectThresholds.max_total = templateParams.defect_requirements.max_total
        }
      }
      // Path 2: template.parameters.defect_configuration.thresholds
      else if (templateParams?.defect_configuration?.thresholds) {
        const thresholds = templateParams.defect_configuration.thresholds
        if (thresholds.max_primary !== undefined) {
          defectThresholds.max_primary = thresholds.max_primary
        }
        if (thresholds.max_secondary !== undefined) {
          defectThresholds.max_secondary = thresholds.max_secondary
        }
        if (thresholds.max_total !== undefined) {
          defectThresholds.max_total = thresholds.max_total
        }
      }
      // Path 3: custom_parameters.defect_requirements
      else if (customParams?.defect_requirements) {
        if (customParams.defect_requirements.max_primary !== undefined) {
          defectThresholds.max_primary = customParams.defect_requirements.max_primary
        }
        if (customParams.defect_requirements.max_secondary !== undefined) {
          defectThresholds.max_secondary = customParams.defect_requirements.max_secondary
        }
        if (customParams.defect_requirements.max_total !== undefined) {
          defectThresholds.max_total = customParams.defect_requirements.max_total
        }
      }

      // Store thresholds for this sample
      if (Object.keys(defectThresholds).length > 0) {
        defectThresholdsMap.set(sample.id, defectThresholds)
      }

      // Load screen size constraints from quality template
      if (sample.quality_spec?.template?.parameters?.screen_size_requirements) {
        const constraints = sample.quality_spec.template.parameters.screen_size_requirements.constraints || []
        screenConstraintsMap.set(sample.id, constraints)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          // Preserve existing loaded screen sizes
          const screenSizes: { [key: string]: number } = { ...gradingData.screen_sizes }
          constraints.forEach((constraint: ScreenSizeConstraint) => {
            // Only initialize to 0 if not already loaded from quality assessment
            if (!(constraint.screen_size in screenSizes)) {
              screenSizes[constraint.screen_size] = 0
            }
          })
          gradingData.screen_sizes = screenSizes
        }
      } else if (sample.sample_type === 'type') {
        // For type samples without template, show all common screen sizes
        const allScreens: ScreenSizeConstraint[] = [
          { screen_size: '20', constraint_type: 'any', display_order: 0 },
          { screen_size: '19', constraint_type: 'any', display_order: 1 },
          { screen_size: '18', constraint_type: 'any', display_order: 2 },
          { screen_size: '17', constraint_type: 'any', display_order: 3 },
          { screen_size: '16', constraint_type: 'any', display_order: 4 },
          { screen_size: '15', constraint_type: 'any', display_order: 5 },
          { screen_size: '14', constraint_type: 'any', display_order: 6 },
          { screen_size: '13', constraint_type: 'any', display_order: 7 },
          { screen_size: '12', constraint_type: 'any', display_order: 8 },
          { screen_size: 'Below 12', constraint_type: 'any', display_order: 9 }
        ]
        screenConstraintsMap.set(sample.id, allScreens)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          // Preserve existing loaded screen sizes
          const screenSizes: { [key: string]: number } = { ...gradingData.screen_sizes }
          allScreens.forEach(screen => {
            // Only initialize to 0 if not already loaded from quality assessment
            if (!(screen.screen_size in screenSizes)) {
              screenSizes[screen.screen_size] = 0
            }
          })
          gradingData.screen_sizes = screenSizes
        }
      }
    } catch (error) {
      console.error('Error loading sample config:', error)
    }
  }

  const getSampleTabLabel = (sample: Sample): string => {
    switch (sample.sample_type) {
      case 'pss':
        return sample.tracking_number
      case 'ss':
        return sample.container_nr || sample.ico_number || sample.tracking_number
      case 'type':
        return sample.tracking_number
      default:
        return sample.tracking_number
    }
  }

  // Format screen size label (e.g., "18" -> "Scr. 18", "Pan" -> "Pan")
  const formatScreenLabel = (screenSize: string): string => {
    const lowerScreen = screenSize.toLowerCase()
    if (lowerScreen.includes('pan') || lowerScreen === 'pan') {
      return 'Pan'
    }
    // Remove any existing "Screen" prefix and format as "Scr. X"
    const cleanSize = screenSize.replace(/^screen\s*/i, '').trim()
    return `Scr. ${cleanSize}`
  }

  const handleDefectCountChange = (sampleId: string, defectName: string, count: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    const defects = defectConfigsMap.get(sampleId)

    if (!gradingData || !defects) return

    gradingData.defect_counts[defectName] = count
    gradingData.defects_primary = calculatePrimaryDefects(defects, gradingData.defect_counts)
    gradingData.defects_secondary = calculateSecondaryDefects(defects, gradingData.defect_counts)
    gradingData.defects_total = calculateTotalDefects(defects, gradingData.defect_counts)

    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleScreenSizeChange = (sampleId: string, screenSize: string, grams: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    if (!gradingData) return

    gradingData.screen_sizes[screenSize] = grams
    gradingData.screen_sizes_percentages = calculatePercentages(gradingData.screen_sizes)
    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleFieldChange = (sampleId: string, field: 'moisture_percentage' | 'quakers_count', value: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    if (!gradingData) return

    gradingData[field] = value
    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleAspectChange = (sampleId: string, field: 'green_aspect' | 'roast_aspect', value: string) => {
    const gradingData = gradingDataMap.get(sampleId)
    if (!gradingData) return

    gradingData[field] = value
    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleSaveCurrent = async () => {
    if (!activeSampleId) return

    try {
      setSaving(true)
      const gradingData = gradingDataMap.get(activeSampleId)

      if (!gradingData) {
        console.error('[SAVE ERROR] No grading data found for active sample')
        return
      }

      // Calculate compliance status
      const compliance = getComplianceStatus(activeSampleId)

      const payload = {
        green_bean_data: {
          screen_sizes: gradingData.screen_sizes,
          moisture_percentage: gradingData.moisture_percentage,
          quakers: gradingData.quakers_count,
          green_aspect: gradingData.green_aspect,
          defects: {
            counts: gradingData.defect_counts,
            primary: gradingData.defects_primary,
            secondary: gradingData.defects_secondary,
            total: gradingData.defects_total
          }
        },
        roast_data: {
          roast_aspect: gradingData.roast_aspect
        },
        compliance_status: compliance.status
      }

      console.log('[SAVE] Saving quality assessment for sample:', activeSampleId)
      console.log('[SAVE] Payload:', JSON.stringify(payload, null, 2))

      const assessmentResponse = await fetch(`/api/samples/${activeSampleId}/quality-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      console.log('[SAVE] Response status:', assessmentResponse.status)

      if (!assessmentResponse.ok) {
        const errorData = await assessmentResponse.json().catch(() => ({}))
        console.error(`[SAVE ERROR] Failed to save assessment for sample ${activeSampleId}`, errorData)
        toast({
          title: 'Failed to save',
          description: errorData.error || 'Unable to save grading data. Please try again.',
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Success',
          description: 'Grading data saved successfully!',
        })
      }
    } catch (error) {
      console.error('Error saving grading data:', error)
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading samples...</div>
        </div>
      </MainLayout>
    )
  }

  if (samples.length === 0) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">No samples ready for grading</h2>
            <p className="text-muted-foreground">
              Samples must be in the analysis stage to appear here.
            </p>
            <Button onClick={() => router.push('/samples')}>
              Back to Samples
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  const activeSample = samples.find(s => s.id === activeSampleId)
  const activeGradingData = gradingDataMap.get(activeSampleId)
  const activeDefects = defectConfigsMap.get(activeSampleId) || []
  const activeScreens = screenConstraintsMap.get(activeSampleId) || []
  const greenAspectOptions = greenAspectOptionsMap.get(activeSampleId) || []
  const roastAspectOptions = roastAspectOptionsMap.get(activeSampleId) || []

  const primaryDefects = getDefectsByCategory(activeDefects, 'primary')
  const secondaryDefects = getDefectsByCategory(activeDefects, 'secondary')

  return (
    <MainLayout>
      <div className="h-full bg-background">
      {/* Tabs with Save Button */}
      <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="w-full">
        <div className="border-b bg-card sticky top-0 z-50">
          <div className="flex items-center justify-between">
            <TabsList className="h-14 bg-transparent border-b-0 rounded-none overflow-x-auto flex-nowrap">
              {samples.map((sample, index) => {
                const isActive = sample.id === activeSampleId
                const gradingData = gradingDataMap.get(sample.id)

                // Check if sample has been graded (has any data entered)
                const hasData = gradingData && (
                  Object.values(gradingData.defect_counts).some(count => count > 0) ||
                  Object.values(gradingData.screen_sizes).some(grams => grams > 0) ||
                  gradingData.moisture_percentage > 0 ||
                  gradingData.green_aspect ||
                  gradingData.roast_aspect
                )

                // Determine background color:
                // - Yellow if active (regardless of pass/fail)
                // - Red if inactive and has data and failed
                // - Green if inactive and has data and passed
                // - No background if no data
                let bgColor = ''
                if (isActive && hasData) {
                  bgColor = 'bg-yellow-500/20'
                } else if (hasData) {
                  const compliance = getComplianceStatus(sample.id)
                  if (compliance.status === 'fail') {
                    bgColor = 'bg-red-500/20'
                  } else if (compliance.status === 'pass') {
                    bgColor = 'bg-green-500/20'
                  }
                }

                return (
                  <div key={sample.id} className={`flex items-center ${bgColor}`}>
                    {/* Separator before tab (except first) */}
                    {index > 0 && <div className="h-8 w-px bg-border/60 mx-1" />}
                    <TabsTrigger
                      value={sample.id}
                      className={`rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors py-3 ${index === 0 ? 'pl-6 pr-4' : 'px-4'}`}
                    >
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-medium text-sm">{getSampleTabLabel(sample)}</span>
                        <span className="text-xs text-muted-foreground capitalize">{sample.sample_type || 'sample'}</span>
                      </div>
                    </TabsTrigger>
                  </div>
                )
              })}
            </TabsList>
            <div className="pr-6">
              <Button onClick={handleSaveCurrent} disabled={saving} size="default">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Current Sample'}
              </Button>
            </div>
          </div>
        </div>

        {samples.map(sample => {
          const gradingData = gradingDataMap.get(sample.id)
          const defects = defectConfigsMap.get(sample.id) || []
          const screens = screenConstraintsMap.get(sample.id) || []
          const primaries = getDefectsByCategory(defects, 'primary')
          const secondaries = getDefectsByCategory(defects, 'secondary')
          const clientQuality = clientQualityMap.get(sample.id)

          return (
            <TabsContent key={sample.id} value={sample.id} className="m-0">
              {/* Sample Info Bar with Visibility Toggles */}
              <div className="border-b bg-card/50 px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 text-sm">
                    {/* Quality */}
                    {visibility.showQuality && (sample.quality_spec?.template || clientQuality) && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs uppercase text-muted-foreground/70">Quality:</span>
                        <span>{clientQuality?.custom_name || sample.quality_spec?.template?.name_en || sample.quality_spec?.template?.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => toggleVisibility('showQuality')}
                        >
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {!visibility.showQuality && (sample.quality_spec?.template || clientQuality) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6"
                        onClick={() => toggleVisibility('showQuality')}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Quality
                      </Button>
                    )}

                    {/* Client/Buyer */}
                    {visibility.showBuyer && sample.client && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs uppercase text-muted-foreground/70">Client:</span>
                        <span>{sample.client.company}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => toggleVisibility('showBuyer')}
                        >
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {!visibility.showBuyer && sample.client && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6"
                        onClick={() => toggleVisibility('showBuyer')}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Client
                      </Button>
                    )}

                    {/* Supplier */}
                    {visibility.showSupplier && sample.supplier && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs uppercase text-muted-foreground/70">Supplier:</span>
                        <span>{sample.supplier.company}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => toggleVisibility('showSupplier')}
                        >
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {!visibility.showSupplier && sample.supplier && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6"
                        onClick={() => toggleVisibility('showSupplier')}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Supplier
                      </Button>
                    )}

                    {/* Exporter */}
                    {visibility.showExporter && sample.exporter_legacy && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs uppercase text-muted-foreground/70">Exporter:</span>
                        <span>{sample.exporter_legacy}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => toggleVisibility('showExporter')}
                        >
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {!visibility.showExporter && sample.exporter_legacy && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6"
                        onClick={() => toggleVisibility('showExporter')}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Exporter
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Grading Content */}
              <div className="p-6">
                {/* Screen Size Distribution + Defects (Horizontal) */}
                <div className="flex gap-6 items-start">
                  {/* Screen Size Distribution - Compact Card */}
                  <Card className="w-fit self-start">
                    <CardContent className="pt-4 pb-4 px-4">
                      <h3 className="text-sm font-semibold mb-3">Screen Size Distribution</h3>
                      <div className="flex gap-2">
                        {/* Screen Size Inputs */}
                        <div className="space-y-2 flex-1">
                          {(() => {
                            const screenComp = getScreenSizeCompliance(sample.id)
                            return screens.map(screen => {
                              const gramsValue = gradingData?.screen_sizes[screen.screen_size] || 0
                              const percentage = gradingData?.screen_sizes_percentages[screen.screen_size] || 0
                              const isViolated = screenComp.violatedScreens.includes(screen.screen_size)

                              return (
                                <div key={screen.screen_size} className="grid grid-cols-[80px_70px_50px] gap-2 items-center">
                                  <Label className="text-sm">{formatScreenLabel(screen.screen_size)}</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={gramsValue}
                                    onChange={(e) => handleScreenSizeChange(sample.id, screen.screen_size, parseFloat(e.target.value) || 0)}
                                    className="h-8 text-sm w-16"
                                    placeholder="grams"
                                  />
                                  <div className={`text-xs ${isViolated ? 'text-red-600 dark:text-red-400 font-bold' : 'text-muted-foreground'}`}>
                                    {percentage > 0 ? `${percentage.toFixed(1)}%` : ''}
                                  </div>
                                </div>
                              )
                            })
                          })()}
                          {/* Total Row */}
                          <div className="grid grid-cols-[80px_70px_50px] gap-2 items-center pt-2 border-t">
                            <Label className="text-sm font-semibold">Total</Label>
                            <div className="text-sm font-semibold">
                              {Object.values(gradingData?.screen_sizes || {}).reduce((sum, val) => sum + val, 0)}g
                            </div>
                            <div className="text-xs text-muted-foreground font-semibold">
                              100%
                            </div>
                          </div>
                        </div>

                        {/* Pie Chart with Labels and Lines */}
                        {gradingData && Object.values(gradingData.screen_sizes_percentages).some(p => p > 0) && (
                          <div className="flex items-center justify-center" style={{ width: '240px', height: '160px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={screens
                                    .filter(screen => (gradingData.screen_sizes_percentages[screen.screen_size] || 0) > 0)
                                    .map((screen, index) => ({
                                      name: formatScreenLabel(screen.screen_size),
                                      value: gradingData.screen_sizes_percentages[screen.screen_size] || 0
                                    }))}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={25}
                                  outerRadius={40}
                                  paddingAngle={2}
                                  dataKey="value"
                                  label={(props: any) => {
                                    const { cx, cy, midAngle, outerRadius, name, value } = props
                                    const RADIAN = Math.PI / 180
                                    const radius = outerRadius + 30
                                    const x = cx + radius * Math.cos(-midAngle * RADIAN)
                                    const y = cy + radius * Math.sin(-midAngle * RADIAN)

                                    return (
                                      <text
                                        x={x}
                                        y={y}
                                        textAnchor={x > cx ? 'start' : 'end'}
                                        dominantBaseline="central"
                                        className="fill-foreground text-xs"
                                      >
                                        <tspan x={x} dy="0">{name}</tspan>
                                        <tspan x={x} dy="1.2em" className="font-semibold">{value.toFixed(0)}%</tspan>
                                      </text>
                                    )
                                  }}
                                  labelLine={{ stroke: 'hsl(var(--border))', strokeWidth: 0.5 }}
                                >
                                  {screens.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>

                      {/* Quakers, Humidity, Green Aspect, Roast Aspect */}
                      {(() => {
                        const hasChart = gradingData && Object.values(gradingData.screen_sizes_percentages).some(p => p > 0)
                        const sampleGreenOptions = greenAspectOptionsMap.get(sample.id) || []
                        const sampleRoastOptions = roastAspectOptionsMap.get(sample.id) || []
                        const hasAspects = sampleGreenOptions.length > 0 || sampleRoastOptions.length > 0

                        return (
                          <div className="mt-4 pt-4 border-t space-y-2">
                            {/* Conditionally show Quakers based on template requirement */}
                            {sample.quality_spec?.template?.parameters?.require_quaker_count === true && (
                              <div className="grid grid-cols-[80px_70px_50px] gap-2 items-center">
                                <Label className="text-sm">Quakers</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={gradingData?.quakers_count || 0}
                                  onChange={(e) => handleFieldChange(sample.id, 'quakers_count', parseInt(e.target.value) || 0)}
                                  className="h-8 text-sm w-20"
                                />
                                <div className="text-xs text-muted-foreground"></div>
                              </div>
                            )}

                            {/* Humidity */}
                            {(() => {
                              const humidityComp = getHumidityCompliance(sample.id)
                              return (
                                <div className="grid grid-cols-[90px_70px_50px] gap-2 items-center">
                                  <Label className={`text-sm whitespace-nowrap ${humidityComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                    Humidity (%)
                                  </Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={gradingData?.moisture_percentage || 0}
                                    onChange={(e) => handleFieldChange(sample.id, 'moisture_percentage', parseFloat(e.target.value) || 0)}
                                    className={`h-8 text-sm w-20 ${humidityComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}
                                  />
                                  <div className="text-xs text-muted-foreground"></div>
                                </div>
                              )
                            })()}

                            {/* Green and Roast Aspects - Conditional Layout */}
                            {hasAspects && (() => {
                              const greenComp = getGreenAspectCompliance(sample.id)
                              const roastComp = getRoastAspectCompliance(sample.id)

                              return (
                                <div className={hasChart ? "flex gap-4" : "space-y-2"}>
                                  {/* Green Aspect */}
                                  {sampleGreenOptions.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                      <Label className={`text-sm ${greenComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                        Green Aspect
                                      </Label>
                                      <Select
                                        value={gradingData?.green_aspect || ''}
                                        onValueChange={(value) => handleAspectChange(sample.id, 'green_aspect', value)}
                                      >
                                        <SelectTrigger className={`w-[180px] h-8 text-sm ${greenComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                          <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {sampleGreenOptions.map((option) => (
                                            <SelectItem key={option.label} value={option.label}>
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}

                                  {/* Roast Aspect */}
                                  {sampleRoastOptions.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                      <Label className={`text-sm ${roastComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                        Roast Aspect
                                      </Label>
                                      <Select
                                        value={gradingData?.roast_aspect || ''}
                                        onValueChange={(value) => handleAspectChange(sample.id, 'roast_aspect', value)}
                                      >
                                        <SelectTrigger className={`w-[180px] h-8 text-sm ${roastComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                          <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {sampleRoastOptions.map((option) => (
                                            <SelectItem key={option.label} value={option.label}>
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )
                      })()}

                      {/* Compliance Violation Messages at Bottom of Card - Only for screen/humidity/aspect */}
                      {(() => {
                        // Check if any data has been entered
                        const hasData = gradingData && (
                          Object.values(gradingData.screen_sizes).some(grams => grams > 0) ||
                          gradingData.moisture_percentage > 0 ||
                          gradingData.green_aspect ||
                          gradingData.roast_aspect
                        )

                        if (!hasData) return null

                        const screenComp = getScreenSizeCompliance(sample.id)
                        const humidityComp = getHumidityCompliance(sample.id)
                        const greenComp = getGreenAspectCompliance(sample.id)
                        const roastComp = getRoastAspectCompliance(sample.id)

                        const allErrors = [
                          ...screenComp.errors,
                          ...humidityComp.errors,
                          ...greenComp.errors,
                          ...roastComp.errors
                        ]

                        if (allErrors.length > 0) {
                          return (
                            <div className="mt-3 pt-3 border-t space-y-1">
                              {allErrors.map((error, index) => (
                                <div key={index} className="text-xs text-red-600 dark:text-red-400 font-medium">
                                  {error}
                                </div>
                              ))}
                            </div>
                          )
                        }
                        return null
                      })()}
                    </CardContent>
                  </Card>

                  {/* Defects */}
                  <Card className="w-fit self-start">
                    <CardContent className="pt-4">
                      {primaries.length === 0 && secondaries.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No defects configured for this sample&apos;s quality template.
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center mb-3 gap-4 text-sm">
                            {(() => {
                              const compliance = getComplianceStatus(sample.id)
                              const primaryColor = compliance.status === 'fail' && compliance.errors.some(e => e.toLowerCase().includes('primary'))
                                ? 'text-red-600 dark:text-red-400'
                                : ''
                              const secondaryColor = compliance.status === 'fail' && compliance.errors.some(e => e.toLowerCase().includes('secondary'))
                                ? 'text-red-600 dark:text-red-400'
                                : ''
                              const totalColor = compliance.status === 'fail' && compliance.errors.some(e => e.toLowerCase().includes('total'))
                                ? 'text-red-600 dark:text-red-400'
                                : ''

                              return (
                                <>
                                  <div>
                                    <span className="text-muted-foreground">Primary: </span>
                                    <span className={`font-semibold ${primaryColor}`}>
                                      {gradingData?.defects_primary.toFixed(2) || '0.00'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Secondary: </span>
                                    <span className={`font-semibold ${secondaryColor}`}>
                                      {gradingData?.defects_secondary.toFixed(2) || '0.00'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Total: </span>
                                    <span className={`font-semibold ${totalColor}`}>
                                      {gradingData?.defects_total.toFixed(2) || '0.00'}
                                    </span>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        <div className="flex gap-6">
                          {/* Primary Defects Section */}
                          {primaries.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Primary</h4>
                              <div className="space-y-1.5">
                                {primaries.map((defect, index) => (
                                  <div key={defect.name} className="grid grid-cols-[140px_64px_auto] gap-1.5 items-center">
                                    <Label className="text-sm">
                                      {defect.name}
                                      <span className="text-[10px] text-muted-foreground ml-1">(x{defect.weight})</span>
                                    </Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={gradingData?.defect_counts[defect.name] || 0}
                                      onChange={(e) => handleDefectCountChange(sample.id, defect.name, parseInt(e.target.value) || 0)}
                                      className="h-8 text-sm"
                                      placeholder="0"
                                    />
                                    <div className="text-xs text-muted-foreground">
                                      = {((gradingData?.defect_counts[defect.name] || 0) * defect.weight).toFixed(2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Vertical Separator */}
                          {primaries.length > 0 && secondaries.length > 0 && (
                            <div className="w-px bg-border" />
                          )}

                          {/* Secondary Defects Section */}
                          {secondaries.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Secondary</h4>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                {secondaries.map((defect, index) => (
                                  <div key={defect.name} className="grid grid-cols-[140px_64px_auto] gap-1.5 items-center">
                                    <Label className="text-sm">
                                      {defect.name}
                                      <span className="text-[10px] text-muted-foreground ml-1">(x{defect.weight})</span>
                                    </Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={gradingData?.defect_counts[defect.name] || 0}
                                      onChange={(e) => handleDefectCountChange(sample.id, defect.name, parseInt(e.target.value) || 0)}
                                      className="h-8 text-sm"
                                      placeholder="0"
                                    />
                                    <div className="text-xs text-muted-foreground">
                                      = {((gradingData?.defect_counts[defect.name] || 0) * defect.weight).toFixed(2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        </div>
                      )}

                      {/* Compliance Violation Messages - Only defect-related warnings */}
                      {(() => {
                        // Check if any defect data has been entered
                        const hasDefectData = gradingData && Object.values(gradingData.defect_counts).some(count => count > 0)

                        if (!hasDefectData) return null

                        const defectComp = getDefectCompliance(sample.id)

                        if (defectComp.errors.length > 0) {
                          return (
                            <div className="mt-3 pt-3 border-t space-y-1">
                              {defectComp.errors.map((error, index) => (
                                <div key={index} className="text-xs text-red-600 dark:text-red-400 font-medium">
                                  {error}
                                </div>
                              ))}
                            </div>
                          )
                        }
                        return null
                      })()}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>
      </div>
    </MainLayout>
  )
}
