'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Save, Eye, EyeOff, Coffee, Minus, Plus, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { AttributeWithScale } from '@/types/cupping-templates'
import { AttributeScaleType } from '@/types/attribute-scales'
import {
  SampleVisibilitySettings,
  getVisibilitySettings,
  updateVisibilitySetting
} from '@/lib/sample-visibility'

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: {
    company: string
  }
  exporter_legacy?: string
  origin?: string
  sample_type: 'type' | 'pss' | 'ss' | 'specialty'
  ico_number?: string
  container_nr?: string
  client?: {
    id: string
    company: string
  }
  quality_spec_id?: string
  quality_spec?: {
    id: string
    template_id: string
    cups_per_sample?: number
    custom_parameters?: any
    template?: {
      id: string
      name_en?: string
      parameters?: any
    }
  }
}

interface ClientQuality {
  id: string
  custom_name?: string
  template_id: string
  cups_per_sample?: number
}

interface CuppingAttribute {
  attribute: string
  value: number | null
}

interface CuppingDefect {
  id: string
  name: string
  cups_affected: number
  intensity: number
  is_taint: boolean
}

interface CuppingData {
  sample_id: string
  attributes: CuppingAttribute[]
  defects: CuppingDefect[]
}

export default function CuppingPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [samples, setSamples] = useState<Sample[]>([])
  const [activeSampleId, setActiveSampleId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Visibility settings
  const [visibility, setVisibility] = useState<SampleVisibilitySettings>(() => getVisibilitySettings())

  // Cupping data for all samples
  const [cuppingDataMap, setCuppingDataMap] = useState<Map<string, CuppingData>>(new Map())

  // Template attributes and defects per sample
  const [attributesMap, setAttributesMap] = useState<Map<string, AttributeWithScale[]>>(new Map())
  const [availableDefectsMap, setAvailableDefectsMap] = useState<Map<string, string[]>>(new Map())
  const [cupsPerSampleMap, setCupsPerSampleMap] = useState<Map<string, number>>(new Map())

  // Client quality per sample
  const [clientQualityMap, setClientQualityMap] = useState<Map<string, ClientQuality>>(new Map())

  useEffect(() => {
    loadSamples()
  }, [])

  const toggleVisibility = (key: keyof SampleVisibilitySettings) => {
    const newValue = !visibility[key]
    const updated = updateVisibilitySetting(key, newValue)
    setVisibility(updated)
  }

  const loadSamples = async () => {
    try {
      setLoading(true)
      // Load samples in 'analysis' workflow stage
      const response = await fetch('/api/samples?workflow_stage=analysis&limit=100')
      const data = await response.json()

      if (response.ok && data.samples) {
        // Load full details for each sample
        const sampleIds = data.samples.map((s: Sample) => s.id)

        if (sampleIds.length > 0) {
          const detailsResponse = await fetch('/api/samples/bulk-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sample_ids: sampleIds })
          })

          const detailsData = await detailsResponse.json()

          if (detailsResponse.ok && detailsData.samples) {
            setSamples(detailsData.samples)
            if (detailsData.samples.length > 0) {
              setActiveSampleId(detailsData.samples[0].id)
            }

            // Initialize cupping data for each sample
            const newCuppingMap = new Map<string, CuppingData>()
            const newAttributesMap = new Map<string, AttributeWithScale[]>()
            const newAvailableDefectsMap = new Map<string, string[]>()
            const newCupsPerSampleMap = new Map<string, number>()
            const newClientQualityMap = new Map<string, ClientQuality>()

            for (const sample of detailsData.samples) {
              await loadSampleCuppingConfig(
                sample,
                newCuppingMap,
                newAttributesMap,
                newAvailableDefectsMap,
                newCupsPerSampleMap,
                newClientQualityMap
              )
            }

            setCuppingDataMap(newCuppingMap)
            setAttributesMap(newAttributesMap)
            setAvailableDefectsMap(newAvailableDefectsMap)
            setCupsPerSampleMap(newCupsPerSampleMap)
            setClientQualityMap(newClientQualityMap)
          }
        }
      }
    } catch (error) {
      console.error('Error loading samples:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSampleCuppingConfig = async (
    sample: Sample,
    cuppingMap: Map<string, CuppingData>,
    attributesMap: Map<string, AttributeWithScale[]>,
    availableDefectsMap: Map<string, string[]>,
    cupsMap: Map<string, number>,
    clientQualityMap: Map<string, ClientQuality>
  ) => {
    try {
      // Initialize empty cupping data
      const defaultCuppingData: CuppingData = {
        sample_id: sample.id,
        attributes: [],
        defects: []
      }

      // Load cups_per_sample from quality_spec
      const cupsPerSample = sample.quality_spec?.cups_per_sample || 10
      cupsMap.set(sample.id, cupsPerSample)

      // Load client quality for custom name
      if (sample.quality_spec_id) {
        const clientQualityResponse = await fetch(`/api/client-qualities/${sample.quality_spec_id}`)
        const clientQualityData = await clientQualityResponse.json()

        if (clientQualityResponse.ok && clientQualityData.client_quality) {
          clientQualityMap.set(sample.id, clientQualityData.client_quality)

          // Extract cupping template parameters
          const templateParams = clientQualityData.client_quality?.template?.parameters

          if (templateParams?.cupping_attributes && Array.isArray(templateParams.cupping_attributes)) {
            const attributes: AttributeWithScale[] = templateParams.cupping_attributes
            attributesMap.set(sample.id, attributes)

            // Initialize attribute scores
            defaultCuppingData.attributes = attributes.map(attr => ({
              attribute: attr.attribute,
              value: null
            }))
          }

          if (templateParams?.cupping_defects && Array.isArray(templateParams.cupping_defects)) {
            availableDefectsMap.set(sample.id, templateParams.cupping_defects)
          }
        }
      }

      cuppingMap.set(sample.id, defaultCuppingData)
    } catch (error) {
      console.error('Error loading sample cupping config:', error)
    }
  }

  const getSampleTabLabel = (sample: Sample): string => {
    switch (sample.sample_type) {
      case 'pss':
        return sample.tracking_number
      case 'ss':
        return sample.container_nr || sample.ico_number || sample.tracking_number
      case 'type':
        return sample.tracking_number
      default:
        return sample.tracking_number
    }
  }

  const updateAttribute = (sampleId: string, attribute: string, value: number) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    cuppingData.attributes = cuppingData.attributes.map(attr =>
      attr.attribute === attribute ? { ...attr, value } : attr
    )
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const addDefect = (sampleId: string, defectName: string) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    const newDefect: CuppingDefect = {
      id: `${sampleId}-${defectName}-${Date.now()}`,
      name: defectName,
      cups_affected: 0,
      intensity: 0,
      is_taint: true
    }

    cuppingData.defects.push(newDefect)
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const updateDefect = (sampleId: string, defectId: string, updates: Partial<CuppingDefect>) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    cuppingData.defects = cuppingData.defects.map(d => {
      if (d.id === defectId) {
        const updatedDefect = { ...d, ...updates }
        // Auto-calculate taint/fault based on intensity (threshold = 3)
        if (updates.intensity !== undefined) {
          updatedDefect.is_taint = updates.intensity <= 3
        }
        return updatedDefect
      }
      return d
    })
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const removeDefect = (sampleId: string, defectId: string) => {
    const cuppingData = cuppingDataMap.get(sampleId)
    if (!cuppingData) return

    cuppingData.defects = cuppingData.defects.filter(d => d.id !== defectId)
    setCuppingDataMap(new Map(cuppingDataMap))
  }

  const handleSaveCurrent = async () => {
    if (!activeSampleId) return

    try {
      setSaving(true)
      const cuppingData = cuppingDataMap.get(activeSampleId)

      if (!cuppingData) {
        console.error('[SAVE ERROR] No cupping data found for active sample')
        return
      }

      // TODO: Implement cupping save API endpoint
      console.log('[SAVE] Cupping data:', cuppingData)

      toast({
        title: 'Success',
        description: 'Cupping data saved successfully!',
      })
    } catch (error) {
      console.error('Error saving cupping data:', error)
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading samples...</div>
        </div>
      </MainLayout>
    )
  }

  if (samples.length === 0) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <Coffee className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No samples ready for cupping</h2>
            <p className="text-muted-foreground">
              Samples must be in the analysis stage to appear here.
            </p>
            <Button onClick={() => router.push('/samples')}>
              Back to Samples
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  const activeSample = samples.find(s => s.id === activeSampleId)
  const activeCuppingData = cuppingDataMap.get(activeSampleId)
  const activeAttributes = attributesMap.get(activeSampleId) || []
  const activeAvailableDefects = availableDefectsMap.get(activeSampleId) || []
  const activeCups = cupsPerSampleMap.get(activeSampleId) || 10

  return (
    <MainLayout>
      <div className="h-full bg-background">
        {/* Tabs with Save Button */}
        <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="w-full">
          <div className="border-b bg-card sticky top-0 z-50">
            <div className="flex items-center justify-between">
              <TabsList className="h-14 bg-transparent border-b-0 rounded-none overflow-x-auto flex-nowrap">
                {samples.map((sample, index) => {
                  const isActive = sample.id === activeSampleId

                  return (
                    <div key={sample.id} className={`flex items-center ${isActive ? 'bg-yellow-500/20' : ''}`}>
                      {index > 0 && <div className="h-8 w-px bg-border/60 mx-1" />}
                      <TabsTrigger
                        value={sample.id}
                        className={`rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors py-3 ${index === 0 ? 'pl-6 pr-4' : 'px-4'}`}
                      >
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="font-medium text-sm">{getSampleTabLabel(sample)}</span>
                          <span className="text-xs text-muted-foreground capitalize">{sample.sample_type || 'sample'}</span>
                        </div>
                      </TabsTrigger>
                    </div>
                  )
                })}
              </TabsList>
              <div className="pr-6">
                <Button onClick={handleSaveCurrent} disabled={saving} size="default">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Current Sample'}
                </Button>
              </div>
            </div>
          </div>

          {samples.map(sample => {
            const cuppingData = cuppingDataMap.get(sample.id)
            const attributes = attributesMap.get(sample.id) || []
            const availableDefects = availableDefectsMap.get(sample.id) || []
            const cups = cupsPerSampleMap.get(sample.id) || 10
            const clientQuality = clientQualityMap.get(sample.id)

            return (
              <TabsContent key={sample.id} value={sample.id} className="m-0">
                {/* Sample Info Bar with Visibility Toggles */}
                <div className="border-b bg-card/50 px-6 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 text-sm">
                      {/* Quality */}
                      {visibility.showQuality && (sample.quality_spec?.template || clientQuality) && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs uppercase text-muted-foreground/70">Quality:</span>
                          <span>{clientQuality?.custom_name || sample.quality_spec?.template?.name_en}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => toggleVisibility('showQuality')}
                          >
                            <EyeOff className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {!visibility.showQuality && (sample.quality_spec?.template || clientQuality) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6"
                          onClick={() => toggleVisibility('showQuality')}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Quality
                        </Button>
                      )}

                      {/* Client/Buyer */}
                      {visibility.showBuyer && sample.client && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs uppercase text-muted-foreground/70">Client:</span>
                          <span>{sample.client.company}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => toggleVisibility('showBuyer')}
                          >
                            <EyeOff className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {!visibility.showBuyer && sample.client && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6"
                          onClick={() => toggleVisibility('showBuyer')}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Client
                        </Button>
                      )}

                      {/* Supplier */}
                      {visibility.showSupplier && sample.supplier && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs uppercase text-muted-foreground/70">Supplier:</span>
                          <span>{sample.supplier.company}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => toggleVisibility('showSupplier')}
                          >
                            <EyeOff className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {!visibility.showSupplier && sample.supplier && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6"
                          onClick={() => toggleVisibility('showSupplier')}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Supplier
                        </Button>
                      )}

                      {/* Exporter */}
                      {visibility.showExporter && sample.exporter_legacy && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs uppercase text-muted-foreground/70">Exporter:</span>
                          <span>{sample.exporter_legacy}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => toggleVisibility('showExporter')}
                          >
                            <EyeOff className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {!visibility.showExporter && sample.exporter_legacy && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6"
                          onClick={() => toggleVisibility('showExporter')}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Exporter
                        </Button>
                      )}

                      {/* Cups per sample badge */}
                      <Badge variant="secondary" className="text-xs">
                        {cups} cups
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Cupping Content */}
                <div className="p-6">
                  {attributes.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Coffee className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">No cupping template configured</h3>
                        <p className="text-muted-foreground">
                          This sample&apos;s quality specification does not have cupping attributes configured.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-6">
                      {/* Attributes Section */}
                      <Card className="p-6">
                        <h3 className="text-sm font-semibold mb-4">Attributes</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {attributes.map(({ attribute, scale }) => {
                            if (scale.type !== 'numeric') return null

                            const attrScore = cuppingData?.attributes.find(a => a.attribute === attribute)
                            const value = attrScore?.value ?? scale.min

                            return (
                              <div key={attribute} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-sm font-medium">{attribute}</Label>
                                  <span className="text-sm text-muted-foreground">
                                    ({scale.min} - {scale.max}, step {scale.increment})
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Slider
                                    value={[value]}
                                    onValueChange={([v]) => updateAttribute(sample.id, attribute, v)}
                                    min={scale.min}
                                    max={scale.max}
                                    step={scale.increment}
                                    className="flex-1"
                                  />
                                  <Input
                                    type="number"
                                    value={value}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value)
                                      if (!isNaN(v) && v >= scale.min && v <= scale.max) {
                                        updateAttribute(sample.id, attribute, v)
                                      }
                                    }}
                                    className="w-20 h-8 text-center text-sm"
                                    step={scale.increment}
                                    min={scale.min}
                                    max={scale.max}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </Card>

                      {/* Defects Section */}
                      <Card className="p-6">
                        <h3 className="text-sm font-semibold mb-4">Defects</h3>

                        {/* Available Defects */}
                        {availableDefects.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-6">
                            {availableDefects.map(defectName => (
                              <Button
                                key={defectName}
                                variant="outline"
                                size="sm"
                                onClick={() => addDefect(sample.id, defectName)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                {defectName}
                              </Button>
                            ))}
                          </div>
                        )}

                        {/* Active Defects */}
                        {cuppingData && cuppingData.defects.length > 0 && (
                          <div className="space-y-4">
                            {cuppingData.defects.map(defect => (
                              <div
                                key={defect.id}
                                className="border rounded-lg p-4 space-y-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={defect.is_taint ? 'secondary' : 'destructive'}>
                                      {defect.is_taint ? 'TAINT' : 'FAULT'}
                                    </Badge>
                                    <span className="font-medium">{defect.name}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeDefect(sample.id, defect.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Cups Affected */}
                                <div className="space-y-2">
                                  <Label className="text-sm text-muted-foreground">
                                    Cups Affected ({defect.cups_affected} of {cups})
                                  </Label>
                                  <div className="flex items-center gap-3">
                                    <Slider
                                      value={[defect.cups_affected]}
                                      onValueChange={([v]) => updateDefect(sample.id, defect.id, { cups_affected: v })}
                                      min={0}
                                      max={cups}
                                      step={1}
                                      className="flex-1"
                                    />
                                    <Input
                                      type="number"
                                      value={defect.cups_affected}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value)
                                        if (!isNaN(v) && v >= 0 && v <= cups) {
                                          updateDefect(sample.id, defect.id, { cups_affected: v })
                                        }
                                      }}
                                      className="w-16 h-8 text-center text-sm"
                                      min={0}
                                      max={cups}
                                    />
                                  </div>
                                </div>

                                {/* Intensity */}
                                <div className="space-y-2">
                                  <Label className="text-sm text-muted-foreground">
                                    Intensity ({defect.intensity} of 7)
                                  </Label>
                                  <div className="flex items-center gap-3">
                                    <Slider
                                      value={[defect.intensity]}
                                      onValueChange={([v]) => updateDefect(sample.id, defect.id, { intensity: v })}
                                      min={0}
                                      max={7}
                                      step={1}
                                      className="flex-1"
                                    />
                                    <Input
                                      type="number"
                                      value={defect.intensity}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value)
                                        if (!isNaN(v) && v >= 0 && v <= 7) {
                                          updateDefect(sample.id, defect.id, { intensity: v })
                                        }
                                      }}
                                      className="w-16 h-8 text-center text-sm"
                                      min={0}
                                      max={7}
                                    />
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Taint (1-3) | Fault (4-7)
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </div>
                  )}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </MainLayout>
  )
}
