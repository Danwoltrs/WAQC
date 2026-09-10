import type { ToleranceAssessment } from './types'
import type { IssuedValues } from './issued-values'

export interface ToleranceForSample {
  /** The sample this assessment was fetched for. */
  sampleId: string
  assessment: ToleranceAssessment
  issued: IssuedValues | null
}

/**
 * Returns `state` only when it was fetched for the CURRENTLY active sample.
 *
 * A grading page keeps one in-flight (or just-resolved) tolerance fetch per
 * active sample. A bare `state && ...` truthiness check is not enough: if the
 * grader switches from sample A to sample B before A's fetch state has been
 * cleared or B's fetch has resolved, that stale state is still non-null and
 * still describes A. Rendering it against B's tab would show A's banner on
 * B's screen, and worse, seed the confirm dialog's Portuguese comment lines
 * from A's screen/defect numbers while the confirm handler posts to B —
 * approving B correctly but recording (and later emailing) improvement
 * instructions that describe a different lot.
 *
 * Comparing `sampleId` rather than relying on timing (clearing state on
 * every sample change) is what makes this correct regardless of how slow or
 * out-of-order the network responses are: even if a slow fetch for A
 * resolves AFTER the grader has switched to B, the resulting state still
 * carries `sampleId: 'A'` and is rejected here.
 */
export function toleranceForSample(
  state: ToleranceForSample | null,
  activeSampleId: string,
): ToleranceForSample | null {
  if (!state) return null
  return state.sampleId === activeSampleId ? state : null
}
