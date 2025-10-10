'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Coffee, Maximize2, Eye
} from 'lucide-react'
import Link from 'next/link'

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: string
  origin?: string
  sample_type?: string
  status: string
  cups_per_sample: number
  created_at: string
}

export default function CuppingPage() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSamples()
  }, [])

  const loadSamples = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      // Show samples that have been graded and are ready for cupping
      // For now, we'll show samples with status 'approved' or a custom 'graded' status
      params.append('limit', '50')

      const response = await fetch(`/api/samples?${params}`)
      const data = await response.json()

      if (response.ok) {
        // Filter to show only graded samples (you may want to add a specific status for this)
        const gradedSamples = data.samples.filter((s: Sample) =>
          s.status === 'approved' || s.status === 'in_progress'
        )
        setSamples(gradedSamples)
      } else {
        console.error('Failed to load samples:', data.error)
      }
    } catch (error) {
      console.error('Error loading samples:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cupping</h1>
            <p className="text-muted-foreground">
              Cup samples and evaluate coffee quality
            </p>
          </div>
        </div>

        {/* Samples Ready for Cupping */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading samples...
          </div>
        ) : samples.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Coffee className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No samples ready for cupping</h3>
              <p className="text-muted-foreground">
                Graded samples will appear here when ready for cupping
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {samples.map((sample) => (
              <Card key={sample.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                      {sample.tracking_number}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {sample.cups_per_sample || 5} cups
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm space-y-1">
                    {sample.supplier && (
                      <div>
                        <span className="text-muted-foreground">Supplier:</span>{' '}
                        <span className="font-medium">{sample.supplier}</span>
                      </div>
                    )}
                    {sample.origin && (
                      <div>
                        <span className="text-muted-foreground">Origin:</span>{' '}
                        <span className="font-medium">{sample.origin}</span>
                      </div>
                    )}
                    {sample.sample_type && (
                      <div>
                        <span className="text-muted-foreground">Type:</span>{' '}
                        <span className="font-medium">{sample.sample_type}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Link href={`/assessment/cupping/${sample.id}`} className="flex-1">
                      <Button className="w-full" size="sm">
                        <Maximize2 className="h-3 w-3 mr-1" />
                        Start Cupping
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
