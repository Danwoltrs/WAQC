'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Save, Eye, EyeOff, Coffee, Minus, Plus, X, ChevronDown } from 'lucide-react'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts'
import { useToast } from '@/hooks/use-toast'
import { AttributeWithScale } from '@/types/cupping-templates'
import { AttributeScaleType, validateScoreAgainstRule } from '@/types/attribute-scales'
import {
  SampleVisibilitySettings,
  getVisibilitySettings,
  updateVisibilitySetting
} from '@/lib/sample-visibility'

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: {
    company: string
  }
  exporter_legacy?: string
  origin?: string
  sample_type: 'type' | 'pss' | 'ss' | 'specialty'
  ico_number?: string
  container_nr?: string
  client?: {
    id: string
    company: string
  }
  quality_spec_id?: string
  quality_spec?: {
    id: string
    template_id: string
    cups_per_sample?: number
    custom_parameters?: any
    template?: {
      id: string
      name_en?: string
      parameters?: any
    }
  }
}

interface ClientQuality {
  id: string
  custom_name?: string
  template_id: string
  cups_per_sample?: number
}

interface CuppingAttribute {
  attribute: string
  value: number | null
}

interface CuppingDefect {
  id: string
  name: string
  cups_affected: number
  intensity: number
  is_taint: boolean
}

interface CuppingData {
  sample_id: string
  attributes: CuppingAttribute[]
  defects: CuppingDefect[]
}

