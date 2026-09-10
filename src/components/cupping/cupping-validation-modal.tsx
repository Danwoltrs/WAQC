'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import { AlertCircle, CheckCircle2, Loader2, FileCheck, Check, XCircle, Lock, Plus } from 'lucide-react'
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
  /**
   * `decision` is what the server actually concluded: 'approved' | 'rejected'
   * settle the lot, 'pending' means only the cupping is done and it is still
   * waiting on grading. The host needs it to know whether the lot leaves the
   * queue — guessing would either strand a certified lot on screen or hide one
   * that still needs work.
   */
  onFinalize?: (result: { decision: 'approved' | 'rejected' | 'pending' }) => void
  onEditScore?: (cupperId: string) => void
}

// Round to nearest valid increment
function snapToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment
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
  // Optional approval note for the seller — sent ONLY to the seller's email and
  // recorded on sys, and only when the sample ends up approved.
  const [sellerComment, setSellerComment] = useState('')

  // Master cupper's final decisions (editable on validation screen)
  const [finalScores, setFinalScores] = useState<Record<string, number>>({})
  const [finalDefects, setFinalDefects] = useState<Record<string, { cups: number; intensity: number; type: 'taint' | 'fault' }>>({})

  // Resolution mode toggles: independent control over attributes vs defects source.
  // ATTRIBUTES default to the panel AVERAGE for every lot (2026-09-10). It used
  // to default to the master cupper's card whenever one was designated, which
  // let a panel of four be decided by one card without anyone choosing that.
  // Taking one cupper's card is still available - it is now a deliberate click.
  const [attributeMode, setAttributeMode] = useState<'average' | 'cupper'>('average')
  /**
   * Which CARD is being taken, when attributeMode === 'cupper'.
   *
   * Keyed on score_id, not cupper_id, on purpose: the aggregate route
   * anonymises other cuppers for anyone who is not an admin or master cupper
   * (cupper_id comes back null, the name as "Cupper 2") while still returning
   * their score_id and their numbers. Keying on the id that is always there
   * lets a plain roster cupper exclude and select colleagues without the app
   * having to reveal who they are.
   */
  const [attributeSourceScoreId, setAttributeSourceScoreId] = useState<string | null>(null)
  /**
   * Cards dropped from the average. A cupper who was called away mid-flight, or
   * scored the wrong lot, should not drag the panel - so any cupper may exclude
   * any other, and who was excluded is frozen into
   * quality_assessments.score_resolution for the record.
   */
  const [excludedScoreIds, setExcludedScoreIds] = useState<Set<string>>(new Set())
  const [defectMode, setDefectMode] = useState<'master' | 'all'>('master')
  // Master cupper's defect names (from aggregate API) for filtering
  const [masterDefectNames, setMasterDefectNames] = useState<{ taints: string[]; faults: string[] } | null>(null)
  // Full consolidated defects before any filtering (always contains all cuppers' defects)
  const [allConsolidatedDefects, setAllConsolidatedDefects] = useState<ConsolidatedDefect[]>([])
  // Defect names the validator explicitly removed via the X button.
  // Why: mode-toggle rebuilds finalDefects from scratch, so without persisting the user's
  // removal intent here it gets silently undone (e.g. clicking X on "Dirty" then toggling
  // defect mode would put Dirty back in finalDefects and let it reach the certificate).
  const [removedDefects, setRemovedDefects] = useState<Set<string>>(new Set())

  // Who may adjust the final score.
  //
  // ANY cupper on this session can (2026-09-10) - drop a colleague from the
  // average, or take a colleague's card - not just master cuppers and admins.
  // The panel result is the panel's to settle, and the server agrees: the same
  // roster rule gates POST /api/cupping/finalize (assertCanFinalize). Nobody's
  // individual card is touched by any of it; only the agreed resolution is
  // recorded, alongside who resolved it.
  const canEditFinals = useCallback(() => {
    if (!permissions) return false
    const { user_profile } = permissions
    return user_profile.is_global_admin || user_profile.is_master_cupper ||
      user_profile.is_lab_admin || user_profile.has_admin_permissions ||
      user_profile.is_q_grader || permissions.can_validate
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

    console.log('[validation] fetchAggregatedScores', { sampleId, sessionId })
    setLoading(true)
    setRemovedDefects(new Set())
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

        // Restore how this lot was resolved last time, if it was. A lot whose
        // cupping finished before grading stops at 'review' and stays on the
        // queue with a live Validate button, so it IS re-opened — and without
        // this, the second Finalize would quietly overwrite the exclusions the
        // panel had already agreed with a plain average of everyone.
        const rows = (data.individual_scores || []) as IndividualScore[]
        const stored = data.score_resolution as {
          mode?: string
          source_cupper_id?: string | null
          excluded_cupper_ids?: string[]
          final_scores?: Record<string, number>
        } | null

        const scoreIdOf = (cupperId: string | null | undefined) =>
          rows.find(r => r.cupper_id && r.cupper_id === cupperId)?.score_id ?? null
        const restoredExcluded = new Set(
          (stored?.excluded_cupper_ids ?? [])
            .map(scoreIdOf)
            .filter((id): id is string => !!id),
        )
        const restoredSource = stored?.mode === 'cupper' ? scoreIdOf(stored.source_cupper_id) : null

        setExcludedScoreIds(restoredExcluded)
        setAttributeSourceScoreId(restoredSource)
        setAttributeMode(restoredSource ? 'cupper' : 'average')

        // The final scores. A restored resolution prints exactly what was
        // agreed; otherwise the PANEL AVERAGE over the cards that count, which
        // is the 2026-09-10 rule. Deliberately NOT stats.finalScore: that value
        // carries the legacy master-wins fallback so the certificate editor and
        // the quadrant keep agreeing with an already-issued certificate, and
        // seeding a fresh validation from it would put the master's card back
        // in as the default.
        const initScores: Record<string, number> = {}
        if (stored?.final_scores && Object.keys(stored.final_scores).length > 0) {
          for (const [attr, value] of Object.entries(stored.final_scores)) {
            if (typeof value === 'number' && Number.isFinite(value)) initScores[attr] = value
          }
        } else {
          const kept = rows.filter(r => !r.score_id || !restoredExcluded.has(r.score_id))
          for (const [attr, stats] of Object.entries(data.aggregated.attributes as Record<string, AttributeStats>)) {
            const values = kept
              .map(r => r.scores[attr])
              .filter((v): v is number => typeof v === 'number' && !isNaN(v))
            if (values.length === 0) continue
            initScores[attr] = snapToIncrement(
              values.reduce((a, b) => a + b, 0) / values.length,
              stats.increment || 0.25,
            )
          }
        }
        setFinalScores(initScores)

        // Defects keep the old rule (the master's list when one is designated) -
        // a defect is an observation, not a number, and averaging observations
        // is meaningless.
        const hasMaster = !!data.master_cupper_id
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

  /**
   * The defect list this validation settles on, as the screen shows it.
   *
   * This used to be PATCHed onto the master cupper's own cupping_scores row
   * (along with the final scores) so the finalize route could read it back —
   * which destroyed that cupper's individual card and locked validation to
   * whoever was allowed to edit it. Both the scores and the defects now travel
   * in the finalize body instead and are frozen on quality_assessments, so
   * every cupper's card stays exactly as they left it.
   */
  const buildResolvedDefects = useCallback(() => {
    // removedDefects is the authoritative "exclude" set: a mode toggle rebuilds
    // finalDefects from scratch, so without it clicking X on "Dirty" and then
    // switching mode would quietly put Dirty back on the certificate.
    const taints: Array<{ name: string; intensity: number; cups_affected: number }> = []
    const faults: Array<{ name: string; intensity: number; cups_affected: number }> = []
    for (const [defectName, defectData] of Object.entries(finalDefects)) {
      if (removedDefects.has(defectName)) continue
      const entry = {
        name: defectName,
        intensity: defectData.intensity,
        cups_affected: defectData.cups,
      }
      if (defectData.type === 'taint') taints.push(entry)
      else faults.push(entry)
    }
    return { taints, faults }
  }, [finalDefects, removedDefects])

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
      // Whose card, if anyone's, was taken wholesale. 'average' - the default -
      // sends no source cupper, and the server averages everyone not excluded.
      const sourceScoreId =
        attributeMode !== 'average' && attributeSourceScoreId ? attributeSourceScoreId : null
      // The cupper behind the chosen card, when this user is allowed to see it.
      // The server resolves the score_id itself, so an anonymised panel still
      // works; this only keeps validated_by_cupper_id populated as before.
      const sourceCupperId =
        individualScores.find(s => s.score_id === sourceScoreId)?.cupper_id ?? null

      const response = await fetch('/api/cupping/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: permissions.session.id,
          sample_id: sampleId,
          manual_decision: manualDecision,
          override_discrepancies: overrideDiscrepancies,
          validated_by_cupper_id: sourceCupperId,
          seller_comment: sellerComment.trim() || null,
          // The agreed panel result, frozen server-side on
          // quality_assessments.score_resolution so the gate, the PDF and the
          // public page all read one set of numbers.
          final_scores: finalScores,
          source_score_id: sourceScoreId,
          source_cupper_id: sourceCupperId,
          excluded_score_ids: Array.from(excludedScoreIds),
          resolved_defects: buildResolvedDefects(),
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

      // No local download and no email here. The certificate record is created
      // server-side at finalize, and the PDF is regenerated on the fly whenever
      // it's previewed, downloaded, or batch-emailed — nothing is kept on the PC.
      // The decision is written back to sys at finalize time, the toast above
      // confirms it, and Anderson sends all pending certificates at end of day
      // via the batch "Send unsent certificates" flow.
      onFinalize?.({ decision: data.decision })
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

  /** The cards that count: everyone on the panel except those explicitly excluded. */
  const includedScores = useMemo(
    () => individualScores.filter(s => !s.score_id || !excludedScoreIds.has(s.score_id)),
    [individualScores, excludedScoreIds],
  )

  /** The panel average for one attribute over the included cards, or null. */
  const averageFor = useCallback((attribute: string, increment: number): number | null => {
    const values = includedScores
      .map(s => s.scores[attribute])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v))
    if (values.length === 0) return null
    return snapToIncrement(values.reduce((a, b) => a + b, 0) / values.length, increment)
  }, [includedScores])

  // Applies exactly what the Avg cell DISPLAYS — over the included cuppers.
  // Averaging over everyone here while the cell showed the included average
  // meant clicking the cell wrote a different number than the one clicked, and
  // silently reintroduced an excluded cupper's score.
  const applyAverage = useCallback((attribute: string) => {
    const increment = aggregated?.attributes[attribute]?.increment || 0.25
    const avg = averageFor(attribute, increment)
    if (avg === null) return
    setFinalScores(prev => ({ ...prev, [attribute]: avg }))
  }, [aggregated, averageFor])


  // REBUILDS finalScores rather than merging into it. Merging left the previous
  // value in place for any attribute the new source cannot supply — so after
  // excluding the only cupper who scored Uniformity, the Final column silently
  // kept that excluded cupper's number and froze it onto the certificate.
  // An attribute with no included value is now absent, and stays absent.
  const applyAverageAll = useCallback(() => {
    if (!aggregated) return
    const newScores: Record<string, number> = {}
    for (const [attr, stats] of Object.entries(aggregated.attributes)) {
      const avg = averageFor(attr, stats.increment || 0.25)
      if (avg !== null) newScores[attr] = avg
    }
    setFinalScores(newScores)
  }, [aggregated, averageFor])

  /** Take one cupper's card wholesale, across every attribute. */
  const applyCupperAll = useCallback((scoreId: string | null) => {
    if (!aggregated || !scoreId) return
    const score = individualScores.find(s => s.score_id === scoreId)
    if (!score) return
    const newScores: Record<string, number> = {}
    for (const [attr, stats] of Object.entries(aggregated.attributes)) {
      const value = score.scores[attr]
      if (typeof value === 'number' && !isNaN(value)) {
        newScores[attr] = snapToIncrement(value, stats.increment || 0.25)
      }
    }
    setFinalScores(newScores)
  }, [individualScores, aggregated])

  // Switch between the panel average and one cupper's card.
  const handleAttributeModeChange = useCallback((mode: 'average' | 'cupper', scoreId?: string | null) => {
    setAttributeMode(mode)
    if (mode === 'average') {
      setAttributeSourceScoreId(null)
      applyAverageAll()
    } else {
      setAttributeSourceScoreId(scoreId ?? null)
      applyCupperAll(scoreId ?? null)
    }
  }, [applyAverageAll, applyCupperAll])

  /**
   * Drop a cupper from the panel, or put them back. Excluding re-runs whichever
   * mode is active so the Final column moves the moment the panel changes -
   * excluding someone and seeing nothing happen would be the worst outcome.
   * Excluding the cupper whose card is currently being taken falls back to the
   * average, because "use Ana's card, but not Ana" has no meaning.
   */
  const toggleCupperExcluded = useCallback((scoreId: string | null) => {
    if (!scoreId) return
    setExcludedScoreIds(prev => {
      const next = new Set(prev)
      if (next.has(scoreId)) {
        next.delete(scoreId)
        return next
      }
      // The panel cannot be emptied. With nobody included there is no average
      // to compute, and the Final column would simply keep whatever the last
      // included cupper had said - a certificate carrying the numbers of
      // cuppers the panel had formally thrown out.
      const cards = individualScores.filter(s => !!s.score_id).length
      if (next.size + 1 >= cards) {
        toast({
          title: 'At least one cupper has to count',
          description: 'Excluding everyone would leave no scores to agree on. Include someone else first.',
          variant: 'destructive',
        })
        return prev
      }
      next.add(scoreId)
      return next
    })
  }, [individualScores, toast])

  // Excluding somebody has to move the Final column, or the click looks like it
  // did nothing. Re-apply whichever mode is active whenever the panel changes.
  // Skipped on the first render so it can't fight the initial seeding.
  const panelSettled = useRef(false)
  useEffect(() => {
    if (!panelSettled.current) {
      panelSettled.current = true
      return
    }
    if (attributeMode === 'cupper' && attributeSourceScoreId) {
      // "Use Ana's card, but not Ana" has no meaning — fall back to the average.
      if (excludedScoreIds.has(attributeSourceScoreId)) {
        handleAttributeModeChange('average')
        return
      }
      applyCupperAll(attributeSourceScoreId)
    } else {
      applyAverageAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludedScoreIds])

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
    // Preserve prior X-removals so mode toggle doesn't silently undo them
    defectsToShow = defectsToShow.filter(d => !removedDefects.has(d.name))
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
  }, [allConsolidatedDefects, masterDefectNames, removedDefects])

  // Remove a single defect from the final list
  const removeDefect = useCallback((defectName: string) => {
    setConsolidatedDefects(prev => prev.filter(d => d.name !== defectName))
    setFinalDefects(prev => {
      const next = { ...prev }
      delete next[defectName]
      return next
    })
    setRemovedDefects(prev => {
      const next = new Set(prev)
      next.add(defectName)
      return next
    })
  }, [])

  // Restore a previously removed defect (undo for the X button)
  const restoreDefect = useCallback((defectName: string) => {
    const original = allConsolidatedDefects.find(d => d.name === defectName)
    if (!original) return
    setRemovedDefects(prev => {
      const next = new Set(prev)
      next.delete(defectName)
      return next
    })
    setConsolidatedDefects(prev =>
      prev.some(d => d.name === defectName) ? prev : [...prev, original]
    )
    setFinalDefects(prev => ({
      ...prev,
      [defectName]: {
        cups: original.consolidated_cups,
        intensity: original.consolidated_intensity,
        type: original.type,
      },
    }))
  }, [allConsolidatedDefects])

  // Apply a specific cupper's defect values (cups + intensity) as the final decision
  const applyDefectFromCupper = useCallback((defectName: string, cupperName: string) => {
    const defect = consolidatedDefects.find(d => d.name === defectName)
    if (!defect) return
    const cupperData = defect.per_cupper[cupperName]
    if (!cupperData) return
    setFinalDefects(prev => ({
      ...prev,
      [defectName]: {
        ...prev[defectName],
        cups: cupperData.cups,
        intensity: cupperData.intensity,
      },
    }))
  }, [consolidatedDefects])

  // Average all cuppers' defect values for a specific defect
  const applyDefectAverage = useCallback((defectName: string) => {
    const defect = consolidatedDefects.find(d => d.name === defectName)
    if (!defect) return
    const entries = Object.values(defect.per_cupper)
    if (entries.length === 0) return
    const avgCups = Math.round(entries.reduce((s, e) => s + e.cups, 0) / entries.length)
    const avgIntensity = snapToIncrement(
      entries.reduce((s, e) => s + e.intensity, 0) / entries.length,
      0.25
    )
    setFinalDefects(prev => ({
      ...prev,
      [defectName]: {
        ...prev[defectName],
        cups: avgCups,
        intensity: avgIntensity,
      },
    }))
  }, [consolidatedDefects])

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

  // EVERY cupper is offered as a source, self and master included (2026-09-10).
  // The list used to exclude the master cupper and the current user, because
  // their card was the implicit default; now that the default is the average,
  // taking any one card - including your own - is an equally explicit choice.
  const selectableCuppers = individualScores
    .map((s, i) => ({ ...s, index: i }))
    .filter(s => !!s.score_id && !excludedScoreIds.has(s.score_id!))

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
          {/* Bulk actions — apply to ALL attributes at once */}
          {isMultiCupper && editable && (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Final score:</span>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      attributeMode === 'average' ? 'bg-amber-600 text-white' : 'bg-transparent hover:bg-muted'
                    }`}
                    onClick={() => handleAttributeModeChange('average')}
                    title="The average of every cupper still on the panel, rounded to the quality's increment"
                  >
                    Average
                  </button>
                  {selectableCuppers.map((cupper) => (
                    <button
                      key={cupper.cupper_id || cupper.index}
                      className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${
                        attributeMode === 'cupper' && attributeSourceScoreId === cupper.score_id
                          ? 'bg-amber-600 text-white'
                          : 'bg-transparent hover:bg-muted'
                      }`}
                      onClick={() => handleAttributeModeChange('cupper', cupper.score_id)}
                      title={`Use ${cupper.cupper_name}'s scores as the final scores`}
                    >
                      {cupper.cupper_name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              {masterDefectNames && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Defects:</span>
                  <div className="inline-flex rounded-md border border-border overflow-hidden">
                    <button
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        defectMode === 'master' ? 'bg-amber-600 text-white' : 'bg-transparent hover:bg-muted'
                      }`}
                      onClick={() => handleDefectModeChange('master')}
                    >
                      Mine
                    </button>
                    <button
                      className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${
                        defectMode === 'all' ? 'bg-amber-600 text-white' : 'bg-transparent hover:bg-muted'
                      }`}
                      onClick={() => handleDefectModeChange('all')}
                    >
                      All Cuppers
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 1: Attributes table — clickable cells to select score */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2 font-semibold">Attribute</th>
                  {individualScores.map((score) => {
                    const isExcluded = !!score.score_id && excludedScoreIds.has(score.score_id)
                    return (
                      <th
                        key={score.cupper_id || score.score_id}
                        className={`text-center p-2 font-semibold ${isExcluded ? 'opacity-45' : ''}`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={isExcluded ? 'line-through' : ''}>
                            {score.cupper_name.split(' ')[0]}
                          </span>
                          {score.is_master_cupper && <Badge className="text-[10px] bg-amber-600 px-1 py-0">Master</Badge>}
                          {/* Drop this cupper from the panel, or put them back.
                              Their own card is never altered - only whether it
                              counts towards the agreed result. */}
                          {editable && isMultiCupper && score.score_id && (
                            <button
                              type="button"
                              onClick={() => toggleCupperExcluded(score.score_id!)}
                              className="text-[10px] font-normal text-muted-foreground hover:text-foreground underline underline-offset-2"
                              title={
                                isExcluded
                                  ? `Count ${score.cupper_name} towards the final score again`
                                  : `Drop ${score.cupper_name} from the final score`
                              }
                            >
                              {isExcluded ? 'include' : 'exclude'}
                            </button>
                          )}
                        </div>
                      </th>
                    )
                  })}
                  {isMultiCupper && editable && (
                    <th className="text-center p-2 font-semibold text-xs">Avg</th>
                  )}
                  <th className="text-center p-2 font-semibold">
                    <span className={editable ? 'text-amber-600' : ''}>Final</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(aggregated.attributes).map(([attribute, stats]) => {
                  const increment = stats.increment || 0.25
                  // NO fallback to stats.finalScore. That value is the aggregate
                  // route's mean over EVERY cupper and is never refetched, so
                  // once a cupper is excluded it is stale — showing it would put
                  // an excluded cupper's number in the Final column, highlight
                  // their cell as "selected", and then quietly not submit it.
                  // An attribute nobody included scored has no final: a dash.
                  const currentFinal = finalScores[attribute]
                  const hasFinal = typeof currentFinal === 'number'
                  // The displayed average is the one that would be applied:
                  // over the INCLUDED cuppers only, so excluding someone moves
                  // this column immediately.
                  const avg = averageFor(attribute, increment)

                  return (
                    <tr key={attribute} className="border-b">
                      <td className="p-2 font-medium whitespace-nowrap">{attribute}</td>
                      {individualScores.map((score) => {
                        const scoreKey = score.cupper_id || score.score_id || ''
                        const cellValue = score.scores[attribute]
                        const excluded = !!score.score_id && excludedScoreIds.has(score.score_id)
                        // An excluded card is not selectable. Without this the
                        // header said "excluded" while one click on any cell in
                        // that column still wrote their number into the final.
                        const isValid = typeof cellValue === 'number' && !isNaN(cellValue) && !excluded
                        const isSelected = isValid && hasFinal && Math.abs(cellValue - currentFinal!) < 0.001
                        const isDiscrepant = stats.hasDiscrepancy && isValid

                        return (
                          <td
                            key={`${attribute}-${scoreKey}`}
                            className={`text-center p-2 transition-colors ${
                              editable && !excluded ? 'cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950' : ''
                            } ${excluded ? 'opacity-45 line-through' : ''} ${isSelected
                              ? 'bg-amber-100 dark:bg-amber-900 font-bold'
                              : isDiscrepant
                                ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                                : ''
                            }`}
                            onClick={() => {
                              if (!editable || !isValid) return
                              setFinalScores(prev => ({ ...prev, [attribute]: snapToIncrement(cellValue as number, increment) }))
                            }}
                            title={
                              excluded
                                ? `${score.cupper_name} is excluded from this lot's score`
                                : editable && isValid ? `Select ${(cellValue as number).toFixed(2)} as final` : undefined
                            }
                          >
                            {typeof cellValue === 'number' && !isNaN(cellValue) ? cellValue.toFixed(2) : 'N/A'}
                          </td>
                        )
                      })}
                      {isMultiCupper && editable && (
                        <td
                          className={`text-center p-2 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950 text-muted-foreground ${
                            avg !== null && hasFinal && Math.abs(avg - currentFinal!) < 0.001
                              ? 'bg-amber-100 dark:bg-amber-900 font-bold text-foreground'
                              : ''
                          }`}
                          onClick={() => avg !== null && applyAverage(attribute)}
                          title={avg !== null ? `Select average ${avg.toFixed(2)} as final` : undefined}
                        >
                          {avg !== null ? avg.toFixed(2) : '--'}
                        </td>
                      )}
                      <td className="text-center p-2">
                        {editable ? (
                          <Input
                            type="number"
                            step={increment}
                            value={hasFinal ? currentFinal : ''}
                            placeholder="--"
                            onChange={(e) => updateFinalScore(attribute, e.target.value)}
                            onBlur={() => snapFinalScore(attribute)}
                            className="w-20 h-8 text-center text-sm font-bold mx-auto border-amber-400 bg-amber-50 dark:bg-amber-950"
                            title={
                              hasFinal
                                ? undefined
                                : 'No cupper counting towards this lot scored this attribute — it will not appear on the certificate.'
                            }
                          />
                        ) : (
                          <span className="font-bold">{hasFinal ? currentFinal!.toFixed(2) : '--'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="p-2 font-bold">Overall</td>
                  {individualScores.map((score) => {
                    const total = Object.keys(aggregated.attributes).reduce((sum, attr) => {
                      const v = score.scores[attr]
                      return sum + (typeof v === 'number' && !isNaN(v) ? v : 0)
                    }, 0)
                    return (
                      <td key={score.cupper_id || score.score_id} className="text-center p-2 font-semibold text-muted-foreground">
                        {total.toFixed(2)}
                      </td>
                    )
                  })}
                  {isMultiCupper && editable && <td />}
                  <td className="text-center p-2 font-bold text-lg">{(overallFinalScore ?? 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
                          {/* Section 2: Defects table */}
          {(consolidatedDefects.length > 0 || allConsolidatedDefects.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Taints / Faults</span>
                {consolidatedDefects.length === 0 && defectMode === 'master' && allConsolidatedDefects.length > 0 && (
                  <button className="text-xs underline text-amber-600" onClick={() => handleDefectModeChange('all')}>
                    Show all cuppers
                  </button>
                )}
              </div>
              {removedDefects.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-xs mb-2 p-2 rounded-md border border-dashed border-muted-foreground/30">
                  <span className="text-muted-foreground">Excluded from certificate:</span>
                  {Array.from(removedDefects).map(name => (
                    <Badge key={name} variant="outline" className="gap-1 pr-1">
                      <span className="line-through text-muted-foreground">{name}</span>
                      {editable && (
                        <button
                          onClick={() => restoreDefect(name)}
                          title={`Re-add ${name}`}
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
              {consolidatedDefects.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  No defects in current selection.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-semibold">Defect</th>
                          <th className="text-center p-2 font-semibold">Type</th>
                          {individualScores.map((score) => (
                            <th key={score.cupper_id || score.score_id} className="text-center p-2 font-semibold text-xs">
                              <span className="flex flex-col items-center gap-0.5">
                                <span>{score.cupper_name.split(' ')[0]}</span>
                                {score.is_master_cupper && <Badge className="text-[10px] bg-amber-600 px-1 py-0">M</Badge>}
                              </span>
                            </th>
                          ))}
                          <th className="text-center p-2 font-semibold text-sm">
                            <span className={editable ? 'text-amber-600' : ''}>Final Cups</span>
                          </th>
                          <th className="text-center p-2 font-semibold text-sm">
                            <span className={editable ? 'text-amber-600' : ''}>Final Int.</span>
                          </th>
                          {isMultiCupper && editable && (
                            <th className="text-center p-2 font-semibold text-xs text-muted-foreground">Action</th>
                          )}
                          {editable && <th className="text-center p-2 font-semibold text-xs text-muted-foreground w-8" />}
                        </tr>
                      </thead>
                      <tbody>
                        {consolidatedDefects.map((defect) => {
                          const finalDef = finalDefects[defect.name]
                          const cupperEntries = defect.per_cupper

                          return (
                            <tr key={defect.name} className="border-b hover:bg-muted/50">
                              <td className="p-2 font-medium text-sm whitespace-nowrap">{defect.name}</td>
                              <td className="text-center p-2">
                                {editable ? (
                                  <Select
                                    value={finalDef?.type || defect.type}
                                    onValueChange={(v) => updateFinalDefect(defect.name, 'type', v)}
                                  >
                                    <SelectTrigger className="h-7 w-20 text-xs mx-auto border-amber-400">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="taint">Taint</SelectItem>
                                      <SelectItem value="fault">Fault</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant={defect.type === 'fault' ? 'destructive' : 'secondary'} className="text-[10px]">
                                    {finalDef?.type || defect.type}
                                  </Badge>
                                )}
                              </td>
                              {individualScores.map((score) => {
                                const scoreKey = score.cupper_id || score.score_id || ''
                                const cupperData = cupperEntries[score.cupper_name]
                                return (
                                  <td key={`${defect.name}-${scoreKey}`} className="text-center p-2 text-xs">
                                    {cupperData ? (
                                      <span className="text-foreground">
                                        {cupperData.cups}c / {cupperData.intensity}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">--</span>
                                    )}
                                  </td>
                                )
                              })}
                              <td className="text-center p-2">
                                {editable ? (
                                  <Input
                                    type="number"
                                    min={0}
                                    value={finalDef?.cups ?? defect.consolidated_cups}
                                    onChange={(e) => updateFinalDefect(defect.name, 'cups', e.target.value)}
                                    className="w-16 h-7 text-center text-xs font-bold mx-auto border-amber-400 bg-amber-50 dark:bg-amber-950"
                                  />
                                ) : (
                                  <span className="font-bold">{finalDef?.cups ?? defect.consolidated_cups}</span>
                                )}
                              </td>
                              <td className="text-center p-2">
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
                                    className="w-16 h-7 text-center text-xs font-bold mx-auto border-amber-400 bg-amber-50 dark:bg-amber-950"
                                  />
                                ) : (
                                  <span className="font-bold">{finalDef?.intensity ?? defect.consolidated_intensity}</span>
                                )}
                              </td>
                              {isMultiCupper && editable && (
                                <td className="text-center p-2">
                                  <div className="flex items-center justify-center gap-1">
                                    {Object.keys(cupperEntries).length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        title="Average of all cuppers"
                                        onClick={() => applyDefectAverage(defect.name)}
                                      >
                                        Avg
                                      </Button>
                                    )}
                                    {Object.entries(cupperEntries).map(([cupperName]) => (
                                      <Button
                                        key={cupperName}
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        title={`Use ${cupperName}'s values`}
                                        onClick={() => applyDefectFromCupper(defect.name, cupperName)}
                                      >
                                        {cupperName.split(' ')[0]}
                                      </Button>
                                    ))}
                                  </div>
                                </td>
                              )}
                              {editable && (
                                <td className="text-center p-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                    title={`Remove ${defect.name}`}
                                    onClick={() => removeDefect(defect.name)}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
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

          {canFinalize && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Comment to seller (optional)</label>
              <textarea
                value={sellerComment}
                onChange={(e) => setSellerComment(e.target.value)}
                rows={2}
                placeholder="Quality note for the seller/exporter…"
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15"
              />
              <p className="text-[11px] text-muted-foreground">
                Sent only to the seller and recorded on the system — not shown to buyers, and only when approved.
              </p>
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
