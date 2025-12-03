'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft, CheckCircle, XCircle, Clock, AlertCircle, MapPin,
  Calendar, Package, FileText, Activity, Download, Printer,
  QrCode, Edit, Trash2, User, Building2, Award, Loader2
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/components/providers/auth-provider'

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
  bag_weight_kg?: number
  bag_type?: string
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

  useEffect(() => {
    if (params.id) {
      loadSampleDetails()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadSampleDetails = async () => {
    try {
      setLoading(true)

      // Load sample data
      const sampleRes = await fetch(`/api/samples/${params.id}`)
      const sampleData = await sampleRes.json()

      if (sampleRes.ok && sampleData.sample) {
        setSample(sampleData.sample)
      } else {
        console.error('Failed to load sample:', sampleData.error)
      }

      // Load quality assessments
      const assessmentsRes = await fetch(`/api/quality-assessments?sample_id=${params.id}`)
      const assessmentsData = await assessmentsRes.json()
      if (assessmentsRes.ok && assessmentsData.assessments) {
        setAssessments(assessmentsData.assessments)
      }

      // Load certificates
      const certsRes = await fetch(`/api/samples/${params.id}/certificate`)
      if (certsRes.status === 200) {
        // PDF response means certificate exists
        setCertificates([{
          id: 'current',
          sample_id: params.id as string,
          certificate_number: 'Available',
          status: 'issued',
          created_at: new Date().toISOString()
        }])
      }

      // TODO: Load activity log when endpoint is available
      // const activityRes = await fetch(`/api/activity-log?sample_id=${params.id}`)

    } catch (error) {
      console.error('Error loading sample details:', error)
    } finally {
      setLoading(false)
    }
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
        throw new Error(data.error || 'Failed to create certificate')
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
      a.download = `certificate-${parseTrackingNumber(sample.tracking_number)}.pdf`
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
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Print Label
            </Button>
            <Button variant="outline" size="sm">
              <QrCode className="h-4 w-4 mr-2" />
              QR Code
            </Button>
            {/* Show certificate button if sample is certified/rejected/review OR has existing certificate */}
            {(sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected' || sample.workflow_stage === 'review' || certificates.length > 0) && (
              <Button
                variant="default"
                size="sm"
                onClick={certificates.length > 0 ? handleDownloadCertificate : handleGenerateCertificate}
                disabled={generatingCertificate || downloadingCertificate}
              >
                {generatingCertificate || downloadingCertificate ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Award className="h-4 w-4 mr-2" />
                )}
                {certificates.length > 0 ? 'Download Certificate' : 'Generate Certificate'}
              </Button>
            )}
            <Button variant="outline" size="sm">
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
              <div className="flex items-center gap-1 text-sm font-medium">
                <MapPin className="h-4 w-4" />
                {sample.storage_position || 'Not assigned'}
              </div>
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
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="assessments">Assessments ({assessments.length})</TabsTrigger>
            <TabsTrigger value="certificates">Certificates ({certificates.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sample Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Sample Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm text-muted-foreground">Origin:</div>
                    <div className="text-sm font-medium">{sample.origin}</div>

                    <div className="text-sm text-muted-foreground">Quality:</div>
                    <div className="text-sm font-medium">{sample.quality_name || '-'}</div>

                    <div className="text-sm text-muted-foreground">Processing:</div>
                    <div className="text-sm font-medium">{sample.processing_method || '-'}</div>

                    <div className="text-sm text-muted-foreground">Quantity (bags):</div>
                    <div className="text-sm font-medium">{sample.bag_count || '-'}</div>

                    <div className="text-sm text-muted-foreground">Bag Type:</div>
                    <div className="text-sm font-medium">{sample.bag_type || '-'}</div>

                    <div className="text-sm text-muted-foreground">Per-bag Weight:</div>
                    <div className="text-sm font-medium">
                      {sample.bag_weight_kg ? `${sample.bag_weight_kg.toLocaleString()} kg` : '-'}
                    </div>

                    <div className="text-sm text-muted-foreground">Total:</div>
                    <div className="text-sm font-medium">
                      {sample.bags_quantity_mt ? `${sample.bags_quantity_mt} MT` : '-'}
                    </div>

                    <div className="text-sm text-muted-foreground">60kg Equivalent:</div>
                    <div className="text-sm font-medium">
                      {sample.bags_quantity_mt
                        ? `${Math.round((sample.bags_quantity_mt * 1000) / 60)} bags`
                        : '-'}
                    </div>
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
                        {sample.roaster_name || sample.buyer || '-'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contract Numbers */}
              <Card>
                <CardHeader>
                  <CardTitle>Contract Numbers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm text-muted-foreground">Wolthers Contract:</div>
                    <div className="text-sm font-medium font-mono">{sample.wolthers_contract_nr || '-'}</div>

                    <div className="text-sm text-muted-foreground">Exporter Contract:</div>
                    <div className="text-sm font-medium font-mono">{sample.exporter_contract_nr || '-'}</div>

                    <div className="text-sm text-muted-foreground">Buyer Contract:</div>
                    <div className="text-sm font-medium font-mono">{sample.buyer_contract_nr || '-'}</div>

                    <div className="text-sm text-muted-foreground">Roaster Contract:</div>
                    <div className="text-sm font-medium font-mono">{sample.roaster_contract_nr || '-'}</div>

                    <div className="text-sm text-muted-foreground">ICO Number:</div>
                    <div className="text-sm font-medium font-mono">{sample.ico_number || '-'}</div>

                    <div className="text-sm text-muted-foreground">ICO Marks:</div>
                    <div className="text-sm font-medium font-mono">{sample.ico_marks || '-'}</div>

                    <div className="text-sm text-muted-foreground">Container Nr:</div>
                    <div className="text-sm font-medium font-mono">{sample.container_nr || '-'}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Additional Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Additional Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-sm text-muted-foreground">Workflow Stage:</div>
                    <div className="text-sm font-medium">{sample.workflow_stage || '-'}</div>

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
                      Generate and download the official quality certificate for this sample
                    </CardDescription>
                  </div>
                  {certificates.length > 0 && (
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

                  {certificates.length === 0 ? (
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
                          onClick={handleDownloadCertificate}
                          disabled={downloadingCertificate}
                        >
                          {downloadingCertificate ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          {downloadingCertificate ? 'Downloading...' : 'Download PDF'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleGenerateCertificate}
                          disabled={generatingCertificate}
                        >
                          {generatingCertificate ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 mr-2" />
                          )}
                          Regenerate
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
      </div>
    </MainLayout>
  )
}
