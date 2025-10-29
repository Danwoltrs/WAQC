'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, X, AlertCircle, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  TaintFaultConfiguration,
  TaintFaultDefect,
  createTaintFaultDefect,
  validateTaintFaultConfiguration,
  PREDEFINED_TAINT_FAULT_TEMPLATES,
  isAlwaysFault
} from '@/types/taint-fault-configuration'

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
  // Ensure backward compatibility with old templates
  const normalizedValue: TaintFaultConfiguration = {
    defects: value.defects || [],
    deduction_formula: value.deduction_formula || {
      taint_multiplier: 0.5,
      fault_multiplier: 2.0
    },
    rules: value.rules || {},
    notes: value.notes || '',
    // Keep legacy fields if they exist
    taints: value.taints,
    faults: value.faults
  }

  const [config, setConfig] = useState<TaintFaultConfiguration>(normalizedValue)
  const [error, setError] = useState<string | null>(null)
  const [editingDefectId, setEditingDefectId] = useState<string | null>(null)
  const [rulesExpanded, setRulesExpanded] = useState(false)

  // Update config when value prop changes (e.g., when editing existing template)
  useEffect(() => {
    const normalized: TaintFaultConfiguration = {
      defects: value.defects || [],
      deduction_formula: value.deduction_formula || {
        taint_multiplier: 0.5,
        fault_multiplier: 2.0
      },
      rules: value.rules || {},
      notes: value.notes || '',
      taints: value.taints,
      faults: value.faults
    }
    setConfig(normalized)
  }, [value])

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

  const handleAddDefect = () => {
    const newDefect = createTaintFaultDefect(
      `New Defect ${config.defects.length + 1}`,
      config.defects.length
    )
    handleConfigChange({
      ...config,
      defects: [...config.defects, newDefect]
    })
  }

  const handleRemoveDefect = (id: string) => {
    handleConfigChange({
      ...config,
      defects: config.defects.filter(d => d.id !== id)
    })
  }

  const handleUpdateDefect = (id: string, updates: Partial<TaintFaultDefect>) => {
    handleConfigChange({
      ...config,
      defects: config.defects.map(d => d.id === id ? { ...d, ...updates } : d)
    })
  }

  const handleToggleActive = (id: string) => {
    const defect = config.defects.find(d => d.id === id)
    if (defect) {
      handleUpdateDefect(id, { active: !defect.active })
    }
  }

  const handleMakeAlwaysFault = (id: string) => {
    const defect = config.defects.find(d => d.id === id)
    if (defect && defect.taint_range) {
      // Convert to always-fault by removing taint range and adjusting fault range
      handleUpdateDefect(id, {
        taint_range: null,
        fault_range: { min: 1, max: defect.max_intensity }
      })
    }
  }

  const handleMakeTaintFault = (id: string) => {
    const defect = config.defects.find(d => d.id === id)
    if (defect && !defect.taint_range) {
      // Convert to taint/fault by adding default taint range
      const mid = Math.floor(defect.max_intensity / 2)
      handleUpdateDefect(id, {
        taint_range: { min: 0, max: mid },
        fault_range: { min: mid + 1, max: defect.max_intensity }
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Fixed Header */}
        <div className="shrink-0 border-b px-6 py-4 bg-background">
          <DialogHeader>
            <DialogTitle>Edit Defect Registry & Thresholds</DialogTitle>
            <DialogDescription>
              Configure which defects to track and their taint/fault intensity ranges
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
              <CardDescription>Start with a predefined template</CardDescription>
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

          {/* Defects Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Registered Defects for this Quality Template</CardTitle>
                </div>
                <Button size="sm" onClick={handleAddDefect}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Defect
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {config.defects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No defects configured yet</p>
                  <p className="text-xs mt-1">Click &quot;Add Defect&quot; to get started</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium text-sm">Defect Name</th>
                        <th className="text-center p-3 font-medium text-sm">Taint Range</th>
                        <th className="text-center p-3 font-medium text-sm">Fault Range</th>
                        <th className="text-center p-3 font-medium text-sm">Max Intensity</th>
                        <th className="text-center p-3 font-medium text-sm">Active</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {config.defects.map((defect, index) => (
                        <tr key={defect.id} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <td className="p-3">
                            <Input
                              value={defect.name}
                              onChange={(e) => handleUpdateDefect(defect.id, { name: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="p-3 text-center">
                            {editingDefectId === defect.id ? (
                              <div className="flex items-center justify-center gap-2">
                                {defect.taint_range ? (
                                  <>
                                    <Input
                                      type="number"
                                      value={defect.taint_range.min}
                                      onChange={(e) => {
                                        const newMin = parseInt(e.target.value)
                                        handleUpdateDefect(defect.id, {
                                          taint_range: { ...defect.taint_range!, min: newMin }
                                        })
                                      }}
                                      className="h-7 w-16 text-xs text-center"
                                    />
                                    <span className="text-xs">-</span>
                                    <Input
                                      type="number"
                                      value={defect.taint_range.max}
                                      onChange={(e) => {
                                        const newMax = parseInt(e.target.value)
                                        handleUpdateDefect(defect.id, {
                                          taint_range: { ...defect.taint_range!, max: newMax }
                                        })
                                      }}
                                      className="h-7 w-16 text-xs text-center"
                                    />
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleMakeTaintFault(defect.id)}
                                    className="h-6 text-xs"
                                  >
                                    Add Taint Range
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingDefectId(defect.id)}
                                className="text-sm hover:underline"
                              >
                                {defect.taint_range ? `${defect.taint_range.min} - ${defect.taint_range.max}` : '-'}
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {editingDefectId === defect.id ? (
                              <div className="flex items-center justify-center gap-2">
                                <Input
                                  type="number"
                                  value={defect.fault_range.min}
                                  onChange={(e) => {
                                    const newMin = parseInt(e.target.value)
                                    handleUpdateDefect(defect.id, {
                                      fault_range: { ...defect.fault_range, min: newMin }
                                    })
                                  }}
                                  className="h-7 w-16 text-xs text-center"
                                />
                                <span className="text-xs">-</span>
                                <Input
                                  type="number"
                                  value={defect.fault_range.max}
                                  onChange={(e) => {
                                    const newMax = parseInt(e.target.value)
                                    handleUpdateDefect(defect.id, {
                                      fault_range: { ...defect.fault_range, max: newMax }
                                    })
                                  }}
                                  className="h-7 w-16 text-xs text-center"
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingDefectId(defect.id)}
                                className="text-sm hover:underline"
                              >
                                {defect.fault_range.min} - {defect.fault_range.max}
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {editingDefectId === defect.id ? (
                              <Input
                                type="number"
                                value={defect.max_intensity}
                                onChange={(e) => {
                                  const newMax = parseInt(e.target.value)
                                  handleUpdateDefect(defect.id, { max_intensity: newMax })
                                }}
                                className="h-7 w-16 text-xs text-center mx-auto"
                              />
                            ) : (
                              <button
                                onClick={() => setEditingDefectId(defect.id)}
                                className="text-sm hover:underline"
                              >
                                {defect.max_intensity}
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleToggleActive(defect.id)}
                              className={`inline-flex items-center justify-center w-5 h-5 rounded border ${
                                defect.active ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                              }`}
                            >
                              {defect.active && <Check className="h-3 w-3 text-primary-foreground" />}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleRemoveDefect(defect.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {editingDefectId && (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingDefectId(null)}
                  >
                    Done Editing
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rules Section */}
          <Card>
            <CardHeader
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setRulesExpanded(!rulesExpanded)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Sample Validation Rules</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {config.rules.zero_tolerance && 'Zero tolerance mode'}
                    {config.rules.max_taints && `Max ${config.rules.max_taints} taint${config.rules.max_taints > 1 ? 's' : ''}`}
                    {config.rules.max_taints && config.rules.max_faults && ', '}
                    {config.rules.max_faults !== undefined && `Max ${config.rules.max_faults} fault${config.rules.max_faults > 1 ? 's' : ''}`}
                    {config.rules.max_combined && `Max ${config.rules.max_combined} combined`}
                    {!config.rules.zero_tolerance && !config.rules.max_taints && !config.rules.max_faults && !config.rules.max_combined && 'No limits configured'}
                  </CardDescription>
                </div>
                {rulesExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>

            {rulesExpanded && (
              <CardContent className="space-y-6">
                {/* Static Explanation */}
                <div>
                  <p className="text-sm font-medium mb-2">How it works:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Intensity 0 = No defect present</li>
                    <li>Taint Range = Minor defect, sample may still pass</li>
                    <li>Fault Range = Major defect, sample typically fails</li>
                    <li>Some defects are ALWAYS faults (e.g., {config.defects.filter(isAlwaysFault).map(d => d.name).join(', ') || 'None'})</li>
                  </ul>

                  <div className="mt-3 p-3 bg-muted/30 rounded-md">
                    <p className="text-sm font-medium mb-1">Example:</p>
                    <p className="text-xs text-muted-foreground">&quot;Green&quot; defect at intensity 2 = Taint (acceptable)</p>
                    <p className="text-xs text-muted-foreground">&quot;Green&quot; defect at intensity 3 = Fault (reject sample)</p>
                  </div>
                </div>

                {/* Editable Validation Rules */}
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Acceptance Criteria:</p>

                  <div className="space-y-4">
                    {/* Zero Tolerance Toggle */}
                    <div className="flex items-center space-x-3 p-3 border rounded-md bg-muted/10">
                      <Checkbox
                        id="zero_tolerance"
                        checked={config.rules.zero_tolerance || false}
                        onCheckedChange={(checked) => {
                          handleConfigChange({
                            ...config,
                            rules: {
                              ...config.rules,
                              zero_tolerance: checked as boolean,
                              // Clear other limits when enabling zero tolerance
                              ...(checked ? { max_taints: undefined, max_faults: undefined, max_combined: undefined } : {})
                            }
                          })
                        }}
                      />
                      <div className="flex-1">
                        <Label htmlFor="zero_tolerance" className="text-sm font-medium cursor-pointer">
                          Zero Tolerance Mode
                        </Label>
                        <p className="text-xs text-muted-foreground">No taints or faults acceptable</p>
                      </div>
                    </div>

                    {!config.rules.zero_tolerance && (
                      <>
                        {/* Count Limits */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="max_taints" className="text-sm">Max Taints</Label>
                            <Input
                              id="max_taints"
                              type="number"
                              min="0"
                              placeholder="No limit"
                              value={config.rules.max_taints ?? ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                                handleConfigChange({
                                  ...config,
                                  rules: { ...config.rules, max_taints: value }
                                })
                              }}
                              className="h-9"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="max_faults" className="text-sm">Max Faults</Label>
                            <Input
                              id="max_faults"
                              type="number"
                              min="0"
                              placeholder="No limit"
                              value={config.rules.max_faults ?? ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                                handleConfigChange({
                                  ...config,
                                  rules: { ...config.rules, max_faults: value }
                                })
                              }}
                              className="h-9"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="max_combined" className="text-sm">Max Combined</Label>
                            <Input
                              id="max_combined"
                              type="number"
                              min="0"
                              placeholder="No limit"
                              value={config.rules.max_combined ?? ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                                handleConfigChange({
                                  ...config,
                                  rules: { ...config.rules, max_combined: value }
                                })
                              }}
                              className="h-9"
                            />
                          </div>
                        </div>

                        {/* Intensity Limits */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="max_taint_intensity" className="text-sm">Max Taint Intensity</Label>
                            <Input
                              id="max_taint_intensity"
                              type="number"
                              min="1"
                              placeholder="No limit"
                              value={config.rules.max_taint_intensity ?? ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                                handleConfigChange({
                                  ...config,
                                  rules: { ...config.rules, max_taint_intensity: value }
                                })
                              }}
                              className="h-9"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="max_fault_intensity" className="text-sm">Max Fault Intensity</Label>
                            <Input
                              id="max_fault_intensity"
                              type="number"
                              min="1"
                              placeholder="No limit"
                              value={config.rules.max_fault_intensity ?? ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                                handleConfigChange({
                                  ...config,
                                  rules: { ...config.rules, max_fault_intensity: value }
                                })
                              }}
                              className="h-9"
                            />
                          </div>
                        </div>

                        {/* Validation Message */}
                        <div className="space-y-2">
                          <Label htmlFor="validation_message" className="text-sm">Custom Validation Message</Label>
                          <Input
                            id="validation_message"
                            placeholder="e.g., 'SCA standard: Max 2 taints, max 1 fault'"
                            value={config.rules.validation_message ?? ''}
                            onChange={(e) => {
                              const value = e.target.value || undefined
                              handleConfigChange({
                                ...config,
                                rules: { ...config.rules, validation_message: value }
                              })
                            }}
                            className="h-9"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Deduction Formula */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deduction Formula:</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 border rounded-md bg-muted/20 space-y-4">
                <p className="text-sm font-mono">
                  Points deducted = (Cups affected / Total cups) × Intensity × Multiplier
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taint_multiplier" className="text-sm">Taint Multiplier:</Label>
                    <Input
                      id="taint_multiplier"
                      type="number"
                      step="0.1"
                      value={config.deduction_formula.taint_multiplier}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value)
                        handleConfigChange({
                          ...config,
                          deduction_formula: {
                            ...config.deduction_formula,
                            taint_multiplier: newValue
                          }
                        })
                      }}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fault_multiplier" className="text-sm">Fault Multiplier:</Label>
                    <Input
                      id="fault_multiplier"
                      type="number"
                      step="0.1"
                      value={config.deduction_formula.fault_multiplier}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value)
                        handleConfigChange({
                          ...config,
                          deduction_formula: {
                            ...config.deduction_formula,
                            fault_multiplier: newValue
                          }
                        })
                      }}
                      className="h-9"
                    />
                  </div>
                </div>
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
              Save Configuration
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
