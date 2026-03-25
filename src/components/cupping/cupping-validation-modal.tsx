'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, CheckCircle2, Loader2, FileCheck, Check, XCircle, Lock } from 'lucide-react'
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
  increment: number
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
    taints?: Array<string | { name?: string; intensity?: number; cups_affected?: number }>
    faults?: Array<string | { name?: string; intensity?: number; cups_affected?: number }>
  }
  created_at: string
  is_own_score?: boolean
  is_master_cupper?: boolean
}

interface ConsolidatedDefect {
  name: string
  type: 'taint' | 'fault'
  consolidated_cups: number
  consolidated_intensity: number
  per_cupper: Record<string, { cups: number; intensity: number }>
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

// Round to nearest valid increment
function snapToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

// Helper function to download a single certificate PDF
async function downloadSingleCertificate(sampleId: string, trackingNumber: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/samples/${sampleId}/certificate`)

    if (!response.ok) {
      throw new Error('Failed to generate certificate')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${trackingNumber.replace(/\//g, '_')}.pdf`
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

// Helper function to download ALL certificates (mother + sub-contracts) for a sample
async function downloadAllCertificates(sampleId: string, trackingNumber: string): Promise<{ success: boolean; count: number }> {
  try {
    // Fetch all certificate IDs for this sample (mother + sub-contracts)
    const certsResponse = await fetch(`/api/certificates?sample_id=${sampleId}`)
    if (!certsResponse.ok) {
      // Fallback to single download
      const success = await downloadSingleCertificate(sampleId, trackingNumber)
      return { success, count: success ? 1 : 0 }
    }

    const certsData = await certsResponse.json()
    const certificateIds: string[] = (certsData.certificates || []).map((c: { id: string }) => c.id)

    if (certificateIds.length === 0) {
      // No certificates found, try single download as fallback
      const success = await downloadSingleCertificate(sampleId, trackingNumber)
      return { success, count: success ? 1 : 0 }
    }

    if (certificateIds.length === 1) {
      // Only one certificate (no sub-contracts), download directly
      const success = await downloadSingleCertificate(sampleId, trackingNumber)
      return { success, count: success ? 1 : 0 }
    }

    // Multiple certificates — use bulk download (ZIP)
    const bulkResponse = await fetch('/api/certificates/bulk-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certificateIds }),
    })

    if (!bulkResponse.ok) {
      throw new Error('Failed to generate bulk certificates')
    }

    const blob = await bulkResponse.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${trackingNumber.replace(/\//g, '_')}-certificates.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    return { success: true, count: certificateIds.length }
  } catch (error) {
    console.error('Error downloading certificates:', error)
    return { success: false, count: 0 }
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
  const [consolidatedDefects, setConsolidatedDefects] = useState<ConsolidatedDefect[]>([])
  const [permissions, setPermissions] = useState<ValidationPermissions | null>(null)
  const [qualitySpecInfo, setQualitySpecInfo] = useState<QualitySpecInfo | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [masterCupperId, setMasterCupperId] = useState<string | null>(null)

  // Master cupper's final decisions (editable on validation screen)
  const [finalScores, setFinalScores] = useState<Record<string, number>>({})
  const [finalDefects, setFinalDefects] = useState<Record<string, { cups: number; intensity: number; type: 'taint' | 'fault' }>>({})

  // Resolution mode toggles: independent control over attributes vs defects source
  const [attributeMode, setAttributeMode] = useState<'master' | 'average'>('master')
  const [defectMode, setDefectMode] = useState<'master' | 'all'>('master')
  // Master cupper's defect names (from aggregate API) for filtering
  const [masterDefectNames, setMasterDefectNames] = useState<{ taints: string[]; faults: string[] } | null>(null)
  // Full consolidated defects before any filtering (always contains all cuppers' defects)
  const [allConsolidatedDefects, setAllConsolidatedDefects] = useState<ConsolidatedDefect[]>([])

  // Check if user can edit final scores (master cupper or admin)
  const canEditFinals = useCallback(() => {
    if (!permissions) return false
    const { user_profile } = permissions
    return user_profile.is_global_admin || user_profile.is_master_cupper ||
      user_profile.is_lab_admin || user_profile.has_admin_permissions ||
      user_profile.is_q_grader
  }, [permissions])

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
        const allDefects = (data.consolidated_defects || []) as ConsolidatedDefect[]
        setAllConsolidatedDefects(allDefects)
        setMasterCupperId(data.master_cupper_id || null)
        setMasterDefectNames(data.master_cupper_defect_names || null)

        // Initialize final scores from the aggregated finalScore values
        const initScores: Record<string, number> = {}
        for (const [attr, stats] of Object.entries(data.aggregated.attributes as Record<string, AttributeStats>)) {
          initScores[attr] = stats.finalScore ?? 0
        }
        setFinalScores(initScores)

        // Default resolution modes: master cupper if one is assigned, otherwise average/all
        const hasMaster = !!data.master_cupper_id
        setAttributeMode(hasMaster ? 'master' : 'average')
        setDefectMode(hasMaster ? 'master' : 'all')

        // Filter consolidated defects based on initial defect mode
        const masterNames = data.master_cupper_defect_names as { taints: string[]; faults: string[] } | null
        const filteredDefects = hasMaster && masterNames
          ? allDefects.filter(d =>
              (d.type === 'taint' && masterNames.taints.includes(d.name)) ||
              (d.type === 'fault' && masterNames.faults.includes(d.name))
            )
          : allDefects
        setConsolidatedDefects(filteredDefects)

        // Initialize final defects from filtered consolidated data
        const initDefects: Record<string, { cups: number; intensity: number; type: 'taint' | 'fault' }> = {}
        for (const defect of filteredDefects) {
          initDefects[defect.name] = {
            cups: defect.consolidated_cups,
            intensity: defect.consolidated_intensity,
            type: defect.type,
          }
        }
        setFinalDefects(initDefects)
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

  // Update a final score and snap to increment
  const updateFinalScore = (attribute: string, rawValue: string) => {
    const increment = aggregated?.attributes[attribute]?.increment || 0.25
    const parsed = parseFloat(rawValue)
    if (isNaN(parsed)) return
    setFinalScores(prev => ({ ...prev, [attribute]: parsed }))
  }

  // Snap to increment on blur
  const snapFinalScore = (attribute: string) => {
    const increment = aggregated?.attributes[attribute]?.increment || 0.25
    const current = finalScores[attribute]
    if (current === undefined) return
    const snapped = snapToIncrement(current, increment)
    setFinalScores(prev => ({ ...prev, [attribute]: snapped }))
  }

  // Update final defect
  const updateFinalDefect = (defectName: string, field: 'cups' | 'intensity' | 'type', value: number | string) => {
    setFinalDefects(prev => ({
      ...prev,
      [defectName]: {
        ...prev[defectName],
        [field]: field === 'type' ? value : Number(value),
      },
    }))
  }

  // Save final scores and defects back to the master cupper's score record before finalizing
  const saveFinalDecisions = async (): Promise<boolean> => {
    if (!masterCupperId || !sampleId) return true // No master cupper, nothing to save

    // Find the master cupper's score record
    const masterScore = individualScores.find(s => s.is_master_cupper || s.cupper_id === masterCupperId)
    if (!masterScore?.score_id) return true

    try {
      // Build the full final scores object
      const fullScores: Record<string, number> = {}
      for (const [attribute, value] of Object.entries(finalScores)) {
        fullScores[attribute] = value
      }

      // Build the final defects object from finalDefects state
      // This reflects the lab manager's resolution choice (Master/All Cuppers + individual removals)
      const resolvedTaints: Array<{ name: string; intensity: number; cups_affected: number }> = []
      const resolvedFaults: Array<{ name: string; intensity: number; cups_affected: number }> = []
      for (const [defectName, defectData] of Object.entries(finalDefects)) {
        const entry = {
          name: defectName,
          intensity: defectData.intensity,
          cups_affected: defectData.cups,
        }
        if (defectData.type === 'taint') {
          resolvedTaints.push(entry)
        } else {
          resolvedFaults.push(entry)
        }
      }

      // Single PATCH with both scores and defects
      const response = await fetch(`/api/cupping/scores/${masterScore.score_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scores: fullScores,
          defects: { taints: resolvedTaints, faults: resolvedFaults },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save final decisions')
      }

      return true
    } catch (error) {
      console.error('Error saving final decisions:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save final decisions',
        variant: 'destructive',
      })
      return false
    }
  }

  const handleFinalize = async (manualDecision?: 'approved' | 'rejected', overrideDiscrepancies?: boolean) => {
    if (!permissions?.can_validate) {
      toast({
        title: 'Cannot Validate',
        description: permissions?.reason || 'You do not have permission to validate this session',
        variant: 'destructive',
      })
      return
    }

    // Block if discrepancies exist unless override is requested
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

    // Validate all final scores are valid increments
    if (aggregated) {
      for (const [attr, stats] of Object.entries(aggregated.attributes)) {
        const value = finalScores[attr]
        if (value === undefined) continue
        const increment = stats.increment || 0.25
        const snapped = snapToIncrement(value, increment)
        if (Math.abs(value - snapped) > 0.001) {
          toast({
            title: 'Invalid Score',
            description: `${attr}: ${value} is not a valid ${increment} increment. Expected ${snapped}.`,
            variant: 'destructive',
          })
          return
        }
      }
    }

    setFinalizing(true)
    try {
      // Save the master cupper's final scores and defects before finalizing
      if (canEditFinals()) {
        const saved = await saveFinalDecisions()
        if (!saved) {
          setFinalizing(false)
          return
        }
      }

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

      const isApproved = data.decision === 'approved'
      const isPending = data.decision === 'pending'

      if (isPending) {
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

      if (!isPending && data.violations && data.violations.length > 0) {
        setTimeout(() => {
          toast({
            title: 'Quality Spec Violations',
            description: data.violations.slice(0, 3).join('; ') + (data.violations.length > 3 ? `... and ${data.violations.length - 3} more` : ''),
            variant: 'destructive',
          })
        }, 500)
      }

      // Auto-download all certificates (mother + sub-contracts)
      if (!isPending && sampleId) {
        const trackingNumber = sampleTrackingNumber || aggregated?.sample_tracking_number || 'unknown'
        const { success: downloadSuccess, count } = await downloadAllCertificates(sampleId, trackingNumber)

        if (downloadSuccess) {
          toast({
            title: count > 1 ? 'Certificates Downloaded' : 'Certificate Downloaded',
            description: count > 1
              ? `${count} certificates for ${trackingNumber} have been downloaded as a ZIP.`
              : `Certificate for ${trackingNumber} has been downloaded.`,
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

  const canFinalize = permissions?.can_validate && !aggregated?.hasDiscrepancies

  const getButtonText = () => {
    if (!permissions?.can_validate) {
      return permissions?.reason || 'Validation Not Allowed'
    }
    if (aggregated?.hasDiscrepancies) {
      return 'Resolve Discrepancies First'
    }
    return 'Finalize Scores'
  }

  // Calculate overall final score
  const overallFinalScore = Object.values(finalScores).reduce((sum, v) => sum + v, 0)

  // Quick-action helpers for master cupper (must be before early returns for hook rules)
  const applyKeepMine = useCallback((attribute: string) => {
    const myScore = individualScores.find(s => s.is_master_cupper || s.is_own_score)
    if (!myScore) return
    const value = myScore.scores[attribute]
    if (typeof value !== 'number' || isNaN(value)) return
    const increment = aggregated?.attributes[attribute]?.increment || 0.25
    setFinalScores(prev => ({ ...prev, [attribute]: snapToIncrement(value, increment) }))
  }, [individualScores, aggregated])

  const applyAverage = useCallback((attribute: string) => {
    const increment = aggregated?.attributes[attribute]?.increment || 0.25
    const values = individualScores
      .map(s => s.scores[attribute])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v))
    if (values.length === 0) return
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    setFinalScores(prev => ({ ...prev, [attribute]: snapToIncrement(avg, increment) }))
  }, [individualScores, aggregated])

  const applyMatchOther = useCallback((attribute: string, cupperIndex: number) => {
    const score = individualScores[cupperIndex]
    if (!score) return
    const value = score.scores[attribute]
    if (typeof value !== 'number' || isNaN(value)) return
    const increment = aggregated?.attributes[attribute]?.increment || 0.25
    setFinalScores(prev => ({ ...prev, [attribute]: snapToIncrement(value, increment) }))
  }, [individualScores, aggregated])

  // Bulk actions: apply to all attributes at once
  const applyKeepMineAll = useCallback(() => {
    if (!aggregated) return
    const myScore = individualScores.find(s => s.is_master_cupper || s.is_own_score)
    if (!myScore) return
    const newScores: Record<string, number> = {}
    for (const [attr, stats] of Object.entries(aggregated.attributes)) {
      const value = myScore.scores[attr]
      if (typeof value === 'number' && !isNaN(value)) {
        newScores[attr] = snapToIncrement(value, stats.increment || 0.25)
      }
    }
    setFinalScores(prev => ({ ...prev, ...newScores }))
  }, [individualScores, aggregated])

  const applyAverageAll = useCallback(() => {
    if (!aggregated) return
    const newScores: Record<string, number> = {}
    for (const [attr, stats] of Object.entries(aggregated.attributes)) {
      const values = individualScores
        .map(s => s.scores[attr])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length
        newScores[attr] = snapToIncrement(avg, stats.increment || 0.25)
      }
    }
    setFinalScores(prev => ({ ...prev, ...newScores }))
  }, [individualScores, aggregated])

  const applyMatchOtherAll = useCallback((cupperIndex: number) => {
    if (!aggregated) return
    const score = individualScores[cupperIndex]
    if (!score) return
    const newScores: Record<string, number> = {}
    for (const [attr, stats] of Object.entries(aggregated.attributes)) {
      const value = score.scores[attr]
      if (typeof value === 'number' && !isNaN(value)) {
        newScores[attr] = snapToIncrement(value, stats.increment || 0.25)
      }
    }
    setFinalScores(prev => ({ ...prev, ...newScores }))
  }, [individualScores, aggregated])

  // Toggle attribute resolution mode: Master Cupper vs Average
  const handleAttributeModeChange = useCallback((mode: 'master' | 'average') => {
    setAttributeMode(mode)
    if (mode === 'master') {
      applyKeepMineAll()
    } else {
      applyAverageAll()
    }
  }, [applyKeepMineAll, applyAverageAll])

  // Toggle defect resolution mode: Master Cupper vs All Cuppers
  const handleDefectModeChange = useCallback((mode: 'master' | 'all') => {
    setDefectMode(mode)
    let defectsToShow: ConsolidatedDefect[]
    if (mode === 'master' && masterDefectNames) {
      defectsToShow = allConsolidatedDefects.filter(d =>
        (d.type === 'taint' && masterDefectNames.taints.includes(d.name)) ||
        (d.type === 'fault' && masterDefectNames.faults.includes(d.name))
      )
    } else {
      defectsToShow = allConsolidatedDefects
    }
    setConsolidatedDefects(defectsToShow)
    // Rebuild final defects from the new set
    const newFinalDefects: Record<string, { cups: number; intensity: number; type: 'taint' | 'fault' }> = {}
    for (const defect of defectsToShow) {
      newFinalDefects[defect.name] = {
        cups: defect.consolidated_cups,
        intensity: defect.consolidated_intensity,
        type: defect.type,
      }
    }
    setFinalDefects(newFinalDefects)
  }, [allConsolidatedDefects, masterDefectNames])

  // Remove a single defect from the final list
  const removeDefect = useCallback((defectName: string) => {
    setConsolidatedDefects(prev => prev.filter(d => d.name !== defectName))
    setFinalDefects(prev => {
      const next = { ...prev }
      delete next[defectName]
      return next
    })
  }, [])

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Score Validation</DialogTitle>
            <DialogDescription>Loading scores...</DialogDescription>
          </DialogHeader>
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

  const isMultiCupper = individualScores.length > 1
  const editable = canEditFinals()

  // Identify the "other" cuppers (not master/self) for match buttons
  const otherCuppers = individualScores
    .map((s, i) => ({ ...s, index: i }))
    .filter(s => !s.is_master_cupper && !s.is_own_score)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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
            Sample: {sampleTrackingNumber || aggregated.sample_tracking_number} -- {aggregated.total_cuppers} {aggregated.total_cuppers === 1 ? 'Cupper' : 'Cuppers'}
            {masterCupperId && <span className="ml-2 text-amber-600 font-medium">(Master cupper assigned)</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Discrepancy alert */}
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

          {/* Resolution mode toggles */}
          {isMultiCupper && editable && masterCupperId && (
            <div className="flex items-center gap-4 flex-wrap">
              {/* Attributes resolution toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Attributes:</span>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      attributeMode === 'master'
                        ? 'bg-amber-600 text-white'
                        : 'bg-transparent hover:bg-muted'
                    }`}
                    onClick={() => handleAttributeModeChange('master')}
                  >
                    Master
                  </button>
                  <button
                    className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${
                      attributeMode === 'average'
                        ? 'bg-amber-600 text-white'
                        : 'bg-transparent hover:bg-muted'
                    }`}
                    onClick={() => handleAttributeModeChange('average')}
                  >
                    Average
                  </button>
                </div>
              </div>
              {/* Defects resolution toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Defects:</span>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      defectMode === 'master'
                        ? 'bg-amber-600 text-white'
                        : 'bg-transparent hover:bg-muted'
                    }`}
                    onClick={() => handleDefectModeChange('master')}
                  >
                    Master
                  </button>
                  <button
                    className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${
                      defectMode === 'all'
                        ? 'bg-amber-600 text-white'
                        : 'bg-transparent hover:bg-muted'
                    }`}
                    onClick={() => handleDefectModeChange('all')}
                  >
                    All Cuppers
                  </button>
                </div>
              </div>
              {/* Per-cupper match buttons (for attributes) */}
              {otherCuppers.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Match:</span>
                  {otherCuppers.map((cupper) => (
                    <Button
                      key={cupper.cupper_id || cupper.index}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => applyMatchOtherAll(cupper.index)}
                    >
                      {cupper.cupper_name.split(' ')[0]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback bulk actions when no master cupper */}
          {isMultiCupper && editable && !masterCupperId && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">Apply to all:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={applyKeepMineAll}
              >
                Keep My Scores
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={applyAverageAll}
              >
                Average All
              </Button>
              {otherCuppers.map((cupper) => (
                <Button
                  key={cupper.cupper_id || cupper.index}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyMatchOtherAll(cupper.index)}
                >
                  Match {cupper.cupper_name}
                </Button>
              ))}
            </div>
          )}

          {/* Unified scores table: all cuppers + final score + actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Cupping Scores</span>
                {!editable && (
                  <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Read-only
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
                        <th key={score.cupper_id || score.score_id} className="text-center p-2 font-semibold text-sm">
                          <span className="flex flex-col items-center gap-0.5">
                            <span>{score.cupper_name}</span>
                            <span className="flex items-center gap-1">
                              {score.is_own_score && <span className="text-xs text-muted-foreground">(You)</span>}
                              {score.is_master_cupper && <Badge className="text-[10px] bg-amber-600 px-1 py-0">Master</Badge>}
                            </span>
                          </span>
                        </th>
                      ))}
                      <th className="text-center p-2 font-semibold">
                        <span className={editable ? 'text-amber-600' : ''}>Final</span>
                      </th>
                      {isMultiCupper && editable && (
                        <th className="text-center p-2 font-semibold text-xs text-muted-foreground">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(aggregated.attributes).map(([attribute, stats]) => {
                      const increment = stats.increment || 0.25
                      const currentFinal = finalScores[attribute] ?? stats.finalScore

                      return (
                        <tr key={attribute} className={`border-b ${stats.hasDiscrepancy ? 'bg-red-50 dark:bg-red-950' : ''}`}>
                          <td className="p-2 font-medium whitespace-nowrap">
                            {attribute}
                            {stats.hasDiscrepancy && (
                              <Badge variant="destructive" className="ml-2 text-[10px] px-1 py-0">
                                Discrepancy
                              </Badge>
                            )}
                          </td>
                          {individualScores.map((score) => {
                            const scoreKey = score.cupper_id || score.score_id || ''
                            const cellValue = score.scores[attribute]
                            const isSelected = typeof cellValue === 'number' && !isNaN(cellValue) &&
                              Math.abs(cellValue - currentFinal) < 0.001

                            return (
                              <td
                                key={`${attribute}-${scoreKey}`}
                                className={`text-center p-2 text-sm ${
                                  stats.hasDiscrepancy && !isSelected ? 'text-muted-foreground' : ''
                                } ${isSelected ? 'font-semibold' : ''}`}
                              >
                                {typeof cellValue === 'number' && !isNaN(cellValue) ? cellValue.toFixed(2) : 'N/A'}
                              </td>
                            )
                          })}
                          <td className="text-center p-2">
                            {editable ? (
                              <Input
                                type="number"
                                step={increment}
                                value={currentFinal}
                                onChange={(e) => updateFinalScore(attribute, e.target.value)}
                                onBlur={() => snapFinalScore(attribute)}
                                className="w-20 h-8 text-center text-sm font-bold mx-auto border-amber-400 bg-amber-50 dark:bg-amber-950"
                              />
                            ) : (
                              <span className="font-bold text-lg">{(currentFinal ?? 0).toFixed(2)}</span>
                            )}
                          </td>
                          {isMultiCupper && editable && (
                            <td className="text-center p-2">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  title="Keep my score"
                                  onClick={() => applyKeepMine(attribute)}
                                >
                                  Mine
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  title="Average of all cuppers (rounded to increment)"
                                  onClick={() => applyAverage(attribute)}
                                >
                                  Avg
                                </Button>
                                {otherCuppers.map((cupper) => (
                                  <Button
                                    key={cupper.cupper_id || cupper.index}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    title={`Match ${cupper.cupper_name}'s score`}
                                    onClick={() => applyMatchOther(attribute, cupper.index)}
                                  >
                                    {cupper.cupper_name.split(' ')[0]}
                                  </Button>
                                ))}
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2">
                      <td className="p-2 font-bold">Overall</td>
                      {individualScores.map((score) => {
                        const total = Object.entries(aggregated.attributes).reduce((sum, [attr]) => {
                          const v = score.scores[attr]
                          return sum + (typeof v === 'number' && !isNaN(v) ? v : 0)
                        }, 0)
                        return (
                          <td key={score.cupper_id || score.score_id} className="text-center p-2 text-sm font-semibold text-muted-foreground">
                            {total.toFixed(2)}
                          </td>
                        )
                      })}
                      <td className="text-center p-2 font-bold text-lg">{(overallFinalScore ?? 0).toFixed(2)}</td>
                      {isMultiCupper && editable && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Defects section (inline, not a separate tab) */}
          {(consolidatedDefects.length > 0 || allConsolidatedDefects.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>Defects</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {consolidatedDefects.length === 0
                      ? 'No defects in current selection'
                      : editable
                        ? 'Cups = MAX across cuppers. Adjust as needed.'
                        : ''}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {consolidatedDefects.length === 0 && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No defects (taints or faults) in current selection.
                      {defectMode === 'master' && allConsolidatedDefects.length > 0 && (
                        <span> Switch to <button className="underline text-amber-600" onClick={() => handleDefectModeChange('all')}>All Cuppers</button> to see all reported defects.</span>
                      )}
                    </div>
                  )}
                  {consolidatedDefects.map((defect) => {
                    const finalDef = finalDefects[defect.name]
                    const cupperEntries = Object.entries(defect.per_cupper)

                    return (
                      <div
                        key={defect.name}
                        className="p-4 rounded-lg border border-border"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{defect.name}</span>
                            <Badge variant={defect.type === 'fault' ? 'destructive' : 'secondary'}>
                              {finalDef?.type || defect.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {cupperEntries.length}/{individualScores.length} cupper{cupperEntries.length !== 1 ? 's' : ''}
                            </Badge>
                            {editable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                title={`Remove ${defect.name}`}
                                onClick={() => removeDefect(defect.name)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Per-cupper reference */}
                        <div className="text-xs text-muted-foreground mb-3 space-y-1">
                          {cupperEntries.map(([cupperName, data]) => (
                            <div key={cupperName} className="flex items-center gap-2">
                              <span className="font-medium">{cupperName}:</span>
                              <span>{data.cups} cup{data.cups !== 1 ? 's' : ''}</span>
                              {data.intensity > 0 && <span>- intensity {data.intensity}</span>}
                            </div>
                          ))}
                        </div>

                        {/* Master cupper final decision */}
                        <div className={`grid grid-cols-3 gap-3 pt-3 border-t ${editable ? 'bg-amber-50 dark:bg-amber-950 -mx-4 -mb-4 px-4 pb-4 rounded-b-lg' : ''}`}>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">
                              Final Cups
                            </label>
                            {editable ? (
                              <Input
                                type="number"
                                min={0}
                                value={finalDef?.cups ?? defect.consolidated_cups}
                                onChange={(e) => updateFinalDefect(defect.name, 'cups', e.target.value)}
                                className="h-8 text-sm border-amber-400"
                              />
                            ) : (
                              <span className="font-bold">{finalDef?.cups ?? defect.consolidated_cups}</span>
                            )}
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">
                              Final Intensity
                            </label>
                            {editable ? (
                              <Input
                                type="number"
                                step="0.25"
                                min={0}
                                value={finalDef?.intensity ?? defect.consolidated_intensity}
                                onChange={(e) => updateFinalDefect(defect.name, 'intensity', e.target.value)}
                                onBlur={() => {
                                  const val = finalDef?.intensity ?? defect.consolidated_intensity
                                  updateFinalDefect(defect.name, 'intensity', snapToIncrement(val, 0.25))
                                }}
                                className="h-8 text-sm border-amber-400"
                              />
                            ) : (
                              <span className="font-bold">{finalDef?.intensity ?? defect.consolidated_intensity}</span>
                            )}
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">
                              Type
                            </label>
                            {editable ? (
                              <Select
                                value={finalDef?.type || defect.type}
                                onValueChange={(v) => updateFinalDefect(defect.name, 'type', v)}
                              >
                                <SelectTrigger className="h-8 text-sm border-amber-400">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="taint">Taint</SelectItem>
                                  <SelectItem value="fault">Fault</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="font-bold capitalize">{finalDef?.type || defect.type}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {permissions && !permissions.can_validate && (
            <div className="flex-1 text-sm text-muted-foreground text-left">
              {permissions.reason}
            </div>
          )}

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
              qualitySpecInfo && !qualitySpecInfo.has_validation_rules ? (
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
              qualitySpecInfo && !qualitySpecInfo.has_validation_rules ? (
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
