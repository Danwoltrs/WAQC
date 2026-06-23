// src/lib/portal/portal-auth.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export function isClientRole(qcRole: string | null | undefined): boolean {
  return qcRole === 'client'
}

export function resolveLandingPath(qcRole: string | null | undefined): string {
  return isClientRole(qcRole) ? '/portal' : '/dashboard'
}

export interface PortalCompany {
  clientId: string
  qcRole: string
  fullName: string | null
}

/** Resolve the authenticated user's portal company, or null if they are not a
 *  client-role user linked to a company. */
export async function getPortalCompany(
  supabase: SupabaseClient,
  userId: string,
): Promise<PortalCompany | null> {
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('qc_role, client_id, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (!profile || !isClientRole(profile.qc_role) || !profile.client_id) return null
  return { clientId: profile.client_id, qcRole: profile.qc_role, fullName: profile.full_name ?? null }
}

/** Route guard: resolve the authenticated user's portal company, or return a
 *  ready-to-send error response (401 no user / 403 not a client / no company). */
export async function requirePortalCompany(
  supabase: SupabaseClient,
): Promise<{ company: PortalCompany } | { error: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const company = await getPortalCompany(supabase, user.id)
  if (!company) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { company }
}
