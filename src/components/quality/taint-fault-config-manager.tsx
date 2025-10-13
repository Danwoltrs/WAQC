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
import { Plus, X, AlertCircle, CheckCircle2, Settings2 } from 'lucide-react'
import {
  TaintFaultConfiguration,
  TaintFaultDefinition,
  TaintFaultValidationRules,
  createTaintDefinition,
  createFaultDefinition,
  validateTaintFaultConfiguration,
  PREDEFINED_TAINT_FAULT_TEMPLATES,
  calculateTaintFaultStats
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
  const [editingScale, setEditingScale] = useState<{
    definition: TaintFaultDefinition
    category: 'taint' | 'fault'
  } | null>(null)

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
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Taint & Fault Configuration</DialogTitle>
            <DialogDescription>
              Define taints (mild off-flavors), faults (severe defects), intensity scales, and validation rules
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
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
                {stats.taint_count} Taints
              </Badge>
              <Badge variant="outline">
                {stats.fault_count} Faults
              </Badge>
              <Badge variant="outline">
                {stats.total_definitions} Total
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

            {/* Taints Section */}
            <TaintFaultSection
              title="Taints"
              description="Mild off-flavors that may be acceptable in certain grades"
              category="taint"
              definitions={config.taints}
              onAdd={() => {
                const newTaint = createTaintDefinition(`New Taint ${config.taints.length + 1}`, config.taints.length)
                handleConfigChange({
                  ...config,
                  taints: [...config.taints, newTaint]
                })
              }}
              onRemove={(id) => {
                handleConfigChange({
                  ...config,
                  taints: config.taints.filter(t => t.id !== id)
                })
              }}
              onUpdate={(id, updates) => {
                handleConfigChange({
                  ...config,
                  taints: config.taints.map(t => t.id === id ? { ...t, ...updates } : t)
                })
              }}
              onEditScale={(definition) => setEditingScale({ definition, category: 'taint' })}
            />

            {/* Faults Section */}
            <TaintFaultSection
              title="Faults"
              description="Severe sensory defects that typically result in rejection"
              category="fault"
              definitions={config.faults}
              onAdd={() => {
                const newFault = createFaultDefinition(`New Fault ${config.faults.length + 1}`, config.faults.length)
                handleConfigChange({
                  ...config,
                  faults: [...config.faults, newFault]
                })
              }}
              onRemove={(id) => {
                handleConfigChange({
                  ...config,
                  faults: config.faults.filter(f => f.id !== id)
                })
              }}
              onUpdate={(id, updates) => {
                handleConfigChange({
                  ...config,
                  faults: config.faults.map(f => f.id === id ? { ...f, ...updates } : f)
                })
              }}
              onEditScale={(definition) => setEditingScale({ definition, category: 'fault' })}
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

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scale Editor Dialog */}
      {editingScale && (
        <Dialog open={!!editingScale} onOpenChange={() => setEditingScale(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Intensity Scale: {editingScale.definition.name}</DialogTitle>
              <DialogDescription>
                Configure how intensity is measured for this {editingScale.category}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <ScaleBuilder
                value={editingScale.definition.scale}
                onChange={(newScale) => {
                  const category = editingScale.category === 'taint' ? 'taints' : 'faults'
                  handleConfigChange({
                    ...config,
                    [category]: config[category].map(d =>
                      d.id === editingScale.definition.id
                        ? { ...d, scale: newScale }
                        : d
                    )
                  })
                }}
                showTemplateSelector={true}
              />
            </div>

            <DialogFooter>
              <Button onClick={() => setEditingScale(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

interface TaintFaultSectionProps {
  title: string
  description: string
  category: 'taint' | 'fault'
  definitions: TaintFaultDefinition[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<TaintFaultDefinition>) => void
  onEditScale: (definition: TaintFaultDefinition) => void
}

function TaintFaultSection({
  title,
  description,
  category,
  definitions,
  onAdd,
  onRemove,
  onUpdate,
  onEditScale
}: TaintFaultSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add {title.slice(0, -1)}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {definitions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No {title.toLowerCase()} configured yet</p>
            <p className="text-xs mt-1">Click &quot;Add {title.slice(0, -1)}&quot; to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {definitions.map((definition, index) => (
              <div key={definition.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {index + 1}
                    </Badge>
                    <Input
                      value={definition.name}
                      onChange={(e) => onUpdate(definition.id, { name: e.target.value })}
                      placeholder={`${title.slice(0, -1)} name...`}
                      className="flex-1"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground min-w-[60px]">Scale:</Label>
                    <Badge variant="secondary" className="text-xs">
                      {definition.scale.type === 'numeric'
                        ? `${definition.scale.min}-${definition.scale.max} (${definition.scale.increment})`
                        : `${definition.scale.options.length} options`}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEditScale(definition)}
                      className="h-7 text-xs"
                    >
                      <Settings2 className="h-3 w-3 mr-1" />
                      Edit Scale
                    </Button>
                  </div>

                  <Input
                    value={definition.description || ''}
                    onChange={(e) => onUpdate(definition.id, { description: e.target.value })}
                    placeholder="Optional description..."
                    className="text-xs"
                  />
                </div>

                <button
                  onClick={() => onRemove(definition.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
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
                placeholder="e.g., Max 2 taints (intensity ≤3), max 1 fault"
              />
              <p className="text-xs text-muted-foreground">
                This message will be shown during QC grading to communicate requirements
              </p>
            </div>
          </>
        )}

        {/* Examples */}
        <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/50">
          <p className="font-medium">Common Validation Rules:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Zero tolerance (no taints/faults)</li>
            <li>Max 2 taints, max 1 fault</li>
            <li>1 taint allowed (intensity ≤3), no faults</li>
            <li>Max 3 combined defects with intensity caps</li>
            <li>Max 5 taints (≤7), max 2 faults (≤5)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
