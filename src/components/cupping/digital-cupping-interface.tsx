'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Minus, Plus, X, Save } from 'lucide-react'
import { AttributeWithScale } from '@/types/cupping-templates'
import { AttributeScaleType } from '@/types/attribute-scales'

// Defect with intensity-based classification
interface Defect {
  id: string
  name: string
  cups_affected: number
  intensity: number // 1-7 scale
  is_taint: boolean // calculated based on intensity
}

// Single attribute score
interface AttributeScore {
  attribute: string
  value: number | null
}

// Sample being cupped
interface CuppingSample {
  id: string
  tracking_number: string
  sample_type: 'type' | 'pss' | 'ss'
}

// Quality template with defects config
interface CuppingTemplate {
  name: string
  attributes: AttributeWithScale[]
  defects: string[] // Available defect names
  taint_threshold: number // e.g., 3 (1-3 = taint, 4+ = fault)
  max_intensity: number // e.g., 7
  cups_per_sample: number
}

interface DigitalCuppingInterfaceProps {
  samples: CuppingSample[]
  template: CuppingTemplate
  onSave: (sampleId: string, scores: AttributeScore[], defects: Defect[]) => Promise<void>
}

export function DigitalCuppingInterface({
  samples,
  template,
  onSave,
}: DigitalCuppingInterfaceProps) {
  const [activeSampleId, setActiveSampleId] = useState(samples[0]?.id || '')
  const [scores, setScores] = useState<Record<string, AttributeScore[]>>({})
  const [defects, setDefects] = useState<Record<string, Defect[]>>({})
  const [selectedDefectForEdit, setSelectedDefectForEdit] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Mobile-specific state
  const [selectedAttributeForEdit, setSelectedAttributeForEdit] = useState<string | null>(null)
  const [showDefectSelector, setShowDefectSelector] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Initialize scores for all samples
  useEffect(() => {
    const initialScores: Record<string, AttributeScore[]> = {}
    const initialDefects: Record<string, Defect[]> = {}

    samples.forEach(sample => {
      initialScores[sample.id] = template.attributes.map(attr => ({
        attribute: attr.attribute,
        value: null,
      }))
      initialDefects[sample.id] = []
    })

    setScores(initialScores)
    setDefects(initialDefects)
  }, [samples, template])

  // Get current sample data
  const activeSample = samples.find(s => s.id === activeSampleId)
  const activeSampleScores = scores[activeSampleId] || []
  const activeSampleDefects = defects[activeSampleId] || []

  // Update attribute score
  const updateScore = (attribute: string, value: number) => {
    setScores(prev => ({
      ...prev,
      [activeSampleId]: prev[activeSampleId].map(score =>
        score.attribute === attribute ? { ...score, value } : score
      ),
    }))
  }

  // Add defect
  const addDefect = (defectName: string) => {
    const newDefect: Defect = {
      id: `${activeSampleId}-${defectName}-${Date.now()}`,
      name: defectName,
      cups_affected: 0,
      intensity: 0,
      is_taint: true, // Default to taint
    }

    setDefects(prev => ({
      ...prev,
      [activeSampleId]: [...(prev[activeSampleId] || []), newDefect],
    }))

    setSelectedDefectForEdit(newDefect.id)
  }

  // Update defect
  const updateDefect = (defectId: string, updates: Partial<Defect>) => {
    setDefects(prev => ({
      ...prev,
      [activeSampleId]: prev[activeSampleId].map(d => {
        if (d.id === defectId) {
          const updatedDefect = { ...d, ...updates }
          // Auto-calculate taint/fault based on intensity
          if (updates.intensity !== undefined) {
            updatedDefect.is_taint = updates.intensity <= template.taint_threshold
          }
          return updatedDefect
        }
        return d
      }),
    }))
  }

  // Remove defect
  const removeDefect = (defectId: string) => {
    setDefects(prev => ({
      ...prev,
      [activeSampleId]: prev[activeSampleId].filter(d => d.id !== defectId),
    }))
    if (selectedDefectForEdit === defectId) {
      setSelectedDefectForEdit(null)
    }
  }

  // Calculate clean cup and uniformity
  const calculateSummary = () => {
    const totalCups = template.cups_per_sample
    const cupsWithDefects = activeSampleDefects.reduce(
      (sum, d) => sum + d.cups_affected,
      0
    )
    const cleanCups = Math.max(0, totalCups - cupsWithDefects)
    const uniformCups = activeSampleDefects.length === 0 ? totalCups : 0

    const taints = activeSampleDefects.filter(d => d.is_taint).length
    const faults = activeSampleDefects.filter(d => !d.is_taint).length

    return { cleanCups, uniformCups, taints, faults, totalCups }
  }

  const summary = calculateSummary()

  // Increment/decrement helpers
  const incrementScore = (attribute: string, scale: AttributeScaleType) => {
    if (scale.type !== 'numeric') return
    const current = activeSampleScores.find(s => s.attribute === attribute)?.value || scale.min
    const newValue = Math.min(scale.max, current + scale.increment)
    updateScore(attribute, newValue)
  }

  const decrementScore = (attribute: string, scale: AttributeScaleType) => {
    if (scale.type !== 'numeric') return
    const current = activeSampleScores.find(s => s.attribute === attribute)?.value || scale.min
    const newValue = Math.max(scale.min, current - scale.increment)
    updateScore(attribute, newValue)
  }

  // Save scores
  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(activeSampleId, activeSampleScores, activeSampleDefects)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header with Sample Tabs */}
      <div className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="flex-1">
            <TabsList className="inline-flex">
              {samples.map(sample => (
                <TabsTrigger key={sample.id} value={sample.id}>
                  {sample.tracking_number}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Template Info */}
          <div className="text-sm text-muted-foreground">
            {template.name} • {template.cups_per_sample} cups per sample
          </div>

          {/* Attributes Section */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Attributes</h2>

            {/* Desktop Layout - 2 Column Grid with Sliders */}
            {!isMobile && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {template.attributes.map(({ attribute, scale }) => {
                  if (scale.type !== 'numeric') return null

                  const score = activeSampleScores.find(s => s.attribute === attribute)
                  const value = score?.value ?? scale.min

                  return (
                    <div key={attribute} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">{attribute}</label>
                        <span className="text-sm text-muted-foreground">
                          ({scale.min} - {scale.max}, {scale.increment})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Slider
                          value={[value]}
                          onValueChange={([v]) => updateScore(attribute, v)}
                          min={scale.min}
                          max={scale.max}
                          step={scale.increment}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => decrementScore(attribute, scale)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => incrementScore(attribute, scale)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <input
                          type="number"
                          value={value}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v >= scale.min && v <= scale.max) {
                              updateScore(attribute, v)
                            }
                          }}
                          className="w-16 px-2 py-1 text-center border rounded text-sm"
                          step={scale.increment}
                          min={scale.min}
                          max={scale.max}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Mobile Layout - Compact List with Tap-to-Edit */}
            {isMobile && (
              <div className="space-y-3">
                {template.attributes.map(({ attribute, scale }) => {
                  if (scale.type !== 'numeric') return null

                  const score = activeSampleScores.find(s => s.attribute === attribute)
                  const value = score?.value ?? scale.min

                  return (
                    <button
                      key={attribute}
                      onClick={() => setSelectedAttributeForEdit(attribute)}
                      className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <span className="text-sm font-medium">{attribute}</span>
                      <span className="text-lg font-semibold">{value.toFixed(2)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Defects Section */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Defects</h2>

            {/* Desktop: Defect Button Grid */}
            {!isMobile && (
              <div className="flex flex-wrap gap-2 mb-6">
                {template.defects.map(defectName => (
                  <Button
                    key={defectName}
                    variant="outline"
                    size="sm"
                    onClick={() => addDefect(defectName)}
                  >
                    {defectName}
                  </Button>
                ))}
              </div>
            )}

            {/* Mobile: "+ Add Defect" Button */}
            {isMobile && activeSampleDefects.length === 0 && (
              <Button
                variant="outline"
                className="w-full mb-4"
                onClick={() => setShowDefectSelector(true)}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Defect
              </Button>
            )}

            {/* Active Defects */}
            {activeSampleDefects.length > 0 && (
              <div className="space-y-4">
                {/* Mobile: "+ Add Another Defect" Button */}
                {isMobile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowDefectSelector(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Another Defect
                  </Button>
                )}

                {activeSampleDefects.map(defect => (
                  <div
                    key={defect.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={defect.is_taint ? 'secondary' : 'destructive'}>
                          {defect.is_taint ? '🟢 TAINT' : '🔴 FAULT'}
                        </Badge>
                        <span className="font-medium">{defect.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDefect(defect.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Desktop: Show full sliders and buttons */}
                    {!isMobile && (
                      <>
                        {/* Cups Affected */}
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">
                            Cups Affected ({defect.cups_affected} of {template.cups_per_sample})
                          </label>
                          <div className="flex items-center gap-3">
                            <Slider
                              value={[defect.cups_affected]}
                              onValueChange={([v]) => updateDefect(defect.id, { cups_affected: v })}
                              min={0}
                              max={template.cups_per_sample}
                              step={1}
                              className="flex-1"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateDefect(defect.id, { cups_affected: Math.max(0, defect.cups_affected - 1) })}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateDefect(defect.id, { cups_affected: Math.min(template.cups_per_sample, defect.cups_affected + 1) })}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <span className="w-12 text-center text-sm font-medium">
                              {defect.cups_affected}
                            </span>
                          </div>
                        </div>

                        {/* Intensity */}
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">
                            Intensity ({defect.intensity} of {template.max_intensity})
                          </label>
                          <div className="flex items-center gap-3">
                            <Slider
                              value={[defect.intensity]}
                              onValueChange={([v]) => updateDefect(defect.id, { intensity: v })}
                              min={0}
                              max={template.max_intensity}
                              step={1}
                              className="flex-1"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateDefect(defect.id, { intensity: Math.max(0, defect.intensity - 1) })}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateDefect(defect.id, { intensity: Math.min(template.max_intensity, defect.intensity + 1) })}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <span className="w-12 text-center text-sm font-medium">
                              {defect.intensity}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            🟢 Taint (1-{template.taint_threshold}) | 🔴 Fault ({template.taint_threshold + 1}-{template.max_intensity})
                          </div>
                        </div>
                      </>
                    )}

                    {/* Mobile: Show compact info, tap to edit */}
                    {isMobile && (
                      <button
                        onClick={() => setSelectedDefectForEdit(defect.id)}
                        className="w-full p-2 border rounded hover:bg-accent transition-colors text-left"
                      >
                        <div className="flex justify-between text-sm">
                          <span>Cups: {defect.cups_affected}/{template.cups_per_sample}</span>
                          <span>Intensity: {defect.intensity}/{template.max_intensity}</span>
                        </div>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Summary */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Clean Cup</div>
                <div className="text-lg font-semibold">{summary.cleanCups}/{summary.totalCups}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Uniformity</div>
                <div className="text-lg font-semibold">{summary.uniformCups}/{summary.totalCups}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Taints</div>
                <div className="text-lg font-semibold">{summary.taints}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Faults</div>
                <div className="text-lg font-semibold">{summary.faults}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Mobile Bottom Sheet: Attribute Editor */}
      {isMobile && selectedAttributeForEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-background w-full rounded-t-2xl p-6 space-y-4 animate-slide-up">
            {(() => {
              const attr = template.attributes.find(a => a.attribute === selectedAttributeForEdit)
              if (!attr || attr.scale.type !== 'numeric') return null

              const score = activeSampleScores.find(s => s.attribute === selectedAttributeForEdit)
              const value = score?.value ?? attr.scale.min

              return (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{selectedAttributeForEdit}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedAttributeForEdit(null)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="text-center">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v) && v >= attr.scale.min && v <= attr.scale.max) {
                          updateScore(selectedAttributeForEdit, v)
                        }
                      }}
                      className="text-4xl font-bold mb-2 text-center w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-ring rounded px-2"
                      step={attr.scale.increment}
                      min={attr.scale.min}
                      max={attr.scale.max}
                    />
                    <div className="text-sm text-muted-foreground">
                      ({attr.scale.min} - {attr.scale.max}, {attr.scale.increment})
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Slider
                      value={[value]}
                      onValueChange={([v]) => updateScore(selectedAttributeForEdit, v)}
                      min={attr.scale.min}
                      max={attr.scale.max}
                      step={attr.scale.increment}
                      className="w-full"
                    />

                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => decrementScore(selectedAttributeForEdit, attr.scale)}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <input
                        type="number"
                        value={value}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value)
                          if (!isNaN(v) && v >= attr.scale.min && v <= attr.scale.max) {
                            updateScore(selectedAttributeForEdit, v)
                          }
                        }}
                        className="w-24 px-3 py-2 text-center border rounded text-lg font-semibold"
                        step={attr.scale.increment}
                        min={attr.scale.min}
                        max={attr.scale.max}
                      />
                      <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => incrementScore(selectedAttributeForEdit, attr.scale)}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>

                    <Button
                      className="w-full h-12"
                      onClick={() => setSelectedAttributeForEdit(null)}
                    >
                      Done
                    </Button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet: Defect Selector */}
      {isMobile && showDefectSelector && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold">Select Defect</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDefectSelector(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {template.defects.map(defectName => (
                <Button
                  key={defectName}
                  variant="outline"
                  className="h-24 text-base font-medium"
                  onClick={() => {
                    addDefect(defectName)
                    setShowDefectSelector(false)
                  }}
                >
                  {defectName}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet: Defect Editor */}
      {isMobile && selectedDefectForEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-background w-full rounded-t-2xl p-6 space-y-6 animate-slide-up">
            {(() => {
              const defect = activeSampleDefects.find(d => d.id === selectedDefectForEdit)
              if (!defect) return null

              return (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={defect.is_taint ? 'secondary' : 'destructive'}>
                        {defect.is_taint ? '🟢 TAINT' : '🔴 FAULT'}
                      </Badge>
                      <h3 className="text-lg font-semibold">{defect.name}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedDefectForEdit(null)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Cups Affected */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Cups Affected</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={defect.cups_affected}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          if (!isNaN(v) && v >= 0 && v <= template.cups_per_sample) {
                            updateDefect(defect.id, { cups_affected: v })
                          }
                        }}
                        className="text-2xl font-bold text-center w-24 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-ring rounded px-2"
                        min={0}
                        max={template.cups_per_sample}
                      />
                    </div>
                    <div className="text-center text-sm text-muted-foreground">
                      of {template.cups_per_sample} cups
                    </div>
                    <Slider
                      value={[defect.cups_affected]}
                      onValueChange={([v]) => updateDefect(defect.id, { cups_affected: v })}
                      min={0}
                      max={template.cups_per_sample}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => updateDefect(defect.id, { cups_affected: Math.max(0, defect.cups_affected - 1) })}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => updateDefect(defect.id, { cups_affected: Math.min(template.cups_per_sample, defect.cups_affected + 1) })}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  {/* Intensity */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Intensity</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={defect.intensity}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          if (!isNaN(v) && v >= 0 && v <= template.max_intensity) {
                            updateDefect(defect.id, { intensity: v })
                          }
                        }}
                        className="text-2xl font-bold text-center w-24 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-ring rounded px-2"
                        min={0}
                        max={template.max_intensity}
                      />
                    </div>
                    <div className="text-center text-sm text-muted-foreground">
                      of {template.max_intensity} max
                    </div>
                    <Slider
                      value={[defect.intensity]}
                      onValueChange={([v]) => updateDefect(defect.id, { intensity: v })}
                      min={0}
                      max={template.max_intensity}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => updateDefect(defect.id, { intensity: Math.max(0, defect.intensity - 1) })}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => updateDefect(defect.id, { intensity: Math.min(template.max_intensity, defect.intensity + 1) })}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="text-xs text-center text-muted-foreground p-2 bg-muted rounded">
                      🟢 Taint (1-{template.taint_threshold}) | 🔴 Fault ({template.taint_threshold + 1}-{template.max_intensity})
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      className="flex-1 h-12"
                      onClick={() => {
                        removeDefect(defect.id)
                        setSelectedDefectForEdit(null)
                      }}
                    >
                      Remove Defect
                    </Button>
                    <Button
                      className="flex-1 h-12"
                      onClick={() => setSelectedDefectForEdit(null)}
                    >
                      Done
                    </Button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
