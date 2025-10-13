'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Plus, X, Save } from 'lucide-react'
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
  createNumericScale
} from '@/types/attribute-scales'
import { AttributeScaleManager, AttributeWithScale } from './scale-builder'
import {
  DefectConfiguration,
  createEmptyDefectConfiguration
} from '@/types/defect-configuration'
import { DefectConfigManager } from './defect-config-manager'

// AttributeScale is now imported from @/types/attribute-scales as CuppingAttribute

interface TaintFaultConfig {
  definition_id: string
  max_count?: number
  is_blocking?: boolean
}

interface TemplateParameters {
  sample_size_grams?: number // For proportional scaling
  screen_sizes?: {
    sizes?: { [key: string]: number } // Legacy format - kept for backward compatibility
  }
  screen_size_requirements?: ScreenSizeRequirements // New constraint-based format
  defect_configuration?: DefectConfiguration // New flexible defect format
  moisture_min?: number
  moisture_max?: number
  moisture_standard?: 'coffee_industry' | 'iso_6673'
  cupping?: {
    // Legacy format - deprecated, kept for backward compatibility
    scale_type?: '1-5' | '1-7' | '1-10'
    min_score?: number
    attributes?: any[] // Old attribute format
  }
  cupping_attributes?: CuppingAttribute[] // New flexible attribute format
  taints_faults?: TaintFaultConfig[]
}

