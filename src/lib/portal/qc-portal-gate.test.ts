// src/lib/portal/qc-portal-gate.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), accessKind: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/auth/access-kind', () => ({ accessKindForUser: mocks.accessKind }))

import { evaluatePortalAccess, requireQcPortal, type QcAccessRow } from './qc-portal-gate'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const rowA: QcAccessRow = { company_id: A, views: ['qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] }
const adminRowB: QcAccessRow = { company_id: B, views: ['qc_samples'], capabilities: ['qc_manage_users'] }
const noViewC: QcAccessRow = { company_id: C, views: [], capabilities: ['qc_spec_edit'] }

const base = { signedIn: true, kind: 'external' as const, userStatus: 'active', requestedCompanyId: null, access: [rowA], need: {} }

describe('evaluatePortalAccess', () => {
  it('401 when not signed in', () => {
    expect(evaluatePortalAccess({ ...base, signedIn: false })).toMatchObject({ ok: false, status: 401 })
  })

  it('picks the only QC company when none is asked for', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, noViewC] })).toEqual({
      ok: true, companyId: A, keys: { views: ['qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] },
      isCompanyAdmin: false, isStaffViewAs: false,
    })
  })

  it('asks to choose when there are several QC companies', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, adminRowB] })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...base, access: [rowA, adminRowB], requestedCompanyId: B })).toMatchObject({ ok: true, companyId: B, isCompanyAdmin: true })
  })

  it('refuses a company whose row holds no QC view, or that has no row', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, noViewC], requestedCompanyId: C })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: B })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [noViewC] })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [] })).toMatchObject({ ok: false, status: 403 })
  })

  it('400 on a malformed company id', () => {
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: "x' or 1=1" })).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses an external user who is not active', () => {
    expect(evaluatePortalAccess({ ...base, userStatus: 'invited' })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, userStatus: 'disabled' })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, userStatus: null })).toMatchObject({ ok: false, status: 403 })
  })

  it('checks the view and the capability the route needs', () => {
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_certificates' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_dashboard' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_cupping_score' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_spec_edit' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [adminRowB], need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: true })
  })

  it("only qc_manage_users makes a company admin; sys's manage_users never does", () => {
    // The table's CHECK refuses non-qc_ keys; the gate would ignore one anyway.
    const stray: QcAccessRow = { company_id: B, views: ['contracts', 'qc_samples'], capabilities: ['manage_users'] }
    expect(evaluatePortalAccess({ ...base, access: [stray] })).toMatchObject({
      ok: true, isCompanyAdmin: false, keys: { views: ['qc_samples'], capabilities: [] },
    })
    expect(evaluatePortalAccess({ ...base, access: [stray], need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('lets staff view any company read-only', () => {
    const staff = { ...base, kind: 'staff' as const, userStatus: null, access: [] }
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { view: 'qc_dashboard' } })).toMatchObject({
      ok: true, companyId: A, isStaffViewAs: true, isCompanyAdmin: false,
    })
    expect(evaluatePortalAccess({ ...staff })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { write: true } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses everyone else', () => {
    expect(evaluatePortalAccess({ ...base, kind: 'none' })).toMatchObject({ ok: false, status: 403 })
  })
})

describe('evaluatePortalAccess, more staff and company cases', () => {
  const staff = { ...base, kind: 'staff' as const, userStatus: null, access: [] }
  it('refuses a non-admin capability need for staff', () => {
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { capability: 'qc_spec_edit' } })).toMatchObject({ ok: false, status: 403 })
  })
  it('400 for staff with a malformed company', () => {
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: 'nope' })).toMatchObject({ ok: false, status: 400 })
  })
  it('lowercases the company id', () => {
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A.toUpperCase() })).toMatchObject({ ok: true, companyId: A })
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: A.toUpperCase() })).toMatchObject({ ok: true, companyId: A })
  })
})

describe('requireQcPortal', () => {
  const USER = '99999999-9999-4999-8999-999999999999'
  const calls: { table: string; col: string; val: unknown }[] = []
  let reads: Record<string, { data: unknown; error: { message: string } | null }>

  function fakeAdmin() {
    return {
      from: (table: string) => {
        const q: any = {
          select: () => q,
          eq: (col: string, val: unknown) => { calls.push({ table, col, val }); return q },
          maybeSingle: () => Promise.resolve(reads[table]),
          then: (res: (v: unknown) => unknown) => Promise.resolve(reads[table]).then(res),
        }
        return q
      },
    }
  }

  beforeEach(async () => {
    calls.length = 0
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } } })
    mocks.accessKind.mockResolvedValue('external')
    reads = {
      user_profiles: { data: { status: 'active' }, error: null },
      qc_portal_access: { data: [rowA], error: null },
    }
    const sb = await import('@supabase/supabase-js')
    vi.spyOn(sb, 'createClient').mockReturnValue(fakeAdmin() as never)
  })

  const req = (method = 'GET', q = '') => new Request(`http://x/api/portal/y${q}`, { method })

  it('reads qc_portal_access for the signed-in user and passes need through', async () => {
    const ok = await requireQcPortal(req(), { view: 'qc_certificates' })
    expect(ok).toMatchObject({ ok: true, ctx: { userId: USER, companyId: A } })
    expect(calls).toContainEqual({ table: 'qc_portal_access', col: 'user_id', val: USER })
    const denied = await requireQcPortal(req(), { view: 'qc_dashboard' })
    expect(denied).toMatchObject({ ok: false })
    expect((denied as { response: Response }).response.status).toBe(403)
  })

  it('does not read qc_portal_access for a non-external caller', async () => {
    mocks.accessKind.mockResolvedValue('none')
    const r = await requireQcPortal(req())
    expect((r as { response: Response }).response.status).toBe(403)
    expect(calls.some((c) => c.table === 'qc_portal_access')).toBe(false)
  })

  it('500 on a read error, 503 when the access kind fails', async () => {
    reads.qc_portal_access = { data: null, error: { message: 'boom' } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await requireQcPortal(req())
    expect((r as { response: Response }).response.status).toBe(500)
    mocks.accessKind.mockRejectedValue(new Error('down'))
    const r2 = await requireQcPortal(req())
    expect((r2 as { response: Response }).response.status).toBe(503)
  })

  it('401 signed out even without a service key; 400 on a malformed company', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await requireQcPortal(req()) as { response: Response }).response.status).toBe(401)
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } } })
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    expect((await requireQcPortal(req('GET', '?company=zz')) as { response: Response }).response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('staff view-as is read-only by method', async () => {
    mocks.accessKind.mockResolvedValue('staff')
    expect(await requireQcPortal(req('GET', `?company=${A}`))).toMatchObject({ ok: true, ctx: { isStaffViewAs: true } })
    const post = await requireQcPortal(req('POST', `?company=${A}`))
    expect((post as { response: Response }).response.status).toBe(403)
  })
})
