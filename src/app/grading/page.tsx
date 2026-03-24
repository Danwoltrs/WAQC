'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
// Input import removed - using native inputs for consistent cupping-style styling
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
import { Save, Eye, EyeOff, ImageIcon } from 'lucide-react'
import { SampleTabsNavigation, SampleTabItem } from '@/components/samples/sample-tabs-navigation'
import {
  DefectConfig,
  DefectThresholds,
  calculatePrimaryDefects,
  calculateSecondaryDefects,
  calculateTotalDefects,
  getDefectsByCategory,
  validateDefectCounts,
  BRAZIL_SCA_DEFECTS,
  COLOMBIA_STANDARD_DEFECTS,
  GUATEMALA_STANDARD_DEFECTS,
  SCA_STANDARD_DEFECTS,
  PREDEFINED_DEFECT_TEMPLATES
} from '@/types/defect-configuration'
import {
  ScreenSizeConstraint,
  getConstraintDisplayText,
  validateScreenSizeDistribution,
  sortScreenSizes
} from '@/types/screen-size-constraints'
import {
  SampleVisibilitySettings,
  getVisibilitySettings,
  updateVisibilitySetting
} from '@/lib/sample-visibility'
import { useToast } from '@/hooks/use-toast'

// Chart colors from design system
// Chart colors kept for potential future use
// const CHART_COLORS = ['#556b2f', '#a9a454', '#efe4d4', '#b07946', '#445763', '#151618']

// Helper function to check if dark mode is active

interface Sample {
  id: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type' | 'specialty'
  ico_number?: string
  container_nr?: string
  exporter_sample_number?: string
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

interface DefectPhoto {
  path: string
  url: string | null
  filename: string
}

interface GradingData {
  sample_id: string
  screen_sizes: { [key: string]: number } // Stores grams
  screen_sizes_percentages: { [key: string]: number } // Calculated percentages
  moisture_percentage: number
  density?: number // Density in G/L (e.g., 0.700)
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

  // User permission state (for access control)
  const [userProfile, setUserProfile] = useState<{
    id: string
    is_cupper: boolean
    is_q_grader: boolean
    is_master_cupper: boolean
    laboratory_id: string
  } | null>(null)

  // Theme tracking for chart re-rendering

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

  // Mobile view toggle for grading page
  // Mobile view toggle removed - desktop-only layout

  // Green/Roast aspect constraints per sample (either rejectable values or minimum acceptable level)
  const [greenAspectConstraintsMap, setGreenAspectConstraintsMap] = useState<Map<string, string[] | { min_value: number; min_label: string }>>(new Map())
  const [roastAspectConstraintsMap, setRoastAspectConstraintsMap] = useState<Map<string, string[] | { min_value: number; min_label: string }>>(new Map())

  // Client quality per sample (for custom quality names)
  const [clientQualityMap, setClientQualityMap] = useState<Map<string, ClientQuality>>(new Map())

  // Green aspect options per sample (array of objects with label and value)
  const [greenAspectOptionsMap, setGreenAspectOptionsMap] = useState<Map<string, Array<{label: string; value: number}>>>(new Map())

  // Roast aspect options per sample (array of objects with label and value)
  const [roastAspectOptionsMap, setRoastAspectOptionsMap] = useState<Map<string, Array<{label: string; value: number}>>>(new Map())

  // Defect photos per sample
  const [defectPhotosMap, setDefectPhotosMap] = useState<Map<string, DefectPhoto[]>>(new Map())

  // Raw decimal input strings (to allow typing "0." without it being parsed to "0")
  const [rawInputsMap, setRawInputsMap] = useState<Map<string, { density?: string; moisture?: string }>>(new Map())

  // Build sample tab items for the shared navigation component

  useEffect(() => {
    loadSamples()
  }, [])

  // Ctrl+S / Cmd+S keyboard shortcut to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSaveCurrent()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSampleId, gradingDataMap, saving])

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

    if (!constraints || !gradingData) {
      return { errors: [], violated: false }
    }

