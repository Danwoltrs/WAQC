'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SampleIntakeForm } from '@/components/samples/sample-intake-form'
import { INTAKE_DIALOG_CONTENT_CLASS } from '@/components/samples/sample-intake-dialog'
import { SampleDetailOverlay } from '@/components/certificates/cert-editor'
import { sampleLabelText } from '@/lib/sample-reference'
import { AddSubContractDialog } from '@/components/samples/add-sub-contract-dialog'
import { PrintLabelsDialog } from '@/components/samples/print-labels-dialog'
import { PrintBagSleevesDialog } from '@/components/samples/print-bag-sleeves-dialog'
import type { BagSleeveEntry } from '@/lib/print-selection'
import { TinLabelSizeDialog } from '@/components/samples/tin-label-size-dialog'
import { PrintTodayTinLabelsButton } from '@/components/samples/print-today-tin-labels-button'
import { PrintCuppingCardsDialog } from '@/components/cupping/print-cupping-cards-dialog'
import { canReprintCuppingCards } from '@/lib/cupping/reprint'
import type { GuestCupper } from '@/lib/cupping/roster'
import { isLabUnit } from '@/lib/sample-group'
import { AssignCuppersDialog } from '@/components/samples/assign-cuppers-dialog'
import { DuplicateCountPopover, type DuplicateBagOverride } from '@/components/samples/duplicate-count-popover'
import { useToast } from '@/hooks/use-toast'
// Aliased: the component destructures a `toast` of its own from useToast, and
// the print dialogs opened from this page report the very same empty-selection
// case through sonner, so these guards match them rather than the shadcn toast.
import { toast as sonnerToast } from 'sonner'
import { certificateFilenameFromResponse } from '@/lib/certificate-filename'
import { formatQuantityLine } from '@/lib/bag-quantity'
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Plus, FileText, Mail } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { isInternalStaffProfile } from '@/lib/auth/sample-access'
// The list's presentational pieces. State, effects, data loading and handlers
// all live in this file and reach them as props.
import { DEFAULT_HEADER_HEIGHT, type CertificateTarget, type Sample, type SiblingRow } from '@/components/samples/qc-list/types'
import { SamplesFilterBar } from '@/components/samples/qc-list/filter-bar'
import { BulkActionsMenu } from '@/components/samples/qc-list/bulk-actions-menu'
import { LabUnitRowCells, SamplesTableHead, ContractSiblingRow } from '@/components/samples/qc-list/table-rows'
import { SampleRowActions } from '@/components/samples/qc-list/row-actions'
import { PageContextMenuContent, RowContextMenuContent } from '@/components/samples/qc-list/context-menus'
import {
  BulkDeleteSamplesDialog, CertificatePreviewDialog, DeleteContractDialog, DeleteSampleDialog,
} from '@/components/samples/qc-list/dialogs'

