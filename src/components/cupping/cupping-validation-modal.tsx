'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Edit, Loader2, Save, X, FileCheck, Check, XCircle, Download } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface AttributeStats {
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  values: number[]
  hasDiscrepancy: boolean
  outliers: string[]
  finalScore: number
  range: number
}

interface AggregatedScores {
  sample_id: string
  sample_tracking_number: string
  total_cuppers: number
  attributes: Record<string, AttributeStats>
  overall_score: {
    mean: number
    median: number
    stdDev: number
  }
  defects: {
    taints: string[]
    faults: string[]
  }
  hasDiscrepancies: boolean
  discrepancy_flags: string[]
}

interface IndividualScore {
  score_id?: string
  cupper_id: string | null
  cupper_name: string
  scores: Record<string, number>
  defects: {
    taints?: string[]
    faults?: string[]
  }
  created_at: string
  is_own_score?: boolean
}

interface EditingState {
  cupperId: string
  attribute: string
  originalValue: number
  newValue: number
}

interface ValidationPermissions {
  can_validate: boolean
  reason: string
  session: {
    id: string
    status: string
    sample_ids: string[]
    cupper_ids: string[]
    min_cuppers_required: number
    allow_single_cupper: boolean
  } | null
  user_profile: {
    id: string
    is_cupper: boolean
    is_q_grader: boolean
    is_master_cupper: boolean
    is_global_admin: boolean
    is_lab_admin?: boolean
    has_admin_permissions?: boolean
    qc_role?: string
    is_assigned: boolean
    has_completed: boolean
  }
  stats: {
    total_samples: number
    completed_cuppers: number
    assigned_cuppers: number
    min_cuppers_required: number
    has_master_cupper_assigned: boolean
  }
}

interface QualitySpecInfo {
  has_validation_rules: boolean
  quality_spec_name: string | null
}

interface CuppingValidationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  sessionId?: string | null
  sampleTrackingNumber?: string
  onFinalize?: () => void
  onEditScore?: (cupperId: string) => void
}

