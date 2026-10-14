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

/**
 * Staff first (a staff role AND qc_enabled === true), then external (any
 * user_profiles row of type external, any status), else none.
 */
export function classifyAccessKind(row: {
  userType: string | null
  qcRole: string | null
  qcEnabled: boolean | null
}): AccessKind {
  if (row.qcRole && !isExternalQcRole(row.qcRole) && row.qcEnabled === true) return 'staff'
  if (row.userType === 'external') return 'external'
  return 'none'
}

/** One RPC with the caller's own session (middleware). Throws on failure. */
export async function fetchAccessKind(supabase: SupabaseClient<any>): Promise<AccessKind> {
  const { data, error } = await supabase.rpc('waqc_access_kind')
  if (error) throw error
  return parseAccessKind(data)
}

/** The same answer for any user id, read with the service role. */
export async function accessKindForUser(admin: SupabaseClient<any>, userId: string): Promise<AccessKind> {
  const [{ data: userProfile }, { data: profile }] = await Promise.all([
    admin.from('user_profiles').select('user_type').eq('id', userId).maybeSingle(),
    admin.from('profiles').select('qc_role, qc_enabled').eq('id', userId).maybeSingle(),
  ])
  return classifyAccessKind({ userType: userProfile?.user_type ?? null, qcRole: profile?.qc_role ?? null, qcEnabled: profile?.qc_enabled ?? null })
}

export function resolveLandingPath(kind: AccessKind): '/portal' | '/dashboard' | '/auth/no-access' {
  if (kind === 'external') return '/portal'
  if (kind === 'staff') return '/dashboard'
  return '/auth/no-access'
}
