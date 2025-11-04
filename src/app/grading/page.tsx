'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Save, Eye, EyeOff } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import {
  DefectConfig,
  calculatePrimaryDefects,
  calculateSecondaryDefects,
  calculateTotalDefects,
  getDefectsByCategory
} from '@/types/defect-configuration'
import {
  ScreenSizeConstraint,
  getConstraintDisplayText
} from '@/types/screen-size-constraints'
import {
  SampleVisibilitySettings,
  getVisibilitySettings,
  updateVisibilitySetting
} from '@/lib/sample-visibility'

// Pastel colors for pie chart
const CHART_COLORS = ['#C7CEEA', '#B8E0D2', '#D4A5A5', '#F4E1D2', '#E9D8FD', '#B5EAD7', '#FFE5D9', '#E0E7FF']

interface Sample {
  id: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type' | 'specialty'
  ico_number?: string
  container_nr?: string
  origin?: string
  exporter_legacy?: string
  supplier?: {
    company: string
  }
  client_id?: string
  quality_spec_id?: string
  laboratory_id?: string
  workflow_stage?: string
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
      name_en?: string
      parameters?: any
    }
  }
}

interface ClientQuality {
  id: string
  custom_name?: string
  template_id: string
}

interface GradingData {
  sample_id: string
  screen_sizes: { [key: string]: number } // Stores grams
  screen_sizes_percentages: { [key: string]: number } // Calculated percentages
  moisture_percentage: number
  quakers_count: number
  defect_counts: { [defectName: string]: number }
  defects_primary: number
  defects_secondary: number
  defects_total: number
}

