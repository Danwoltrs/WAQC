import type { IssuedValues } from '@/lib/tolerance/issued-values'
import type { ToleranceItem } from '@/lib/tolerance/types'

/**
 * The sample_tolerance_approvals audit row written by
 * POST /api/samples/[id]/approve-with-comments. Lives here rather than in the
 * route because a route file may export only its handlers: `next build`
 * rejects any other export (see src/app/api/route-exports.test.ts).
 */
export interface DecisionRow {
  metrics: ToleranceItem[]
  issued_values: IssuedValues
  comments: string[]
  request_additional_sample: boolean
  decided_by: string
}

/** Pure: shape the audit row. */
export function buildDecision(args: {
  items: ToleranceItem[]
  issued: IssuedValues
  comments: string[]
  requestAdditionalSample: boolean
  userId: string
}): DecisionRow {
  return {
    metrics: args.items,
    issued_values: args.issued,
    comments: args.comments.map((c) => c.trim()).filter(Boolean),
    request_additional_sample: args.requestAdditionalSample,
    decided_by: args.userId,
  }
}
