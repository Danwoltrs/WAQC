'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Save, Eye, EyeOff } from 'lucide-react'
import {
  DefectConfig,
  calculateDefectEquivalents,
  calculatePrimaryDefects,
  calculateSecondaryDefects,
  calculateTotalDefects,
  getDefectsByCategory
} from '@/types/defect-configuration'
import {
  ScreenSizeConstraint,
  getConstraintDisplayText
} from '@/types/screen-size-constraints'

interface Sample {
  id: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type'
  ico_number?: string
  container_nr?: string
  origin?: string
  exporter_legacy?: string
  client_id?: string
  quality_spec_id?: string
  laboratory_id?: string
  client?: {
    id: string
    company: string
  }
  laboratory?: {
    id: string
    name: string
    code: string
  }
  quality_spec?: {
    id: string
    template_id: string
    custom_parameters?: any
    template?: {
      id: string
      name: string
      parameters?: any
    }
  }
}

interface GradingData {
  sample_id: string
  screen_sizes: { [key: string]: number } // Stores grams
  screen_sizes_percentages: { [key: string]: number } // Calculated percentages
  moisture_percentage: number
  quakers_count: number
  defect_counts: { [defectName: string]: number }
  defects_primary: number // Calculated
  defects_secondary: number // Calculated
  defects_total: number // Calculated
}

function BatchGradingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sampleIds = searchParams.get('ids')?.split(',') || []

  const [samples, setSamples] = useState<Sample[]>([])
  const [activeSampleId, setActiveSampleId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // UI toggles
  const [showQuality, setShowQuality] = useState(true)
  const [showShipper, setShowShipper] = useState(true)
  const [showSpec, setShowSpec] = useState(true)

  // Grading data for all samples
  const [gradingDataMap, setGradingDataMap] = useState<Map<string, GradingData>>(new Map())

  // Defect configurations per sample
  const [defectConfigsMap, setDefectConfigsMap] = useState<Map<string, DefectConfig[]>>(new Map())

  // Screen size constraints per sample
  const [screenConstraintsMap, setScreenConstraintsMap] = useState<Map<string, ScreenSizeConstraint[]>>(new Map())

  useEffect(() => {
    if (sampleIds.length > 0) {
      loadSamples()
    }
  }, [sampleIds])

  const loadSamples = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/samples/bulk-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds })
      })

      const data = await response.json()

      if (response.ok && data.samples) {
        setSamples(data.samples)
        if (data.samples.length > 0) {
          setActiveSampleId(data.samples[0].id)
        }

        // Initialize grading data for each sample
        const newGradingMap = new Map<string, GradingData>()
        const newDefectConfigsMap = new Map<string, DefectConfig[]>()
        const newScreenConstraintsMap = new Map<string, ScreenSizeConstraint[]>()

        for (const sample of data.samples) {
          // Initialize grading data
          newGradingMap.set(sample.id, {
            sample_id: sample.id,
            screen_sizes: {},
            screen_sizes_percentages: {},
            moisture_percentage: 0,
            quakers_count: 0,
            defect_counts: {},
            defects_primary: 0,
            defects_secondary: 0,
            defects_total: 0
          })

          // Load defect configuration and screen constraints for this sample
          await loadSampleConfig(sample, newDefectConfigsMap, newScreenConstraintsMap, newGradingMap)
        }

        setGradingDataMap(newGradingMap)
        setDefectConfigsMap(newDefectConfigsMap)
        setScreenConstraintsMap(newScreenConstraintsMap)
      }
    } catch (error) {
      console.error('Error loading samples:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSampleConfig = async (
    sample: Sample,
    defectConfigsMap: Map<string, DefectConfig[]>,
    screenConstraintsMap: Map<string, ScreenSizeConstraint[]>,
    gradingDataMap: Map<string, GradingData>
  ) => {
    try {
      // Load defect configuration for this client
      if (sample.client_id) {
        const defectsResponse = await fetch(
          `/api/defect-definitions?client_id=${sample.client_id}&origin=${sample.origin || ''}&is_active=true`
        )
        if (defectsResponse.ok) {
          const defectsData = await defectsResponse.json()
          if (defectsData.definitions) {
            // Transform database format to DefectConfig format
            const defectConfigs: DefectConfig[] = defectsData.definitions.map((def: any, index: number) => ({
              name: def.name_en,
              weight: def.point_value,
              category: def.category as 'primary' | 'secondary',
              display_order: index,
              description: def.description_en
            }))

            defectConfigsMap.set(sample.id, defectConfigs)

            // Initialize defect counts
            const gradingData = gradingDataMap.get(sample.id)
            if (gradingData) {
              const defectCounts: { [key: string]: number } = {}
              defectConfigs.forEach((defect: DefectConfig) => {
                defectCounts[defect.name] = 0
              })
              gradingData.defect_counts = defectCounts
            }
          }
        }
      }

      // Load screen size constraints from quality template
      if (sample.quality_spec?.template?.parameters?.screen_size_requirements) {
        const constraints = sample.quality_spec.template.parameters.screen_size_requirements.constraints || []
        screenConstraintsMap.set(sample.id, constraints)

        // Initialize screen sizes
        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          const screenSizes: { [key: string]: number } = {}
          constraints.forEach((constraint: ScreenSizeConstraint) => {
            screenSizes[constraint.screen_size] = 0
          })
          gradingData.screen_sizes = screenSizes
        }
      } else if (sample.sample_type === 'type') {
        // For type samples without template, show all common screen sizes
        const allScreens: ScreenSizeConstraint[] = [
          { screen_size: '20', constraint_type: 'any', display_order: 0 },
          { screen_size: '19', constraint_type: 'any', display_order: 1 },
          { screen_size: '18', constraint_type: 'any', display_order: 2 },
          { screen_size: '17', constraint_type: 'any', display_order: 3 },
          { screen_size: '16', constraint_type: 'any', display_order: 4 },
          { screen_size: '15', constraint_type: 'any', display_order: 5 },
          { screen_size: '14', constraint_type: 'any', display_order: 6 },
          { screen_size: '13', constraint_type: 'any', display_order: 7 },
          { screen_size: '12', constraint_type: 'any', display_order: 8 },
          { screen_size: 'Below 12', constraint_type: 'any', display_order: 9 }
        ]
        screenConstraintsMap.set(sample.id, allScreens)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          const screenSizes: { [key: string]: number } = {}
          allScreens.forEach(screen => {
            screenSizes[screen.screen_size] = 0
          })
          gradingData.screen_sizes = screenSizes
        }
      }
    } catch (error) {
      console.error('Error loading sample config:', error)
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

  const handleDefectCountChange = (sampleId: string, defectName: string, count: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    const defects = defectConfigsMap.get(sampleId)

    if (!gradingData || !defects) return

    // Update the specific defect count
    gradingData.defect_counts[defectName] = count

    // Recalculate totals
    gradingData.defects_primary = calculatePrimaryDefects(defects, gradingData.defect_counts)
    gradingData.defects_secondary = calculateSecondaryDefects(defects, gradingData.defect_counts)
    gradingData.defects_total = calculateTotalDefects(defects, gradingData.defect_counts)

    setGradingDataMap(new Map(gradingDataMap))
  }

  const calculatePercentages = (screenSizesGrams: { [key: string]: number }): { [key: string]: number } => {
    const total = Object.values(screenSizesGrams).reduce((sum, val) => sum + val, 0)
    if (total === 0) return {}

    const percentages: { [key: string]: number } = {}
    Object.entries(screenSizesGrams).forEach(([key, value]) => {
      percentages[key] = Math.round((value / total) * 1000) / 10 // Round to 1 decimal
    })
    return percentages
  }

  const handleScreenSizeChange = (sampleId: string, screenSize: string, value: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    if (!gradingData) return

    gradingData.screen_sizes[screenSize] = value
    gradingData.screen_sizes_percentages = calculatePercentages(gradingData.screen_sizes)
    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleFieldChange = (sampleId: string, field: 'moisture_percentage' | 'quakers_count', value: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    if (!gradingData) return

    gradingData[field] = value
    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleSaveAll = async () => {
    try {
      setSaving(true)

      // Save all samples
      for (const [sampleId, gradingData] of gradingDataMap) {
        // Create/update quality assessment
        const assessmentResponse = await fetch(`/api/samples/${sampleId}/quality-assessment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            green_bean_data: {
              screen_sizes: gradingData.screen_sizes_percentages, // Send percentages to backend
              moisture_percentage: gradingData.moisture_percentage,
              quakers: gradingData.quakers_count,
              defects: {
                counts: gradingData.defect_counts,
                primary: gradingData.defects_primary,
                secondary: gradingData.defects_secondary,
                total: gradingData.defects_total
              }
            }
          })
        })

        if (!assessmentResponse.ok) {
          console.error(`Failed to save assessment for sample ${sampleId}`)
        }

        // Update sample status to in_progress and mark as roasted
        const updateResponse = await fetch(`/api/samples/${sampleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'in_progress',
            roasted: true
          })
        })

        if (!updateResponse.ok) {
          console.error(`Failed to update sample ${sampleId}`)
        }
      }

      // Redirect to cupping
      router.push('/cupping')
    } catch (error) {
      console.error('Error saving grading data:', error)
      alert('Failed to save grading data. Please try again.')
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
            <h2 className="text-xl font-semibold">No samples found</h2>
          <Button onClick={() => router.push('/grading')}>
            Return to Grading
          </Button>
        </div>
      </div>
      </MainLayout>
    )
  }

  const activeSample = samples.find(s => s.id === activeSampleId)
  const activeGradingData = gradingDataMap.get(activeSampleId)
  const activeDefects = defectConfigsMap.get(activeSampleId) || []
  const activeScreens = screenConstraintsMap.get(activeSampleId) || []

  const primaryDefects = getDefectsByCategory(activeDefects, 'primary')
  const secondaryDefects = getDefectsByCategory(activeDefects, 'secondary')

  return (
    <MainLayout>
      <div className="h-full bg-background">
      {/* Tabs */}
      <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="w-full">
        {/* Combined Header with Tabs and Save Button */}
        <div className="border-b bg-card sticky top-0 z-50">
          <div className="px-6 flex items-center justify-between">
            <TabsList className="justify-start h-auto bg-transparent border-b-0 rounded-none p-0 gap-0 flex-1">
              {samples.map((sample, index) => (
                <>
                  <TabsTrigger
                    key={sample.id}
                    value={sample.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors px-4 py-3"
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-medium text-sm">{getSampleTabLabel(sample)}</span>
                      <span className="text-xs text-muted-foreground capitalize">{sample.sample_type || 'sample'}</span>
                    </div>
                  </TabsTrigger>
                  {index < samples.length - 1 && (
                    <div className="w-px h-12 bg-border" />
                  )}
                </>
              ))}
            </TabsList>
            <Button onClick={handleSaveAll} disabled={saving} size="lg" className="ml-4">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Current Sample'}
            </Button>
          </div>
        </div>

        {samples.map(sample => {
          const gradingData = gradingDataMap.get(sample.id)
          const defects = defectConfigsMap.get(sample.id) || []
          const screens = screenConstraintsMap.get(sample.id) || []
          const primaries = getDefectsByCategory(defects, 'primary')
          const secondaries = getDefectsByCategory(defects, 'secondary')

          return (
            <TabsContent key={sample.id} value={sample.id} className="m-0">
              {/* Sample Info Bar */}
              <div className="border-b bg-card/50 px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 text-sm">
                    {showQuality && sample.quality_spec?.template && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Quality:</span>
                        <Badge variant="outline">{sample.quality_spec.template.name}</Badge>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowQuality(false)}>
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {showShipper && sample.exporter_legacy && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Shipper:</span>
                        <span className="font-medium">{sample.exporter_legacy}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowShipper(false)}>
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {showSpec && sample.client && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Client:</span>
                        <span className="font-medium">{sample.client.company}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowSpec(false)}>
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!showQuality && (
                      <Button variant="outline" size="sm" onClick={() => setShowQuality(true)}>
                        <Eye className="h-3 w-3 mr-1" /> Quality
                      </Button>
                    )}
                    {!showShipper && (
                      <Button variant="outline" size="sm" onClick={() => setShowShipper(true)}>
                        <Eye className="h-3 w-3 mr-1" /> Shipper
                      </Button>
                    )}
                    {!showSpec && (
                      <Button variant="outline" size="sm" onClick={() => setShowSpec(true)}>
                        <Eye className="h-3 w-3 mr-1" /> Client
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Grading Content */}
              <div className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Side: Screen Sizes */}
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-sm font-semibold mb-4">Screen Size Distribution (g)</h3>
                      <div className="space-y-2">
                        {screens.map(screen => {
                          const percentage = gradingData?.screen_sizes_percentages[screen.screen_size] || 0
                          const hasError = false // TODO: Add validation logic
                          return (
                            <div key={screen.screen_size} className="flex items-center gap-3">
                              <Label className="text-sm w-20">{screen.screen_size}</Label>
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={gradingData?.screen_sizes[screen.screen_size] || ''}
                                onChange={(e) => handleScreenSizeChange(sample.id, screen.screen_size, parseFloat(e.target.value) || 0)}
                                className="h-8 w-20"
                                placeholder="0"
                              />
                              <div className={`text-sm tabular-nums w-16 ${hasError ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                {percentage > 0 ? `${percentage}%` : ''}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Quakers and Humidity */}
                      <div className="mt-6 pt-6 border-t space-y-2">
                        <div className="flex items-center gap-3">
                          <Label className="text-sm w-20">Quakers</Label>
                          <Input
                            type="number"
                            min="0"
                            value={gradingData?.quakers_count || ''}
                            onChange={(e) => handleFieldChange(sample.id, 'quakers_count', parseInt(e.target.value) || 0)}
                            className="h-8 w-20"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <Label className="text-sm w-20">Humidity (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={gradingData?.moisture_percentage || ''}
                            onChange={(e) => handleFieldChange(sample.id, 'moisture_percentage', parseFloat(e.target.value) || 0)}
                            className="h-8 w-20"
                            placeholder="0.0"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Right Side: Defects */}
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold">Defects</h3>
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Primary: </span>
                            <span className="font-semibold">{gradingData?.defects_primary.toFixed(2) || '0.00'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Secondary: </span>
                            <span className="font-semibold">{gradingData?.defects_secondary.toFixed(2) || '0.00'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total: </span>
                            <span className="font-semibold">{gradingData?.defects_total.toFixed(2) || '0.00'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {/* Primary Defects */}
                        {primaries.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Primary</h4>
                            <div className="space-y-2">
                              {primaries.map(defect => (
                                <div key={defect.name} className="grid grid-cols-[1fr_80px_80px] gap-3 items-center">
                                  <Label className="text-sm">{defect.name}</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={gradingData?.defect_counts[defect.name] || 0}
                                    onChange={(e) => handleDefectCountChange(sample.id, defect.name, parseInt(e.target.value) || 0)}
                                    className="h-8"
                                    placeholder="0"
                                  />
                                  <div className="text-sm text-right text-muted-foreground">
                                    = {calculateDefectEquivalents(gradingData?.defect_counts[defect.name] || 0, defect.weight).toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Secondary Defects */}
                        {secondaries.length > 0 && (
                          <div className="pt-4 border-t">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Secondary</h4>
                            <div className="space-y-2">
                              {secondaries.map(defect => (
                                <div key={defect.name} className="grid grid-cols-[1fr_80px_80px] gap-3 items-center">
                                  <Label className="text-sm">{defect.name}</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={gradingData?.defect_counts[defect.name] || 0}
                                    onChange={(e) => handleDefectCountChange(sample.id, defect.name, parseInt(e.target.value) || 0)}
                                    className="h-8"
                                    placeholder="0"
                                  />
                                  <div className="text-sm text-right text-muted-foreground">
                                    = {calculateDefectEquivalents(gradingData?.defect_counts[defect.name] || 0, defect.weight).toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>
      </div>
    </MainLayout>
  )
}

export default function BatchGradingPage() {
  return (
    <Suspense fallback={
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading grading interface...</div>
        </div>
      </MainLayout>
    }>
      <BatchGradingContent />
    </Suspense>
  )
}
