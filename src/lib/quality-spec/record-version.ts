import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceRoleClient } from '@/lib/supabase-service'

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

/**
 * Record a Wolthers version for each client quality, one RPC call per id, in
 * order. The RPC is callable by the service role only. An RPC error is logged
 * with the quality id and rethrown; ids after it are not recorded.
 */
export async function recordStaffVersion(clientQualityIds: string[], userId: string, note?: string): Promise<void> {
  if (clientQualityIds.length === 0) return
  const admin = serviceRoleClient()
  for (const id of clientQualityIds) {
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
  }
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
