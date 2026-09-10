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
