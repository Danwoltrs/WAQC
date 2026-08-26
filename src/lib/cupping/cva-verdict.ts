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
 * The customer-facing rejection reason for a lot a human overrode to rejected.
 *
 * Word-for-word the string the commodity route stamps for its own manual
 * rejection (src/app/api/cupping/finalize/route.ts), so a buyer scanning a QR
 * code sees one house sentence whichever table the lot was cupped on.
 */
export const OVERRIDE_REJECTION_VIOLATION = 'Manual rejection by cupper'

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
  // What the CERTIFICATE says, which is not always what the cupper was told.
  //
  // For an auto rejection `verdict.reason` is already a good customer-facing
  // sentence ("CVA score 83.75 is below the 84 pass mark"). For an OVERRIDE it
  // is the cupper's raw free text, answering CertifyStep's internal prompt
  // ("Why does this decision override the cup's own reading?") — and
  // `violations` is published: the route stamps it on
  // `certificates.compliance_violations`, which the public QR page prints
  // verbatim as the verdict reason (certificate-checklist.ts's
  // resolveVerdictReasons). An internal note must never become the reason the
  // buyer reads, so an override contributes the same fixed string the
  // commodity route stamps. The free text is not lost: it is persisted to
  // `quality_assessments.cva_override_comment`.
  const violations = [
    ...(verdict.cupPassed === false
      ? [verdict.source === 'override' ? OVERRIDE_REJECTION_VIOLATION : verdict.reason]
      : []),
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

/**
 * Did anyone actually assess this cup?
 *
 * NOT the same question as "is there an assessment blob". `cupping_scores.scores`
 * is `JSONB NOT NULL DEFAULT '{}'`, and the CVA journey autosaves on the first
 * EDIT of a lot — not on mount: `useCvaSession`'s `update()` seeds the draft
 * from `createEmptyAssessment()` and debounces a PUT 700ms later (and
 * `flushAll` commits it on tab switch or unmount). Since the first edit can be
 * something that scores nothing at all — picking a roast level on step 0 —
 * the realistic "nobody cupped this" row is a present, well-formed blob with no
 * scored sections. Testing for the blob's presence passes that row straight
 * through, and `cvaCupIntegrity` then reports zero non-uniform and zero
 * defective cups — persisting "clean and uniform" for a lot nobody tasted.
 *
 * A section counts as assessed when it carries an impression (initial or
 * cooled-final). Cup flags alone are not an assessment: flagging a defective cup
 * without scoring anything says nothing about the other cups.
 */
export function cupWasAssessed(
  assessment: Pick<CvaAssessment, 'sections' | 'cups'> | null | undefined,
): assessment is Pick<CvaAssessment, 'sections' | 'cups'> {
  if (!assessment) return false
  return computeAssessmentScore(assessment).count > 0
}

/**
 * Which of a session's CVA rows speaks for the lot.
 *
 * The master cupper's row is authoritative, exactly as it is on the commodity
 * side (see finalize-pipeline.ts's closeSessionIfComplete, and how
 * certificate-data.ts reads the master cupper's resolved defects). Newest-wins
 * is only the fallback, for a session with no master cupper designated or one
 * where the master has not cupped this lot.
 *
 * Newest-wins alone would let a colleague's half-finished autosave overwrite a
 * complete assessment: cupper A scores the lot 88.75, cupper B opens it and
 * autosaves an empty one, B's row is newest, its `cva_score` is null, and a
 * passing lot is reported unjudgeable.
 *
 * `rows` MUST already be ordered newest-first — the caller orders by
 * `updated_at desc` in the query, so the fallback is simply the first row.
 */
export function pickAuthoritativeCvaRow<T extends { cupper_id?: string | null }>(
  rows: T[],
  masterCupperId: string | null,
): T | null {
  if (rows.length === 0) return null
  if (masterCupperId) {
    const masterRow = rows.find((r) => r.cupper_id === masterCupperId)
    if (masterRow) return masterRow
  }
  return rows[0]
}

export interface CvaAssessmentFieldsInput {
  /** The authoritative row's parsed `cva_score`, or null when nothing was scored. */
  cvaScore: number | null
  /** The pass mark that applied, or null when the quality configures none. */
  cvaMinScore: number | null
  /** What `decideCvaVerdict` concluded from those two plus the override. */
  verdict: CvaVerdict
  /** The human override, if one was submitted. */
  override: CvaOverride | null
  /** The authoritative row's assessment blob, for cup integrity. */
  assessment: Pick<CvaAssessment, 'sections' | 'cups'> | null
  /**
   * The existing `quality_assessments` row's `clean_cup`, or null when there is
   * no row yet (an insert) or the column was never set.
   */
  existingCleanCup: boolean | null
  /** Ditto for `uniform_cup`. */
  existingUniformCup: boolean | null
  /** `profiles.id` of the acting user — stamped only alongside an override. */
  overrideBy: string
  /** ISO timestamp — stamped only alongside an override. */
  overrideAt: string
}

/**
 * Which `quality_assessments` columns a specialty finalize actually writes.
 *
 * A finalize is not always an assertion about the cup, so every column here is
 * omitted unless THIS call has real evidence for it. Omitting is meaningful on
 * both branches the route uses: left null on an insert, and left ALONE on an
 * update rather than clobbering a value already on an issued certificate.
 *
 *  - The `cva_*` triad is written only when the authoritative row carried a
 *    score, or a human supplied an override. Writing it unconditionally is how
 *    an issued certificate loses its verdict: a lot certified at 88.75 in a
 *    two-lot session, re-opened alone from the picker, gets a FRESH session
 *    (the sample set differs), and picking a roast level there persists an
 *    unscored CVA row. That row passes the finalize gate, resolves no score,
 *    decides `pending` and mints nothing — but would still write
 *    `cva_score: null, cva_passed: null` over the certified values. PDFs
 *    regenerate on the fly, so every later send of that certificate would
 *    print no score and "Could not be judged" for a lot that scored 88.75.
 *
 *  - `clean_cup`/`uniform_cup` are written only when the cup was actually
 *    ASSESSED (see `cupWasAssessed` — a present, well-formed, entirely
 *    unscored blob is the realistic "nobody cupped this") AND only when the
 *    column is still null. That second guard is the commodity route's own
 *    (`existingQA.clean_cup === null` in api/cupping/finalize/route.ts) and it
 *    exists to preserve a human correction: a lab user who sets "Clean cup" to
 *    No in the cert editor must not have it silently restored. The specialty
 *    flow makes this routine rather than exotic — certifying normally takes
 *    TWO Certify passes (pass 1 parks pending awaiting grading, pass 2 runs
 *    once grading lands), and a correction made between them has to survive.
 *    Commodity also mirrors the derived values into `clean_cup_auto` /
 *    `uniform_cup_auto`; nothing reads those on the specialty rail, so they are
 *    deliberately not written here.
 *
 *  - The four `cva_override_*` columns are written as a unit or not at all.
 */
export function buildCvaAssessmentFields({
  cvaScore,
  cvaMinScore,
  verdict,
  override,
  assessment,
  existingCleanCup,
  existingUniformCup,
  overrideBy,
  overrideAt,
}: CvaAssessmentFieldsInput): Record<string, unknown> {
  const cupIntegrity = cupWasAssessed(assessment) ? cvaCupIntegrity(assessment) : null
  const hasCupVerdict = cvaScore !== null || override !== null
  return {
    ...(hasCupVerdict
      ? {
          cva_score: cvaScore,
          cva_min_score: cvaMinScore,
          // boolean | null — null records "the cup could not be judged", which
          // is not the same claim as "the cup failed".
          cva_passed: verdict.cupPassed,
        }
      : {}),
    ...(cupIntegrity && existingCleanCup === null ? { clean_cup: cupIntegrity.cleanCup } : {}),
    ...(cupIntegrity && existingUniformCup === null ? { uniform_cup: cupIntegrity.uniformCup } : {}),
    ...(override
      ? {
          cva_override_decision: override.decision,
          cva_override_comment: override.comment,
          cva_override_by: overrideBy,
          cva_override_at: overrideAt,
        }
      : {}),
  }
}
