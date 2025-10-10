'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SampleIntakeForm } from '@/components/samples/sample-intake-form'
import {
  Plus, Search, Filter, Eye, Edit, MapPin, Calendar,
  CheckCircle, XCircle, Clock, AlertCircle, FileText
} from 'lucide-react'
import Link from 'next/link'

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: string
  origin?: string
  importer?: string
  roaster?: string
  sample_type?: string
  status: string
  workflow_stage?: string
  storage_position?: string
  bags_quantity_mt?: number
  created_at: string
}

export default function SamplesPage() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    loadSamples()
  }, [searchQuery, statusFilter])

  const loadSamples = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      params.append('limit', '50')

      const response = await fetch(`/api/samples?${params}`)
      const data = await response.json()

      if (response.ok) {
        // Filter out approved and rejected samples (they should only show in certificates)
        let filtered = data.samples.filter((s: Sample) =>
          s.status !== 'approved' && s.status !== 'rejected'
        )

        // Filter by search query on client side
        if (searchQuery) {
          filtered = filtered.filter((s: Sample) =>
            s.tracking_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.origin?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.importer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.roaster?.toLowerCase().includes(searchQuery.toLowerCase())
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

  const handleSampleCreated = (trackingNumber: string) => {
    // Close dialog and reload samples
    setDialogOpen(false)
    loadSamples()
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; icon: any; label: string }> = {
      received: { variant: 'secondary', icon: Clock, label: 'Received' },
      approved: { variant: 'default', icon: CheckCircle, label: 'Approved' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'Rejected' },
      pending: { variant: 'outline', icon: AlertCircle, label: 'Pending' }
    }

    const config = statusConfig[status] || { variant: 'outline', icon: AlertCircle, label: status }
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="text-xs">
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Samples</h1>
            <p className="text-muted-foreground">
              Manage all coffee samples in the laboratory
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Sample
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Sample Intake</DialogTitle>
              </DialogHeader>
              <SampleIntakeForm onSuccess={handleSampleCreated} asDialog={true} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tracking number, supplier, or origin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === null ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(null)}
                  size="sm"
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === 'received' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('received')}
                  size="sm"
                >
                  Received
                </Button>
                <Button
                  variant={statusFilter === 'approved' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('approved')}
                  size="sm"
                >
                  Approved
                </Button>
                <Button
                  variant={statusFilter === 'rejected' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('rejected')}
                  size="sm"
                >
                  Rejected
                </Button>
              </div>
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
              <h3 className="text-lg font-semibold mb-2">No samples found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter
                  ? 'Try adjusting your search or filter criteria'
                  : 'Get started by adding your first sample'}
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Sample
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                All Samples ({samples.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold">Sample Nr</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Origin</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Exporter</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Importer</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Roaster</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Status</th>
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
                        <td className="py-3 px-4 text-sm">{sample.origin || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.supplier || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.importer || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.roaster || '-'}</td>
                        <td className="py-3 px-4">{getStatusBadge(sample.status)}</td>
                        <td className="py-3 px-4 text-sm">
                          {new Date(sample.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <Link href={`/samples/${sample.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-3 w-3 mr-1" />
                              View
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
