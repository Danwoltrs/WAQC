import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceRoleClient } from '@/lib/supabase-service'
import { sendSpecChangeEmail } from '@/lib/portal/spec-change-email'
import { specToday } from './pick-version'
import { WOLTHERS_CANCEL_NOTE } from './types'

/**
 * Staff writes to a client quality's spec record a dated version
 * (client_quality_versions, migration 20261111000001), so new lots pick the new
 * spec and lots already pinned keep theirs.
 *
 * Routes call recordStaffVersion AFTER their write succeeded, whenever the
 * write names a spec field, changed or not. The RPC snapshots the live rows and
 * dedupes: when the snapshot equals the latest applied version it records
 * nothing and returns that version. So a failed recording ("Saved, but the spec
 * version could not be recorded. Please save again.") heals on the re-save even
 * though the live row already holds the new values, and a no-op save adds no
 * version.
 */

/** The error a route returns when its write succeeded but the version was not recorded. */
export const SPEC_VERSION_NOT_RECORDED = 'Saved, but the spec version could not be recorded. Please save again.'

/** A client's scheduled change that a staff save cancelled (R33). */
export interface CancelledClientChange {
  versionId: string
  clientQualityId: string
  versionNo: number
  effectiveFrom: string
}

interface PendingRow {
  id: string
  version_no: number
  effective_from: string
  cancelled_at?: string | null
  cancel_note?: string | null
}

/**
 * The client's pending versions dated after today: the ones the RPC cancels.
 * A read error is logged and answered with none: the notice is best-effort and
 * never fails a save that already succeeded.
 */
async function futureClientVersions(admin: SupabaseClient<any>, clientQualityId: string): Promise<PendingRow[]> {
  try {
    const { data, error } = await admin
      .from('client_quality_versions')
      .select('id, version_no, effective_from')
      .eq('client_quality_id', clientQualityId)
      .eq('source', 'client')
      .is('applied_at', null)
      .is('cancelled_at', null)
      .gt('effective_from', specToday())
    if (error) throw error
    return (data ?? []) as PendingRow[]
  } catch (error) {
    console.error(`[spec-versions] could not read the scheduled client changes of client quality ${clientQualityId}:`, error)
    return []
  }
}

/** Of `before`, the versions the RPC just cancelled (its cancel note, not a client's own cancel). */
async function cancelledByThisSave(admin: SupabaseClient<any>, before: PendingRow[]): Promise<PendingRow[]> {
  if (before.length === 0) return []
  try {
    const { data, error } = await admin
      .from('client_quality_versions')
      .select('id, version_no, effective_from, cancelled_at, cancel_note')
      .in('id', before.map((v) => v.id))
    if (error) throw error
    return ((data ?? []) as PendingRow[]).filter((v) => v.cancelled_at && v.cancel_note === WOLTHERS_CANCEL_NOTE)
  } catch (error) {
    console.error('[spec-versions] could not read which scheduled client changes were cancelled:', error)
    return []
  }
}

/**
 * Record a Wolthers version for each client quality, one RPC call per id, in
 * order. The RPC is callable by the service role only. An RPC error is logged
 * with the quality id and rethrown; ids after it are not recorded.
 *
 * The RPC cancels a client's change scheduled after today (plan call #2,
 * R33). Each one this save cancelled is emailed to head office and the labs
 * (sendSpecChangeEmail sends the cancellation; it never throws) and returned,
 * so the route can tell staff.
 */
export async function recordStaffVersion(
  clientQualityIds: string[],
  userId: string,
  note?: string,
): Promise<{ cancelledClientChanges: CancelledClientChange[] }> {
  const cancelledClientChanges: CancelledClientChange[] = []
  if (clientQualityIds.length === 0) return { cancelledClientChanges }
  const admin = serviceRoleClient()
  for (const id of clientQualityIds) {
    const before = await futureClientVersions(admin, id)
    const { error } = await admin.rpc('record_client_quality_version', {
      p_client_quality_id: id,
      p_source: 'wolthers',
      p_user: userId,
      p_note: note ?? null,
    })
    if (error) {
      console.error(`[spec-versions] could not record a version for client quality ${id}:`, error)
      throw error
    }
    for (const v of await cancelledByThisSave(admin, before)) {
      cancelledClientChanges.push({ versionId: v.id, clientQualityId: id, versionNo: v.version_no, effectiveFrom: v.effective_from })
      if (!(await sendSpecChangeEmail(v.id, admin))) console.error('[spec-versions] cancellation email not sent', v.id)
    }
  }
  return { cancelledClientChanges }
}

/** What a staff route returns about them: the lab UI shows each (no ids). */
export function cancelledChangesForResponse(
  recorded: { cancelledClientChanges?: CancelledClientChange[] } | void | undefined,
): Array<{ versionNo: number; effectiveFrom: string }> {
  return (recorded?.cancelledClientChanges ?? []).map(({ versionNo, effectiveFrom }) => ({ versionNo, effectiveFrom }))
}

/**
 * The client qualities a template edit changes: every client quality on the
 * template when it is a client's private copy (is_client_variant), none for a
 * base template, whose edits no longer reach any client.
 */
export async function clientQualityIdsForTemplate(admin: SupabaseClient<any>, templateId: string): Promise<string[]> {
  const { data: template, error } = await admin
    .from('quality_templates')
    .select('id, is_client_variant')
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw error
  if (!(template as { is_client_variant?: boolean } | null)?.is_client_variant) return []

  const { data: rows, error: rowsError } = await admin
    .from('client_qualities')
    .select('id')
    .eq('template_id', templateId)
  if (rowsError) throw rowsError
  return ((rows ?? []) as Array<{ id: string }>).map((r) => r.id)
}

/** The client_qualities columns a spec version carries (client_quality_spec_snapshot). */
export const CLIENT_QUALITY_SPEC_FIELDS = ['template_id', 'cups_per_sample', 'discrepancy_threshold', 'custom_parameters'] as const

/**
 * True when the write names one of `fields` (any value, changed or not): the
 * route then records a version and the RPC decides whether anything changed.
 */
export function specFieldsPresent(update: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.some((f) => update[f] !== undefined)
}
