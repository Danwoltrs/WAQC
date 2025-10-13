'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, X, AlertCircle, CheckCircle2, Copy, Download } from 'lucide-react'
import {
  DefectConfig,
  DefectConfiguration,
  DefectThresholds,
  DefectTemplate,
  PREDEFINED_DEFECT_TEMPLATES,
  validateDefectConfiguration,
  getDefectsByCategory,
  cloneDefectTemplate,
  createEmptyDefectConfiguration
} from '@/types/defect-configuration'

interface DefectConfigManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: DefectConfiguration
  onChange: (config: DefectConfiguration) => void
  sampleSize?: number // For proportional scaling context
}

export function DefectConfigManager({
  open,
  onOpenChange,
  value,
  onChange,
  sampleSize = 300
}: DefectConfigManagerProps) {
  const [config, setConfig] = useState<DefectConfiguration>(value)
  const [hasChanges, setHasChanges] = useState(false)

  const validation = validateDefectConfiguration(config)

  const handleSave = () => {
    if (validation.valid) {
      onChange(config)
      setHasChanges(false)
      onOpenChange(false)
    }
  }

  const handleCancel = () => {
    setConfig(value) // Reset to original
    setHasChanges(false)
    onOpenChange(false)
  }

  const handleConfigChange = (newConfig: DefectConfiguration) => {
    setConfig(newConfig)
    setHasChanges(true)
  }

  const handleLoadTemplate = (templateId: string) => {
    const template = PREDEFINED_DEFECT_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      handleConfigChange(template.configuration)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Defect Configuration</DialogTitle>
          <DialogDescription>
            Configure defects, weights, and validation thresholds for this quality template.
            Sample size: {sampleSize}g
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Validation Error */}
          {!validation.valid && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {validation.error}
            </div>
          )}

          {/* Template Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Load from Template</Label>
                <Select onValueChange={handleLoadTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a defect template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PREDEFINED_DEFECT_TEMPLATES.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{template.name}</span>
                          {template.origin && (
                            <Badge variant="outline" className="text-xs">
                              {template.origin}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Start with a preset template or build your own from scratch
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Primary Defects */}
          <DefectCategorySection
            category="primary"
            title="Primary Defects (Category 1)"
            description="Severe defects that significantly impact quality. Typically weight 1.00 each."
            defects={getDefectsByCategory(config.defects, 'primary')}
            onChange={(defects) => {
              const secondary = getDefectsByCategory(config.defects, 'secondary')
              handleConfigChange({
                ...config,
                defects: [...defects, ...secondary]
              })
            }}
          />

          {/* Secondary Defects */}
          <DefectCategorySection
            category="secondary"
            title="Secondary Defects (Category 2)"
            description="Minor defects with variable weights (typically 0.1 - 0.5)."
            defects={getDefectsByCategory(config.defects, 'secondary')}
            onChange={(defects) => {
              const primary = getDefectsByCategory(config.defects, 'primary')
              handleConfigChange({
                ...config,
                defects: [...primary, ...defects]
              })
            }}
          />

          {/* Validation Thresholds */}
          <DefectThresholdsSection
            thresholds={config.thresholds}
            onChange={(thresholds) => {
              handleConfigChange({
                ...config,
                thresholds
              })
            }}
            sampleSize={sampleSize}
          />

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Configuration Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Primary Defects</Label>
                  <p className="text-lg font-semibold">
                    {getDefectsByCategory(config.defects, 'primary').length}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Secondary Defects</Label>
                  <p className="text-lg font-semibold">
                    {getDefectsByCategory(config.defects, 'secondary').length}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Primary</Label>
                  <p className="text-lg font-semibold">
                    {config.thresholds.max_primary ?? 'Not set'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Secondary</Label>
                  <p className="text-lg font-semibold">
                    {config.thresholds.max_secondary ?? 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!validation.valid}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ========================================
// DEFECT CATEGORY SECTION
// ========================================

interface DefectCategorySectionProps {
  category: 'primary' | 'secondary'
  title: string
  description: string
  defects: DefectConfig[]
  onChange: (defects: DefectConfig[]) => void
}

function DefectCategorySection({
  category,
  title,
  description,
  defects,
  onChange
}: DefectCategorySectionProps) {
  const [newDefectName, setNewDefectName] = useState('')
  const [newDefectWeight, setNewDefectWeight] = useState(category === 'primary' ? '1.0' : '0.2')
  const [newDefectDescription, setNewDefectDescription] = useState('')

  const handleAddDefect = () => {
    if (!newDefectName.trim()) return

    const weight = parseFloat(newDefectWeight)
    if (isNaN(weight) || weight <= 0) return

    // Check for duplicates
    if (defects.some(d => d.name.toLowerCase() === newDefectName.trim().toLowerCase())) {
      return
    }

    const newDefect: DefectConfig = {
      name: newDefectName.trim(),
      weight,
      category,
      display_order: defects.length,
      description: newDefectDescription.trim() || undefined
    }

    onChange([...defects, newDefect])
    setNewDefectName('')
    setNewDefectWeight(category === 'primary' ? '1.0' : '0.2')
    setNewDefectDescription('')
  }

  const handleRemoveDefect = (index: number) => {
    const newDefects = defects
      .filter((_, i) => i !== index)
      .map((d, idx) => ({ ...d, display_order: idx }))
    onChange(newDefects)
  }

  const handleUpdateDefect = (index: number, field: keyof DefectConfig, value: any) => {
    const newDefects = [...defects]
    newDefects[index] = { ...newDefects[index], [field]: value }
    onChange(newDefects)
  }

  const handleMoveDefect = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === defects.length - 1)
    ) {
      return
    }

    const newDefects = [...defects]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    // Swap display_order
    const tempOrder = newDefects[index].display_order
    newDefects[index].display_order = newDefects[targetIndex].display_order
    newDefects[targetIndex].display_order = tempOrder

    // Swap positions
    ;[newDefects[index], newDefects[targetIndex]] = [newDefects[targetIndex], newDefects[index]]

    onChange(newDefects)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Defects */}
        <div className="space-y-2">
          <Label className="text-xs">Defined Defects ({defects.length})</Label>
          {defects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No {category} defects defined yet. Add defects below.
            </p>
          ) : (
            <div className="space-y-2">
              {defects.map((defect, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                >
                  {/* Drag/Move Handle */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMoveDefect(index, 'up')}
                      disabled={index === 0}
                      className="hover:text-primary disabled:opacity-30"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDefect(index, 'down')}
                      disabled={index === defects.length - 1}
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

                  {/* Name Input */}
                  <Input
                    value={defect.name}
                    onChange={(e) => handleUpdateDefect(index, 'name', e.target.value)}
                    placeholder="Defect name"
                    className="flex-1 h-8"
                  />

                  {/* Weight Input */}
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="10"
                      value={defect.weight}
                      onChange={(e) => handleUpdateDefect(index, 'weight', parseFloat(e.target.value))}
                      placeholder="Weight"
                      className="w-20 h-8"
                    />
                    <Label className="text-xs text-muted-foreground">×</Label>
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveDefect(index)}
                    className="hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Defect */}
        <div className="border-t pt-4 space-y-2">
          <Label className="text-xs">Add New {category === 'primary' ? 'Primary' : 'Secondary'} Defect</Label>
          <div className="grid grid-cols-1 md:grid-cols-[1fr,100px,auto] gap-2">
            <Input
              value={newDefectName}
              onChange={(e) => setNewDefectName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddDefect()}
              placeholder="Defect name (e.g., Full Black, Severe Broca)"
            />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={newDefectWeight}
                onChange={(e) => setNewDefectWeight(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddDefect()}
                placeholder="Weight"
              />
              <Label className="text-xs text-muted-foreground">×</Label>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddDefect}
              disabled={!newDefectName.trim() || !newDefectWeight}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {category === 'primary'
              ? 'Primary defects typically have weight 1.00 (full defect equivalent)'
              : 'Secondary defects have variable weights (e.g., 0.1 for minor, 0.5 for moderate)'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ========================================
// DEFECT THRESHOLDS SECTION
// ========================================

interface DefectThresholdsSectionProps {
  thresholds: DefectThresholds
  onChange: (thresholds: DefectThresholds) => void
  sampleSize: number
}

function DefectThresholdsSection({
  thresholds,
  onChange,
  sampleSize
}: DefectThresholdsSectionProps) {
  const handleThresholdChange = (field: keyof DefectThresholds, value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value)
    onChange({
      ...thresholds,
      [field]: numValue
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Validation Thresholds</CardTitle>
        <p className="text-xs text-muted-foreground">
          Set maximum allowed defect counts (full defect equivalents). Values are for {sampleSize}g sample.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="max_primary">Maximum Primary Defects</Label>
            <Input
              id="max_primary"
              type="number"
              step="0.01"
              min="0"
              value={thresholds.max_primary ?? ''}
              onChange={(e) => handleThresholdChange('max_primary', e.target.value)}
              placeholder="e.g., 5"
            />
            <p className="text-xs text-muted-foreground">
              Full defect equivalents allowed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_secondary">Maximum Secondary Defects</Label>
            <Input
              id="max_secondary"
              type="number"
              step="0.01"
              min="0"
              value={thresholds.max_secondary ?? ''}
              onChange={(e) => handleThresholdChange('max_secondary', e.target.value)}
              placeholder="e.g., 86"
            />
            <p className="text-xs text-muted-foreground">
              Full defect equivalents allowed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_total">Maximum Total Defects</Label>
            <Input
              id="max_total"
              type="number"
              step="0.01"
              min="0"
              value={thresholds.max_total ?? ''}
              onChange={(e) => handleThresholdChange('max_total', e.target.value)}
              placeholder="e.g., 91"
            />
            <p className="text-xs text-muted-foreground">
              Combined primary + secondary
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs">
          <p className="font-medium mb-1">How Defect Counting Works:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>Primary defects:</strong> Each defect × its weight (usually 1.00)</li>
            <li><strong>Secondary defects:</strong> Each defect × its weight (0.1 - 0.5)</li>
            <li><strong>Example:</strong> 3 Full Black (3×1.0 = 3) + 10 Severe Broca (10×0.2 = 2) = 5 total defects</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