interface Template {
  id?: string
  name: string
  description: string
  version?: number
  parameters: TemplateParameters
  is_active?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

interface TemplateBuilderProps {
  template?: Template
  onSave: (template: Template) => Promise<void>
  onCancel: () => void
}

const DEFAULT_CUPPING_ATTRIBUTES: CuppingAttribute[] = [
  { attribute: 'Fragrance/Aroma', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Flavor', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Aftertaste', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Acidity', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Body', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Balance', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Uniformity', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Clean Cup', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Sweetness', scale: createNumericScale(1, 10, 0.25), is_required: true },
  { attribute: 'Overall', scale: createNumericScale(1, 10, 0.25), is_required: true }
]

// Removed SCREEN_SIZES - now using STANDARD_SCREEN_SIZES from types

export function TemplateBuilder({ template, onSave, onCancel }: TemplateBuilderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Basic info
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [isActive, setIsActive] = useState(template?.is_active !== false)

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

  // Defects (new flexible format)
  const [defectConfiguration, setDefectConfiguration] = useState<DefectConfiguration>(
    template?.parameters.defect_configuration || createEmptyDefectConfiguration()
  )
  const [defectDialogOpen, setDefectDialogOpen] = useState(false)

  // Moisture
  const [moistureMin, setMoistureMin] = useState(
    template?.parameters.moisture_min?.toString() || ''
  )
  const [moistureMax, setMoistureMax] = useState(
    template?.parameters.moisture_max?.toString() || ''
  )
  const [moistureStandard, setMoistureStandard] = useState<'coffee_industry' | 'iso_6673'>(
    template?.parameters.moisture_standard || 'coffee_industry'
  )

  // Cupping Attributes (new flexible format)
  const [cuppingAttributes, setCuppingAttributes] = useState<CuppingAttribute[]>(
    template?.parameters.cupping_attributes || DEFAULT_CUPPING_ATTRIBUTES
  )

  // Taints and Faults
  const [taintFaultConfigs, setTaintFaultConfigs] = useState<TaintFaultConfig[]>(
    template?.parameters.taints_faults || []
  )

  // Convert CuppingAttribute[] to AttributeWithScale[] for the manager
  const attributesWithScale: AttributeWithScale[] = cuppingAttributes.map(attr => ({
    attribute: attr.attribute,
    scale: attr.scale
  }))

  const handleAttributesChange = (newAttributes: AttributeWithScale[]) => {
    setCuppingAttributes(newAttributes.map(attr => ({
      attribute: attr.attribute,
      scale: attr.scale,
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

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Template name is required'

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

      // Cupping Attributes (new flexible format)
      parameters.cupping_attributes = cuppingAttributes

      // Taints and Faults
      if (taintFaultConfigs.length > 0) {
        parameters.taints_faults = taintFaultConfigs
      }

      const templateData: Template = {
        ...(template?.id && { id: template.id }),
        name: name.trim(),
        description: description.trim(),
        parameters,
        is_active: isActive
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
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Standard Brazilian, Premium Colombian"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the quality standards for this template..."
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sample_size">Sample Size (grams)</Label>
            <Input
              id="sample_size"
              type="number"
              min="1"
              value={sampleSizeGrams}
              onChange={(e) => setSampleSizeGrams(e.target.value)}
              placeholder="300"
            />
            <p className="text-xs text-muted-foreground">
              Default: 300g. Used for proportional scaling of defect counts and point values.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="is_active">Active (available for client assignment)</Label>
          </div>
        </CardContent>
      </Card>

      {/* Screen Size Requirements */}
      <Card>
        <CardHeader>
          <CardTitle>Screen Size Requirements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Defined Constraints ({screenSizeConstraints.length})</Label>

            {/* Display existing constraints */}
            {screenSizeConstraints.length > 0 && (
              <div className="space-y-2">
                {screenSizeConstraints.map((constraint) => (
                  <div key={constraint.screen_size} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-4 flex-1">
                      <Badge variant="outline" className="min-w-[100px]">
                        {constraint.screen_size}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {constraint.constraint_type}
                        </Badge>
                        <span className="text-sm font-medium">
                          {getConstraintDisplayText(constraint)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveConstraint(constraint.screen_size)}
                      className="hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new constraint form */}
            <div className="border-t pt-4 space-y-3">
              <Label>Add Screen Size Constraint</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Screen size selector */}
                <div className="space-y-1">
                  <Label className="text-xs">Screen Size</Label>
                  <Select value={newConstraintScreen} onValueChange={setNewConstraintScreen}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_SCREEN_SIZES.filter(
                        size => !screenSizeConstraints.find(c => c.screen_size === size)
                      ).map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Constraint type selector */}
                <div className="space-y-1">
                  <Label className="text-xs">Constraint Type</Label>
                  <Select value={newConstraintType} onValueChange={(v: ConstraintType) => setNewConstraintType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimum">Minimum (≥)</SelectItem>
                      <SelectItem value="maximum">Maximum (≤)</SelectItem>
                      <SelectItem value="range">Range</SelectItem>
                      <SelectItem value="any">Any Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Value inputs (conditional based on constraint type) */}
                {newConstraintType === 'minimum' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Minimum %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={newConstraintMinValue}
                      onChange={(e) => setNewConstraintMinValue(e.target.value)}
                      placeholder="e.g., 40"
                    />
                  </div>
                )}

                {newConstraintType === 'maximum' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Maximum %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={newConstraintMaxValue}
                      onChange={(e) => setNewConstraintMaxValue(e.target.value)}
                      placeholder="e.g., 20"
                    />
                  </div>
                )}

                {newConstraintType === 'range' && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Min %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newConstraintMinValue}
                        onChange={(e) => setNewConstraintMinValue(e.target.value)}
                        placeholder="e.g., 35"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newConstraintMaxValue}
                        onChange={(e) => setNewConstraintMaxValue(e.target.value)}
                        placeholder="e.g., 45"
                      />
                    </div>
                  </>
                )}

                {/* Add button */}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddConstraint}
                    disabled={!newConstraintScreen}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Constraint Types:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Minimum:</strong> At least X% must be this screen size (e.g., ≥45% Screen 11+)</li>
                <li><strong>Maximum:</strong> At most X% can be this screen size (e.g., ≤5% Pan)</li>
                <li><strong>Range:</strong> Screen size must be between min-max% (e.g., 35-45% Screen 18)</li>
                <li><strong>Any:</strong> No constraint, just track the screen exists (e.g., Screen 15 any amount)</li>
              </ul>
              <p className="mt-2">During QC grading, only screens with defined constraints will be shown, reducing visual clutter.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Defect Configuration (New Flexible System) */}
      <Card>
        <CardHeader>
          <CardTitle>Defect Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>Configure defects, weights, and validation thresholds:</p>
            <ul className="list-disc list-inside space-y-1 mt-2 ml-2">
              <li><strong>Primary Defects:</strong> Severe defects (typically weight 1.00)</li>
              <li><strong>Secondary Defects:</strong> Minor defects (variable weights 0.1-0.5)</li>
              <li><strong>Custom Weights:</strong> Define point values per defect</li>
              <li><strong>Validation Thresholds:</strong> Set max limits for primary, secondary, and total</li>
              <li><strong>Templates:</strong> Load Brazil, Colombia, Guatemala, or SCA standards</li>
            </ul>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div>
              {defectConfiguration.defects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No defects configured yet. Click "Manage Defects" to get started.
                </p>
              ) : (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {defectConfiguration.defects.length} defect{defectConfiguration.defects.length !== 1 ? 's' : ''} configured
                  </p>
                  <p className="text-muted-foreground">
                    Primary: {defectConfiguration.defects.filter(d => d.category === 'primary').length} •
                    Secondary: {defectConfiguration.defects.filter(d => d.category === 'secondary').length}
                  </p>
                  {(defectConfiguration.thresholds.max_primary ||
                    defectConfiguration.thresholds.max_secondary ||
                    defectConfiguration.thresholds.max_total) && (
                    <p className="text-muted-foreground">
                      Thresholds:
                      {defectConfiguration.thresholds.max_primary && ` Primary ≤${defectConfiguration.thresholds.max_primary}`}
                      {defectConfiguration.thresholds.max_secondary && ` • Secondary ≤${defectConfiguration.thresholds.max_secondary}`}
                      {defectConfiguration.thresholds.max_total && ` • Total ≤${defectConfiguration.thresholds.max_total}`}
                    </p>
                  )}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDefectDialogOpen(true)}
            >
              Manage Defects
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Defect Configuration Dialog */}
      <DefectConfigManager
        open={defectDialogOpen}
        onOpenChange={setDefectDialogOpen}
        value={defectConfiguration}
        onChange={setDefectConfiguration}
        sampleSize={parseFloat(sampleSizeGrams) || 300}
      />

      {/* Moisture % */}
      <Card>
        <CardHeader>
          <CardTitle>Moisture %</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="moisture_min">Minimum Moisture (%)</Label>
              <Input
                id="moisture_min"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={moistureMin}
                onChange={(e) => setMoistureMin(e.target.value)}
                placeholder="e.g., 10.0"
              />
              <p className="text-xs text-muted-foreground">Usually around 10%</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="moisture_max">Maximum Moisture (%)</Label>
              <Input
                id="moisture_max"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={moistureMax}
                onChange={(e) => setMoistureMax(e.target.value)}
                placeholder="e.g., 12.0"
              />
              <p className="text-xs text-muted-foreground">Usually around 12%</p>
            </div>

            <div className="space-y-2">
              <Label>Measurement Standard</Label>
              <Select value={moistureStandard} onValueChange={(v: any) => setMoistureStandard(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coffee_industry">Coffee Industry Standard</SelectItem>
                  <SelectItem value="iso_6673">ISO 6673</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cupping Attributes (New Flexible System) */}
      <Card>
        <CardHeader>
          <CardTitle>Cupping Attributes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>Configure cupping attributes with flexible scales:</p>
              <ul className="list-disc list-inside space-y-1 mt-2 ml-2">
                <li><strong>Numeric Scales:</strong> Define custom ranges (e.g., 1-5, 1-10, any min-max)</li>
                <li><strong>Wording Scales:</strong> Create custom text-based scales with numeric values (e.g., Outstanding=10, Good=7, Poor=3)</li>
                <li><strong>Mixed Attributes:</strong> Each attribute can use a different scale type</li>
                <li><strong>Templates:</strong> Start with SCA, COE, or Brazil Traditional presets</li>
              </ul>
            </div>

            <AttributeScaleManager
              attributes={attributesWithScale}
              onChange={handleAttributesChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Taints and Faults */}
      <Card>
        <CardHeader>
          <CardTitle>Taints and Faults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Configure which taints and faults apply to this template and set thresholds
              </p>
              {taintFaultConfigs.length > 0 && (
                <p className="text-sm mt-1">
                  {taintFaultConfigs.length} taint/fault{taintFaultConfigs.length !== 1 ? 's' : ''} configured
                </p>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => {/* TODO: Open taints/faults dialog */}}>
              Manage Taints & Faults
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Taints and faults are origin-specific and detected during cupping sessions.
          </p>
        </CardContent>
      </Card>

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
