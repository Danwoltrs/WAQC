'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Save, Eye, EyeOff, Coffee, Minus, Plus, X, ChevronDown, BarChart3, Camera } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { AttributeWithScale } from '@/types/cupping-templates'
import { AttributeScaleType, validateScoreAgainstRule } from '@/types/attribute-scales'
import {
  SampleVisibilitySettings,
  getVisibilitySettings,
  updateVisibilitySetting
} from '@/lib/sample-visibility'
import { CuppingReports } from '@/components/cupping/cupping-reports'
import { CuppingValidationModal } from '@/components/cupping/cupping-validation-modal'
import { OCRValidationDialog } from '@/components/cupping/ocr-validation-dialog'

// Dynamic import of Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

// Helper function to check if dark mode is active
function isDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

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
  const [activeView, setActiveView] = useState<'cupping' | 'reports'>('cupping')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => isDarkMode() ? 'dark' : 'light')

  // Visibility settings
  const [visibility, setVisibility] = useState<SampleVisibilitySettings>(() => getVisibilitySettings())

  // Validation modal state
  const [validationModalOpen, setValidationModalOpen] = useState(false)
  const [validationSampleId, setValidationSampleId] = useState<string | null>(null)

  // Scan cards dialog state
  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [isProcessingOCR, setIsProcessingOCR] = useState(false)
  const [ocrValidationOpen, setOcrValidationOpen] = useState(false)
  const [extractedCards, setExtractedCards] = useState<any[]>([])
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 })

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(isDarkMode() ? 'dark' : 'light')
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => observer.disconnect()
  }, [])

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

    // Also check rules-level zero tolerance
    const taintFaultConfig = customParams?.taint_fault_configuration || templateParams?.taint_fault_configuration
    const rules = taintFaultConfig?.rules

    console.log(`[DEFECT VALIDATION] Checking tolerance for "${defectName}"`)
    console.log('[DEFECT VALIDATION] Defects list:', defectsList)
    console.log('[DEFECT VALIDATION] Rules:', rules)

    // Check for rules-level zero tolerance (applies to ALL defects)
    if (rules?.zero_tolerance === true) {
      console.log(`[DEFECT VALIDATION] "${defectName}" is ZERO TOLERANCE (rules.zero_tolerance = true)`)
      return 0
    }

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

        // Check for empty taint range (min === max === 0)
        if (defectConfig.taint_range &&
            typeof defectConfig.taint_range === 'object' &&
            defectConfig.taint_range.min === 0 &&
            defectConfig.taint_range.max === 0) {
          console.log(`[DEFECT VALIDATION] "${defectName}" is ZERO TOLERANCE (empty taint_range)`)
          return 0
        }

        // Check for explicit max_cups = 0
        if (defectConfig.max_cups === 0) {
          console.log(`[DEFECT VALIDATION] "${defectName}" is ZERO TOLERANCE (max_cups = 0)`)
          return 0
        }

        // Check for explicit tolerance = 0
        if (defectConfig.tolerance === 0) {
          console.log(`[DEFECT VALIDATION] "${defectName}" is ZERO TOLERANCE (tolerance = 0)`)
          return 0
        }

        // Check for legacy tolerance or max_cups property (non-zero values)
        if (typeof defectConfig.tolerance === 'number' && defectConfig.tolerance > 0) {
          console.log(`[DEFECT VALIDATION] "${defectName}" has tolerance: ${defectConfig.tolerance}`)
          return defectConfig.tolerance
        }
        if (typeof defectConfig.max_cups === 'number' && defectConfig.max_cups > 0) {
          console.log(`[DEFECT VALIDATION] "${defectName}" has max_cups: ${defectConfig.max_cups}`)
          return defectConfig.max_cups
        }
      }
    }

    // Check rules-level max_faults = 0 (zero tolerance for faults)
    if (rules?.max_faults === 0) {
      console.log(`[DEFECT VALIDATION] "${defectName}" treated as ZERO TOLERANCE (rules.max_faults = 0)`)
      return 0
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

  const handleOpenValidationModal = () => {
    if (!activeSampleId) return
    setValidationSampleId(activeSampleId)
    setValidationModalOpen(true)
  }

  const handleFinalizeScores = async () => {
    // TODO: Implement score finalization logic
    // This could involve updating session status, triggering certificate generation, etc.
    toast({
      title: 'Scores Finalized',
      description: 'Cupping scores have been finalized successfully',
    })
  }

  const handleEditCupperScore = (cupperId: string) => {
    // TODO: Implement logic to allow editing a specific cupper's scores
    toast({
      title: 'Edit Cupper Score',
      description: `Opening score editor for cupper: ${cupperId}`,
    })
  }

  const handleScanCards = async (files: FileList) => {
    if (!files || files.length === 0) return

    setIsProcessingOCR(true)
    setProcessingProgress({ current: 0, total: files.length })

    const extractedData: any[] = []
    const errors: string[] = []

    try {
      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProcessingProgress({ current: i + 1, total: files.length })

        try {
          // Create FormData for upload
          const formData = new FormData()
          formData.append('image', file)

          // Call OCR API
          const response = await fetch('/api/cupping/ocr/process-card', {
            method: 'POST',
            body: formData,
          })

          const result = await response.json()

          if (!response.ok) {
            errors.push(`${file.name}: ${result.error || 'Failed to process'}`)
            continue
          }

          // Store extracted data with image preview
          const imagePreview = URL.createObjectURL(file)
          extractedData.push({
            ...result,
            imagePreview,
            fileName: file.name,
          })

        } catch (error: any) {
          console.error(`Error processing ${file.name}:`, error)
          errors.push(`${file.name}: ${error.message || 'Processing failed'}`)
        }
      }

      // Close scan dialog
      setScanDialogOpen(false)
      setIsProcessingOCR(false)
      setProcessingProgress({ current: 0, total: 0 })

      // Show results
      if (extractedData.length > 0) {
        setExtractedCards(extractedData)
        setOcrValidationOpen(true)

        if (errors.length > 0) {
          toast({
            title: 'Partial Success',
            description: `Processed ${extractedData.length} of ${files.length} cards. ${errors.length} failed.`,
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Cards Scanned',
            description: `Successfully processed ${extractedData.length} card${extractedData.length > 1 ? 's' : ''}`,
          })
        }
      } else {
        toast({
          title: 'Scan Failed',
          description: errors.length > 0 ? errors[0] : 'No cards could be processed',
          variant: 'destructive',
        })
      }

    } catch (error: any) {
      console.error('Error during OCR processing:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to process cupping cards',
        variant: 'destructive',
      })
      setScanDialogOpen(false)
      setIsProcessingOCR(false)
      setProcessingProgress({ current: 0, total: 0 })
    }
  }

  const handleOCRSubmit = async (validatedData: any[]) => {
    try {
      const response = await fetch('/api/cupping/scores/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: validatedData }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit scores')
      }

      toast({
        title: 'Success',
        description: result.message || 'Cupping scores submitted successfully',
      })

      // Close validation dialog
      setOcrValidationOpen(false)
      setExtractedCards([])

      // Reload samples to reflect any changes
      loadSamples()

    } catch (error: any) {
      console.error('Error submitting OCR scores:', error)
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit cupping scores',
        variant: 'destructive',
      })
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
        {/* Header with Title and Action Buttons */}
        <div className="border-b bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coffee className="h-6 w-6" />
              <h1 className="text-2xl font-bold">Cupping</h1>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setScanDialogOpen(true)}
                variant="default"
                size="default"
              >
                <Camera className="h-4 w-4 mr-2" />
                Scan Cards
              </Button>
              <Button onClick={handleSaveCurrent} disabled={saving} size="default">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Current Sample'}
              </Button>
              <Button
                onClick={handleOpenValidationModal}
                variant="outline"
                size="default"
              >
                <Eye className="h-4 w-4 mr-2" />
                Validate & Review
              </Button>
            </div>
          </div>
        </div>

        {/* Top-level Navigation: Cupping vs Reports */}
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'cupping' | 'reports')} className="w-full h-full flex flex-col">
          <div className="border-b bg-card">
            <TabsList className="h-12 bg-transparent border-b-0 rounded-none">
              <TabsTrigger value="cupping" className="gap-2">
                <Coffee className="h-4 w-4" />
                Cupping Table
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Reports
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Cupping Tab Content */}
          <TabsContent value="cupping" className="m-0 flex-1">
            {/* Sample Tabs */}
            <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="w-full h-full flex flex-col">
          <div className="border-b bg-card sticky top-0 z-50">
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
                          <div className="w-[420px] flex-shrink-0">
                            {cuppingData && cuppingData.attributes.some(a => a.value !== null) ? (
                              (() => {
                                // Calculate max value across all attributes for consistent chart scale
                                const maxScaleValue = Math.max(
                                  ...attributes.map(({ scale }) =>
                                    scale.type === 'numeric' ? scale.max : Math.max(...scale.options.map(o => o.value))
                                  )
                                )

                                // Generate uniform scale ticks (0, 2, 4, 6, 8, 10...)
                                const tickInterval = 2
                                const numTicks = Math.ceil(maxScaleValue / tickInterval) + 1
                                const tickVals = Array.from({ length: numTicks }, (_, i) => i * tickInterval)

                                // Prepare data for Plotly first (needed for labels)
                                const values = attributes.map(({ attribute }) => {
                                  const attrScore = cuppingData.attributes.find(a => a.attribute === attribute)
                                  return attrScore?.value ?? 0
                                })

                                // Format attribute labels with scores and threshold ranges
                                const formattedLabels = attributes.map(({ attribute, validation_rule }, idx) => {
                                  const score = values[idx]
                                  const scoreDisplay = score > 0 ? ` ${score}` : ''

                                  // Check if attribute is out of spec
                                  const attrData = cuppingData.attributes.find(a => a.attribute === attribute)
                                  const isOutOfSpec = attrData?.value && validation_rule
                                    ? !validateScoreAgainstRule(attrData.value, validation_rule).valid
                                    : false

                                  // Get theme-aware color for labels
                                  const normalColor = theme === 'dark' ? '#ffffff' : '#000000'
                                  const outOfSpecColor = '#ef4444' // Red for out of spec
                                  const labelColor = isOutOfSpec ? outOfSpecColor : normalColor

                                  if (validation_rule && validation_rule.type === 'range' && validation_rule.max_value !== undefined) {
                                    const center = (validation_rule.min_value + validation_rule.max_value) / 2
                                    const tolerance = (validation_rule.max_value - validation_rule.min_value) / 2
                                    // Format with at most 2 decimal places, removing unnecessary zeros
                                    const centerStr = Number(center.toFixed(2)).toString()
                                    const toleranceStr = Number(tolerance.toFixed(2)).toString()
                                    return `<span style="color: ${labelColor}">${attribute}${scoreDisplay}<br><span style="font-size: 9px">(${centerStr} +/- ${toleranceStr})</span></span>`
                                  }
                                  return `<span style="color: ${labelColor}">${attribute}${scoreDisplay}</span>`
                                })

                                // Close the polygon by adding the first value at the end
                                const closedValues = [...values, values[0]]
                                const closedLabels = [...formattedLabels, formattedLabels[0]]

                                // Check if all scores are within spec
                                const allWithinSpec = cuppingData.attributes.every(a => {
                                  const attr = attributes.find(attr => attr.attribute === a.attribute)
                                  if (!a.value || !attr?.validation_rule) return true
                                  return validateScoreAgainstRule(a.value, attr.validation_rule).valid
                                })

                                const lineColor = allWithinSpec ? '#22c55e' : '#ef4444'

                                // Get computed color values for theme-aware rendering
                                const labelColor = theme === 'dark' ? '#ffffff' : '#000000'
                                const tickColor = theme === 'dark' ? '#aaaaaa' : '#666666'

                                return (
                                  // @ts-ignore - Plotly.js types are incomplete
                                  <Plot
                                    key={theme}
                                    data={[
                                      {
                                        type: 'scatterpolar',
                                        r: closedValues,
                                        theta: closedLabels,
                                        fill: 'toself',
                                        fillcolor: allWithinSpec ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                                        line: {
                                          color: lineColor,
                                          width: 2
                                        },
                                        marker: {
                                          color: lineColor,
                                          size: 6
                                        }
                                      }
                                    ]}
                                    layout={{
                                      autosize: true,
                                      height: 380,
                                      polar: {
                                        radialaxis: {
                                          visible: true,
                                          range: [0, maxScaleValue],
                                          tickvals: tickVals,
                                          tickfont: {
                                            size: 10,
                                            color: tickColor
                                          },
                                          gridcolor: 'rgba(128, 128, 128, 0.2)'
                                        },
                                        angularaxis: {
                                          tickfont: {
                                            size: 11,
                                            color: labelColor
                                          }
                                        },
                                        bgcolor: 'transparent'
                                      },
                                      plot_bgcolor: 'transparent',
                                      paper_bgcolor: 'transparent',
                                      font: {
                                        color: labelColor
                                      },
                                      margin: { t: 60, r: 80, b: 60, l: 80 },
                                      showlegend: false
                                    }}
                                    config={{ displayModeBar: false, responsive: true }}
                                    className="w-full"
                                  />
                                )
                              })()
                            ) : (
                              <div className="flex items-center justify-center h-[380px] text-xs text-muted-foreground">
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
                                  <div
                                    key={defect.id}
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
          </TabsContent>

          {/* Reports Tab Content */}
          <TabsContent value="reports" className="m-0 flex-1 overflow-auto">
            <CuppingReports />
          </TabsContent>
        </Tabs>
      </div>

      {/* Validation Modal */}
      <CuppingValidationModal
        open={validationModalOpen}
        onOpenChange={setValidationModalOpen}
        sampleId={validationSampleId}
        sampleTrackingNumber={activeSample?.tracking_number}
        onFinalize={handleFinalizeScores}
        onEditScore={handleEditCupperScore}
      />

      {/* Scan Cards Dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={(open) => {
        if (!isProcessingOCR) {
          setScanDialogOpen(open)
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Cupping Cards</DialogTitle>
            <DialogDescription>
              Upload images of completed cupping cards to extract scores automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isProcessingOCR ? (
              // Processing state
              <div className="space-y-4 py-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">Processing Cards...</p>
                    <p className="text-xs text-muted-foreground">
                      {processingProgress.current} of {processingProgress.total} cards
                    </p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(processingProgress.current / processingProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              // Upload state
              <div className="space-y-3">
                {/* File Upload Input */}
                <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors">
                  <Camera className="h-12 w-12 text-muted-foreground" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">Upload Card Images</p>
                    <p className="text-xs text-muted-foreground">
                      Select multiple images or take photos with your camera
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => {
                      const files = e.target.files
                      if (files && files.length > 0) {
                        handleScanCards(files)
                      }
                    }}
                    className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                  />
                </div>

                <div className="text-xs text-muted-foreground text-center space-y-1">
                  <p>• Ensure good lighting and clear focus</p>
                  <p>• Cards should be flat and fully visible</p>
                  <p>• QR code must be readable</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* OCR Validation Dialog */}
      <OCRValidationDialog
        open={ocrValidationOpen}
        onOpenChange={setOcrValidationOpen}
        extractedCards={extractedCards}
        onSubmit={handleOCRSubmit}
      />
    </MainLayout>
  )
}
