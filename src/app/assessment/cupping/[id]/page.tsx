'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DigitalCuppingInterface } from '@/components/cupping/digital-cupping-interface'
import { MainLayout } from '@/components/layout/main-layout'
import { AttributeWithScale } from '@/types/cupping-templates'

// Sample being cupped
interface CuppingSample {
  id: string
  tracking_number: string
  sample_type: 'type' | 'pss' | 'ss'
}

// Quality template
interface CuppingTemplate {
  name: string
  attributes: AttributeWithScale[]
  defects: string[]
  taint_threshold: number
  max_intensity: number
  cups_per_sample: number
}

// Defect data
interface Defect {
  id: string
  name: string
  cups_affected: number
  intensity: number
  is_taint: boolean
}

// Attribute score
interface AttributeScore {
  attribute: string
  value: number | null
}

export default function CuppingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sampleId = params?.id as string

  const [sample, setSample] = useState<CuppingSample | null>(null)
  const [template, setTemplate] = useState<CuppingTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sampleId) {
      loadSampleData()
    }
  }, [sampleId])

  const loadSampleData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load sample details
      const response = await fetch(`/api/samples/${sampleId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load sample')
      }

      // Extract sample info
      const sampleData = data.sample
      setSample({
        id: sampleData.id,
        tracking_number: sampleData.tracking_number,
        sample_type: sampleData.sample_type || 'type',
      })

      // Load quality template from quality_spec
      // For now, use default template - will be replaced with actual template loading
      const defaultTemplate: CuppingTemplate = {
        name: 'Standard SCA',
        attributes: [
          { attribute: 'Fragrance/Aroma', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 } as const },
          { attribute: 'Flavor', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 } as const },
          { attribute: 'Aftertaste', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 } as const },
          { attribute: 'Acidity', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 } as const },
          { attribute: 'Body', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 } as const },
          { attribute: 'Balance', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 } as const },
          { attribute: 'Uniformity', scale: { type: 'numeric', min: 0, max: 10, increment: 2 } as const },
          { attribute: 'Clean Cup', scale: { type: 'numeric', min: 0, max: 10, increment: 2 } as const },
          { attribute: 'Sweetness', scale: { type: 'numeric', min: 0, max: 10, increment: 2 } as const },
          { attribute: 'Overall', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 } as const },
        ],
        defects: [
          'Fermented', 'Phenolic', 'Earthy', 'Moldy', 'Musty',
          'Chemical', 'Medicinal', 'Rubber', 'Sour', 'Overripe',
        ],
        taint_threshold: 3,
        max_intensity: 7,
        cups_per_sample: 5,
      }

      setTemplate(defaultTemplate)
    } catch (err) {
      console.error('Error loading sample data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load sample')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (
    sampleId: string,
    scores: AttributeScore[],
    defects: Defect[]
  ) => {
    try {
      // TODO: Implement save endpoint
      // For now, just log the data
      console.log('Saving cupping data:', {
        sampleId,
        scores,
        defects,
      })

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Show success message
      alert('Cupping scores saved successfully!')
    } catch (error) {
      console.error('Error saving cupping scores:', error)
      throw error
    }
  }

  if (!sampleId) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Invalid sample ID</p>
        </div>
      </MainLayout>
    )
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Loading sample...</p>
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-screen space-y-4">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Go back
          </button>
        </div>
      </MainLayout>
    )
  }

  if (!sample || !template) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Sample not found</p>
        </div>
      </MainLayout>
    )
  }

  return (
    <DigitalCuppingInterface
      samples={[sample]}
      template={template}
      onSave={handleSave}
    />
  )
}
