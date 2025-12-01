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
import { AlertCircle, CheckCircle2, Edit, Loader2 } from 'lucide-react'
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
  cupper_id: string
  cupper_name: string
  scores: Record<string, number>
  defects: {
    taints?: string[]
    faults?: string[]
  }
  created_at: string
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
    is_assigned: boolean
    has_completed: boolean
  }
  stats: {
    total_samples: number
    completed_cuppers: number
    min_cuppers_required: number
    has_master_cupper_assigned: boolean
  }
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

  // Fetch aggregated scores and permissions when modal opens
  useEffect(() => {
    if (open && sampleId) {
      fetchAggregatedScores()
      fetchPermissions()
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

  const handleFinalize = () => {
    // Check permission first
    if (!permissions?.can_validate) {
      toast({
        title: 'Cannot Validate',
        description: permissions?.reason || 'You do not have permission to validate this session',
        variant: 'destructive',
      })
      return
    }

    if (aggregated?.hasDiscrepancies) {
      toast({
        title: 'Cannot Finalize',
        description: 'Please resolve all discrepancies before finalizing scores',
        variant: 'destructive',
      })
      return
    }

    onFinalize?.()
    onOpenChange(false)
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

  const handleEditCupperScore = (cupperId: string) => {
    onEditScore?.(cupperId)
    onOpenChange(false)
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
            Sample: {sampleTrackingNumber || aggregated.sample_tracking_number} • {aggregated.total_cuppers} Cuppers
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
                            ±{stats.range.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-2xl font-bold">
                        {stats.finalScore.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Range: {stats.min.toFixed(2)} - {stats.max.toFixed(2)}
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
                      {aggregated.overall_score.mean.toFixed(2)}
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
                <CardTitle>Cupper Score Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-semibold">Attribute</th>
                        {individualScores.map((score) => (
                          <th key={score.cupper_id} className="text-center p-2 font-semibold">
                            <div className="flex flex-col items-center gap-1">
                              <span>{score.cupper_name}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditCupperScore(score.cupper_id)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          </th>
                        ))}
                        <th className="text-center p-2 font-semibold">Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(aggregated.attributes).map(([attribute, stats]) => (
                        <tr key={attribute} className="border-b">
                          <td className="p-2 font-medium">{attribute}</td>
                          {individualScores.map((score) => (
                            <td
                              key={`${attribute}-${score.cupper_id}`}
                              className={`text-center p-2 ${
                                stats.hasDiscrepancy
                                  ? 'bg-red-50 dark:bg-red-950'
                                  : ''
                              }`}
                            >
                              {score.scores[attribute]?.toFixed(2) || 'N/A'}
                            </td>
                          ))}
                          <td
                            className={`text-center p-2 font-bold ${
                              stats.hasDiscrepancy
                                ? 'bg-red-100 dark:bg-red-900'
                                : 'bg-green-100 dark:bg-green-900'
                            }`}
                          >
                            {stats.finalScore.toFixed(2)}
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
              {permissions.stats.completed_cuppers}/{permissions.stats.min_cuppers_required} cuppers completed
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={!canFinalize}
              className={canFinalize ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {!permissions?.can_validate ? (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {getButtonText()}
                </>
              ) : aggregated.hasDiscrepancies ? (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Resolve Discrepancies First
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Finalize Scores
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
