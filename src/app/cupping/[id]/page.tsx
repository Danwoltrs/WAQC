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
  discrepancy_threshold: number
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

      // Load quality template from the sample's quality specification
      const templateResponse = await fetch(`/api/samples/${sampleId}/quality-template`)
      const templateData = await templateResponse.json()

      if (!templateResponse.ok) {
        throw new Error(templateData.error || 'Failed to load quality template')
      }

      setTemplate(templateData.template)
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
      const response = await fetch('/api/cupping/scores/save-digital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_id: sampleId,
          scores,
          defects,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save cupping scores')
      }

      alert('Cupping scores saved successfully!')
      return data
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
    <MainLayout>
      <DigitalCuppingInterface
        samples={[sample]}
        template={template}
        onSave={handleSave}
      />
    </MainLayout>
  )
}