export default function GradingPage() {
  const router = useRouter()

  const [samples, setSamples] = useState<Sample[]>([])
  const [activeSampleId, setActiveSampleId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Visibility settings using shared utility
  const [visibility, setVisibility] = useState<SampleVisibilitySettings>(() => getVisibilitySettings())

  // Grading data for all samples
  const [gradingDataMap, setGradingDataMap] = useState<Map<string, GradingData>>(new Map())

  // Defect configurations per sample
  const [defectConfigsMap, setDefectConfigsMap] = useState<Map<string, DefectConfig[]>>(new Map())

  // Screen size constraints per sample
  const [screenConstraintsMap, setScreenConstraintsMap] = useState<Map<string, ScreenSizeConstraint[]>>(new Map())

  // Client quality per sample (for custom quality names)
  const [clientQualityMap, setClientQualityMap] = useState<Map<string, ClientQuality>>(new Map())

  useEffect(() => {
    loadSamples()
  }, [])

  const toggleVisibility = (key: keyof SampleVisibilitySettings) => {
    const newValue = !visibility[key]
    const updated = updateVisibilitySetting(key, newValue)
    setVisibility(updated)
  }

  // Calculate percentages from gram inputs
  const calculatePercentages = (screenSizesGrams: { [key: string]: number }): { [key: string]: number } => {
    const total = Object.values(screenSizesGrams).reduce((sum, val) => sum + val, 0)
    if (total === 0) return {}

    const percentages: { [key: string]: number } = {}
    Object.entries(screenSizesGrams).forEach(([key, value]) => {
      percentages[key] = Math.round((value / total) * 1000) / 10 // Round to 1 decimal
    })
    return percentages
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

            // Initialize grading data for each sample
            const newGradingMap = new Map<string, GradingData>()
            const newDefectConfigsMap = new Map<string, DefectConfig[]>()
            const newScreenConstraintsMap = new Map<string, ScreenSizeConstraint[]>()

            const newClientQualityMap = new Map<string, ClientQuality>()

            for (const sample of detailsData.samples) {
              // Initialize grading data
              newGradingMap.set(sample.id, {
                sample_id: sample.id,
                screen_sizes: {}, // Grams
                screen_sizes_percentages: {}, // Calculated percentages
                moisture_percentage: 0,
                quakers_count: 0,
                defect_counts: {},
                defects_primary: 0,
                defects_secondary: 0,
                defects_total: 0
              })

              // Load defect configuration and screen constraints for this sample
              await loadSampleConfig(sample, newDefectConfigsMap, newScreenConstraintsMap, newGradingMap, newClientQualityMap)
            }

            setClientQualityMap(newClientQualityMap)

            setGradingDataMap(newGradingMap)
            setDefectConfigsMap(newDefectConfigsMap)
            setScreenConstraintsMap(newScreenConstraintsMap)
          }
        }
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
    gradingDataMap: Map<string, GradingData>,
    clientQualityMap: Map<string, ClientQuality>
  ) => {
    try {
      // Load client quality for custom name
      if (sample.quality_spec_id) {
        const clientQualityResponse = await fetch(`/api/client-qualities/${sample.quality_spec_id}`)
        const clientQualityData = await clientQualityResponse.json()

        if (clientQualityResponse.ok && clientQualityData.client_quality) {
          clientQualityMap.set(sample.id, clientQualityData.client_quality)
        }
      }

      // Load defect configuration from quality template first, fallback to client defects
      let defectConfigs: DefectConfig[] = []

      console.log(`[Defects Debug] Sample ${sample.id}:`, {
        has_quality_spec: !!sample.quality_spec,
        has_template: !!sample.quality_spec?.template,
        has_parameters: !!sample.quality_spec?.template?.parameters,
        has_defect_requirements: !!sample.quality_spec?.template?.parameters?.defect_requirements,
        template_params: sample.quality_spec?.template?.parameters
      })

      // Try to load from quality template parameters
      if (sample.quality_spec?.template?.parameters?.defect_requirements) {
        const defectRequirements = sample.quality_spec.template.parameters.defect_requirements
        console.log('[Defects Debug] Found defect_requirements:', defectRequirements)

        if (defectRequirements.defects && Array.isArray(defectRequirements.defects)) {
          defectConfigs = defectRequirements.defects.map((defect: any, index: number) => ({
            name: defect.name || defect.name_en,
            weight: defect.weight || defect.point_value || 1,
            category: (defect.category || 'primary') as 'primary' | 'secondary',
            display_order: defect.display_order ?? index,
            description: defect.description || defect.description_en || ''
          }))
          console.log('[Defects Debug] Mapped defects from template:', defectConfigs)
        }
      }

      // Fallback to loading from defect definitions API if not in template
      if (defectConfigs.length === 0 && sample.client_id) {
        console.log('[Defects Debug] No template defects, fetching from API for client:', sample.client_id)
        const defectsResponse = await fetch(
          `/api/defect-definitions?client_id=${sample.client_id}&origin=${sample.origin || ''}&is_active=true`
        )
        if (defectsResponse.ok) {
          const defectsData = await defectsResponse.json()
          console.log('[Defects Debug] API response:', defectsData)
          if (defectsData.definitions) {
            defectConfigs = defectsData.definitions.map((def: any, index: number) => ({
              name: def.name_en,
              weight: def.point_value,
              category: def.category as 'primary' | 'secondary',
              display_order: index,
              description: def.description_en
            }))
            console.log('[Defects Debug] Mapped defects from API:', defectConfigs)
          }
        }
      }

      // Set defect configs if we have any
      if (defectConfigs.length > 0) {
        console.log('[Defects Debug] Setting defect configs for sample:', sample.id, defectConfigs)
        defectConfigsMap.set(sample.id, defectConfigs)

        const gradingData = gradingDataMap.get(sample.id)
        if (gradingData) {
          const defectCounts: { [key: string]: number } = {}
          defectConfigs.forEach((defect: DefectConfig) => {
            defectCounts[defect.name] = 0
          })
          gradingData.defect_counts = defectCounts
        }
      } else {
        console.warn('[Defects Debug] No defects found for sample:', sample.id)
      }

      // Load screen size constraints from quality template
      if (sample.quality_spec?.template?.parameters?.screen_size_requirements) {
        const constraints = sample.quality_spec.template.parameters.screen_size_requirements.constraints || []
        screenConstraintsMap.set(sample.id, constraints)

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

  // Format screen size label (e.g., "18" -> "Scr. 18", "Pan" -> "Pan")
  const formatScreenLabel = (screenSize: string): string => {
    const lowerScreen = screenSize.toLowerCase()
    if (lowerScreen.includes('pan') || lowerScreen === 'pan') {
      return 'Pan'
    }
    // Remove any existing "Screen" prefix and format as "Scr. X"
    const cleanSize = screenSize.replace(/^screen\s*/i, '').trim()
    return `Scr. ${cleanSize}`
  }

  const handleDefectCountChange = (sampleId: string, defectName: string, count: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    const defects = defectConfigsMap.get(sampleId)

    if (!gradingData || !defects) return

    gradingData.defect_counts[defectName] = count
    gradingData.defects_primary = calculatePrimaryDefects(defects, gradingData.defect_counts)
    gradingData.defects_secondary = calculateSecondaryDefects(defects, gradingData.defect_counts)
    gradingData.defects_total = calculateTotalDefects(defects, gradingData.defect_counts)

    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleScreenSizeChange = (sampleId: string, screenSize: string, grams: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    if (!gradingData) return

    gradingData.screen_sizes[screenSize] = grams
    gradingData.screen_sizes_percentages = calculatePercentages(gradingData.screen_sizes)
    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleFieldChange = (sampleId: string, field: 'moisture_percentage' | 'quakers_count', value: number) => {
    const gradingData = gradingDataMap.get(sampleId)
    if (!gradingData) return

    gradingData[field] = value
    setGradingDataMap(new Map(gradingDataMap))
  }

  const handleSaveCurrent = async () => {
    if (!activeSampleId) return

    try {
      setSaving(true)
      const gradingData = gradingDataMap.get(activeSampleId)

      if (!gradingData) return

      const assessmentResponse = await fetch(`/api/samples/${activeSampleId}/quality-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          green_bean_data: {
            screen_sizes: gradingData.screen_sizes,
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
        console.error(`Failed to save assessment for sample ${activeSampleId}`)
        alert('Failed to save grading data. Please try again.')
      } else {
        alert('Grading data saved successfully!')
      }
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
            <h2 className="text-xl font-semibold">No samples ready for grading</h2>
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
  const activeGradingData = gradingDataMap.get(activeSampleId)
  const activeDefects = defectConfigsMap.get(activeSampleId) || []
  const activeScreens = screenConstraintsMap.get(activeSampleId) || []

  const primaryDefects = getDefectsByCategory(activeDefects, 'primary')
  const secondaryDefects = getDefectsByCategory(activeDefects, 'secondary')

  return (
    <MainLayout>
      <div className="h-full bg-background">
      {/* Tabs with Save Button */}
      <Tabs value={activeSampleId} onValueChange={setActiveSampleId} className="w-full">
        <div className="border-b bg-card sticky top-0 z-50">
          <div className="px-6 flex items-center justify-between">
            <TabsList className="h-14 bg-transparent border-b-0 rounded-none overflow-x-auto flex-nowrap">
              {samples.map((sample, index) => (
                <div key={sample.id} className="flex items-center">
                  <TabsTrigger
                    value={sample.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors px-4 py-3"
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-medium text-sm">{getSampleTabLabel(sample)}</span>
                      <span className="text-xs text-muted-foreground capitalize">{sample.sample_type || 'sample'}</span>
                    </div>
                  </TabsTrigger>
                  {/* Vertical separator after each tab */}
                  <div className="h-8 w-px bg-border/60 mx-1" />
                </div>
              ))}
            </TabsList>
            <Button onClick={handleSaveCurrent} disabled={saving} size="default">
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
                        <span>{clientQuality?.custom_name || sample.quality_spec?.template?.name_en || sample.quality_spec?.template?.name}</span>
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
                  </div>
                </div>
              </div>

              {/* Grading Content */}
              <div className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Side: Screen Sizes */}
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-sm font-semibold mb-4">Screen Size Distribution</h3>
                      <div className="flex gap-6">
                        {/* Screen Size Inputs */}
                        <div className="space-y-3 flex-1">
                          {screens.map(screen => {
                            const gramsValue = gradingData?.screen_sizes[screen.screen_size] || 0
                            const percentage = gradingData?.screen_sizes_percentages[screen.screen_size] || 0

                            return (
                              <div key={screen.screen_size} className="grid grid-cols-[100px_80px_60px] gap-3 items-center">
                                <Label className="text-sm">{formatScreenLabel(screen.screen_size)}</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={gramsValue}
                                  onChange={(e) => handleScreenSizeChange(sample.id, screen.screen_size, parseFloat(e.target.value) || 0)}
                                  className="h-8 text-sm w-20"
                                  placeholder="grams"
                                />
                                <div className="text-sm text-muted-foreground">
                                  {percentage > 0 ? `${percentage.toFixed(1)}%` : ''}
                                </div>
                              </div>
                            )
                          })}
                          {/* Total Row */}
                          <div className="grid grid-cols-[100px_80px_60px] gap-3 items-center pt-3 border-t">
                            <Label className="text-sm font-semibold">Total</Label>
                            <div className="text-sm font-semibold">
                              {Object.values(gradingData?.screen_sizes || {}).reduce((sum, val) => sum + val, 0)}g
                            </div>
                            <div className="text-sm text-muted-foreground font-semibold">
                              100%
                            </div>
                          </div>
                        </div>

                        {/* Pie Chart - Compact on the right */}
                        {gradingData && Object.values(gradingData.screen_sizes_percentages).some(p => p > 0) && (
                          <div className="flex-shrink-0" style={{ width: '180px' }}>
                            <ResponsiveContainer width="100%" height={150}>
                              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <Pie
                                  data={screens
                                    .filter(screen => (gradingData.screen_sizes_percentages[screen.screen_size] || 0) > 0)
                                    .map((screen, index) => ({
                                      name: formatScreenLabel(screen.screen_size),
                                      value: gradingData.screen_sizes_percentages[screen.screen_size] || 0
                                    }))}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={25}
                                  outerRadius={45}
                                  paddingAngle={2}
                                  dataKey="value"
                                >
                                  {screens.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>

                      {/* Quakers and Humidity */}
                      <div className="mt-6 pt-6 border-t space-y-3">
                        {/* Conditionally show Quakers based on template requirement */}
                        {sample.quality_spec?.template?.parameters?.require_quaker_count !== false && (
                          <div className="grid grid-cols-[100px_80px_60px] gap-3 items-center">
                            <Label className="text-sm">Quakers</Label>
                            <Input
                              type="number"
                              min="0"
                              value={gradingData?.quakers_count || 0}
                              onChange={(e) => handleFieldChange(sample.id, 'quakers_count', parseInt(e.target.value) || 0)}
                              className="h-8 text-sm w-20"
                            />
                            <div className="text-sm text-muted-foreground"></div>
                          </div>
                        )}
                        <div className="grid grid-cols-[100px_80px_60px] gap-3 items-center">
                          <Label className="text-sm">Humidity (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={gradingData?.moisture_percentage || 0}
                            onChange={(e) => handleFieldChange(sample.id, 'moisture_percentage', parseFloat(e.target.value) || 0)}
                            className="h-8 text-sm w-20"
                          />
                          <div className="text-sm text-muted-foreground"></div>
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

                      {primaries.length === 0 && secondaries.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No defects configured for this sample's quality template.
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-[600px] overflow-y-auto">
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
                                    = {((gradingData?.defect_counts[defect.name] || 0) * defect.weight).toFixed(2)}
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
                                    = {((gradingData?.defect_counts[defect.name] || 0) * defect.weight).toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        </div>
                      )}
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
