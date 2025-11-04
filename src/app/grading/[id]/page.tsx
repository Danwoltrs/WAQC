'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Save, CheckCircle2, Coffee, Eye, EyeOff
} from 'lucide-react'
import {
  ScreenSizeConstraint,
  ScreenSizeRequirements,
  getConstraintDisplayText,
  validateScreenSizeDistribution,
  ConstraintValidationResult
} from '@/types/screen-size-constraints'
import {
  DefectConfig,
  calculateDefectEquivalents,
  calculatePrimaryDefects,
  calculateSecondaryDefects,
  calculateTotalDefects,
  getDefectsByCategory
} from '@/types/defect-configuration'
import {
  getVisibilitySettings,
  updateVisibilitySetting,
  SampleVisibilitySettings
} from '@/lib/sample-visibility'

interface Sample {
  id: string
  tracking_number: string
  supplier?: string
  exporter_legacy?: string
  origin?: string
  sample_type?: 'pss' | 'ss' | 'type'
  ico_number?: string
  container_nr?: string
  status: string
  cups_per_sample?: number
  bags_quantity_mt?: number
  created_at: string
  quality_spec_id?: string
  client_id?: string
  client?: {
    id: string
    company: string
  }
}

interface ClientQuality {
  id: string
  template_id: string
  client_id: string
  origin: string
}

interface QualityTemplate {
  id: string
  name: string
  name_en: string
  parameters: {
    screen_size_requirements?: ScreenSizeRequirements
  }
  screen_size_requirements?: ScreenSizeRequirements
}

interface GradingData {
  screen_sizes: { [key: string]: number } // Stores grams
  screen_sizes_percentages: { [key: string]: number } // Calculated percentages
  moisture_percentage: number
  quakers_count: number
  defect_counts: { [defectName: string]: number }
  defects_primary: number // Calculated
  defects_secondary: number // Calculated
  defects_total: number // Calculated
  color_grade: string
  aroma_notes: string
  cups_per_sample: number
}

