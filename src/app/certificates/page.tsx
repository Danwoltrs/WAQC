'use client'

import { useState, useEffect, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Search,
  Download,
  Mail,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Pencil,
} from 'lucide-react'
import Link from 'next/link'
import { trackingNumberToSlug } from '@/lib/utils'
import { certificateFilenameFromResponse } from '@/lib/certificate-filename'
import { OverrideStatusDialog } from '@/components/certificates/override-status-dialog'
import { BatchApprovalSendView } from '@/components/certificates/batch-approval-send-view'
import { useToast } from '@/hooks/use-toast'
import { SampleDetailOverlay } from '@/components/certificates/cert-editor'
import { useAuth } from '@/components/providers/auth-provider'
import { isSampleEditor } from '@/lib/sample-edit-permissions'

interface Certificate {
  id: string
  certificate_number: string
  issued_to: string
  status: string
  created_at: string
  pdf_url: string | null
  sample_id: string | null
  // Set for sub-contract certificates; null for the mother cert. Must be passed
  // as ?contract_id= when fetching the PDF, else the route renders the mother.
  sample_contract_id: string | null
  is_rejected: boolean | null
  sample: {
    id: string
    tracking_number: string
    origin: string
    client_id: string
    workflow_stage: string | null
    sample_type: string | null
    exporter_sample_number: string | null
    ico_number: string | null
    container_nr: string | null
    wolthers_contract_nr: string | null
    client?: {
      id: string
      name: string
      company: string | null
      fantasy_name: string | null
    }
    exporter?: {
      id: string
      name: string
      contact_email: string | null
    }
    importer?: {
      id: string
      name: string
      contact_email: string | null
    }
    roaster?: {
      id: string
      name: string
      contact_email: string | null
    }
    seller?: {
      id: string
      name: string
      fantasy_name: string | null
    }
    quality_spec_id: string | null
    quality_spec?: {
      id: string
      custom_name: string | null
      template?: {
        id: string
        name: string
      }
    } | null
  } | null
  send_status?: {
    buyerSent: { initials: string; name: string | null; at: string | null } | null
    sellerSent: { initials: string; name: string | null; at: string | null } | null
    full: boolean
  } | null
  buyer_id?: string | null
  seller_id?: string | null
}

interface Client {
  id: string
  name: string
}

interface Quality {
  id: string
  name: string
  client_id: string
}

type SortField = 'certificate_number' | 'created_at' | 'issued_to' | 'origin' | 'status'
type SortOrder = 'asc' | 'desc'

// Local YYYY-MM-DD for a date.
const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Date-range presets for the batch-send selector (week starts Monday).
const presetRange = (kind: 'today' | 'week' | 'month'): { from: string; to: string } => {
  const now = new Date()
  const to = ymd(now)
  if (kind === 'today') return { from: to, to }
  if (kind === 'week') {
    const day = (now.getDay() + 6) % 7 // Mon=0
    const start = new Date(now)
    start.setDate(now.getDate() - day)
    return { from: ymd(start), to }
  }
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to }
}

// Helper to parse tracking number from potential JSON
const parseTrackingNumber = (trackingNumber: string): string => {
  try {
    if (trackingNumber.startsWith('{')) {
      const parsed = JSON.parse(trackingNumber)
      return parsed.pattern || trackingNumber
    }
    return trackingNumber
  } catch {
    return trackingNumber
  }
}

