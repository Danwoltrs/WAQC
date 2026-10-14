// src/lib/portal/qc-portal-gate.ts
import { NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { accessKindForUser, type AccessKind } from '@/lib/auth/access-kind'
import {
  QC_MANAGE_USERS, QC_VIEWS, hasQcView, isCompanyAdmin, qcKeysOf,
  type QcCapability, type QcKeySet, type QcView,
} from './qc-keys'

/**
 * The one gate in front of every /api/portal/* data and team route (spec
 * §7.1). The company comes from `?company=` and is always checked against
 * the caller's rows in qc_portal_access, WAQC's own table (one row per
 * person and company, qc_ keys only; ruling R11). sys's company grants play
 * no part: they neither open nor close the QC portal. Nothing else from the
 * request names a company. Data is then read with the service role,
 * filtered by ctx.companyId.
 */

export interface QcAccessRow {
  company_id: string
  views: string[] | null
  capabilities: string[] | null
}

export interface PortalNeed {
  view?: QcView
  capability?: QcCapability | typeof QC_MANAGE_USERS
  write?: boolean
}

export type PortalAccessDecision =
  | { ok: true; companyId: string; keys: QcKeySet; isCompanyAdmin: boolean; isStaffViewAs: boolean }
  | { ok: false; status: 400 | 401 | 403; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

function fail(status: 400 | 401 | 403, error: string): PortalAccessDecision {
  return { ok: false, status, error }
}

export function evaluatePortalAccess(input: {
  signedIn: boolean
  kind: AccessKind
  userStatus: string | null
  requestedCompanyId: string | null
  access: QcAccessRow[]
  need: PortalNeed
}): PortalAccessDecision {
  if (!input.signedIn) return fail(401, 'Unauthorized')
  const { need } = input
  if (input.requestedCompanyId !== null && !isUuid(input.requestedCompanyId)) return fail(400, 'Invalid company')
  const requested = input.requestedCompanyId === null ? null : input.requestedCompanyId.toLowerCase()

  if (input.kind === 'staff') {
    if (need.write || need.capability) return fail(403, 'The staff view of the portal is read-only')
    if (!requested) return fail(400, 'Choose a company')
    return {
      ok: true,
      companyId: requested,
      keys: { views: [...QC_VIEWS], capabilities: [] },
      isCompanyAdmin: false,
      isStaffViewAs: true,
    }
  }

  if (input.kind !== 'external') return fail(403, 'No access')
  if (input.userStatus !== 'active') return fail(403, 'Your access is not active')

  // A row opens the portal only with at least one QC view.
  const open = input.access.filter(hasQcView)
  let row: QcAccessRow | undefined
  if (requested) {
    row = open.find((r) => r.company_id === requested)
    if (!row) return fail(403, 'No access to this company')
  } else if (open.length === 1) {
    row = open[0]
  } else if (open.length === 0) {
    return fail(403, 'No QC portal access')
  } else {
    return fail(400, 'Choose a company')
  }

  const keys = qcKeysOf(row)
  const admin = isCompanyAdmin(row)
  if (need.view && !keys.views.includes(need.view)) return fail(403, 'This page is not part of your access')
  if (need.capability === QC_MANAGE_USERS) {
    if (!admin) return fail(403, 'Only company admins can do this')
  } else if (need.capability && !keys.capabilities.includes(need.capability)) {
    return fail(403, 'This action is not part of your access')
  }
  return { ok: true, companyId: row.company_id, keys, isCompanyAdmin: admin, isStaffViewAs: false }
}

export function portalServiceClient(): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role is not configured')
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface QcPortalContext {
  userId: string
  companyId: string
  keys: QcKeySet
  isCompanyAdmin: boolean
  isStaffViewAs: boolean
  admin: SupabaseClient<any>
}

function refuse(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

export async function requireQcPortal(
  request: Request,
  need: PortalNeed = {},
): Promise<{ ok: true; ctx: QcPortalContext } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return refuse(401, 'Unauthorized')

  const rawCompany = new URL(request.url).searchParams.get('company')
  if (rawCompany !== null && !isUuid(rawCompany)) return refuse(400, 'Invalid company')
  const requestedCompanyId = rawCompany === null ? null : rawCompany.toLowerCase()

  // The staff view is read-only by HTTP method, whatever a route declares.
  const method = request.method.toUpperCase()
  const effectiveNeed: PortalNeed = method === 'GET' || method === 'HEAD' ? need : { ...need, write: true }

  const admin = portalServiceClient()

  let kind: AccessKind
  try {
    kind = await accessKindForUser(admin, user.id)
  } catch (err) {
    console.error('portal gate: access kind failed', err instanceof Error ? err.message : err)
    return refuse(503, 'Access check failed, please retry')
  }

  let userStatus: string | null = null
  let access: QcAccessRow[] = []
  if (kind === 'external') {
    const [profileRead, accessRead] = await Promise.all([
      admin.from('user_profiles').select('status').eq('id', user.id).maybeSingle(),
      admin.from('qc_portal_access').select('company_id, views, capabilities').eq('user_id', user.id),
    ])
    if (profileRead.error || accessRead.error) {
      console.error('portal gate: read failed', profileRead.error?.message ?? accessRead.error?.message)
      return refuse(500, 'Access check failed')
    }
    userStatus = profileRead.data?.status ?? null
    access = (accessRead.data ?? []) as QcAccessRow[]
  }

  const decision = evaluatePortalAccess({ signedIn: true, kind, userStatus, requestedCompanyId, access, need: effectiveNeed })
  if (!decision.ok) return refuse(decision.status, decision.error)
  return {
    ok: true,
    ctx: {
      userId: user.id,
      companyId: decision.companyId,
      keys: decision.keys,
      isCompanyAdmin: decision.isCompanyAdmin,
      isStaffViewAs: decision.isStaffViewAs,
      admin,
    },
  }
}
