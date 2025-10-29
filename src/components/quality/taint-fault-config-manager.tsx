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
import { Plus, X, AlertCircle, CheckCircle2, Settings2, GripVertical } from 'lucide-react'
import {
  TaintFaultConfiguration,
  TaintFaultDefect,
  TaintFaultValidationRules,
  createTaintFaultDefect,
  validateTaintFaultConfiguration,
  PREDEFINED_TAINT_FAULT_TEMPLATES,
  calculateTaintFaultStats,
  getTaintRange,
  getFaultRange
} from '@/types/taint-fault-configuration'
import { ScaleBuilder } from './scale-builder'
import { AttributeScaleType } from '@/types/attribute-scales'

interface TaintFaultConfigManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: TaintFaultConfiguration
  onChange: (config: TaintFaultConfiguration) => void
}

export function TaintFaultConfigManager({
  open,
  onOpenChange,
  value,
  onChange
}: TaintFaultConfigManagerProps) {
  const [config, setConfig] = useState<TaintFaultConfiguration>(value)
  const [error, setError] = useState<string | null>(null)
  const [editingDefect, setEditingDefect] = useState<TaintFaultDefect | null>(null)

  const handleConfigChange = (newConfig: TaintFaultConfiguration) => {
    setConfig(newConfig)
    setError(null)
  }

  const handleLoadTemplate = (templateId: string) => {
    const template = PREDEFINED_TAINT_FAULT_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      handleConfigChange(template.configuration)
    }
  }

  const handleSave = () => {
    const validation = validateTaintFaultConfiguration(config)
    if (!validation.valid) {
      setError(validation.error || 'Invalid configuration')
      return
    }

    onChange(config)
    onOpenChange(false)
  }

  const handleCancel = () => {
    setConfig(value) // Reset to original value
    setError(null)
    onOpenChange(false)
  }

  const stats = calculateTaintFaultStats(config)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Fixed Header */}
          <div className="shrink-0 border-b px-6 py-4 bg-background">
            <DialogHeader>
              <DialogTitle>Taint & Fault Configuration</DialogTitle>
              <DialogDescription>
                Define defects with intensity-based taint/fault classification. Low intensity = taint (mild), high intensity = fault (severe).
              </DialogDescription>
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
                <CardDescription>Start with a predefined template and customize as needed</CardDescription>
              </CardHeader>
              <CardContent>
                <Select onValueChange={handleLoadTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PREDEFINED_TAINT_FAULT_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} - {template.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline">
                {stats.defect_count || stats.total_definitions} Defects
              </Badge>
              {stats.zero_tolerance && (
                <Badge variant="destructive">
                  Zero Tolerance
                </Badge>
              )}
              {stats.has_validation_rules && !stats.zero_tolerance && (
                <Badge variant="secondary">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Rules Configured
                </Badge>
              )}
            </div>

            {/* Defects Section */}
            <DefectsSection
              defects={config.defects || []}
              onAdd={() => {
                const newDefect = createTaintFaultDefect(
                  `New Defect ${(config.defects || []).length + 1}`,
                  (config.defects || []).length
                )
                handleConfigChange({
                  ...config,
                  defects: [...(config.defects || []), newDefect]
                })
              }}
              onRemove={(id) => {
                handleConfigChange({
                  ...config,
                  defects: (config.defects || []).filter(d => d.id !== id)
                })
              }}
              onUpdate={(id, updates) => {
                handleConfigChange({
                  ...config,
                  defects: (config.defects || []).map(d => d.id === id ? { ...d, ...updates } : d)
                })
              }}
              onEditDefect={(defect) => setEditingDefect(defect)}
            />

            {/* Validation Rules */}
            <ValidationRulesSection
              rules={config.rules}
              onChange={(rules) => handleConfigChange({ ...config, rules })}
            />

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={config.notes || ''}
                  onChange={(e) => handleConfigChange({ ...config, notes: e.target.value })}
                  placeholder="Add any notes about this taint/fault configuration..."
                  className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background"
                />
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
                Save Configuration
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Defect Editor Dialog */}
      {editingDefect && (
        <Dialog open={!!editingDefect} onOpenChange={() => setEditingDefect(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
            <div className="shrink-0 border-b px-6 py-4 bg-background">
              <DialogHeader>
                <DialogTitle>Edit Defect: {editingDefect.name}</DialogTitle>
                <DialogDescription>
                  Configure intensity scale and taint/fault threshold
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0">
              {/* Scale Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Intensity Scale</CardTitle>
                  <CardDescription>
                    Define how intensity is measured for this defect
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScaleBuilder
                    value={editingDefect.intensity_scale}
                    onChange={(newScale) => {
                      handleConfigChange({
                        ...config,
                        defects: (config.defects || []).map(d =>
                          d.id === editingDefect.id
                            ? { ...d, intensity_scale: newScale }
                            : d
                        )
                      })
                      setEditingDefect({ ...editingDefect, intensity_scale: newScale })
                    }}
                    showTemplateSelector={true}
                  />
                </CardContent>
              </Card>

              {/* Threshold Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Taint/Fault Threshold</CardTitle>
                  <CardDescription>
                    Set where the defect transitions from taint to fault
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Threshold Value</Label>
                    <Input
                      type="number"
                      step={editingDefect.intensity_scale.type === 'numeric' ? editingDefect.intensity_scale.increment : 1}
                      min={editingDefect.intensity_scale.type === 'numeric' ? editingDefect.intensity_scale.min : 0}
                      max={editingDefect.intensity_scale.type === 'numeric' ? editingDefect.intensity_scale.max : editingDefect.intensity_scale.options.length}
                      value={editingDefect.taint_threshold}
                      onChange={(e) => {
                        const newThreshold = parseFloat(e.target.value)
                        handleConfigChange({
                          ...config,
                          defects: (config.defects || []).map(d =>
                            d.id === editingDefect.id
                              ? { ...d, taint_threshold: newThreshold }
                              : d
                          )
                        })
                        setEditingDefect({ ...editingDefect, taint_threshold: newThreshold })
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Intensity below this value = Taint • At or above = Fault
                    </p>
                  </div>

                  {/* Visual Range Display */}
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/30">
                    <div>
                      <Label className="text-xs text-muted-foreground">Taint Range (Mild)</Label>
                      <p className="text-sm font-medium mt-1">
                        {editingDefect.intensity_scale.type === 'numeric' ? (
                          `${editingDefect.intensity_scale.min} - ${(editingDefect.taint_threshold - editingDefect.intensity_scale.increment).toFixed(1)}`
                        ) : (
                          `Options 0-${editingDefect.taint_threshold - 1}`
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Fault Range (Severe)</Label>
                      <p className="text-sm font-medium mt-1">
                        {editingDefect.intensity_scale.type === 'numeric' ? (
                          `${editingDefect.taint_threshold} - ${editingDefect.intensity_scale.max}`
                        ) : (
                          `Options ${editingDefect.taint_threshold}-${editingDefect.intensity_scale.options.length - 1}`
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="shrink-0 border-t px-6 py-4 bg-background">
              <DialogFooter>
                <Button onClick={() => setEditingDefect(null)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

interface DefectsSectionProps {
  defects: TaintFaultDefect[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<TaintFaultDefect>) => void
  onEditDefect: (defect: TaintFaultDefect) => void
}

function DefectsSection({
  defects,
  onAdd,
  onRemove,
  onUpdate,
  onEditDefect
}: DefectsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Defects</CardTitle>
            <CardDescription>
              Each defect can be classified as taint or fault based on intensity
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Defect
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {defects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No defects configured yet</p>
            <p className="text-xs mt-1">Click &quot;Add Defect&quot; to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {defects.map((defect, index) => {
              const taintRange = getTaintRange(defect)
              const faultRange = getFaultRange(defect)

              return (
                <Card key={defect.id} className="relative">
                  <button
                    onClick={() => onRemove(defect.id)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors z-10"
                  >
                    <X className="h-3 w-3" />
                  </button>

                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                      <Input
                        value={defect.name}
                        onChange={(e) => onUpdate(defect.id, { name: e.target.value })}
                        placeholder="Defect name (e.g., Fermented, Moldy)..."
                        className="h-8 text-sm flex-1"
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    {/* Intensity Scale Info */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Scale Type</Label>
                        <Badge variant="secondary" className="text-xs w-full justify-center">
                          {defect.intensity_scale.type === 'numeric'
                            ? `${defect.intensity_scale.min}-${defect.intensity_scale.max}`
                            : `${defect.intensity_scale.options.length} options`}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Threshold</Label>
                        <Badge variant="secondary" className="text-xs w-full justify-center">
                          {defect.taint_threshold}
                        </Badge>
                      </div>
                    </div>

                    {/* Taint/Fault Ranges */}
                    <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-muted/30 text-xs">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Taint (Mild)</Label>
                        <p className="font-medium">
                          {defect.intensity_scale.type === 'numeric'
                            ? `${taintRange.min.toFixed(1)}-${taintRange.max.toFixed(1)}`
                            : `Opt ${taintRange.min}-${taintRange.max}`}
                        </p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Fault (Severe)</Label>
                        <p className="font-medium">
                          {defect.intensity_scale.type === 'numeric'
                            ? `${faultRange.min.toFixed(1)}-${faultRange.max.toFixed(1)}`
                            : `Opt ${faultRange.min}-${faultRange.max}`}
                        </p>
                      </div>
                    </div>

                    {/* Edit Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEditDefect(defect)}
                      className="w-full h-8 text-xs"
                    >
                      <Settings2 className="h-3 w-3 mr-1" />
                      Edit Scale & Threshold
                    </Button>

                    {/* Description */}
                    <Input
                      value={defect.description || ''}
                      onChange={(e) => onUpdate(defect.id, { description: e.target.value })}
                      placeholder="Description (optional)"
                      className="text-xs h-8"
                    />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ValidationRulesSectionProps {
  rules: TaintFaultValidationRules
  onChange: (rules: TaintFaultValidationRules) => void
}

function ValidationRulesSection({ rules, onChange }: ValidationRulesSectionProps) {
  const [zeroTolerance, setZeroTolerance] = useState(rules.zero_tolerance || false)

  const handleZeroToleranceChange = (enabled: boolean) => {
    setZeroTolerance(enabled)
    if (enabled) {
      // Clear other rules when zero tolerance is enabled
      onChange({
        zero_tolerance: true,
        validation_message: rules.validation_message || 'Zero tolerance: No taints or faults acceptable'
      })
    } else {
      onChange({
        ...rules,
        zero_tolerance: false
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Validation Rules</CardTitle>
        <CardDescription>
          Define acceptance criteria for taints and faults
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Zero Tolerance Toggle */}
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <input
            type="checkbox"
            id="zero_tolerance"
            checked={zeroTolerance}
            onChange={(e) => handleZeroToleranceChange(e.target.checked)}
            className="h-4 w-4"
          />
          <div className="flex-1">
            <Label htmlFor="zero_tolerance" className="font-medium cursor-pointer">
              Zero Tolerance Mode
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              No taints or faults acceptable (premium quality)
            </p>
          </div>
        </div>

        {!zeroTolerance && (
          <>
            {/* Count Limits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max_taints" className="text-sm">Max Taints Allowed</Label>
                <Input
                  id="max_taints"
                  type="number"
                  min="0"
                  value={rules.max_taints ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      max_taints: e.target.value ? parseInt(e.target.value) : undefined
                    })
                  }
                  placeholder="No limit"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_faults" className="text-sm">Max Faults Allowed</Label>
                <Input
                  id="max_faults"
                  type="number"
                  min="0"
                  value={rules.max_faults ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      max_faults: e.target.value ? parseInt(e.target.value) : undefined
                    })
                  }
                  placeholder="No limit"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_combined" className="text-sm">Max Combined Total</Label>
                <Input
                  id="max_combined"
                  type="number"
                  min="0"
                  value={rules.max_combined ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      max_combined: e.target.value ? parseInt(e.target.value) : undefined
                    })
                  }
                  placeholder="No limit"
                />
              </div>
            </div>

            {/* Intensity Limits */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max_taint_intensity" className="text-sm">
                  Max Taint Intensity
                </Label>
                <Input
                  id="max_taint_intensity"
                  type="number"
                  min="1"
                  step="0.5"
                  value={rules.max_taint_intensity ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      max_taint_intensity: e.target.value ? parseFloat(e.target.value) : undefined
                    })
                  }
                  placeholder="No limit"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum intensity score allowed for any single taint
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_fault_intensity" className="text-sm">
                  Max Fault Intensity
                </Label>
                <Input
                  id="max_fault_intensity"
                  type="number"
                  min="1"
                  step="0.5"
                  value={rules.max_fault_intensity ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      max_fault_intensity: e.target.value ? parseFloat(e.target.value) : undefined
                    })
                  }
                  placeholder="No limit"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum intensity score allowed for any single fault
                </p>
              </div>
            </div>

            {/* Validation Message */}
            <div className="space-y-2">
              <Label htmlFor="validation_message" className="text-sm">
                Custom Validation Message
              </Label>
              <Input
                id="validation_message"
                value={rules.validation_message || ''}
                onChange={(e) =>
                  onChange({
                    ...rules,
                    validation_message: e.target.value
                  })
                }
                placeholder="e.g., Max 2 taints (intensity <4), max 1 fault"
              />
              <p className="text-xs text-muted-foreground">
                This message will be shown during QC grading to communicate requirements
              </p>
            </div>
          </>
        )}

        {/* Info Box */}
        <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/50">
          <p className="font-medium">How Intensity-Based Classification Works:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Each defect has an intensity scale (e.g., 1-10)</li>
            <li>A threshold separates taint from fault (e.g., threshold = 4)</li>
            <li>Intensity below threshold = classified as taint (mild)</li>
            <li>Intensity at/above threshold = classified as fault (severe)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
