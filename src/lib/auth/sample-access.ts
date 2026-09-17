/**
 * Authorization helpers for sample-scoped operations.
 *
 * Used by `/api/samples/[id]/recipients` and `/api/samples/[id]/send-to-recipients`
 * — and any future route that mutates per-sample state — so that being merely
 * authenticated isn't enough: the caller must either be Wolthers staff with a
 * sample-management role, or be bound to the owning client/lab.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * QC roles allowed to manage Other Sample recipients and trigger sample emails.
 * Derived from the roles already enforced by existing RLS policies on samples.
 */
const STAFF_SAMPLE_MANAGER_ROLES = new Set([
  'global_admin',
  'global_quality_admin',
  'lab_quality_manager',
  'lab_personnel',
])

/** External (portal) roles: everyone else with a role is Wolthers lab staff. */
const EXTERNAL_ROLES = new Set(['client', 'supplier', 'buyer'])

/**
 * Whether a profile belongs to an internal lab user: a global admin, or any
 * QC role that is not an external portal role. This is the audience that may
 * delete a sample (2026-09-17: any lab user, regardless of who created it —
 * deletion is soft and audited, so the gate is the role, not admin-ness).
 * Mirrors the samples UPDATE policy (20260610000000), which is what actually
 * carries the soft-delete write.
 */
export function isInternalStaffProfile(
  profile: { qc_role?: string | null; is_global_admin?: boolean | null } | null | undefined,
): boolean {
  if (!profile) return false
  if (profile.is_global_admin === true) return true
  return typeof profile.qc_role === 'string' && profile.qc_role !== '' && !EXTERNAL_ROLES.has(profile.qc_role)
}

export async function isInternalStaff(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('is_global_admin, qc_role')
    .eq('id', userId)
    .maybeSingle()
  return isInternalStaffProfile(profile)
}

export type SampleAccessReason =
  | 'profile_not_found'
  | 'sample_not_found'
  | 'not_authorized'

export interface SampleAccessResult {
  allowed: boolean
  reason?: SampleAccessReason
}

/**
 * Returns `{ allowed: true }` when the user is authorized to manage `sampleId`.
 *
 * Authorization rules (first match wins):
 *   1. `profiles.is_global_admin = true`            → allow
 *   2. `profiles.qc_role IN STAFF_SAMPLE_MANAGER_ROLES` → allow
 *   3. User's `profiles.client_id` matches the sample's `client_id` or
 *      `end_client_id`                              → allow
 *   4. User's `profiles.laboratory_id` matches the sample's `laboratory_id`
 *                                                   → allow
 *   5. Otherwise                                     → deny
 *
 * This is application-layer defence; tighten the RLS policies on
 * `sample_recipients` and `samples` to enforce the same rule for direct DB
 * access (defence in depth).
 */
export async function canUserManageSample(
  supabase: SupabaseClient,
  userId: string,
  sampleId: string,
): Promise<SampleAccessResult> {
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('id, qc_role, is_global_admin, laboratory_id, client_id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return { allowed: false, reason: 'profile_not_found' }

  if (profile.is_global_admin === true) return { allowed: true }
  if (typeof profile.qc_role === 'string' && STAFF_SAMPLE_MANAGER_ROLES.has(profile.qc_role)) {
    return { allowed: true }
  }

  const { data: sample } = await (supabase as any)
    .from('samples')
    .select('client_id, end_client_id, laboratory_id')
    .eq('id', sampleId)
    .maybeSingle()

  if (!sample) return { allowed: false, reason: 'sample_not_found' }

  const matchesClient =
    profile.client_id != null &&
    (sample.client_id === profile.client_id || sample.end_client_id === profile.client_id)
  const matchesLab =
    profile.laboratory_id != null && sample.laboratory_id === profile.laboratory_id

  return matchesClient || matchesLab
    ? { allowed: true }
    : { allowed: false, reason: 'not_authorized' }
}

/**
 * Sample-id-free gate for staff-only batch operations (e.g. the certificates
 * batch-send queue): true when the user is a global admin or holds one of the
 * sample-manager QC roles. Per-sample authorization is still enforced at send
 * time via `canUserManageSample`.
 */
export async function isStaffSampleManager(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('is_global_admin, qc_role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return false
  if (profile.is_global_admin === true) return true
  return typeof profile.qc_role === 'string' && STAFF_SAMPLE_MANAGER_ROLES.has(profile.qc_role)
}
