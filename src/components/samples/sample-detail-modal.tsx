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
  laboratory_id?: string
  assigned_to?: string
  same_seller_shipper?: boolean
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
}

export function SampleDetailModal({
  open,
  onOpenChange,
  sampleId,
  onSampleUpdated,
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
      storage_position: sample.storage_position,
      ...(sample.seller_id ? { seller_id: sample.seller_id } : {}),
      ...(sample.exporter_id ? { exporter_id: sample.exporter_id } : {}),
      ...(sample.importer_id ? { importer_id: sample.importer_id } : {}),
      ...(sample.roaster_id ? { roaster_id: sample.roaster_id } : {}),
      ...(sample.end_client_id ? { end_client_id: sample.end_client_id } : {}),
      ...(sample.client_id ? { client_id: sample.client_id } : {}),
    })
    setIsEditMode(true)
  }

  const handleCancelEdit = () => {
    setIsEditMode(false)
    setFormData({})
  }

  const handleSaveChanges = async () => {
    if (!sample) return

    try {
      setSaving(true)
      const response = await fetch(`/api/samples/${sample.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !sample ? (
            <div className="text-center py-12">
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
            <div className="space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight">{parseTrackingNumber(sample.tracking_number)}</h2>
                  {getStatusBadge(sample.status)}
                </div>
                <p className="text-sm text-muted-foreground">
                  {sample.origin} {sample.quality_name && `\u2022 ${sample.quality_name}`} \u2022 Created {new Date(sample.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Storage Position */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Storage Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={isEditMode ? (formData.storage_position || '') : (sample.storage_position || '')}
                      onChange={(e) => handleFormChange('storage_position', e.target.value)}
                      className="max-w-xs h-9"
                      placeholder="e.g., A1-B2"
                      disabled={!isEditMode}
                    />
                    {!isEditMode && !sample.storage_position && (
                      <span className="text-sm text-muted-foreground">Not assigned</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Sample Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    Sample Info
                    {isEditMode && <Badge variant="outline" className="text-xs">Editing</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Origin</label>
                      <div className="text-sm font-medium mt-1">{sample.origin}</div>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Quality</label>
                      <div className="text-sm font-medium mt-1">{sample.quality_name || '-'}</div>
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
                    <div>
                      <label className="text-sm text-muted-foreground">Bag Type</label>
                      {isEditMode ? (
                        <Select
                          value={formData.bag_type || sample.bag_type || ''}
                          onValueChange={(v) => handleFormChange('bag_type', v)}
                        >
                          <SelectTrigger className="h-8 text-sm mt-1">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="jute">Jute</SelectItem>
                            <SelectItem value="grainpro">GrainPro</SelectItem>
                            <SelectItem value="bulk">Bulk</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="text-sm font-medium mt-1">{sample.bag_type || '-'}</div>
                      )}
                    </div>
                  </div>

                  {/* Bags quantity row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Bags:</span>
                    {isEditMode ? (
                      <Input
                        type="number"
                        value={formData.bag_count || ''}
                        onChange={(e) => handleFormChange('bag_count', e.target.value ? parseInt(e.target.value) : null)}
                        className="h-8 w-24 text-sm"
                        placeholder="Count"
                      />
                    ) : (
                      <span className="text-sm font-medium">{sample.bag_count || sample.bags || '-'}</span>
                    )}
                    <span className="text-sm text-muted-foreground">x</span>
                    {isEditMode ? (
                      <Input
                        type="number"
                        value={formData.bag_weight_kg || ''}
                        onChange={(e) => handleFormChange('bag_weight_kg', e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-8 w-24 text-sm"
                        placeholder="kg"
                      />
                    ) : (
                      <span className="text-sm font-medium">{sample.bag_weight_kg || 60}</span>
                    )}
                    <span className="text-sm text-muted-foreground">kg</span>
                    {(sample.bags_quantity_mt || sample.equivalent_60kg_bags) && (
                      <span className="text-sm text-muted-foreground ml-2">
                        ({sample.bags_quantity_mt ? `${sample.bags_quantity_mt} MT` : `${Math.round(sample.equivalent_60kg_bags || 0)} x 60kg`})
                      </span>
                    )}
                  </div>

                  <Separator />

                  {/* Container / ICO info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <div>
                      <label className="text-sm text-muted-foreground">ICO Marks</label>
                      <div className="text-sm font-medium font-mono mt-1">{sample.ico_marks || '-'}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Supply Chain + Certificate Status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardContent className="pt-6">
                    <SupplyChainEditTable
                      sample={sample}
                      isEditMode={isEditMode}
                      formData={formData}
                      onFormChange={(field, value) => handleFormChange(field as keyof Sample, value)}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Certificate Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {sample.certificate_id ? (
                      <>
                        <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Certified
                        </Badge>
                        <div className="space-y-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full"
                            onClick={handleViewCertificate}
                            disabled={previewLoading}
                          >
                            {previewLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4 mr-2" />
                            )}
                            View Certificate
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={handleDownloadCertificate}
                            disabled={downloadingCertificate}
                          >
                            {downloadingCertificate ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Download PDF
                          </Button>
                        </div>
                        {sample.certificate_created_at && (
                          <p className="text-xs text-muted-foreground">
                            Certified: {new Date(sample.certificate_created_at).toLocaleDateString()}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {(sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected') ? (
                          <Badge variant="default" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {sample.workflow_stage === 'certified' ? 'Approved' : 'Rejected'} - Not Generated
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                        {(sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected' || sample.workflow_stage === 'review') && (
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full"
                            onClick={handleGenerateCertificate}
                            disabled={generatingCertificate}
                          >
                            {generatingCertificate ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Award className="h-4 w-4 mr-2" />
                            )}
                            Generate
                          </Button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Stage: {sample.workflow_stage || 'received'}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Cupping & Grading */}
              <CuppingGradingSection
                sample={sample}
                profile={profile}
                editPermission={editPermission}
              />

              {/* Additional Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Additional Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Workflow Stage</div>
                      <div className="text-sm font-medium mt-1">{sample.workflow_stage || 'received'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Sample Type</div>
                      <div className="text-sm font-medium mt-1 uppercase">{sample.sample_type || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Assigned To</div>
                      <div className="text-sm font-medium mt-1">
                        {sample.assigned_to ? (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {sample.assigned_to}
                          </span>
                        ) : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Last Updated</div>
                      <div className="text-sm font-medium mt-1">
                        {sample.updated_at ? new Date(sample.updated_at).toLocaleDateString() : '-'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap gap-2 pt-2">
                {!isEditMode ? (
                  <>
                    <Button variant="outline" size="sm" onClick={handleEnterEditMode}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
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
                    {(profile?.is_global_admin || profile?.qc_role === 'global_admin') && (
                      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deleting ? 'Deleting...' : 'Delete'}
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
          )}
        </DialogContent>
      </Dialog>

      {/* Certificate Preview Modal */}
      <Dialog open={showCertificateModal} onOpenChange={(o) => !o && handleClosePreview()}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh]">
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

          <div className="flex-1 min-h-[500px] bg-muted rounded-lg overflow-hidden">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewPdfUrl ? (
              <iframe
                src={previewPdfUrl}
                className="w-full h-[500px] border-0"
                title="Certificate Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
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
