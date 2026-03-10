'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SampleIntakeForm } from '@/components/samples/sample-intake-form'
import { SampleDetailModal } from '@/components/samples/sample-detail-modal'
import { AddSubContractDialog } from '@/components/samples/add-sub-contract-dialog'
import { PrintLabelsDialog } from '@/components/samples/print-labels-dialog'
import { TinLabelSizeDialog } from '@/components/samples/tin-label-size-dialog'
import { PrintCuppingCardsDialog } from '@/components/cupping/print-cupping-cards-dialog'
import { AssignCuppersDialog } from '@/components/samples/assign-cuppers-dialog'
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

export default function SamplesPage() {
  const { profile } = useAuth()
  const [samples, setSamples] = useState<Sample[]>([])
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
  const [showTinLabelDialog, setShowTinLabelDialog] = useState(false)
  const [showCuppingCardsDialog, setShowCuppingCardsDialog] = useState(false)
  const [showAssignCuppersDialog, setShowAssignCuppersDialog] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteSubContractTarget, setDeleteSubContractTarget] = useState<{ sample: Sample; sc: SubContract } | null>(null)
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set())
  const [selectedSubContractQrCodes, setSelectedSubContractQrCodes] = useState<Set<string>>(new Set())
  const [subContractSample, setSubContractSample] = useState<Sample | null>(null)

  // Certificate preview modal states
  const [previewSample, setPreviewSample] = useState<Sample | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
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

  // Column visibility
  const defaultColumnVisibility: Record<string, boolean> = {
    certNr: true,
    origin: false,
    type: true,
    quality: true,
    seller: false,
    shipper: true,
    wolthers: true,
    importer: true,
    roaster: false,
    endClient: true,
    status: true,
    stage: true,
    storage: false,
    created: true,
  }
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('samplesTableColumns')
        if (stored) return JSON.parse(stored)
      } catch {}
    }
    return defaultColumnVisibility
  })

  const toggleColumn = (col: string) => {
    setColumnVisibility(prev => {
      const next = { ...prev, [col]: !prev[col] }
      localStorage.setItem('samplesTableColumns', JSON.stringify(next))
      return next
    })
  }

  const columnLabels: Record<string, string> = {
    certNr: 'Cert. Nr',
    origin: 'Origin',
    type: 'Type',
    quality: 'Quality',
    seller: 'Seller',
    shipper: 'Shipper',
    wolthers: 'Wolthers',
    importer: 'Importer',
    roaster: 'Roaster',
    endClient: 'End Client',
    status: 'Status',
    stage: 'Stage',
    storage: 'Storage',
    created: 'Created',
  }

  // Check if user is global admin
  const isGlobalAdmin = profile?.is_global_admin || profile?.qc_role === 'global_admin'

  useEffect(() => {
    loadSamples()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const assignment = sampleCupperMap[sample.id]
    if (!assignment) return
    setSelectedSamples(new Set([sample.id]))
    setSelectedQrCodes(new Set([sample.id]))
    setAssignedCuppers(assignment.cuppers)
    setCuppersAssigned(true)
    setShowCuppingCardsDialog(true)
  }

  const handleCuppersAssigned = async (cupperIds: string[], cuppers: Array<{ id: string; full_name: string; email: string }>) => {
    setAssignedCuppers(cuppers)
    setCuppersAssigned(true)
    console.log('Cuppers assigned:', cuppers)

    // Send notifications to assigned cuppers via API
    const sampleIds = Array.from(selectedSamples)
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
        const errorData = await response.json()
        console.error('Failed to send notifications:', errorData)
      } else {
        const data = await response.json()
        console.log('Notifications sent:', data)
      }
    } catch (error) {
      console.error('Error sending cupper assignment notifications:', error)
      // Don't block the workflow if notifications fail
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

  const handleDeleteSample = async (sample: Sample) => {
    const sampleNumber = parseTrackingNumber(sample.tracking_number)

    const confirmed = confirm(
      `Are you sure you want to delete sample ${sampleNumber}?\n\n` +
      `This action cannot be undone and will permanently delete:\n` +
      `- The sample record\n` +
      `- All quality assessments\n` +
      `- All related certificates\n` +
      `- All activity logs`
    )

    if (!confirmed) return

    const userInput = prompt(`Please type the sample number to confirm deletion:\n${sampleNumber}`)

    if (userInput !== sampleNumber) {
      alert('Sample number does not match. Deletion cancelled.')
      return
    }

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

      alert(`Sample ${sampleNumber} deleted successfully`)
    } catch (error) {
      console.error('Error deleting sample:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete sample. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedSamples.size === 0) {
      alert('Please select at least one sample to delete')
      return
    }

    const confirmed = confirm(
      `Are you sure you want to delete ${selectedSamples.size} sample(s)?\n\n` +
      `This action cannot be undone and will permanently delete:\n` +
      `- All sample records\n` +
      `- All quality assessments\n` +
      `- All related certificates\n` +
      `- All activity logs`
    )

    if (!confirmed) return

    const confirmText = `DELETE ${selectedSamples.size} SAMPLES`
    const userInput = prompt(`Please type "${confirmText}" to confirm bulk deletion:`)

    if (userInput !== confirmText) {
      alert('Confirmation text does not match. Deletion cancelled.')
      return
    }

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
        alert(`Deleted ${successCount} sample(s). ${failCount} failed.`)
      } else {
        alert(`Successfully deleted ${successCount} sample(s)`)
      }
    } catch (error) {
      console.error('Error in bulk delete:', error)
      alert('Failed to delete samples. Please try again.')
    }
  }

  // Certificate handlers
  const handleViewCertificate = (sample: Sample) => {
    setPreviewSample(sample)
    // Use direct API URL so the browser's PDF viewer respects Content-Disposition filename
    setPreviewPdfUrl(`/api/samples/${sample.id}/certificate`)
  }

  const handleClosePreview = () => {
    setPreviewSample(null)
    setPreviewPdfUrl(null)
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
        a.download = `${sample.certificate_number || parseTrackingNumber(sample.tracking_number)}.pdf`
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
        a.download = `${trackingNumber}.pdf`
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

  const handleViewSubContractCertificate = (sampleId: string, contractId: string) => {
    setPreviewSample(samples.find(s => s.id === sampleId) || null)
    setPreviewPdfUrl(`/api/samples/${sampleId}/certificate?contract_id=${contractId}`)
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
  const handleDuplicateSample = async (sample: Sample) => {
    if (!confirm(`Duplicate sample "${sample.tracking_number}"? This will create a new independent sample record sharing the same contract.`)) {
      return
    }
    try {
      const res = await fetch(`/api/samples/${sample.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to duplicate sample')
        return
      }
      const data = await res.json()
      alert(`Sample duplicated successfully: ${data.sample.tracking_number}`)
      loadSamples()
    } catch (error) {
      console.error('Error duplicating sample:', error)
      alert('Failed to duplicate sample')
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
      analysis: 'Analysis',
      roasting: 'Roasting',
      review: 'Review',
      certified: 'Certified',
      rejected: 'Rejected'
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

  const hasCertifiedSelected = selectedSamples.size > 0 && samples.some(s => selectedSamples.has(s.id) && (s.workflow_stage === 'certified' || s.workflow_stage === 'rejected'))

  return (
    <>
    <MainLayout>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div className="p-6 space-y-6 max-w-[1800px]">
        {/* Header - Sticky on desktop */}
        <div className="sticky top-0 z-10 bg-background pb-4 -mx-6 px-6 pt-6 border-b md:border-0">
          <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sample Tracking</h1>
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

                  {/* Cupper Assignment - Priority Action */}
                  <DropdownMenuItem onClick={handleBulkAssign} disabled={hasCertifiedSelected}>
                    <Users className="h-4 w-4 mr-2" />
                    {cuppersAssigned
                      ? `Manage Cuppers (${assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')})`
                      : 'Assign Cuppers'}
                  </DropdownMenuItem>
                  {hasCertifiedSelected && (
                    <div className="px-2 pb-1 text-xs text-destructive">
                      Certified/rejected sample selected
                    </div>
                  )}

                  {/* Print Actions - Only shown after cuppers assigned */}
                  {cuppersAssigned && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleBulkPrintCuppingCards} disabled={hasCertifiedSelected}>
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
                  <DropdownMenuItem onClick={handleBulkPrintTinSleeves}>
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
                    placeholder="Search by tracking, supplier, contract, ICO, container, sample nr, quality..."
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
                  variant={workflowStageFilter === 'analysis' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('analysis')}
                  size="sm"
                >
                  Analysis
                </Button>
                <Button
                  variant={workflowStageFilter === 'roasting' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('roasting')}
                  size="sm"
                >
                  Roasting
                </Button>
                <Button
                  variant={workflowStageFilter === 'review' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('review')}
                  size="sm"
                >
                  Review
                </Button>
                <Button
                  variant={workflowStageFilter === 'certified' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('certified')}
                  size="sm"
                >
                  Certified
                </Button>
                <Button
                  variant={workflowStageFilter === 'rejected' ? 'default' : 'outline'}
                  onClick={() => setWorkflowStageFilter('rejected')}
                  size="sm"
                >
                  Rejected
                </Button>
                <Button
                  variant="ghost"
                  onClick={clearFilters}
                  size="sm"
                >
                  Clear All
                </Button>
                <div className="ml-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Settings2 className="h-4 w-4 mr-2" />
                        Columns
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
                </div>
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
                      {selectedSamples.size > 0 && (
                        <th className="text-left py-3 px-4 text-sm font-semibold">
                          <div className="flex items-center gap-1">
                            <QrCode className="h-3 w-3" />
                            QR
                          </div>
                        </th>
                      )}
                      {columnVisibility.certNr && <th className="text-left py-3 px-4 text-sm font-semibold">Cert. Nr</th>}
                      {columnVisibility.origin && <th className="text-left py-3 px-4 text-sm font-semibold">Origin</th>}
                      {columnVisibility.type && <th className="text-left py-3 px-4 text-sm font-semibold">Type</th>}
                      {columnVisibility.quality && <th className="text-left py-3 px-4 text-sm font-semibold">Quality</th>}
                      {columnVisibility.seller && <th className="text-left py-3 px-4 text-sm font-semibold">Seller</th>}
                      {columnVisibility.shipper && <th className="text-left py-3 px-4 text-sm font-semibold">Shipper</th>}
                      {columnVisibility.wolthers && <th className="text-left py-3 px-4 text-sm font-semibold">Wolthers</th>}
                      {columnVisibility.importer && <th className="text-left py-3 px-4 text-sm font-semibold">Importer</th>}
                      {columnVisibility.roaster && <th className="text-left py-3 px-4 text-sm font-semibold">Roaster</th>}
                      {columnVisibility.endClient && <th className="text-left py-3 px-4 text-sm font-semibold">End Client</th>}
                      {columnVisibility.status && <th className="text-left py-3 px-4 text-sm font-semibold">Status</th>}
                      {columnVisibility.stage && <th className="text-left py-3 px-4 text-sm font-semibold">Stage</th>}
                      {columnVisibility.storage && <th className="text-left py-3 px-4 text-sm font-semibold">Storage</th>}
                      {columnVisibility.created && <th className="text-left py-3 px-4 text-sm font-semibold">Created</th>}
                      <th className="text-left py-3 px-4 text-sm font-semibold">Actions</th>
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
                          <tr className="border-b border-border hover:bg-accent/50 transition-colors">
                            <td className="py-3 px-4 align-top">
                              <div className="flex flex-col items-center gap-1">
                                <Checkbox
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
                                {expandedSamples.has(sample.id) && (sample.contract_count ?? 0) > 0 && (
                                  <div className="w-px bg-border h-2" />
                                )}
                              </div>
                            </td>
                            {selectedSamples.size > 0 && (
                              <td className="py-3 px-4 align-top">
                                {selectedSamples.has(sample.id) && (
                                  <Checkbox
                                    checked={selectedQrCodes.has(sample.id)}
                                    onCheckedChange={(checked) => handleToggleQrCode(sample.id, checked as boolean)}
                                  />
                                )}
                              </td>
                            )}
                            {columnVisibility.certNr && (
                              <td className="py-3 px-4">
                                <button onClick={() => setDetailSampleId(sample.id)} className="font-medium hover:underline text-primary text-left">
                                  {parseTrackingNumber(sample.tracking_number)}
                                </button>
                                {sample.exporter_sample_number && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {sample.exporter_sample_number}
                                  </div>
                                )}
                                {sample.sample_type === 'ss' && sample.container_nr && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {sample.container_nr}
                                  </div>
                                )}
                              </td>
                            )}
                            {columnVisibility.origin && (
                              <td className="py-3 px-4 text-sm">{sample.origin || '-'}</td>
                            )}
                            {columnVisibility.type && (
                              <td className="py-3 px-4 text-sm">
                                <Badge variant="outline" className="text-xs">
                                  {formatSampleType(sample.sample_type)}
                                </Badge>
                              </td>
                            )}
                            {columnVisibility.quality && (
                              <td className="py-3 px-4 text-sm">{sample.quality_name || '-'}</td>
                            )}
                            {columnVisibility.seller && (
                              <td className="py-3 px-4 text-sm">
                                <div>{sample.seller_name || '-'}</div>
                                {sample.seller_contract_nr && (
                                  <div className="text-xs text-muted-foreground">{sample.seller_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.shipper && (
                              <td className="py-3 px-4 text-sm">
                                <div>{sample.exporter_name || '-'}</div>
                                {sample.shipper_contract_nr && (
                                  <div className="text-xs text-muted-foreground">{sample.shipper_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.wolthers && (
                              <td className="py-3 px-4 text-sm font-mono text-xs">{sample.wolthers_contract_nr || '-'}</td>
                            )}
                            {columnVisibility.importer && (
                              <td className="py-3 px-4 text-sm">
                                <div>{sample.importer_name || (sample.importer_is_qc_client ? sample.qc_client_name : null) || '-'}</div>
                                {sample.buyer_contract_nr && (
                                  <div className="text-xs text-muted-foreground">{sample.buyer_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.roaster && (
                              <td className="py-3 px-4 text-sm">
                                <div>{sample.roaster_name || '-'}</div>
                                {sample.roaster_contract_nr && (
                                  <div className="text-xs text-muted-foreground">{sample.roaster_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.endClient && (
                              <td className="py-3 px-4 text-sm">
                                <div>{sample.end_client_name || sample.qc_client_name || '-'}</div>
                                {(sample.end_client_contract_nr || sample.qc_client_contract_nr) && (
                                  <div className="text-xs text-muted-foreground">{sample.end_client_contract_nr || sample.qc_client_contract_nr}</div>
                                )}
                              </td>
                            )}
                            {columnVisibility.status && (
                              <td className="py-3 px-4">{getStatusBadge(sample.status)}</td>
                            )}
                            {columnVisibility.stage && (
                              <td className="py-3 px-4">{getWorkflowStageBadge(sample.workflow_stage)}</td>
                            )}
                            {columnVisibility.storage && (
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
                            )}
                            {columnVisibility.created && (
                              <td className="py-3 px-4 text-sm">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(sample.created_at).toLocaleDateString()}
                                </div>
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1">
                                {sample.certificate_id ? (
                                  <Button variant="outline" size="sm" onClick={() => handleViewCertificate(sample)}>
                                    <Eye className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                ) : (
                                  <Button variant="outline" size="sm" onClick={() => setDetailSampleId(sample.id)}>
                                    <Eye className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                )}
                                {sample.certificate_id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownloadCertificate(sample)}
                                    disabled={downloadingSampleId === sample.id}
                                    title="Download Certificate"
                                  >
                                    {downloadingSampleId === sample.id ? (
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
                                    onClick={() => handleDeleteSample(sample)}
                                    disabled={deletingId === sample.id}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="h-3 w-3" />
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
                            <ContextMenuItem onClick={() => handleDuplicateSample(sample)}>
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
                            const singleAssignment = selectedSamples.size <= 1 ? sampleCupperMap[sample.id] : null
                            const hasCuppers = selectedSamples.size > 1 ? cuppersAssigned : !!singleAssignment
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
                                    ? `Edit Cuppers (${cupperNames})`
                                    : 'Assign Cuppers'}
                                </ContextMenuItem>
                                {hasCertifiedSelected && (
                                  <div className="px-2 pb-1 text-xs text-destructive">
                                    Certified/rejected sample selected
                                  </div>
                                )}
                                {hasCuppers && (
                                  <ContextMenuItem
                                    onClick={() => selectedSamples.size > 1 ? handleBulkPrintCuppingCards() : handleSingleSampleReprintCards(sample)}
                                    disabled={hasCertifiedSelected}
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
                          <ContextMenuItem onClick={handleBulkPrintTinSleeves}>
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
                                className="border-b border-border bg-muted/40 hover:bg-muted/60 transition-colors text-xs"
                              >
                                {/* Tree connector in checkbox column */}
                                <td className="py-0 px-0 w-10">
                                  <div className="relative flex items-center justify-center" style={{minHeight: '40px'}}>
                                    <div className="absolute left-1/2 -translate-x-1/2 top-0 w-px bg-border" style={{height: isLast ? '50%' : '100%'}} />
                                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 h-px bg-border w-3" />
                                  </div>
                                </td>
                                {/* QR column */}
                                {selectedSamples.size > 0 && (
                                  <td className="py-2 px-4">
                                    {selectedSamples.has(sample.id) && (
                                      <Checkbox
                                        checked={selectedSubContractQrCodes.has(sc.id)}
                                        onCheckedChange={(checked) => handleToggleSubContractQrCode(sc.id, checked as boolean)}
                                      />
                                    )}
                                  </td>
                                )}
                                {/* Cert Nr */}
                                {columnVisibility.certNr && (
                                  <td className="py-1.5 px-4">
                                    <button onClick={() => setDetailSampleId(sample.id)} className="font-medium hover:underline text-primary text-left">
                                      {sc.tracking_number}
                                    </button>
                                    {(sc.container_nr || sc.ico_number) && (
                                      <div className="text-[10px] text-muted-foreground">
                                        {[sc.container_nr, sc.ico_number ? `ICO: ${sc.ico_number}` : null].filter(Boolean).join(' | ')}
                                      </div>
                                    )}
                                  </td>
                                )}
                                {/* Origin - inherited */}
                                {columnVisibility.origin && (
                                  <td className="py-1.5 px-4 text-muted-foreground">{sample.origin || '-'}</td>
                                )}
                                {/* Type - inherited */}
                                {columnVisibility.type && (
                                  <td className="py-1.5 px-4">
                                    <Badge variant="outline" className="text-[10px] opacity-50">
                                      {formatSampleType(sample.sample_type)}
                                    </Badge>
                                  </td>
                                )}
                                {/* Quality - inherited */}
                                {columnVisibility.quality && (
                                  <td className="py-1.5 px-4 text-muted-foreground">{sample.quality_name || '-'}</td>
                                )}
                                {/* Seller - inherited */}
                                {columnVisibility.seller && (
                                  <td className="py-1.5 px-4 text-muted-foreground">
                                    <div>{sample.seller_name || '-'}</div>
                                    {sc.supplier_contract_nr && (
                                      <div className="text-[10px]">{sc.supplier_contract_nr}</div>
                                    )}
                                  </td>
                                )}
                                {/* Shipper - inherited */}
                                {columnVisibility.shipper && (
                                  <td className="py-1.5 px-4 text-muted-foreground">{sample.exporter_name || '-'}</td>
                                )}
                                {/* Wolthers */}
                                {columnVisibility.wolthers && (
                                  <td className="py-1.5 px-4 font-mono">{sc.wolthers_contract_nr || '-'}</td>
                                )}
                                {/* Importer */}
                                {columnVisibility.importer && (
                                  <td className="py-1.5 px-4">
                                    <div>{sc.importer_name || '-'}</div>
                                    {sc.buyer_contract_nr && (
                                      <div className="text-[10px] text-muted-foreground">{sc.buyer_contract_nr}</div>
                                    )}
                                  </td>
                                )}
                                {/* Roaster */}
                                {columnVisibility.roaster && (
                                  <td className="py-1.5 px-4">
                                    <div>{sc.roaster_name || '-'}</div>
                                    {sc.roaster_contract_nr && (
                                      <div className="text-[10px] text-muted-foreground">{sc.roaster_contract_nr}</div>
                                    )}
                                  </td>
                                )}
                                {/* End Client */}
                                {columnVisibility.endClient && (
                                  <td className="py-1.5 px-4">
                                    <div>{sc.end_client_name || sc.qc_client_name || '-'}</div>
                                    {(sc.end_client_contract_nr || sc.qc_client_contract_nr) && (
                                      <div className="text-[10px] text-muted-foreground">{sc.end_client_contract_nr || sc.qc_client_contract_nr}</div>
                                    )}
                                  </td>
                                )}
                                {/* Status - inherited */}
                                {columnVisibility.status && (
                                  <td className="py-1.5 px-4">{getStatusBadge(sample.status)}</td>
                                )}
                                {/* Stage - inherited */}
                                {columnVisibility.stage && (
                                  <td className="py-1.5 px-4">{getWorkflowStageBadge(sample.workflow_stage)}</td>
                                )}
                                {/* Storage - inherited */}
                                {columnVisibility.storage && (
                                  <td className="py-1.5 px-4 text-muted-foreground">{sample.storage_position || '-'}</td>
                                )}
                                {/* Created - inherited */}
                                {columnVisibility.created && (
                                  <td className="py-1.5 px-4 text-muted-foreground">
                                    {new Date(sample.created_at).toLocaleDateString()}
                                  </td>
                                )}
                                {/* Actions */}
                                <td className="py-1.5 px-4">
                                  <div className="flex items-center gap-0.5">
                                    {sc.has_certificate ? (
                                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => handleViewSubContractCertificate(sample.id, sc.id)}>
                                        <Eye className="h-2.5 w-2.5 mr-0.5" />
                                        View
                                      </Button>
                                    ) : (
                                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setDetailSampleId(sample.id)}>
                                        <Eye className="h-2.5 w-2.5 mr-0.5" />
                                        View
                                      </Button>
                                    )}
                                    {sc.has_certificate && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => handleDownloadSubContractCertificate(sample.id, sc.id, sc.tracking_number)}
                                        disabled={downloadingSampleId === `${sample.id}_${sc.id}`}
                                        title="Download Certificate"
                                      >
                                        {downloadingSampleId === `${sample.id}_${sc.id}` ? (
                                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                        ) : (
                                          <Download className="h-2.5 w-2.5" />
                                        )}
                                      </Button>
                                    )}
                                    {isGlobalAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDeleteSubContract(sample, sc)}
                                        disabled={deletingId === sc.id}
                                        title="Delete Sub-Contract"
                                      >
                                        {deletingId === sc.id ? (
                                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-2.5 w-2.5" />
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
                {cuppersAssigned
                  ? `Edit Cuppers (${assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')})`
                  : 'Assign Cuppers'}
              </ContextMenuItem>
              {hasCertifiedSelected && (
                <div className="px-2 pb-1 text-xs text-destructive">
                  Certified/rejected sample selected
                </div>
              )}
              {cuppersAssigned && (
                <ContextMenuItem onClick={handleBulkPrintCuppingCards} disabled={hasCertifiedSelected}>
                  <FileText className="h-4 w-4 mr-2" />
                  Reprint Cupping Cards
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleBulkExport}>
                <Download className="h-4 w-4 mr-2" />
                Export to Excel
              </ContextMenuItem>
              <ContextMenuItem onClick={handleBulkPrintTinSleeves}>
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
        onOpenChange={setShowTinLabelDialog}
        sampleIds={Array.from(selectedSamples)}
        onSuccess={() => {
          setSelectedSamples(new Set())
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

      {/* Certificate Preview Modal */}
      <Dialog open={!!previewSample} onOpenChange={(open) => !open && handleClosePreview()}>
        <DialogContent className="sm:max-w-[1100px] max-h-[95vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certificate {previewSample?.certificate_number || parseTrackingNumber(previewSample?.tracking_number || '')}
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

      {/* Sample Detail Modal */}
      <SampleDetailModal
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
      />
    </>
  )
}
