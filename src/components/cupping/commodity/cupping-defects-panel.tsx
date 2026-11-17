'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Minus, Plus, X } from 'lucide-react'
import { TaintFaultDefect } from '@/types/taint-fault-configuration'

interface CuppingDefect {
  id: string
  name: string
  cups_affected: number
  intensity: number
  is_taint: boolean
}

interface CuppingDefectsPanelProps {
  sampleId: string
  cups: number
  availableDefects: string[]
  cuppingData: { defects: CuppingDefect[] } | undefined
  defectModalOpen: string | null
  setDefectModalOpen: (name: string | null) => void
  modalIntensity: number
  setModalIntensity: (value: number) => void
  modalCups: number
  setModalCups: (value: number) => void
  defectConfigsMap: Map<string, Map<string, TaintFaultDefect>>
  classifyDefectAsTaint: (config: TaintFaultDefect | undefined, intensity: number) => boolean
  isDefectOutOfSpec: (sampleId: string, defect: CuppingDefect) => { outOfSpec: boolean; reason: string }
  validateCuppingDefects: (sampleId: string) => { valid: boolean; errors: string[] }
  handleAddDefectClick: (defectName: string) => void
  handleAddDefectConfirm: (sampleId: string) => void
  removeDefect: (sampleId: string, defectId: string) => void
}

export function CuppingDefectsPanel({
  sampleId,
  cups,
  availableDefects,
  cuppingData,
  defectModalOpen,
  setDefectModalOpen,
  modalIntensity,
  setModalIntensity,
  modalCups,
  setModalCups,
  defectConfigsMap,
  classifyDefectAsTaint,
  isDefectOutOfSpec,
  validateCuppingDefects,
  handleAddDefectClick,
  handleAddDefectConfirm,
  removeDefect,
}: CuppingDefectsPanelProps) {
  return (
    <>
      {/* Defects Section */}
      <Card className="p-6 w-fit">
        {/* Add Defect Buttons */}
        {availableDefects.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {availableDefects.map(defectName => (
              <Popover
                key={defectName}
                open={defectModalOpen === defectName}
                onOpenChange={(open) => !open && setDefectModalOpen(null)}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddDefectClick(defectName)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {defectName}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="start">
                  {(() => {
                    const dConfig = defectConfigsMap.get(sampleId)?.get(defectName)
                    const step = dConfig?.increment ?? 0.5
                    const maxInt = dConfig?.max_intensity ?? 10
                    // Badge reflects the chosen intensity. An "always fault" defect
                    // (taint_range=null) is fault regardless of intensity.
                    const headerIsTaint = classifyDefectAsTaint(dConfig, modalIntensity)

                    return (
                  <div className="space-y-3">
                    {/* Defect Name Header */}
                    <div className="flex items-center justify-between pb-2 border-b">
                      <span className="text-sm font-medium">{defectName}</span>
                      <Badge
                        variant={headerIsTaint ? 'secondary' : 'destructive'}
                        className="text-[10px] px-2 py-0.5"
                      >
                        {headerIsTaint ? 'Taint' : 'Fault'}
                      </Badge>
                    </div>

                    {/* Intensity (applied to all affected cups) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Intensity</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 cursor-pointer"
                          onClick={() => setModalIntensity(Math.max(step, Math.round((modalIntensity - step) * 100) / 100))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          step={step}
                          value={modalIntensity}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v >= step && v <= maxInt) setModalIntensity(v)
                          }}
                          className="w-16 h-7 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={step}
                          max={maxInt}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 cursor-pointer"
                          onClick={() => setModalIntensity(Math.min(maxInt, Math.round((modalIntensity + step) * 100) / 100))}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="text-xs text-muted-foreground ml-2">0–{maxInt} scale</span>
                      </div>
                    </div>

                    {/* Cups affected */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Cups affected</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 cursor-pointer"
                          onClick={() => setModalCups(Math.max(1, modalCups - 1))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          step={1}
                          value={modalCups}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10)
                            if (!isNaN(v) && v >= 1 && v <= cups) setModalCups(v)
                          }}
                          className="w-16 h-7 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={1}
                          max={cups}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 cursor-pointer"
                          onClick={() => setModalCups(Math.min(cups, modalCups + 1))}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <button
                          type="button"
                          onClick={() => setModalCups(cups)}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline ml-2 cursor-pointer"
                        >
                          All {cups} cups
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleAddDefectConfirm(sampleId)}
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setDefectModalOpen(null)
                          setModalIntensity(1)
                          setModalCups(1)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                    )
                  })()}
                </PopoverContent>
              </Popover>
            ))}
          </div>
        )}

        {/* Active Defects List - Horizontal Display */}
        {cuppingData && cuppingData.defects.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {cuppingData.defects.map(defect => {
                // Check if this specific defect violates its tolerance
                const defectValidation = isDefectOutOfSpec(sampleId, defect)
                const isOutOfSpec = defectValidation.outOfSpec

                return (
                  <div
                    key={defect.id}
                    className={`flex items-center gap-2 text-sm px-2 py-1 rounded border ${
                      isOutOfSpec ? 'border-red-500/50 bg-red-500/10' : 'border-border bg-card'
                    }`}
                  >
                    <Badge
                      variant={defect.is_taint ? 'secondary' : 'destructive'}
                      className="text-[10px] px-1.5 py-0 h-5"
                    >
                      {defect.is_taint ? 'T' : 'F'}
                    </Badge>
                    <span className={`font-medium ${isOutOfSpec ? 'text-red-500' : ''}`}>
                      {defect.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {defect.cups_affected}/{cups} cups · I:{defect.intensity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 ml-1"
                      onClick={() => removeDefect(sampleId, defect.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )
              })}
            </div>

            {/* Show validation errors below defects if out of spec */}
            {(() => {
              const defectValidation = validateCuppingDefects(sampleId)
              if (!defectValidation.valid && defectValidation.errors.length > 0) {
                return (
                  <div className="mt-3 space-y-1">
                    {defectValidation.errors.map((error, idx) => (
                      <p key={idx} className="text-xs text-red-500">
                        {error}
                      </p>
                    ))}
                  </div>
                )
              }
              return null
            })()}
          </>
        )}

        {cuppingData && cuppingData.defects.length === 0 && availableDefects.length > 0 && (
          <div className="text-xs text-muted-foreground text-center py-2">
            Click a defect above to add
          </div>
        )}
      </Card>
    </>
  )
}
