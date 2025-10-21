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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus, Search, Filter, Eye, MapPin, Calendar,
  CheckCircle, XCircle, Clock, AlertCircle, FileText,
  Download, Printer, QrCode, MoreVertical, Users
} from 'lucide-react'
import Link from 'next/link'

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: string
  exporter?: string
  origin?: string
  importer?: string
  roaster?: string
  buyer?: string
  quality_name?: string
  sample_type?: string
  status: string
  workflow_stage?: string
  storage_position?: string
  bags_quantity_mt?: number
  wolthers_contract_nr?: string
  exporter_contract_nr?: string
  buyer_contract_nr?: string
  roaster_contract_nr?: string
  ico_number?: string
  container_nr?: string
  laboratory_id?: string
  created_at: string
}

export default function SamplesPage() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [sampleTypeFilter, setSampleTypeFilter] = useState<string | null>(null)
  const [originFilter, setOriginFilter] = useState<string>('')
  const [qualityFilter, setQualityFilter] = useState<string>('')
  const [workflowStageFilter, setWorkflowStageFilter] = useState<string | null>(null)
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Unique values for filters
  const [origins, setOrigins] = useState<string[]>([])
  const [qualities, setQualities] = useState<string[]>([])

  useEffect(() => {
    loadSamples()
  }, [statusFilter, sampleTypeFilter, workflowStageFilter])

  const loadSamples = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (sampleTypeFilter) params.append('sample_type', sampleTypeFilter)
      if (workflowStageFilter) params.append('workflow_stage', workflowStageFilter)
      params.append('limit', '100')

      const response = await fetch(`/api/samples?${params}`)
      const data = await response.json()

      if (response.ok) {
        let filtered = data.samples

        // Filter by search query
        if (searchQuery) {
          filtered = filtered.filter((s: Sample) =>
            s.tracking_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.exporter?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.origin?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.importer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.roaster?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.buyer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.wolthers_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.exporter_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.buyer_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.roaster_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.ico_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.container_nr?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }

        // Filter by origin
        if (originFilter) {
          filtered = filtered.filter((s: Sample) =>
            s.origin?.toLowerCase().includes(originFilter.toLowerCase())
          )
        }

        // Filter by quality
        if (qualityFilter) {
          filtered = filtered.filter((s: Sample) =>
            s.quality_name?.toLowerCase().includes(qualityFilter.toLowerCase())
          )
        }

        // Filter by date range
        if (dateFrom) {
          filtered = filtered.filter((s: Sample) =>
            new Date(s.created_at) >= new Date(dateFrom)
          )
        }
        if (dateTo) {
          filtered = filtered.filter((s: Sample) =>
            new Date(s.created_at) <= new Date(dateTo + 'T23:59:59')
          )
        }

        setSamples(filtered)

        // Extract unique origins and qualities for filters
        const uniqueOrigins = [...new Set(data.samples.map((s: Sample) => s.origin).filter(Boolean))]
        const uniqueQualities = [...new Set(data.samples.map((s: Sample) => s.quality_name).filter(Boolean))]
        setOrigins(uniqueOrigins as string[])
        setQualities(uniqueQualities as string[])
      } else {
        console.error('Failed to load samples:', data.error)
      }
    } catch (error) {
      console.error('Error loading samples:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (samples.length > 0 || searchQuery || originFilter || qualityFilter || dateFrom || dateTo) {
        loadSamples()
      }
    }, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, originFilter, qualityFilter, dateFrom, dateTo])

  const handleSampleCreated = (trackingNumber: string) => {
    setDialogOpen(false)
    loadSamples()
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSamples(new Set(samples.map(s => s.id)))
    } else {
      setSelectedSamples(new Set())
    }
  }

  const handleSelectSample = (sampleId: string, checked: boolean) => {
    const newSelected = new Set(selectedSamples)
    if (checked) {
      newSelected.add(sampleId)
    } else {
      newSelected.delete(sampleId)
    }
    setSelectedSamples(newSelected)
  }

  const handleBulkExport = async () => {
    try {
      const response = await fetch('/api/samples/bulk/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: Array.from(selectedSamples) })
      })

      if (response.ok) {
        // Download the CSV file
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `samples-export-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        console.error('Failed to export samples')
      }
    } catch (error) {
      console.error('Error exporting samples:', error)
    }
  }

  const handleBulkPrintLabels = async () => {
    try {
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: Array.from(selectedSamples) })
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Label data ready:', data)
        // TODO: Open print dialog or download PDF when PDF generation is implemented
        alert('Label generation ready. PDF implementation pending.')
      } else {
        console.error('Failed to generate labels')
      }
    } catch (error) {
      console.error('Error printing labels:', error)
    }
  }

  const handleBulkPrintQRTable = async () => {
    try {
      const response = await fetch('/api/samples/bulk/print-qr-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: Array.from(selectedSamples) })
      })

      if (response.ok) {
        const data = await response.json()
        console.log('QR table data ready:', data)
        // TODO: Open print dialog or send to thermal printer when implementation is complete
        alert('QR table generation ready. Thermal printer integration pending.')
      } else {
        console.error('Failed to generate QR table')
      }
    } catch (error) {
      console.error('Error printing QR table:', error)
    }
  }

  const handleBulkAssign = async () => {
    // TODO: Add a dialog to select the cupper
    // For now, just show a placeholder
    const assigned_to = prompt('Enter cupper user ID (temporary - will be replaced with proper dialog):')
    if (!assigned_to) return

    try {
      const response = await fetch('/api/samples/bulk/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_ids: Array.from(selectedSamples),
          assigned_to
        })
      })

      if (response.ok) {
        const data = await response.json()
        alert(data.message)
        loadSamples() // Reload to show updated assignments
        setSelectedSamples(new Set()) // Clear selection
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error assigning samples:', error)
      alert('Failed to assign samples')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; icon: any; label: string; className?: string }> = {
      received: { variant: 'secondary', icon: Clock, label: 'Received', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      in_progress: { variant: 'default', icon: AlertCircle, label: 'In Progress', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
      under_review: { variant: 'outline', icon: Eye, label: 'Under Review', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
      approved: { variant: 'default', icon: CheckCircle, label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    }

    const config = statusConfig[status] || { variant: 'outline', icon: AlertCircle, label: status }
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className={`text-xs ${config.className || ''}`}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    )
  }

  const getWorkflowStageBadge = (stage?: string) => {
    if (!stage) return null

    const stageLabels: Record<string, string> = {
      received: 'Received',
      green_analysis: 'Green Analysis',
      roasting: 'Roasting',
      cupping: 'Cupping',
      certificate_ready: 'Certificate Ready',
      completed: 'Completed'
    }

    return (
      <span className="text-xs text-muted-foreground">
        {stageLabels[stage] || stage}
      </span>
    )
  }

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter(null)
    setSampleTypeFilter(null)
    setOriginFilter('')
    setQualityFilter('')
    setWorkflowStageFilter(null)
    setDateFrom('')
    setDateTo('')
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sample Tracking</h1>
            <p className="text-muted-foreground">
              Comprehensive sample management and tracking
            </p>
          </div>
          <div className="flex gap-2">
            {selectedSamples.size > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <MoreVertical className="h-4 w-4 mr-2" />
                    Bulk Actions ({selectedSamples.size})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleBulkExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBulkPrintLabels}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Labels (3cm × A4)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBulkPrintQRTable}>
                    <QrCode className="h-4 w-4 mr-2" />
                    Print QR Table (Thermal)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBulkAssign}>
                    <Users className="h-4 w-4 mr-2" />
                    Assign to Cupper
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Search and Quick Filters */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by tracking number, supplier, contracts, ICO, container..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Advanced Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {/* Status Filter */}
                <Select value={statusFilter || 'all'} onValueChange={(val) => setStatusFilter(val === 'all' ? null : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sample Type Filter */}
                <Select value={sampleTypeFilter || 'all'} onValueChange={(val) => setSampleTypeFilter(val === 'all' ? null : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sample Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="pss">PSS</SelectItem>
                    <SelectItem value="ss">SS</SelectItem>
                    <SelectItem value="type">Type</SelectItem>
                  </SelectContent>
                </Select>

                {/* Origin Filter */}
                <Input
                  placeholder="Origin..."
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                />

                {/* Quality Filter */}
                <Input
                  placeholder="Quality..."
                  value={qualityFilter}
                  onChange={(e) => setQualityFilter(e.target.value)}
                />

                {/* Date From */}
                <Input
                  type="date"
                  placeholder="Date From"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />

                {/* Date To */}
                <Input
                  type="date"
                  placeholder="Date To"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              {/* Workflow Stage Filter */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={workflowStageFilter === null ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter(null)}
                  size="sm"
                >
                  All Stages
                </Button>
                <Button
                  variant={workflowStageFilter === 'received' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('received')}
                  size="sm"
                >
                  Received
                </Button>
                <Button
                  variant={workflowStageFilter === 'green_analysis' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('green_analysis')}
                  size="sm"
                >
                  Green Analysis
                </Button>
                <Button
                  variant={workflowStageFilter === 'roasting' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('roasting')}
                  size="sm"
                >
                  Roasting
                </Button>
                <Button
                  variant={workflowStageFilter === 'cupping' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('cupping')}
                  size="sm"
                >
                  Cupping
                </Button>
                <Button
                  variant={workflowStageFilter === 'certificate_ready' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('certificate_ready')}
                  size="sm"
                >
                  Certificate Ready
                </Button>
                <Button
                  variant="ghost"
                  onClick={clearFilters}
                  size="sm"
                >
                  Clear All
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
                {searchQuery || statusFilter || originFilter || qualityFilter
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
                Samples ({samples.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4">
                        <Checkbox
                          checked={selectedSamples.size === samples.length && samples.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Sample Nr</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Origin</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Quality</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Exporter</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Importer</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Roaster</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Stage</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold">Storage</th>
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
                          <Checkbox
                            checked={selectedSamples.has(sample.id)}
                            onCheckedChange={(checked) => handleSelectSample(sample.id, checked as boolean)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{sample.tracking_number}</div>
                          {sample.sample_type && (
                            <div className="text-xs text-muted-foreground uppercase">{sample.sample_type}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">{sample.origin || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.quality_name || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.exporter || sample.supplier || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.importer || '-'}</td>
                        <td className="py-3 px-4 text-sm">{sample.roaster || sample.buyer || '-'}</td>
                        <td className="py-3 px-4">{getStatusBadge(sample.status)}</td>
                        <td className="py-3 px-4">{getWorkflowStageBadge(sample.workflow_stage)}</td>
                        <td className="py-3 px-4 text-sm">
                          {sample.storage_position ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {sample.storage_position}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(sample.created_at).toLocaleDateString()}
                          </div>
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
