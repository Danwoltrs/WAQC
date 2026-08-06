'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SampleIntakeForm } from '@/components/samples/sample-intake-form'
import { INTAKE_DIALOG_CONTENT_CLASS } from '@/components/samples/sample-intake-dialog'
import { SampleDetailOverlay } from '@/components/certificates/cert-editor'
import { AddSubContractDialog } from '@/components/samples/add-sub-contract-dialog'
import { PrintLabelsDialog } from '@/components/samples/print-labels-dialog'
import { TinLabelSizeDialog } from '@/components/samples/tin-label-size-dialog'
import { PrintCuppingCardsDialog } from '@/components/cupping/print-cupping-cards-dialog'
import { canReprintCuppingCards } from '@/lib/cupping/reprint'
import { AssignCuppersDialog } from '@/components/samples/assign-cuppers-dialog'
import { DuplicateCountPopover, type DuplicateBagOverride } from '@/components/samples/duplicate-count-popover'
import { useToast } from '@/hooks/use-toast'
import { certificateFilenameFromResponse } from '@/lib/certificate-filename'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Plus, Search, Filter, Eye, MapPin, Calendar,
  CheckCircle, XCircle, Clock, AlertCircle, FileText,
  Download, Printer, QrCode, MoreVertical, Users, Trash2,
  Loader2, Award, Mail, Settings2, ChevronDown, ChevronRight, Edit
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'

interface SubContract {
  id: string
  tracking_number: string
  importer_name: string | null
  roaster_name: string | null
  end_client_name: string | null
  qc_client_name: string | null
  buyer_contract_nr: string | null
  wolthers_contract_nr: string | null
  roaster_contract_nr: string | null
  end_client_contract_nr: string | null
  qc_client_contract_nr: string | null
  supplier_contract_nr: string | null
  ico_number: string | null
  container_nr: string | null
  bags_quantity_mt: number | null
  has_certificate: boolean
  certificate_id: string | null
  certificate_number: string | null
}

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: string
  seller_name?: string
  seller_country?: string
  exporter_name?: string
  exporter_country?: string
  origin?: string
  importer_name?: string
  importer_country?: string
  roaster_name?: string
  roaster_country?: string
  end_client_name?: string
  end_client_country?: string
  qc_client_name?: string
  qc_client_country?: string
  importer_is_qc_client?: boolean
  same_seller_shipper?: boolean
  buyer?: string
  quality_name?: string
  sample_type?: 'pss' | 'ss' | 'type'
  status: string
  workflow_stage?: string
  cards_printed_at?: string | null
  storage_position?: string
  bags_quantity_mt?: number
  wolthers_contract_nr?: string
  seller_contract_nr?: string
  exporter_contract_nr?: string
  buyer_contract_nr?: string
  roaster_contract_nr?: string
  shipper_contract_nr?: string
  qc_client_contract_nr?: string
  end_client_contract_nr?: string
  supplier_contract_nr?: string
  ico_number?: string
  container_nr?: string
  exporter_sample_number?: string | null
  bag_count?: number
  bag_weight_kg?: number
  bag_type?: string
  shipment_month?: string
  laboratory_id?: string
  created_at: string
  quality_spec_id?: string
  // Certificate info (flattened from API)
  certificate_id?: string | null
  certificate_number?: string | null
  certificate_status?: string | null
  certificate_created_at?: string | null
  // Relations that might be loaded for print dialog
  client?: {
    id: string
    company: string
  }
  laboratory?: {
    id: string
    name: string
    code: string
  }
  quality_spec?: {
    id: string
    template_id?: string
    custom_parameters?: any
    template?: {
      id: string
      name: string
      parameters?: any
    }
  }
  contract_count?: number
  sub_contract_tracking_numbers?: string[]
  sub_contracts?: SubContract[]
}

// Helper function to extract clean tracking number from potential JSON
const parseTrackingNumber = (trackingNumber: string): string => {
  try {
    // Check if it's a JSON object string
    if (trackingNumber.startsWith('{')) {
      const parsed = JSON.parse(trackingNumber)
      return parsed.pattern || trackingNumber
    }
    return trackingNumber
  } catch {
    // If parsing fails, return as-is
    return trackingNumber
  }
}

// Helper function to format sample type for display
const formatSampleType = (type: string | undefined): string => {
  if (!type) return '-'
  const typeMap: Record<string, string> = {
    'pss': 'PSS',
    'ss': 'SS',
    'stocklot': 'Stocklot',
    'offer': 'Offer',
    'spot': 'Spot'
  }
  return typeMap[type] || type.toUpperCase()
}

// The table's header row pins directly below the filter bar. Its offset is
// measured rather than hard-coded, because the bar wraps to a second line on a
// narrow window. The background must be opaque or rows scroll through it, and
// the separator is an inset shadow because a collapsed-border bottom is dropped
// once a cell is sticky.
const TABLE_HEAD_STICKY =
  'sticky z-[5] bg-muted shadow-[inset_0_-1px_0_hsl(var(--border))]'
const TABLE_HEAD_CELL =
  `${TABLE_HEAD_STICKY} text-left py-2.5 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground`

// Used until the bar has been measured: pt-3 + a 36px control row + pb-3.
const DEFAULT_HEADER_HEIGHT = 60

