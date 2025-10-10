'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Plus, X, Save } from 'lucide-react'

interface TemplateParameters {
  screen_sizes?: {
    type: 'range' | 'specific' | 'predefined'
    predefined?: string // 'Pan', 'Peas 9-11', '12-20'
    min?: number
    max?: number
    sizes?: { [key: string]: number } // e.g., { "17": 25, "18": 30 }
  }
  defects?: {
    primary_max: number
    secondary_max: number
  }
  moisture_max?: number
  moisture_standard?: 'coffee_industry' | 'iso_6673'
  cupping?: {
    scale_type: '1-5' | '1-7' | '1-10'
    min_score?: number
    attributes: string[]
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

const DEFAULT_CUPPING_ATTRIBUTES = [
  'Fragrance/Aroma',
  'Flavor',
  'Aftertaste',
  'Acidity',
  'Body',
  'Balance',
  'Uniformity',
  'Clean Cup',
  'Sweetness',
  'Overall'
]

const SCREEN_SIZES = ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']

export function TemplateBuilder({ template, onSave, onCancel }: TemplateBuilderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Basic info
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [isActive, setIsActive] = useState(template?.is_active !== false)

  // Screen sizes
  const [screenSizeType, setScreenSizeType] = useState<'range' | 'specific' | 'predefined'>(
    template?.parameters.screen_sizes?.type || 'specific'
  )
  const [screenSizePredefined, setScreenSizePredefined] = useState(
    template?.parameters.screen_sizes?.predefined || ''
  )
  const [screenSizeMin, setScreenSizeMin] = useState(
    template?.parameters.screen_sizes?.min?.toString() || ''
  )
  const [screenSizeMax, setScreenSizeMax] = useState(
    template?.parameters.screen_sizes?.max?.toString() || ''
  )
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

  // Moisture
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
  const [cuppingAttributes, setCuppingAttributes] = useState<string[]>(
    template?.parameters.cupping?.attributes || DEFAULT_CUPPING_ATTRIBUTES
  )
  const [newAttribute, setNewAttribute] = useState('')

  const handleAddAttribute = () => {
    if (newAttribute.trim() && !cuppingAttributes.includes(newAttribute.trim())) {
      setCuppingAttributes([...cuppingAttributes, newAttribute.trim()])
      setNewAttribute('')
    }
  }

  const handleRemoveAttribute = (attribute: string) => {
    setCuppingAttributes(cuppingAttributes.filter(a => a !== attribute))
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

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Template name is required'

    // Validate screen sizes
    if (screenSizeType === 'range') {
      if (!screenSizeMin || !screenSizeMax) return 'Screen size range requires min and max values'
      if (parseInt(screenSizeMin) >= parseInt(screenSizeMax)) return 'Min must be less than max'
    } else if (screenSizeType === 'specific') {
      if (Object.keys(specificSizes).length === 0) return 'At least one screen size is required'
      const total = Object.values(specificSizes).reduce((sum, val) => sum + val, 0)
      if (Math.abs(total - 100) > 0.1) return `Screen size percentages must total 100% (currently ${total.toFixed(1)}%)`
    } else if (screenSizeType === 'predefined') {
      if (!screenSizePredefined) return 'Predefined screen size type is required'
    }

    // Validate defects
    if (primaryMax && (parseFloat(primaryMax) < 0 || parseFloat(primaryMax) > 100)) {
      return 'Primary defects max must be between 0 and 100'
    }
    if (secondaryMax && (parseFloat(secondaryMax) < 0 || parseFloat(secondaryMax) > 100)) {
      return 'Secondary defects max must be between 0 and 100'
    }

    // Validate moisture
    if (moistureMax && (parseFloat(moistureMax) < 0 || parseFloat(moistureMax) > 100)) {
      return 'Moisture max must be between 0 and 100'
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
      if (screenSizeType === 'predefined') {
        parameters.screen_sizes = {
          type: 'predefined',
          predefined: screenSizePredefined
        }
      } else if (screenSizeType === 'range') {
        parameters.screen_sizes = {
          type: 'range',
          min: parseInt(screenSizeMin),
          max: parseInt(screenSizeMax)
        }
      } else {
        parameters.screen_sizes = {
          type: 'specific',
          sizes: specificSizes
        }
      }

      // Defects
      if (primaryMax || secondaryMax) {
        parameters.defects = {
          primary_max: primaryMax ? parseFloat(primaryMax) : 0,
          secondary_max: secondaryMax ? parseFloat(secondaryMax) : 0
        }
      }

      // Moisture
      if (moistureMax) {
        parameters.moisture_max = parseFloat(moistureMax)
        parameters.moisture_standard = moistureStandard
      }

      // Cupping
      parameters.cupping = {
        scale_type: cuppingScaleType,
        min_score: cuppingMinScore ? parseFloat(cuppingMinScore) : undefined,
        attributes: cuppingAttributes
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
          <div className="space-y-2">
            <Label>Configuration Type</Label>
            <Select value={screenSizeType} onValueChange={(v: any) => setScreenSizeType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="predefined">Predefined (Pan, Peas, etc.)</SelectItem>
                <SelectItem value="range">Range (e.g., 12-20)</SelectItem>
                <SelectItem value="specific">Specific Percentages</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {screenSizeType === 'predefined' && (
            <div className="space-y-2">
              <Label>Predefined Type</Label>
              <Select value={screenSizePredefined} onValueChange={setScreenSizePredefined}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pan">Pan</SelectItem>
                  <SelectItem value="Peas 9-11">Peas 9-11</SelectItem>
                  <SelectItem value="12-20">12-20</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {screenSizeType === 'range' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum Size</Label>
                <Input
                  type="number"
                  min="9"
                  max="20"
                  value={screenSizeMin}
                  onChange={(e) => setScreenSizeMin(e.target.value)}
                  placeholder="9"
                />
              </div>
              <div className="space-y-2">
                <Label>Maximum Size</Label>
                <Input
                  type="number"
                  min="9"
                  max="20"
                  value={screenSizeMax}
                  onChange={(e) => setScreenSizeMax(e.target.value)}
                  placeholder="20"
                />
              </div>
            </div>
          )}

          {screenSizeType === 'specific' && (
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
                    <Label className="text-xs">Size {size}</Label>
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Defect Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Defect Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Moisture Content */}
      <Card>
        <CardHeader>
          <CardTitle>Moisture Content Standards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="moisture_max">Maximum Moisture Content (%)</Label>
              <Input
                id="moisture_max"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={moistureMax}
                onChange={(e) => setMoistureMax(e.target.value)}
                placeholder="e.g., 12.5"
              />
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

      {/* Cupping Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Cupping Configuration</CardTitle>
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
            <Label>Cupping Attributes</Label>
            <div className="flex flex-wrap gap-2">
              {cuppingAttributes.map((attr) => (
                <Badge key={attr} variant="secondary" className="gap-1">
                  {attr}
                  <button
                    onClick={() => handleRemoveAttribute(attr)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={newAttribute}
                onChange={(e) => setNewAttribute(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddAttribute()}
                placeholder="Add custom attribute..."
              />
              <Button type="button" variant="outline" onClick={handleAddAttribute}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
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
