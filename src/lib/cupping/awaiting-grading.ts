/**
 * The grading half of a lot's certificate, as the screens need to read it.
 *
 * Every certificate needs both halves: the cup (commodity validation or the
 * CVA journey's Certify step) and the green-bean grading. When the cup is
 * finalized first, the finalize routes answer 'pending' and leave the lot at
 * workflow_stage 'review' (applyDecision walks it there and stops), and the
 * certificate is minted the moment grading is saved. Nothing showed that
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
  /** True until green-bean grading is saved for the lot. */
  grading_pending: boolean
}

/** What a lot's quality_assessments row says about its grading half; no row = nothing yet. */
export function gradingStateFor(
  row: { cva_passed?: boolean | null; green_bean_data?: unknown } | null | undefined,
): GradingState {
  return { cup_passed: row?.cva_passed ?? null, grading_pending: !row?.green_bean_data }
}
