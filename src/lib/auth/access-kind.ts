// src/lib/auth/access-kind.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { isExternalQcRole } from './new-profile'

/**
 * How WAQC treats a signed-in caller (spec §4). The same rule is the SQL
 * function waqc_access_kind() (migration 20261014000001); keep them equal.
 */
export type AccessKind = 'staff' | 'external' | 'none'

export function parseAccessKind(value: unknown): AccessKind {
  return value === 'staff' || value === 'external' ? value : 'none'
}

const GLOBAL_QC_ROLES: readonly string[] = ['global_admin', 'global_quality_admin']

/**
 * A disabled sys account (user_profiles.status 'disabled', sys's kill switch)
 * is none, checked first. Then staff: is_global_admin, or a staff role (not
 * client/supplier/buyer) with qc_enabled === true or a global role (global
 * admins are not reliably qc_enabled on the live database). Then external (a
 * user_profiles row of type external, any other status), else none.
 */
export function classifyAccessKind(row: {
  userType: string | null
  userStatus: string | null
  qcRole: string | null
  qcEnabled: boolean | null
  isGlobalAdmin: boolean | null
}): AccessKind {
  if (row.userStatus === 'disabled') return 'none'
  const role = row.qcRole
  // Same as SQL: qc_role IS NOT NULL AND qc_role NOT IN ('client', 'supplier', 'buyer').
  const staffRole = role !== null && !isExternalQcRole(role)
  if (row.isGlobalAdmin === true || (staffRole && (row.qcEnabled === true || GLOBAL_QC_ROLES.includes(role)))) {
    return 'staff'
  }
  if (row.userType === 'external') return 'external'
  return 'none'
}

/** One RPC with the caller's own session (middleware). Throws on failure. */
export async function fetchAccessKind(supabase: SupabaseClient<any>): Promise<AccessKind> {
  const { data, error } = await supabase.rpc('waqc_access_kind')
  if (error) throw error
  return parseAccessKind(data)
}

/**
 * The same answer for any user id, read with the service role. Fails closed:
 * a failed read throws rather than deciding on missing data.
 */
export async function accessKindForUser(admin: SupabaseClient<any>, userId: string): Promise<AccessKind> {
  const [userProfileRead, profileRead] = await Promise.all([
    admin.from('user_profiles').select('user_type, status').eq('id', userId).maybeSingle(),
    admin.from('profiles').select('qc_role, qc_enabled, is_global_admin').eq('id', userId).maybeSingle(),
  ])
  if (userProfileRead.error) throw new Error(`access kind: user_profiles read failed: ${userProfileRead.error.message}`)
  if (profileRead.error) throw new Error(`access kind: profiles read failed: ${profileRead.error.message}`)
  const userProfile = userProfileRead.data
  const profile = profileRead.data
  return classifyAccessKind({
    userType: userProfile?.user_type ?? null,
    userStatus: userProfile?.status ?? null,
    qcRole: profile?.qc_role ?? null,
    qcEnabled: profile?.qc_enabled ?? null,
    isGlobalAdmin: profile?.is_global_admin ?? null,
  })
}

export function resolveLandingPath(kind: AccessKind): '/portal' | '/dashboard' | '/auth/no-access' {
  if (kind === 'external') return '/portal'
  if (kind === 'staff') return '/dashboard'
  return '/auth/no-access'
}
