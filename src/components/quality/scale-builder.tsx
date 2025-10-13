'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, X, GripVertical, Copy } from 'lucide-react'
import {
  AttributeScaleType,
  NumericScale,
  WordingScale,
  WordingScaleOption,
  ScaleTemplate,
  PREDEFINED_SCALE_TEMPLATES,
  validateScale,
  createNumericScale,
  createWordingScale,
  cloneScaleTemplate
} from '@/types/attribute-scales'

interface ScaleBuilderProps {
  value: AttributeScaleType
  onChange: (scale: AttributeScaleType) => void
  showTemplateSelector?: boolean
}

export function ScaleBuilder({ value, onChange, showTemplateSelector = true }: ScaleBuilderProps) {
  const [scaleType, setScaleType] = useState<'numeric' | 'wording'>(value.type)

  const handleScaleTypeChange = (type: 'numeric' | 'wording') => {
    setScaleType(type)
    if (type === 'numeric') {
      onChange(createNumericScale(1, 10, 0.25))
    } else {
      onChange(createWordingScale([
        { label: 'Excellent', value: 10 },
        { label: 'Good', value: 7 },
        { label: 'Fair', value: 5 },
        { label: 'Poor', value: 3 }
      ]))
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    const template = PREDEFINED_SCALE_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setScaleType(template.scale.type)
      onChange(template.scale)
    }
  }

  const validation = validateScale(value)

  return (
    <div className="space-y-4">
      {/* Scale Type Selector */}
      <div className="space-y-2">
        <Label>Scale Type</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={scaleType === 'numeric' ? 'default' : 'outline'}
            onClick={() => handleScaleTypeChange('numeric')}
            className="flex-1"
          >
            Numeric Scale
          </Button>
          <Button
            type="button"
            variant={scaleType === 'wording' ? 'default' : 'outline'}
            onClick={() => handleScaleTypeChange('wording')}
            className="flex-1"
          >
            Wording Scale
          </Button>
        </div>
      </div>

      {/* Template Selector */}
      {showTemplateSelector && (
        <div className="space-y-2">
          <Label>Quick Templates (Optional)</Label>
          <Select onValueChange={handleTemplateSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select a preset template..." />
            </SelectTrigger>
            <SelectContent>
              {PREDEFINED_SCALE_TEMPLATES
                .filter(t => t.scale.type === scaleType)
                .map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} - {template.description}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Start with a preset or build your own from scratch
          </p>
        </div>
      )}

      {/* Scale Configuration */}
      {scaleType === 'numeric' ? (
        <NumericScaleBuilder
          scale={value as NumericScale}
          onChange={onChange}
        />
      ) : (
        <WordingScaleBuilder
          scale={value as WordingScale}
          onChange={onChange}
        />
      )}

      {/* Validation Error */}
      {!validation.valid && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
          {validation.error}
        </div>
      )}
    </div>
  )
}

// ========================================
// NUMERIC SCALE BUILDER
// ========================================

interface NumericScaleBuilderProps {
  scale: NumericScale
  onChange: (scale: AttributeScaleType) => void
}

