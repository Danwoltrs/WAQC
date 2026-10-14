// src/app/api/portal/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { accessKindForUser, type AccessKind } from '@/lib/auth/access-kind'
import { isUuid, portalServiceClient } from '@/lib/portal/qc-portal-gate'
import { buildExternalMe, type PortalMe } from '@/lib/portal/portal-me'
import { loadCompanyName } from '@/lib/portal/invite-service'
import { QC_VIEWS } from '@/lib/portal/qc-keys'
import { serverError } from '@/lib/portal/route-errors'

/**
 * Who is using the portal, and the companies and keys they have there. It
 * resolves the caller's kind itself instead of running requireQcPortal: it is
 * the call that tells the shell which companies exist.
 */
export async function GET(request: NextRequest) {
  try {
    return await meHandler(request)
  } catch (error) {
    return serverError(error)
  }
}

async function meHandler(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = portalServiceClient()
  let kind: AccessKind
  try {
    kind = await accessKindForUser(admin, user.id)
  } catch (err) {
    console.error('portal me: access kind failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Access check failed, please retry' }, { status: 503 })
  }

  if (kind === 'external') {
    const [profileRead, accessRead] = await Promise.all([
      admin.from('user_profiles').select('full_name, email, status').eq('id', user.id).maybeSingle(),
      admin
        .from('qc_portal_access')
        .select('company_id, views, capabilities, companies(id, name, fantasy_name)')
        .eq('user_id', user.id),
    ])
    if (profileRead.error || accessRead.error) {
      console.error('portal me: read failed', profileRead.error?.message ?? accessRead.error?.message)
      return NextResponse.json({ error: 'Access check failed' }, { status: 500 })
    }
    const profile = profileRead.data
    const rows = accessRead.data
    if (profile?.status !== 'active') return NextResponse.json({ error: 'Your access is not active' }, { status: 403 })
    const me = buildExternalMe({ full_name: profile?.full_name ?? null, email: profile?.email ?? user.email ?? null }, rows ?? [])
    if (me.companies.length === 0) return NextResponse.json({ error: 'No QC portal access' }, { status: 403 })
    return NextResponse.json(me)
  }

  if (kind === 'staff') {
    const rawCompanyId = request.nextUrl.searchParams.get('company') ?? ''
    if (!isUuid(rawCompanyId)) return NextResponse.json({ error: 'Choose a company' }, { status: 400 })
    const companyId = rawCompanyId.toLowerCase()
    const name = await loadCompanyName(admin, companyId)
    if (!name) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    const { data: profile, error: profileError } = await admin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
    if (profileError) console.error('portal me: staff profile read failed', profileError.message)
    const me: PortalMe = {
      kind: 'staff',
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? user.email ?? null,
      companies: [{ id: companyId, name, keys: { views: [...QC_VIEWS], capabilities: [] }, isCompanyAdmin: false }],
      viewAs: true,
    }
    return NextResponse.json(me)
  }

  return NextResponse.json({ error: 'No access' }, { status: 403 })
}
