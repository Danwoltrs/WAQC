/**
 * The cup half of a specialty lot's certification decision.
 *
 * Pure. The green-bean half stays in compliance.ts and is combined by the route:
 * a lot is certified only when BOTH pass. An override speaks to the cup only —
 * a lot failing on screen size is not rescued by overriding its cup.
 */
import type { CvaAssessment } from '@/types/cva'
import { computeAssessmentScore } from '@/lib/cva/scoring'

export interface CvaOverride {
  decision: 'approved' | 'rejected'
  comment: string
}

export interface CvaVerdict {
  /** null when the cup cannot be judged at all — not the same as failing. */
  cupPassed: boolean | null
  source: 'auto' | 'override'
  reason: string
}

export function decideCvaVerdict({
  cvaScore,
  cvaMinScore,
  override,
}: {
  cvaScore: number | null
  cvaMinScore: number | null
  override?: CvaOverride | null
}): CvaVerdict {
  if (override) {
    return {
      cupPassed: override.decision === 'approved',
      source: 'override',
      reason: override.comment,
    }
  }
  if (cvaScore == null) {
    return { cupPassed: null, source: 'auto', reason: 'No CVA score recorded for this sample' }
  }
  if (cvaMinScore == null) {
    return { cupPassed: null, source: 'auto', reason: 'This quality has no CVA pass mark set' }
  }
  return cvaScore >= cvaMinScore
    ? { cupPassed: true, source: 'auto', reason: `CVA score ${cvaScore} meets the ${cvaMinScore} pass mark` }
    : { cupPassed: false, source: 'auto', reason: `CVA score ${cvaScore} is below the ${cvaMinScore} pass mark` }
}

/** Validation message for a submitted override, or null when it is acceptable. */
export function overrideError(override: unknown): string | null {
  if (override === null || override === undefined) return null
  const o = override as Partial<CvaOverride>
  if (o.decision !== 'approved' && o.decision !== 'rejected') {
    return 'Override decision must be "approved" or "rejected"'
  }
  if (typeof o.comment !== 'string' || o.comment.trim() === '') {
    return 'An override comment is required'
  }
  return null
}

/**
 * Cup integrity for a specialty lot.
 *
 * CVA records which cups were non-uniform and which were defective, rather than
 * the commodity taint/fault counts. A lot is uniform when no cup was flagged
 * non-uniform, and clean when none was flagged defective.
 */
export function cvaCupIntegrity(
  assessment: Pick<CvaAssessment, 'sections' | 'cups'>,
): { cleanCup: boolean; uniformCup: boolean } {
  const { u, d } = computeAssessmentScore(assessment)
  return { cleanCup: d === 0, uniformCup: u === 0 }
}