export default function CuppingPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [samples, setSamples] = useState<Sample[]>([])
  const [activeSampleId, setActiveSampleId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Visibility settings
  const [visibility, setVisibility] = useState<SampleVisibilitySettings>(() => getVisibilitySettings())

  // Cupping data for all samples
  const [cuppingDataMap, setCuppingDataMap] = useState<Map<string, CuppingData>>(new Map())

  // Template attributes and defects per sample
  const [attributesMap, setAttributesMap] = useState<Map<string, AttributeWithScale[]>>(new Map())
  const [availableDefectsMap, setAvailableDefectsMap] = useState<Map<string, string[]>>(new Map())
  const [cupsPerSampleMap, setCupsPerSampleMap] = useState<Map<string, number>>(new Map())

  // Client quality per sample
  const [clientQualityMap, setClientQualityMap] = useState<Map<string, ClientQuality>>(new Map())

  // Defect modal state
  const [defectModalOpen, setDefectModalOpen] = useState<string | null>(null) // defect name when open
  const [modalCupIntensities, setModalCupIntensities] = useState<number[]>([1]) // array of intensity values, one per cup

  // Defect validation: check cupping defects against quality spec thresholds
  // Check if a specific defect violates its tolerance
  const getDefectTolerance = (sampleId: string, defectName: string): number | null => {
    const sample = samples.find(s => s.id === sampleId)
    if (!sample) return null

    const customParams = sample.quality_spec?.custom_parameters
    const templateParams = sample.quality_spec?.template?.parameters

    // Check for defect-specific tolerances in quality spec
    const defectsList = customParams?.cupping_defects ||
                       customParams?.defects ||
                       customParams?.taint_fault_configuration?.defects ||
                       templateParams?.cupping_defects ||
                       templateParams?.defects ||
                       templateParams?.taint_fault_configuration?.defects

    console.log(`[DEFECT VALIDATION] Checking tolerance for "${defectName}"`)
    console.log('[DEFECT VALIDATION] Defects list:', defectsList)

    if (defectsList && Array.isArray(defectsList)) {
      const defectConfig = defectsList.find((d: any) =>
        (typeof d === 'object' && d.name === defectName)
      )

      console.log(`[DEFECT VALIDATION] Found config for "${defectName}":`, defectConfig)

      if (defectConfig && typeof defectConfig === 'object') {
        // Check if this is a zero-tolerance defect (taint_range === null means "always a fault" = zero tolerance)
        if (defectConfig.taint_range === null) {
          console.log(`[DEFECT VALIDATION] "${defectName}" is ZERO TOLERANCE (taint_range === null)`)
          return 0 // Zero tolerance - no cups allowed
        }

        // Check for legacy tolerance or max_cups property
        if (typeof defectConfig.tolerance === 'number') {
          console.log(`[DEFECT VALIDATION] "${defectName}" has tolerance: ${defectConfig.tolerance}`)
          return defectConfig.tolerance
        }
        if (typeof defectConfig.max_cups === 'number') {
          console.log(`[DEFECT VALIDATION] "${defectName}" has max_cups: ${defectConfig.max_cups}`)
          return defectConfig.max_cups
        }
      }
    }

    console.log(`[DEFECT VALIDATION] No tolerance found for "${defectName}"`)
    return null // No specific tolerance defined
  }

  // Validate individual defect against its tolerance
  const isDefectOutOfSpec = (sampleId: string, defect: CuppingDefect): { outOfSpec: boolean; reason: string } => {
    const tolerance = getDefectTolerance(sampleId, defect.name)

    if (tolerance !== null && defect.cups_affected > tolerance) {
      return {
        outOfSpec: true,
        reason: `${defect.name}: ${defect.cups_affected} cups affected, maximum ${tolerance} allowed (zero tolerance)`
      }
    }

    return { outOfSpec: false, reason: '' }
  }

  const validateCuppingDefects = (sampleId: string): { valid: boolean; errors: string[] } => {
    const cuppingData = cuppingDataMap.get(sampleId)
    const sample = samples.find(s => s.id === sampleId)

    if (!cuppingData || !sample || sample.sample_type === 'type') {
      return { valid: true, errors: [] }
    }

    const errors: string[] = []

    // Check individual defect tolerances
    cuppingData.defects.forEach(defect => {
      const validation = isDefectOutOfSpec(sampleId, defect)
      if (validation.outOfSpec) {
        errors.push(validation.reason)
      }
    })

    // Also check total taint/fault thresholds if configured
    const customParams = sample.quality_spec?.custom_parameters
    const templateParams = sample.quality_spec?.template?.parameters

    const taintFaultConfig = customParams?.taint_fault_configuration ||
                             templateParams?.taint_fault_configuration

    if (taintFaultConfig && (taintFaultConfig.max_taints || taintFaultConfig.max_faults)) {
      const maxTaints = taintFaultConfig.max_taints
      const maxFaults = taintFaultConfig.max_faults

      // Count total taints and faults
      const taintCount = cuppingData.defects.filter(d => d.is_taint).length
      const faultCount = cuppingData.defects.filter(d => !d.is_taint).length

      if (maxTaints && taintCount > maxTaints) {
        errors.push(`Total taints exceed maximum: ${taintCount}/${maxTaints} allowed`)
      }
      if (maxFaults && faultCount > maxFaults) {
        errors.push(`Total faults exceed maximum: ${faultCount}/${maxFaults} allowed`)
      }
    }

    return { valid: errors.length === 0, errors }
  }

  // Get overall compliance status for a sample
  const getCuppingComplianceStatus = (sampleId: string): {
    status: 'pass' | 'fail' | 'pending';
    errors: string[];
  } => {
    const sample = samples.find(s => s.id === sampleId)
    if (!sample || sample.sample_type === 'type') {
      return { status: 'pending', errors: [] }
    }

    const cuppingData = cuppingDataMap.get(sampleId)
    const attributes: AttributeWithScale[] = attributesMap.get(sampleId) || []

    // Check if any data has been entered
    const hasAttributeData = cuppingData && cuppingData.attributes.some(a => a.value !== null)
    const hasDefectData = cuppingData && cuppingData.defects.length > 0

    if (!hasAttributeData && !hasDefectData) {
      return { status: 'pending', errors: [] }
    }

    // Validate attributes against validation rules
    const attributeErrors: string[] = []
    if (cuppingData) {
      cuppingData.attributes.forEach(a => {
        const attr = attributes.find(attr => attr.attribute === a.attribute)
        if (a.value && attr?.validation_rule) {
          const validation = validateScoreAgainstRule(a.value, attr.validation_rule)
          if (!validation.valid) {
            attributeErrors.push(`${a.attribute}: ${validation.error}`)
          }
        }
      })
    }

    // Validate defects
    const defectValidation = validateCuppingDefects(sampleId)

    const allErrors = [...attributeErrors, ...defectValidation.errors]

    if (allErrors.length === 0) {
      return { status: 'pass', errors: [] }
    } else {
      return { status: 'fail', errors: allErrors }
    }
  }

  useEffect(() => {
    loadSamples()
  }, [])

  const toggleVisibility = (key: keyof SampleVisibilitySettings) => {
    const newValue = !visibility[key]
    const updated = updateVisibilitySetting(key, newValue)
    setVisibility(updated)
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

            // Initialize cupping data for each sample
            const newCuppingMap = new Map<string, CuppingData>()
            const newAttributesMap = new Map<string, AttributeWithScale[]>()
            const newAvailableDefectsMap = new Map<string, string[]>()
            const newCupsPerSampleMap = new Map<string, number>()
            const newClientQualityMap = new Map<string, ClientQuality>()

            for (const sample of detailsData.samples) {
              await loadSampleCuppingConfig(
                sample,
                newCuppingMap,
                newAttributesMap,
                newAvailableDefectsMap,
                newCupsPerSampleMap,
                newClientQualityMap
              )
            }

            setCuppingDataMap(newCuppingMap)
            setAttributesMap(newAttributesMap)
            setAvailableDefectsMap(newAvailableDefectsMap)
            setCupsPerSampleMap(newCupsPerSampleMap)
            setClientQualityMap(newClientQualityMap)
          }
        }
      }
    } catch (error) {
      console.error('Error loading samples:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSampleCuppingConfig = async (
    sample: Sample,
    cuppingMap: Map<string, CuppingData>,
    attributesMap: Map<string, AttributeWithScale[]>,
    availableDefectsMap: Map<string, string[]>,
    cupsMap: Map<string, number>,
    clientQualityMap: Map<string, ClientQuality>
  ) => {
    try {
      // Initialize empty cupping data
      const defaultCuppingData: CuppingData = {
        sample_id: sample.id,
        attributes: [],
        defects: []
      }

      // Load cups_per_sample from quality_spec
      const cupsPerSample = sample.quality_spec?.cups_per_sample || 10
      cupsMap.set(sample.id, cupsPerSample)

      // For ALL samples (type, pss, ss), load from quality template
      let attributesSet = false
      let defectsSet = false

      if (sample.quality_spec_id) {
        const clientQualityResponse = await fetch(`/api/client-qualities/${sample.quality_spec_id}`)
        const clientQualityData = await clientQualityResponse.json()

        console.log('Client Quality Data for sample:', sample.tracking_number, clientQualityData)

        if (clientQualityResponse.ok && clientQualityData.client_quality) {
          clientQualityMap.set(sample.id, clientQualityData.client_quality)

          // Extract cupping template parameters
          // Priority: custom_parameters (client-specific) > template.parameters (defaults)
          const customParams = clientQualityData.client_quality?.custom_parameters
          const templateParams = clientQualityData.client_quality?.template?.parameters

          console.log('Custom params:', customParams)
          console.log('Template params:', templateParams)

          // Check cupping attributes (custom first, then template)
          const cuppingAttributes = customParams?.cupping_attributes || templateParams?.cupping_attributes
          console.log('Found cupping_attributes:', cuppingAttributes)

          if (cuppingAttributes && Array.isArray(cuppingAttributes)) {
            const attributes: AttributeWithScale[] = cuppingAttributes
            attributesMap.set(sample.id, attributes)

            // Initialize attribute scores
            defaultCuppingData.attributes = attributes.map(attr => ({
              attribute: attr.attribute,
              value: null
            }))
            attributesSet = true
          }

          // Check cupping defects (multiple possible locations)
          const cuppingDefects = customParams?.defects ||
                                  customParams?.cupping_defects ||
                                  customParams?.taint_fault_configuration?.defects ||
                                  templateParams?.defects ||
                                  templateParams?.cupping_defects ||
                                  templateParams?.taint_fault_configuration?.defects
          console.log('Found defects:', cuppingDefects)

          if (cuppingDefects && Array.isArray(cuppingDefects)) {
            // Extract defect names - handle both string arrays and object arrays
            // Filter out inactive defects (where active === false)
            const defectNames = cuppingDefects
              .filter((d: any) => {
                // If it's a string, include it
                if (typeof d === 'string') return true
                // If it's an object, only include if active is true or undefined
                return d.active !== false
              })
              .map((d: any) =>
                typeof d === 'string' ? d : d.name
              )
            console.log('Filtered defect names:', defectNames)
            availableDefectsMap.set(sample.id, defectNames)
            defectsSet = true
          }
        }
      }

      // Load existing cupping scores from database (if any)
      try {
        const scoresResponse = await fetch(`/api/samples/${sample.id}/cupping-score`)
        const scoresData = await scoresResponse.json()

        if (scoresResponse.ok && scoresData.scores && scoresData.scores.length > 0) {
          // Find the current user's score (there should only be one per cupper)
          const userScore = scoresData.scores[0] // For now, use the first score

          console.log(`[LOAD] Found existing cupping score for sample ${sample.tracking_number}:`, userScore)

          // Populate attributes with saved scores
          if (userScore.scores && defaultCuppingData.attributes.length > 0) {
            defaultCuppingData.attributes = defaultCuppingData.attributes.map(attr => ({
              ...attr,
              value: userScore.scores[attr.attribute] ?? null
            }))
          }

          // Populate defects from saved taints/faults
          if (userScore.defects) {
            const savedDefects: CuppingDefect[] = []

            // Add taints
            if (userScore.defects.taints && Array.isArray(userScore.defects.taints)) {
              userScore.defects.taints.forEach((taint: any) => {
                savedDefects.push({
                  id: `${Date.now()}-${Math.random()}`,
                  name: taint.name,
                  cups_affected: taint.cups_affected || 0,
                  intensity: taint.intensity || 1,
                  is_taint: true
                })
              })
            }

            // Add faults
            if (userScore.defects.faults && Array.isArray(userScore.defects.faults)) {
              userScore.defects.faults.forEach((fault: any) => {
                savedDefects.push({
                  id: `${Date.now()}-${Math.random()}`,
                  name: fault.name,
                  cups_affected: fault.cups_affected || 0,
                  intensity: fault.intensity || 1,
                  is_taint: false
                })
              })
            }

            defaultCuppingData.defects = savedDefects
          }
        }
      } catch (error) {
        console.error('Error loading existing cupping scores:', error)
      }

      // No fallback - all samples must have quality template with cupping configuration
      cuppingMap.set(sample.id, defaultCuppingData)
    } catch (error) {
      console.error('Error loading sample cupping config:', error)
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

  const updateAttribute = (sampleId: string, attribute: string, value: number) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    cuppingData.attributes = cuppingData.attributes.map(attr =>
      attr.attribute === attribute ? { ...attr, value } : attr
    )
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const incrementScore = (sampleId: string, attribute: string, scale: AttributeScaleType) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    const attr = cuppingData.attributes.find(a => a.attribute === attribute)
    if (!attr) return

    const currentValue = attr.value ?? (scale.type === 'numeric' ? scale.min : 0)
    const increment = scale.type === 'numeric' ? scale.increment : 1
    const maxValue = scale.type === 'numeric' ? scale.max : Math.max(...scale.options.map(o => o.value))
    const newValue = Math.min(currentValue + increment, maxValue)

    updateAttribute(sampleId, attribute, newValue)
  }

  const decrementScore = (sampleId: string, attribute: string, scale: AttributeScaleType) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    const attr = cuppingData.attributes.find(a => a.attribute === attribute)
    if (!attr) return

    const currentValue = attr.value ?? (scale.type === 'numeric' ? scale.min : 0)
    const increment = scale.type === 'numeric' ? scale.increment : 1
    const minValue = scale.type === 'numeric' ? scale.min : Math.min(...scale.options.map(o => o.value))
    const newValue = Math.max(currentValue - increment, minValue)

    updateAttribute(sampleId, attribute, newValue)
  }

  const addDefect = (sampleId: string, defectName: string, cups: number = 1, intensity: number = 1) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    const newDefect: CuppingDefect = {
      id: `${sampleId}-${defectName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: defectName,
      cups_affected: cups,
      intensity: intensity,
      is_taint: intensity <= 3
    }

    cuppingData.defects.push(newDefect)
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const handleAddDefectClick = (defectName: string) => {
    setDefectModalOpen(defectName)
    setModalCupIntensities([1])
  }

  const addCupToModal = () => {
    setModalCupIntensities([...modalCupIntensities, 1])
  }

  const removeCupFromModal = (index: number) => {
    if (modalCupIntensities.length > 1) {
      setModalCupIntensities(modalCupIntensities.filter((_, i) => i !== index))
    }
  }

  const updateCupIntensity = (index: number, intensity: number) => {
    const newIntensities = [...modalCupIntensities]
    newIntensities[index] = intensity
    setModalCupIntensities(newIntensities)
  }

  const handleAddDefectConfirm = (sampleId: string) => {
    if (!defectModalOpen) return

    // Check zero tolerance rules
    const sample = samples.find(s => s.id === sampleId)
    if (sample) {
      const customParams = sample.quality_spec?.custom_parameters
      const templateParams = sample.quality_spec?.template?.parameters
      const taintFaultConfig = customParams?.taint_fault_configuration || templateParams?.taint_fault_configuration

      if (taintFaultConfig) {
        const maxTaints = taintFaultConfig.max_taints ?? Infinity
        const maxFaults = taintFaultConfig.max_faults ?? Infinity

        // Count taints and faults in the current additions
        const taintCount = modalCupIntensities.filter(i => i <= 3).length
        const faultCount = modalCupIntensities.filter(i => i > 3).length

        // Zero tolerance check
        if (taintCount > 0 && maxTaints === 0) {
          toast({
            title: 'Zero Tolerance',
            description: 'This quality specification does not allow any taints.',
            variant: 'destructive'
          })
          return
        }

        if (faultCount > 0 && maxFaults === 0) {
          toast({
            title: 'Zero Tolerance',
            description: 'This quality specification does not allow any faults.',
            variant: 'destructive'
          })
          return
        }
      }
    }

    // Add a separate defect entry for each cup with its specific intensity
    modalCupIntensities.forEach((intensity) => {
      addDefect(sampleId, defectModalOpen, 1, intensity)
    })

    // Reset modal state
    setDefectModalOpen(null)
    setModalCupIntensities([1])
  }

  const updateDefect = (sampleId: string, defectId: string, updates: Partial<CuppingDefect>) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    cuppingData.defects = cuppingData.defects.map(d => {
      if (d.id === defectId) {
        const updatedDefect = { ...d, ...updates }
        // Auto-calculate taint/fault based on intensity (threshold = 3)
        if (updates.intensity !== undefined) {
          updatedDefect.is_taint = updates.intensity <= 3
        }
        return updatedDefect
      }
      return d
    })
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const removeDefect = (sampleId: string, defectId: string) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    cuppingData.defects = cuppingData.defects.filter(d => d.id !== defectId)
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const handleSaveCurrent = async () => {
    if (!activeSampleId) return

    try {
      setSaving(true)
      const cuppingData = cuppingDataMap.get(activeSampleId)

      if (!cuppingData) {
        console.error('[SAVE ERROR] No cupping data found for active sample')
        toast({
          title: 'Error',
          description: 'No cupping data to save',
          variant: 'destructive'
        })
        return
      }

      // Call the API to save cupping scores
      const response = await fetch(`/api/samples/${activeSampleId}/cupping-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: cuppingData.attributes,
          defects: {
            taints: cuppingData.defects.filter(d => d.is_taint),
            faults: cuppingData.defects.filter(d => !d.is_taint)
          }
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save cupping score')
      }

      toast({
        title: 'Success',
        description: 'Cupping data saved successfully!',
      })
    } catch (error: any) {
      console.error('Error saving cupping data:', error)
      toast({
        title: 'Error',
        description: error.message || 'An unexpected error occurred. Please try again.',
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
            <Coffee className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No samples ready for cupping</h2>
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
  const activeCuppingData = cuppingDataMap.get(activeSampleId)
  const activeAttributes = attributesMap.get(activeSampleId) || []
  const activeAvailableDefects = availableDefectsMap.get(activeSampleId) || []
  const activeCups = cupsPerSampleMap.get(activeSampleId) || 10

  return (
    <MainLayout>
      <div className="h-full bg-background">
        {/* Tabs with Save Button */}
        <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="w-full">
          <div className="border-b bg-card sticky top-0 z-50">
            <div className="flex items-center justify-between">
              <TabsList className="h-14 bg-transparent border-b-0 rounded-none flex-nowrap justify-start">
                {samples.map((sample, index) => {
                  const isActive = sample.id === activeSampleId
                  const cuppingData = cuppingDataMap.get(sample.id)

                  // Determine background color based on status
                  let bgColor = ''

                  if (isActive) {
                    // Active tabs: yellow for PSS/SS, blue for type samples
                    bgColor = sample.sample_type === 'type' ? 'bg-blue-500/20' : 'bg-yellow-500/20'
                  } else {
                    // Non-active tabs: check if they have data and compliance status
                    const hasData = cuppingData && (
                      cuppingData.attributes.some(a => a.value !== null) ||
                      cuppingData.defects.length > 0
                    )

                    if (hasData && sample.sample_type !== 'type') {
                      const compliance = getCuppingComplianceStatus(sample.id)
                      if (compliance.status === 'fail') {
                        bgColor = 'bg-red-500/20'
                      } else if (compliance.status === 'pass') {
                        bgColor = 'bg-green-500/20'
                      }
                    }
                  }

                  return (
                    <div key={sample.id} className={`flex items-center ${bgColor}`}>
                      {index > 0 && <div className="h-8 w-px bg-border/60 mx-1" />}
                      <TabsTrigger
                        value={sample.id}
                        className={`rounded-none border-transparent data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors py-3 ${index === 0 ? 'pl-6 pr-4' : 'px-4'}`}
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
            const cuppingData = cuppingDataMap.get(sample.id)
            const attributes = attributesMap.get(sample.id) || []
            const availableDefects = availableDefectsMap.get(sample.id) || []
            const cups = cupsPerSampleMap.get(sample.id) || 10
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
                          <span>{clientQuality?.custom_name || sample.quality_spec?.template?.name_en}</span>
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

                      {/* Cups per sample badge */}
                      <Badge variant="secondary" className="text-xs">
                        {cups} cups
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Cupping Content */}
                <div className="p-6">
                  {attributes.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Coffee className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">No cupping template configured</h3>
                        <p className="text-muted-foreground">
                          This sample&apos;s quality specification does not have cupping attributes configured.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-6">
                      {/* Attributes Section - Compact with Spider Chart */}
                      <Card className="p-6 w-fit">
                        <div className="flex gap-8">
                          {/* Attributes List - Two Columns */}
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-2">
                            {attributes.map(({ attribute, scale, validation_rule }) => {
                              const attrScore = cuppingData?.attributes.find(a => a.attribute === attribute)
                              const value = attrScore?.value ?? (scale.type === 'numeric' ? scale.min : null)

                              // Check if value is within validation range
                              const hasValue = value !== null
                              const isWithinSpec = hasValue && validation_rule
                                ? validateScoreAgainstRule(value, validation_rule).valid
                                : true

                              // Format validation range
                              const validationDisplay = validation_rule
                                ? validation_rule.type === 'minimum'
                                  ? `≥${validation_rule.min_value}`
                                  : `${validation_rule.min_value}-${validation_rule.max_value}`
                                : null

                              // Numeric scale with +/- buttons and input
                              if (scale.type === 'numeric') {
                                return (
                                  <div key={attribute} className="flex items-center gap-1.5">
                                    <div className="flex items-baseline gap-1">
                                      <span className={`text-sm font-medium ${hasValue && !isWithinSpec ? 'text-destructive' : ''}`}>
                                        {attribute}
                                      </span>
                                      {validationDisplay && (
                                        <span className="text-[10px] text-muted-foreground">
                                          ({validationDisplay})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => decrementScore(sample.id, attribute, scale)}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <input
                                        type="number"
                                        value={value ?? scale.min}
                                        onChange={(e) => {
                                          const v = parseFloat(e.target.value)
                                          if (!isNaN(v) && v >= scale.min && v <= scale.max) {
                                            updateAttribute(sample.id, attribute, v)
                                          }
                                        }}
                                        step={scale.increment}
                                        min={scale.min}
                                        max={scale.max}
                                        className="w-16 px-2 py-1 text-center border rounded text-sm font-semibold"
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => incrementScore(sample.id, attribute, scale)}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )
                              }

                              // Wording scale with dropdown
                              if (scale.type === 'wording' && scale.options) {
                                const selectedOption = scale.options.find(o => o.value === value)

                                return (
                                  <div key={attribute} className="flex items-center gap-1.5">
                                    <div className="flex items-baseline gap-1">
                                      <span className={`text-sm font-medium ${hasValue && !isWithinSpec ? 'text-destructive' : ''}`}>
                                        {attribute}
                                      </span>
                                      {validationDisplay && (
                                        <span className="text-[10px] text-muted-foreground">
                                          ({validationDisplay})
                                        </span>
                                      )}
                                    </div>
                                    <Select
                                      value={selectedOption?.label}
                                      onValueChange={(label) => {
                                        const option = scale.options.find(o => o.label === label)
                                        if (option) {
                                          updateAttribute(sample.id, attribute, option.value)
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="w-[190px] h-8 text-sm">
                                        <SelectValue placeholder="Select..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {scale.options
                                          .sort((a, b) => a.display_order - b.display_order)
                                          .map((option) => (
                                            <SelectItem key={option.label} value={option.label}>
                                              {option.label} ({option.value})
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )
                              }

                              return null
                            })}
                          </div>

                          {/* Spider Chart Visualization */}
                          <div className="w-[350px] flex-shrink-0">
                            {cuppingData && cuppingData.attributes.some(a => a.value !== null) ? (
                              (() => {
                                // Calculate max value across all attributes for consistent chart scale
                                const maxScaleValue = Math.max(
                                  ...attributes.map(({ scale }) =>
                                    scale.type === 'numeric' ? scale.max : Math.max(...scale.options.map(o => o.value))
                                  )
                                )

                                const chartData = attributes.map(({ attribute, scale, validation_rule }) => {
                                  const attrScore = cuppingData.attributes.find(a => a.attribute === attribute)
                                  const value = attrScore?.value ?? 0
                                  const maxValue = scale.type === 'numeric' ? scale.max : Math.max(...scale.options.map(o => o.value))

                                  // Check if value is within spec for coloring
                                  const hasValue = value !== null && value !== 0
                                  const isWithinSpec = hasValue && validation_rule
                                    ? validateScoreAgainstRule(value, validation_rule).valid
                                    : true

                                  return {
                                    attribute: attribute.length > 15 ? attribute.substring(0, 13) + '...' : attribute,
                                    value: value,
                                    fullMark: maxValue,
                                    fill: hasValue ? (isWithinSpec ? '#22c55e' : '#ef4444') : 'transparent'
                                  }
                                })

                                return (
                                  <ResponsiveContainer width="100%" height={320}>
                                    <RadarChart data={chartData}>
                                      <PolarGrid strokeDasharray="3 3" />
                                      <PolarAngleAxis
                                        dataKey="attribute"
                                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                      />
                                      <PolarRadiusAxis angle={90} domain={[0, maxScaleValue]} />
                                      <Radar
                                        name="Score"
                                        dataKey="value"
                                        stroke={
                                          cuppingData.attributes.every(a => {
                                            const attr = attributes.find(attr => attr.attribute === a.attribute)
                                            if (!a.value || !attr?.validation_rule) return true
                                            return validateScoreAgainstRule(a.value, attr.validation_rule).valid
                                          }) ? '#22c55e' : '#ef4444'
                                        }
                                        fill={
                                          cuppingData.attributes.every(a => {
                                            const attr = attributes.find(attr => attr.attribute === a.attribute)
                                            if (!a.value || !attr?.validation_rule) return true
                                            return validateScoreAgainstRule(a.value, attr.validation_rule).valid
                                          }) ? '#22c55e' : '#ef4444'
                                        }
                                        fillOpacity={0.4}
                                      />
                                    </RadarChart>
                                  </ResponsiveContainer>
                                )
                              })()
                            ) : (
                              <div className="flex items-center justify-center h-[320px] text-xs text-muted-foreground">
                                Start scoring to see chart
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>

                      {/* Defects Section */}
                      <Card className="p-6 w-fit">
                        {/* Add Defect Buttons */}
                        {availableDefects.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {availableDefects.map(defectName => (
                              <Popover
                                key={defectName}
                                open={defectModalOpen === defectName}
                                onOpenChange={(open) => !open && setDefectModalOpen(null)}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddDefectClick(defectName)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    {defectName}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-4" align="start">
                                  <div className="space-y-3">
                                    {/* Defect Name Header */}
                                    <div className="flex items-center justify-between pb-2 border-b">
                                      <span className="text-sm font-medium">{defectName}</span>
                                      <Badge
                                        variant={Math.max(...modalCupIntensities) <= 3 ? 'secondary' : 'destructive'}
                                        className="text-[10px] px-2 py-0.5"
                                      >
                                        {Math.max(...modalCupIntensities) <= 3 ? 'Taint' : 'Fault'}
                                      </Badge>
                                    </div>

                                    {/* Dynamic Cup List */}
                                    <div className="space-y-2">
                                      <Label className="text-xs text-muted-foreground">Affected Cups</Label>
                                      <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {modalCupIntensities.map((intensity, index) => (
                                          <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                            <span className="text-xs font-medium w-12">Cup {index + 1}</span>
                                            <div className="flex items-center gap-1 flex-1">
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-6 w-6 cursor-pointer"
                                                onClick={() => updateCupIntensity(index, Math.max(1, intensity - 1))}
                                              >
                                                <Minus className="h-3 w-3" />
                                              </Button>
                                              <Input
                                                type="number"
                                                value={intensity}
                                                onChange={(e) => {
                                                  const v = parseInt(e.target.value)
                                                  if (!isNaN(v) && v >= 1 && v <= 7) {
                                                    updateCupIntensity(index, v)
                                                  }
                                                }}
                                                className="w-12 h-6 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                min={1}
                                                max={7}
                                              />
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-6 w-6 cursor-pointer"
                                                onClick={() => updateCupIntensity(index, Math.min(7, intensity + 1))}
                                              >
                                                <Plus className="h-3 w-3" />
                                              </Button>
                                              <span className="text-xs text-muted-foreground ml-1">
                                                {intensity <= 3 ? 'Taint' : 'Fault'}
                                              </span>
                                            </div>
                                            {modalCupIntensities.length > 1 && (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => removeCupFromModal(index)}
                                              >
                                                <X className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>

                                      {/* Add Cup Button */}
                                      {modalCupIntensities.length < cups && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={addCupToModal}
                                          className="w-full"
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add Cup
                                        </Button>
                                      )}
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                      <Button
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => handleAddDefectConfirm(sample.id)}
                                      >
                                        Add All
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => {
                                          setDefectModalOpen(null)
                                          setModalCupIntensities([1])
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ))}
                          </div>
                        )}

                        {/* Active Defects List - Horizontal Display */}
                        {cuppingData && cuppingData.defects.length > 0 && (
                          <>
                            <div className="flex flex-wrap gap-2">
                              {cuppingData.defects.map(defect => {
                                // Check if this specific defect violates its tolerance
                                const defectValidation = isDefectOutOfSpec(sample.id, defect)
                                const isOutOfSpec = defectValidation.outOfSpec

                                return (
                                  <div key={defect.id} className="flex flex-col gap-1">
                                    <div
                                      className={`flex items-center gap-2 text-sm px-2 py-1 rounded border ${
                                        isOutOfSpec ? 'border-red-500/50 bg-red-500/10' : 'border-border bg-card'
                                      }`}
                                    >
                                      <Badge
                                        variant={defect.is_taint ? 'secondary' : 'destructive'}
                                        className="text-[10px] px-1.5 py-0 h-5"
                                      >
                                        {defect.is_taint ? 'T' : 'F'}
                                      </Badge>
                                      <span className={`font-medium ${isOutOfSpec ? 'text-red-500' : ''}`}>
                                        {defect.name}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {defect.cups_affected}/{cups} cups · I:{defect.intensity}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 ml-1"
                                        onClick={() => removeDefect(sample.id, defect.id)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    {isOutOfSpec && (
                                      <p className="text-xs text-red-500 pl-2">
                                        {defectValidation.reason}
                                      </p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            {/* Show validation errors below defects if out of spec */}
                            {(() => {
                              const defectValidation = validateCuppingDefects(sample.id)
                              if (!defectValidation.valid && defectValidation.errors.length > 0) {
                                return (
                                  <div className="mt-3 space-y-1">
                                    {defectValidation.errors.map((error, idx) => (
                                      <p key={idx} className="text-xs text-red-500">
                                        {error}
                                      </p>
                                    ))}
                                  </div>
                                )
                              }
                              return null
                            })()}
                          </>
                        )}

                        {cuppingData && cuppingData.defects.length === 0 && availableDefects.length > 0 && (
                          <div className="text-xs text-muted-foreground text-center py-2">
                            Click a defect above to add
                          </div>
                        )}
                      </Card>
                    </div>
                  )}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </MainLayout>
  )
}
