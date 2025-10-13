'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Plus, X, Save } from 'lucide-react'

interface AttributeScale {
  attribute: string
  scale: number
  range: number // +/- range
}

interface TemplateParameters {
  screen_sizes?: {
    sizes?: { [key: string]: number } // e.g., { "Pan": 5, "Peas 9": 10, "Scr. 17": 25 }
  }
  defects?: {
    primary_max: number
    secondary_max: number
    total_max: number
    defect_types?: { [key: string]: number } // e.g., { "broken": 5, "green": 3 }
  }
  moisture_min?: number
  moisture_max?: number
  moisture_standard?: 'coffee_industry' | 'iso_6673'
  cupping?: {
    scale_type: '1-5' | '1-7' | '1-10'
    min_score?: number
    attributes: AttributeScale[]
  }
  taints_faults?: {
    max_taints: number
    max_faults: number
    rule_type: 'AND' | 'OR'
  }
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

const DEFAULT_CUPPING_ATTRIBUTES: AttributeScale[] = [
  { attribute: 'Fragrance/Aroma', scale: 4, range: 1 },
  { attribute: 'Flavor', scale: 4, range: 1 },
  { attribute: 'Aftertaste', scale: 4, range: 1 },
  { attribute: 'Acidity', scale: 4, range: 1 },
  { attribute: 'Body', scale: 4, range: 1 },
  { attribute: 'Balance', scale: 4, range: 1 },
  { attribute: 'Uniformity', scale: 4, range: 1 },
  { attribute: 'Clean Cup', scale: 4, range: 1 },
  { attribute: 'Sweetness', scale: 4, range: 1 },
  { attribute: 'Overall', scale: 4, range: 1 }
]

const SCREEN_SIZES = ['Pan', 'Peas 9', 'Peas 10', 'Peas 11', 'Scr. 12', 'Scr. 13', 'Scr. 14', 'Scr. 15', 'Scr. 16', 'Scr. 17', 'Scr. 18', 'Scr. 19', 'Scr. 20']

const DEFECT_TYPES = ['Broken', 'Green', 'Broca', 'Sour', 'Black', 'Fungus', 'Foreign Matter', 'Quaker']

export function TemplateBuilder({ template, onSave, onCancel }: TemplateBuilderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Basic info
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [isActive, setIsActive] = useState(template?.is_active !== false)

  // Screen sizes
  const [specificSizes, setSpecificSizes] = useState<{ [key: string]: number }>(
    template?.parameters.screen_sizes?.sizes || {}
  )

  // Defects
  const [primaryMax, setPrimaryMax] = useState(
    template?.parameters.defects?.primary_max?.toString() || ''
  )
  const [secondaryMax, setSecondaryMax] = useState(
    template?.parameters.defects?.secondary_max?.toString() || ''
  )
  const [totalMax, setTotalMax] = useState(
    template?.parameters.defects?.total_max?.toString() || ''
  )
  const [defectTypes, setDefectTypes] = useState<{ [key: string]: number }>(
    template?.parameters.defects?.defect_types || {}
  )

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

  // Cupping
  const [cuppingScaleType, setCuppingScaleType] = useState<'1-5' | '1-7' | '1-10'>(
    template?.parameters.cupping?.scale_type || '1-10'
  )
  const [cuppingMinScore, setCuppingMinScore] = useState(
    template?.parameters.cupping?.min_score?.toString() || ''
  )
  const [cuppingAttributes, setCuppingAttributes] = useState<AttributeScale[]>(
    template?.parameters.cupping?.attributes || DEFAULT_CUPPING_ATTRIBUTES
  )
  const [newAttribute, setNewAttribute] = useState('')
  const [newAttributeScale, setNewAttributeScale] = useState('4')
  const [newAttributeRange, setNewAttributeRange] = useState('1')

  // Taints and Faults
  const [maxTaints, setMaxTaints] = useState(
    template?.parameters.taints_faults?.max_taints?.toString() || ''
  )
  const [maxFaults, setMaxFaults] = useState(
    template?.parameters.taints_faults?.max_faults?.toString() || ''
  )
  const [taintFaultRule, setTaintFaultRule] = useState<'AND' | 'OR'>(
    template?.parameters.taints_faults?.rule_type || 'AND'
  )

  const handleAddAttribute = () => {
    if (newAttribute.trim() && !cuppingAttributes.find(a => a.attribute === newAttribute.trim())) {
      setCuppingAttributes([...cuppingAttributes, {
        attribute: newAttribute.trim(),
        scale: parseFloat(newAttributeScale),
        range: parseFloat(newAttributeRange)
      }])
      setNewAttribute('')
      setNewAttributeScale('4')
      setNewAttributeRange('1')
    }
  }

  const handleRemoveAttribute = (attribute: string) => {
    setCuppingAttributes(cuppingAttributes.filter(a => a.attribute !== attribute))
  }

  const handleAttributeScaleChange = (attribute: string, scale: string) => {
    setCuppingAttributes(cuppingAttributes.map(a =>
      a.attribute === attribute ? { ...a, scale: parseFloat(scale) || 0 } : a
    ))
  }

  const handleAttributeRangeChange = (attribute: string, range: string) => {
    setCuppingAttributes(cuppingAttributes.map(a =>
      a.attribute === attribute ? { ...a, range: parseFloat(range) || 0 } : a
    ))
  }

  const handleSpecificSizeChange = (size: string, percentage: string) => {
    const value = parseFloat(percentage)
    if (isNaN(value) || value < 0) {
      const { [size]: _, ...rest } = specificSizes
      setSpecificSizes(rest)
    } else {
      setSpecificSizes({ ...specificSizes, [size]: value })
    }
  }

  const handleDefectTypeChange = (defectType: string, value: string) => {
    const numValue = parseFloat(value)
    if (isNaN(numValue) || numValue < 0) {
      const { [defectType]: _, ...rest } = defectTypes
      setDefectTypes(rest)
    } else {
      setDefectTypes({ ...defectTypes, [defectType]: numValue })
    }
  }

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Template name is required'

    // Validate screen sizes
    if (Object.keys(specificSizes).length === 0) return 'At least one screen size is required'
    const total = Object.values(specificSizes).reduce((sum, val) => sum + val, 0)
    if (Math.abs(total - 100) > 0.1) return `Screen size percentages must total 100% (currently ${total.toFixed(1)}%)`

    // Validate defects
    if (primaryMax && (parseFloat(primaryMax) < 0 || parseFloat(primaryMax) > 100)) {
      return 'Primary defects max must be between 0 and 100'
    }
    if (secondaryMax && (parseFloat(secondaryMax) < 0 || parseFloat(secondaryMax) > 100)) {
      return 'Secondary defects max must be between 0 and 100'
    }
    if (totalMax && (parseFloat(totalMax) < 0 || parseFloat(totalMax) > 100)) {
      return 'Total defects max must be between 0 and 100'
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

    // Validate cupping
    if (cuppingMinScore) {
      const scoreMap = { '1-5': 5, '1-7': 7, '1-10': 10 }
      const maxScore = scoreMap[cuppingScaleType]
      if (parseFloat(cuppingMinScore) < 1 || parseFloat(cuppingMinScore) > maxScore) {
        return `Cupping min score must be between 1 and ${maxScore}`
      }
    }

    if (cuppingAttributes.length === 0) {
      return 'At least one cupping attribute is required'
    }

    // Validate taints and faults
    if (maxTaints && parseFloat(maxTaints) < 0) {
      return 'Max taints must be 0 or greater'
    }
    if (maxFaults && parseFloat(maxFaults) < 0) {
      return 'Max faults must be 0 or greater'
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

      // Screen sizes
      parameters.screen_sizes = {
        sizes: specificSizes
      }

      // Defects
      if (primaryMax || secondaryMax || totalMax) {
        parameters.defects = {
          primary_max: primaryMax ? parseFloat(primaryMax) : 0,
          secondary_max: secondaryMax ? parseFloat(secondaryMax) : 0,
          total_max: totalMax ? parseFloat(totalMax) : 0,
          defect_types: Object.keys(defectTypes).length > 0 ? defectTypes : undefined
        }
      }

      // Moisture
      if (moistureMin || moistureMax) {
        parameters.moisture_min = moistureMin ? parseFloat(moistureMin) : undefined
        parameters.moisture_max = moistureMax ? parseFloat(moistureMax) : undefined
        parameters.moisture_standard = moistureStandard
      }

      // Cupping
      parameters.cupping = {
        scale_type: cuppingScaleType,
        min_score: cuppingMinScore ? parseFloat(cuppingMinScore) : undefined,
        attributes: cuppingAttributes
      }

      // Taints and Faults
      if (maxTaints || maxFaults) {
        parameters.taints_faults = {
          max_taints: maxTaints ? parseFloat(maxTaints) : 0,
          max_faults: maxFaults ? parseFloat(maxFaults) : 0,
          rule_type: taintFaultRule
        }
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

      {/* Screen Sizes */}
      <Card>
        <CardHeader>
          <CardTitle>Screen Size Requirements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Size Distribution (must total 100%)</Label>
              <Badge variant="outline">
                Total: {Object.values(specificSizes).reduce((sum, val) => sum + val, 0).toFixed(1)}%
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SCREEN_SIZES.map((size) => (
                <div key={size} className="space-y-1">
                  <Label className="text-xs">{size}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={specificSizes[size] || ''}
                    onChange={(e) => handleSpecificSizeChange(size, e.target.value)}
                    placeholder="0.0%"
                    className="h-8"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Templates you create can be saved and reused for specific client configurations (e.g., NY 2/3 14/16 SS FC).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Defect Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Defect Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary_max">Primary Defects Maximum</Label>
              <Input
                id="primary_max"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={primaryMax}
                onChange={(e) => setPrimaryMax(e.target.value)}
                placeholder="e.g., 5"
              />
              <p className="text-xs text-muted-foreground">Maximum allowed primary defects count</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_max">Secondary Defects Maximum</Label>
              <Input
                id="secondary_max"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={secondaryMax}
                onChange={(e) => setSecondaryMax(e.target.value)}
                placeholder="e.g., 10"
              />
              <p className="text-xs text-muted-foreground">Maximum allowed secondary defects count</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_max">Total Defects Maximum</Label>
              <Input
                id="total_max"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={totalMax}
                onChange={(e) => setTotalMax(e.target.value)}
                placeholder="e.g., 15"
              />
              <p className="text-xs text-muted-foreground">Sum of primary and secondary defects</p>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <Label>Individual Defect Types (optional limits)</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {DEFECT_TYPES.map((defect) => (
                <div key={defect} className="space-y-1">
                  <Label className="text-xs">{defect}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={defectTypes[defect] || ''}
                    onChange={(e) => handleDefectTypeChange(defect, e.target.value)}
                    placeholder="Max"
                    className="h-8"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Set specific limits for individual defect types if needed.
            </p>
          </div>
        </CardContent>
      </Card>

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

      {/* Attributes (Cupping) */}
      <Card>
        <CardHeader>
          <CardTitle>Attributes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cupping Scale Type</Label>
              <Select value={cuppingScaleType} onValueChange={(v: any) => setCuppingScaleType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-5">1-5 Scale</SelectItem>
                  <SelectItem value="1-7">1-7 Scale</SelectItem>
                  <SelectItem value="1-10">1-10 Scale (SCA Standard)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cupping_min_score">Minimum Total Score</Label>
              <Input
                id="cupping_min_score"
                type="number"
                min="1"
                max={cuppingScaleType === '1-5' ? '5' : cuppingScaleType === '1-7' ? '7' : '10'}
                step="0.25"
                value={cuppingMinScore}
                onChange={(e) => setCuppingMinScore(e.target.value)}
                placeholder={`e.g., ${cuppingScaleType === '1-10' ? '80' : cuppingScaleType === '1-7' ? '5.6' : '4.0'}`}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Attribute Scales and Ranges</Label>
            <div className="space-y-2">
              {cuppingAttributes.map((attr) => (
                <div key={attr.attribute} className="flex items-center gap-3 p-3 rounded-md border">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">{attr.attribute}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Scale</Label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        step="0.25"
                        value={attr.scale}
                        onChange={(e) => handleAttributeScaleChange(attr.attribute, e.target.value)}
                        className="h-8 w-20"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Range (+/-)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        step="0.25"
                        value={attr.range}
                        onChange={(e) => handleAttributeRangeChange(attr.attribute, e.target.value)}
                        className="h-8 w-20"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveAttribute(attr.attribute)}
                      className="ml-2 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={newAttribute}
                onChange={(e) => setNewAttribute(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddAttribute()}
                placeholder="Attribute name..."
                className="flex-1"
              />
              <Input
                type="number"
                min="0"
                max="10"
                step="0.25"
                value={newAttributeScale}
                onChange={(e) => setNewAttributeScale(e.target.value)}
                placeholder="Scale"
                className="w-20"
              />
              <Input
                type="number"
                min="0"
                max="5"
                step="0.25"
                value={newAttributeRange}
                onChange={(e) => setNewAttributeRange(e.target.value)}
                placeholder="+/-"
                className="w-20"
              />
              <Button type="button" variant="outline" onClick={handleAddAttribute}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Example: Fragrance/Aroma with Scale 4 and Range 1 means acceptable range is 3-5 (4 +/- 1).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Taints and Faults */}
      <Card>
        <CardHeader>
          <CardTitle>Taints and Faults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_taints">Maximum Taints Allowed</Label>
              <Input
                id="max_taints"
                type="number"
                min="0"
                step="1"
                value={maxTaints}
                onChange={(e) => setMaxTaints(e.target.value)}
                placeholder="e.g., 0"
              />
              <p className="text-xs text-muted-foreground">Total number of taints allowed</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_faults">Maximum Faults Allowed</Label>
              <Input
                id="max_faults"
                type="number"
                min="0"
                step="1"
                value={maxFaults}
                onChange={(e) => setMaxFaults(e.target.value)}
                placeholder="e.g., 0"
              />
              <p className="text-xs text-muted-foreground">Total number of faults allowed</p>
            </div>

            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={taintFaultRule} onValueChange={(v: any) => setTaintFaultRule(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND (both limits must pass)</SelectItem>
                  <SelectItem value="OR">OR (either limit can pass)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure thresholds for taints and faults detected during cupping sessions.
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