// Helper function to download certificate PDF
async function downloadCertificate(sampleId: string, trackingNumber: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/samples/${sampleId}/certificate`)

    if (!response.ok) {
      throw new Error('Failed to generate certificate')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Certificate-${trackingNumber}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    return true
  } catch (error) {
    console.error('Error downloading certificate:', error)
    return false
  }
}

export function CuppingValidationModal({
  open,
  onOpenChange,
  sampleId,
  sessionId,
  sampleTrackingNumber,
  onFinalize,
  onEditScore,
}: CuppingValidationModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [aggregated, setAggregated] = useState<AggregatedScores | null>(null)
  const [individualScores, setIndividualScores] = useState<IndividualScore[]>([])
  const [permissions, setPermissions] = useState<ValidationPermissions | null>(null)
  const [qualitySpecInfo, setQualitySpecInfo] = useState<QualitySpecInfo | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  // Check if user can edit scores based on permissions
  const canEditScores = () => {
    if (!permissions) return false
    const { user_profile, stats } = permissions
    // Global admins can always edit
    if (user_profile.is_global_admin) return true
    // Master cuppers can edit
    if (user_profile.is_master_cupper) return true
    // Lab admins can edit
    if (user_profile.is_lab_admin || user_profile.has_admin_permissions) return true
    // If no master cupper assigned, any assigned cupper can edit
    if (!stats.has_master_cupper_assigned && user_profile.is_assigned) return true
    // Q-graders can edit
    if (user_profile.is_q_grader) return true
    return false
  }

  // Fetch aggregated scores, permissions, and quality spec info when modal opens
  useEffect(() => {
    if (open && sampleId) {
      fetchAggregatedScores()
      fetchPermissions()
      fetchQualitySpecInfo()
    }
  }, [open, sampleId, sessionId])

  const fetchPermissions = async () => {
    if (!sampleId && !sessionId) return

    try {
      const params = new URLSearchParams()
      if (sessionId) params.set('session_id', sessionId)
      if (sampleId) params.set('sample_id', sampleId)

      const response = await fetch(`/api/cupping/validate?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setPermissions(data)
      }
    } catch (error) {
      console.error('Error fetching validation permissions:', error)
    }
  }

  const fetchQualitySpecInfo = async () => {
    if (!sampleId) return

    try {
      const response = await fetch(`/api/samples/${sampleId}/quality-spec`)
      const data = await response.json()

      if (response.ok) {
        setQualitySpecInfo(data)
      } else {
        // No quality spec or error - assume no validation rules
        setQualitySpecInfo({ has_validation_rules: false, quality_spec_name: null })
      }
    } catch (error) {
      console.error('Error fetching quality spec info:', error)
      setQualitySpecInfo({ has_validation_rules: false, quality_spec_name: null })
    }
  }

  const fetchAggregatedScores = async () => {
    if (!sampleId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/cupping/scores/aggregate?sample_id=${sampleId}`)
      const data = await response.json()

      if (data.success) {
        setAggregated(data.aggregated)
        setIndividualScores(data.individual_scores)
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to fetch aggregated scores',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error fetching aggregated scores:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch aggregated scores',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFinalize = async (manualDecision?: 'approved' | 'rejected', overrideDiscrepancies?: boolean) => {
    // Check permission first
    if (!permissions?.can_validate) {
      toast({
        title: 'Cannot Validate',
        description: permissions?.reason || 'You do not have permission to validate this session',
        variant: 'destructive',
      })
      return
    }

    // Block if discrepancies exist unless override is requested by master cupper
    if (aggregated?.hasDiscrepancies && !overrideDiscrepancies) {
      toast({
        title: 'Cannot Finalize',
        description: 'Please resolve all discrepancies before finalizing scores',
        variant: 'destructive',
      })
      return
    }

    if (!sampleId || !permissions?.session?.id) {
      toast({
        title: 'Error',
        description: 'Missing sample or session information',
        variant: 'destructive',
      })
      return
    }

    setFinalizing(true)
    try {
      const response = await fetch('/api/cupping/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: permissions.session.id,
          sample_id: sampleId,
          manual_decision: manualDecision,
          override_discrepancies: overrideDiscrepancies,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to finalize scores')
      }

      // Show result based on auto-determined decision
      const isApproved = data.decision === 'approved'
      const isPending = data.decision === 'pending'
      const isRejected = data.decision === 'rejected'

      if (isPending) {
        // Grading not complete - show info message
        toast({
          title: 'Cupping Scores Finalized',
          description: data.message || 'Sample moved to Review. Certificate will be generated after grading is complete.',
        })
      } else {
        toast({
          title: isApproved ? 'Sample Approved' : 'Sample Rejected',
          description: data.message || (isApproved
            ? `Certificate ${data.certificate?.certificate_number || 'generated'} created successfully`
            : `Certificate ${data.certificate?.certificate_number || 'generated'} created (rejected)`),
          variant: isApproved ? 'default' : 'destructive',
        })
      }

      // Show violations if any (only for approved/rejected, not pending)
      if (!isPending && data.violations && data.violations.length > 0) {
        setTimeout(() => {
          toast({
            title: 'Quality Spec Violations',
            description: data.violations.slice(0, 3).join('; ') + (data.violations.length > 3 ? `... and ${data.violations.length - 3} more` : ''),
            variant: 'destructive',
          })
        }, 500)
      }

      // Auto-download certificate if approved or rejected (not pending)
      if (!isPending && sampleId) {
        const trackingNumber = sampleTrackingNumber || aggregated?.sample_tracking_number || 'unknown'
        const downloadSuccess = await downloadCertificate(sampleId, trackingNumber)

        if (downloadSuccess) {
          toast({
            title: 'Certificate Downloaded',
            description: `Certificate for ${trackingNumber} has been downloaded.`,
          })
        } else {
          toast({
            title: 'Download Failed',
            description: 'Certificate was created but download failed. You can download it from the sample page.',
            variant: 'destructive',
          })
        }
      }

      onFinalize?.()
      onOpenChange(false)
    } catch (error) {
      console.error('Error finalizing scores:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to finalize scores',
        variant: 'destructive',
      })
    } finally {
      setFinalizing(false)
    }
  }

  // Determine if button should be disabled
  const canFinalize = permissions?.can_validate && !aggregated?.hasDiscrepancies

  // Get button text based on state
  const getButtonText = () => {
    if (!permissions?.can_validate) {
      return permissions?.reason || 'Validation Not Allowed'
    }
    if (aggregated?.hasDiscrepancies) {
      return 'Resolve Discrepancies First'
    }
    return 'Finalize Scores'
  }

  const startEditing = (cupperId: string | null, attribute: string, currentValue: number, isOwnScore?: boolean) => {
    // Users can always edit their own scores
    if (isOwnScore) {
      setEditing({
        cupperId: cupperId || '',
        attribute,
        originalValue: currentValue,
        newValue: currentValue,
      })
      return
    }

    // For others' scores, need admin/master cupper permission
    if (!canEditScores()) {
      toast({
        title: 'Permission Denied',
        description: 'Only master cuppers can edit scores when a master cupper is assigned to the session',
        variant: 'destructive',
      })
      return
    }
    setEditing({
      cupperId: cupperId || '',
      attribute,
      originalValue: currentValue,
      newValue: currentValue,
    })
  }

  const cancelEditing = () => {
    setEditing(null)
  }

  const handleSaveEdit = async () => {
    if (!editing) return

    // Find score by cupper_id or score_id (handles anonymized scores)
    const score = individualScores.find(s =>
      s.cupper_id === editing.cupperId ||
      s.score_id === editing.cupperId
    )
    if (!score?.score_id) {
      toast({
        title: 'Error',
        description: 'Cannot find score to update',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/cupping/scores/${score.score_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attribute: editing.attribute,
          value: editing.newValue,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update score')
      }

      toast({
        title: 'Score Updated',
        description: `${editing.attribute} updated from ${editing.originalValue} to ${editing.newValue}`,
      })

      // Refresh the data
      await fetchAggregatedScores()
      setEditing(null)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save score',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleEditCupperScore = (cupperId: string) => {
    // Legacy handler - now we use inline editing
    if (!canEditScores()) {
      toast({
        title: 'Permission Denied',
        description: 'Only master cuppers can edit scores when a master cupper is assigned to the session',
        variant: 'destructive',
      })
      return
    }
    onEditScore?.(cupperId)
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!aggregated || individualScores.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Score Validation</DialogTitle>
            <DialogDescription>
              No cupping scores found for this sample
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Score Validation
            {aggregated.hasDiscrepancies ? (
              <Badge variant="destructive" className="ml-2">
                <AlertCircle className="h-3 w-3 mr-1" />
                Discrepancies Detected
              </Badge>
            ) : (
              <Badge variant="default" className="ml-2 bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                All Scores Valid
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Sample: {sampleTrackingNumber || aggregated.sample_tracking_number} • {aggregated.total_cuppers} {aggregated.total_cuppers === 1 ? 'Cupper' : 'Cuppers'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="comparison">Cupper Comparison</TabsTrigger>
            <TabsTrigger value="defects">Defects</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Discrepancy Alerts */}
            {aggregated.hasDiscrepancies && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Score Discrepancies Detected</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {aggregated.discrepancy_flags.map((flag, index) => (
                      <li key={index} className="text-sm">{flag}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Aggregated Scores Grid */}
            <Card>
              <CardHeader>
                <CardTitle>Aggregated Scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Object.entries(aggregated.attributes).map(([attribute, stats]) => (
                    <div
                      key={attribute}
                      className={`p-4 rounded-lg border ${
                        stats.hasDiscrepancy
                          ? 'border-red-500 bg-red-50 dark:bg-red-950'
                          : 'border-green-500 bg-green-50 dark:bg-green-950'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{attribute}</span>
                        {stats.hasDiscrepancy && (
                          <Badge variant="destructive" className="text-xs">
                            ±{(stats.range ?? 0).toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-2xl font-bold">
                        {(stats.finalScore ?? 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Range: {(stats.min ?? 0).toFixed(2)} - {(stats.max ?? 0).toFixed(2)}
                      </div>
                      {stats.hasDiscrepancy && stats.outliers.length > 0 && (
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Discrepancy: {stats.outliers.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Overall Score */}
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Overall Score</span>
                    <div className="text-2xl font-bold">
                      {(aggregated.overall_score.mean ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Comparison Tab */}
          <TabsContent value="comparison" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Cupper Score Comparison</span>
                  {canEditScores() && (
                    <span className="text-xs font-normal text-muted-foreground">
                      Click any score to edit
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-semibold">Attribute</th>
                        {individualScores.map((score) => (
                          <th key={score.cupper_id || score.score_id} className="text-center p-2 font-semibold">
                            <span>
                              {score.cupper_name}
                              {score.is_own_score && <span className="text-xs text-muted-foreground ml-1">(You)</span>}
                            </span>
                          </th>
                        ))}
                        <th className="text-center p-2 font-semibold">Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(aggregated.attributes).map(([attribute, stats]) => (
                        <tr key={attribute} className="border-b">
                          <td className="p-2 font-medium">{attribute}</td>
                          {individualScores.map((score) => {
                            const scoreKey = score.cupper_id || score.score_id || ''
                            const isEditing = editing?.cupperId === scoreKey && editing?.attribute === attribute
                            const cellValue = score.scores[attribute]
                            const canEdit = score.is_own_score || canEditScores()

                            return (
                              <td
                                key={`${attribute}-${scoreKey}`}
                                className={`text-center p-2 ${
                                  stats.hasDiscrepancy
                                    ? 'bg-red-50 dark:bg-red-950'
                                    : ''
                                } ${canEdit && !isEditing ? 'cursor-pointer hover:bg-accent' : ''}`}
                                onClick={() => {
                                  if (!isEditing && cellValue !== undefined && canEdit) {
                                    startEditing(scoreKey, attribute, cellValue, score.is_own_score)
                                  }
                                }}
                              >
                                {isEditing ? (
                                  <div className="flex items-center gap-1 justify-center">
                                    <Input
                                      type="number"
                                      step="0.25"
                                      value={editing.newValue}
                                      onChange={(e) => setEditing({
                                        ...editing,
                                        newValue: parseFloat(e.target.value) || 0
                                      })}
                                      className="w-16 h-7 text-center text-sm"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveEdit()
                                        if (e.key === 'Escape') cancelEditing()
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleSaveEdit()
                                      }}
                                      disabled={saving}
                                    >
                                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 text-green-600" />}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        cancelEditing()
                                      }}
                                    >
                                      <X className="h-3 w-3 text-red-600" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span>{cellValue?.toFixed(2) || 'N/A'}</span>
                                )}
                              </td>
                            )
                          })}
                          <td
                            className={`text-center p-2 font-bold ${
                              stats.hasDiscrepancy
                                ? 'bg-red-100 dark:bg-red-900'
                                : 'bg-green-100 dark:bg-green-900'
                            }`}
                          >
                            {(stats.finalScore ?? 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Defects Tab */}
          <TabsContent value="defects" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Taints */}
              <Card>
                <CardHeader>
                  <CardTitle>Taints</CardTitle>
                </CardHeader>
                <CardContent>
                  {aggregated.defects.taints.length > 0 ? (
                    <div className="space-y-2">
                      {aggregated.defects.taints.map((taint) => {
                        // Check which cuppers identified this taint
                        const cuppersWithTaint = individualScores.filter(
                          (score) => score.defects.taints?.includes(taint)
                        )
                        const allCuppersAgree = cuppersWithTaint.length === individualScores.length

                        return (
                          <div
                            key={taint}
                            className={`p-3 rounded-lg border ${
                              allCuppersAgree
                                ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                : 'border-red-500 bg-red-50 dark:bg-red-950'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{taint}</span>
                              <Badge
                                variant={allCuppersAgree ? 'default' : 'destructive'}
                                className={allCuppersAgree ? 'bg-green-600' : ''}
                              >
                                {cuppersWithTaint.length}/{individualScores.length}
                              </Badge>
                            </div>
                            {!allCuppersAgree && (
                              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Only: {cuppersWithTaint.map((s) => s.cupper_name).join(', ')}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No taints detected</p>
                  )}
                </CardContent>
              </Card>

              {/* Faults */}
              <Card>
                <CardHeader>
                  <CardTitle>Faults</CardTitle>
                </CardHeader>
                <CardContent>
                  {aggregated.defects.faults.length > 0 ? (
                    <div className="space-y-2">
                      {aggregated.defects.faults.map((fault) => {
                        // Check which cuppers identified this fault
                        const cuppersWithFault = individualScores.filter(
                          (score) => score.defects.faults?.includes(fault)
                        )
                        const allCuppersAgree = cuppersWithFault.length === individualScores.length

                        return (
                          <div
                            key={fault}
                            className={`p-3 rounded-lg border ${
                              allCuppersAgree
                                ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                : 'border-red-500 bg-red-50 dark:bg-red-950'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{fault}</span>
                              <Badge
                                variant={allCuppersAgree ? 'default' : 'destructive'}
                                className={allCuppersAgree ? 'bg-green-600' : ''}
                              >
                                {cuppersWithFault.length}/{individualScores.length}
                              </Badge>
                            </div>
                            {!allCuppersAgree && (
                              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Only: {cuppersWithFault.map((s) => s.cupper_name).join(', ')}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No faults detected</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Permission status indicator */}
          {permissions && !permissions.can_validate && (
            <div className="flex-1 text-sm text-muted-foreground text-left">
              {permissions.reason}
            </div>
          )}

          {/* Cupper stats */}
          {permissions?.stats && (
            <div className="text-xs text-muted-foreground">
              {permissions.stats.completed_cuppers}/{permissions.stats.assigned_cuppers} {permissions.stats.assigned_cuppers === 1 ? 'cupper' : 'cuppers'} completed
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {canFinalize ? (
              // Show different buttons based on whether validation rules exist
              qualitySpecInfo && !qualitySpecInfo.has_validation_rules ? (
                // No validation rules - show manual Approve/Reject buttons
                <>
                  <Button
                    onClick={() => handleFinalize('rejected')}
                    disabled={finalizing}
                    variant="destructive"
                  >
                    {finalizing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleFinalize('approved')}
                    disabled={finalizing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {finalizing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Approve
                  </Button>
                </>
              ) : (
                // Has validation rules - use auto-determined decision
                <Button
                  onClick={() => handleFinalize()}
                  disabled={finalizing}
                  className="bg-primary hover:bg-primary/90"
                >
                  {finalizing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileCheck className="h-4 w-4 mr-2" />
                  )}
                  Validate & Certify
                </Button>
              )
            ) : aggregated?.hasDiscrepancies && permissions?.can_validate ? (
              // Has discrepancies but master cupper can override
              qualitySpecInfo && !qualitySpecInfo.has_validation_rules ? (
                // No validation rules - show manual Approve/Reject with override
                <>
                  <Button
                    onClick={() => handleFinalize('rejected', true)}
                    disabled={finalizing}
                    variant="destructive"
                  >
                    {finalizing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Override & Reject
                  </Button>
                  <Button
                    onClick={() => handleFinalize('approved', true)}
                    disabled={finalizing}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {finalizing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <AlertCircle className="h-4 w-4 mr-2" />
                    )}
                    Override & Approve
                  </Button>
                </>
              ) : (
                // Has validation rules - use auto-determined decision with override
                <Button
                  onClick={() => handleFinalize(undefined, true)}
                  disabled={finalizing}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {finalizing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mr-2" />
                  )}
                  Override Discrepancies & Finalize
                </Button>
              )
            ) : (
              <Button disabled>
                <AlertCircle className="h-4 w-4 mr-2" />
                {getButtonText()}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
