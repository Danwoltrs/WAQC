'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus, Check, AlertCircle } from 'lucide-react'
import {
  MicroRegion,
  MicroRegionRequirement,
  MicroRegionConfiguration,
  createOriginRequirement,
  validateMicroRegionConfiguration,
  getMicroRegionRequirementDisplayText,
  POPULAR_COFFEE_ORIGINS
} from '@/types/micro-region-configuration'

interface MicroRegionConfigManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: MicroRegionConfiguration
  onChange: (config: MicroRegionConfiguration) => void
}

export function MicroRegionConfigManager({
  open,
  onOpenChange,
  value,
  onChange
}: MicroRegionConfigManagerProps) {
  const [config, setConfig] = useState<MicroRegionConfiguration>(value)
  const [error, setError] = useState<string | null>(null)
  const [availableRegions, setAvailableRegions] = useState<{ [origin: string]: MicroRegion[] }>({})
  const [loadingRegions, setLoadingRegions] = useState(false)

  // Editing states
  const [editingOrigin, setEditingOrigin] = useState<string | null>(null)
  const [selectedOrigin, setSelectedOrigin] = useState<string>('')
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [allowMix, setAllowMix] = useState(true)
  const [percentageConstraints, setPercentageConstraints] = useState<{ [region: string]: { min?: number, max?: number } }>({})
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setConfig(value)
  }, [value])

  // Fetch available micro-regions from API
  useEffect(() => {
    if (!open) return

    async function fetchMicroRegions() {
      setLoadingRegions(true)
      try {
        const response = await fetch('/api/micro-regions')
        if (response.ok) {
          const data = await response.json()
          // Group by origin
          const grouped: { [origin: string]: MicroRegion[] } = {}
          for (const region of data.regions) {
            if (!grouped[region.origin]) {
              grouped[region.origin] = []
            }
            grouped[region.origin].push(region)
          }
          setAvailableRegions(grouped)
        }
      } catch (err) {
        console.error('Error fetching micro-regions:', err)
      } finally {
        setLoadingRegions(false)
      }
    }

    fetchMicroRegions()
  }, [open])

  const handleAddOriginRequirement = () => {
    if (!selectedOrigin) {
      setError('Please select an origin')
      return
    }

    // Check if origin already exists
    if (config.requirements.find(r => r.origin === selectedOrigin)) {
      setError(`Origin "${selectedOrigin}" already has a requirement`)
      return
    }

    const newReq: MicroRegionRequirement = {
      origin: selectedOrigin,
      required_micro_regions: selectedRegions,
      percentage_per_region: Object.keys(percentageConstraints).length > 0 ? percentageConstraints : undefined,
      allow_mix: allowMix,
      notes
    }

    const newConfig = {
      ...config,
      requirements: [...config.requirements, newReq]
    }

    setConfig(newConfig)
    setError(null)

    // Reset form
    setSelectedOrigin('')
    setSelectedRegions([])
    setPercentageConstraints({})
    setAllowMix(true)
    setNotes('')
    setEditingOrigin(null)
  }

  const handleEditOriginRequirement = (origin: string) => {
    const req = config.requirements.find(r => r.origin === origin)
    if (!req) return

    setEditingOrigin(origin)
    setSelectedOrigin(origin)
    setSelectedRegions(req.required_micro_regions)
    setAllowMix(req.allow_mix)
    setPercentageConstraints(req.percentage_per_region || {})
    setNotes(req.notes || '')
  }

  const handleUpdateOriginRequirement = () => {
    if (!editingOrigin) return

    const updatedConfig = {
      ...config,
      requirements: config.requirements.map(r =>
        r.origin === editingOrigin
          ? {
              origin: editingOrigin,
              required_micro_regions: selectedRegions,
              percentage_per_region: Object.keys(percentageConstraints).length > 0 ? percentageConstraints : undefined,
              allow_mix: allowMix,
              notes
            }
          : r
      )
    }

    setConfig(updatedConfig)
    setError(null)

    // Reset form
    setSelectedOrigin('')
    setSelectedRegions([])
    setPercentageConstraints({})
    setAllowMix(true)
    setNotes('')
    setEditingOrigin(null)
  }

  const handleRemoveOriginRequirement = (origin: string) => {
    setConfig({
      ...config,
      requirements: config.requirements.filter(r => r.origin !== origin)
    })
  }

  const handleToggleRegion = (regionName: string) => {
    if (selectedRegions.includes(regionName)) {
      setSelectedRegions(selectedRegions.filter(r => r !== regionName))
      // Remove percentage constraint
      const newConstraints = { ...percentageConstraints }
      delete newConstraints[regionName]
      setPercentageConstraints(newConstraints)
    } else {
      setSelectedRegions([...selectedRegions, regionName])
    }
  }

  const handleSetPercentageConstraint = (regionName: string, type: 'min' | 'max', value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value)

    if (numValue !== undefined && (numValue < 0 || numValue > 100)) {
      setError('Percentage must be between 0 and 100')
      return
    }

    setPercentageConstraints(prev => ({
      ...prev,
      [regionName]: {
        ...(prev[regionName] || {}),
        [type]: numValue
      }
    }))
    setError(null)
  }

  const handleSave = () => {
    const validation = validateMicroRegionConfiguration(config)
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
    setSelectedOrigin('')
    setSelectedRegions([])
    setPercentageConstraints({})
    setAllowMix(true)
    setNotes('')
    setEditingOrigin(null)
    onOpenChange(false)
  }

  const regionsForSelectedOrigin = availableRegions[selectedOrigin] || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Micro-Region Requirements</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Specify micro-region requirements per origin. You can require specific regions,
            set percentage constraints, and control whether mixing is allowed.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Existing Origin Requirements */}
          {config.requirements.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Configured Origins ({config.requirements.length})</Label>
              {config.requirements.map((req) => (
                <div
                  key={req.origin}
                  className="p-4 rounded-lg border bg-card space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="default">{req.origin}</Badge>
                        {req.allow_mix ? (
                          <Badge variant="secondary" className="text-xs">Mix Allowed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Single Region Only</Badge>
                        )}
                      </div>
                      {req.required_micro_regions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Any micro-region accepted</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Required Micro-Regions:</p>
                          <div className="flex flex-wrap gap-2">
                            {req.required_micro_regions.map((regionName) => (
                              <Badge key={regionName} variant="outline" className="text-xs">
                                {regionName}
                                {req.percentage_per_region?.[regionName] && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({req.percentage_per_region[regionName].min !== undefined && `≥${req.percentage_per_region[regionName].min}%`}
                                    {req.percentage_per_region[regionName].min !== undefined && req.percentage_per_region[regionName].max !== undefined && ' '}
                                    {req.percentage_per_region[regionName].max !== undefined && `≤${req.percentage_per_region[regionName].max}%`})
                                  </span>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {req.notes && (
                        <p className="text-xs text-muted-foreground italic">{req.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditOriginRequirement(req.origin)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOriginRequirement(req.origin)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit Origin Form */}
          <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
            <Label className="text-sm font-medium">
              {editingOrigin ? `Edit ${editingOrigin} Requirement` : 'Add New Origin Requirement'}
            </Label>

            {/* Origin Selection */}
            <div className="space-y-2">
              <Label className="text-xs">Origin</Label>
              <Select value={selectedOrigin} onValueChange={setSelectedOrigin} disabled={!!editingOrigin}>
                <SelectTrigger>
                  <SelectValue placeholder="Select origin..." />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_COFFEE_ORIGINS.filter(origin =>
                    !config.requirements.find(r => r.origin === origin) || origin === editingOrigin
                  ).map((origin) => (
                    <SelectItem key={origin} value={origin}>
                      {origin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Micro-Region Selection */}
            {selectedOrigin && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">
                    Micro-Regions {selectedRegions.length > 0 && `(${selectedRegions.length} selected)`}
                  </Label>
                  {loadingRegions ? (
                    <p className="text-sm text-muted-foreground">Loading micro-regions...</p>
                  ) : regionsForSelectedOrigin.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No micro-regions available for {selectedOrigin}. Leave empty to accept any region.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto p-3 rounded border bg-background">
                      {regionsForSelectedOrigin
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((region) => {
                          const isSelected = selectedRegions.includes(region.region_name_en)
                          return (
                            <div key={region.id} className="space-y-2">
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleRegion(region.region_name_en)}
                                  className="h-4 w-4 mt-0.5"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{region.region_name_en}</span>
                                    {region.parent_region && (
                                      <Badge variant="outline" className="text-xs">{region.parent_region}</Badge>
                                    )}
                                  </div>
                                  {region.description_en && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{region.description_en}</p>
                                  )}
                                  {region.altitude_min && region.altitude_max && (
                                    <p className="text-xs text-muted-foreground">
                                      Altitude: {region.altitude_min}-{region.altitude_max}m
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Percentage Constraints (only show if selected) */}
                              {isSelected && (
                                <div className="ml-7 grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Min %</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      placeholder="Optional"
                                      value={percentageConstraints[region.region_name_en]?.min ?? ''}
                                      onChange={(e) => handleSetPercentageConstraint(region.region_name_en, 'min', e.target.value)}
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Max %</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      placeholder="Optional"
                                      value={percentageConstraints[region.region_name_en]?.max ?? ''}
                                      onChange={(e) => handleSetPercentageConstraint(region.region_name_en, 'max', e.target.value)}
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>

                {/* Allow Mix Toggle */}
                <div className="flex items-start gap-3 p-3 rounded border bg-background">
                  <input
                    type="checkbox"
                    id="allow_mix"
                    checked={allowMix}
                    onChange={(e) => setAllowMix(e.target.checked)}
                    className="h-4 w-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <Label htmlFor="allow_mix" className="text-sm font-medium">
                      Allow Mixing Micro-Regions
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {allowMix
                        ? 'Sample can contain coffee from multiple micro-regions (blended)'
                        : 'Sample must be from a single micro-region only (single-origin)'}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label className="text-xs">Notes (Optional)</Label>
                  <Input
                    placeholder="e.g., 'At least 60% from Sul de Minas preferred'"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Add/Update Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={editingOrigin ? handleUpdateOriginRequirement : handleAddOriginRequirement}
                  className="w-full"
                >
                  {editingOrigin ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Update Requirement
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Requirement
                    </>
                  )}
                </Button>

                {editingOrigin && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingOrigin(null)
                      setSelectedOrigin('')
                      setSelectedRegions([])
                      setPercentageConstraints({})
                      setAllowMix(true)
                      setNotes('')
                    }}
                    className="w-full"
                  >
                    Cancel Edit
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