export default function CertificatesPage() {
  const { toast } = useToast()
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [qualities, setQualities] = useState<Quality[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [qualityFilter, setQualityFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [showBatchSend, setShowBatchSend] = useState(false)
  const [batchSelection, setBatchSelection] = useState<{ sampleIds: string[]; side: 'buyer' | 'seller' } | null>(null)
  const [editSampleId, setEditSampleId] = useState<string | null>(null)
  const { profile } = useAuth()
  // Single source of truth for who may edit (master cupper / global admin /
  // qc_role global_admin) — matches the server-side gate and tolerates the
  // is_global_admin↔qc_role drift fixed in migration 20260618000000.
  const isMasterEditor = isSampleEditor(profile)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedCertificates, setSelectedCertificates] = useState<Set<string>>(new Set())

  // Bulk action states
  const [downloading, setDownloading] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [sendingEmails, setSendingEmails] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState({
    exporter: true,
    importer: true,
    roaster: true
  })
  const [emailResults, setEmailResults] = useState<{
    successful: number
    failed: number
    results: Array<{ email: string; name: string; type: string; success: boolean; error?: string }>
  } | null>(null)

  // Consume command-palette deep links: ?open=<sampleId> opens the certificate
  // editor (keyed by sample id), ?q=<text> prefills the search box. Runs once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    const q = params.get('q')
    if (q) setSearchQuery(q)
    if (open) setEditSampleId(open)
    if (open || q) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // Search runs server-side (across all certificates, not just a loaded window), so
  // reload when the query changes. Debounced while typing; immediate for the initial
  // (empty) load.
  useEffect(() => {
    const handle = setTimeout(() => {
      loadCertificates(searchQuery)
    }, searchQuery ? 300 : 0)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const loadCertificates = async (search: string = '') => {
    try {
      setLoading(true)
      const trimmed = search.trim()
      const qs = trimmed ? `?search=${encodeURIComponent(trimmed)}` : ''
      const response = await fetch(`/api/certificates${qs}`)
      const data = await response.json()

      if (response.ok) {
        setCertificates(data.certificates || [])
        // A search response carries only the matched subset — keep the client/quality
        // filter dropdowns stable during search; repopulate them on unfiltered loads.
        if (!trimmed) {
          setClients(data.clients || [])
          setQualities(data.qualities || [])
        }
      } else {
        console.error('Failed to load certificates:', data.error)
      }
    } catch (error) {
      console.error('Error loading certificates:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter and sort certificates. Text search is applied server-side (see
  // loadCertificates); the filters below refine the returned set.
  const filteredCertificates = useMemo(() => {
    let result = [...certificates]

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      result = result.filter(cert => cert.status === statusFilter)
    }

    // Client filter
    if (clientFilter && clientFilter !== 'all') {
      result = result.filter(cert => cert.sample?.client?.id === clientFilter)
    }

    // Quality filter
    if (qualityFilter && qualityFilter !== 'all') {
      result = result.filter(cert => cert.sample?.quality_spec_id === qualityFilter)
    }

    // Date filters
    if (dateFrom) {
      result = result.filter(cert =>
        new Date(cert.created_at) >= new Date(dateFrom)
      )
    }
    if (dateTo) {
      result = result.filter(cert =>
        new Date(cert.created_at) <= new Date(dateTo + 'T23:59:59')
      )
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
        case 'certificate_number':
          aVal = a.certificate_number
          bVal = b.certificate_number
          break
        case 'created_at':
          aVal = new Date(a.created_at).getTime()
          bVal = new Date(b.created_at).getTime()
          break
        case 'issued_to':
          aVal = a.issued_to || ''
          bVal = b.issued_to || ''
          break
        case 'origin':
          aVal = a.sample?.origin || ''
          bVal = b.sample?.origin || ''
          break
        case 'status':
          aVal = a.status || ''
          bVal = b.status || ''
          break
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortOrder === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })

    return result
    // searchQuery is intentionally omitted: text search is applied server-side (see
    // loadCertificates), so this memo depends only on the returned rows + local filters.
  }, [certificates, statusFilter, clientFilter, qualityFilter, dateFrom, dateTo, sortField, sortOrder])

  // Handle column sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // Render sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />
    }
    return sortOrder === 'asc'
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />
  }

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedCertificates.size === filteredCertificates.length) {
      setSelectedCertificates(new Set())
    } else {
      setSelectedCertificates(new Set(filteredCertificates.map(c => c.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelection = new Set(selectedCertificates)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedCertificates(newSelection)
  }

  // Bulk download handler
  const handleBulkDownload = async () => {
    if (selectedCertificates.size === 0) return

    try {
      setDownloading(true)
      const response = await fetch('/api/certificates/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateIds: Array.from(selectedCertificates) })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `certificates-${new Date().toISOString().split('T')[0]}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        const data = await response.json()
        alert(`Download failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error downloading certificates:', error)
      alert('Failed to download certificates')
    } finally {
      setDownloading(false)
    }
  }

  // Single certificate download handler
  const handleDownload = async (sampleId: string, certificateNumber: string, contractId?: string | null) => {
    try {
      const qs = contractId ? `?contract_id=${contractId}` : ''
      const response = await fetch(`/api/samples/${sampleId}/certificate${qs}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        // Use the server's filename (official cert number + buyer reference).
        a.download = certificateFilenameFromResponse(response, certificateNumber)
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error downloading certificate:', error)
    }
  }

  // Bulk email handler
  const handleBulkEmail = async () => {
    if (selectedCertificates.size === 0) return
    if (!emailRecipients.exporter && !emailRecipients.importer && !emailRecipients.roaster) {
      alert('Please select at least one recipient type')
      return
    }

    try {
      setSendingEmails(true)
      setEmailResults(null)

      const response = await fetch('/api/certificates/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificateIds: Array.from(selectedCertificates),
          recipients: emailRecipients
        })
      })

      const data = await response.json()

      if (response.ok) {
        setEmailResults({
          successful: data.successful,
          failed: data.failed,
          results: data.results
        })
      } else {
        alert(`Failed to send emails: ${data.error}`)
      }
    } catch (error) {
      console.error('Error sending emails:', error)
      alert('Failed to send emails')
    } finally {
      setSendingEmails(false)
    }
  }

  // Get status badge
  const getStatusBadge = (cert: Certificate) => {
    // Use certificate's is_rejected flag as authoritative (sample workflow_stage as fallback)
    const isRejected = cert.is_rejected === true || cert.sample?.workflow_stage === 'rejected'
    switch (cert.status) {
      case 'issued':
        return isRejected
          ? <Badge className="bg-red-600 hover:bg-red-700 text-white">Rejected</Badge>
          : <Badge className="bg-green-600 hover:bg-green-700 text-white">Approved</Badge>
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>
      default:
        return <Badge variant="outline">{cert.status}</Badge>
    }
  }

  // Get client display name
  const getClientName = (cert: Certificate): string => {
    if (!cert.sample?.client) return cert.issued_to || '-'
    const client = cert.sample.client
    return client.fantasy_name || client.company || client.name || '-'
  }

  // Check if recipients have emails
  const getSelectedCertificateRecipients = () => {
    const selected = filteredCertificates.filter(c => selectedCertificates.has(c.id))
    const hasExporter = selected.some(c => c.sample?.exporter?.contact_email)
    const hasImporter = selected.some(c => c.sample?.importer?.contact_email)
    const hasRoaster = selected.some(c => c.sample?.roaster?.contact_email)
    return { hasExporter, hasImporter, hasRoaster }
  }

  const recipientAvailability = getSelectedCertificateRecipients()

  // Override dialog state
  const [overrideCertificate, setOverrideCertificate] = useState<Certificate | null>(null)

  // Certificate preview modal state
  const [previewCertificate, setPreviewCertificate] = useState<Certificate | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [showSingleEmailDialog, setShowSingleEmailDialog] = useState(false)
  const [singleEmailSending, setSingleEmailSending] = useState(false)
  const [singleEmailRecipients, setSingleEmailRecipients] = useState({
    exporter: true,
    importer: true,
    roaster: true
  })

  // Handle opening preview modal - use API URL directly so browser respects Content-Disposition filename
  const handleViewCertificate = (cert: Certificate) => {
    setPreviewCertificate(cert)
    if (cert.sample_id) {
      // Pass contract_id for sub-contract certs so the route renders THIS cert's
      // PDF (matching the title) rather than falling back to the mother cert.
      // nocache=1 forces a fresh render so the preview always reflects current
      // sample/template/company data (and re-caches the corrected PDF, healing
      // any stale stored copy used by Download/Email).
      const params = new URLSearchParams()
      if (cert.sample_contract_id) params.set('contract_id', cert.sample_contract_id)
      params.set('nocache', '1')
      setPreviewPdfUrl(`/api/samples/${cert.sample_id}/certificate?${params.toString()}`)
    }
  }

  // Handle closing preview modal
  const handleClosePreview = () => {
    setPreviewCertificate(null)
    setPreviewPdfUrl(null)
  }

  // Handle single certificate email
  const handleSingleEmail = async () => {
    if (!previewCertificate) return
    if (!singleEmailRecipients.exporter && !singleEmailRecipients.importer && !singleEmailRecipients.roaster) {
      alert('Please select at least one recipient type')
      return
    }

    try {
      setSingleEmailSending(true)

      const response = await fetch('/api/certificates/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificateIds: [previewCertificate.id],
          recipients: singleEmailRecipients
        })
      })

      const data = await response.json()

      if (response.ok) {
        alert(`Email sent successfully to ${data.successful} recipient(s)`)
        setShowSingleEmailDialog(false)
      } else {
        alert(`Failed to send email: ${data.error}`)
      }
    } catch (error) {
      console.error('Error sending email:', error)
      alert('Failed to send email')
    } finally {
      setSingleEmailSending(false)
    }
  }

  // Get recipient availability for single certificate
  const getSingleCertRecipients = (cert: Certificate | null) => {
    if (!cert) return { hasExporter: false, hasImporter: false, hasRoaster: false }
    return {
      hasExporter: !!cert.sample?.exporter?.contact_email,
      hasImporter: !!cert.sample?.importer?.contact_email,
      hasRoaster: !!cert.sample?.roaster?.contact_email
    }
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        {/* Batch send toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Range:</span>
            <Button variant="outline" size="sm" onClick={() => { const r = presetRange('today'); setDateFrom(r.from); setDateTo(r.to) }}>Today</Button>
            <Button variant="outline" size="sm" onClick={() => { const r = presetRange('week'); setDateFrom(r.from); setDateTo(r.to) }}>This week</Button>
            <Button variant="outline" size="sm" onClick={() => { const r = presetRange('month'); setDateFrom(r.from); setDateTo(r.to) }}>This month</Button>
          </div>
          <Button size="sm" onClick={() => setShowBatchSend(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Send unsent certificates
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by certificate, contract, client, seller, sample..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="issued">Issued</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>

              {/* Client Filter */}
              <Select value={clientFilter} onValueChange={(value) => {
                setClientFilter(value)
                setQualityFilter('all')
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Quality Filter (cascading from client) */}
              {clientFilter !== 'all' && (() => {
                const clientQualities = qualities.filter(q => q.client_id === clientFilter)
                if (clientQualities.length === 0) return null
                return (
                  <Select value={qualityFilter} onValueChange={setQualityFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Qualities</SelectItem>
                      {clientQualities.map(q => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              })()}

              {/* Date Range */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[140px]"
                  placeholder="From"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[140px]"
                  placeholder="To"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedCertificates.size > 0 && (
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedCertificates.size} certificate{selectedCertificates.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDownload}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download ZIP
                  </Button>
                  {(() => {
                    const selCerts = filteredCertificates.filter(c => selectedCertificates.has(c.id))
                    const sampleIds = Array.from(new Set(selCerts.map(c => c.sample?.id).filter((x): x is string => !!x)))
                    const buyers = new Set(selCerts.map(c => c.buyer_id).filter(Boolean))
                    const sellers = new Set(selCerts.map(c => c.seller_id).filter(Boolean))
                    const canBuyer = buyers.size === 1 && sampleIds.length > 0
                    const canSeller = sellers.size === 1 && sampleIds.length > 0
                    return (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canBuyer}
                          title={canBuyer ? undefined : 'Select certificates that share a single buyer'}
                          onClick={() => setBatchSelection({ sampleIds, side: 'buyer' })}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Send to buyer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canSeller}
                          title={canSeller ? undefined : 'Select certificates that share a single seller'}
                          onClick={() => setBatchSelection({ sampleIds, side: 'seller' })}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Send to seller
                        </Button>
                      </>
                    )
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Certificates Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certificates ({filteredCertificates.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCertificates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No certificates found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-3 px-4 text-left">
                        <Checkbox
                          checked={selectedCertificates.size === filteredCertificates.length && filteredCertificates.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="py-3 px-4 text-left">
                        <button
                          className="flex items-center font-medium text-sm hover:text-primary"
                          onClick={() => handleSort('certificate_number')}
                        >
                          Certificate #
                          <SortIcon field="certificate_number" />
                        </button>
                      </th>
                      <th className="py-3 px-4 text-left">
                        <span className="font-medium text-sm">Sample</span>
                      </th>
                      <th className="py-3 px-4 text-left">
                        <button
                          className="flex items-center font-medium text-sm hover:text-primary"
                          onClick={() => handleSort('issued_to')}
                        >
                          Client
                          <SortIcon field="issued_to" />
                        </button>
                      </th>
                      <th className="py-3 px-4 text-left">
                        <span className="font-medium text-sm">Seller</span>
                      </th>
                      <th className="py-3 px-4 text-left">
                        <button
                          className="flex items-center font-medium text-sm hover:text-primary"
                          onClick={() => handleSort('origin')}
                        >
                          Origin
                          <SortIcon field="origin" />
                        </button>
                      </th>
                      <th className="py-3 px-4 text-left">
                        <button
                          className="flex items-center font-medium text-sm hover:text-primary"
                          onClick={() => handleSort('created_at')}
                        >
                          Issued
                          <SortIcon field="created_at" />
                        </button>
                      </th>
                      <th className="py-3 px-4 text-left">
                        <button
                          className="flex items-center font-medium text-sm hover:text-primary"
                          onClick={() => handleSort('status')}
                        >
                          Status
                          <SortIcon field="status" />
                        </button>
                      </th>
                      <th className="py-3 px-4 text-left">
                        <span className="font-medium text-sm">Sent</span>
                      </th>
                      <th className="py-3 px-4 text-right">
                        <span className="font-medium text-sm">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCertificates.map(cert => (
                      <tr key={cert.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <Checkbox
                            checked={selectedCertificates.has(cert.id)}
                            onCheckedChange={() => toggleSelect(cert.id)}
                          />
                        </td>
                        <td className="py-3 px-4 font-mono text-sm">
                          {cert.certificate_number}
                        </td>
                        <td className="py-3 px-4">
                          {cert.sample ? (
                            <Link
                              href={`/samples/${trackingNumberToSlug(cert.sample.tracking_number)}`}
                              className="text-primary hover:underline"
                            >
                              {cert.sample.sample_type === 'pss' ? (
                                <span>{cert.sample.exporter_sample_number || parseTrackingNumber(cert.sample.tracking_number)}</span>
                              ) : cert.sample.sample_type === 'ss' ? (
                                <div className="flex flex-col leading-tight">
                                  <span>{cert.sample.ico_number || '-'}</span>
                                  <span className="text-xs text-muted-foreground">{cert.sample.container_nr || '-'}</span>
                                </div>
                              ) : (
                                <span>{parseTrackingNumber(cert.sample.tracking_number)}</span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {getClientName(cert)}
                        </td>
                        <td className="py-3 px-4">
                          {cert.sample?.seller?.fantasy_name || cert.sample?.seller?.name || '-'}
                        </td>
                        <td className="py-3 px-4">
                          {cert.sample?.origin || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {new Date(cert.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(cert)}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {(() => {
                            const ss = cert.send_status
                            if (!ss || (!ss.buyerSent && !ss.sellerSent)) {
                              return <span className="text-muted-foreground">—</span>
                            }
                            const sides = [ss.buyerSent, ss.sellerSent].filter(Boolean) as { initials: string; name: string | null; at: string | null }[]
                            const last = [...sides].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))[0]
                            const title = [
                              ss.buyerSent && `Buyer: ${ss.buyerSent.name || ss.buyerSent.initials}${ss.buyerSent.at ? ` · ${new Date(ss.buyerSent.at).toLocaleDateString()}` : ''}`,
                              ss.sellerSent && `Seller: ${ss.sellerSent.name || ss.sellerSent.initials}${ss.sellerSent.at ? ` · ${new Date(ss.sellerSent.at).toLocaleDateString()}` : ''}`,
                            ].filter(Boolean).join('\n')
                            return (
                              <span className={ss.full ? 'text-green-600' : 'text-amber-600'} title={title}>
                                {last.initials}
                                {last.at ? ` ${new Date(last.at).toLocaleDateString()}` : ''}
                                {!ss.full ? ' (partial)' : ''}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {cert.sample_id && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewCertificate(cert)}
                                  title="View Certificate"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownload(cert.sample_id!, cert.certificate_number, cert.sample_contract_id)}
                                  title="Download Certificate"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setOverrideCertificate(cert)}
                                  title="Override Status"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                {isMasterEditor && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditSampleId(cert.sample_id)}
                                    title="Edit Certificate"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Dialog */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Send Certificates via Email</DialogTitle>
              <DialogDescription>
                Select recipient types to send {selectedCertificates.size} certificate{selectedCertificates.size !== 1 ? 's' : ''}.
                PDFs will be attached directly to the emails.
              </DialogDescription>
            </DialogHeader>

            {emailResults ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span>{emailResults.successful} sent</span>
                  </div>
                  {emailResults.failed > 0 && (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span>{emailResults.failed} failed</span>
                    </div>
                  )}
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {emailResults.results.map((result, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg text-sm ${
                        result.success ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{result.name}</span>
                          <span className="text-muted-foreground ml-2">({result.type})</span>
                        </div>
                        {result.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div className="text-muted-foreground">{result.email}</div>
                      {result.error && (
                        <div className="text-red-600 text-xs mt-1">{result.error}</div>
                      )}
                    </div>
                  ))}
                </div>

                <DialogFooter>
                  <Button onClick={() => {
                    setShowEmailDialog(false)
                    setEmailResults(null)
                  }}>
                    Close
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                <div className="space-y-4 py-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="exporter"
                        checked={emailRecipients.exporter}
                        onCheckedChange={(checked) =>
                          setEmailRecipients(prev => ({ ...prev, exporter: !!checked }))
                        }
                        disabled={!recipientAvailability.hasExporter}
                      />
                      <label
                        htmlFor="exporter"
                        className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed ${
                          !recipientAvailability.hasExporter ? 'text-muted-foreground' : ''
                        }`}
                      >
                        Exporter
                        {!recipientAvailability.hasExporter && (
                          <span className="ml-2 text-xs text-muted-foreground">(no email)</span>
                        )}
                      </label>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="importer"
                        checked={emailRecipients.importer}
                        onCheckedChange={(checked) =>
                          setEmailRecipients(prev => ({ ...prev, importer: !!checked }))
                        }
                        disabled={!recipientAvailability.hasImporter}
                      />
                      <label
                        htmlFor="importer"
                        className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed ${
                          !recipientAvailability.hasImporter ? 'text-muted-foreground' : ''
                        }`}
                      >
                        Importer
                        {!recipientAvailability.hasImporter && (
                          <span className="ml-2 text-xs text-muted-foreground">(no email)</span>
                        )}
                      </label>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="roaster"
                        checked={emailRecipients.roaster}
                        onCheckedChange={(checked) =>
                          setEmailRecipients(prev => ({ ...prev, roaster: !!checked }))
                        }
                        disabled={!recipientAvailability.hasRoaster}
                      />
                      <label
                        htmlFor="roaster"
                        className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed ${
                          !recipientAvailability.hasRoaster ? 'text-muted-foreground' : ''
                        }`}
                      >
                        Roaster
                        {!recipientAvailability.hasRoaster && (
                          <span className="ml-2 text-xs text-muted-foreground">(no email)</span>
                        )}
                      </label>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Each recipient will receive an email with their relevant certificate PDFs attached directly.
                  </p>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleBulkEmail} disabled={sendingEmails}>
                    {sendingEmails ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Send Emails
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Certificate Preview Modal */}
        <Dialog open={!!previewCertificate} onOpenChange={(open) => !open && handleClosePreview()}>
          <DialogContent className="sm:max-w-[1400px] w-[96vw] max-h-[96vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Certificate {previewCertificate?.certificate_number}
              </DialogTitle>
              <DialogDescription>
                {previewCertificate?.sample?.origin && (
                  <span>Origin: {previewCertificate.sample.origin}</span>
                )}
                {previewCertificate?.sample?.client && (
                  <span className="ml-4">
                    Client: {previewCertificate.sample.client.fantasy_name ||
                            previewCertificate.sample.client.company ||
                            previewCertificate.sample.client.name}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-[78vh] bg-muted rounded-lg overflow-hidden">
              {previewPdfUrl ? (
                <iframe
                  src={previewPdfUrl}
                  className="w-full h-[80vh] border-0"
                  title="Certificate Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Unable to load certificate preview
                </div>
              )}
            </div>

            <DialogFooter className="flex-row gap-2 sm:gap-2">
              {previewCertificate?.sample_id && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleDownload(previewCertificate.sample_id!, previewCertificate.certificate_number, previewCertificate.sample_contract_id)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowSingleEmailDialog(true)}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </Button>
                </>
              )}
              <Button variant="default" onClick={handleClosePreview}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Override Status Dialog */}
        {overrideCertificate && (
          <OverrideStatusDialog
            open={!!overrideCertificate}
            onOpenChange={(open) => !open && setOverrideCertificate(null)}
            certificateId={overrideCertificate.id}
            certificateNumber={overrideCertificate.certificate_number}
            currentlyRejected={!!overrideCertificate.is_rejected}
            onSuccess={() => {
              loadCertificates(searchQuery)
              // No approval email is sent here — the decision is recorded and
              // written back to sys by the override route. Anderson sends all
              // pending certificates at end of day via "Send unsent certificates".
              toast({ title: 'Status updated' })
            }}
          />
        )}

        <BatchApprovalSendView
          open={showBatchSend}
          range={{ from: dateFrom, to: dateTo }}
          onClose={() => setShowBatchSend(false)}
          onSent={() => loadCertificates(searchQuery)}
        />

        <BatchApprovalSendView
          open={!!batchSelection}
          selection={batchSelection ?? undefined}
          onClose={() => setBatchSelection(null)}
          onSent={() => {
            loadCertificates(searchQuery)
            setSelectedCertificates(new Set())
          }}
        />

        <SampleDetailOverlay
          open={!!editSampleId}
          sampleId={editSampleId}
          onOpenChange={(o) => { if (!o) setEditSampleId(null) }}
          onSaved={() => loadCertificates(searchQuery)}
        />

        {/* Single Certificate Email Dialog */}
        <Dialog open={showSingleEmailDialog} onOpenChange={setShowSingleEmailDialog}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Send Certificate via Email</DialogTitle>
              <DialogDescription>
                Send certificate {previewCertificate?.certificate_number} to selected recipients.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-3">
                {(() => {
                  const availability = getSingleCertRecipients(previewCertificate)
                  return (
                    <>
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="single-exporter"
                          checked={singleEmailRecipients.exporter}
                          onCheckedChange={(checked) =>
                            setSingleEmailRecipients(prev => ({ ...prev, exporter: !!checked }))
                          }
                          disabled={!availability.hasExporter}
                        />
                        <label
                          htmlFor="single-exporter"
                          className={`text-sm font-medium leading-none ${
                            !availability.hasExporter ? 'text-muted-foreground' : ''
                          }`}
                        >
                          Exporter
                          {!availability.hasExporter && (
                            <span className="ml-2 text-xs text-muted-foreground">(no email)</span>
                          )}
                          {availability.hasExporter && previewCertificate?.sample?.exporter?.contact_email && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({previewCertificate.sample.exporter.contact_email})
                            </span>
                          )}
                        </label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="single-importer"
                          checked={singleEmailRecipients.importer}
                          onCheckedChange={(checked) =>
                            setSingleEmailRecipients(prev => ({ ...prev, importer: !!checked }))
                          }
                          disabled={!availability.hasImporter}
                        />
                        <label
                          htmlFor="single-importer"
                          className={`text-sm font-medium leading-none ${
                            !availability.hasImporter ? 'text-muted-foreground' : ''
                          }`}
                        >
                          Importer
                          {!availability.hasImporter && (
                            <span className="ml-2 text-xs text-muted-foreground">(no email)</span>
                          )}
                          {availability.hasImporter && previewCertificate?.sample?.importer?.contact_email && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({previewCertificate.sample.importer.contact_email})
                            </span>
                          )}
                        </label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="single-roaster"
                          checked={singleEmailRecipients.roaster}
                          onCheckedChange={(checked) =>
                            setSingleEmailRecipients(prev => ({ ...prev, roaster: !!checked }))
                          }
                          disabled={!availability.hasRoaster}
                        />
                        <label
                          htmlFor="single-roaster"
                          className={`text-sm font-medium leading-none ${
                            !availability.hasRoaster ? 'text-muted-foreground' : ''
                          }`}
                        >
                          Roaster
                          {!availability.hasRoaster && (
                            <span className="ml-2 text-xs text-muted-foreground">(no email)</span>
                          )}
                          {availability.hasRoaster && previewCertificate?.sample?.roaster?.contact_email && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({previewCertificate.sample.roaster.contact_email})
                            </span>
                          )}
                        </label>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSingleEmailDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSingleEmail} disabled={singleEmailSending}>
                {singleEmailSending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Send Email
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}