export default function SamplesPage() {
  const { profile } = useAuth()
  const [samples, setSamples] = useState<Sample[]>([])
  // A contract sibling opens the overlay on its OWN sample id, like any row.
  const [detailSampleId, setDetailSampleId] = useState<string | null>(null)
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
  const [bagSleeveEntries, setBagSleeveEntries] = useState<BagSleeveEntry[] | null>(null)
  const [showTinLabelDialog, setShowTinLabelDialog] = useState(false)
  // The header is a compact filter bar: search, stage chips, the advanced
  // filters and the actions, all in one pinned row.
  //
  // Held in state, not a ref: MainLayout renders a spinner instead of its
  // children while auth resolves, so on the first commit this node does not
  // exist yet and a mount-once effect would wire itself to nothing.
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_HEADER_HEIGHT)
  // Bumped after this page prints its own row selection, so the Today button
  // re-counts: a selection print consumes part of today's batch.
  const [todayBatchToken, setTodayBatchToken] = useState(0)
  const [showCuppingCardsDialog, setShowCuppingCardsDialog] = useState(false)
  const [showAssignCuppersDialog, setShowAssignCuppersDialog] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteSampleTarget, setDeleteSampleTarget] = useState<Sample | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [deleteSubContractTarget, setDeleteSubContractTarget] = useState<{ sample: Sample; sc: SiblingRow } | null>(null)
  // Optional reason typed in the delete dialogs; travels with the DELETE and
  // lands on samples.deleted_reason + the sample_events audit row.
  const [deleteReason, setDeleteReason] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set())
  const [selectedSubContractQrCodes, setSelectedSubContractQrCodes] = useState<Set<string>>(new Set())
  const [subContractSample, setSubContractSample] = useState<Sample | null>(null)
  // Mouse-anchored "Duplicate sample" popover state. Captures the click coords
  // so the popover renders at the cursor; busy flag disables it during inserts.
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ sample: Sample; x: number; y: number } | null>(null)
  const [duplicating, setDuplicating] = useState(false)
  const { toast } = useToast()

  // Certificate preview modal states
  const [previewSample, setPreviewSample] = useState<CertificateTarget | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  // Cert number of the SPECIFIC certificate being previewed — a contract
  // sibling's own minted number, never its lab unit's. Kept separate so the
  // title matches the rendered PDF.
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
  // Guests on the roster of the selected samples (printed on cards, no login)
  const [assignedGuests, setAssignedGuests] = useState<GuestCupper[]>([])
  const [existingGuests, setExistingGuests] = useState<GuestCupper[]>([])

  // Per-sample cupper assignment map (loaded for all visible samples)
  const [sampleCupperMap, setSampleCupperMap] = useState<Record<string, {
    cuppers: Array<{ id: string; full_name: string; email: string }>
    session_id: string
    guests?: GuestCupper[]
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

  // Check if user is global admin
  const isGlobalAdmin = profile?.is_global_admin || profile?.qc_role === 'global_admin'
  // Any lab user deletes (2026-09-17): deletion is soft and audited, so the
  // gate is the internal role, not admin-ness. "Show deleted" stays admin-only.
  const canDeleteSamples = isInternalStaffProfile(profile)

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
  }, [statusFilter, sampleTypeFilter, workflowStageFilter, showDeleted])

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

  const loadSamples = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (sampleTypeFilter) params.append('sample_type', sampleTypeFilter)
      if (workflowStageFilter) params.append('workflow_stage', workflowStageFilter)
      if (showDeleted && isGlobalAdmin) params.append('include_deleted', '1')
      params.append('limit', '100')

      const response = await fetch(`/api/samples?${params}`)
      const data = await response.json()

      if (response.ok) {
        // Type / stocklot offers the lab doesn't cup or grade (qc_in_house=false)
        // live on Other Samples only; they're not lab work.
        let filtered = (data.samples as any[]).filter((s) => s.qc_in_house !== false)

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
      setAssignedGuests([])
      setExistingGuests([])
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
          const guests: GuestCupper[] = Array.isArray(data.guests) ? data.guests : []
          setAssignedGuests(guests)
          setExistingGuests(guests)
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
      sonnerToast.error('Please select at least one sample')
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

  const handleBulkPrintBagSleeves = () => {
    if (selectedSamples.size === 0) {
      sonnerToast.error('Please select at least one sample')
      return
    }

    // One sleeve per certificate: the selected lab units first, then every
    // contract sibling whose QR column is ticked, each addressed by its own
    // sample id (a sibling is a sample with its own certificate). The per-row
    // QR selection is authoritative here; the dialog only reports it.
    const entries: BagSleeveEntry[] = Array.from(selectedSamples).map(id => ({
      id,
      includeQrCode: selectedQrCodes.has(id),
    }))

    for (const sample of samples) {
      if (!selectedSamples.has(sample.id) || !sample.sub_contracts?.length) continue
      for (const sc of sample.sub_contracts) {
        if (selectedSubContractQrCodes.has(sc.id)) {
          entries.push({ id: sc.id, includeQrCode: true })
        }
      }
    }

    setBagSleeveEntries(entries)
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
    const guestMap = new Map<string, GuestCupper>()
    for (const sampleId of selectedSamples) {
      sampleCupperMap[sampleId]?.guests?.forEach(g => guestMap.set(g.id, g))
    }
    const allCuppers = Array.from(cupperMap.values())
    if (allCuppers.length > 0) {
      setAssignedCuppers(allCuppers)
      setCuppersAssigned(true)
    }
    setAssignedGuests(Array.from(guestMap.values()))
    setShowCuppingCardsDialog(true)
  }

  const handleBulkPrintTinSleeves = () => {
    if (selectedSamples.size === 0) {
      sonnerToast.error('Please select at least one sample')
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
      setExistingGuests(assignment.guests ?? [])
    } else {
      setExistingCupperIds([])
      setAssignedCuppers([])
      setCuppersAssigned(false)
      setExistingGuests([])
    }
    setShowAssignCuppersDialog(true)
  }

  const handleSingleSampleReprintCards = (sample: Sample) => {
    setSelectedSamples(new Set([sample.id]))
    setSelectedQrCodes(new Set([sample.id]))
    const assignment = sampleCupperMap[sample.id]
    setAssignedGuests(assignment?.guests ?? [])
    if (assignment?.cuppers && assignment.cuppers.length > 0) {
      setAssignedCuppers(assignment.cuppers)
      setCuppersAssigned(true)
    }
    // Always open dialog - it will fetch cuppers from session as fallback
    setShowCuppingCardsDialog(true)
  }

  const handleCuppersAssigned = async (cupperIds: string[], cuppers: Array<{ id: string; full_name: string; email: string }>, guests: string[]) => {
    setAssignedCuppers(cuppers)
    setCuppersAssigned(true)
    console.log('Cuppers assigned:', cuppers)

    // Send notifications to assigned cuppers via API. This call also advances
    // the samples' workflow_stage to 'analysis' — if it fails, the sample stays
    // stuck at "received" on the tracker, so we surface the error loudly.
    // Cupping is assigned on LAB UNITS only: a contract sibling shares its lab
    // unit's cup, and the route rejects sibling ids outright (400 with
    // sibling_ids). Top-level rows are lab units, so this is a guard — but if
    // a sibling ever gets selected, say so instead of failing the whole call.
    const requestedIds = Array.from(selectedSamples)
    const sampleIds = requestedIds.filter(id => { const row = samples.find(s => s.id === id); return !row || isLabUnit(row) })
    const droppedSiblings = requestedIds.length - sampleIds.length
    if (droppedSiblings > 0) {
      toast({
        title: sampleIds.length === 0 ? 'Nothing to assign' : `${droppedSiblings} contract sibling${droppedSiblings === 1 ? '' : 's'} skipped`,
        description: 'Cupping is assigned on the lab unit; its contract siblings share the cup.',
        variant: sampleIds.length === 0 ? 'destructive' : undefined,
      })
      if (sampleIds.length === 0) return
    }
    let assignSucceeded = false
    let storedGuests: GuestCupper[] = []
    try {
      const response = await fetch('/api/notifications/samples-assigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cupper_ids: cupperIds,
          sample_ids: sampleIds,
          guest_cuppers: guests,
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
        storedGuests = Array.isArray(data.guest_cuppers) ? data.guest_cuppers : []
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
    setAssignedGuests(storedGuests)

    // Update the per-sample cupper map for the assigned samples
    const sampleIdsForMap = sampleIds
    const updatedMap = { ...sampleCupperMap }
    for (const sampleId of sampleIdsForMap) {
      updatedMap[sampleId] = {
        cuppers: cuppers,
        session_id: '', // Will be refreshed on next load
        guests: storedGuests,
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
    setDeleteReason('')
    setDeleteSampleTarget(sample)
  }

  const deleteSampleRequest = (id: string) =>
    fetch(`/api/samples/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: deleteReason.trim() || undefined }),
    })

  const confirmDeleteSample = async () => {
    const sample = deleteSampleTarget
    if (!sample) return
    const sampleNumber = sampleLabelText(sample)
    setDeleteSampleTarget(null)

    try {
      setDeletingId(sample.id)
      const response = await deleteSampleRequest(sample.id)

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

      toast({ title: 'Sample deleted', description: `${sampleNumber} deleted` })
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
    setDeleteReason('')
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
          const response = await deleteSampleRequest(sampleId)

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
  const handleViewCertificate = (sample: CertificateTarget) => {
    setPreviewSample(sample)
    setPreviewCertNumber(sample.certificate_number || '')
    // Use direct API URL so the browser's PDF viewer respects Content-Disposition filename
    setPreviewPdfUrl(`/api/samples/${sample.id}/certificate`)
  }

  const handleClosePreview = () => {
    setPreviewSample(null)
    setPreviewPdfUrl(null)
    setPreviewCertNumber(null)
  }

  const handleDownloadCertificate = async (sample: CertificateTarget) => {
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

  const handleDeleteSubContract = (sample: Sample, sc: SiblingRow) => {
    setDeleteReason('')
    setDeleteSubContractTarget({ sample, sc })
  }

  const confirmDeleteSubContract = async () => {
    if (!deleteSubContractTarget) return
    const { sample, sc } = deleteSubContractTarget
    setDeleteSubContractTarget(null)

    try {
      setDeletingId(sc.id)
      // A sibling is a sample: deleting it removes that one contract and
      // leaves the lab unit and the other contracts alone.
      const response = await deleteSampleRequest(sc.id)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete contract')
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
      // Collapse if no contracts left
      const remainingCount = (sample.sub_contracts?.length ?? 1) - 1
      if (remainingCount <= 0) {
        setExpandedSamples(prev => {
          const next = new Set(prev)
          next.delete(sample.id)
          return next
        })
      }
    } catch (error) {
      console.error('Error deleting contract:', error)
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete contract.',
        variant: 'destructive',
      })
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

  // Duplicate sample (SS flow): a new independent sample with the same parties and quality
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
            ? `Added a copy of ${sampleLabelText(target)}.`
            : `Created ${created} copies of ${sampleLabelText(target)}.`,
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

  const clearFilters = () => {
    setShowDeleted(false)
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

  const advancedFilterCount = [statusFilter, sampleTypeFilter, originFilter, qualityFilter, dateFrom, dateTo, showDeleted ? 'deleted' : '']
    .filter(Boolean).length
  const anyFilterActive = advancedFilterCount > 0 || Boolean(searchQuery) || workflowStageFilter !== null

  return (
    <>
    <MainLayout fullWidth>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div className="p-6">
        {/* Header - Sticky on desktop */}
        <div
          ref={setHeaderEl}
          className="sticky top-0 z-10 bg-background -mx-6 -mt-6 px-6 min-h-16 flex flex-col justify-center border-b"
        >
          <div className="flex items-center justify-between gap-3">
          <SamplesFilterBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            workflowStageFilter={workflowStageFilter}
            onWorkflowStageFilterChange={setWorkflowStageFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sampleTypeFilter={sampleTypeFilter}
            onSampleTypeFilterChange={setSampleTypeFilter}
            originFilter={originFilter}
            onOriginFilterChange={setOriginFilter}
            qualityFilter={qualityFilter}
            onQualityFilterChange={setQualityFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            isGlobalAdmin={isGlobalAdmin}
            showDeleted={showDeleted}
            onShowDeletedChange={setShowDeleted}
            advancedFilterCount={advancedFilterCount}
            anyFilterActive={anyFilterActive}
            onClearFilters={clearFilters}
            columnVisibility={columnVisibility}
            onToggleColumn={toggleColumn}
          />
          {/* The count sits with the actions, not in the filter row: there it
              is a wrappable flex item and drops onto a second line under the
              search box as soon as a selection adds the Actions button. */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap mr-1">
              {samples.length} samples
            </span>
            {selectedSamples.size > 0 && (
              <BulkActionsMenu
                selectedCount={selectedSamples.size}
                hasCertifiedSelected={hasCertifiedSelected}
                cuppersAssigned={cuppersAssigned}
                selectedHaveCuppers={selectedHaveCuppers}
                selectedCanReprint={selectedCanReprint}
                assignedCuppers={assignedCuppers}
                canDelete={canDeleteSamples}
                onAssignCuppers={handleBulkAssign}
                onReprintCuppingCards={handleBulkPrintCuppingCards}
                onPrintQrTable={handleBulkPrintQRTable}
                onExport={handleBulkExport}
                onTinLabel={handleBulkPrintTinSleeves}
                onPrintBagSleeves={handleBulkPrintBagSleeves}
                onDelete={handleBulkDelete}
              />
            )}
            {/* Today's batch. Always rendered, so an empty day and a broken
                lookup are both visible rather than an absent button. */}
            <PrintTodayTinLabelsButton refreshToken={todayBatchToken} />
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent className={INTAKE_DIALOG_CONTENT_CLASS}>
                <DialogHeader className="sr-only">
                  <DialogTitle>New Sample</DialogTitle>
                </DialogHeader>
                <div className="flex-auto min-h-0 flex flex-col">
                  <SampleIntakeForm onSuccess={handleSampleCreated} asDialog={true} onCancel={() => setDialogOpen(false)} />
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
          <Card className="mt-6">
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
          // No card frame: the table sits on the page, directly under the
          // filter bar, so the pinned header row has no seam to show rows
          // through. -mx-6 cancels the page's gutter: the table runs edge to
          // edge, flush against the sidebar. No overflow wrapper: it would
          // become the sticky header's scroll container and stop it pinning to
          // the page. The table is fixed-layout at 100% width, so it never
          // overflows anyway.
          <div className="-mx-6">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <SamplesTableHead
                    headerHeight={headerHeight}
                    columnVisibility={columnVisibility}
                    anySelected={selectedSamples.size > 0}
                    allSelected={selectedSamples.size === samples.length && samples.length > 0}
                    onSelectAll={handleSelectAll}
                  />
                  <tbody>
                    {samples.flatMap((sample) => [
                      <ContextMenu key={sample.id} onOpenChange={(open) => {
                        if (open && !selectedSamples.has(sample.id)) {
                          setSelectedSamples(new Set([sample.id]))
                          setSelectedQrCodes(new Set([sample.id]))
                        }
                      }}>
                        <ContextMenuTrigger asChild>
                          <tr className={`group border-b border-border hover:bg-accent/40 transition-colors ${sample.deleted_at ? 'opacity-60' : ''}`}>
                            <LabUnitRowCells
                              sample={sample}
                              columnVisibility={columnVisibility}
                              anySelected={selectedSamples.size > 0}
                              selected={selectedSamples.has(sample.id)}
                              qrSelected={selectedQrCodes.has(sample.id)}
                              expanded={expandedSamples.has(sample.id)}
                              onSelect={(checked) => handleSelectSample(sample.id, checked)}
                              onToggleQr={(checked) => handleToggleQrCode(sample.id, checked)}
                              onToggleExpand={() => toggleExpand(sample.id)}
                              onOpen={() => setDetailSampleId(sample.id)}
                            />
                            <SampleRowActions
                              variant="labUnit"
                              hasCertificate={!!sample.certificate_id}
                              canDelete={canDeleteSamples}
                              downloading={downloadingSampleId === sample.id}
                              deleting={deletingId === sample.id}
                              onViewCertificate={() => handleViewCertificate(sample)}
                              onViewSample={() => setDetailSampleId(sample.id)}
                              onDownloadCertificate={() => handleDownloadCertificate(sample)}
                              onDelete={() => handleDeleteSample(sample)}
                            />
                          </tr>
                        </ContextMenuTrigger>
                        <RowContextMenuContent
                          sample={sample}
                          singleAssignment={sampleCupperMap[sample.id]}
                          selectedCount={selectedSamples.size}
                          hasCertifiedSelected={hasCertifiedSelected}
                          cuppersAssigned={cuppersAssigned}
                          selectedHaveCuppers={selectedHaveCuppers}
                          selectedCanReprint={selectedCanReprint}
                          assignedCuppers={assignedCuppers}
                          canDelete={canDeleteSamples}
                          onViewSample={() => setDetailSampleId(sample.id)}
                          onEditSample={() => {
                            setDetailStartInEditMode(true)
                            setDetailSampleId(sample.id)
                          }}
                          onDuplicate={e => openDuplicatePrompt(sample, e)}
                          onAddContract={() => setSubContractSample(sample)}
                          onSelectAll={() => handleSelectAll(true)}
                          onSelectAllUncertified={() => {
                            const uncertified = samples.filter(s => s.workflow_stage !== 'certified' && s.workflow_stage !== 'rejected')
                            const ids = new Set(uncertified.map(s => s.id))
                            setSelectedSamples(ids)
                            setSelectedQrCodes(ids)
                          }}
                          onAssignCuppers={() => selectedSamples.size > 1 ? handleBulkAssign() : handleSingleSampleAssign(sample)}
                          onReprintCuppingCards={() => selectedSamples.size > 1 ? handleBulkPrintCuppingCards() : handleSingleSampleReprintCards(sample)}
                          onExport={handleBulkExport}
                          onTinLabel={handleBulkPrintTinSleeves}
                          onPrintBagSleeves={handleBulkPrintBagSleeves}
                          onViewCertificate={() => handleViewCertificate(sample)}
                          onDownloadCertificate={() => handleDownloadCertificate(sample)}
                          onDelete={() => selectedSamples.size > 1 ? handleBulkDelete() : handleDeleteSample(sample)}
                        />
                      </ContextMenu>,
                      // Expanded contract-sibling rows (same columns as the lab unit)
                      ...(expandedSamples.has(sample.id) && sample.sub_contracts?.length
                        ? sample.sub_contracts.map((sc, scIdx) => {
                            const isLast = scIdx === (sample.sub_contracts?.length ?? 0) - 1
                            return (
                              <ContractSiblingRow
                                key={`sc-${sc.id}`}
                                sample={sample}
                                sc={sc}
                                isLast={isLast}
                                columnVisibility={columnVisibility}
                                anySelected={selectedSamples.size > 0}
                                parentSelected={selectedSamples.has(sample.id)}
                                qrSelected={selectedSubContractQrCodes.has(sc.id)}
                                onToggleQr={(checked) => handleToggleSubContractQrCode(sc.id, checked)}
                                onOpen={() => setDetailSampleId(sc.id)}
                              >
                                <SampleRowActions
                                  variant="sibling"
                                  hasCertificate={sc.has_certificate}
                                  canDelete={canDeleteSamples}
                                  downloading={downloadingSampleId === sc.id}
                                  deleting={deletingId === sc.id}
                                  onViewCertificate={() => handleViewCertificate(sc)}
                                  onViewSample={() => setDetailSampleId(sc.id)}
                                  onDownloadCertificate={() => handleDownloadCertificate(sc)}
                                  onDelete={() => handleDeleteSubContract(sample, sc)}
                                />
                              </ContractSiblingRow>
                            )
                          })
                        : []),
                    ])}
                  </tbody>
                </table>
          </div>
        )}
      </div>
        </ContextMenuTrigger>
        <PageContextMenuContent
          selectedCount={selectedSamples.size}
          hasCertifiedSelected={hasCertifiedSelected}
          cuppersAssigned={cuppersAssigned}
          selectedHaveCuppers={selectedHaveCuppers}
          selectedCanReprint={selectedCanReprint}
          assignedCuppers={assignedCuppers}
          canDelete={canDeleteSamples}
          onSelectAll={() => handleSelectAll(true)}
          onSelectAllUncertified={() => {
            const uncertified = samples.filter(s => s.workflow_stage !== 'certified' && s.workflow_stage !== 'rejected')
            const ids = new Set(uncertified.map(s => s.id))
            setSelectedSamples(ids)
            setSelectedQrCodes(ids)
            setAssignedCuppers([])
            setCuppersAssigned(false)
          }}
          onAssignCuppers={handleBulkAssign}
          onReprintCuppingCards={handleBulkPrintCuppingCards}
          onExport={handleBulkExport}
          onTinLabel={handleBulkPrintTinSleeves}
          onPrintBagSleeves={handleBulkPrintBagSleeves}
          onDelete={handleBulkDelete}
        />
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

      {/* Tin labels for the current row selection. Today's batch has its own
          dialog inside PrintTodayTinLabelsButton. */}
      <TinLabelSizeDialog
        open={showTinLabelDialog}
        onOpenChange={setShowTinLabelDialog}
        sampleIds={Array.from(selectedSamples)}
        onSuccess={() => {
          setSelectedSamples(new Set())
          setTodayBatchToken(t => t + 1)
        }}
      />

      {/* Bag sleeves for the current row selection. QR comes from the row
          checkboxes, so the dialog only reports the count. */}
      <PrintBagSleevesDialog
        open={!!bagSleeveEntries}
        onOpenChange={(next) => { if (!next) setBagSleeveEntries(null) }}
        entries={bagSleeveEntries || []}
        onSuccess={() => {
          setBagSleeveEntries(null)
          setSelectedSamples(new Set())
        }}
      />

      {/* Print Cupping Cards Dialog. Lab units only: the dialog moves them to
          cupping, and a contract sibling shares its lab unit's cup. */}
      <PrintCuppingCardsDialog
        open={showCuppingCardsDialog}
        onOpenChange={setShowCuppingCardsDialog}
        samples={samples.filter((s) => selectedSamples.has(s.id) && isLabUnit(s))}
        assignedCuppers={assignedCuppers}
        assignedGuests={assignedGuests}
        onSuccess={() => {
          // Refresh the samples list to show updated status
          loadSamples()
          // Clear selection and reset cupper assignment
          setSelectedSamples(new Set())
          setSelectedQrCodes(new Set())
          setAssignedCuppers([])
          setAssignedGuests([])
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
        existingGuests={existingGuests}
      />

      {/* Add contracts to an existing sample */}
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
          sampleLabel={sampleLabelText(duplicatePrompt.sample)}
          bagType={duplicatePrompt.sample.bag_type}
          sourceQuantity={formatQuantityLine(duplicatePrompt.sample)}
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
      <CertificatePreviewDialog
        previewSample={previewSample}
        previewPdfUrl={previewPdfUrl}
        previewCertNumber={previewCertNumber}
        downloadingSampleId={downloadingSampleId}
        onDownload={handleDownloadCertificate}
        onClose={handleClosePreview}
      />

      {/* Delete Sample Confirmation */}
      <DeleteSampleDialog
        open={!!deleteSampleTarget}
        onOpenChange={(open) => !open && setDeleteSampleTarget(null)}
        sampleLabel={deleteSampleTarget ? sampleLabelText(deleteSampleTarget) : ''}
        deleteReason={deleteReason}
        onDeleteReasonChange={setDeleteReason}
        onConfirm={confirmDeleteSample}
      />

      {/* Bulk Delete Samples Confirmation */}
      <BulkDeleteSamplesDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectedCount={selectedSamples.size}
        deleteReason={deleteReason}
        onDeleteReasonChange={setDeleteReason}
        onConfirm={confirmBulkDelete}
      />

      {/* Delete contract (sibling) confirmation */}
      <DeleteContractDialog
        open={!!deleteSubContractTarget}
        onOpenChange={(open) => !open && setDeleteSubContractTarget(null)}
        contractLabel={deleteSubContractTarget ? sampleLabelText(deleteSubContractTarget.sc) : ''}
        deleteReason={deleteReason}
        onDeleteReasonChange={setDeleteReason}
        onConfirm={confirmDeleteSubContract}
      />

      {/* Sample Detail Overlay */}
      <SampleDetailOverlay
        open={!!detailSampleId}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSampleId(null)
            setDetailStartInEditMode(false)
          }
        }}
        sampleId={detailSampleId}
        onSampleUpdated={loadSamples}
        startInEditMode={detailStartInEditMode}
        // Previous / next follow the rows as listed, a lot's contracts
        // included while its row is expanded.
        navigation={samples.flatMap((s) => [
          { id: s.id, label: sampleLabelText(s) },
          ...(expandedSamples.has(s.id) ? (s.sub_contracts ?? []).map((sc) => ({ id: sc.id, label: sampleLabelText(sc) })) : []),
        ])}
      />
    </>
  )
}
