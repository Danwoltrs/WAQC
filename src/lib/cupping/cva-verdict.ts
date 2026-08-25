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

/** What a specialty finalize concluded, once cup and green bean are combined. */
export interface CvaOutcome {
  decision: 'approved' | 'rejected' | 'pending'
  /**
   * True when the cup could not be judged at all. Distinguishes "we cannot
   * decide this lot" from the ordinary "cup passed, grading not done yet"
   * pending — no amount of grading resolves a blocked lot, only a recorded
   * score, a configured pass mark, or an explicit override does.
   */
  blocked: boolean
  /** Plain-language outcome, safe to show the cupper. */
  reason: string
  /** Stamped on the certificate and the audit entry: failed cup first, then green bean. */
  violations: string[]
}

/**
 * Combine the cup verdict with the green-bean result into one decision.
 *
 * The rules, in the order they are checked:
 *
 *  1. A cup below the mark (or overridden to rejected) rejects the lot.
 *  2. Green-bean violations reject the lot — including when the cup was
 *     overridden to approved. An override speaks to the cup only; a lot failing
 *     on screen size is not rescued by overriding its cup.
 *  3. `cupPassed === null` means the cup CANNOT BE JUDGED — no score recorded,
 *     or no pass mark configured. That is not a failure and it is never a pass:
 *     the lot parks, blocked, carrying the verdict's own reason. Certifying here
 *     would put a cup quality nobody assessed on a certificate, which is the
 *     worst failure this route can produce. Note this is checked AFTER the two
 *     rejections above: a lot whose green bean genuinely failed is decided by
 *     the green bean, not by the cup nobody could judge.
 *  4. No grading data yet — park in review, exactly as the commodity route does.
 *  5. Everything passed: certify.
 *
 * Never write `if (!verdict.cupPassed)` anywhere in this flow. `strict: true`
 * does not forbid a nullable boolean in a truthy context and there is no
 * strict-boolean-expressions rule in this repo, so nothing but this function
 * keeps "cannot judge" from silently collapsing into "failed".
 */
export function decideCvaOutcome({
  verdict,
  complianceViolations,
  hasGradingData,
}: {
  verdict: CvaVerdict
  /** Green-bean violations from evaluateQualityCompliance; empty when not graded. */
  complianceViolations: string[]
  hasGradingData: boolean
}): CvaOutcome {
  const violations = [
    ...(verdict.cupPassed === false ? [verdict.reason] : []),
    ...complianceViolations,
  ]

  if (verdict.cupPassed === false) {
    return { decision: 'rejected', blocked: false, reason: verdict.reason, violations }
  }
  if (complianceViolations.length > 0) {
    return {
      decision: 'rejected',
      blocked: false,
      reason: 'Green bean grading is out of specification',
      violations,
    }
  }
  if (verdict.cupPassed === null) {
    return { decision: 'pending', blocked: true, reason: verdict.reason, violations }
  }
  if (!hasGradingData) {
    return {
      decision: 'pending',
      blocked: false,
      reason: 'Cup approved - awaiting green bean grading',
      violations,
    }
  }
  return { decision: 'approved', blocked: false, reason: verdict.reason, violations }
}
