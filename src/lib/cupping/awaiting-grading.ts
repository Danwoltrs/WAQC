/**
 * The grading half of a lot's certificate, as the screens need to read it.
 *
 * Every certificate needs both halves: the cup (commodity validation or the
 * CVA journey's Certify step) and the green-bean grading. When the cup is
 * finalized first, the finalize routes answer 'pending' and leave the lot at
 * workflow_stage 'review' (applyDecision walks it there and stops), and the
 * certificate is minted when someone FINALIZES the grading (a Save only saves:
 * a lot certified on a screen-size-only save, 2026-10-05). Nothing showed that
 * state: the tracker said "In progress", the journey looked undecided after a
 * reload, and a specialty lot never even reached the grading queue.
 */

export interface StageAndStatus {
  status?: string | null
  workflow_stage?: string | null
}

/** Cupping finalized, certificate waiting on grading — either protocol. */
export function isAwaitingGrading(s: StageAndStatus): boolean {
  return s.workflow_stage === 'review' && s.status !== 'approved' && s.status !== 'rejected'
}

export interface GradingState {
  /** The cup verdict recorded at Certify (quality_assessments.cva_passed); null = not judged yet. */
  cup_passed: boolean | null
  /** True until green-bean grading is finalized for the lot. */
  grading_pending: boolean
}

/**
 * Whether the lot's green-bean grading is finished. Only the explicit
 * Finalize grading act counts (quality_assessments.grading_finalized_at);
 * saved green_bean_data is work in progress, however much of it there is.
 */
export function isGradingFinalized(
  row: { grading_finalized_at?: string | null } | null | undefined,
): boolean {
  return typeof row?.grading_finalized_at === 'string' && row.grading_finalized_at !== ''
}

/** What a lot's quality_assessments row says about its grading half; no row = nothing yet. */
export function gradingStateFor(
  row: { cva_passed?: boolean | null; grading_finalized_at?: string | null } | null | undefined,
): GradingState {
  return { cup_passed: row?.cva_passed ?? null, grading_pending: !isGradingFinalized(row) }
}
