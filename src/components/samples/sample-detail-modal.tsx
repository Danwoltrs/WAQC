'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CheckCircle, XCircle, Clock, AlertCircle, MapPin,
  FileText, Download, Printer,
  QrCode, Edit, Trash2, User, Award, Loader2, Eye, Mail,
  Save, X, Coffee
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/components/providers/auth-provider'
import { trackingNumberToSlug } from '@/lib/utils'
import { MICRO_ORIGINS } from '@/components/samples/intake/constants'
import { SupplyChainEditTable } from '@/components/samples/supply-chain-edit-table'
import { CuppingGradingSection } from '@/components/samples/cupping-grading-section'

interface EditPermission {
  canEdit: boolean
  reason: 'not_locked' | 'within_7_days' | 'locked_after_scan' | 'locked_after_7_days'
  lockExpiresAt: string | null
  message: string
}

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  seller_id?: string | null
  exporter_id?: string | null
  importer_id?: string | null
  roaster_id?: string | null
  end_client_id?: string | null
  supplier?: string
  seller_name?: string
  seller_country?: string
  exporter_name?: string
  exporter_country?: string
  origin: string
  importer_name?: string
  importer_country?: string
  roaster_name?: string
  roaster_country?: string
  end_client_name?: string
  end_client_country?: string
  qc_client_name?: string
  qc_client_country?: string
  importer_is_qc_client?: boolean
  end_client_contract_nr?: string
  supplier_contract_nr?: string
  buyer?: string
  quality_name?: string
  quality_code?: string
  quality_spec_id?: string
  sample_type?: string
  status: string
  workflow_stage?: string
  storage_position?: string
  bags_quantity_mt?: number
  bag_count?: number
  bags?: number
  bag_weight_kg?: number
  bag_type?: string
  equivalent_60kg_bags?: number
  wolthers_contract_nr?: string
  seller_contract_nr?: string
  shipper_contract_nr?: string
  exporter_contract_nr?: string
  buyer_contract_nr?: string
  roaster_contract_nr?: string
  qc_client_contract_nr?: string
  ico_number?: string
  ico_marks?: string
  container_nr?: string
  processing_method?: string
  micro_origin?: string
  laboratory_id?: string
  assigned_to?: string
  same_seller_shipper?: boolean
  exporter_sample_number?: string
  created_at: string
  updated_at?: string
  certificate_id?: string | null
  certificate_number?: string | null
  certificate_status?: string | null
  certificate_created_at?: string | null
}

interface Certificate {
  id: string
  sample_id: string
  certificate_number: string
  status: string
  issued_date?: string
  created_at: string
}

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

export interface SampleDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  onSampleUpdated?: () => void
  startInEditMode?: boolean
}

