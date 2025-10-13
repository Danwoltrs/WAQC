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
  ChevronLeft, Save, CheckCircle2, Coffee
} from 'lucide-react'
import {
  ScreenSizeConstraint,
  ScreenSizeRequirements,
  getConstraintDisplayText,
  validateScreenSizeDistribution,
  ConstraintValidationResult
} from '@/types/screen-size-constraints'

interface Sample {
  id: string
  tracking_number: string
  supplier?: string
  origin?: string
  sample_type?: string
  status: string
  cups_per_sample?: number
  bags_quantity_mt?: number
  created_at: string
  quality_spec_id?: string
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
  screen_sizes: { [key: string]: number } // Dynamic screen sizes based on template
  moisture_percentage: number
  defects_primary: number
  defects_secondary: number
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [gradingData, setGradingData] = useState<GradingData>({
    screen_sizes: {},
    moisture_percentage: 0,
    defects_primary: 0,
    defects_secondary: 0,
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

  const handleInputChange = (field: keyof GradingData, value: string | number) => {
    setGradingData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleScreenSizeChange = (screenSize: string, value: number) => {
    setGradingData(prev => ({
      ...prev,
      screen_sizes: {
        ...prev.screen_sizes,
        [screenSize]: value
      }
    }))
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
            screen_sizes: gradingData.screen_sizes, // Dynamic screen sizes from constraints
            moisture_percentage: gradingData.moisture_percentage,
            defects: {
              primary: gradingData.defects_primary,
              secondary: gradingData.defects_secondary
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
      router.push('/assessment/cupping')
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

  return (
    <MainLayout>
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

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Grading
            </Button>
          </div>
          <Button
            onClick={handleSubmitGrading}
            disabled={!isFormValid() || saving}
          >
            {saving ? (
              'Saving...'
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Grading
              </>
            )}
          </Button>
        </div>

        {/* Sample Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">{sample.tracking_number}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {sample.supplier && `${sample.supplier} • `}
                  {sample.origin}
                </p>
              </div>
              <Badge variant="outline">
                {sample.sample_type || 'Coffee Sample'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {sample.bags_quantity_mt && (
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-medium">{sample.bags_quantity_mt} MT</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Received:</span>
                <p className="font-medium">
                  {new Date(sample.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <p className="font-medium capitalize">{sample.status}</p>
              </div>
            </div>
          </CardContent>
        </Card>

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

        {/* Green Bean Grading */}
        <Card>
          <CardHeader>
            <CardTitle>Green Bean Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Screen Sizes - Dynamic based on quality template constraints */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">
                  Screen Size Distribution (%)
                </Label>
                {qualityTemplate && (
                  <Badge variant="outline" className="text-xs">
                    Template: {qualityTemplate.name_en || qualityTemplate.name}
                  </Badge>
                )}
              </div>

              {screenSizeConstraints.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {screenSizeConstraints
                      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                      .map((constraint) => (
                        <div key={constraint.screen_size} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`screen_${constraint.screen_size}`} className="text-sm font-medium">
                              {constraint.screen_size}
                            </Label>
                            <Badge variant="secondary" className="text-xs">
                              {getConstraintDisplayText(constraint)}
                            </Badge>
                          </div>
                          <Input
                            id={`screen_${constraint.screen_size}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={gradingData.screen_sizes[constraint.screen_size] || 0}
                            onChange={(e) => handleScreenSizeChange(constraint.screen_size, parseFloat(e.target.value) || 0)}
                            placeholder="0.0"
                          />
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Only screens defined in the quality template are shown. Enter actual measured percentages.
                  </p>
                </>
              ) : (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                  <p className="text-sm">No quality template associated with this sample.</p>
                  <p className="text-xs mt-1">Screen size requirements will be displayed once a quality template is assigned.</p>
                </div>
              )}
            </div>

            {/* Physical Properties */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="moisture">Moisture Content (%)</Label>
                <Input
                  id="moisture"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={gradingData.moisture_percentage}
                  onChange={(e) => handleInputChange('moisture_percentage', parseFloat(e.target.value) || 0)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="defects_primary">Primary Defects</Label>
                <Input
                  id="defects_primary"
                  type="number"
                  min="0"
                  value={gradingData.defects_primary}
                  onChange={(e) => handleInputChange('defects_primary', parseInt(e.target.value) || 0)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="defects_secondary">Secondary Defects</Label>
                <Input
                  id="defects_secondary"
                  type="number"
                  min="0"
                  value={gradingData.defects_secondary}
                  onChange={(e) => handleInputChange('defects_secondary', parseInt(e.target.value) || 0)}
                  className="mt-2"
                />
              </div>
            </div>

            {/* Color and Aroma */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="color_grade">Color Grade</Label>
                <Input
                  id="color_grade"
                  type="text"
                  value={gradingData.color_grade}
                  onChange={(e) => handleInputChange('color_grade', e.target.value)}
                  placeholder="e.g., Bluish Green, Yellow Green"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="aroma_notes">Aroma Notes</Label>
                <Input
                  id="aroma_notes"
                  type="text"
                  value={gradingData.aroma_notes}
                  onChange={(e) => handleInputChange('aroma_notes', e.target.value)}
                  placeholder="e.g., Fresh, Fruity, Herbal"
                  className="mt-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmitGrading}
            disabled={!isFormValid() || saving}
          >
            {saving ? (
              'Saving...'
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Grading & Send to Cupping
              </>
            )}
          </Button>
        </div>
      </div>
    </MainLayout>
  )
}
