'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Plus, X, Save, ChevronDown, ChevronRight } from 'lucide-react'
import {
  ScreenSizeConstraint,
  ScreenSizeRequirements,
  ConstraintType,
  STANDARD_SCREEN_SIZES,
  getConstraintDisplayText
} from '@/types/screen-size-constraints'
import {
  CuppingAttribute,
  AttributeScaleType,
  createNumericScale,
  formatValidationRule
} from '@/types/attribute-scales'
import {
  DefectConfiguration,
  createEmptyDefectConfiguration,
  BRAZIL_SCA_DEFECTS
} from '@/types/defect-configuration'
import { DefectConfigManager } from './defect-config-manager'
import {
  TaintFaultConfiguration,
  createEmptyTaintFaultConfiguration,
  BRAZIL_TRADITIONAL_TAINTS_FAULTS
} from '@/types/taint-fault-configuration'
import { TaintFaultConfigManager } from './taint-fault-config-manager'
import { CuppingAttributeConfigManager, AttributeWithScale } from './cupping-attribute-config-manager'
import { CUPPING_ATTRIBUTE_TEMPLATES } from '@/types/cupping-templates'
import {
  AspectConfiguration,
  createEmptyAspectConfiguration,
  GREEN_ASPECT_TEMPLATES,
  ROAST_ASPECT_TEMPLATES
} from '@/types/aspect-configuration'
import { AspectConfigManager } from './aspect-config-manager'
import {
  MicroRegionConfiguration,
  createEmptyMicroRegionConfiguration,
  POPULAR_COFFEE_ORIGINS
} from '@/types/micro-region-configuration'
import { MicroRegionConfigManager } from './micro-region-config-manager'

// AttributeScale is now imported from @/types/attribute-scales as CuppingAttribute

interface TemplateParameters {
  sample_size_grams?: number // For proportional scaling
  screen_sizes?: {
    sizes?: { [key: string]: number } // Legacy format - kept for backward compatibility
  }
  screen_size_requirements?: ScreenSizeRequirements // New constraint-based format
  green_aspect_configuration?: AspectConfiguration // Green bean visual appearance
  defect_configuration?: DefectConfiguration // New flexible defect format
  moisture_min?: number
  moisture_max?: number
  moisture_standard?: 'coffee_industry' | 'iso_6673'
  roast_aspect_configuration?: AspectConfiguration // Roasted bean visual appearance
  roast_sample_size_grams?: number // Sample size for roast analysis (may differ from green sample size)
  max_quakers?: number // Maximum quakers allowed per sample
  quaker_notes?: string // Notes about quaker expectations
  cupping?: {
    // Legacy format - deprecated, kept for backward compatibility
    scale_type?: '1-5' | '1-7' | '1-10'
    min_score?: number
    attributes?: any[] // Old attribute format
  }
  cupping_attributes?: CuppingAttribute[] // New flexible attribute format
  taint_fault_configuration?: TaintFaultConfiguration // New flexible taint/fault format
  micro_region_configuration?: MicroRegionConfiguration // Micro-region requirements per origin
}

interface Template {
  id?: string
  name_en?: string
  name_pt?: string
  name_es?: string
  description_en?: string
  description_pt?: string
  description_es?: string
  // Legacy fields for backward compatibility
  name?: string
  description?: string
  version?: number
  parameters: TemplateParameters
  is_active?: boolean
  is_global?: boolean
  laboratory_id?: string | null
  assigned_laboratories?: string[] // Multi-lab assignment
  created_by?: string
  created_at?: string
  updated_at?: string
}

interface TemplateBuilderProps {
  template?: Template
  onSave: (template: Template) => Promise<void>
  onCancel: () => void
}

// Get Brazil Wording template as default (7-level wording for most attributes, 10-level for Flavor)
const BRAZIL_WORDING_TEMPLATE = CUPPING_ATTRIBUTE_TEMPLATES.find(t => t.id === 'brazil-wording')

const DEFAULT_CUPPING_ATTRIBUTES: CuppingAttribute[] = BRAZIL_WORDING_TEMPLATE
  ? BRAZIL_WORDING_TEMPLATE.attributes.map(attr => ({
      attribute: attr.attribute,
      scale: attr.scale,
      is_required: true
    }))
  : [
      // Fallback to SCA numeric if Brazil Wording template not found
      { attribute: 'Fragrance/Aroma', scale: createNumericScale(1, 10, 0.25), is_required: true },
      { attribute: 'Flavor', scale: createNumericScale(1, 10, 0.25), is_required: true },
      { attribute: 'Aftertaste', scale: createNumericScale(1, 10, 0.25), is_required: true },
      { attribute: 'Acidity', scale: createNumericScale(1, 10, 0.25), is_required: true },
      { attribute: 'Body', scale: createNumericScale(1, 10, 0.25), is_required: true },
      { attribute: 'Balance', scale: createNumericScale(1, 10, 0.25), is_required: true },
      { attribute: 'Overall', scale: createNumericScale(1, 10, 0.25), is_required: true }
    ]

// Removed SCREEN_SIZES - now using STANDARD_SCREEN_SIZES from types

