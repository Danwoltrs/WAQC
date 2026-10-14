import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ need: null as any, gate: null as any, inv: null as any, resend: vi.fn(), cancel: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_r: unknown, need: unknown) => { m.need = need; return m.gate },
}))
vi.mock('@/lib/portal/portal-invitations', () => ({ findCompanyInvitation: async () => m.inv }))
vi.mock('@/lib/portal/invite-service', () => ({
  loadCompanyName: async () => 'Roastery One', resendInvitation: m.resend, cancelAndLogInvitation: m.cancel,
}))
vi.mock('@/lib/portal/team-names', () => ({ selfName: async () => 'Bea Costa' }))

import { DELETE, POST } from './route'

const INV = '33333333-3333-4333-8333-333333333333'
const req = () => ({ url: `http://x/api/portal/team/invitations/${INV}?company=c` }) as any
const params = () => ({ params: Promise.resolve({ invitationId: INV }) })

beforeEach(() => {
  m.resend.mockReset().mockResolvedValue({ emailSent: true })
  m.cancel.mockReset().mockResolvedValue({ id: INV })
  m.gate = { ok: true, ctx: { admin: {}, companyId: 'co-1', userId: 'mgr-1', keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: true, isStaffViewAs: false } }
  m.inv = { id: INV, status: 'pending', is_company_admin: false }
})

describe('invitation resend / cancel', () => {
  it('needs qc_manage_users and a write', async () => {
    await POST(req(), params())
    expect(m.need).toEqual({ capability: 'qc_manage_users', write: true })
  })

  it('works on a manager-issued invitation', async () => {
    expect((await POST(req(), params()))!.status).toBe(200)
    expect((await DELETE(req(), params()))!.status).toBe(200)
  })

  it('refuses a staff-issued company-admin invitation', async () => {
    m.inv = { id: INV, status: 'pending', is_company_admin: true }
    expect((await POST(req(), params()))!.status).toBe(403)
    expect((await DELETE(req(), params()))!.status).toBe(403)
    expect(m.resend).not.toHaveBeenCalled()
    expect(m.cancel).not.toHaveBeenCalled()
  })

  it('404 when there is no pending invitation', async () => {
    m.inv = null
    expect((await POST(req(), params()))!.status).toBe(404)
    expect((await DELETE(req(), params()))!.status).toBe(404)
  })
})
