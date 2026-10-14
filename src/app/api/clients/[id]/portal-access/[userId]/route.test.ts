// src/app/api/clients/[id]/portal-access/[userId]/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ gate: null as any, read: vi.fn(), set: vi.fn(), remove: vi.fn(), cancel: vi.fn() }))
vi.mock('@/lib/portal/staff-gate', () => ({ requirePortalStaff: async () => m.gate }))
vi.mock('@/lib/portal/qc-grants', async (orig) => ({
  ...(await orig<any>()), readQcAccess: m.read, setQcAccess: m.set, removeQcAccess: m.remove,
}))
vi.mock('@/lib/portal/portal-invitations', () => ({ cancelManagerInvitationsBy: m.cancel }))
vi.mock('@/lib/portal/team-activity', () => ({ recordQcTeamActivity: vi.fn() }))
vi.mock('@/lib/portal/invite-service', () => ({ loadCompanyName: async () => 'Roastery One' }))
vi.mock('@/lib/portal/team-names', () => ({ targetEmail: async () => 'x@c.com' }))

import { DELETE, PATCH } from './route'

const CO = '33333333-3333-4333-8333-333333333333'
const USER = '22222222-2222-4222-8222-222222222222'
const params = { params: Promise.resolve({ id: CO, userId: USER }) }
const req = (body: unknown) => ({ json: async () => body }) as any
const admin = { views: ['qc_samples'], capabilities: ['qc_manage_users'] }
const plain = { views: ['qc_samples'], capabilities: [] }

beforeEach(() => {
  m.gate = { ok: true, ctx: { admin: {}, userId: 's-1', name: 'Staff' } }
  m.read.mockReset().mockResolvedValue(admin)
  m.set.mockReset().mockResolvedValue({ before: admin, after: plain })
  m.remove.mockReset().mockResolvedValue({ before: admin })
  m.cancel.mockReset().mockResolvedValue(undefined)
})

describe('staff portal-access/[userId]', () => {
  it('demoting a company admin cancels their pending manager invitations for that company', async () => {
    const res = await PATCH(req({ views: ['qc_samples'], is_company_admin: false }), params)
    expect(res.status).toBe(200)
    expect(m.cancel).toHaveBeenCalledWith({}, { companyId: CO, invitedBy: USER })
  })

  it('does not cancel when the admin keeps the switch, or the member was never an admin', async () => {
    m.set.mockResolvedValue({ before: admin, after: admin })
    await PATCH(req({ views: ['qc_samples'] }), params)
    m.set.mockResolvedValue({ before: plain, after: plain })
    await PATCH(req({ views: ['qc_samples'] }), params)
    expect(m.cancel).not.toHaveBeenCalled()
  })

  it('removing a company admin cancels them too, and a failed cancel is logged, not fatal', async () => {
    m.cancel.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await DELETE(req({}), params)
    expect(res.status).toBe(200)
    expect(m.cancel).toHaveBeenCalledWith({}, { companyId: CO, invitedBy: USER })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('removing a plain member cancels nothing', async () => {
    m.remove.mockResolvedValue({ before: plain })
    await DELETE(req({}), params)
    expect(m.cancel).not.toHaveBeenCalled()
  })
})