function NumericScaleBuilder({ scale, onChange }: NumericScaleBuilderProps) {
  const handleChange = (field: keyof NumericScale, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue)) {
      onChange({
        ...scale,
        [field]: numValue
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Numeric Scale Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Minimum Value</Label>
            <Input
              type="number"
              step="0.01"
              value={scale.min}
              onChange={(e) => handleChange('min', e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Maximum Value</Label>
            <Input
              type="number"
              step="0.01"
              value={scale.max}
              onChange={(e) => handleChange('max', e.target.value)}
              placeholder="10"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Increment Step</Label>
            <Input
              type="number"
              step="0.01"
              value={scale.increment}
              onChange={(e) => handleChange('increment', e.target.value)}
              placeholder="0.25"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Preview:</strong> {scale.min} to {scale.max} by {scale.increment}</p>
          <p className="text-muted-foreground">
            Examples: {[scale.min, scale.min + scale.increment, scale.min + (scale.increment * 2)].join(', ')}, ..., {scale.max}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ========================================
// WORDING SCALE BUILDER
// ========================================

interface WordingScaleBuilderProps {
  scale: WordingScale
  onChange: (scale: AttributeScaleType) => void
}

function WordingScaleBuilder({ scale, onChange }: WordingScaleBuilderProps) {
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')

  // Ensure options array exists - use effect to avoid calling onChange during render
  useEffect(() => {
    if (!scale.options || !Array.isArray(scale.options)) {
      onChange({
        type: 'wording',
        options: []
      })
    }
  }, [])

  // Guard against undefined options during render
  const options = scale.options || []

  const handleAddOption = () => {
    if (!newLabel.trim() || !newValue) return

    const value = parseFloat(newValue)
    if (isNaN(value)) return

    // Check for duplicates
    if (options.some(o => o.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      return
    }
    if (options.some(o => o.value === value)) {
      return
    }

    const newOptions = [
      ...options,
      {
        label: newLabel.trim(),
        value,
        display_order: options.length
      }
    ]

    onChange({
      ...scale,
      options: newOptions.sort((a, b) => b.value - a.value).map((opt, idx) => ({
        ...opt,
        display_order: idx
      }))
    })

    setNewLabel('')
    setNewValue('')
  }

  const handleRemoveOption = (index: number) => {
    const newOptions = options
      .filter((_, i) => i !== index)
      .map((opt, idx) => ({ ...opt, display_order: idx }))
    onChange({ ...scale, options: newOptions })
  }

  const handleUpdateOption = (index: number, field: keyof WordingScaleOption, value: string | number) => {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], [field]: value }
    onChange({ ...scale, options: newOptions })
  }

  const handleMoveOption = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === options.length - 1)
    ) {
      return
    }

    const newOptions = [...options]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    // Swap display_order
    const tempOrder = newOptions[index].display_order
    newOptions[index].display_order = newOptions[targetIndex].display_order
    newOptions[targetIndex].display_order = tempOrder

    // Swap positions
    ;[newOptions[index], newOptions[targetIndex]] = [newOptions[targetIndex], newOptions[index]]

    onChange({ ...scale, options: newOptions })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Wording Scale Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Options */}
        <div className="space-y-2">
          <Label className="text-xs">Scale Options ({options.length})</Label>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No options defined yet. Add options below.</p>
          ) : (
            <div className="space-y-2">
              {options.map((option, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                >
                  {/* Drag Handle */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMoveOption(index, 'up')}
                      disabled={index === 0}
                      className="hover:text-primary disabled:opacity-30"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveOption(index, 'down')}
                      disabled={index === options.length - 1}
                      className="hover:text-primary disabled:opacity-30"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Order Badge */}
                  <Badge variant="outline" className="min-w-[32px] justify-center">
                    {index + 1}
                  </Badge>

                  {/* Label Input */}
                  <Input
                    value={option.label}
                    onChange={(e) => handleUpdateOption(index, 'label', e.target.value)}
                    placeholder="Label"
                    className="flex-1 h-8"
                  />

                  {/* Value Input */}
                  <Input
                    type="number"
                    step="0.01"
                    value={option.value}
                    onChange={(e) => handleUpdateOption(index, 'value', parseFloat(e.target.value))}
                    placeholder="Value"
                    className="w-24 h-8"
                  />

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(index)}
                    className="hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Option */}
        <div className="border-t pt-4 space-y-2">
          <Label className="text-xs">Add New Option</Label>
          <div className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddOption()}
              placeholder="Label (e.g., Outstanding)"
              className="flex-1"
            />
            <Input
              type="number"
              step="0.01"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddOption()}
              placeholder="Value (e.g., 10)"
              className="w-24"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAddOption}
              disabled={!newLabel.trim() || !newValue}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Add custom wording options with their corresponding numeric values
          </p>
        </div>

        {/* Preview */}
        {options.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Preview:</strong></p>
            <div className="flex flex-wrap gap-1">
              {options.map((option, index) => (
                <Badge key={index} variant="secondary">
                  {option.label} ({option.value})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ========================================
// ATTRIBUTE WITH SCALE BUILDER
// ========================================

export interface AttributeWithScale {
  attribute: string
  scale: AttributeScaleType
}

interface AttributeScaleManagerProps {
  attributes: AttributeWithScale[]
  onChange: (attributes: AttributeWithScale[]) => void
}

export function AttributeScaleManager({ attributes, onChange }: AttributeScaleManagerProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [newAttributeName, setNewAttributeName] = useState('')

  const handleAddAttribute = () => {
    if (!newAttributeName.trim()) return
    if (attributes.some(a => a.attribute === newAttributeName.trim())) return

    const newAttribute: AttributeWithScale = {
      attribute: newAttributeName.trim(),
      scale: createNumericScale(1, 10, 0.25)
    }

    onChange([...attributes, newAttribute])
    setNewAttributeName('')
    setEditingIndex(attributes.length)
  }

  const handleRemoveAttribute = (index: number) => {
    onChange(attributes.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
    }
  }

  const handleUpdateAttributeScale = (index: number, scale: AttributeScaleType) => {
    const newAttributes = [...attributes]
    newAttributes[index] = { ...newAttributes[index], scale }
    onChange(newAttributes)
  }

  const handleDuplicateAttribute = (index: number) => {
    const attr = attributes[index]
    const newAttribute: AttributeWithScale = {
      attribute: `${attr.attribute} (Copy)`,
      scale: JSON.parse(JSON.stringify(attr.scale)) // Deep clone
    }
    onChange([...attributes, newAttribute])
  }

  return (
    <div className="space-y-4">
      {/* Existing Attributes */}
      <div className="space-y-3">
        <Label>Attributes ({attributes.length})</Label>
        {attributes.map((attr, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{attr.attribute}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {attr.scale.type === 'numeric' ? 'Numeric' : 'Wording'}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDuplicateAttribute(index)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                  >
                    {editingIndex === index ? 'Hide' : 'Edit'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttribute(index)}
                    className="hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            {editingIndex === index && (
              <CardContent>
                <ScaleBuilder
                  value={attr.scale}
                  onChange={(scale) => handleUpdateAttributeScale(index, scale)}
                  showTemplateSelector={true}
                />
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Add New Attribute */}
      <div className="border-t pt-4 space-y-2">
        <Label>Add New Attribute</Label>
        <div className="flex gap-2">
          <Input
            value={newAttributeName}
            onChange={(e) => setNewAttributeName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddAttribute()}
            placeholder="Attribute name (e.g., Fragrance/Aroma, Flavor, Body)"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddAttribute}
            disabled={!newAttributeName.trim()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Add custom attributes with any name your client requires
        </p>
      </div>
    </div>
  )
}
