import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLabSourceId } from '@/lib/sample-group'
import type { IssuedValues } from './issued-values'

export interface ToleranceApproval {
  issued_values: IssuedValues
  metrics: unknown[]
  comments: unknown[]
  request_additional_sample: boolean
  decided_at: string
}

/**
 * Is this lot CURRENTLY an approved-with-comments lot?
 *
 * `sample_tolerance_approvals` is append-only and nothing ever clears it, so a
 * row's mere existence is not a live signal. `samples.approved_with_comments`
 * is: it is written group-wide beside `status = 'approved'` by the tolerance
 * decision, and an ordinary re-approval of a re-graded lot leaves it false. The
 * flag is therefore the switch and the row is only the payload — without this
 * check a lot approved with comments at 30.0%, re-graded to a genuinely in-spec
 * 34% and approved normally would keep printing 30.0% on the buyer's PDF and QR
 * page forever. It also defuses the compensating-delete residual in
 * POST /api/samples/[id]/approve-with-comments: an orphaned row left behind by
 * a failed rollback belongs to a sample that was never approved, so its flag is
 * false and it can no longer shadow a later ordinary approval.
 *
 * Fails CLOSED in every uncertain case — a missing column (the migration is
 * unapplied everywhere today), a missing row, any query error — because the
 * uncertain answer here is "show the buyer the raw measured values", which is
 * exactly the behaviour that predates this feature.
 */
async function isApprovedWithComments(db: SupabaseClient<any>, labSourceId: string): Promise<boolean> {
  const { data, error } = await db
    .from('samples')
    .select('approved_with_comments')
    .eq('id', labSourceId)
    .maybeSingle()
  if (error || !data) return false
  return (data as Record<string, unknown>).approved_with_comments === true
}

/**
 * The tolerance decision for a lot, or null.
 *
 * Decisions are keyed on the LAB-SOURCE sample: a contract sibling has no
 * grading of its own, so reading its own id would show a sibling certificate
 * raw values while the lab unit's certificate showed issued ones.
 *
 * `labSourceId` may be passed when the caller already resolved it, which every
 * certificate path has done by the time it gets here.
 */
export async function fetchToleranceApproval(
  db: SupabaseClient<any>,
  sampleId: string,
  labSourceId?: string,
): Promise<ToleranceApproval | null> {
  const id = labSourceId ?? (await resolveLabSourceId(db, sampleId))
  if (!(await isApprovedWithComments(db, id))) return null
  const { data, error } = await db
    .from('sample_tolerance_approvals')
    .select('issued_values, metrics, comments, request_additional_sample, decided_at')
    .eq('sample_id', id)
    .order('decided_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  const row = data[0] as Record<string, unknown>
  return {
    issued_values: (row.issued_values as IssuedValues) ?? { screen_percentages: null, defects: null },
    metrics: (row.metrics as unknown[]) ?? [],
    comments: (row.comments as unknown[]) ?? [],
    request_additional_sample: !!row.request_additional_sample,
    decided_at: String(row.decided_at ?? ''),
  }
}

/**
 * The issued values ALONE, for buyer-facing and public surfaces.
 *
 * The stored row keeps the seller's comments and the raw out-of-spec metrics
 * beside the buyer-safe issued values. The public certificate page is
 * server-side but UNAUTHENTICATED and queries with the service role, so RLS is
 * no backstop there — anything the query returns is one render mistake away
 * from a buyer. Selecting only `issued_values` makes the feature's central
 * promise (the buyer never sees the comments or the real numbers) a property of
 * the query rather than a discipline in the template.
 *
 * Internal surfaces that legitimately need the comments use
 * fetchToleranceApproval instead.
 */
export async function fetchIssuedValues(
  db: SupabaseClient<any>,
  sampleId: string,
  labSourceId?: string,
): Promise<IssuedValues | null> {
  const id = labSourceId ?? (await resolveLabSourceId(db, sampleId))
  if (!(await isApprovedWithComments(db, id))) return null
  const { data, error } = await db
    .from('sample_tolerance_approvals')
    .select('issued_values')
    .eq('sample_id', id)
    .order('decided_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  const row = data[0] as Record<string, unknown>
  return (row.issued_values as IssuedValues) ?? { screen_percentages: null, defects: null }
}
