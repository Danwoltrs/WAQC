'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, CheckCircle, XCircle, Clock, AlertCircle, MapPin,
  Calendar, Package, FileText, Activity, Download, Printer,
  QrCode, Edit, Trash2, User, Building2, Award, Loader2, Eye, Mail,
  Save, X, Lock, Coffee, Beaker
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
import Link from 'next/link'
import { useAuth } from '@/components/providers/auth-provider'

interface EditPermission {
  canEdit: boolean
  reason: 'not_locked' | 'within_7_days' | 'locked_after_scan' | 'locked_after_7_days'
  lockExpiresAt: string | null
  message: string
}

interface CuppingScores {
  fragrance_aroma?: number
  flavor?: number
  aftertaste?: number
  acidity?: number
  body?: number
  balance?: number
  uniformity?: number
  clean_cup?: number
  sweetness?: number
  overall?: number
  total?: number
}

interface GradingData {
  green_bean_data?: {
    moisture?: number
    density?: number
    aspect?: string
    screen_analysis?: Record<string, number>
    defects?: Array<{ name: string; count: number }>
  }
  roast_data?: {
    quakers?: number
    roast_color?: string
    notes?: string
  }
}

interface EditHistory {
  edited_at: string
  edited_by: string
  reason: string
  changes: Record<string, { old: any; new: any }>
}

interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: string
  exporter_name?: string
  exporter_country?: string
  origin: string
  importer_name?: string
  importer_country?: string
  roaster_name?: string
  roaster_country?: string
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
  exporter_contract_nr?: string
  buyer_contract_nr?: string
  roaster_contract_nr?: string
  ico_number?: string
  ico_marks?: string
  container_nr?: string
  processing_method?: string
  laboratory_id?: string
  assigned_to?: string
  created_at: string
  updated_at?: string
  // Certificate info (flattened from API)
  certificate_id?: string | null
  certificate_number?: string | null
  certificate_status?: string | null
  certificate_created_at?: string | null
}

interface QualityAssessment {
  id: string
  sample_id: string
  assessment_type: string
  status: string
  total_score?: number
  notes?: string
  created_at: string
  updated_at?: string
}

interface Certificate {
  id: string
  sample_id: string
  certificate_number: string
  status: string
  issued_date?: string
  created_at: string
}

interface ActivityLog {
  id: string
  sample_id: string
  activity_type: string
  description: string
  user_name?: string
  created_at: string
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

export default function SampleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { profile } = useAuth()
  const [sample, setSample] = useState<Sample | null>(null)
  const [assessments, setAssessments] = useState<QualityAssessment[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [generatingCertificate, setGeneratingCertificate] = useState(false)
  const [downloadingCertificate, setDownloadingCertificate] = useState(false)

  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editPermission, setEditPermission] = useState<EditPermission | null>(null)
  const [formData, setFormData] = useState<Partial<Sample>>({})

  // Cupping/Grading data states
  const [cuppingScores, setCuppingScores] = useState<CuppingScores | null>(null)
  const [gradingData, setGradingData] = useState<GradingData | null>(null)
  const [editHistory, setEditHistory] = useState<EditHistory[]>([])
  const [isEditingCuppingGrading, setIsEditingCuppingGrading] = useState(false)
  const [cuppingGradingFormData, setCuppingGradingFormData] = useState<{ cupping?: CuppingScores; grading?: GradingData }>({})
  const [editReason, setEditReason] = useState('')
  const [savingCuppingGrading, setSavingCuppingGrading] = useState(false)

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