export function TemplateBuilder({ template, onSave, onCancel }: TemplateBuilderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Basic info
  const [name, setName] = useState((template as any)?.name_en || template?.name || '')
  const [description, setDescription] = useState((template as any)?.description_en || template?.description || '')
  const [isActive, setIsActive] = useState(template?.is_active !== false)
  const [origin, setOrigin] = useState<string>((template?.parameters as any)?.origin || '')
  const [microOrigin, setMicroOrigin] = useState<string>((template?.parameters as any)?.micro_origin || '')
  const [availableMicroOrigins, setAvailableMicroOrigins] = useState<Array<{ id: string; name: string }>>([])

  // Collapsible section states
  const [screenSizeExpanded, setScreenSizeExpanded] = useState(false)
  const [greenAspectExpanded, setGreenAspectExpanded] = useState(false)
  const [roastAspectExpanded, setRoastAspectExpanded] = useState(false)
  const [defectExpanded, setDefectExpanded] = useState(false)
  const [defectWeightExpanded, setDefectWeightExpanded] = useState(false)
  const [moistureExpanded, setMoistureExpanded] = useState(false)
  const [quakerExpanded, setQuakerExpanded] = useState(false)
  const [cuppingExpanded, setCuppingExpanded] = useState(false)
  const [taintFaultExpanded, setTaintFaultExpanded] = useState(false)
  const [taintFaultListExpanded, setTaintFaultListExpanded] = useState(false)

  // Info section states
  const [showScreenSizeInfo, setShowScreenSizeInfo] = useState(false)
  const [showGreenAspectInfo, setShowGreenAspectInfo] = useState(false)
  const [showRoastAspectInfo, setShowRoastAspectInfo] = useState(false)
  const [showDefectInfo, setShowDefectInfo] = useState(false)
  const [showQuakerInfo, setShowQuakerInfo] = useState(false)
  const [showCuppingInfo, setShowCuppingInfo] = useState(false)
  const [showTaintFaultInfo, setShowTaintFaultInfo] = useState(false)
  const [showMicroRegionInfo, setShowMicroRegionInfo] = useState(false)

  // Template sharing controls
  const [isGlobal, setIsGlobal] = useState(template?.is_global || false)
  const [userLaboratoryId, setUserLaboratoryId] = useState<string | null>(null)
  const [userLabName, setUserLabName] = useState<string>('')
  const [userQcRole, setUserQcRole] = useState<string>('')
  const [assignedLaboratories, setAssignedLaboratories] = useState<string[]>(
    template?.assigned_laboratories ||
    (template?.laboratory_id ? [template.laboratory_id] : []) // Migrate legacy laboratory_id
  )
  const [allLaboratories, setAllLaboratories] = useState<Array<{ id: string; name: string }>>([])

  // Fetch user's laboratory info and all laboratories on mount
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch user profile
        const response = await fetch('/api/profile')
        if (response.ok) {
          const { profile } = await response.json()
          setUserLaboratoryId(profile.laboratory_id)
          setUserQcRole(profile.qc_role)

          // Fetch lab name if user has a lab
          if (profile.laboratory_id) {
            const labResponse = await fetch(`/api/laboratories/${profile.laboratory_id}`)
            if (labResponse.ok) {
              const { laboratory } = await labResponse.json()
              setUserLabName(laboratory.name)
            }
          }

          // Fetch all laboratories if user is global admin
          if (profile.qc_role === 'global_admin' || profile.qc_role === 'global_quality_admin') {
            const labsResponse = await fetch('/api/laboratories')
            if (labsResponse.ok) {
              const { laboratories } = await labsResponse.json()
              setAllLaboratories(laboratories.map((lab: any) => ({
                id: lab.id,
                name: lab.name,
                country: lab.country
              })))
            }
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err)
      }
    }
    fetchData()
  }, [])

  // Fetch micro-origins when origin changes
  useEffect(() => {
    async function fetchMicroOrigins() {
      if (!origin) {
        setAvailableMicroOrigins([])
        return
      }
      try {
        const response = await fetch(`/api/micro-regions?origin=${encodeURIComponent(origin)}`)
        if (response.ok) {
          const { microRegions } = await response.json()
          if (microRegions && Array.isArray(microRegions)) {
            setAvailableMicroOrigins(microRegions.map((mr: any) => ({
              id: mr.id,
              name: mr.region_name_en
            })))
          } else {
            setAvailableMicroOrigins([])
          }
        } else {
          setAvailableMicroOrigins([])
        }
      } catch (err) {
        console.error('Error fetching micro-origins:', err)
        setAvailableMicroOrigins([])
      }
    }
    fetchMicroOrigins()
  }, [origin])

  // Filter laboratories by selected origin
  const filteredLaboratories = origin
    ? allLaboratories.filter((lab: any) => lab.country === origin)
    : allLaboratories

  // Sample size
  const [sampleSizeGrams, setSampleSizeGrams] = useState(
    template?.parameters.sample_size_grams?.toString() || '300'
  )

  // Screen size constraints (new format)
  const [screenSizeConstraints, setScreenSizeConstraints] = useState<ScreenSizeConstraint[]>(
    template?.parameters.screen_size_requirements?.constraints || []
  )
  const [newConstraintScreen, setNewConstraintScreen] = useState<string>('')
  const [newConstraintType, setNewConstraintType] = useState<ConstraintType>('minimum')
  const [newConstraintMinValue, setNewConstraintMinValue] = useState<string>('')
  const [newConstraintMaxValue, setNewConstraintMaxValue] = useState<string>('')

  // Green Aspect (raw bean visual appearance)
  const [greenAspectConfiguration, setGreenAspectConfiguration] = useState<AspectConfiguration>(
    template?.parameters.green_aspect_configuration ||
    GREEN_ASPECT_TEMPLATES[0].configuration // Default to standard template
  )
  const [greenAspectDialogOpen, setGreenAspectDialogOpen] = useState(false)

  // Defects (new flexible format) - Pre-filled with Brazil standards
  const [defectConfiguration, setDefectConfiguration] = useState<DefectConfiguration>(
    template?.parameters.defect_configuration || {
      ...BRAZIL_SCA_DEFECTS.configuration,
      thresholds: {
        max_primary: 1,
        max_secondary: 21,
        max_total: 21
      }
    }
  )
  const [defectDialogOpen, setDefectDialogOpen] = useState(false)

  // Moisture - Pre-filled with 11% min and 12% max
  const [moistureMin, setMoistureMin] = useState(
    template?.parameters.moisture_min?.toString() || '11'
  )
  const [moistureMax, setMoistureMax] = useState(
    template?.parameters.moisture_max?.toString() || '12'
  )
  const [moistureStandard, setMoistureStandard] = useState<'coffee_industry' | 'iso_6673'>(
    template?.parameters.moisture_standard || 'coffee_industry'
  )

  // Roast Aspect (roasted bean visual appearance)
  const [roastAspectConfiguration, setRoastAspectConfiguration] = useState<AspectConfiguration>(
    template?.parameters.roast_aspect_configuration ||
    ROAST_ASPECT_TEMPLATES[0].configuration // Default to standard template
  )
  const [roastAspectDialogOpen, setRoastAspectDialogOpen] = useState(false)

  // Quaker Count
  const [roastSampleSizeGrams, setRoastSampleSizeGrams] = useState(
    template?.parameters.roast_sample_size_grams?.toString() || '300'
  )
  const [maxQuakers, setMaxQuakers] = useState(
    template?.parameters.max_quakers?.toString() || ''
  )
  const [quakerNotes, setQuakerNotes] = useState(
    template?.parameters.quaker_notes || ''
  )

  // Cupping Attributes (new flexible format)
  const [cuppingAttributes, setCuppingAttributes] = useState<CuppingAttribute[]>(
    template?.parameters.cupping_attributes || DEFAULT_CUPPING_ATTRIBUTES
  )
  const [cuppingAttributesDialogOpen, setCuppingAttributesDialogOpen] = useState(false)

  // Taints and Faults (new flexible format) - Pre-filled with Brazil standards
  const [taintFaultConfiguration, setTaintFaultConfiguration] = useState<TaintFaultConfiguration>(
    template?.parameters.taint_fault_configuration || BRAZIL_TRADITIONAL_TAINTS_FAULTS.configuration
  )
  const [taintFaultDialogOpen, setTaintFaultDialogOpen] = useState(false)

  // Micro-Region Configuration
  const [microRegionConfiguration, setMicroRegionConfiguration] = useState<MicroRegionConfiguration>(
    template?.parameters.micro_region_configuration || createEmptyMicroRegionConfiguration()
  )
  const [microRegionDialogOpen, setMicroRegionDialogOpen] = useState(false)

  // Convert CuppingAttribute[] to AttributeWithScale[] for the manager
  const attributesWithScale: AttributeWithScale[] = cuppingAttributes.map(attr => ({
    attribute: attr.attribute,
    scale: attr.scale,
    validation_rule: attr.validation_rule
  }))

  const handleAttributesChange = (newAttributes: AttributeWithScale[]) => {
    setCuppingAttributes(newAttributes.map(attr => ({
      attribute: attr.attribute,
      scale: attr.scale,
      validation_rule: attr.validation_rule,
      is_required: true
    })))
  }

  // Screen size constraint handlers
  const handleAddConstraint = () => {
    if (!newConstraintScreen) return

    // Check if constraint already exists for this screen size
    if (screenSizeConstraints.find(c => c.screen_size === newConstraintScreen)) {
      setError(`Constraint already exists for ${newConstraintScreen}`)
      return
    }

    const newConstraint: ScreenSizeConstraint = {
      screen_size: newConstraintScreen,
      constraint_type: newConstraintType,
      display_order: screenSizeConstraints.length
    }

    // Add values based on constraint type
    if (newConstraintType === 'minimum') {
      const minVal = parseFloat(newConstraintMinValue)
      if (isNaN(minVal) || minVal < 0 || minVal > 100) {
        setError('Minimum value must be between 0 and 100')
        return
      }
      newConstraint.min_value = minVal
    } else if (newConstraintType === 'maximum') {
      const maxVal = parseFloat(newConstraintMaxValue)
      if (isNaN(maxVal) || maxVal < 0 || maxVal > 100) {
        setError('Maximum value must be between 0 and 100')
        return
      }
      newConstraint.max_value = maxVal
    } else if (newConstraintType === 'range') {
      const minVal = parseFloat(newConstraintMinValue)
      const maxVal = parseFloat(newConstraintMaxValue)
      if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal > 100 || minVal >= maxVal) {
        setError('Range values must be valid, between 0-100, and min < max')
        return
      }
      newConstraint.min_value = minVal
      newConstraint.max_value = maxVal
    }
    // 'any' type doesn't need values

    setScreenSizeConstraints([...screenSizeConstraints, newConstraint])

    // Reset form
    setNewConstraintScreen('')
    setNewConstraintType('minimum')
    setNewConstraintMinValue('')
    setNewConstraintMaxValue('')
    setError(null)
  }

  const handleRemoveConstraint = (screenSize: string) => {
    setScreenSizeConstraints(screenSizeConstraints.filter(c => c.screen_size !== screenSize))
  }

  const handleUpdateConstraint = (screenSize: string, field: keyof ScreenSizeConstraint, value: any) => {
    setScreenSizeConstraints(screenSizeConstraints.map(c =>
      c.screen_size === screenSize ? { ...c, [field]: value } : c
    ))
  }

  // Helper to generate screen size summary
  const getScreenSizeSummary = () => {
    if (screenSizeConstraints.length === 0) return ''
    return screenSizeConstraints
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map(c => {
        const size = c.screen_size.replace('Screen ', 'Scr ')
        if (c.constraint_type === 'minimum') return `${size} ≥${c.min_value}%`
        if (c.constraint_type === 'maximum') return `${size} ≤${c.max_value}%`
        if (c.constraint_type === 'range') return `${size} ${c.min_value}-${c.max_value}%`
        return `${size} any`
      })
      .join(' | ')
  }

  // Helper to generate defect configuration summary
  const getDefectSummary = () => {
    if (defectConfiguration.defects.length === 0) return ''
    const parts: string[] = []
    const thresholds = defectConfiguration.thresholds

    if (thresholds.max_primary !== undefined) {
      parts.push(`Primary ≤${thresholds.max_primary}`)
    }
    if (thresholds.max_secondary !== undefined) {
      parts.push(`Secondary ≤${thresholds.max_secondary}`)
    }
    if (thresholds.max_total !== undefined) {
      parts.push(`Total ≤${thresholds.max_total}`)
    }

    return parts.join(' | ')
  }

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Template name is required'
    if (!origin) return 'Origin is required'

    // Validate sample size
    if (sampleSizeGrams && (parseFloat(sampleSizeGrams) <= 0)) {
      return 'Sample size must be greater than 0'
    }

    // Validate screen size constraints (new system)
    if (screenSizeConstraints.length === 0) {
      return 'At least one screen size constraint is required'
    }

    // Validate each constraint has valid values
    for (const constraint of screenSizeConstraints) {
      if (constraint.constraint_type === 'minimum' && (constraint.min_value === undefined || constraint.min_value < 0 || constraint.min_value > 100)) {
        return `Minimum constraint for ${constraint.screen_size} must have a value between 0 and 100`
      }
      if (constraint.constraint_type === 'maximum' && (constraint.max_value === undefined || constraint.max_value < 0 || constraint.max_value > 100)) {
        return `Maximum constraint for ${constraint.screen_size} must have a value between 0 and 100`
      }
      if (constraint.constraint_type === 'range') {
        if (constraint.min_value === undefined || constraint.max_value === undefined) {
          return `Range constraint for ${constraint.screen_size} must have both min and max values`
        }
        if (constraint.min_value >= constraint.max_value) {
          return `Range constraint for ${constraint.screen_size} must have min < max`
        }
      }
    }

    // Validate moisture
    if (moistureMin && (parseFloat(moistureMin) < 0 || parseFloat(moistureMin) > 100)) {
      return 'Moisture min must be between 0 and 100'
    }
    if (moistureMax && (parseFloat(moistureMax) < 0 || parseFloat(moistureMax) > 100)) {
      return 'Moisture max must be between 0 and 100'
    }
    if (moistureMin && moistureMax && parseFloat(moistureMin) >= parseFloat(moistureMax)) {
      return 'Moisture min must be less than moisture max'
    }

    // Validate cupping attributes
    if (cuppingAttributes.length === 0) {
      return 'At least one cupping attribute is required'
    }

    // Validate each attribute's scale configuration
    for (const attr of cuppingAttributes) {
      if (!attr.scale) {
        return `Attribute "${attr.attribute}" is missing scale configuration`
      }

      // Import validateScale from attribute-scales
      const { validateScale } = require('@/types/attribute-scales')
      const validation = validateScale(attr.scale)
      if (!validation.valid) {
        return `Attribute "${attr.attribute}": ${validation.error}`
      }
    }

    // Validate defect configuration
    if (defectConfiguration.defects.length > 0) {
      const { validateDefectConfiguration } = require('@/types/defect-configuration')
      const defectValidation = validateDefectConfiguration(defectConfiguration)
      if (!defectValidation.valid) {
        return `Defect configuration: ${defectValidation.error}`
      }
    }

    // Validate green aspect configuration
    if (greenAspectConfiguration.wordings.length > 0) {
      const { validateAspectConfiguration } = require('@/types/aspect-configuration')
      const greenAspectValidation = validateAspectConfiguration(greenAspectConfiguration)
      if (!greenAspectValidation.valid) {
        return `Green Aspect configuration: ${greenAspectValidation.error}`
      }
    }

    // Validate roast aspect configuration
    if (roastAspectConfiguration.wordings.length > 0) {
      const { validateAspectConfiguration } = require('@/types/aspect-configuration')
      const roastAspectValidation = validateAspectConfiguration(roastAspectConfiguration)
      if (!roastAspectValidation.valid) {
        return `Roast Aspect configuration: ${roastAspectValidation.error}`
      }
    }

    // Validate roast sample size and quaker count
    if (roastSampleSizeGrams && parseFloat(roastSampleSizeGrams) <= 0) {
      return 'Roast sample size must be greater than 0'
    }
    if (maxQuakers && parseFloat(maxQuakers) < 0) {
      return 'Maximum quakers must be 0 or greater'
    }

    // Validate taint/fault configuration
    if (taintFaultConfiguration.taints.length > 0 || taintFaultConfiguration.faults.length > 0) {
      const { validateTaintFaultConfiguration } = require('@/types/taint-fault-configuration')
      const taintFaultValidation = validateTaintFaultConfiguration(taintFaultConfiguration)
      if (!taintFaultValidation.valid) {
        return `Taint/Fault configuration: ${taintFaultValidation.error}`
      }
    }

    return null
  }

  const handleSubmit = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Build parameters object
      const parameters: TemplateParameters = {}

      // Sample size
      if (sampleSizeGrams) {
        parameters.sample_size_grams = parseFloat(sampleSizeGrams)
      }

      // Screen size requirements (new constraint-based format)
      parameters.screen_size_requirements = {
        constraints: screenSizeConstraints,
        notes: ''
      }

      // Green Aspect Configuration
      if (greenAspectConfiguration.wordings.length > 0) {
        parameters.green_aspect_configuration = greenAspectConfiguration
      }

      // Defect Configuration (new flexible format)
      if (defectConfiguration.defects.length > 0) {
        parameters.defect_configuration = defectConfiguration
      }

      // Moisture
      if (moistureMin || moistureMax) {
        parameters.moisture_min = moistureMin ? parseFloat(moistureMin) : undefined
        parameters.moisture_max = moistureMax ? parseFloat(moistureMax) : undefined
        parameters.moisture_standard = moistureStandard
      }

      // Roast Aspect Configuration
      if (roastAspectConfiguration.wordings.length > 0) {
        parameters.roast_aspect_configuration = roastAspectConfiguration
      }

      // Quaker Count
      if (roastSampleSizeGrams) {
        parameters.roast_sample_size_grams = parseFloat(roastSampleSizeGrams)
      }
      if (maxQuakers) {
        parameters.max_quakers = parseFloat(maxQuakers)
      }
      if (quakerNotes) {
        parameters.quaker_notes = quakerNotes
      }

      // Cupping Attributes (new flexible format)
      parameters.cupping_attributes = cuppingAttributes

      // Taint/Fault Configuration (new flexible format)
      if (taintFaultConfiguration.taints.length > 0 || taintFaultConfiguration.faults.length > 0) {
        parameters.taint_fault_configuration = taintFaultConfiguration
      }

      // Micro-Region Configuration
      if (microRegionConfiguration.requirements.length > 0) {
        parameters.micro_region_configuration = microRegionConfiguration
      }

      // Origin and Micro-origin
      if (origin) {
        (parameters as any).origin = origin
      }
      if (microOrigin && microOrigin !== 'any') {
        (parameters as any).micro_origin = microOrigin
      }

      const templateData: any = {
        ...(template?.id && { id: template.id }),
        name_en: name.trim(),
        name_pt: name.trim(), // Use English name as fallback for other languages
        name_es: name.trim(),
        description_en: description.trim() || null,
        description_pt: description.trim() || null,
        description_es: description.trim() || null,
        parameters,
        is_active: isActive,
        is_global: isGlobal,
        // Template assignment logic:
        // - Global templates: no laboratory_id, no assigned_laboratories
        // - Global admins creating lab-specific: use assigned_laboratories array
        // - Regular lab users: use their laboratory_id, add to assigned_laboratories
        laboratory_id: isGlobal ? null : (
          (userQcRole === 'global_admin' || userQcRole === 'global_quality_admin')
            ? null // Global admins use assigned_laboratories instead
            : userLaboratoryId // Lab users use their lab ID
        ),
        assigned_laboratories: isGlobal ? [] : (
          (userQcRole === 'global_admin' || userQcRole === 'global_quality_admin')
            ? assignedLaboratories // Global admins explicitly select labs
            : (userLaboratoryId ? [userLaboratoryId] : []) // Lab users auto-assign to their lab
        )
      }

      await onSave(templateData)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save template')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <CheckCircle2 className="h-4 w-4" />
          Template saved successfully!
        </div>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Two-column layout for basic fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium">Template Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Standard Brazilian"
                  className="h-8 text-sm"
                />
              </div>

              {/* Origin and Micro-origin side by side */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="origin" className="text-xs font-medium">Origin *</Label>
                  <Select value={origin} onValueChange={setOrigin}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select origin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {POPULAR_COFFEE_ORIGINS.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="micro_origin" className="text-xs font-medium">Micro-origin</Label>
                    {microOrigin && microOrigin !== 'any' && (
                      <input
                        type="checkbox"
                        id="require_micro_origin"
                        className="h-3 w-3"
                        title="Require specific micro-origin"
                      />
                    )}
                  </div>
                  <Select
                    value={microOrigin || undefined}
                    onValueChange={setMicroOrigin}
                    disabled={!origin || availableMicroOrigins.length === 0}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={origin ? "Any" : "Select origin first"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any micro-origin</SelectItem>
                      {availableMicroOrigins.map((mo) => (
                        <SelectItem key={mo.id} value={mo.id}>{mo.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sample_size" className="text-xs font-medium">Sample Size (grams)</Label>
                <Input
                  id="sample_size"
                  type="number"
                  min="1"
                  value={sampleSizeGrams}
                  onChange={(e) => setSampleSizeGrams(e.target.value)}
                  placeholder="300"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-medium">Description</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe quality standards..."
                  className="w-full h-[120px] px-2.5 py-1.5 text-sm rounded-md border border-input bg-background resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor="is_active" className="text-xs font-normal cursor-pointer">Active (available for client assignment)</Label>
              </div>
            </div>
          </div>

          {/* Template Sharing Settings */}
          <div className="space-y-2 pt-3 border-t">
            <Label className="text-xs font-medium">Template Sharing</Label>
            <div className="space-y-2">
              {/* Multi-Lab Assignment for Global Admins */}
              {(userQcRole === 'global_admin' || userQcRole === 'global_quality_admin') && filteredLaboratories.length > 0 && (
                <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
                  <div>
                    <p className="text-xs font-medium">Assign to Laboratories</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {origin
                        ? `Select labs for ${origin}. Leave empty for private template.`
                        : 'Select an origin to see available laboratories.'}
                    </p>
                  </div>
                  {origin && (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {filteredLaboratories.map((lab: any) => (
                        <div key={lab.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`lab-${lab.id}`}
                            checked={assignedLaboratories.includes(lab.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAssignedLaboratories([...assignedLaboratories, lab.id])
                              } else {
                                setAssignedLaboratories(assignedLaboratories.filter(id => id !== lab.id))
                              }
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <Label htmlFor={`lab-${lab.id}`} className="text-xs font-normal cursor-pointer">
                            {lab.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {assignedLaboratories.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t">
                      {assignedLaboratories.map(labId => {
                        const lab = allLaboratories.find(l => l.id === labId)
                        return lab ? (
                          <Badge key={labId} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                            {lab.name}
                          </Badge>
                        ) : null
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Lab-specific template for regular lab users */}
              {userLaboratoryId && userQcRole !== 'global_admin' && userQcRole !== 'global_quality_admin' && (
                <div className="p-2.5 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium">Lab-Specific Template</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Visible to all users in <strong>{userLabName || 'your laboratory'}</strong>
                  </p>
                </div>
              )}

              {/* Private template (no labs assigned) */}
              {assignedLaboratories.length === 0 && (userQcRole === 'global_admin' || userQcRole === 'global_quality_admin') && origin && (
                <div className="p-2.5 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Private Template</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                    No labs selected. Only visible to you.
                  </p>
                </div>
              )}

              {/* Private template for users without lab */}
              {!userLaboratoryId && userQcRole !== 'global_admin' && userQcRole !== 'global_quality_admin' && (
                <div className="p-2.5 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium">Private Template</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Only visible to you (no lab assigned to profile)
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Screen Size Requirements */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setScreenSizeExpanded(!screenSizeExpanded)}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {screenSizeExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
              <CardTitle className="text-sm font-semibold flex-shrink-0">Screen Size Requirements</CardTitle>
              {!screenSizeExpanded && screenSizeConstraints.length > 0 && (
                <span className="text-[11px] text-muted-foreground truncate">
                  - {getScreenSizeSummary()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        {screenSizeExpanded && (
        <CardContent className="space-y-3 pt-0">
          <div className="space-y-2.5">
            {/* Display existing constraints */}
            {screenSizeConstraints.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Defined Constraints ({screenSizeConstraints.length})</Label>
                <div className="space-y-1.5">
                  {screenSizeConstraints.map((constraint) => (
                    <div key={constraint.screen_size} className="flex items-center justify-between px-2.5 py-1.5 rounded border bg-card">
                      <div className="flex items-center gap-3 flex-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                          {constraint.screen_size}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                          {constraint.constraint_type}
                        </Badge>
                        <span className="text-xs">
                          {getConstraintDisplayText(constraint)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveConstraint(constraint.screen_size)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new constraint form */}
            <div className="border-t pt-2.5 space-y-2">
              <Label className="text-xs">Add Constraint</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                {/* Screen size selector */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Screen Size</Label>
                  <Select value={newConstraintScreen} onValueChange={setNewConstraintScreen}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_SCREEN_SIZES.filter(
                        size => !screenSizeConstraints.find(c => c.screen_size === size)
                      ).map((size) => (
                        <SelectItem key={size} value={size}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Constraint type selector */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Type</Label>
                  <Select value={newConstraintType} onValueChange={(v: ConstraintType) => setNewConstraintType(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimum">Min (≥)</SelectItem>
                      <SelectItem value="maximum">Max (≤)</SelectItem>
                      <SelectItem value="range">Range</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Value inputs */}
                {newConstraintType === 'minimum' && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Min %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={newConstraintMinValue}
                      onChange={(e) => setNewConstraintMinValue(e.target.value)}
                      placeholder="40"
                      className="h-8 text-xs"
                    />
                  </div>
                )}

                {newConstraintType === 'maximum' && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Max %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={newConstraintMaxValue}
                      onChange={(e) => setNewConstraintMaxValue(e.target.value)}
                      placeholder="20"
                      className="h-8 text-xs"
                    />
                  </div>
                )}

                {newConstraintType === 'range' && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Min %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newConstraintMinValue}
                        onChange={(e) => setNewConstraintMinValue(e.target.value)}
                        placeholder="35"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Max %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newConstraintMaxValue}
                        onChange={(e) => setNewConstraintMaxValue(e.target.value)}
                        placeholder="45"
                        className="h-8 text-xs"
                      />
                    </div>
                  </>
                )}

                {/* Add button */}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddConstraint}
                    disabled={!newConstraintScreen}
                    className="w-full h-8 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      {/* Green & Roast Aspect - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Green Aspect Configuration */}
        <Card>
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setGreenAspectExpanded(!greenAspectExpanded)}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {greenAspectExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                <CardTitle className="text-sm font-semibold">Green Aspect</CardTitle>
                {!greenAspectExpanded && greenAspectConfiguration.wordings.length > 0 && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    - {greenAspectConfiguration.wordings.length} levels
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          {greenAspectExpanded && (
          <CardContent className="space-y-2 pt-0">
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border bg-muted/30">
              <div className="flex-1 min-w-0">
                {greenAspectConfiguration.wordings.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not configured</p>
                ) : (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {greenAspectConfiguration.wordings
                        .sort((a, b) => a.display_order - b.display_order)
                        .slice(0, 3)
                        .map((wording) => (
                          <Badge key={wording.id} variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                            {wording.label}
                          </Badge>
                        ))}
                      {greenAspectConfiguration.wordings.length > 3 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                          +{greenAspectConfiguration.wordings.length - 3}
                        </Badge>
                      )}
                    </div>
                    {greenAspectConfiguration.validation?.min_acceptable_value !== undefined && (
                      <p className="text-[11px] text-muted-foreground">
                        Min: {greenAspectConfiguration.wordings.find(w => w.value === greenAspectConfiguration.validation?.min_acceptable_value)?.label || 'N/A'}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setGreenAspectDialogOpen(true); }}
                className="h-7 text-xs flex-shrink-0"
              >
                Edit
              </Button>
            </div>
          </CardContent>
          )}
        </Card>

        {/* Roast Aspect Configuration */}
        <Card>
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setRoastAspectExpanded(!roastAspectExpanded)}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {roastAspectExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                <CardTitle className="text-sm font-semibold">Roast Aspect</CardTitle>
                {!roastAspectExpanded && roastAspectConfiguration.wordings.length > 0 && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    - {roastAspectConfiguration.wordings.length} levels
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          {roastAspectExpanded && (
          <CardContent className="space-y-2 pt-0">
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border bg-muted/30">
              <div className="flex-1 min-w-0">
                {roastAspectConfiguration.wordings.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not configured</p>
                ) : (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {roastAspectConfiguration.wordings
                        .sort((a, b) => a.display_order - b.display_order)
                        .slice(0, 3)
                        .map((wording) => (
                          <Badge key={wording.id} variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                            {wording.label}
                          </Badge>
                        ))}
                      {roastAspectConfiguration.wordings.length > 3 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                          +{roastAspectConfiguration.wordings.length - 3}
                        </Badge>
                      )}
                    </div>
                    {roastAspectConfiguration.validation?.min_acceptable_value !== undefined && (
                      <p className="text-[11px] text-muted-foreground">
                        Min: {roastAspectConfiguration.wordings.find(w => w.value === roastAspectConfiguration.validation?.min_acceptable_value)?.label || 'N/A'}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setRoastAspectDialogOpen(true); }}
                className="h-7 text-xs flex-shrink-0"
              >
                Edit
              </Button>
            </div>
          </CardContent>
          )}
        </Card>
      </div>

      {/* Green Aspect Configuration Dialog */}
      <AspectConfigManager
        open={greenAspectDialogOpen}
        onOpenChange={setGreenAspectDialogOpen}
        value={greenAspectConfiguration}
        onChange={setGreenAspectConfiguration}
        aspectType="green"
      />

      {/* Roast Aspect Configuration Dialog */}
      <AspectConfigManager
        open={roastAspectDialogOpen}
        onOpenChange={setRoastAspectDialogOpen}
        value={roastAspectConfiguration}
        onChange={setRoastAspectConfiguration}
        aspectType="roast"
      />

      {/* Defect Configuration (New Flexible System) */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setDefectExpanded(!defectExpanded)}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {defectExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
              <CardTitle className="text-sm font-semibold flex-shrink-0">Defect Configuration</CardTitle>
              {!defectExpanded && defectConfiguration.defects.length > 0 && (
                <span className="text-[11px] text-muted-foreground truncate">
                  - {getDefectSummary()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        {defectExpanded && (
        <CardContent className="space-y-3 pt-0">

          {defectConfiguration.defects.length === 0 ? (
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Not configured
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDefectDialogOpen(true)}
                className="h-7 text-xs"
              >
                Configure
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Thresholds Summary */}
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border bg-muted/30">
                <div className="space-y-0.5 text-xs">
                  <p className="font-medium">
                    {defectConfiguration.defects.length} defect{defectConfiguration.defects.length !== 1 ? 's' : ''} configured
                  </p>
                  {(defectConfiguration.thresholds.max_primary ||
                    defectConfiguration.thresholds.max_secondary ||
                    defectConfiguration.thresholds.max_total) && (
                    <p className="text-[11px] text-muted-foreground">
                      {defectConfiguration.thresholds.max_primary !== undefined && `Primary ≤${defectConfiguration.thresholds.max_primary}`}
                      {defectConfiguration.thresholds.max_secondary !== undefined && ` • Secondary ≤${defectConfiguration.thresholds.max_secondary}`}
                      {defectConfiguration.thresholds.max_total !== undefined && ` • Total ≤${defectConfiguration.thresholds.max_total}`}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setDefectDialogOpen(true); }}
                  className="h-7 text-xs"
                >
                  Configure
                </Button>
              </div>

              {/* Defect Weight Tables - Collapsible */}
              <div className="border rounded-lg">
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer bg-muted/30 rounded-t-lg"
                  onClick={() => setDefectWeightExpanded(!defectWeightExpanded)}
                >
                  {defectWeightExpanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
                  <span className="text-xs font-medium">Defect Weights</span>
                  {!defectWeightExpanded && (
                    <span className="text-[11px] text-muted-foreground">
                      - {defectConfiguration.defects.filter(d => d.category === 'primary').length} primary, {defectConfiguration.defects.filter(d => d.category === 'secondary').length} secondary
                    </span>
                  )}
                </div>
                {defectWeightExpanded && (
                <div className="p-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Primary Defects Table */}
                <div className="rounded border">
                  <div className="bg-muted/50 px-2 py-1 border-b">
                    <h4 className="font-medium text-[11px]">Primary ({defectConfiguration.defects.filter(d => d.category === 'primary').length})</h4>
                  </div>
                  <div className="p-2">
                    {defectConfiguration.defects.filter(d => d.category === 'primary').length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">None</p>
                    ) : (
                      <div className="space-y-1">
                        {defectConfiguration.defects
                          .filter(d => d.category === 'primary')
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((defect) => (
                            <div key={defect.name} className="flex items-center justify-between text-[11px]">
                              <span>{defect.name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {defect.weight}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Secondary Defects Table */}
                <div className="rounded border">
                  <div className="bg-muted/50 px-2 py-1 border-b">
                    <h4 className="font-medium text-[11px]">Secondary ({defectConfiguration.defects.filter(d => d.category === 'secondary').length})</h4>
                  </div>
                  <div className="p-2">
                    {defectConfiguration.defects.filter(d => d.category === 'secondary').length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">None</p>
                    ) : (
                      <div className="space-y-1">
                        {defectConfiguration.defects
                          .filter(d => d.category === 'secondary')
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((defect) => (
                            <div key={defect.name} className="flex items-center justify-between text-[11px]">
                              <span>{defect.name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {defect.weight}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
                </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Defect Configuration Dialog */}
      <DefectConfigManager
        open={defectDialogOpen}
        onOpenChange={setDefectDialogOpen}
        value={defectConfiguration}
        onChange={setDefectConfiguration}
        sampleSize={parseFloat(sampleSizeGrams) || 300}
      />

      {/* Moisture % & Quaker Count - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Moisture % */}
        <Card>
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setMoistureExpanded(!moistureExpanded)}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {moistureExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                <CardTitle className="text-sm font-semibold">Moisture %</CardTitle>
                {!moistureExpanded && (moistureMin || moistureMax) && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    - {moistureMin ? `${moistureMin}%` : '?'} to {moistureMax ? `${moistureMax}%` : '?'}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          {moistureExpanded && (
          <CardContent className="space-y-2 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="moisture_min" className="text-xs font-medium">Min (%)</Label>
                <Input
                  id="moisture_min"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={moistureMin}
                  onChange={(e) => setMoistureMin(e.target.value)}
                  placeholder="11"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="moisture_max" className="text-xs font-medium">Max (%)</Label>
                <Input
                  id="moisture_max"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={moistureMax}
                  onChange={(e) => setMoistureMax(e.target.value)}
                  placeholder="12"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Standard</Label>
              <Select value={moistureStandard} onValueChange={(v: any) => setMoistureStandard(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coffee_industry">Coffee Industry</SelectItem>
                  <SelectItem value="iso_6673">ISO 6673</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          )}
        </Card>

        {/* Quaker Count */}
        <Card>
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setQuakerExpanded(!quakerExpanded)}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {quakerExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                <CardTitle className="text-sm font-semibold">Quaker Count</CardTitle>
                {!quakerExpanded && maxQuakers && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    - Max {maxQuakers} per {roastSampleSizeGrams}g
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          {quakerExpanded && (
          <CardContent className="space-y-2 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="roast_sample_size" className="text-xs font-medium">Roast Sample Size (grams)</Label>
                <Input
                  id="roast_sample_size"
                  type="number"
                  min="1"
                  value={roastSampleSizeGrams}
                  onChange={(e) => setRoastSampleSizeGrams(e.target.value)}
                  placeholder="300"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_quakers" className="text-xs font-medium">Maximum Quakers</Label>
                <Input
                  id="max_quakers"
                  type="number"
                  min="0"
                  value={maxQuakers}
                  onChange={(e) => setMaxQuakers(e.target.value)}
                  placeholder="e.g., 5"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quaker_notes" className="text-xs font-medium">Notes</Label>
              <Input
                id="quaker_notes"
                value={quakerNotes}
                onChange={(e) => setQuakerNotes(e.target.value)}
                placeholder="Client-specific requirements..."
                className="h-8 text-sm"
              />
            </div>

            {/* View Info - Collapsible */}
            <div className="border-t pt-2">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setShowQuakerInfo(!showQuakerInfo)}
              >
                {showQuakerInfo ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="text-xs font-medium text-muted-foreground">View Info</span>
              </div>
              {showQuakerInfo && (
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  <p>Set maximum allowable quaker beans (unripe/defective beans that don&apos;t roast properly):</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li><strong>Quakers:</strong> Unripe beans that remain pale after roasting</li>
                    <li><strong>Quality Impact:</strong> High quaker count indicates poor bean sorting</li>
                    <li><strong>Client Requirements:</strong> Some clients have strict quaker limits</li>
                    <li><strong>Flexible Sample Size:</strong> Define the roast sample size and quaker limit separately from green bean analysis</li>
                    <li><strong>Common Ranges:</strong> 0-5 for specialty coffee, 0-10 for commercial grades</li>
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
          )}
        </Card>
      </div>

      {/* Cupping Attributes (New Flexible System) */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setCuppingExpanded(!cuppingExpanded)}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {cuppingExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
              <CardTitle className="text-sm font-semibold flex-shrink-0">Cupping Attributes</CardTitle>
              {!cuppingExpanded && cuppingAttributes.length > 0 && (
                <span className="text-[11px] text-muted-foreground truncate">
                  - Numeric: {cuppingAttributes.filter(a => a.scale.type === 'numeric').length} | Wording: {cuppingAttributes.filter(a => a.scale.type === 'wording').length}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        {cuppingExpanded && (
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border bg-muted/30">
            <div className="flex-1 min-w-0">
              {cuppingAttributes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No attributes configured yet. Click &quot;Manage&quot; to get started.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">
                    {cuppingAttributes.length} attribute{cuppingAttributes.length !== 1 ? 's' : ''} configured
                  </p>
                  <div className="space-y-1">
                    {cuppingAttributes.slice(0, 3).map((attr, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                          {attr.attribute}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {attr.scale.type === 'numeric'
                            ? `${attr.scale.min}-${attr.scale.max} (step ${attr.scale.increment})`
                            : `${attr.scale.options?.length || 0} options`}
                        </span>
                        {attr.validation_rule && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                            {formatValidationRule(attr.validation_rule, attr.scale)}
                          </Badge>
                        )}
                      </div>
                    ))}
                    {cuppingAttributes.length > 3 && (
                      <p className="text-[11px] text-muted-foreground">
                        +{cuppingAttributes.length - 3} more...
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1 border-t">
                    Numeric: {cuppingAttributes.filter(a => a.scale.type === 'numeric').length} •
                    Wording: {cuppingAttributes.filter(a => a.scale.type === 'wording').length} •
                    Max Total: {cuppingAttributes
                      .filter(a => a.scale.type === 'numeric')
                      .reduce((sum, a) => sum + (a.scale.type === 'numeric' ? a.scale.max : 0), 0)}
                  </p>
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setCuppingAttributesDialogOpen(true); }}
              className="h-7 text-xs flex-shrink-0"
            >
              Manage
            </Button>
          </div>

          {/* View Info - Collapsible */}
          <div className="border-t pt-2">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setShowCuppingInfo(!showCuppingInfo)}
            >
              {showCuppingInfo ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="text-xs font-medium text-muted-foreground">View Info</span>
            </div>
            {showCuppingInfo && (
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Configure cupping attributes with flexible scales:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li><strong>Numeric Scales:</strong> Define custom ranges (e.g., 1-5, 1-10, any min-max)</li>
                  <li><strong>Wording Scales:</strong> Create custom text-based scales with numeric values (e.g., Outstanding=10, Good=7, Poor=3)</li>
                  <li><strong>Mixed Attributes:</strong> Each attribute can use a different scale type</li>
                  <li><strong>Templates:</strong> Start with SCA, COE, or Brazil Traditional presets</li>
                </ul>
              </div>
            )}
          </div>
        </CardContent>
        )}
      </Card>

      {/* Cupping Attributes Configuration Dialog */}
      <CuppingAttributeConfigManager
        open={cuppingAttributesDialogOpen}
        onOpenChange={setCuppingAttributesDialogOpen}
        value={attributesWithScale}
        onChange={handleAttributesChange}
      />

      {/* Taints and Faults (New Flexible System) */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setTaintFaultExpanded(!taintFaultExpanded)}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {taintFaultExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
              <CardTitle className="text-sm font-semibold flex-shrink-0">Taints and Faults</CardTitle>
              {!taintFaultExpanded && (taintFaultConfiguration.taints.length > 0 || taintFaultConfiguration.faults.length > 0) && (
                <span className="text-[11px] text-muted-foreground truncate">
                  - Taints: {taintFaultConfiguration.taints.length} | Faults: {taintFaultConfiguration.faults.length}
                  {taintFaultConfiguration.rules.zero_tolerance && ' | Zero Tolerance'}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        {taintFaultExpanded && (
        <CardContent className="space-y-3 pt-0">
          {taintFaultConfiguration.taints.length === 0 && taintFaultConfiguration.faults.length === 0 ? (
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border bg-muted/30">
              <p className="text-xs text-muted-foreground">
                No taints or faults configured yet. Click &quot;Manage&quot; to get started.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setTaintFaultDialogOpen(true); }}
                className="h-7 text-xs flex-shrink-0"
              >
                Manage
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Summary */}
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border bg-muted/30">
                <div className="space-y-0.5 text-xs">
                  <p className="font-medium">
                    {taintFaultConfiguration.taints.length + taintFaultConfiguration.faults.length} definition{(taintFaultConfiguration.taints.length + taintFaultConfiguration.faults.length) !== 1 ? 's' : ''} configured
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Taints: {taintFaultConfiguration.taints.length} • Faults: {taintFaultConfiguration.faults.length}
                  </p>
                  {taintFaultConfiguration.rules.zero_tolerance ? (
                    <p className="text-[11px] font-medium text-destructive">
                      Zero Tolerance Mode
                    </p>
                  ) : (
                    (taintFaultConfiguration.rules.max_taints !== undefined ||
                      taintFaultConfiguration.rules.max_faults !== undefined ||
                      taintFaultConfiguration.rules.max_combined !== undefined) && (
                      <p className="text-[11px] text-muted-foreground">
                        {taintFaultConfiguration.rules.max_taints !== undefined && `Taints ≤${taintFaultConfiguration.rules.max_taints}`}
                        {taintFaultConfiguration.rules.max_faults !== undefined && ` • Faults ≤${taintFaultConfiguration.rules.max_faults}`}
                        {taintFaultConfiguration.rules.max_combined !== undefined && ` • Combined ≤${taintFaultConfiguration.rules.max_combined}`}
                      </p>
                    )
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setTaintFaultDialogOpen(true); }}
                  className="h-7 text-xs flex-shrink-0"
                >
                  Manage
                </Button>
              </div>

              {/* Taints & Faults Tables - Collapsible */}
              <div className="border rounded-lg">
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer bg-muted/30 rounded-t-lg"
                  onClick={() => setTaintFaultListExpanded(!taintFaultListExpanded)}
                >
                  {taintFaultListExpanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
                  <span className="text-xs font-medium">Configured Taints & Faults</span>
                  {!taintFaultListExpanded && (
                    <span className="text-[11px] text-muted-foreground">
                      - {taintFaultConfiguration.taints.length} taints, {taintFaultConfiguration.faults.length} faults
                    </span>
                  )}
                </div>
                {taintFaultListExpanded && (
                <div className="p-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {/* Taints Table */}
                    <div className="rounded border">
                      <div className="bg-muted/50 px-2 py-1 border-b">
                        <h4 className="font-medium text-[11px]">Taints ({taintFaultConfiguration.taints.length})</h4>
                      </div>
                      <div className="p-2">
                        {taintFaultConfiguration.taints.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">None</p>
                        ) : (
                          <div className="space-y-1">
                            {taintFaultConfiguration.taints
                              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                              .map((taint) => (
                                <div key={taint.name} className="flex items-center justify-between text-[11px]">
                                  <span>{taint.name}</span>
                                  {taint.scale && (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                      {taint.scale.type === 'numeric'
                                        ? `${taint.scale.min}-${taint.scale.max}`
                                        : `${taint.scale.options?.length || 0} levels`}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Faults Table */}
                    <div className="rounded border">
                      <div className="bg-muted/50 px-2 py-1 border-b">
                        <h4 className="font-medium text-[11px]">Faults ({taintFaultConfiguration.faults.length})</h4>
                      </div>
                      <div className="p-2">
                        {taintFaultConfiguration.faults.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">None</p>
                        ) : (
                          <div className="space-y-1">
                            {taintFaultConfiguration.faults
                              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                              .map((fault) => (
                                <div key={fault.name} className="flex items-center justify-between text-[11px]">
                                  <span>{fault.name}</span>
                                  {fault.scale && (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                      {fault.scale.type === 'numeric'
                                        ? `${fault.scale.min}-${fault.scale.max}`
                                        : `${fault.scale.options?.length || 0} levels`}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

          {/* View Info - Collapsible */}
          <div className="border-t pt-2">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setShowTaintFaultInfo(!showTaintFaultInfo)}
            >
              {showTaintFaultInfo ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="text-xs font-medium text-muted-foreground">View Info</span>
            </div>
            {showTaintFaultInfo && (
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Configure taints, faults, intensity scales, and validation rules:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li><strong>Taints:</strong> Mild off-flavors that may be acceptable in certain grades</li>
                  <li><strong>Faults:</strong> Severe sensory defects that typically result in rejection</li>
                  <li><strong>Custom Scales:</strong> Define intensity measurement per taint/fault (numeric or wording)</li>
                  <li><strong>Validation Rules:</strong> Set count limits, intensity caps, or zero tolerance</li>
                  <li><strong>Templates:</strong> Load SCA, Specialty, Commercial, or Brazil standards</li>
                </ul>
              </div>
            )}
          </div>
        </CardContent>
        )}
      </Card>

      {/* Taint/Fault Configuration Dialog */}
      <TaintFaultConfigManager
        open={taintFaultDialogOpen}
        onOpenChange={setTaintFaultDialogOpen}
        value={taintFaultConfiguration}
        onChange={setTaintFaultConfiguration}
      />

      {/* Micro-Region Configuration Dialog */}
      <MicroRegionConfigManager
        open={microRegionDialogOpen}
        onOpenChange={setMicroRegionDialogOpen}
        value={microRegionConfiguration}
        onChange={setMicroRegionConfiguration}
      />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Saving...' : 'Save Template'}
        </Button>
      </div>
    </div>
  )
}
