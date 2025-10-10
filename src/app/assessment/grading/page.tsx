'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search, Eye, FileText, Clock, AlertCircle, CheckCircle2
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
  workflow_stage?: string
  storage_position?: string
  bags_quantity_mt?: number
  created_at: string
}

export default function GradingPage() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadSamples()
  }, [searchQuery])

  const loadSamples = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      // Only show samples that are received but not yet graded
      params.append('status', 'received')
      params.append('limit', '50')

      const response = await fetch(`/api/samples?${params}`)
      const data = await response.json()

      if (response.ok) {
        // Filter by search query on client side
        let filtered = data.samples
        if (searchQuery) {
          filtered = filtered.filter((s: Sample) =>
            s.tracking_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.origin?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }
        setSamples(filtered)
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
            <h1 className="text-3xl font-bold tracking-tight">Grading</h1>
            <p className="text-muted-foreground">
              Grade samples and prepare them for cupping
            </p>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tracking number, supplier, or origin..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Samples Table */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading samples...
          </div>
        ) : samples.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No samples to grade</h3>
              <p className="text-muted-foreground">
                {searchQuery
                  ? 'Try adjusting your search criteria'
                  : 'All samples have been graded or there are no samples yet'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Samples Ready for Grading ({samples.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold">Tracking Number</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Supplier</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Origin</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Quantity</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Created</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((sample) => (
                      <tr
                        key={sample.id}
                        className="border-b border-border hover:bg-accent/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium">{sample.tracking_number}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">{sample.supplier || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.origin || '-'}</td>
                        <td className="py-3 px-4">
                          {sample.sample_type ? (
                            <Badge variant="outline" className="text-xs">
                              {sample.sample_type}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {sample.bags_quantity_mt ? `${sample.bags_quantity_mt} MT` : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {new Date(sample.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <Link href={`/assessment/grading/${sample.id}`}>
                            <Button variant="outline" size="sm">
                              <FileText className="h-3 w-3 mr-1" />
                              Grade
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}