export default function GradingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sampleId = params?.id as string

  const [sample, setSample] = useState<Sample | null>(null)
  const [qualityTemplate, setQualityTemplate] = useState<QualityTemplate | null>(null)
  const [screenSizeConstraints, setScreenSizeConstraints] = useState<ScreenSizeConstraint[]>([])
  const [defectConfigs, setDefectConfigs] = useState<DefectConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [visibility, setVisibility] = useState<SampleVisibilitySettings>(() => getVisibilitySettings())
  const [gradingData, setGradingData] = useState<GradingData>({
    screen_sizes: {},
    screen_sizes_percentages: {},
    moisture_percentage: 0,
    quakers_count: 0,
    defect_counts: {},
    defects_primary: 0,
    defects_secondary: 0,
    defects_total: 0,
    color_grade: '',
    aroma_notes: '',
    cups_per_sample: 5
  })

  useEffect(() => {
    if (sampleId) {
      loadSample()
    }
  }, [sampleId])

  const loadSample = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/samples/${sampleId}`)
      const data = await response.json()

      if (response.ok) {
        setSample(data.sample)

        // Load quality template if quality_spec_id exists
        if (data.sample.quality_spec_id) {
          await loadQualityTemplate(data.sample.quality_spec_id)
        }

        // Load defect configuration
        if (data.sample.client_id) {
          await loadDefectConfig(data.sample.client_id, data.sample.origin)
        }

        // Load existing grading data if available
        if (data.sample.cups_per_sample) {
          setGradingData(prev => ({
            ...prev,
            cups_per_sample: data.sample.cups_per_sample
          }))
        }
      } else {
        console.error('Failed to load sample:', data.error)
      }
    } catch (error) {
      console.error('Error loading sample:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDefectConfig = async (clientId: string, origin?: string) => {
    try {
      const defectsResponse = await fetch(
        `/api/defect-definitions?client_id=${clientId}&origin=${origin || ''}&is_active=true`
      )
      if (defectsResponse.ok) {
        const defectsData = await defectsResponse.json()
        if (defectsData.definitions) {
          // Transform database format to DefectConfig format
          const configs: DefectConfig[] = defectsData.definitions.map((def: any, index: number) => ({
            name: def.name_en,
            weight: def.point_value,
            category: def.category as 'primary' | 'secondary',
            display_order: index,
            description: def.description_en
          }))

          setDefectConfigs(configs)

          // Initialize defect counts
          const defectCounts: { [key: string]: number } = {}
          configs.forEach((defect: DefectConfig) => {
            defectCounts[defect.name] = 0
          })
          setGradingData(prev => ({
            ...prev,
            defect_counts: defectCounts
          }))
        }
      }
    } catch (error) {
      console.error('Error loading defect config:', error)
    }
  }

  const loadQualityTemplate = async (qualitySpecId: string) => {
    try {
      // Load client quality to get template_id
      const clientQualityResponse = await fetch(`/api/client-qualities/${qualitySpecId}`)
      const clientQualityData = await clientQualityResponse.json()

      if (clientQualityResponse.ok && clientQualityData.client_quality?.template_id) {
        // Load quality template
        const templateResponse = await fetch(`/api/quality-templates/${clientQualityData.client_quality.template_id}`)
        const templateData = await templateResponse.json()

        if (templateResponse.ok) {
          const template = templateData.template
          setQualityTemplate(template)

          // Extract screen size constraints from template
          const requirements = template.screen_size_requirements || template.parameters?.screen_size_requirements
          if (requirements?.constraints) {
            setScreenSizeConstraints(requirements.constraints)

            // Initialize screen_sizes in gradingData with empty values for each constraint
            const initialScreenSizes: { [key: string]: number } = {}
            requirements.constraints.forEach((constraint: ScreenSizeConstraint) => {
              initialScreenSizes[constraint.screen_size] = 0
            })
            setGradingData(prev => ({
              ...prev,
              screen_sizes: initialScreenSizes
            }))
          }
        }
      }
    } catch (error) {
      console.error('Error loading quality template:', error)
    }
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

  const handleInputChange = (field: keyof GradingData, value: string | number) => {
    setGradingData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleScreenSizeChange = (screenSize: string, value: number) => {
    setGradingData(prev => {
      const newScreenSizes = {
        ...prev.screen_sizes,
        [screenSize]: value
      }
      return {
        ...prev,
        screen_sizes: newScreenSizes,
        screen_sizes_percentages: calculatePercentages(newScreenSizes)
      }
    })
  }

  const handleDefectCountChange = (defectName: string, count: number) => {
    setGradingData(prev => {
      const newDefectCounts = {
        ...prev.defect_counts,
        [defectName]: count
      }

      // Recalculate totals
      const primary = calculatePrimaryDefects(defectConfigs, newDefectCounts)
      const secondary = calculateSecondaryDefects(defectConfigs, newDefectCounts)
      const total = calculateTotalDefects(defectConfigs, newDefectCounts)

      return {
        ...prev,
        defect_counts: newDefectCounts,
        defects_primary: primary,
        defects_secondary: secondary,
        defects_total: total
      }
    })
  }

  const toggleVisibility = (key: keyof SampleVisibilitySettings) => {
    const newValue = !visibility[key]
    const updated = updateVisibilitySetting(key, newValue)
    setVisibility(updated)
  }

  const getSampleDisplayLabel = (sample: Sample): string => {
    // When info is hidden, show only tracking number for PSS/Type or container/ICO for SS
    if (sample.sample_type === 'ss') {
      return sample.container_nr || sample.ico_number || sample.tracking_number
    }
    // PSS and Type samples
    return sample.tracking_number
  }

  const handleSubmitGrading = async () => {
    try {
      setSaving(true)
      setValidationErrors([])

      // Validate screen size distribution against constraints
      if (screenSizeConstraints.length > 0) {
        const validationResult = validateScreenSizeDistribution(
          gradingData.screen_sizes,
          { constraints: screenSizeConstraints }
        )

        if (!validationResult.is_valid) {
          const errors = validationResult.violations.map(v => v.message)
          setValidationErrors(errors)
          setSaving(false)
          return
        }
      }

      // Update sample with grading data and cups per sample
      const updateResponse = await fetch(`/api/samples/${sampleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress', // Move to cupping queue
          cups_per_sample: gradingData.cups_per_sample
        })
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update sample')
      }

      // Create quality assessment record
      const assessmentResponse = await fetch('/api/quality-assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_id: sampleId,
          green_bean_data: {
            screen_sizes: gradingData.screen_sizes_percentages, // Send percentages to backend
            moisture_percentage: gradingData.moisture_percentage,
            quakers: gradingData.quakers_count,
            defects: {
              counts: gradingData.defect_counts,
              primary: gradingData.defects_primary,
              secondary: gradingData.defects_secondary,
              total: gradingData.defects_total
            },
            color_grade: gradingData.color_grade,
            aroma_notes: gradingData.aroma_notes
          }
        })
      })

      if (!assessmentResponse.ok) {
        throw new Error('Failed to create quality assessment')
      }

      // Success - redirect to cupping page
      router.push('/cupping')
    } catch (error) {
      console.error('Error submitting grading:', error)
      alert('Failed to submit grading. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const isFormValid = () => {
    return gradingData.cups_per_sample >= 1 && gradingData.cups_per_sample <= 10
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">Loading sample...</div>
        </div>
      </MainLayout>
    )
  }

  if (!sample) {
    return (
      <MainLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Sample not found</h2>
            <Button onClick={() => router.back()}>Go Back</Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  const primaryDefects = getDefectsByCategory(defectConfigs, 'primary')
  const secondaryDefects = getDefectsByCategory(defectConfigs, 'secondary')

  return (
    <MainLayout>
      <div className="h-full bg-background">
        {/* Header with Sample Info and Save Button */}
        <div className="border-b bg-card sticky top-0 z-50">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-lg font-semibold">{getSampleDisplayLabel(sample)}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {/* Supplier */}
                  {visibility.showSupplier && sample.supplier && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs uppercase text-muted-foreground/70">Supplier:</span>
                      <span>{sample.supplier}</span>
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
                  {!visibility.showSupplier && (
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

                  {/* Buyer/Client */}
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

                  {/* Quality Template */}
                  {visibility.showQuality && qualityTemplate && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs uppercase text-muted-foreground/70">Quality:</span>
                      <span>{qualityTemplate.name_en || qualityTemplate.name}</span>
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
                  {!visibility.showQuality && qualityTemplate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6"
                      onClick={() => toggleVisibility('showQuality')}
                    >
                      <Eye className="h-3 w-3 mr-1" /> Quality
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <Button
              onClick={handleSubmitGrading}
              disabled={!isFormValid() || saving}
              size="lg"
            >
              {saving ? (
                'Saving...'
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Current Sample
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-destructive">Screen Size Constraint Violations</h3>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((error, idx) => (
                    <li key={idx} className="text-sm text-destructive">{error}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  Please adjust the screen size percentages to meet the quality template requirements before submitting.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cupping Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5" />
              Cupping Setup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Label htmlFor="cups_per_sample">
                Cups per Sample <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cups_per_sample"
                type="number"
                min="1"
                max="10"
                value={gradingData.cups_per_sample}
                onChange={(e) => handleInputChange('cups_per_sample', parseInt(e.target.value) || 1)}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Specify how many cups to prepare for cupping (1-10)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Green Bean Grading - Two Column Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column: Screen Sizes */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold mb-4">Screen Size Distribution (g)</h3>
              {screenSizeConstraints.length > 0 ? (
                <div className="space-y-2">
                  {screenSizeConstraints
                    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                    .map((constraint) => {
                      const percentage = gradingData.screen_sizes_percentages[constraint.screen_size] || 0
                      return (
                        <div key={constraint.screen_size} className="flex items-center gap-3">
                          <Label className="text-sm w-20">{constraint.screen_size}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={gradingData.screen_sizes[constraint.screen_size] || ''}
                            onChange={(e) => handleScreenSizeChange(constraint.screen_size, parseFloat(e.target.value) || 0)}
                            className="h-8 w-20"
                            placeholder="0"
                          />
                          <div className="text-sm tabular-nums w-16 text-muted-foreground">
                            {percentage > 0 ? `${percentage}%` : ''}
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                  <p className="text-sm">No quality template associated with this sample.</p>
                </div>
              )}

              {/* Quakers and Humidity */}
              <div className="mt-6 pt-6 border-t space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-sm w-20">Quakers</Label>
                  <Input
                    type="number"
                    min="0"
                    value={gradingData.quakers_count || ''}
                    onChange={(e) => handleInputChange('quakers_count', parseInt(e.target.value) || 0)}
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
                    value={gradingData.moisture_percentage || ''}
                    onChange={(e) => handleInputChange('moisture_percentage', parseFloat(e.target.value) || 0)}
                    className="h-8 w-20"
                    placeholder="0.0"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Defects */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Defects</h3>
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Primary: </span>
                    <span className="font-semibold">{gradingData.defects_primary.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Secondary: </span>
                    <span className="font-semibold">{gradingData.defects_secondary.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-semibold">{gradingData.defects_total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Primary Defects */}
                {primaryDefects.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Primary</h4>
                    <div className="space-y-2">
                      {primaryDefects.map(defect => (
                        <div key={defect.name} className="grid grid-cols-[1fr_80px_80px] gap-3 items-center">
                          <Label className="text-sm">{defect.name}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={gradingData.defect_counts[defect.name] || ''}
                            onChange={(e) => handleDefectCountChange(defect.name, parseInt(e.target.value) || 0)}
                            className="h-8"
                            placeholder="0"
                          />
                          <div className="text-sm text-right text-muted-foreground">
                            = {calculateDefectEquivalents(gradingData.defect_counts[defect.name] || 0, defect.weight).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Secondary Defects */}
                {secondaryDefects.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Secondary</h4>
                    <div className="space-y-2">
                      {secondaryDefects.map(defect => (
                        <div key={defect.name} className="grid grid-cols-[1fr_80px_80px] gap-3 items-center">
                          <Label className="text-sm">{defect.name}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={gradingData.defect_counts[defect.name] || ''}
                            onChange={(e) => handleDefectCountChange(defect.name, parseInt(e.target.value) || 0)}
                            className="h-8"
                            placeholder="0"
                          />
                          <div className="text-sm text-right text-muted-foreground">
                            = {calculateDefectEquivalents(gradingData.defect_counts[defect.name] || 0, defect.weight).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {primaryDefects.length === 0 && secondaryDefects.length === 0 && (
                  <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                    <p className="text-sm">No defect configuration found for this client</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        </div>
      </div>
    </MainLayout>
  )
}
