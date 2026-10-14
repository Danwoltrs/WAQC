// src/app/api/portal/team/[userId]/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ need: null as any, gate: null as any, target: null as any, set: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), requireQcPortal: async (_r: unknown, need: unknown) => { m.need = need; return m.gate } }))
vi.mock('@/lib/portal/qc-grants', async (orig) => ({
  ...(await orig<any>()), readQcAccess: async () => m.target, setQcAccess: m.set, removeQcAccess: m.remove,
}))
vi.mock('@/lib/portal/team-activity', () => ({ recordQcTeamActivity: vi.fn() }))
vi.mock('@/lib/portal/invite-service', () => ({ loadCompanyName: async () => 'Roastery One' }))
vi.mock('@/lib/portal/team-names', () => ({ selfName: async () => 'Bea Costa', targetEmail: async () => 'x@c.com' }))

import { DELETE, PATCH } from './route'

const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const req = (body: unknown = {}) => ({ json: async () => body, url: 'http://x/api/portal/team/u?company=c' }) as any
const params = (userId: string) => ({ params: Promise.resolve({ userId }) })

beforeEach(() => {
  m.set.mockReset().mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: [] } })
  m.remove.mockReset().mockResolvedValue({ before: { views: ['qc_samples'], capabilities: [] } })
  m.gate = { ok: true, ctx: { admin: {}, companyId: 'co-1', userId: SELF, keys: { views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] }, isCompanyAdmin: true, isStaffViewAs: false } }
  m.target = { views: ['qc_samples'], capabilities: [] }
})

describe('PATCH /api/portal/team/[userId]', () => {
  it("clamps the requested keys to the admin's own and never grants an admin key", async () => {
    const res = await PATCH(req({ views: ['qc_samples', 'qc_dashboard'], capabilities: ['qc_manage_users', 'manage_users', 'qc_cupping_score', 'qc_spec_edit'] }), params(OTHER))
    expect(res.status).toBe(200)
    expect(m.set.mock.calls[0][1]).toEqual({
      userId: OTHER, companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: ['qc_cupping_score'] }, createdBy: SELF,
    })
  })

  it('refuses to change another QC company admin', async () => {
    m.target = { views: ['qc_samples'], capabilities: ['qc_manage_users'] }
    expect((await PATCH(req({ views: ['qc_samples'] }), params(OTHER))).status).toBe(403)
    expect(m.set).not.toHaveBeenCalled()
  })

  it('404 for someone with no QC access row here', async () => {
    m.target = null
    expect((await PATCH(req({ views: ['qc_samples'] }), params(OTHER))).status).toBe(404)
    expect(m.set).not.toHaveBeenCalled()
  })

  it('refuses to change themselves', async () => {
    expect((await PATCH(req({ views: ['qc_samples'] }), params(SELF))).status).toBe(403)
    expect(m.set).not.toHaveBeenCalled()
  })

  it('needs qc_manage_users and a write', async () => {
    await PATCH(req({ views: ['qc_samples'] }), params(OTHER))
    expect(m.need).toEqual({ capability: 'qc_manage_users', write: true })
  })

  it("keeps the member's keys that lie outside the admin's ceiling", async () => {
    m.target = { views: ['qc_samples', 'qc_dashboard'], capabilities: ['qc_spec_edit'] }
    const res = await PATCH(req({ views: ['qc_reports'], capabilities: ['qc_manage_users'] }), params(OTHER))
    expect(res.status).toBe(200)
    expect(m.set.mock.calls[0][1].keys).toEqual({ views: ['qc_reports', 'qc_dashboard'], capabilities: ['qc_spec_edit'] })
  })
})

describe('DELETE /api/portal/team/[userId]', () => {
  it('needs qc_manage_users and a write', async () => {
    await DELETE(req(), params(OTHER))
    expect(m.need).toEqual({ capability: 'qc_manage_users', write: true })
  })

  it('refuses to remove themselves', async () => {
    expect((await DELETE(req(), params(SELF))).status).toBe(403)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('removes only QC access', async () => {
    expect((await DELETE(req(), params(OTHER))).status).toBe(200)
    expect(m.remove.mock.calls[0][1]).toEqual({ userId: OTHER, companyId: 'co-1' })
  })

  it('refuses another QC company admin', async () => {
    m.target = { views: ['qc_samples'], capabilities: ['qc_manage_users'] }
    expect((await DELETE(req(), params(OTHER))).status).toBe(403)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('404 for someone with no QC access row here', async () => {
    m.target = null
    expect((await DELETE(req(), params(OTHER))).status).toBe(404)
    expect(m.remove).not.toHaveBeenCalled()
  })
})
