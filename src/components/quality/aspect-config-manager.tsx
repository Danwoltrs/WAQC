'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, X, AlertCircle, CheckCircle2, GripVertical } from 'lucide-react'
import {
  AspectConfiguration,
  AspectWording,
  AspectConfigTemplate,
  createAspectWording,
  validateAspectConfiguration,
  GREEN_ASPECT_TEMPLATES,
  ROAST_ASPECT_TEMPLATES
} from '@/types/aspect-configuration'

interface AspectConfigManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: AspectConfiguration
  onChange: (config: AspectConfiguration) => void
  aspectType: 'green' | 'roast'
  title?: string
  description?: string
}

export function AspectConfigManager({
  open,
  onOpenChange,
  value,
  onChange,
  aspectType,
  title,
  description
}: AspectConfigManagerProps) {
  const [config, setConfig] = useState<AspectConfiguration>(value)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const templates = aspectType === 'green' ? GREEN_ASPECT_TEMPLATES : ROAST_ASPECT_TEMPLATES
  const displayTitle = title || `${aspectType === 'green' ? 'Green' : 'Roast'} Aspect Configuration`
  const displayDescription =
    description ||
    `Configure ${aspectType === 'green' ? 'raw bean' : 'roasted bean'} appearance terminology and validation rules`

  const handleConfigChange = (newConfig: AspectConfiguration) => {
    setConfig(newConfig)
    setError(null)
  }

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      handleConfigChange(template.configuration)
    }
  }

  const handleSave = () => {
    const validation = validateAspectConfiguration(config)
    if (!validation.valid) {
      setError(validation.error || 'Invalid configuration')
      return
    }

    onChange(config)
    onOpenChange(false)
  }

  const handleCancel = () => {
    setConfig(value) // Reset to original
    setError(null)
    onOpenChange(false)
  }

  const handleAddWording = () => {
    if (!newLabel.trim()) {
      setError('Label is required')
      return
    }

    const value = parseFloat(newValue)
    if (isNaN(value) || value < 1 || value > 10) {
      setError('Value must be a number between 1 and 10')
      return
    }

    // Check for duplicates
    if (config.wordings.some(w => w.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      setError('This label already exists')
      return
    }

    if (config.wordings.some(w => w.value === value)) {
      setError('This value is already used')
      return
    }

    const newWording = createAspectWording(
      newLabel.trim(),
      value,
      config.wordings.length,
      newDescription.trim() || undefined
    )

    handleConfigChange({
      ...config,
      wordings: [...config.wordings, newWording].sort((a, b) => a.display_order - b.display_order)
    })

    // Reset form
    setNewLabel('')
    setNewValue('')
    setNewDescription('')
    setError(null)
  }

  const handleRemoveWording = (id: string) => {
    const newWordings = config.wordings
      .filter(w => w.id !== id)
      .map((w, idx) => ({ ...w, display_order: idx }))
    handleConfigChange({
      ...config,
      wordings: newWordings
    })

    // Reset validation if the removed wording was the min acceptable
    if (config.validation?.min_acceptable_value) {
      const removedWording = config.wordings.find(w => w.id === id)
      if (removedWording && removedWording.value === config.validation.min_acceptable_value) {
        handleConfigChange({
          ...config,
          wordings: newWordings,
          validation: undefined
        })
      }
    }
  }

  const handleUpdateWording = (id: string, updates: Partial<AspectWording>) => {
    handleConfigChange({
      ...config,
      wordings: config.wordings.map(w => (w.id === id ? { ...w, ...updates } : w))
    })
  }

  const handleMoveWording = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === config.wordings.length - 1)) {
      return
    }

    const newWordings = [...config.wordings]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    // Swap display_order
    const tempOrder = newWordings[index].display_order
    newWordings[index].display_order = newWordings[targetIndex].display_order
    newWordings[targetIndex].display_order = tempOrder

    // Swap positions
    ;[newWordings[index], newWordings[targetIndex]] = [newWordings[targetIndex], newWordings[index]]

    handleConfigChange({
      ...config,
      wordings: newWordings
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Fixed Header */}
        <div className="shrink-0 border-b px-6 py-4 bg-background">
          <DialogHeader>
            <DialogTitle>{displayTitle}</DialogTitle>
            <DialogDescription>{displayDescription}</DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Template Loader */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Load Template</CardTitle>
              <CardDescription>Start with a predefined scale and customize as needed</CardDescription>
            </CardHeader>
            <CardContent>
              <Select onValueChange={handleLoadTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} - {template.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Wordings List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance Wordings ({config.wordings.length})</CardTitle>
              <CardDescription>
                Define the terminology used to describe visual appearance (ordered from lower to higher quality)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing Wordings */}
              {config.wordings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No wordings configured yet. Add wordings below or load a template.
                </p>
              ) : (
                <div className="space-y-2">
                  {config.wordings
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((wording, index) => (
                      <div
                        key={wording.id}
                        className="flex items-center gap-2 p-3 rounded-lg border bg-card"
                      >
                        {/* Move Buttons */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveWording(index, 'up')}
                            disabled={index === 0}
                            className="hover:text-primary disabled:opacity-30"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveWording(index, 'down')}
                            disabled={index === config.wordings.length - 1}
                            className="hover:text-primary disabled:opacity-30"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>

                        {/* Order Badge */}
                        <Badge variant="outline" className="min-w-[40px] justify-center">
                          {index + 1}
                        </Badge>

                        {/* Label Input */}
                        <Input
                          value={wording.label}
                          onChange={e => handleUpdateWording(wording.id, { label: e.target.value })}
                          placeholder="Appearance label"
                          className="flex-1 h-8"
                        />

                        {/* Value Input */}
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Value:</Label>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            step="0.1"
                            value={wording.value}
                            onChange={e =>
                              handleUpdateWording(wording.id, { value: parseFloat(e.target.value) })
                            }
                            className="w-16 h-8"
                          />
                        </div>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveWording(wording.id)}
                          className="hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {/* Add New Wording */}
              <div className="border-t pt-4 space-y-3">
                <Label className="text-sm font-medium">Add New Wording</Label>
                <div className="grid grid-cols-1 md:grid-cols-[1fr,100px,auto] gap-2">
                  <Input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddWording()}
                    placeholder="e.g., Blue-Green, Fine, Excellent"
                  />
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    step="0.1"
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddWording()}
                    placeholder="Value (1-10)"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddWording}
                    disabled={!newLabel.trim() || !newValue}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Optional description (e.g., Premium blue-green beans)"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Wordings should be ordered from lowest (1) to highest quality (10). Higher values indicate better appearance.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Validation Rules */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation Rules (Optional)</CardTitle>
              <CardDescription>Set minimum acceptable appearance standards</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="min_acceptable">Minimum Acceptable Wording</Label>
                <Select
                  value={config.validation?.min_acceptable_value?.toString() || 'none'}
                  onValueChange={val => {
                    if (val === 'none') {
                      handleConfigChange({
                        ...config,
                        validation: undefined
                      })
                    } else {
                      handleConfigChange({
                        ...config,
                        validation: {
                          ...config.validation,
                          min_acceptable_value: parseFloat(val)
                        }
                      })
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No validation (any value acceptable)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No validation</SelectItem>
                    {config.wordings
                      .sort((a, b) => a.value - b.value)
                      .map(w => (
                        <SelectItem key={w.id} value={w.value.toString()}>
                          {w.label} ({w.value})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  If set, the appearance must be at or above this level to pass validation
                </p>
              </div>

              {config.validation?.min_acceptable_value !== undefined && (
                <div className="space-y-2">
                  <Label htmlFor="validation_message">Custom Validation Message</Label>
                  <Input
                    id="validation_message"
                    value={config.validation.validation_message || ''}
                    onChange={e =>
                      handleConfigChange({
                        ...config,
                        validation: {
                          ...config.validation!,
                          validation_message: e.target.value
                        }
                      })
                    }
                    placeholder={`e.g., ${aspectType === 'green' ? 'Green' : 'Roast'} aspect must be '${config.wordings.find(w => w.value === config.validation?.min_acceptable_value)?.label}' or better`}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={config.notes || ''}
                onChange={e => handleConfigChange({ ...config, notes: e.target.value })}
                placeholder="Add any notes about this aspect configuration..."
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background"
              />
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Configuration Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Total Wordings</Label>
                  <p className="text-lg font-semibold">{config.wordings.length}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Value Range</Label>
                  <p className="text-lg font-semibold">
                    {config.wordings.length > 0
                      ? `${Math.min(...config.wordings.map(w => w.value))}-${Math.max(...config.wordings.map(w => w.value))}`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Has Validation</Label>
                  <p className="text-lg font-semibold">
                    {config.validation?.min_acceptable_value !== undefined ? 'Yes' : 'No'}
                  </p>
                </div>
                {config.validation?.min_acceptable_value !== undefined && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Min Acceptable</Label>
                    <p className="text-lg font-semibold">
                      {config.wordings.find(w => w.value === config.validation?.min_acceptable_value)?.label || 'N/A'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fixed Footer */}
        <div className="shrink-0 border-t px-6 py-4 bg-background">
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save Configuration
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