  useEffect(() => {
    if (params.id) {
      loadSampleDetails()
      loadEditPermission()
      loadCuppingGradingData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadEditPermission = async () => {
    try {
      const res = await fetch(`/api/cupping/check-edit-permission?sampleId=${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setEditPermission(data)
      }
    } catch (error) {
      console.error('Error loading edit permission:', error)
    }
  }

  const loadCuppingGradingData = async () => {
    try {
      // Load aggregated cupping scores
      const cuppingRes = await fetch(`/api/cupping/scores/aggregate?sample_id=${params.id}`)
      if (cuppingRes.ok) {
        const cuppingData = await cuppingRes.json()
        if (cuppingData.aggregated?.attributes) {
          // Convert aggregated attributes to simple scores
          const scores: CuppingScores = {}
          Object.entries(cuppingData.aggregated.attributes).forEach(([key, value]: [string, any]) => {
            scores[key as keyof CuppingScores] = value.finalScore
          })
          setCuppingScores(scores)
        }
      }

      // Load grading data (quality assessment)
      const gradingRes = await fetch(`/api/samples/${params.id}/quality-assessment`)
      if (gradingRes.ok) {
        const gradingDataRes = await gradingRes.json()
        if (gradingDataRes.assessment) {
          setGradingData({
            green_bean_data: gradingDataRes.assessment.green_bean_data,
            roast_data: gradingDataRes.assessment.roast_data
          })
          // Load edit history if available
          if (gradingDataRes.assessment.edit_history) {
            setEditHistory(gradingDataRes.assessment.edit_history)
          }
        }
      }
    } catch (error) {
      console.error('Error loading cupping/grading data:', error)
    }
  }

  // Check if cupping/grading can be edited (within 7 days of certificate)
  const canEditCuppingGrading = editPermission?.canEdit &&
    (editPermission.reason === 'not_locked' || editPermission.reason === 'within_7_days')

  // Enter cupping/grading edit mode
  const handleEnterCuppingGradingEdit = () => {
    if (!canEditCuppingGrading) return
    setCuppingGradingFormData({
      cupping: cuppingScores || {},
      grading: gradingData || {}
    })
    setEditReason('')
    setIsEditingCuppingGrading(true)
  }

  // Cancel cupping/grading edit
  const handleCancelCuppingGradingEdit = () => {
    setIsEditingCuppingGrading(false)
    setCuppingGradingFormData({})
    setEditReason('')
  }

  // Save cupping/grading changes with audit trail
  const handleSaveCuppingGrading = async () => {
    if (!sample || !editReason.trim()) {
      alert('Please provide a reason for the edit')
      return
    }

    try {
      setSavingCuppingGrading(true)

      // Build changes object for audit trail
      const changes: Record<string, { old: any; new: any }> = {}

      // Compare cupping changes
      if (cuppingGradingFormData.cupping && cuppingScores) {
        Object.keys(cuppingGradingFormData.cupping).forEach(key => {
          const oldVal = cuppingScores[key as keyof CuppingScores]
          const newVal = cuppingGradingFormData.cupping![key as keyof CuppingScores]
          if (oldVal !== newVal) {
            changes[`cupping_${key}`] = { old: oldVal, new: newVal }
          }
        })
      }

      // Compare grading changes
      if (cuppingGradingFormData.grading && gradingData) {
        // Compare green_bean_data
        if (JSON.stringify(cuppingGradingFormData.grading.green_bean_data) !== JSON.stringify(gradingData.green_bean_data)) {
          changes.green_bean_data = { old: gradingData.green_bean_data, new: cuppingGradingFormData.grading.green_bean_data }
        }
        // Compare roast_data
        if (JSON.stringify(cuppingGradingFormData.grading.roast_data) !== JSON.stringify(gradingData.roast_data)) {
          changes.roast_data = { old: gradingData.roast_data, new: cuppingGradingFormData.grading.roast_data }
        }
      }

      // Save grading data with edit history
      const editEntry: EditHistory = {
        edited_at: new Date().toISOString(),
        edited_by: profile?.email || profile?.full_name || 'Unknown',
        reason: editReason.trim(),
        changes
      }

      const response = await fetch(`/api/samples/${sample.id}/quality-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          green_bean_data: cuppingGradingFormData.grading?.green_bean_data,
          roast_data: cuppingGradingFormData.grading?.roast_data,
          edit_history: [...editHistory, editEntry]
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save changes')
      }

      // Reload data
      await loadCuppingGradingData()
      setIsEditingCuppingGrading(false)
      setCuppingGradingFormData({})
      setEditReason('')
    } catch (error) {
      console.error('Error saving cupping/grading:', error)
      alert(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setSavingCuppingGrading(false)
    }
  }

  const loadSampleDetails = async () => {
    try {
      setLoading(true)

      // Load sample data (includes certificate info)
      const sampleRes = await fetch(`/api/samples/${params.id}`)
      const sampleData = await sampleRes.json()

      if (sampleRes.ok && sampleData.sample) {
        setSample(sampleData.sample)

        // Set certificates array based on sample's certificate info
        if (sampleData.sample.certificate_id) {
          setCertificates([{
            id: sampleData.sample.certificate_id,
            sample_id: params.id as string,
            certificate_number: sampleData.sample.certificate_number || 'Available',
            status: sampleData.sample.certificate_status || 'issued',
            created_at: sampleData.sample.certificate_created_at || new Date().toISOString()
          }])
        } else {
          setCertificates([])
        }
      } else {
        console.error('Failed to load sample:', sampleData.error)
      }

      // Load quality assessments
      const assessmentsRes = await fetch(`/api/quality-assessments?sample_id=${params.id}`)
      const assessmentsData = await assessmentsRes.json()
      if (assessmentsRes.ok && assessmentsData.assessments) {
        setAssessments(assessmentsData.assessments)
      }

      // TODO: Load activity log when endpoint is available
      // const activityRes = await fetch(`/api/activity-log?sample_id=${params.id}`)

    } catch (error) {
      console.error('Error loading sample details:', error)
    } finally {
      setLoading(false)
    }
  }

  // Enter edit mode - initialize form with current sample data
  const handleEnterEditMode = () => {
    if (!sample) return
    setFormData({
      bag_count: sample.bag_count,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      wolthers_contract_nr: sample.wolthers_contract_nr,
      exporter_contract_nr: sample.exporter_contract_nr,
      buyer_contract_nr: sample.buyer_contract_nr,
      roaster_contract_nr: sample.roaster_contract_nr,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      processing_method: sample.processing_method,
      storage_position: sample.storage_position,
    })
    setIsEditMode(true)
  }

  // Cancel edit mode - discard changes
  const handleCancelEdit = () => {
    setIsEditMode(false)
    setFormData({})
  }

  // Save changes
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

      // Reload sample data
      await loadSampleDetails()
      setIsEditMode(false)
      setFormData({})
    } catch (error) {
      console.error('Error saving changes:', error)
      alert(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // Update form field
  const handleFormChange = (field: keyof Sample, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // QR Code modal state
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [generatingQr, setGeneratingQr] = useState(false)

  const handleShowQrCode = async () => {
    if (!sample) return
    setShowQrModal(true)
    setGeneratingQr(true)
    try {
      // Generate QR code with sample tracking URL
      const QRCode = await import('qrcode')
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const url = `${baseUrl}/samples/${parseTrackingNumber(sample.tracking_number)}`
      const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 })
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

  // Print label for this sample (uses bulk API with single sample)
  const [printingLabel, setPrintingLabel] = useState(false)
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

      // Get the PDF blob and open in print window
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const printWindow = window.open(url)
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
      // Clean up after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 60000)
    } catch (error) {
      console.error('Error printing label:', error)
      alert(error instanceof Error ? error.message : 'Failed to print label')
    } finally {
      setPrintingLabel(false)
    }
  }

  // Export sample data as JSON
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
      // Quantity
      bag_count: sample.bag_count,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      equivalent_60kg_bags: sample.equivalent_60kg_bags,
      // Supply chain
      exporter: sample.exporter_name,
      importer: sample.importer_name,
      roaster: sample.roaster_name,
      // Contracts
      wolthers_contract_nr: sample.wolthers_contract_nr,
      exporter_contract_nr: sample.exporter_contract_nr,
      buyer_contract_nr: sample.buyer_contract_nr,
      roaster_contract_nr: sample.roaster_contract_nr,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      // Metadata
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
      router.push('/samples')
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

      // First, create a certificate record if it doesn't exist
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

      // Then download the PDF
      await handleDownloadCertificate()

      // Reload sample details to update certificate info
      await loadSampleDetails()
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

      // Get the PDF blob
      const blob = await response.blob()

      // Create download link
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

  // Open certificate preview modal
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

  // Close certificate preview modal
  const handleClosePreview = () => {
    if (previewPdfUrl) {
      window.URL.revokeObjectURL(previewPdfUrl)
    }
    setShowCertificateModal(false)
    setPreviewPdfUrl(null)
    setPreviewLoading(false)
  }

  // Send certificate via email
  const handleSendEmail = async () => {
    if (!sample) return
    if (!emailRecipients.exporter && !emailRecipients.importer && !emailRecipients.roaster) {
      alert('Please select at least one recipient type')
      return
    }

    try {
      setSendingEmail(true)

      // First get the certificate ID
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

  const getWorkflowTimeline = () => {
    const stages = [
      { key: 'received', label: 'Received', icon: CheckCircle },
      { key: 'analysis', label: 'Analysis', icon: Package },
      { key: 'review', label: 'Review', icon: Activity },
      { key: 'certified', label: 'Certified', icon: FileText },
      { key: 'rejected', label: 'Rejected', icon: XCircle }
    ]

    const currentStageIndex = stages.findIndex(s => s.key === sample?.workflow_stage)

    return (
      <div className="space-y-4">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          const isCompleted = index < currentStageIndex
          const isCurrent = index === currentStageIndex
          const isPending = index > currentStageIndex

          return (
            <div key={stage.key} className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isCompleted ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                isCurrent ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{stage.label}</div>
                {isCurrent && (
                  <div className="text-xs text-muted-foreground">In progress</div>
                )}
                {isCompleted && (
                  <div className="text-xs text-green-600 dark:text-green-400">Completed</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="text-center py-12 text-muted-foreground">
            Loading sample details...
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!sample) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold mb-2">Sample not found</h3>
            <p className="text-muted-foreground mb-4">
              The sample you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <Button onClick={() => router.push('/samples')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Samples
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.push('/samples')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{parseTrackingNumber(sample.tracking_number)}</h1>
              <p className="text-muted-foreground">
                {sample.origin} {sample.quality_name && `• ${sample.quality_name}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isEditMode ? (
              // Edit mode: Show Save and Cancel buttons
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveChanges}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </>
            ) : (
              // View mode: Show all action buttons
              <>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintLabel}
                  disabled={printingLabel}
                >
                  {printingLabel ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  Print Label
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShowQrCode}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  QR Code
                </Button>
                {/* Certificate buttons based on certificate existence */}
                {sample.certificate_id ? (
                  // Sample HAS certificate - show View and Download buttons, hide Generate
                  <>
                    <Button
                      variant="default"
                      size="sm"
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
                  </>
                ) : (
                  // Sample has NO certificate - show Generate button if eligible
                  (sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected' || sample.workflow_stage === 'review') && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleGenerateCertificate}
                      disabled={generatingCertificate}
                    >
                      {generatingCertificate ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Award className="h-4 w-4 mr-2" />
                      )}
                      Generate Certificate
                    </Button>
                  )
                )}
                <Button variant="outline" size="sm" onClick={handleEnterEditMode}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                {(profile?.is_global_admin || profile?.qc_role === 'global_admin') && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Status and Key Info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Status</CardDescription>
            </CardHeader>
            <CardContent>
              {getStatusBadge(sample.status)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Sample Type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium uppercase">{sample.sample_type || '-'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Storage Position</CardDescription>
            </CardHeader>
            <CardContent>
              {isEditMode ? (
                <Input
                  value={formData.storage_position || ''}
                  onChange={(e) => handleFormChange('storage_position', e.target.value)}
                  className="h-7 text-sm"
                  placeholder="e.g., A1-B2"
                />
              ) : (
                <div className="flex items-center gap-1 text-sm font-medium">
                  <MapPin className="h-4 w-4" />
                  {sample.storage_position || 'Not assigned'}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Created</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                {new Date(sample.created_at).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="details" className="space-y-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="cupping-grading">Cupping & Grading</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="assessments">Assessments ({assessments.length})</TabsTrigger>
            <TabsTrigger value="certificates">Certificates ({sample.certificate_id ? 1 : 0})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sample Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Sample Information {isEditMode && <Badge variant="outline" className="ml-2">Editing</Badge>}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm text-muted-foreground">Origin:</div>
                    <div className="text-sm font-medium">{sample.origin}</div>

                    <div className="text-sm text-muted-foreground">Quality:</div>
                    <div className="text-sm font-medium">{sample.quality_name || '-'}</div>

                    <div className="text-sm text-muted-foreground">Processing:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.processing_method || ''}
                        onChange={(e) => handleFormChange('processing_method', e.target.value)}
                        className="h-7 text-sm"
                        placeholder="e.g., Washed, Natural"
                      />
                    ) : (
                      <div className="text-sm font-medium">{sample.processing_method || '-'}</div>
                    )}

                    {/* For bulk: bag_count is the equivalent 60kg bags, calculate MT from that */}
                    {(isEditMode ? formData.bag_type?.toLowerCase() : sample.bag_type?.toLowerCase()) === 'bulk' ? (
                      <>
                        <div className="text-sm text-muted-foreground">Bag Type:</div>
                        {isEditMode ? (
                          <Select
                            value={formData.bag_type || 'bulk'}
                            onValueChange={(v) => handleFormChange('bag_type', v)}
                          >
                            <SelectTrigger className="h-7 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bulk">Bulk</SelectItem>
                              <SelectItem value="jute">Jute</SelectItem>
                              <SelectItem value="grainpro">GrainPro</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm font-medium">Bulk</div>
                        )}

                        <div className="text-sm text-muted-foreground">60kg Equivalent:</div>
                        {isEditMode ? (
                          <Input
                            type="number"
                            value={formData.bag_count || ''}
                            onChange={(e) => handleFormChange('bag_count', e.target.value ? parseInt(e.target.value) : null)}
                            className="h-7 text-sm"
                            placeholder="Bags"
                          />
                        ) : (
                          <div className="text-sm font-medium">
                            {sample.bag_count
                              ? `${sample.bag_count.toLocaleString()} bags`
                              : '-'}
                          </div>
                        )}

                        <div className="text-sm text-muted-foreground">Total:</div>
                        <div className="text-sm font-medium">
                          {(isEditMode ? formData.bag_count : sample.bag_count)
                            ? `${(((isEditMode ? formData.bag_count : sample.bag_count) as number * 60) / 1000).toFixed(1)} MT`
                            : '-'}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-muted-foreground">Quantity (bags):</div>
                        {isEditMode ? (
                          <Input
                            type="number"
                            value={formData.bag_count || ''}
                            onChange={(e) => handleFormChange('bag_count', e.target.value ? parseInt(e.target.value) : null)}
                            className="h-7 text-sm"
                            placeholder="Number of bags"
                          />
                        ) : (
                          <div className="text-sm font-medium">{sample.bag_count || sample.bags || '-'}</div>
                        )}

                        <div className="text-sm text-muted-foreground">Bag Type:</div>
                        {isEditMode ? (
                          <Select
                            value={formData.bag_type || ''}
                            onValueChange={(v) => handleFormChange('bag_type', v)}
                          >
                            <SelectTrigger className="h-7 text-sm">
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
                          <div className="text-sm font-medium">{sample.bag_type || '-'}</div>
                        )}

                        <div className="text-sm text-muted-foreground">Per-bag Weight:</div>
                        {isEditMode ? (
                          <Input
                            type="number"
                            value={formData.bag_weight_kg || ''}
                            onChange={(e) => handleFormChange('bag_weight_kg', e.target.value ? parseFloat(e.target.value) : null)}
                            className="h-7 text-sm"
                            placeholder="kg"
                          />
                        ) : (
                          <div className="text-sm font-medium">
                            {sample.bag_weight_kg ? `${sample.bag_weight_kg.toLocaleString()} kg` : '-'}
                          </div>
                        )}

                        <div className="text-sm text-muted-foreground">Total:</div>
                        <div className="text-sm font-medium">
                          {(isEditMode ? formData.bags_quantity_mt : sample.bags_quantity_mt)
                            ? `${isEditMode ? formData.bags_quantity_mt : sample.bags_quantity_mt} MT`
                            : '-'}
                        </div>

                        <div className="text-sm text-muted-foreground">60kg Equivalent:</div>
                        <div className="text-sm font-medium">
                          {sample.equivalent_60kg_bags
                            ? `${Math.round(sample.equivalent_60kg_bags).toLocaleString()} bags`
                            : sample.bags_quantity_mt
                              ? `${Math.round((sample.bags_quantity_mt * 1000) / 60).toLocaleString()} bags`
                              : '-'}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Supply Chain */}
              <Card>
                <CardHeader>
                  <CardTitle>Supply Chain</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Exporter / Supplier</div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {sample.exporter_name || sample.supplier || '-'}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Importer</div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {sample.importer_name || sample.buyer || '-'}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Roaster / Buyer</div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {sample.roaster_name || '-'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contract Numbers */}
              <Card>
                <CardHeader>
                  <CardTitle>Contract Numbers {isEditMode && <Badge variant="outline" className="ml-2">Editing</Badge>}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm text-muted-foreground">Wolthers Contract:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.wolthers_contract_nr || ''}
                        onChange={(e) => handleFormChange('wolthers_contract_nr', e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="Contract #"
                      />
                    ) : (
                      <div className="text-sm font-medium font-mono">{sample.wolthers_contract_nr || '-'}</div>
                    )}

                    <div className="text-sm text-muted-foreground">Exporter Contract:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.exporter_contract_nr || ''}
                        onChange={(e) => handleFormChange('exporter_contract_nr', e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="Contract #"
                      />
                    ) : (
                      <div className="text-sm font-medium font-mono">{sample.exporter_contract_nr || '-'}</div>
                    )}

                    <div className="text-sm text-muted-foreground">Importer Contract:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.buyer_contract_nr || ''}
                        onChange={(e) => handleFormChange('buyer_contract_nr', e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="Contract #"
                      />
                    ) : (
                      <div className="text-sm font-medium font-mono">{sample.buyer_contract_nr || '-'}</div>
                    )}

                    <div className="text-sm text-muted-foreground">Roaster Contract:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.roaster_contract_nr || ''}
                        onChange={(e) => handleFormChange('roaster_contract_nr', e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="Contract #"
                      />
                    ) : (
                      <div className="text-sm font-medium font-mono">{sample.roaster_contract_nr || '-'}</div>
                    )}

                    <div className="text-sm text-muted-foreground">ICO Number:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.ico_number || ''}
                        onChange={(e) => handleFormChange('ico_number', e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="ICO #"
                      />
                    ) : (
                      <div className="text-sm font-medium font-mono">{sample.ico_number || '-'}</div>
                    )}

                    <div className="text-sm text-muted-foreground">ICO Marks:</div>
                    <div className="text-sm font-medium font-mono">{sample.ico_marks || '-'}</div>

                    <div className="text-sm text-muted-foreground">Container Nr:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.container_nr || ''}
                        onChange={(e) => handleFormChange('container_nr', e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="Container #"
                      />
                    ) : (
                      <div className="text-sm font-medium font-mono">{sample.container_nr || '-'}</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Additional Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Additional Information {isEditMode && <Badge variant="outline" className="ml-2">Editing</Badge>}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm text-muted-foreground">Workflow Stage:</div>
                    <div className="text-sm font-medium">{sample.workflow_stage || '-'}</div>

                    <div className="text-sm text-muted-foreground">Storage Position:</div>
                    {isEditMode ? (
                      <Input
                        value={formData.storage_position || ''}
                        onChange={(e) => handleFormChange('storage_position', e.target.value)}
                        className="h-7 text-sm"
                        placeholder="e.g., A1-B2"
                      />
                    ) : (
                      <div className="text-sm font-medium">{sample.storage_position || '-'}</div>
                    )}

                    <div className="text-sm text-muted-foreground">Assigned To:</div>
                    <div className="text-sm font-medium">
                      {sample.assigned_to ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {sample.assigned_to}
                        </div>
                      ) : '-'}
                    </div>

                    <div className="text-sm text-muted-foreground">Last Updated:</div>
                    <div className="text-sm font-medium">
                      {sample.updated_at ? new Date(sample.updated_at).toLocaleString() : '-'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Cupping & Grading Tab */}
          <TabsContent value="cupping-grading" className="space-y-4">
            {/* Lock Status Banner */}
            {editPermission && !canEditCuppingGrading && sample.certificate_id && (
              <div className="bg-muted/50 border rounded-lg p-4 flex items-center gap-3">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Editing Locked</p>
                  <p className="text-xs text-muted-foreground">{editPermission.message}</p>
                </div>
              </div>
            )}

            {/* Edit Controls */}
            {canEditCuppingGrading && !isEditingCuppingGrading && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleEnterCuppingGradingEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Cupping & Grading
                </Button>
              </div>
            )}

            {isEditingCuppingGrading && (
              <Card className="border-primary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                    Edit Mode - Audit Trail Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Reason for Edit *</label>
                    <Textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Please provide a reason for this edit (required)"
                      className="mt-1"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{editReason.length}/500 characters</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Edited by</label>
                    <Input
                      value={profile?.email || profile?.full_name || 'Unknown'}
                      disabled
                      className="mt-1 bg-muted"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={handleCancelCuppingGradingEdit} disabled={savingCuppingGrading}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveCuppingGrading}
                      disabled={savingCuppingGrading || !editReason.trim()}
                    >
                      {savingCuppingGrading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cupping Scores Card */}
              <Card className={!canEditCuppingGrading && sample.certificate_id ? 'opacity-75' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coffee className="h-5 w-5" />
                    Cupping Scores
                    {!canEditCuppingGrading && sample.certificate_id && (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    {canEditCuppingGrading
                      ? 'Aggregated cupping scores from all cuppers'
                      : 'Locked 7 days after certification'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {cuppingScores ? (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['fragrance_aroma', 'Fragrance/Aroma'],
                        ['flavor', 'Flavor'],
                        ['aftertaste', 'Aftertaste'],
                        ['acidity', 'Acidity'],
                        ['body', 'Body'],
                        ['balance', 'Balance'],
                        ['uniformity', 'Uniformity'],
                        ['clean_cup', 'Clean Cup'],
                        ['sweetness', 'Sweetness'],
                        ['overall', 'Overall']
                      ].map(([key, label]) => (
                        <div key={key} className="flex justify-between items-center py-1 border-b border-border/50">
                          <span className="text-sm text-muted-foreground">{label}</span>
                          {isEditingCuppingGrading ? (
                            <Input
                              type="number"
                              step="0.25"
                              min="0"
                              max="10"
                              value={cuppingGradingFormData.cupping?.[key as keyof CuppingScores] || ''}
                              onChange={(e) => setCuppingGradingFormData(prev => ({
                                ...prev,
                                cupping: { ...prev.cupping, [key]: parseFloat(e.target.value) || 0 }
                              }))}
                              className="w-20 h-7 text-sm text-right"
                            />
                          ) : (
                            <span className="text-sm font-medium">
                              {cuppingScores[key as keyof CuppingScores]?.toFixed(2) || '-'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No cupping scores available</p>
                  )}
                </CardContent>
              </Card>

              {/* Grading Data Card */}
              <Card className={!canEditCuppingGrading && sample.certificate_id ? 'opacity-75' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Beaker className="h-5 w-5" />
                    Grading Data
                    {!canEditCuppingGrading && sample.certificate_id && (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    {canEditCuppingGrading
                      ? 'Green bean and roast analysis data'
                      : 'Locked 7 days after certification'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {gradingData?.green_bean_data ? (
                    <>
                      <div>
                        <h4 className="text-sm font-medium mb-2">Green Bean Analysis</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex justify-between items-center py-1 border-b border-border/50">
                            <span className="text-sm text-muted-foreground">Moisture</span>
                            {isEditingCuppingGrading ? (
                              <Input
                                type="number"
                                step="0.1"
                                value={cuppingGradingFormData.grading?.green_bean_data?.moisture || ''}
                                onChange={(e) => setCuppingGradingFormData(prev => ({
                                  ...prev,
                                  grading: {
                                    ...prev.grading,
                                    green_bean_data: {
                                      ...prev.grading?.green_bean_data,
                                      moisture: parseFloat(e.target.value) || 0
                                    }
                                  }
                                }))}
                                className="w-20 h-7 text-sm text-right"
                              />
                            ) : (
                              <span className="text-sm font-medium">
                                {gradingData.green_bean_data.moisture ? `${gradingData.green_bean_data.moisture}%` : '-'}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-border/50">
                            <span className="text-sm text-muted-foreground">Density</span>
                            {isEditingCuppingGrading ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={cuppingGradingFormData.grading?.green_bean_data?.density || ''}
                                onChange={(e) => setCuppingGradingFormData(prev => ({
                                  ...prev,
                                  grading: {
                                    ...prev.grading,
                                    green_bean_data: {
                                      ...prev.grading?.green_bean_data,
                                      density: parseFloat(e.target.value) || 0
                                    }
                                  }
                                }))}
                                className="w-20 h-7 text-sm text-right"
                              />
                            ) : (
                              <span className="text-sm font-medium">
                                {gradingData.green_bean_data.density || '-'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {gradingData.green_bean_data.defects && gradingData.green_bean_data.defects.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Defects</h4>
                          <div className="space-y-1">
                            {gradingData.green_bean_data.defects.map((defect, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{defect.name}</span>
                                <span className="font-medium">{defect.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No grading data available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Edit History */}
            {editHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Edit History</CardTitle>
                  <CardDescription>Audit trail of changes to cupping and grading data</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {editHistory.map((entry, i) => (
                      <div key={i} className="border-l-2 border-border pl-4 py-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-medium">{entry.edited_by}</p>
                            <p className="text-xs text-muted-foreground">{entry.reason}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.edited_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Workflow Timeline</CardTitle>
                <CardDescription>Track the progress of this sample through the quality control process</CardDescription>
              </CardHeader>
              <CardContent>
                {getWorkflowTimeline()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assessments" className="space-y-4">
            {assessments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No assessments yet</h3>
                  <p className="text-muted-foreground">
                    Quality assessments will appear here once they are completed
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {assessments.map((assessment) => (
                  <Card key={assessment.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{assessment.assessment_type}</CardTitle>
                        <Badge>{assessment.status}</Badge>
                      </div>
                      <CardDescription>
                        {new Date(assessment.created_at).toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {assessment.total_score && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Score: </span>
                          <span className="font-medium">{assessment.total_score}</span>
                        </div>
                      )}
                      {assessment.notes && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {assessment.notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="certificates" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Quality Certificate</CardTitle>
                    <CardDescription>
                      {sample.certificate_id
                        ? 'View and download the official quality certificate for this sample'
                        : 'Generate and download the official quality certificate for this sample'}
                    </CardDescription>
                  </div>
                  {sample.certificate_id && (
                    <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Available
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center py-6 space-y-4">
                  <Award className="h-16 w-16 text-muted-foreground" />

                  {!sample.certificate_id ? (
                    <>
                      {sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected' || sample.workflow_stage === 'review' ? (
                        <>
                          <p className="text-muted-foreground text-center max-w-md">
                            Generate an official quality certificate containing all analysis data,
                            cupping scores, and supply chain information for this sample.
                          </p>
                          {sample.workflow_stage === 'review' && (
                            <p className="text-sm text-amber-600 dark:text-amber-400">
                              Note: Both cupping and grading must be complete. The system will verify this before generating.
                            </p>
                          )}
                          <Button
                            onClick={handleGenerateCertificate}
                            disabled={generatingCertificate}
                          >
                            {generatingCertificate ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Award className="h-4 w-4 mr-2" />
                            )}
                            {generatingCertificate ? 'Generating...' : 'Generate Certificate'}
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-muted-foreground text-center max-w-md">
                            Certificate generation is available after both cupping and grading are complete.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Current workflow stage: <span className="font-medium">{sample.workflow_stage || 'received'}</span>
                          </p>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground text-center max-w-md">
                        The quality certificate for this sample is ready for download.
                        It includes all analysis results, cupping scores, and traceability information.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="default"
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
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
                <CardDescription>Complete history of actions performed on this sample</CardDescription>
              </CardHeader>
              <CardContent>
                {activityLog.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No activity recorded yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activityLog.map((log) => (
                      <div key={log.id} className="flex gap-4 border-l-2 border-border pl-4 py-2">
                        <div className="flex-1">
                          <div className="font-medium">{log.activity_type}</div>
                          <div className="text-sm text-muted-foreground">{log.description}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {log.user_name} • {new Date(log.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Certificate Preview Modal */}
        <Dialog open={showCertificateModal} onOpenChange={(open) => !open && handleClosePreview()}>
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
                    id="email-exporter"
                    checked={emailRecipients.exporter}
                    onCheckedChange={(checked) =>
                      setEmailRecipients(prev => ({ ...prev, exporter: !!checked }))
                    }
                  />
                  <label
                    htmlFor="email-exporter"
                    className="text-sm font-medium leading-none"
                  >
                    Exporter
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="email-importer"
                    checked={emailRecipients.importer}
                    onCheckedChange={(checked) =>
                      setEmailRecipients(prev => ({ ...prev, importer: !!checked }))
                    }
                  />
                  <label
                    htmlFor="email-importer"
                    className="text-sm font-medium leading-none"
                  >
                    Importer
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="email-roaster"
                    checked={emailRecipients.roaster}
                    onCheckedChange={(checked) =>
                      setEmailRecipients(prev => ({ ...prev, roaster: !!checked }))
                    }
                  />
                  <label
                    htmlFor="email-roaster"
                    className="text-sm font-medium leading-none"
                  >
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
      </div>
    </MainLayout>
  )
}