export default function SamplesPage() {
  const { profile } = useAuth()
  const [samples, setSamples] = useState<Sample[]>([])
  const [detailSampleId, setDetailSampleId] = useState<string | null>(null)
  // When the detail modal is opened from a sub-contract row, this carries the
  // sub-contract id so the modal shows that contract's parties/number.
  const [detailContractId, setDetailContractId] = useState<string | null>(null)
  const [detailStartInEditMode, setDetailStartInEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [sampleTypeFilter, setSampleTypeFilter] = useState<string | null>(null)
  const [originFilter, setOriginFilter] = useState<string>('')
  const [qualityFilter, setQualityFilter] = useState<string>('')
  const [workflowStageFilter, setWorkflowStageFilter] = useState<string | null>(null)
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(new Set())
  const [selectedQrCodes, setSelectedQrCodes] = useState<Set<string>>(new Set())
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [showTinLabelDialog, setShowTinLabelDialog] = useState(false)
  // The header is a compact filter bar: search, stage chips, the advanced
  // filters and the actions, all in one pinned row.
  //
  // Held in state, not a ref: MainLayout renders a spinner instead of its
  // children while auth resolves, so on the first commit this node does not
  // exist yet and a mount-once effect would wire itself to nothing.
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_HEADER_HEIGHT)
  const [pendingTodayIds, setPendingTodayIds] = useState<string[]>([])
  // Why the batch is empty, when it is. Without this a failing lookup and a
  // genuinely quiet day look identical, and the button silently does nothing.
  const [pendingTodayError, setPendingTodayError] = useState<string | null>(null)
  // An explicit batch when the "print today's unprinted" button drives the
  // dialog; null means the dialog uses the current row selection, as before.
  const [tinLabelBatchIds, setTinLabelBatchIds] = useState<string[] | null>(null)
  const [showCuppingCardsDialog, setShowCuppingCardsDialog] = useState(false)
  const [showAssignCuppersDialog, setShowAssignCuppersDialog] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteSampleTarget, setDeleteSampleTarget] = useState<Sample | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [deleteSubContractTarget, setDeleteSubContractTarget] = useState<{ sample: Sample; sc: SubContract } | null>(null)
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set())
  const [selectedSubContractQrCodes, setSelectedSubContractQrCodes] = useState<Set<string>>(new Set())
  const [subContractSample, setSubContractSample] = useState<Sample | null>(null)
  // Mouse-anchored "Duplicate sample" popover state. Captures the click coords
  // so the popover renders at the cursor; busy flag disables it during inserts.
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ sample: Sample; x: number; y: number } | null>(null)
  const [duplicating, setDuplicating] = useState(false)
  const { toast } = useToast()

  // Certificate preview modal states
  const [previewSample, setPreviewSample] = useState<Sample | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  // Cert number of the SPECIFIC certificate being previewed. For a sub-contract
  // this is the child's minted number — the mother sample's certificate_number
  // would be wrong. Kept separate so the title matches the rendered PDF.
  const [previewCertNumber, setPreviewCertNumber] = useState<string | null>(null)
  const [downloadingSampleId, setDownloadingSampleId] = useState<string | null>(null)

  // Track assigned cuppers for selected samples
  const [assignedCuppers, setAssignedCuppers] = useState<Array<{
    id: string
    full_name: string
    email: string
  }>>([])
  const [cuppersAssigned, setCuppersAssigned] = useState(false)
  const [existingCupperIds, setExistingCupperIds] = useState<string[]>([])
  const [loadingCupperAssignments, setLoadingCupperAssignments] = useState(false)

  // Per-sample cupper assignment map (loaded for all visible samples)
  const [sampleCupperMap, setSampleCupperMap] = useState<Record<string, {
    cuppers: Array<{ id: string; full_name: string; email: string }>
    session_id: string
  }>>({})

  // Unique values for filters
  const [origins, setOrigins] = useState<string[]>([])
  const [qualities, setQualities] = useState<string[]>([])

  // Column visibility. v3 swaps defaults: Seller is now default-on (was off),
  // Shipper + End client are default-off (was on) per the QC tracker spec. The
  // localStorage key is bumped so existing layouts pick up the new defaults
  // once.
  const defaultColumnVisibility: Record<string, boolean> = {
    reference: true,
    origin: false,
    type: true,
    wolthers: true,
    quality: true,
    seller: true,
    shipper: false,
    importer: true,
    roaster: false,
    endClient: false,
    status: true,
    storage: false,
    created: true,
  }
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('samplesTableColumns_v3')
        if (stored) return { ...defaultColumnVisibility, ...JSON.parse(stored) }
      } catch {}
    }
    return defaultColumnVisibility
  })

  const toggleColumn = (col: string) => {
    setColumnVisibility(prev => {
      const next = { ...prev, [col]: !prev[col] }
      localStorage.setItem('samplesTableColumns_v3', JSON.stringify(next))
      return next
    })
  }

  // "Wolthers" became "W&A REF" — same column key, just the chip label changed.
  const columnLabels: Record<string, string> = {
    reference: 'Reference',
    wolthers: 'W&A REF',
    type: 'Type',
    quality: 'Quality',
    seller: 'Seller',
    shipper: 'Shipper',
    importer: 'Importer',
    roaster: 'Roaster',
    endClient: 'End Client',
    status: 'Status',
    origin: 'Origin',
    storage: 'Storage',
    created: 'Created',
  }

  // Check if user is global admin
  const isGlobalAdmin = profile?.is_global_admin || profile?.qc_role === 'global_admin'

  // Consume command-palette deep links: ?open=<sampleId> opens the detail modal,
  // ?q=<text> prefills the search box. Runs once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    const q = params.get('q')
    if (q) setSearchQuery(q)
    if (open) setDetailSampleId(open)
    if (open || q) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  useEffect(() => {
    loadSamples()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sampleTypeFilter, workflowStageFilter])

  useEffect(() => {
    if (!headerEl) return
    // Floor, so a fractional header height leaves the pinned row a hair behind
    // the bar rather than a hairline gap for rows to show through.
    const measure = () => setHeaderHeight(Math.floor(headerEl.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(headerEl)
    return () => observer.disconnect()
  }, [headerEl])

  const refreshPendingToday = useCallback(async () => {
    try {
      const response = await fetch('/api/samples/tin-labels/pending-today')
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const detail = data?.details || data?.error || `HTTP ${response.status}`
        console.error('Failed to load today\'s unprinted tin labels:', detail)
        setPendingTodayIds([])
        setPendingTodayError(String(detail))
        return
      }
      setPendingTodayIds(Array.isArray(data?.sample_ids) ? data.sample_ids : [])
      setPendingTodayError(null)
    } catch (error) {
      // A broken badge is not worth interrupting the page for, but it must not
      // be indistinguishable from "nothing to print".
      console.error('Failed to load today\'s unprinted tin labels:', error)
      setPendingTodayIds([])
      setPendingTodayError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    refreshPendingToday()
  }, [refreshPendingToday])

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
            s.seller_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.exporter_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.origin?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.importer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.roaster_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.end_client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.buyer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.wolthers_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.seller_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.exporter_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.buyer_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.roaster_contract_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.ico_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.container_nr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.exporter_sample_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.qc_client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.quality_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.certificate_number?.toLowerCase().includes(searchQuery.toLowerCase())
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

        // Load cupper assignments for all visible samples
        loadSampleCupperMap(filtered.map((s: Sample) => s.id))

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

  const loadSampleCupperMap = async (sampleIds: string[]) => {
    if (sampleIds.length === 0) {
      setSampleCupperMap({})
      return
    }
    try {
      const response = await fetch('/api/cupping/sample-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds }),
      })
      if (response.ok) {
        const data = await response.json()
        setSampleCupperMap(data.assignments || {})
      }
    } catch (error) {
      console.error('Error loading sample cupper map:', error)
    }
  }

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (samples.length > 0 || searchQuery || originFilter || qualityFilter || dateFrom || dateTo) {
        loadSamples()
      }
    }, 300)
    return () => clearTimeout(debounce)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, originFilter, qualityFilter, dateFrom, dateTo])

  // Fetch existing cupper assignments when selected samples change
  useEffect(() => {
    if (selectedSamples.size === 0) {
      setExistingCupperIds([])
      setAssignedCuppers([])
      setCuppersAssigned(false)
      return
    }

    const fetchExistingCuppers = async () => {
      setLoadingCupperAssignments(true)
      try {
        const sampleIds = Array.from(selectedSamples)
        const params = new URLSearchParams()
        sampleIds.forEach(id => params.append('sample_ids', id))

        const response = await fetch(`/api/cupping/session-cuppers?${params}`)
        if (response.ok) {
          const data = await response.json()
          if (data.cuppers && data.cuppers.length > 0) {
            setExistingCupperIds(data.cuppers.map((c: any) => c.id))
            setAssignedCuppers(data.cuppers)
            setCuppersAssigned(true)
          } else {
            setExistingCupperIds([])
            setAssignedCuppers([])
            setCuppersAssigned(false)
          }
        }
      } catch (error) {
        console.error('Error fetching existing cupper assignments:', error)
      } finally {
        setLoadingCupperAssignments(false)
      }
    }

    fetchExistingCuppers()
  }, [selectedSamples])

  const handleSampleCreated = (trackingNumber: string) => {
    setDialogOpen(false)
    loadSamples()
  }

  const handleToggleQrCode = (sampleId: string, checked: boolean) => {
    const newQrCodes = new Set(selectedQrCodes)
    if (checked) {
      newQrCodes.add(sampleId)
    } else {
      newQrCodes.delete(sampleId)
    }
    setSelectedQrCodes(newQrCodes)
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

  const handleBulkPrintLabels = () => {
    if (selectedSamples.size === 0) {
      alert('Please select at least one sample')
      return
    }
    setShowPrintDialog(true)
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

  const handleBulkPrintBagSleeves = async () => {
    if (selectedSamples.size === 0) {
      alert('Please select at least one sample')
      return
    }

    try {
      // Create sample-specific QR code flags (mother samples + sub-contracts)
      const sampleQrConfig: Array<{ id: string; includeQrCode: boolean; contractId?: string }> = Array.from(selectedSamples).map(id => ({
        id,
        includeQrCode: selectedQrCodes.has(id)
      }))

      // Add sub-contract entries for any with QR selected
      for (const sample of samples) {
        if (!selectedSamples.has(sample.id) || !sample.sub_contracts?.length) continue
        for (const sc of sample.sub_contracts) {
          if (selectedSubContractQrCodes.has(sc.id)) {
            sampleQrConfig.push({ id: sample.id, contractId: sc.id, includeQrCode: true })
          }
        }
      }

      const response = await fetch('/api/samples/bulk/print-bag-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: sampleQrConfig })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bag-sleeves-${new Date().toISOString().split('T')[0]}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } else {
        const error = await response.json()
        console.error('Failed to generate bag sleeve labels:', error)
        alert(`Failed to generate bag sleeve labels.\n\n${error.error}${error.details ? '\n\nDetails: ' + error.details : ''}`)
      }
    } catch (error) {
      console.error('Error printing bag sleeve labels:', error)
      alert(`Error generating bag sleeve labels.\n\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleBulkPrintCuppingCards = () => {
    if (selectedSamples.size === 0) return
    // Collect unique cuppers from all selected samples via sampleCupperMap
    const cupperMap = new Map<string, { id: string; full_name: string; email: string }>()
    for (const sampleId of selectedSamples) {
      const assignment = sampleCupperMap[sampleId]
      if (assignment?.cuppers) {
        assignment.cuppers.forEach(c => cupperMap.set(c.id, c))
      }
    }
    const allCuppers = Array.from(cupperMap.values())
    if (allCuppers.length > 0) {
      setAssignedCuppers(allCuppers)
      setCuppersAssigned(true)
    }
    setShowCuppingCardsDialog(true)
  }

  const handleBulkPrintTinSleeves = () => {
    if (selectedSamples.size === 0) {
      alert('Please select at least one sample')
      return
    }
    setShowTinLabelDialog(true)
  }

  const handleBulkAssign = () => {
    if (selectedSamples.size === 0) return
    setShowAssignCuppersDialog(true)
  }

  const handleSingleSampleAssign = (sample: Sample) => {
    // Select just this sample and open the assign dialog
    setSelectedSamples(new Set([sample.id]))
    setSelectedQrCodes(new Set([sample.id]))
    const assignment = sampleCupperMap[sample.id]
    if (assignment) {
      setExistingCupperIds(assignment.cuppers.map(c => c.id))
      setAssignedCuppers(assignment.cuppers)
      setCuppersAssigned(true)
    } else {
      setExistingCupperIds([])
      setAssignedCuppers([])
      setCuppersAssigned(false)
    }
    setShowAssignCuppersDialog(true)
  }

  const handleSingleSampleReprintCards = (sample: Sample) => {
    setSelectedSamples(new Set([sample.id]))
    setSelectedQrCodes(new Set([sample.id]))
    const assignment = sampleCupperMap[sample.id]
    if (assignment?.cuppers && assignment.cuppers.length > 0) {
      setAssignedCuppers(assignment.cuppers)
      setCuppersAssigned(true)
    }
    // Always open dialog - it will fetch cuppers from session as fallback
    setShowCuppingCardsDialog(true)
  }

  const handleCuppersAssigned = async (cupperIds: string[], cuppers: Array<{ id: string; full_name: string; email: string }>) => {
    setAssignedCuppers(cuppers)
    setCuppersAssigned(true)
    console.log('Cuppers assigned:', cuppers)

    // Send notifications to assigned cuppers via API. This call also advances
    // the samples' workflow_stage to 'analysis' — if it fails, the sample stays
    // stuck at "received" on the tracker, so we surface the error loudly.
    const sampleIds = Array.from(selectedSamples)
    let assignSucceeded = false
    try {
      const response = await fetch('/api/notifications/samples-assigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cupper_ids: cupperIds,
          sample_ids: sampleIds,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to assign cuppers:', errorData)
        toast({
          title: 'Cupper assignment failed',
          description: errorData.details || errorData.error || 'The samples may still show as Received. Check the server logs and try again.',
          variant: 'destructive',
        })
      } else {
        const data = await response.json()
        console.log('Notifications sent:', data)
        assignSucceeded = true
      }
    } catch (error) {
      console.error('Error sending cupper assignment notifications:', error)
      toast({
        title: 'Cupper assignment failed',
        description: error instanceof Error ? error.message : 'Network error while assigning cuppers.',
        variant: 'destructive',
      })
    }

    if (!assignSucceeded) {
      loadSamples()
      return
    }

    // Update the per-sample cupper map for the assigned samples
    const sampleIdsForMap = Array.from(selectedSamples)
    const updatedMap = { ...sampleCupperMap }
    for (const sampleId of sampleIdsForMap) {
      updatedMap[sampleId] = {
        cuppers: cuppers,
        session_id: '', // Will be refreshed on next load
      }
    }
    setSampleCupperMap(updatedMap)

    // Automatically open print cupping cards dialog
    setShowCuppingCardsDialog(true)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allSampleIds = new Set(samples.map(s => s.id))
      setSelectedSamples(allSampleIds)
      setSelectedQrCodes(allSampleIds) // Auto-select QR codes
    } else {
      setSelectedSamples(new Set())
      setSelectedQrCodes(new Set())
    }
  }

  const handleSelectSample = (sampleId: string, checked: boolean) => {
    const newSelected = new Set(selectedSamples)
    const newQrCodes = new Set(selectedQrCodes)
    if (checked) {
      newSelected.add(sampleId)
      newQrCodes.add(sampleId) // Auto-select QR code
    } else {
      newSelected.delete(sampleId)
      newQrCodes.delete(sampleId) // Remove QR code selection
    }
    setSelectedSamples(newSelected)
    setSelectedQrCodes(newQrCodes)
  }

  // Opens the in-app confirmation modal; actual delete runs in confirmDeleteSample.
  const handleDeleteSample = (sample: Sample) => {
    setDeleteSampleTarget(sample)
  }

  const confirmDeleteSample = async () => {
    const sample = deleteSampleTarget
    if (!sample) return
    const sampleNumber = parseTrackingNumber(sample.tracking_number)
    setDeleteSampleTarget(null)

    try {
      setDeletingId(sample.id)
      const response = await fetch(`/api/samples/${sample.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete sample')
      }

      // Remove from local state immediately
      setSamples(prevSamples => prevSamples.filter(s => s.id !== sample.id))
      setSelectedSamples(prev => {
        const newSet = new Set(prev)
        newSet.delete(sample.id)
        return newSet
      })

      toast({ title: 'Sample deleted', description: `Sample ${sampleNumber} deleted successfully` })
    } catch (error) {
      console.error('Error deleting sample:', error)
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete sample. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkDelete = () => {
    if (selectedSamples.size === 0) {
      toast({
        title: 'No samples selected',
        description: 'Please select at least one sample to delete',
        variant: 'destructive',
      })
      return
    }
    setBulkDeleteOpen(true)
  }

  const confirmBulkDelete = async () => {
    setBulkDeleteOpen(false)
    try {
      let successCount = 0
      let failCount = 0
      const sampleIds = Array.from(selectedSamples)

      for (const sampleId of sampleIds) {
        try {
          const response = await fetch(`/api/samples/${sampleId}`, {
            method: 'DELETE'
          })

          if (response.ok) {
            successCount++
            // Remove from local state immediately
            setSamples(prev => prev.filter(s => s.id !== sampleId))
          } else {
            failCount++
          }
        } catch (error) {
          console.error(`Error deleting sample ${sampleId}:`, error)
          failCount++
        }
      }

      setSelectedSamples(new Set())

      if (failCount > 0) {
        toast({
          title: 'Bulk delete finished',
          description: `Deleted ${successCount} sample(s). ${failCount} failed.`,
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Samples deleted', description: `Successfully deleted ${successCount} sample(s)` })
      }
    } catch (error) {
      console.error('Error in bulk delete:', error)
      toast({ title: 'Delete failed', description: 'Failed to delete samples. Please try again.', variant: 'destructive' })
    }
  }

  // Certificate handlers
  const handleViewCertificate = (sample: Sample) => {
    setPreviewSample(sample)
    setPreviewCertNumber(sample.certificate_number || parseTrackingNumber(sample.tracking_number))
    // Use direct API URL so the browser's PDF viewer respects Content-Disposition filename
    setPreviewPdfUrl(`/api/samples/${sample.id}/certificate`)
  }

  const handleClosePreview = () => {
    setPreviewSample(null)
    setPreviewPdfUrl(null)
    setPreviewCertNumber(null)
  }

  const handleDownloadCertificate = async (sample: Sample) => {
    try {
      setDownloadingSampleId(sample.id)
      const response = await fetch(`/api/samples/${sample.id}/certificate`)

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        // Use the server's filename (official cert number + buyer reference),
        // not the internal lab number the page may have loaded.
        a.download = certificateFilenameFromResponse(response, sample.certificate_number, sample.buyer_contract_nr)
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        console.error('Failed to download certificate')
      }
    } catch (error) {
      console.error('Error downloading certificate:', error)
    } finally {
      setDownloadingSampleId(null)
    }
  }

  const handleDownloadSubContractCertificate = async (sampleId: string, contractId: string, trackingNumber: string) => {
    try {
      setDownloadingSampleId(`${sampleId}_${contractId}`)
      const response = await fetch(`/api/samples/${sampleId}/certificate?contract_id=${contractId}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        // The sub-contract cert route sets Content-Disposition to its own minted
        // number + buyer reference; prefer that over the raw tracking number.
        a.download = certificateFilenameFromResponse(response, trackingNumber)
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error downloading sub-contract certificate:', error)
    } finally {
      setDownloadingSampleId(null)
    }
  }

  const handleViewSubContractCertificate = (sampleId: string, sc: SubContract) => {
    setPreviewSample(samples.find(s => s.id === sampleId) || null)
    // Title must reflect the SUB-CONTRACT's own minted number, not the mother's.
    setPreviewCertNumber(sc.certificate_number || sc.tracking_number)
    setPreviewPdfUrl(`/api/samples/${sampleId}/certificate?contract_id=${sc.id}`)
  }

  const handleDeleteSubContract = (sample: Sample, sc: SubContract) => {
    setDeleteSubContractTarget({ sample, sc })
  }

  const confirmDeleteSubContract = async () => {
    if (!deleteSubContractTarget) return
    const { sample, sc } = deleteSubContractTarget
    setDeleteSubContractTarget(null)

    try {
      setDeletingId(sc.id)
      const response = await fetch(
        `/api/samples/${sample.id}/contracts?contract_id=${sc.id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete sub-contract')
      }

      // Remove from local state
      setSamples(prev => prev.map(s => {
        if (s.id !== sample.id) return s
        const remaining = s.sub_contracts?.filter(c => c.id !== sc.id) || []
        return {
          ...s,
          sub_contracts: remaining,
          contract_count: remaining.length,
        }
      }))
      // Collapse if no sub-contracts left
      const remainingCount = (sample.sub_contracts?.length ?? 1) - 1
      if (remainingCount <= 0) {
        setExpandedSamples(prev => {
          const next = new Set(prev)
          next.delete(sample.id)
          return next
        })
      }
    } catch (error) {
      console.error('Error deleting sub-contract:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete sub-contract.')
    } finally {
      setDeletingId(null)
    }
  }

  const toggleExpand = (sampleId: string) => {
    setExpandedSamples(prev => {
      const next = new Set(prev)
      if (next.has(sampleId)) {
        next.delete(sampleId)
      } else {
        next.add(sampleId)
      }
      return next
    })
  }

  // Duplicate sample (SS flow): create a new independent sample record with the same contract
  // Open the mouse-anchored duplicate-count popover.
  // Reads coords from the original ContextMenu trigger event when available
  // (the click that opened the menu), so the popover anchors near the cursor
  // rather than wherever the menu item happened to render.
  const openDuplicatePrompt = (sample: Sample, event: React.MouseEvent) => {
    setDuplicatePrompt({ sample, x: event.clientX, y: event.clientY })
  }

  const handleDuplicateSubmit = async (count: number, bags: DuplicateBagOverride) => {
    const target = duplicatePrompt?.sample
    if (!target) return
    setDuplicating(true)
    try {
      const res = await fetch(`/api/samples/${target.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, ...bags }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        // Surface the first DB error from the server's errors[] array so the
        // toast shows the actual reason (e.g. unique constraint) instead of a
        // generic message that hides the failure mode.
        const firstError = Array.isArray(data?.errors) && data.errors.length > 0
          ? data.errors[0]
          : null
        toast({
          title: 'Duplicate failed',
          description: firstError || data?.error || 'Failed to duplicate sample',
          variant: 'destructive',
        })
        return
      }
      const created = Array.isArray(data?.samples) ? data.samples.length : 0
      const failed = typeof data?.failed === 'number' ? data.failed : 0
      if (failed > 0) {
        toast({
          title: 'Partial success',
          description: `Created ${created} of ${count} duplicates (${failed} failed).`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: created === 1 ? 'Sample duplicated' : 'Samples duplicated',
          description: created === 1
            ? `New sample: ${data.samples[0]?.tracking_number}`
            : `Created ${created} duplicates of ${target.tracking_number}.`,
        })
      }
      setDuplicatePrompt(null)
      loadSamples()
    } catch (error) {
      console.error('Error duplicating sample:', error)
      toast({
        title: 'Duplicate failed',
        description: 'Failed to duplicate sample',
        variant: 'destructive',
      })
    } finally {
      setDuplicating(false)
    }
  }

  const handleToggleSubContractQrCode = (scId: string, checked: boolean) => {
    setSelectedSubContractQrCodes(prev => {
      const next = new Set(prev)
      if (checked) next.add(scId)
      else next.delete(scId)
      return next
    })
  }

  // Status as a single colored pill (Received / In progress / Approved /
  // Rejected / Under review). The stage caption ("Certified", "Analysis", …)
  // was removed at user request — Approved already implies Certified, so the
  // extra line was noise.
  const renderStatusCell = (status: string) => {
    const statusConfig: Record<string, { icon: any; label: string; className: string }> = {
      received: { icon: Clock, label: 'Received', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
      in_progress: { icon: AlertCircle, label: 'In progress', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
      under_review: { icon: Eye, label: 'Under review', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
      approved: { icon: CheckCircle, label: 'Approved', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
      rejected: { icon: XCircle, label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    }
    const config = statusConfig[status] || { icon: AlertCircle, label: status, className: 'bg-muted text-muted-foreground' }
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    )
  }

  // Secondary identifier shown under the cert nr on the Reference cell.
  // Priority: container > ICO > exporter sample number (confirmed with Daniel).
  // Returns null when nothing applies so the cell stays clean.
  const getSecondaryRef = (
    sample: Pick<Sample, 'container_nr' | 'ico_number' | 'exporter_sample_number'>
  ): { tag: 'CTR' | 'ICO' | 'SMP'; value: string } | null => {
    if (sample.container_nr) return { tag: 'CTR', value: sample.container_nr }
    if (sample.ico_number) return { tag: 'ICO', value: sample.ico_number }
    if (sample.exporter_sample_number) return { tag: 'SMP', value: sample.exporter_sample_number }
    return null
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

  const hasCertifiedSelected = selectedSamples.size > 0 && samples.some(s => selectedSamples.has(s.id) && (s.workflow_stage === 'certified' || s.workflow_stage === 'rejected'))
  // Check if any selected sample already has cuppers (workflow moved past 'received')
  const selectedHaveCuppers = selectedSamples.size > 0 && samples.some(s => selectedSamples.has(s.id) && s.workflow_stage && s.workflow_stage !== 'received')
  // Reprint follows the "cards were printed" signal, not stage — always available
  // (and never disabled) once cards exist, including certified/rejected samples.
  const selectedCanReprint = selectedSamples.size > 0 && samples.some(s => selectedSamples.has(s.id) && canReprintCuppingCards(s))

  // Everything except the search box and the stage chips, which the bar lays
  // out itself. Lives behind the Filters popover.
  const advancedFilterControls = (
    <>
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

      <Input placeholder="Origin..." value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} />
      <Input placeholder="Quality..." value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)} />
      <Input type="date" placeholder="Date From" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      <Input type="date" placeholder="Date To" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
    </>
  )

  const advancedFilterCount = [statusFilter, sampleTypeFilter, originFilter, qualityFilter, dateFrom, dateTo]
    .filter(Boolean).length
  const anyFilterActive = advancedFilterCount > 0 || Boolean(searchQuery) || workflowStageFilter !== null

  const stageChips = ([
    { value: null, label: 'All stages' },
    { value: 'received', label: 'Received' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'roasting', label: 'Roasting' },
    { value: 'review', label: 'Review' },
    { value: 'certified', label: 'Certified' },
    { value: 'rejected', label: 'Rejected' },
  ] as const)

  const renderStageChips = () => stageChips.map(chip => {
    const active = workflowStageFilter === chip.value
    return (
      <button
        key={chip.label}
        type="button"
        onClick={() => setWorkflowStageFilter(chip.value)}
        className={`h-6 px-2 text-[11px] rounded-full border whitespace-nowrap transition-colors ${
          active
            ? 'bg-foreground text-background border-foreground'
            : 'bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
        }`}
      >
        {chip.value === null ? 'All' : chip.label}
      </button>
    )
  })

  const columnsMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" title="Toggle columns">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(columnLabels).map(([key, label]) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={columnVisibility[key]}
            onCheckedChange={() => toggleColumn(key)}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
    <MainLayout>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div className="p-6 space-y-6">
        {/* Header - Sticky on desktop */}
        <div
          ref={setHeaderEl}
          className="sticky top-0 z-10 bg-background -mx-6 px-6 pt-3 pb-3 border-b"
        >
          <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="relative w-[200px] shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search samples..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-8 text-[12px]"
                />
              </div>
              {renderStageChips()}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    Filters
                    {advancedFilterCount > 0 && (
                      <span className="ml-1 rounded-full bg-foreground text-background px-1.5 text-[10px] leading-4">
                        {advancedFilterCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[420px]">
                  <div className="grid grid-cols-2 gap-2">
                    {advancedFilterControls}
                  </div>
                </PopoverContent>
              </Popover>
              {anyFilterActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="h-7 px-2 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors whitespace-nowrap"
                >
                  Clear all
                </button>
              )}
              {columnsMenu()}
            </div>
          </div>
          {/* The count sits with the actions, not in the filter row: there it
              is a wrappable flex item and drops onto a second line under the
              search box as soon as a selection adds the Actions button. */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap mr-1">
              {samples.length} samples
            </span>
            {selectedSamples.size > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreVertical className="h-4 w-4 mr-2" />
                    Actions ({selectedSamples.size})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {/* Cupper Assignment - Priority Action */}
                  <DropdownMenuItem onClick={handleBulkAssign} disabled={hasCertifiedSelected}>
                    <Users className="h-4 w-4 mr-2" />
                    {(cuppersAssigned || selectedHaveCuppers)
                      ? `Assigned Cuppers${assignedCuppers.length > 0 ? ` (${assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')})` : ''}`
                      : 'Assign Cuppers'}
                  </DropdownMenuItem>
                  {hasCertifiedSelected && (
                    <div className="px-2 pb-1 text-xs text-destructive">
                      Certified/rejected sample selected
                    </div>
                  )}

                  {/* Print Actions - available once cards exist (or cuppers assigned) */}
                  {(cuppersAssigned || selectedHaveCuppers || selectedCanReprint) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleBulkPrintCuppingCards}>
                        <FileText className="h-4 w-4 mr-2" />
                        Reprint Cupping Cards
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleBulkPrintQRTable}>
                        <QrCode className="h-4 w-4 mr-2" />
                        Print QR Table (Thermal)
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* Other Print Actions */}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleBulkExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleBulkPrintTinSleeves}
                    disabled={!hasCertifiedSelected}
                    title={hasCertifiedSelected ? undefined : 'Tin labels carry the certificate number, issued at certification'}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Tin Label
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBulkPrintBagSleeves}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Bag Sleeves (6 per A4)
                  </DropdownMenuItem>

                  {/* Admin Actions */}
                  {isGlobalAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleBulkDelete} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Today's batch. Always rendered, so an empty day and a broken
                lookup are both visible rather than an absent button. */}
            <Button
              variant="outline"
              size="sm"
              disabled={pendingTodayIds.length === 0}
              title={
                pendingTodayError
                  ? `Could not load today's batch: ${pendingTodayError}`
                  : pendingTodayIds.length === 0
                    ? 'Nothing certified today is waiting for a tin label'
                    : undefined
              }
              onClick={() => {
                setTinLabelBatchIds(pendingTodayIds)
                setShowTinLabelDialog(true)
              }}
            >
              <Printer className="h-4 w-4 mr-2" />
              {pendingTodayError
                ? 'Today unavailable'
                : `Today${pendingTodayIds.length > 0 ? ` · ${pendingTodayIds.length}` : ''}`}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent className={INTAKE_DIALOG_CONTENT_CLASS}>
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle>Sample Intake</DialogTitle>
                </DialogHeader>
                <div className="flex-auto min-h-0 flex flex-col">
                  <SampleIntakeForm onSuccess={handleSampleCreated} asDialog={true} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
          </div>
        </div>

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
            {/* No card header: CardContent's pt-0 then puts the pinned row at
                the card's own top edge, so nothing is left to show in the seam
                between it and the filter bar. The count moved into the bar. */}
            <CardContent>
              {/* No overflow wrapper: it would become the sticky header's
                  scroll container and stop it pinning to the page. The table is
                  fixed-layout at 100% width, so it never overflows anyway. */}
              <div>
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th className={`${TABLE_HEAD_STICKY} text-left py-2.5 px-3`} style={{ width: 40, top: headerHeight }}>
                        <Checkbox
                          className="h-3.5 w-3.5 rounded-[3px]"
                          checked={selectedSamples.size === samples.length && samples.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      {selectedSamples.size > 0 && (
                        <th className={TABLE_HEAD_CELL} style={{ width: 40, top: headerHeight }}>
                          <div className="flex items-center gap-1">
                            <QrCode className="h-3 w-3" />
                            QR
                          </div>
                        </th>
                      )}
                      {columnVisibility.reference && <th className={TABLE_HEAD_CELL} style={{ width: 180, top: headerHeight }}>Reference</th>}
                      {columnVisibility.type && <th className={TABLE_HEAD_CELL} style={{ width: 56, top: headerHeight }}>Type</th>}
                      {columnVisibility.wolthers && <th className={TABLE_HEAD_CELL} style={{ width: 104, top: headerHeight }}>W&amp;A REF</th>}
                      {columnVisibility.quality && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Quality</th>}
                      {columnVisibility.seller && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Seller</th>}
                      {columnVisibility.shipper && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Shipper</th>}
                      {columnVisibility.importer && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Importer</th>}
                      {columnVisibility.roaster && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Roaster</th>}
                      {columnVisibility.endClient && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>End client</th>}
                      {columnVisibility.status && <th className={TABLE_HEAD_CELL} style={{ width: 112, top: headerHeight }}>Status</th>}
                      {columnVisibility.origin && <th className={TABLE_HEAD_CELL} style={{ width: 96, top: headerHeight }}>Origin</th>}
                      {columnVisibility.storage && <th className={TABLE_HEAD_CELL} style={{ width: 96, top: headerHeight }}>Storage</th>}
                      {columnVisibility.created && <th className={TABLE_HEAD_CELL} style={{ width: 96, top: headerHeight }}>Created</th>}
                      <th className={`${TABLE_HEAD_STICKY} text-right py-2.5 pl-6 pr-3`} style={{ width: 96, top: headerHeight }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.flatMap((sample) => [
                      <ContextMenu key={sample.id} onOpenChange={(open) => {
                        if (open && !selectedSamples.has(sample.id)) {
                          setSelectedSamples(new Set([sample.id]))
                          setSelectedQrCodes(new Set([sample.id]))
                        }
                      }}>
                        <ContextMenuTrigger asChild>
                          <tr className="group border-b border-border hover:bg-accent/40 transition-colors">
                            <td className="py-2 px-3 align-middle">
                              <div className="flex flex-col items-start gap-0.5">
                                <Checkbox
                                  className="h-3.5 w-3.5 rounded-[3px]"
                                  checked={selectedSamples.has(sample.id)}
                                  onCheckedChange={(checked) => handleSelectSample(sample.id, checked as boolean)}
                                />
                                {(sample.contract_count ?? 0) > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleExpand(sample.id)
                                    }}
                                    className="p-0.5 rounded hover:bg-accent transition-colors"
                                    title={expandedSamples.has(sample.id) ? 'Collapse sub-contracts' : `${sample.contract_count} sub-contract(s)`}
                                  >
                                    {expandedSamples.has(sample.id)
                                      ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                      : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    }
                                  </button>
                                )}
                              </div>
                            </td>
                            {selectedSamples.size > 0 && (
                              <td className="py-2 px-3 align-middle">
                                {selectedSamples.has(sample.id) && (
                                  <Checkbox
                                    className="h-3.5 w-3.5 rounded-[3px]"
                                    checked={selectedQrCodes.has(sample.id)}
                                    onCheckedChange={(checked) => handleToggleQrCode(sample.id, checked as boolean)}
                                  />
                                )}
                              </td>
                            )}
                            {columnVisibility.reference && (() => {
                              const secondary = getSecondaryRef(sample)
                              // Primary reference: the official certificate number once
                              // certified, otherwise the container/ICO/sample identifier.
                              // The internal lab number (SAN-…) is only a last-resort
                              // fallback when nothing else exists, and is no longer the
                              // main thing shown here.
                              const certNumber = sample.certificate_id ? sample.certificate_number : null
                              const primaryTitle = certNumber || secondary?.value || parseTrackingNumber(sample.tracking_number)
                              return (
                                <td className="py-2 px-3 align-middle">
                                  <div className="min-w-0">
                                    <button
                                      onClick={() => setDetailSampleId(sample.id)}
                                      className="block w-full text-left font-mono text-[13px] font-semibold tracking-tight text-foreground hover:underline truncate"
                                      title={primaryTitle}
                                    >
                                      {certNumber ? (
                                        certNumber
                                      ) : secondary ? (
                                        <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
                                          <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-sans font-semibold uppercase tracking-wider bg-muted text-muted-foreground/80">
                                            {secondary.tag}
                                          </span>
                                          <span className="truncate">{secondary.value}</span>
                                        </span>
                                      ) : (
                                        parseTrackingNumber(sample.tracking_number)
                                      )}
                                    </button>
                                    {/* Once certified, keep the container/ICO/sample id visible beneath the cert nr. */}
                                    {certNumber && secondary && (
                                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono truncate">
                                        <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-sans font-semibold uppercase tracking-wider bg-muted text-muted-foreground/80">
                                          {secondary.tag}
                                        </span>
                                        <span className="truncate">{secondary.value}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              )
                            })()}
                            {columnVisibility.type && (
                              <td className="py-2 px-3 align-middle">
                                {sample.sample_type ? (
                                  <span className="inline-flex items-center justify-center rounded-md bg-muted text-muted-foreground/90 font-mono font-semibold text-[11px] px-1.5 py-0.5">
                                    {formatSampleType(sample.sample_type)}
                                  </span>
                                ) : null}
                              </td>
                            )}
                            {columnVisibility.wolthers && (
                              <td className="py-2 px-3 align-middle font-mono text-[12px] text-foreground/80">
                                {sample.wolthers_contract_nr ? (
                                  <span className="truncate" title={sample.wolthers_contract_nr}>{sample.wolthers_contract_nr}</span>
                                ) : (
                                  <span className="text-muted-foreground/50">—</span>
                                )}
                              </td>
                            )}
                            {columnVisibility.quality && (
                              <td className="py-2 px-3 align-middle text-[13px] font-medium text-foreground">
                                <div className="truncate" title={sample.quality_name || ''}>{sample.quality_name || ''}</div>
                              </td>
                            )}
                            {columnVisibility.seller && (
                              <td className="py-2 px-3 align-middle text-[13px] text-foreground">
                                <div className="truncate font-medium" title={sample.seller_name || ''}>{sample.seller_name || ''}</div>
                                {sample.seller_contract_nr && (
                                  <div className="truncate text-[11px] text-muted-foreground font-mono">{sample.seller_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.shipper && (
                              <td className="py-2 px-3 align-middle text-[13px] text-foreground">
                                <div className="truncate font-medium" title={sample.exporter_name || ''}>{sample.exporter_name || ''}</div>
                                {sample.shipper_contract_nr && (
                                  <div className="truncate text-[11px] text-muted-foreground font-mono">{sample.shipper_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.importer && (() => {
                              const importerName = sample.importer_name || (sample.importer_is_qc_client ? sample.qc_client_name : null) || ''
                              const endClientName = sample.end_client_name || sample.qc_client_name || ''
                              // When the End Client column is hidden but the end
                              // client IS the importer, surface that contract nr
                              // here so the info doesn't disappear from the table.
                              const endClientSameAsImporter =
                                !!importerName && !!endClientName &&
                                importerName.trim().toLowerCase() === endClientName.trim().toLowerCase()
                              const importerRef =
                                sample.buyer_contract_nr ||
                                (endClientSameAsImporter
                                  ? sample.end_client_contract_nr || sample.qc_client_contract_nr
                                  : null)
                              return (
                                <td className="py-2 px-3 align-middle text-[13px] text-foreground">
                                  <div className="truncate font-medium" title={importerName}>{importerName}</div>
                                  {importerRef && (
                                    <div className="truncate text-[11px] text-muted-foreground font-mono">{importerRef}</div>
                                  )}
                                </td>
                              )
                            })()}
                            {columnVisibility.roaster && (
                              <td className="py-2 px-3 align-middle text-[13px] text-foreground">
                                <div className="truncate font-medium" title={sample.roaster_name || ''}>{sample.roaster_name || ''}</div>
                                {sample.roaster_contract_nr && (
                                  <div className="truncate text-[11px] text-muted-foreground font-mono">{sample.roaster_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.endClient && (() => {
                              const endClientName = sample.end_client_name || sample.qc_client_name || ''
                              const endClientRef = sample.end_client_contract_nr || sample.qc_client_contract_nr
                              return (
                                <td className="py-2 px-3 align-middle text-[13px] text-foreground">
                                  <div className="truncate font-medium" title={endClientName}>{endClientName}</div>
                                  {endClientRef && (
                                    <div className="truncate text-[11px] text-muted-foreground font-mono">{endClientRef}</div>
                                  )}
                                </td>
                              )
                            })()}
                            {columnVisibility.status && (
                              <td className="py-2 px-3 align-middle">
                                {renderStatusCell(sample.status)}
                              </td>
                            )}
                            {columnVisibility.origin && (
                              <td className="py-2 px-3 align-middle text-[13px] text-foreground/80">
                                <div className="truncate" title={sample.origin || ''}>{sample.origin || ''}</div>
                              </td>
                            )}
                            {columnVisibility.storage && (
                              <td className="py-2 px-3 align-middle text-[13px] text-foreground/80">
                                {sample.storage_position ? (
                                  <div className="flex items-center gap-1 truncate">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{sample.storage_position}</span>
                                  </div>
                                ) : null}
                              </td>
                            )}
                            {columnVisibility.created && (
                              <td className="py-2 px-3 align-middle text-[12px] text-muted-foreground">
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <Calendar className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                                  {new Date(sample.created_at).toLocaleDateString()}
                                </div>
                              </td>
                            )}
                            <td className="py-2 pl-6 pr-3 align-middle">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => sample.certificate_id ? handleViewCertificate(sample) : setDetailSampleId(sample.id)}
                                  title={sample.certificate_id ? 'View certificate' : 'View sample'}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {sample.certificate_id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleDownloadCertificate(sample)}
                                    disabled={downloadingSampleId === sample.id}
                                    title="Download certificate"
                                  >
                                    {downloadingSampleId === sample.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Download className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {isGlobalAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteSample(sample)}
                                    disabled={deletingId === sample.id}
                                    className="h-7 w-7 p-0 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                    title="Delete sample"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56">
                          <ContextMenuLabel>
                            {selectedSamples.size > 1
                              ? `${selectedSamples.size} samples selected`
                              : parseTrackingNumber(sample.tracking_number)}
                          </ContextMenuLabel>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => setDetailSampleId(sample.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Sample
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => {
                            setDetailStartInEditMode(true)
                            setDetailSampleId(sample.id)
                          }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Sample
                          </ContextMenuItem>
                          {sample.sample_type === 'ss' ? (
                            <ContextMenuItem onClick={e => openDuplicatePrompt(sample, e)}>
                              <Plus className="h-4 w-4 mr-2" />
                              Duplicate Sample
                            </ContextMenuItem>
                          ) : (
                            <ContextMenuItem onClick={() => setSubContractSample(sample)}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add Sub-Contract
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem onClick={() => handleSelectAll(true)}>
                            <Checkbox className="h-4 w-4 mr-2" checked={false} />
                            Select All
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => {
                            const uncertified = samples.filter(s => s.workflow_stage !== 'certified' && s.workflow_stage !== 'rejected')
                            const ids = new Set(uncertified.map(s => s.id))
                            setSelectedSamples(ids)
                            setSelectedQrCodes(ids)
                          }}>
                            <Checkbox className="h-4 w-4 mr-2" checked={false} />
                            Select All Uncertified
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          {(() => {
                            // Use workflow_stage as primary indicator: 'received' = not yet assigned
                            const sampleHasCuppers = sample.workflow_stage !== 'received' && sample.workflow_stage !== undefined
                            const hasCuppers = selectedSamples.size > 1 ? (cuppersAssigned || selectedHaveCuppers) : sampleHasCuppers
                            const canReprint = selectedSamples.size > 1 ? selectedCanReprint : canReprintCuppingCards(sample)
                            const singleAssignment = sampleCupperMap[sample.id]
                            const cupperNames = selectedSamples.size > 1
                              ? assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')
                              : singleAssignment?.cuppers.map(c => c.full_name?.split(' ')[0]).join(', ')
                            return (
                              <>
                                <ContextMenuItem
                                  onClick={() => selectedSamples.size > 1 ? handleBulkAssign() : handleSingleSampleAssign(sample)}
                                  disabled={hasCertifiedSelected}
                                >
                                  <Users className="h-4 w-4 mr-2" />
                                  {hasCuppers
                                    ? `Assigned Cuppers${cupperNames ? ` (${cupperNames})` : ''}`
                                    : 'Assign Cuppers'}
                                </ContextMenuItem>
                                {hasCertifiedSelected && (
                                  <div className="px-2 pb-1 text-xs text-destructive">
                                    Certified/rejected sample selected
                                  </div>
                                )}
                                {canReprint && (
                                  <ContextMenuItem
                                    onClick={() => selectedSamples.size > 1 ? handleBulkPrintCuppingCards() : handleSingleSampleReprintCards(sample)}
                                  >
                                    <FileText className="h-4 w-4 mr-2" />
                                    Reprint Cupping Cards
                                  </ContextMenuItem>
                                )}
                              </>
                            )
                          })()}
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={handleBulkExport}>
                            <Download className="h-4 w-4 mr-2" />
                            Export to Excel
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={handleBulkPrintTinSleeves}
                            disabled={!hasCertifiedSelected}
                            title={hasCertifiedSelected ? undefined : 'Tin labels carry the certificate number, issued at certification'}
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Tin Label
                          </ContextMenuItem>
                          <ContextMenuItem onClick={handleBulkPrintBagSleeves}>
                            <Printer className="h-4 w-4 mr-2" />
                            Print Bag Sleeves
                          </ContextMenuItem>
                          {sample.certificate_id && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => handleViewCertificate(sample)}>
                                <Award className="h-4 w-4 mr-2" />
                                View Certificate
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => handleDownloadCertificate(sample)}>
                                <Download className="h-4 w-4 mr-2" />
                                Download Certificate
                              </ContextMenuItem>
                            </>
                          )}
                          {isGlobalAdmin && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() => selectedSamples.size > 1 ? handleBulkDelete() : handleDeleteSample(sample)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {selectedSamples.size > 1 ? `Delete ${selectedSamples.size} Samples` : 'Delete Sample'}
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>,
                      // Expanded sub-contract rows (full table rows matching mother format)
                      ...(expandedSamples.has(sample.id) && sample.sub_contracts?.length
                        ? sample.sub_contracts.map((sc, scIdx) => {
                            const isLast = scIdx === (sample.sub_contracts?.length ?? 0) - 1
                            return (
                              <tr
                                key={`sc-${sc.id}`}
                                className={`group bg-muted/20 hover:bg-muted/60 transition-colors ${isLast ? 'border-b border-border' : ''}`}
                              >
                                {/* Tree connector in checkbox column - continuous
                                    vertical line down the group with a tick per row */}
                                <td className="p-0 align-middle relative">
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className={`absolute left-1/2 -translate-x-1/2 w-px bg-border ${isLast ? 'top-0 h-1/2' : 'inset-y-0'}`} />
                                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 h-px bg-border w-3" />
                                  </div>
                                </td>
                                {/* QR column */}
                                {selectedSamples.size > 0 && (
                                  <td className="py-2 px-3 align-middle">
                                    {selectedSamples.has(sample.id) && (
                                      <Checkbox
                                        checked={selectedSubContractQrCodes.has(sc.id)}
                                        onCheckedChange={(checked) => handleToggleSubContractQrCode(sc.id, checked as boolean)}
                                      />
                                    )}
                                  </td>
                                )}
                                {/* Reference (container/ICO; cert nr once certified) */}
                                {columnVisibility.reference && (() => {
                                  const scSecondary = sc.container_nr
                                    ? { tag: 'CTR', value: sc.container_nr }
                                    : sc.ico_number
                                      ? { tag: 'ICO', value: sc.ico_number }
                                      : null
                                  const scCertNumber = sc.has_certificate ? sc.certificate_number : null
                                  const scTitle = scCertNumber || scSecondary?.value || sc.tracking_number
                                  return (
                                    <td className="py-2 px-3 align-middle">
                                      <div className="min-w-0">
                                        <button
                                          onClick={() => { setDetailContractId(sc.id); setDetailSampleId(sample.id) }}
                                          className="block w-full text-left font-mono text-[12.5px] font-semibold text-foreground/85 hover:underline truncate"
                                          title={scTitle}
                                        >
                                          {scCertNumber ? (
                                            scCertNumber
                                          ) : scSecondary ? (
                                            <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
                                              <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-sans font-semibold uppercase tracking-wider bg-muted text-muted-foreground/80">
                                                {scSecondary.tag}
                                              </span>
                                              <span className="truncate">{scSecondary.value}</span>
                                            </span>
                                          ) : (
                                            sc.tracking_number
                                          )}
                                        </button>
                                        {scCertNumber && scSecondary && (
                                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono truncate">
                                            <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-sans font-semibold uppercase tracking-wider bg-muted text-muted-foreground/80">
                                              {scSecondary.tag}
                                            </span>
                                            <span className="truncate">{scSecondary.value}</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  )
                                })()}
                                {columnVisibility.type && (
                                  <td className="py-2 px-3 align-middle">
                                    {sample.sample_type ? (
                                      <span className="inline-flex items-center justify-center rounded-md bg-muted/60 text-muted-foreground/70 font-mono font-semibold text-[10.5px] px-1.5 py-0.5">
                                        {formatSampleType(sample.sample_type)}
                                      </span>
                                    ) : null}
                                  </td>
                                )}
                                {columnVisibility.wolthers && (
                                  <td className="py-2 px-3 align-middle font-mono text-[12px] text-foreground/75">
                                    {sc.wolthers_contract_nr ? (
                                      <span className="truncate" title={sc.wolthers_contract_nr}>{sc.wolthers_contract_nr}</span>
                                    ) : (
                                      <span className="text-muted-foreground/40">—</span>
                                    )}
                                  </td>
                                )}
                                {columnVisibility.quality && (
                                  <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
                                    <div className="truncate">{sample.quality_name || ''}</div>
                                  </td>
                                )}
                                {columnVisibility.seller && (
                                  <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
                                    <div className="truncate">{sample.seller_name || ''}</div>
                                    {sc.supplier_contract_nr && (
                                      <div className="truncate text-[10.5px] font-mono">{sc.supplier_contract_nr}</div>
                                    )}
                                  </td>
                                )}
                                {columnVisibility.shipper && (
                                  <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
                                    <div className="truncate">{sample.exporter_name || ''}</div>
                                  </td>
                                )}
                                {columnVisibility.importer && (() => {
                                  const scImporterName = sc.importer_name || ''
                                  const scEndClientName = sc.end_client_name || sc.qc_client_name || ''
                                  const sameAsImporter =
                                    !!scImporterName && !!scEndClientName &&
                                    scImporterName.trim().toLowerCase() === scEndClientName.trim().toLowerCase()
                                  const scImporterRef =
                                    sc.buyer_contract_nr ||
                                    (sameAsImporter
                                      ? sc.end_client_contract_nr || sc.qc_client_contract_nr
                                      : null)
                                  return (
                                    <td className="py-2 px-3 align-middle text-[12.5px] text-foreground/85">
                                      <div className="truncate">{scImporterName}</div>
                                      {scImporterRef && (
                                        <div className="truncate text-[10.5px] text-muted-foreground font-mono">{scImporterRef}</div>
                                      )}
                                    </td>
                                  )
                                })()}
                                {columnVisibility.roaster && (
                                  <td className="py-2 px-3 align-middle text-[12.5px] text-foreground/85">
                                    <div className="truncate">{sc.roaster_name || ''}</div>
                                    {sc.roaster_contract_nr && (
                                      <div className="truncate text-[10.5px] text-muted-foreground font-mono">{sc.roaster_contract_nr}</div>
                                    )}
                                  </td>
                                )}
                                {columnVisibility.endClient && (
                                  <td className="py-2 px-3 align-middle text-[12.5px] text-foreground/85">
                                    <div className="truncate">{sc.end_client_name || sc.qc_client_name || ''}</div>
                                    {(sc.end_client_contract_nr || sc.qc_client_contract_nr) && (
                                      <div className="truncate text-[10.5px] text-muted-foreground font-mono">{sc.end_client_contract_nr || sc.qc_client_contract_nr}</div>
                                    )}
                                  </td>
                                )}
                                {columnVisibility.status && (
                                  <td className="py-2 px-3 align-middle">
                                    {renderStatusCell(sample.status)}
                                  </td>
                                )}
                                {columnVisibility.origin && (
                                  <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
                                    <div className="truncate">{sample.origin || ''}</div>
                                  </td>
                                )}
                                {columnVisibility.storage && (
                                  <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
                                    <div className="truncate">{sample.storage_position || ''}</div>
                                  </td>
                                )}
                                {columnVisibility.created && (
                                  <td className="py-2 px-3 align-middle text-[12px] text-muted-foreground whitespace-nowrap">
                                    {new Date(sample.created_at).toLocaleDateString()}
                                  </td>
                                )}
                                <td className="py-2 pl-6 pr-3 align-middle">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                      onClick={() => sc.has_certificate ? handleViewSubContractCertificate(sample.id, sc) : setDetailSampleId(sample.id)}
                                      title={sc.has_certificate ? 'View certificate' : 'View sample'}
                                    >
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                    {sc.has_certificate && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                        onClick={() => handleDownloadSubContractCertificate(sample.id, sc.id, sc.certificate_number || sc.tracking_number)}
                                        disabled={downloadingSampleId === `${sample.id}_${sc.id}`}
                                        title="Download certificate"
                                      >
                                        {downloadingSampleId === `${sample.id}_${sc.id}` ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Download className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
                                    {isGlobalAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                        onClick={() => handleDeleteSubContract(sample, sc)}
                                        disabled={deletingId === sc.id}
                                        title="Delete sub-contract"
                                      >
                                        {deletingId === sc.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        : []),
                    ])}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>
            {selectedSamples.size > 0
              ? `${selectedSamples.size} samples selected`
              : 'No samples selected'}
          </ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleSelectAll(true)}>
            <Checkbox className="h-4 w-4 mr-2" checked={false} />
            Select All
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            const uncertified = samples.filter(s => s.workflow_stage !== 'certified' && s.workflow_stage !== 'rejected')
            const ids = new Set(uncertified.map(s => s.id))
            setSelectedSamples(ids)
            setSelectedQrCodes(ids)
            setAssignedCuppers([])
            setCuppersAssigned(false)
          }}>
            <Checkbox className="h-4 w-4 mr-2" checked={false} />
            Select All Uncertified
          </ContextMenuItem>
          {selectedSamples.size > 0 && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleBulkAssign} disabled={hasCertifiedSelected}>
                <Users className="h-4 w-4 mr-2" />
                {(cuppersAssigned || selectedHaveCuppers)
                  ? `Assigned Cuppers${assignedCuppers.length > 0 ? ` (${assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')})` : ''}`
                  : 'Assign Cuppers'}
              </ContextMenuItem>
              {hasCertifiedSelected && (
                <div className="px-2 pb-1 text-xs text-destructive">
                  Certified/rejected sample selected
                </div>
              )}
              {(cuppersAssigned || selectedHaveCuppers || selectedCanReprint) && (
                <ContextMenuItem onClick={handleBulkPrintCuppingCards}>
                  <FileText className="h-4 w-4 mr-2" />
                  Reprint Cupping Cards
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleBulkExport}>
                <Download className="h-4 w-4 mr-2" />
                Export to Excel
              </ContextMenuItem>
              <ContextMenuItem
                onClick={handleBulkPrintTinSleeves}
                disabled={!hasCertifiedSelected}
                title={hasCertifiedSelected ? undefined : 'Tin labels carry the certificate number, issued at certification'}
              >
                <Printer className="h-4 w-4 mr-2" />
                Tin Label
              </ContextMenuItem>
              <ContextMenuItem onClick={handleBulkPrintBagSleeves}>
                <Printer className="h-4 w-4 mr-2" />
                Print Bag Sleeves
              </ContextMenuItem>
              {isGlobalAdmin && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={handleBulkDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete {selectedSamples.size} Sample{selectedSamples.size > 1 ? 's' : ''}
                  </ContextMenuItem>
                </>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </MainLayout>

      {/* Print Labels Dialog */}
      <PrintLabelsDialog
        open={showPrintDialog}
        onOpenChange={setShowPrintDialog}
        sampleIds={Array.from(selectedSamples)}
        onSuccess={() => {
          setSelectedSamples(new Set())
        }}
      />

      {/* Tin Label Size Selection Dialog */}
      <TinLabelSizeDialog
        open={showTinLabelDialog}
        onOpenChange={(open) => {
          setShowTinLabelDialog(open)
          if (!open) setTinLabelBatchIds(null)
        }}
        sampleIds={tinLabelBatchIds ?? Array.from(selectedSamples)}
        onSuccess={() => {
          setSelectedSamples(new Set())
          refreshPendingToday()
        }}
      />

      {/* Print Cupping Cards Dialog */}
      <PrintCuppingCardsDialog
        open={showCuppingCardsDialog}
        onOpenChange={setShowCuppingCardsDialog}
        samples={samples.filter((s) => selectedSamples.has(s.id))}
        assignedCuppers={assignedCuppers}
        onSuccess={() => {
          // Refresh the samples list to show updated status
          loadSamples()
          // Clear selection and reset cupper assignment
          setSelectedSamples(new Set())
          setSelectedQrCodes(new Set())
          setAssignedCuppers([])
          setCuppersAssigned(false)
        }}
      />

      {/* Assign Cuppers Dialog */}
      <AssignCuppersDialog
        open={showAssignCuppersDialog}
        onOpenChange={setShowAssignCuppersDialog}
        sampleCount={selectedSamples.size}
        onAssign={handleCuppersAssigned}
        existingCupperIds={existingCupperIds}
      />

      {/* Add Sub-Contract Dialog */}
      {subContractSample && (
        <AddSubContractDialog
          open={!!subContractSample}
          onOpenChange={(open) => !open && setSubContractSample(null)}
          sample={subContractSample}
          onSuccess={loadSamples}
        />
      )}

      {/* Mouse-anchored Duplicate Sample popover */}
      {duplicatePrompt && (
        <DuplicateCountPopover
          trackingNumber={duplicatePrompt.sample.tracking_number}
          bagType={duplicatePrompt.sample.bag_type}
          bagCount={duplicatePrompt.sample.bag_count}
          bagsQuantityMt={duplicatePrompt.sample.bags_quantity_mt}
          x={duplicatePrompt.x}
          y={duplicatePrompt.y}
          busy={duplicating}
          onCancel={() => {
            if (!duplicating) setDuplicatePrompt(null)
          }}
          onSubmit={handleDuplicateSubmit}
        />
      )}

      {/* Certificate Preview Modal */}
      <Dialog open={!!previewSample} onOpenChange={(open) => !open && handleClosePreview()}>
        <DialogContent className="sm:max-w-[1100px] max-h-[95vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certificate {previewCertNumber || previewSample?.certificate_number || parseTrackingNumber(previewSample?.tracking_number || '')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-[75vh] bg-muted rounded-lg overflow-hidden">
            {previewPdfUrl ? (
              <iframe
                src={previewPdfUrl}
                className="w-full h-[75vh] border-0"
                title="Certificate Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-[75vh] text-muted-foreground">
                Unable to load certificate preview
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            {previewSample && (
              <Button
                variant="outline"
                onClick={() => handleDownloadCertificate(previewSample)}
                disabled={downloadingSampleId === previewSample.id}
              >
                {downloadingSampleId === previewSample.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download
              </Button>
            )}
            <Button variant="default" onClick={handleClosePreview}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Sample Confirmation */}
      <AlertDialog open={!!deleteSampleTarget} onOpenChange={(open) => !open && setDeleteSampleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sample</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete sample{' '}
              <span className="font-medium text-foreground">
                {deleteSampleTarget ? parseTrackingNumber(deleteSampleTarget.tracking_number) : ''}
              </span>
              ? This permanently removes the sample, its quality assessments, certificates and activity logs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSample} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Samples Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSamples.size} sample(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{selectedSamples.size}</span> sample(s)?
              This permanently removes each sample, its quality assessments, certificates and activity logs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive hover:bg-destructive/90">
              Delete {selectedSamples.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Sub-Contract Confirmation */}
      <AlertDialog open={!!deleteSubContractTarget} onOpenChange={(open) => !open && setDeleteSubContractTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sub-Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete sub-contract{' '}
              <span className="font-medium text-foreground">{deleteSubContractTarget?.sc.tracking_number}</span>?
              This will also delete its certificate if one exists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSubContract} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sample Detail Overlay */}
      <SampleDetailOverlay
        open={!!detailSampleId}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSampleId(null)
            setDetailContractId(null)
            setDetailStartInEditMode(false)
          }
        }}
        sampleId={detailSampleId}
        contractId={detailContractId}
        onSampleUpdated={loadSamples}
        startInEditMode={detailStartInEditMode}
      />
    </>
  )
}
