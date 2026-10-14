// src/lib/portal/staff-gate.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { accessKindForUser } from '@/lib/auth/access-kind'
import { portalServiceClient } from './qc-portal-gate'

/** Staff who manage client portal access from /clients/[id] (spec §6.1). */
const PORTAL_MANAGER_ROLES = new Set(['global_admin', 'global_quality_admin', 'lab_quality_manager'])

export function canManageClientPortal(profile: { qc_role: string | null; is_global_admin: boolean | null } | null): boolean {
  if (!profile) return false
  return profile.is_global_admin === true || PORTAL_MANAGER_ROLES.has(profile.qc_role ?? '')
}

export interface StaffContext {
  userId: string
  name: string
  admin: SupabaseClient<any>
}

export async function requirePortalStaff(): Promise<{ ok: true; ctx: StaffContext } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = portalServiceClient()
  let kind: Awaited<ReturnType<typeof accessKindForUser>>
  try {
    kind = await accessKindForUser(admin, user.id)
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Access check failed, please retry' }, { status: 503 }) }
  }
  if (kind !== 'staff') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('qc_role, is_global_admin, full_name, email')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    return { ok: false, response: NextResponse.json({ error: 'Access check failed, please retry' }, { status: 503 }) }
  }
  if (!canManageClientPortal(profile)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Only admins and lab admins manage client portal access' }, { status: 403 }),
    }
  }
  return { ok: true, ctx: { userId: user.id, name: profile?.full_name || profile?.email || 'Wolthers QC', admin } }
}
