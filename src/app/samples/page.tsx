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

        {/* Samples List */}
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
          <div className="grid grid-cols-1 gap-4">
            {samples.map((sample) => (
              <Card key={sample.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">{sample.tracking_number}</h3>
                        {getStatusBadge(sample.status)}
                        {sample.sample_type && (
                          <Badge variant="outline" className="text-xs">
                            {sample.sample_type}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {sample.supplier && (
                          <div>
                            <span className="text-muted-foreground">Supplier:</span>
                            <p className="font-medium">{sample.supplier}</p>
                          </div>
                        )}
                        {sample.origin && (
                          <div>
                            <span className="text-muted-foreground">Origin:</span>
                            <p className="font-medium">{sample.origin}</p>
                          </div>
                        )}
                        {sample.bags_quantity_mt && (
                          <div>
                            <span className="text-muted-foreground">Quantity:</span>
                            <p className="font-medium">{sample.bags_quantity_mt} MT</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Created:</span>
                          <p className="font-medium">
                            {new Date(sample.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {sample.storage_position && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>Storage: {sample.storage_position}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Link href={`/samples/${sample.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </Link>
                    </div>
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