export function SampleDetailModal({
  open,
  onOpenChange,
  sampleId,
  onSampleUpdated,
  startInEditMode,
}: SampleDetailModalProps) {
  const { profile } = useAuth()
  const [sample, setSample] = useState<Sample | null>(null)
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [generatingCertificate, setGeneratingCertificate] = useState(false)
  const [downloadingCertificate, setDownloadingCertificate] = useState(false)

  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editPermission, setEditPermission] = useState<EditPermission | null>(null)
  const [formData, setFormData] = useState<Partial<Sample>>({})

  // Certificate preview modal states
  const [showCertificateModal, setShowCertificateModal] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState({
    exporter: true,
    importer: true,
    roaster: true
  })

  // Quality spec options for dropdown
  const [qualityOptions, setQualityOptions] = useState<Array<{ id: string; custom_name: string; quality_code: string | null }>>([])
  const [loadingQualities, setLoadingQualities] = useState(false)

  // QR Code modal state
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [generatingQr, setGeneratingQr] = useState(false)

  // Print label
  const [printingLabel, setPrintingLabel] = useState(false)

  // Reset state when sampleId changes or modal opens
  useEffect(() => {
    if (open && sampleId) {
      setSample(null)
      setLoadError(null)
      setIsEditMode(false)
      setFormData({})
      loadSampleDetails(sampleId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sampleId])

  // Auto-enter edit mode when startInEditMode is true and sample is loaded
  useEffect(() => {
    if (startInEditMode && sample && !loading && !isEditMode) {
      handleEnterEditMode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startInEditMode, sample, loading])

  const loadEditPermission = async (sampleUuid: string) => {
    try {
      const res = await fetch(`/api/cupping/check-edit-permission?sampleId=${sampleUuid}`)
      if (res.ok) {
        const data = await res.json()
        setEditPermission(data)
      }
    } catch (error) {
      console.error('Error loading edit permission:', error)
    }
  }

  const loadSampleDetails = async (id: string) => {
    try {
      setLoading(true)
      setLoadError(null)

      const sampleRes = await fetch(`/api/samples/${id}`)
      const sampleData = await sampleRes.json()

      if (sampleRes.ok && sampleData.sample) {
        setSample(sampleData.sample)
        loadEditPermission(sampleData.sample.id)

        if (sampleData.sample.certificate_id) {
          setCertificates([{
            id: sampleData.sample.certificate_id,
            sample_id: sampleData.sample.id,
            certificate_number: sampleData.sample.certificate_number || 'Available',
            status: sampleData.sample.certificate_status || 'issued',
            created_at: sampleData.sample.certificate_created_at || new Date().toISOString()
          }])
        } else {
          setCertificates([])
        }
      } else if (sampleRes.status === 401) {
        setLoadError('unauthorized')
      } else {
        setLoadError('not_found')
      }
    } catch (error) {
      console.error('Error loading sample details:', error)
      setLoadError('network')
    } finally {
      setLoading(false)
    }
  }

  const loadQualityOptions = async (clientId: string) => {
    try {
      setLoadingQualities(true)
      const res = await fetch(`/api/client-qualities?client_id=${clientId}&is_active=true`)
      if (res.ok) {
        const data = await res.json()
        setQualityOptions(
          (data.client_qualities || []).map((q: any) => ({
            id: q.id,
            custom_name: q.custom_name || q.template?.name || 'Unnamed',
            quality_code: q.quality_code,
          }))
        )
      }
    } catch (error) {
      console.error('Error loading quality options:', error)
    } finally {
      setLoadingQualities(false)
    }
  }

  const handleEnterEditMode = () => {
    if (!sample) return
    setFormData({
      bag_count: sample.bag_count,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      wolthers_contract_nr: sample.wolthers_contract_nr,
      seller_contract_nr: sample.seller_contract_nr,
      shipper_contract_nr: sample.shipper_contract_nr,
      exporter_contract_nr: sample.exporter_contract_nr,
      buyer_contract_nr: sample.buyer_contract_nr,
      roaster_contract_nr: sample.roaster_contract_nr,
      qc_client_contract_nr: sample.qc_client_contract_nr,
      end_client_contract_nr: sample.end_client_contract_nr,
      supplier_contract_nr: sample.supplier_contract_nr,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      processing_method: sample.processing_method,
      micro_origin: sample.micro_origin,
      storage_position: sample.storage_position,
      quality_spec_id: sample.quality_spec_id,
      ...(sample.seller_id ? { seller_id: sample.seller_id } : {}),
      ...(sample.exporter_id ? { exporter_id: sample.exporter_id } : {}),
      ...(sample.importer_id ? { importer_id: sample.importer_id } : {}),
      ...(sample.roaster_id ? { roaster_id: sample.roaster_id } : {}),
      ...(sample.end_client_id ? { end_client_id: sample.end_client_id } : {}),
      ...(sample.client_id ? { client_id: sample.client_id } : {}),
    })
    setIsEditMode(true)
    // Load quality options for the client
    if (sample.client_id) {
      loadQualityOptions(sample.client_id)
    }
  }

  const handleCancelEdit = () => {
    setIsEditMode(false)
    setFormData({})
  }

  const handleSaveChanges = async () => {
    if (!sample) return

    try {
      setSaving(true)
      // If quality_spec_id changed, also update quality_name
      const saveData: Record<string, any> = { ...formData }
      if (saveData.quality_spec_id && saveData.quality_spec_id !== sample.quality_spec_id) {
        const selectedQuality = qualityOptions.find(q => q.id === saveData.quality_spec_id)
        if (selectedQuality) {
          saveData.quality_name = selectedQuality.custom_name
        }
      } else if (saveData.quality_spec_id === null && sample.quality_spec_id) {
        saveData.quality_name = null
      }
      const response = await fetch(`/api/samples/${sample.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save changes')
      }

      await loadSampleDetails(sample.id)
      setIsEditMode(false)
      setFormData({})
      onSampleUpdated?.()
    } catch (error) {
      console.error('Error saving changes:', error)
      alert(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleFormChange = (field: keyof Sample, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleShowQrCode = async () => {
    if (!sample) return
    setShowQrModal(true)
    setGeneratingQr(true)
    try {
      const QRCode = await import('qrcode')
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const certUrl = `${baseUrl}/certificate/${trackingNumberToSlug(sample.tracking_number)}`

      const lines: string[] = [sample.tracking_number]

      const res = await fetch(`/api/samples/${sample.id}/quality-assessment`)
      if (res.ok) {
        const data = await res.json()
        const gb = data.assessment?.green_bean_data
        if (gb) {
          const defects = gb.defects
          const primary = defects?.total_primary ?? defects?.primary ?? null
          const secondary = defects?.total_secondary ?? defects?.secondary ?? null
          const total = defects?.total ?? (primary != null && secondary != null ? primary + secondary : null)
          if (total != null) {
            let defLine = `Def: ${total}`
            if (primary != null && secondary != null) {
              defLine += ` (${primary}p|${secondary}s)`
            }
            lines.push(defLine)
          }

          const screenSizes = gb.screen_sizes as Record<string, number> | undefined
          if (screenSizes) {
            const numbered: Array<{ num: number; pct: number }> = []
            let panPct = 0
            for (const [key, pct] of Object.entries(screenSizes)) {
              if (pct === 0) continue
              if (/^(pan|fundo|bottom)$/i.test(key)) {
                panPct += pct
              } else {
                const num = parseInt(key.replace(/\D/g, ''))
                if (!isNaN(num)) numbered.push({ num, pct })
              }
            }
            numbered.sort((a, b) => b.num - a.num)
            const groups: Array<{ label: string; pct: number }> = []
            let i = 0
            while (i < numbered.length) {
              let j = i
              let groupPct = numbered[i].pct
              while (j + 1 < numbered.length && numbered[j].num - numbered[j + 1].num === 1) {
                j++
                groupPct += numbered[j].pct
              }
              if (i === j) {
                groups.push({ label: String(numbered[i].num), pct: groupPct })
              } else if (j - i === 1) {
                groups.push({ label: `${numbered[i].num}/${numbered[j].num}`, pct: groupPct })
              } else {
                groups.push({ label: `${numbered[j].num}-${numbered[i].num}`, pct: groupPct })
              }
              i = j + 1
            }
            if (panPct > 0) groups.push({ label: 'Pan', pct: panPct })
            if (groups.length > 0) {
              lines.push(groups.map(g => `${g.label}:${Math.round(g.pct)}%`).join(' '))
            }
          }
        }
      }

      lines.push(certUrl)
      const qrContent = lines.join('\n')
      const dataUrl = await QRCode.toDataURL(qrContent, { width: 256, margin: 2 })
      setQrCodeDataUrl(dataUrl)
    } catch (error) {
      console.error('Error generating QR code:', error)
    } finally {
      setGeneratingQr(false)
    }
  }

  const handleDownloadQrCode = () => {
    if (!qrCodeDataUrl || !sample) return
    const a = document.createElement('a')
    a.href = qrCodeDataUrl
    a.download = `${parseTrackingNumber(sample.tracking_number)}-qr.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handlePrintLabel = async () => {
    if (!sample) return

    try {
      setPrintingLabel(true)
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: [sample.id] })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate label')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const printWindow = window.open(url)
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60000)
    } catch (error) {
      console.error('Error printing label:', error)
      alert(error instanceof Error ? error.message : 'Failed to print label')
    } finally {
      setPrintingLabel(false)
    }
  }

  const handleExport = () => {
    if (!sample) return

    const exportData = {
      tracking_number: parseTrackingNumber(sample.tracking_number),
      origin: sample.origin,
      quality: sample.quality_name,
      processing_method: sample.processing_method,
      sample_type: sample.sample_type,
      status: sample.status,
      workflow_stage: sample.workflow_stage,
      bag_count: sample.bag_count,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      equivalent_60kg_bags: sample.equivalent_60kg_bags,
      exporter: sample.exporter_name,
      importer: sample.importer_name,
      roaster: sample.roaster_name,
      wolthers_contract_nr: sample.wolthers_contract_nr,
      exporter_contract_nr: sample.exporter_contract_nr,
      buyer_contract_nr: sample.buyer_contract_nr,
      roaster_contract_nr: sample.roaster_contract_nr,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      storage_position: sample.storage_position,
      created_at: sample.created_at,
      updated_at: sample.updated_at,
      certificate_number: sample.certificate_number,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${parseTrackingNumber(sample.tracking_number)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handleDelete = async () => {
    if (!sample) return

    const confirmed = confirm(
      `Are you sure you want to delete sample ${parseTrackingNumber(sample.tracking_number)}?\n\n` +
      `This action cannot be undone and will permanently delete:\n` +
      `- The sample record\n` +
      `- All quality assessments\n` +
      `- All related certificates\n` +
      `- All activity logs\n\n` +
      `Type the sample number to confirm.`
    )

    if (!confirmed) return

    const userInput = prompt(`Please type the sample number to confirm deletion:\n${parseTrackingNumber(sample.tracking_number)}`)

    if (userInput !== parseTrackingNumber(sample.tracking_number)) {
      alert('Sample number does not match. Deletion cancelled.')
      return
    }

    try {
      setDeleting(true)
      const response = await fetch(`/api/samples/${sample.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete sample')
      }

      const data = await response.json()
      alert(data.message || 'Sample deleted successfully')
      onOpenChange(false)
      onSampleUpdated?.()
    } catch (error) {
      console.error('Error deleting sample:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete sample')
    } finally {
      setDeleting(false)
    }
  }

  const handleGenerateCertificate = async () => {
    if (!sample) return

    try {
      setGeneratingCertificate(true)

      const createRes = await fetch(`/api/samples/${sample.id}/certificate`, {
        method: 'POST'
      })

      if (!createRes.ok) {
        const data = await createRes.json()
        const errorMsg = data.details
          ? `${data.error}: ${data.details}`
          : (data.error || 'Failed to create certificate')
        throw new Error(errorMsg)
      }

      await handleDownloadCertificate()
      await loadSampleDetails(sample.id)
      onSampleUpdated?.()
    } catch (error) {
      console.error('Error generating certificate:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate certificate')
    } finally {
      setGeneratingCertificate(false)
    }
  }

  const handleDownloadCertificate = async () => {
    if (!sample) return

    try {
      setDownloadingCertificate(true)

      const response = await fetch(`/api/samples/${sample.id}/certificate`)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to download certificate')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${parseTrackingNumber(sample.tracking_number)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading certificate:', error)
      alert(error instanceof Error ? error.message : 'Failed to download certificate')
    } finally {
      setDownloadingCertificate(false)
    }
  }

  const handleViewCertificate = async () => {
    if (!sample) return

    setShowCertificateModal(true)
    setPreviewLoading(true)
    setPreviewPdfUrl(null)

    try {
      const response = await fetch(`/api/samples/${sample.id}/certificate`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        setPreviewPdfUrl(url)
      }
    } catch (error) {
      console.error('Error loading certificate preview:', error)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleClosePreview = () => {
    if (previewPdfUrl) {
      window.URL.revokeObjectURL(previewPdfUrl)
    }
    setShowCertificateModal(false)
    setPreviewPdfUrl(null)
    setPreviewLoading(false)
  }

  const handleSendEmail = async () => {
    if (!sample) return
    if (!emailRecipients.exporter && !emailRecipients.importer && !emailRecipients.roaster) {
      alert('Please select at least one recipient type')
      return
    }

    try {
      setSendingEmail(true)

      const certRes = await fetch(`/api/certificates?sample_id=${sample.id}`)
      const certData = await certRes.json()

      if (!certRes.ok || !certData.certificates?.length) {
        alert('Certificate not found')
        return
      }

      const response = await fetch('/api/certificates/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificateIds: [certData.certificates[0].id],
          recipients: emailRecipients
        })
      })

      const data = await response.json()

      if (response.ok) {
        alert(`Email sent successfully to ${data.successful} recipient(s)`)
        setShowEmailDialog(false)
      } else {
        alert(`Failed to send email: ${data.error}`)
      }
    } catch (error) {
      console.error('Error sending email:', error)
      alert('Failed to send email')
    } finally {
      setSendingEmail(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; icon: any; label: string; className?: string }> = {
      received: { variant: 'secondary', icon: Clock, label: 'Received', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      in_progress: { variant: 'default', icon: AlertCircle, label: 'In Progress', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
      under_review: { variant: 'outline', icon: AlertCircle, label: 'Under Review', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !sample ? (
            <div className="text-center py-12 px-6">
              {loadError === 'unauthorized' ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">Session expired</h3>
                  <p className="text-muted-foreground">Your session has expired. Please log in again.</p>
                </>
              ) : loadError === 'network' ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">Connection error</h3>
                  <p className="text-muted-foreground mb-4">
                    Could not reach the server. Please check your connection and try again.
                  </p>
                  <Button variant="outline" onClick={() => sampleId && loadSampleDetails(sampleId)}>
                    Retry
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-2">Sample not found</h3>
                  <p className="text-muted-foreground">
                    The sample you&apos;re looking for doesn&apos;t exist or has been removed.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Fixed Header */}
              <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <DialogTitle className="text-2xl font-bold tracking-tight">
                      {parseTrackingNumber(sample.tracking_number)}
                    </DialogTitle>
                    {getStatusBadge(sample.status)}
                    {sample.sample_type && (
                      <Badge variant="outline" className="text-xs uppercase">
                        {sample.sample_type}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mr-8">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    {isEditMode ? (
                      <Input
                        value={formData.storage_position || ''}
                        onChange={(e) => handleFormChange('storage_position', e.target.value)}
                        className="h-8 w-32 text-sm"
                        placeholder="e.g., A1-B2"
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">{sample.storage_position || '\u2014'}</span>
                    )}
                  </div>
                </div>
                <DialogDescription className="flex items-center gap-2 flex-wrap">
                  <span>{sample.origin}{sample.quality_name ? ` - ${sample.quality_name}` : ''}</span>
                  <span className="text-muted-foreground">Created {new Date(sample.created_at).toLocaleDateString()}</span>
                  {sample.assigned_to && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {sample.assigned_to}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                {/* Sample Info + Supply Chain side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left: Sample Info */}
                  <Card className="relative">
                    {!isEditMode && (
                      <Button variant="ghost" size="icon" className="absolute top-0.5 right-0.5 h-7 w-7" onClick={handleEnterEditMode} title="Edit">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <CardContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-muted-foreground">Origin</label>
                          <div className="text-sm font-medium mt-1">{sample.origin}</div>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Micro Origin</label>
                          {isEditMode ? (() => {
                            const regionOptions = MICRO_ORIGINS[sample.origin] || []
                            const currentVal = formData.micro_origin ?? sample.micro_origin ?? ''
                            if (regionOptions.length > 0) {
                              return (
                                <Select value={currentVal || '__none__'} onValueChange={(v) => handleFormChange('micro_origin', v === '__none__' ? '' : v)}>
                                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select micro origin..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">- None -</SelectItem>
                                    {regionOptions.map(r => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                    {currentVal && !regionOptions.includes(currentVal) && currentVal !== '' && (
                                      <SelectItem value={currentVal}>{currentVal}</SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              )
                            }
                            return (
                              <Input
                                value={currentVal}
                                onChange={(e) => handleFormChange('micro_origin', e.target.value)}
                                className="h-8 text-sm mt-1"
                                placeholder="e.g., Cerrado Mineiro"
                              />
                            )
                          })() : (
                            <div className="text-sm font-medium mt-1">{sample.micro_origin || '-'}</div>
                          )}
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Quality</label>
                          {isEditMode ? (
                            <Select
                              value={formData.quality_spec_id || sample.quality_spec_id || '__none__'}
                              onValueChange={(v) => handleFormChange('quality_spec_id', v === '__none__' ? null : v)}
                              disabled={loadingQualities}
                            >
                              <SelectTrigger className="h-8 text-sm mt-1">
                                <SelectValue placeholder={loadingQualities ? 'Loading...' : 'Select quality...'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">- None -</SelectItem>
                                {qualityOptions.map((q) => (
                                  <SelectItem key={q.id} value={q.id}>
                                    {q.custom_name}{q.quality_code ? ` (${q.quality_code})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="text-sm font-medium mt-1">{sample.quality_name || '-'}</div>
                          )}
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Processing</label>
                          {isEditMode ? (
                            <Input
                              value={formData.processing_method || ''}
                              onChange={(e) => handleFormChange('processing_method', e.target.value)}
                              className="h-8 text-sm mt-1"
                              placeholder="e.g., Washed, Natural"
                            />
                          ) : (
                            <div className="text-sm font-medium mt-1">{sample.processing_method || '-'}</div>
                          )}
                        </div>
                      </div>

                      {/* Quantity row */}
                      <div>
                        <label className="text-sm text-muted-foreground">Quantity</label>
                        {isEditMode ? (
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Input
                              type="number"
                              value={formData.bag_count || ''}
                              onChange={(e) => handleFormChange('bag_count', e.target.value ? parseInt(e.target.value) : null)}
                              className="h-8 w-20 text-sm"
                              placeholder="Bags"
                            />
                            <span className="text-sm text-muted-foreground">x</span>
                            <Input
                              type="number"
                              value={formData.bag_weight_kg || ''}
                              onChange={(e) => handleFormChange('bag_weight_kg', e.target.value ? parseFloat(e.target.value) : null)}
                              className="h-8 w-20 text-sm"
                              placeholder="kg"
                            />
                            <span className="text-sm text-muted-foreground">kg</span>
                            <Select
                              value={formData.bag_type || sample.bag_type || ''}
                              onValueChange={(v) => handleFormChange('bag_type', v)}
                            >
                              <SelectTrigger className="h-8 w-28 text-sm">
                                <SelectValue placeholder="Bag type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="jute_bag">Jute Bag</SelectItem>
                                <SelectItem value="pp_bag">PP Bag</SelectItem>
                                <SelectItem value="big_bag">Big Bag</SelectItem>
                                <SelectItem value="bulk">Bulk</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="text-sm font-medium mt-1">
                            {(() => {
                              const bagCount = sample.bag_count || sample.bags
                              const weightKg = sample.bag_weight_kg || 60
                              const bagType = sample.bag_type
                              const bagTypeDisplay: Record<string, string> = {
                                jute_bag: 'jute bags',
                                pp_bag: 'PP bags',
                                big_bag: 'big bags',
                                bulk: 'bulk',
                              }
                              const bagsPerContainer: Record<string, number> = {
                                jute_bag: 320,
                                pp_bag: 320,
                                big_bag: 333,
                                bulk: 360,
                              }

                              if (!bagCount) return '-'

                              const totalKg = bagCount * weightKg
                              const mt = totalKg / 1000
                              const typeLabel = bagType ? bagTypeDisplay[bagType] || bagType : 'bags'
                              const bpc = bagType ? (bagsPerContainer[bagType] || 320) : 320
                              const containers = Math.ceil(bagCount / bpc)

                              return `${bagCount} x ${weightKg} kg (${Number.isInteger(mt) ? mt : mt.toFixed(1)} MT) in ${typeLabel}, ${containers} container${containers !== 1 ? 's' : ''}`
                            })()}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* PSS: show exporter sample info / SS: show Container + ICO */}
                      {sample.sample_type?.toLowerCase() === 'pss' ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-muted-foreground">Exporter Sample #</label>
                            <div className="text-sm font-medium font-mono mt-1">{sample.exporter_sample_number || '-'}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-muted-foreground">Container</label>
                            {isEditMode ? (
                              <Input
                                value={formData.container_nr || ''}
                                onChange={(e) => handleFormChange('container_nr', e.target.value)}
                                className="h-8 text-sm font-mono mt-1"
                                placeholder="Container #"
                              />
                            ) : (
                              <div className="text-sm font-medium font-mono mt-1">{sample.container_nr || '-'}</div>
                            )}
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">ICO #</label>
                            {isEditMode ? (
                              <Input
                                value={formData.ico_number || ''}
                                onChange={(e) => handleFormChange('ico_number', e.target.value)}
                                className="h-8 text-sm font-mono mt-1"
                                placeholder="ICO #"
                              />
                            ) : (
                              <div className="text-sm font-medium font-mono mt-1">{sample.ico_number || '-'}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Right: Supply Chain */}
                  <SupplyChainEditTable
                    sample={sample}
                    isEditMode={isEditMode}
                    formData={formData}
                    onFormChange={(field, value) => handleFormChange(field as keyof Sample, value)}
                    onEditClick={handleEnterEditMode}
                  />
                </div>

                {/* Cupping & Grading */}
                <CuppingGradingSection
                  sample={{
                    id: sample.id,
                    certificate_id: sample.certificate_id,
                    quality_spec_id: sample.quality_spec_id,
                    sample_type: sample.sample_type,
                  }}
                  profile={profile}
                  editPermission={editPermission}
                />

              </div>

              {/* Fixed Footer */}
              <div className="shrink-0 px-6 pt-4 pb-6 border-t">
                <div className="flex flex-wrap gap-2">
                  {!isEditMode ? (
                    <>
                      <Button variant="outline" size="sm" onClick={handleShowQrCode}>
                        <QrCode className="h-4 w-4 mr-2" />
                        QR Code
                      </Button>
                      <Button variant="outline" size="sm" onClick={handlePrintLabel} disabled={printingLabel}>
                        {printingLabel ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
                        Print Label
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                      {sample.certificate_id && (
                        <>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleViewCertificate} disabled={previewLoading} title="View Certificate">
                            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDownloadCertificate} disabled={downloadingCertificate} title="Download PDF">
                            {downloadingCertificate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                      {!sample.certificate_id && (sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected' || sample.workflow_stage === 'review') && (
                        <Button variant="outline" size="sm" onClick={handleGenerateCertificate} disabled={generatingCertificate}>
                          {generatingCertificate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Award className="h-4 w-4 mr-2" />}
                          Generate Cert
                        </Button>
                      )}
                      {(profile?.is_global_admin || profile?.qc_role === 'global_admin') && (
                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleDelete} disabled={deleting} title="Delete">
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button variant="default" size="sm" onClick={handleSaveChanges} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Certificate Preview Modal */}
      <Dialog open={showCertificateModal} onOpenChange={(o) => !o && handleClosePreview()}>
        <DialogContent className="sm:max-w-[1100px] max-h-[95vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certificate {parseTrackingNumber(sample?.tracking_number || '')}
            </DialogTitle>
            <DialogDescription>
              {sample?.origin && <span>Origin: {sample.origin}</span>}
              {sample?.quality_name && <span className="ml-4">Quality: {sample.quality_name}</span>}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-[75vh] bg-muted rounded-lg overflow-hidden">
            {previewLoading ? (
              <div className="flex items-center justify-center h-[75vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewPdfUrl ? (
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

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadCertificate}
              disabled={downloadingCertificate}
            >
              {downloadingCertificate ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowEmailDialog(true)}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
            <Button variant="default" onClick={handleClosePreview}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Send Certificate via Email</DialogTitle>
            <DialogDescription>
              Send certificate to selected recipients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="modal-email-exporter"
                  checked={emailRecipients.exporter}
                  onCheckedChange={(checked) =>
                    setEmailRecipients(prev => ({ ...prev, exporter: !!checked }))
                  }
                />
                <label htmlFor="modal-email-exporter" className="text-sm font-medium leading-none">
                  Exporter
                </label>
              </div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="modal-email-importer"
                  checked={emailRecipients.importer}
                  onCheckedChange={(checked) =>
                    setEmailRecipients(prev => ({ ...prev, importer: !!checked }))
                  }
                />
                <label htmlFor="modal-email-importer" className="text-sm font-medium leading-none">
                  Importer
                </label>
              </div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="modal-email-roaster"
                  checked={emailRecipients.roaster}
                  onCheckedChange={(checked) =>
                    setEmailRecipients(prev => ({ ...prev, roaster: !!checked }))
                  }
                />
                <label htmlFor="modal-email-roaster" className="text-sm font-medium leading-none">
                  Roaster
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Recipients will receive an email with the certificate PDF attached.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail}>
              {sendingEmail ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Sample QR Code
            </DialogTitle>
            <DialogDescription>
              {parseTrackingNumber(sample?.tracking_number || '')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6 space-y-4">
            {generatingQr ? (
              <div className="flex items-center justify-center h-64 w-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="Sample QR Code"
                className="w-64 h-64 border rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-64 w-64 text-muted-foreground">
                Failed to generate QR code
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Scan this QR code to view sample details
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleDownloadQrCode} disabled={!qrCodeDataUrl}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="default" onClick={() => setShowQrModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