    if (!gradingData.moisture_percentage) {
      return { errors: ['Humidity data is required but not entered'], violated: true }
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

  // Build sample tab items for the shared navigation component
  const sampleTabItems: SampleTabItem[] = useMemo(() => {
    return samples.map(sample => {
      const gradingData = gradingDataMap.get(sample.id)
      const hasScreenData = gradingData && Object.values(gradingData.screen_sizes).some(g => g > 0)
      const hasDefectData = gradingData && Object.values(gradingData.defect_counts).some(c => c > 0)
      const hasOtherData = gradingData && (gradingData.moisture_percentage > 0 || gradingData.green_aspect || gradingData.roast_aspect)
      const hasAnyData = hasScreenData || hasDefectData || hasOtherData
      const hasBothSections = (hasScreenData || hasOtherData) && hasDefectData

      let status: SampleTabItem['status'] = 'none'
      if (hasAnyData) {
        if (!hasBothSections) {
          status = 'in-progress'
        } else {
          const compliance = getComplianceStatus(sample.id)
          status = compliance.status === 'fail' ? 'fail' : 'pass'
        }
      }

      return {
        id: sample.id,
        label: (() => {
          switch (sample.sample_type) {
            case 'pss': return sample.exporter_sample_number || sample.tracking_number
            case 'ss': return sample.ico_number || sample.container_nr || sample.tracking_number
            case 'type': return sample.tracking_number
            default: return sample.tracking_number
          }
        })(),
        sublabel: sample.sample_type === 'ss' && sample.container_nr
          ? sample.container_nr
          : sample.sample_type || 'sample',
        status,
      }
    })
  }, [samples, gradingDataMap, getComplianceStatus])

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
      // Load samples assigned to the current user through cupping sessions
      // This ensures only cuppers who were assigned to the session can see the samples
      const response = await fetch('/api/cupping/my-samples?include_completed=true')
      const data = await response.json()

      if (response.ok) {
        // Store user profile for permission checks
        if (data.user_profile) {
          setUserProfile(data.user_profile)
        }

        if (data.samples && data.samples.length > 0) {
          // Load full details for each sample
          const sampleIds = data.samples.map((s: Sample) => s.id)

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
            const newGreenAspectConstraintsMap = new Map<string, string[] | { min_value: number; min_label: string }>()
            const newRoastAspectConstraintsMap = new Map<string, string[] | { min_value: number; min_label: string }>()
            const newClientQualityMap = new Map<string, ClientQuality>()
            const newGreenAspectOptionsMap = new Map<string, Array<{label: string; value: number}>>()
            const newRoastAspectOptionsMap = new Map<string, Array<{label: string; value: number}>>()
            const newDefectPhotosMap = new Map<string, DefectPhoto[]>()

            // Load all samples in parallel (fixes N+1 sequential fetch pattern)
            await Promise.all(detailsData.samples.map(async (sample: Sample) => {
              // Initialize grading data with defaults
              const defaultGradingData: GradingData = {
                sample_id: sample.id,
                screen_sizes: {},
                screen_sizes_percentages: {},
                moisture_percentage: 0,
                quakers_count: 0,
                defect_counts: {},
                defects_primary: 0,
                defects_secondary: 0,
                defects_total: 0
              }

              // Load quality assessment and photos in parallel for this sample
              const [qaResult, photosResult] = await Promise.allSettled([
                fetch(`/api/samples/${sample.id}/quality-assessment`).then(r => r.ok ? r.json() : null),
                fetch(`/api/samples/${sample.id}/photos`).then(r => r.ok ? r.json() : null),
              ])

              // Process quality assessment data
              if (qaResult.status === 'fulfilled' && qaResult.value?.assessment) {
                const greenBeanData = qaResult.value.assessment.green_bean_data as any
                const roastData = qaResult.value.assessment.roast_data as any

                if (greenBeanData) {
                  if (greenBeanData.screen_sizes) {
                    defaultGradingData.screen_sizes = greenBeanData.screen_sizes
                    defaultGradingData.screen_sizes_percentages = calculatePercentages(greenBeanData.screen_sizes)
                  }
                  if (greenBeanData.moisture_percentage != null) {
                    defaultGradingData.moisture_percentage = greenBeanData.moisture_percentage
                  }
                  if (greenBeanData.density != null) {
                    defaultGradingData.density = greenBeanData.density
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

                if (roastData?.roast_aspect) {
                  defaultGradingData.roast_aspect = roastData.roast_aspect
                }
              }

              // Process defect photos
              if (photosResult.status === 'fulfilled' && photosResult.value?.photos?.length > 0) {
                newDefectPhotosMap.set(sample.id, photosResult.value.photos)
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
            }))

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
            setDefectPhotosMap(newDefectPhotosMap)
          }
        } else {
          // No samples assigned - this is normal if user isn't assigned to any sessions
          setSamples([])
          console.log('No samples assigned:', data.message)
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
    greenAspectConstraintsMap: Map<string, string[] | { min_value: number; min_label: string }>,
    roastAspectConstraintsMap: Map<string, string[] | { min_value: number; min_label: string }>,
    gradingDataMap: Map<string, GradingData>,
    clientQualityMap: Map<string, ClientQuality>,
    greenAspectOptionsMap: Map<string, Array<{label: string; value: number}>>,
    roastAspectOptionsMap: Map<string, Array<{label: string; value: number}>>
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
            humidityConstraintsMap.set(sample.id, humidityConstraint)
          }

          // Extract green aspect constraints
          if (templateParams?.green_aspect_configuration) {
            // Check for minimum acceptable level (check both validation.min_acceptable_value and minimum_acceptable)
            const minAcceptableValue = templateParams.green_aspect_configuration.validation?.min_acceptable_value
              ?? templateParams.green_aspect_configuration.minimum_acceptable

            if (minAcceptableValue !== undefined) {
              const greenOptions = greenAspectOptionsMap.get(sample.id) || []
              const minOption = greenOptions.find(opt => opt.value === minAcceptableValue)

              if (minOption) {
                greenAspectConstraintsMap.set(sample.id, {
                  min_value: minAcceptableValue,
                  min_label: minOption.label
                })
              }
            }
            // Check for rejectable values array
            else if (templateParams.green_aspect_configuration.rejectable_values && Array.isArray(templateParams.green_aspect_configuration.rejectable_values)) {
              greenAspectConstraintsMap.set(sample.id, templateParams.green_aspect_configuration.rejectable_values)
            } else if (templateParams.green_aspect_configuration.rejectable && Array.isArray(templateParams.green_aspect_configuration.rejectable)) {
              greenAspectConstraintsMap.set(sample.id, templateParams.green_aspect_configuration.rejectable)
            }
          }

          // Extract roast aspect constraints
          if (templateParams?.roast_aspect_configuration) {
            // Check for minimum acceptable level (check both validation.min_acceptable_value and minimum_acceptable)
            const minAcceptableValue = templateParams.roast_aspect_configuration.validation?.min_acceptable_value
              ?? templateParams.roast_aspect_configuration.minimum_acceptable

            if (minAcceptableValue !== undefined) {
              const roastOptions = roastAspectOptionsMap.get(sample.id) || []
              const minOption = roastOptions.find(opt => opt.value === minAcceptableValue)

              if (minOption) {
                roastAspectConstraintsMap.set(sample.id, {
                  min_value: minAcceptableValue,
                  min_label: minOption.label
                })
              }
            }
            // Check for rejectable values array
            else if (templateParams.roast_aspect_configuration.rejectable_values && Array.isArray(templateParams.roast_aspect_configuration.rejectable_values)) {
              roastAspectConstraintsMap.set(sample.id, templateParams.roast_aspect_configuration.rejectable_values)
            } else if (templateParams.roast_aspect_configuration.rejectable && Array.isArray(templateParams.roast_aspect_configuration.rejectable)) {
              roastAspectConstraintsMap.set(sample.id, templateParams.roast_aspect_configuration.rejectable)
            }
          }
        }
      }

      // Fallback: try to get templateParams from sample object if not found in API response
      if (!templateParams) {
        templateParams = sample.quality_spec?.template?.parameters
      }

      // For TYPE SAMPLES: Skip all template-based defect loading
      // Type samples ALWAYS use standard SCA defects based on origin only
      // They are offer samples for evaluation, not subject to approval/rejection
      let defectConfigs: DefectConfig[] = []

      // Extract custom parameters (used for defects and thresholds)
      const customParams = sample.quality_spec?.custom_parameters

      if (sample.sample_type !== 'type') {
        // Only load template defects for non-type samples (PSS, SS, Specialty)
        // Try multiple possible locations for defect data

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
      } // End of non-type sample defect loading

      // Set defect configs if we have any (for non-type samples)
      if (defectConfigs.length > 0) {
        defectConfigsMap.set(sample.id, defectConfigs)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          // Preserve existing loaded defect counts - don't initialize to 0 so inputs show blank
          const defectCounts: { [key: string]: number } = { ...gradingData.defect_counts }
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

      // Load screen size constraints
      // For TYPE SAMPLES: ALWAYS use all standard screens regardless of template
      // Ordered from largest to smallest: 19 → 18 → ... → 12 → Peas 11 → Peas 10 → Peas 9 → Pan
      if (sample.sample_type === 'type') {
        // Type samples show all common screen sizes including peaberries and Pan
        const allScreens: ScreenSizeConstraint[] = [
          { screen_size: '19', constraint_type: 'any', display_order: 0 },
          { screen_size: '18', constraint_type: 'any', display_order: 1 },
          { screen_size: '17', constraint_type: 'any', display_order: 2 },
          { screen_size: '16', constraint_type: 'any', display_order: 3 },
          { screen_size: '15', constraint_type: 'any', display_order: 4 },
          { screen_size: '14', constraint_type: 'any', display_order: 5 },
          { screen_size: '13', constraint_type: 'any', display_order: 6 },
          { screen_size: '12', constraint_type: 'any', display_order: 7 },
          { screen_size: 'Peas 11', constraint_type: 'any', display_order: 8 },
          { screen_size: 'Peas 10', constraint_type: 'any', display_order: 9 },
          { screen_size: 'Peas 9', constraint_type: 'any', display_order: 10 },
          { screen_size: 'Pan', constraint_type: 'any', display_order: 11 }
        ]
        screenConstraintsMap.set(sample.id, allScreens)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          // Preserve existing loaded screen sizes
          const screenSizes: { [key: string]: number } = { ...gradingData.screen_sizes }
          allScreens.forEach(screen => {
            // Ensure the key exists in the map (preserve loaded values, leave new ones absent)
            // Don't initialize to 0 — inputs should start blank
          })
          gradingData.screen_sizes = screenSizes
        }

        // Add standard green and roast aspect options for Type samples (no constraints, just tracking)
        const standardGreenOptions = [
          { label: 'Bluish', value: 1 },
          { label: 'Bluish Green', value: 2 },
          { label: 'Green', value: 3 },
          { label: 'Greenish', value: 4 },
          { label: 'Yellow Green', value: 5 },
          { label: 'Yellowish', value: 6 },
          { label: 'Pale Yellow', value: 7 }
        ]
        greenAspectOptionsMap.set(sample.id, standardGreenOptions)

        const standardRoastOptions = [
          { label: 'Very Light', value: 1 },
          { label: 'Light', value: 2 },
          { label: 'Medium Light', value: 3 },
          { label: 'Medium', value: 4 },
          { label: 'Medium Dark', value: 5 },
          { label: 'Dark', value: 6 },
          { label: 'Very Dark', value: 7 }
        ]
        roastAspectOptionsMap.set(sample.id, standardRoastOptions)
      } else if (sample.quality_spec?.template?.parameters?.screen_size_requirements) {
        // For non-type samples: use template screen size requirements
        // Sort from largest to smallest: 19 → 18 → ... → 12 → Peas 11 → Peas 10 → Peas 9 → Pan
        const constraints = (sample.quality_spec.template.parameters.screen_size_requirements.constraints || []) as ScreenSizeConstraint[]
        const sortedConstraints = sortScreenSizes(constraints)
        screenConstraintsMap.set(sample.id, sortedConstraints)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          // Preserve existing loaded screen sizes
          const screenSizes: { [key: string]: number } = { ...gradingData.screen_sizes }
          sortedConstraints.forEach((constraint: ScreenSizeConstraint) => {
            // Ensure the key exists in the map (preserve loaded values, leave new ones absent)
            // Don't initialize to 0 — inputs should start blank
          })
          gradingData.screen_sizes = screenSizes
        }
      }

      // For ALL type samples, ALWAYS load standard SCA defects based on origin
      // Type samples are offer samples for evaluation - they use standard classification only
      // They do NOT follow any client quality template or approval/rejection criteria
      console.log(`🔍 Checking sample ${sample.tracking_number}: type=${sample.sample_type}, origin=${sample.origin}`)
      if (sample.sample_type === 'type') {
        console.log(`📋 Loading SCA defects for TYPE sample ${sample.tracking_number} with origin ${sample.origin}`)

        // Use hardcoded defect templates (same as template builder)
        // Match by origin first, fall back to generic SCA if no match
        let defectTemplate = null

        if (sample.origin) {
          const originLower = sample.origin.toLowerCase()
          defectTemplate = PREDEFINED_DEFECT_TEMPLATES.find(t =>
            t.origin && t.origin.toLowerCase() === originLower
          )
        }

        // Fall back to generic SCA defects if no origin-specific template found
        if (!defectTemplate) {
          console.log(`No origin-specific defects for ${sample.origin || 'unknown'}, using generic SCA standard`)
          defectTemplate = SCA_STANDARD_DEFECTS
        } else {
          console.log(`Found ${defectTemplate.name} defects for origin ${sample.origin}`)
        }

        // Use defects from the template
        const typeDefectConfigs = defectTemplate.configuration.defects.map(defect => ({
          name: defect.name,
          weight: defect.weight,
          category: defect.category,
          display_order: defect.display_order,
          description: defect.description
        }))

        console.log(`✅ Loaded ${typeDefectConfigs.length} defects from ${defectTemplate.name} template`)
        defectConfigsMap.set(sample.id, typeDefectConfigs)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          const defectCounts: { [key: string]: number } = { ...gradingData.defect_counts }
          gradingData.defect_counts = defectCounts
        }
      }
    } catch (error) {
      console.error('Error loading sample config:', error)
    }
  }


  // Format screen size label (e.g., "18" -> "Scr. 18", "Pan" -> "Pan")
  const formatScreenLabel = (screenSize: string): string => {
    const lowerScreen = screenSize.toLowerCase()
    if (lowerScreen.includes('pan') || lowerScreen === 'pan') {
      return 'Pan'
    }
    // Peaberries (Peas) should not have "Scr." prefix
    if (lowerScreen.includes('peas')) {
      return screenSize
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

  const handleFieldChange = (sampleId: string, field: 'moisture_percentage' | 'density' | 'quakers_count', value: number) => {
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

  const handlePhotosChange = (sampleId: string, photos: DefectPhoto[]) => {
    setDefectPhotosMap(new Map(defectPhotosMap.set(sampleId, photos)))
  }

  const handlePhotoUpload = async (sampleId: string, file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Only JPEG, PNG, and WebP are allowed.', variant: 'destructive' })
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', file, file.name)
      const response = await fetch(`/api/samples/${sampleId}/photos`, { method: 'POST', body: formData })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }
      const data = await response.json()
      const existing = defectPhotosMap.get(sampleId) || []
      handlePhotosChange(sampleId, [...existing, data.photo])
      toast({ title: 'Photo uploaded', description: 'Sample photo has been saved successfully.' })
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message || 'Failed to upload photo.', variant: 'destructive' })
    }
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
          moisture_percentage: gradingData.moisture_percentage || null,
          density: gradingData.density || null,
          quakers: gradingData.quakers_count || null,
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
            <h2 className="text-xl font-semibold">No samples assigned to you</h2>
            <p className="text-muted-foreground max-w-md">
              You don&apos;t have any samples assigned for grading.
              {userProfile?.is_cupper || userProfile?.is_q_grader ? (
                <> Samples must be assigned to you through a cupping session.</>
              ) : (
                <> You need to be designated as a cupper to see grading samples.</>
              )}
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
      {/* Tabs with Sample Navigation */}
      <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="w-full">
        <SampleTabsNavigation
          samples={sampleTabItems}
          activeSampleId={activeSampleId}
          onSampleChange={setActiveSampleId}
        />

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

                    {/* Client (QC Client) */}
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
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.capture = 'environment'
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) handlePhotoUpload(sample.id, file)
                        }
                        input.click()
                      }}
                    >
                      <ImageIcon className="h-5 w-5" />
                      Upload Photo
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveCurrent}
                      disabled={saving}
                    >
                      <Save className="h-5 w-5" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Grading Content */}
              <div className="p-6">
                <div className="flex flex-col lg:flex-row gap-6 items-start">
                  {/* Screen Size Distribution - Clean Table */}
                  <Card className="w-full lg:w-fit self-start">
                    <CardContent className="pt-4 pb-4 px-4">
                      <h3 className="text-sm font-semibold mb-3">Screen Size Distribution</h3>
                      {(() => {
                        const screenComp = getScreenSizeCompliance(sample.id)
                        const totalScreens = screens.length
                        const shouldSplit = totalScreens > 10
                        const midpoint = shouldSplit ? Math.ceil(totalScreens / 2) : totalScreens
                        const firstColumn = screens.slice(0, midpoint)
                        const secondColumn = shouldSplit ? screens.slice(midpoint) : []

                        const renderScreenRow = (screen: ScreenSizeConstraint, rowIndex: number) => {
                          const rawGrams = gradingData?.screen_sizes[screen.screen_size]
                          const gramsValue = rawGrams !== undefined ? rawGrams : ''
                          const percentage = gradingData?.screen_sizes_percentages[screen.screen_size] || 0
                          const isViolated = screenComp.violatedScreens.includes(screen.screen_size)
                          const isEven = rowIndex % 2 === 0

                          return (
                            <tr key={screen.screen_size} className={isEven ? 'bg-muted/30' : ''}>
                              <td className="py-1.5 px-3 text-sm font-medium whitespace-nowrap">{formatScreenLabel(screen.screen_size)}</td>
                              <td className="py-1 px-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={gramsValue}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    handleScreenSizeChange(sample.id, screen.screen_size, val === '' ? 0 : (parseFloat(val) || 0))
                                  }}
                                  className="w-[60px] px-2 py-1 text-center border border-border text-sm font-semibold bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  placeholder="g"
                                />
                              </td>
                              <td className={`py-1.5 px-2 text-xs text-right ${isViolated ? 'text-red-600 dark:text-red-400 font-bold' : 'text-muted-foreground'}`}>
                                {percentage > 0 ? `${percentage.toFixed(1)}%` : ''}
                              </td>
                            </tr>
                          )
                        }

                        return (
                          <div className={`flex ${shouldSplit ? 'gap-4' : ''}`}>
                            <table className="border-collapse">
                              <thead>
                                <tr className="border-b">
                                  <th className="py-1.5 px-3 text-xs font-semibold text-muted-foreground text-left uppercase">Screen</th>
                                  <th className="py-1.5 px-1 text-xs font-semibold text-muted-foreground text-center uppercase">Grams</th>
                                  <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground text-right uppercase">%</th>
                                </tr>
                              </thead>
                              <tbody>
                                {firstColumn.map((screen, i) => renderScreenRow(screen, i))}
                              </tbody>
                              {!shouldSplit && (
                                <tfoot>
                                  <tr className="border-t">
                                    <td className="py-1.5 px-3 text-sm font-semibold">Total</td>
                                    <td className="py-1.5 px-1 text-sm font-semibold text-center">
                                      {Object.values(gradingData?.screen_sizes || {}).reduce((sum, val) => sum + val, 0)}g
                                    </td>
                                    <td className="py-1.5 px-2 text-xs text-muted-foreground font-semibold text-right">100%</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                            {shouldSplit && (
                              <table className="border-collapse">
                                <thead>
                                  <tr className="border-b">
                                    <th className="py-1.5 px-3 text-xs font-semibold text-muted-foreground text-left uppercase">Screen</th>
                                    <th className="py-1.5 px-1 text-xs font-semibold text-muted-foreground text-center uppercase">Grams</th>
                                    <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground text-right uppercase">%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {secondColumn.map((screen, i) => renderScreenRow(screen, i))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t">
                                    <td className="py-1.5 px-3 text-sm font-semibold">Total</td>
                                    <td className="py-1.5 px-1 text-sm font-semibold text-center">
                                      {Object.values(gradingData?.screen_sizes || {}).reduce((sum, val) => sum + val, 0)}g
                                    </td>
                                    <td className="py-1.5 px-2 text-xs text-muted-foreground font-semibold text-right">100%</td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                          </div>
                        )
                      })()}

                      {/* Quakers, Humidity, Density, Aspects */}
                      {(() => {
                        const sampleGreenOptions = greenAspectOptionsMap.get(sample.id) || []
                        const sampleRoastOptions = roastAspectOptionsMap.get(sample.id) || []
                        const hasAspects = sampleGreenOptions.length > 0 || sampleRoastOptions.length > 0
                        const showQuakers = sample.quality_spec?.template?.parameters?.require_quaker_count === true || sample.quality_spec?.template?.parameters?.max_quakers != null || sample.sample_type === 'type'
                        const humidityComp = getHumidityCompliance(sample.id)

                        return (
                          <div className="mt-4 pt-4 border-t space-y-3">
                            <div className="flex flex-wrap gap-5 items-center">
                              {showQuakers && (
                                <div className="flex items-center gap-2">
                                  <Label className="text-sm font-medium whitespace-nowrap">Quakers</Label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={gradingData?.quakers_count || ''}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => handleFieldChange(sample.id, 'quakers_count', parseInt(e.target.value) || 0)}
                                    className="w-[60px] px-2 py-1 text-center border border-border text-sm font-semibold bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Label className={`text-sm font-medium whitespace-nowrap ${humidityComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                  Humidity (%)
                                </Label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={rawInputsMap.get(sample.id)?.moisture ?? (gradingData?.moisture_percentage ? String(gradingData.moisture_percentage) : '')}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                      const newRaw = new Map(rawInputsMap)
                                      newRaw.set(sample.id, { ...newRaw.get(sample.id), moisture: val })
                                      setRawInputsMap(newRaw)
                                      if (!val.endsWith('.') && val !== '') {
                                        const num = parseFloat(val)
                                        if (!isNaN(num) && num >= 0 && num <= 100) {
                                          handleFieldChange(sample.id, 'moisture_percentage', num)
                                        }
                                      } else if (val === '') {
                                        handleFieldChange(sample.id, 'moisture_percentage', 0)
                                      }
                                    }
                                  }}
                                  onBlur={() => {
                                    const newRaw = new Map(rawInputsMap)
                                    const current = newRaw.get(sample.id)
                                    if (current) {
                                      delete current.moisture
                                      if (!current.density) newRaw.delete(sample.id)
                                      else newRaw.set(sample.id, current)
                                      setRawInputsMap(newRaw)
                                    }
                                  }}
                                  className={`w-[60px] px-2 py-1 text-center border border-border text-sm font-semibold bg-background ${humidityComp.violated ? 'border-red-500 text-red-600 dark:text-red-400' : ''}`}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium whitespace-nowrap">Density (G/L)</Label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={rawInputsMap.get(sample.id)?.density ?? (gradingData?.density ? String(gradingData.density) : '')}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                      const newRaw = new Map(rawInputsMap)
                                      newRaw.set(sample.id, { ...newRaw.get(sample.id), density: val })
                                      setRawInputsMap(newRaw)
                                      if (!val.endsWith('.') && val !== '') {
                                        const num = parseFloat(val)
                                        if (!isNaN(num) && num >= 0) {
                                          handleFieldChange(sample.id, 'density', num)
                                        }
                                      } else if (val === '') {
                                        handleFieldChange(sample.id, 'density', 0)
                                      }
                                    }
                                  }}
                                  onBlur={() => {
                                    const newRaw = new Map(rawInputsMap)
                                    const current = newRaw.get(sample.id)
                                    if (current) {
                                      delete current.density
                                      if (!current.moisture) newRaw.delete(sample.id)
                                      else newRaw.set(sample.id, current)
                                      setRawInputsMap(newRaw)
                                    }
                                  }}
                                  placeholder="0.700"
                                  className="w-[68px] px-2 py-1 text-center border border-border text-sm font-semibold bg-background"
                                />
                              </div>
                            </div>
                            {hasAspects && (() => {
                              const greenComp = getGreenAspectCompliance(sample.id)
                              const roastComp = getRoastAspectCompliance(sample.id)
                              return (
                                <div className="flex gap-4">
                                  {sampleGreenOptions.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                      <Label className={`text-sm ${greenComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>Green Aspect</Label>
                                      <Select value={gradingData?.green_aspect || ''} onValueChange={(value) => handleAspectChange(sample.id, 'green_aspect', value)}>
                                        <SelectTrigger className={`w-[180px] h-8 text-sm ${greenComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                          <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {sampleGreenOptions.map((option) => (
                                            <SelectItem key={option.label} value={option.label}>{option.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  {sampleRoastOptions.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                      <Label className={`text-sm ${roastComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>Roast Aspect</Label>
                                      <Select value={gradingData?.roast_aspect || ''} onValueChange={(value) => handleAspectChange(sample.id, 'roast_aspect', value)}>
                                        <SelectTrigger className={`w-[180px] h-8 text-sm ${roastComp.violated ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                          <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {sampleRoastOptions.map((option) => (
                                            <SelectItem key={option.label} value={option.label}>{option.label}</SelectItem>
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

                      {/* Screen/Humidity/Aspect Compliance Errors */}
                      {(() => {
                        const hasData = gradingData && (
                          Object.values(gradingData.screen_sizes).some(grams => grams > 0) ||
                          gradingData.moisture_percentage > 0 ||
                          gradingData.green_aspect ||
                          gradingData.roast_aspect
                        )
                        if (!hasData) return null
                        const allErrors = [
                          ...getScreenSizeCompliance(sample.id).errors,
                          ...getHumidityCompliance(sample.id).errors,
                          ...getGreenAspectCompliance(sample.id).errors,
                          ...getRoastAspectCompliance(sample.id).errors
                        ]
                        if (allErrors.length === 0) return null
                        return (
                          <div className="mt-3 pt-3 border-t space-y-1">
                            {allErrors.map((error, index) => (
                              <div key={index} className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</div>
                            ))}
                          </div>
                        )
                      })()}
                    </CardContent>
                  </Card>

                  {/* Defects - Clean Table */}
                  <Card className="flex-1 self-start">
                    <CardContent className="pt-4 pb-4 px-4">
                      {primaries.length === 0 && secondaries.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No defects configured for this sample&apos;s quality template.
                        </div>
                      ) : (
                        <>
                          {/* Defect Totals Header */}
                          <div className="flex items-center mb-3 gap-4 text-sm">
                            {(() => {
                              const compliance = getComplianceStatus(sample.id)
                              const primaryColor = compliance.status === 'fail' && compliance.errors.some(e => e.toLowerCase().includes('primary'))
                                ? 'text-red-600 dark:text-red-400' : ''
                              const secondaryColor = compliance.status === 'fail' && compliance.errors.some(e => e.toLowerCase().includes('secondary'))
                                ? 'text-red-600 dark:text-red-400' : ''
                              const totalColor = compliance.status === 'fail' && compliance.errors.some(e => e.toLowerCase().includes('total'))
                                ? 'text-red-600 dark:text-red-400' : ''
                              return (
                                <>
                                  <div>
                                    <span className="text-muted-foreground">Primary: </span>
                                    <span className={`font-semibold ${primaryColor}`}>{gradingData?.defects_primary.toFixed(2) || '0.00'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Secondary: </span>
                                    <span className={`font-semibold ${secondaryColor}`}>{gradingData?.defects_secondary.toFixed(2) || '0.00'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Total: </span>
                                    <span className={`font-semibold ${totalColor}`}>{gradingData?.defects_total.toFixed(2) || '0.00'}</span>
                                  </div>
                                </>
                              )
                            })()}
                          </div>

                          {/* Side-by-side Primary + Secondary Tables */}
                          <div className="flex gap-6">
                            {primaries.length > 0 && (
                              <table className="border-collapse">
                                <thead>
                                  <tr className="border-b">
                                    <th className="py-1.5 px-3 text-xs font-semibold text-muted-foreground text-left uppercase" colSpan={2}>Primary</th>
                                    <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground text-center uppercase">QTY</th>
                                    <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground text-right uppercase">DEF</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {primaries.map((defect, index) => (
                                    <tr key={defect.name} className={index % 2 === 0 ? 'bg-muted/30' : ''}>
                                      <td className="py-1.5 px-3 text-sm max-w-[200px]">{defect.name}</td>
                                      <td className="py-1.5 px-1 text-[10px] text-muted-foreground whitespace-nowrap">(x{defect.weight})</td>
                                      <td className="py-1 px-2">
                                        <input
                                          type="number"
                                          min="0"
                                          value={gradingData?.defect_counts[defect.name] ?? ''}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => handleDefectCountChange(sample.id, defect.name, parseInt(e.target.value) || 0)}
                                          className="w-[56px] px-2 py-1 text-center border border-border text-sm font-semibold bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          placeholder="0"
                                        />
                                      </td>
                                      <td className="py-1.5 px-2 text-xs text-muted-foreground text-right whitespace-nowrap">
                                        = {((gradingData?.defect_counts[defect.name] || 0) * defect.weight).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                            {secondaries.length > 0 && (
                              <table className="border-collapse">
                                <thead>
                                  <tr className="border-b">
                                    <th className="py-1.5 px-3 text-xs font-semibold text-muted-foreground text-left uppercase" colSpan={2}>Secondary</th>
                                    <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground text-center uppercase">QTY</th>
                                    <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground text-right uppercase">DEF</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {secondaries.map((defect, index) => (
                                    <tr key={defect.name} className={index % 2 === 0 ? 'bg-muted/30' : ''}>
                                      <td className="py-1.5 px-3 text-sm max-w-[220px]">{defect.name}</td>
                                      <td className="py-1.5 px-1 text-[10px] text-muted-foreground whitespace-nowrap">(x{defect.weight})</td>
                                      <td className="py-1 px-2">
                                        <input
                                          type="number"
                                          min="0"
                                          value={gradingData?.defect_counts[defect.name] ?? ''}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => handleDefectCountChange(sample.id, defect.name, parseInt(e.target.value) || 0)}
                                          className="w-[56px] px-2 py-1 text-center border border-border text-sm font-semibold bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          placeholder="0"
                                        />
                                      </td>
                                      <td className="py-1.5 px-2 text-xs text-muted-foreground text-right whitespace-nowrap">
                                        = {((gradingData?.defect_counts[defect.name] || 0) * defect.weight).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </>
                      )}

                      {/* Defect Compliance Errors */}
                      {(() => {
                        const hasDefectData = gradingData && Object.values(gradingData.defect_counts).some(count => count > 0)
                        if (!hasDefectData) return null
                        const defectComp = getDefectCompliance(sample.id)
                        if (defectComp.errors.length === 0) return null
                        return (
                          <div className="mt-3 pt-3 border-t space-y-1">
                            {defectComp.errors.map((error, index) => (
                              <div key={index} className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</div>
                            ))}
                          </div>
                        )
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
