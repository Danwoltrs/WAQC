// src/app/api/portal/team/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, need: null as any, invite: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_req: unknown, need: unknown) => { m.need = need; return m.gate },
}))
vi.mock('@/lib/portal/invite-service', () => ({
  inviteToCompany: m.invite,
  inviteOutcomeResponse: (o: any) => o.outcome === 'refused'
    ? NextResponse.json({ error: o.error }, { status: o.status })
    : NextResponse.json(o),
}))
vi.mock('@/lib/portal/team-names', () => ({ selfName: async () => 'Bea Costa', targetEmail: async () => 'x@c.com' }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body, url: 'http://x/api/portal/team?company=c' }) as any

beforeEach(() => {
  m.invite.mockReset().mockResolvedValue({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
  m.gate = { ok: true, ctx: { admin: {}, companyId: 'co-1', userId: 'mgr-1', keys: { views: ['qc_samples'], capabilities: ['qc_cupping_score'] }, isCompanyAdmin: true, isStaffViewAs: false } }
})

describe('POST /api/portal/team', () => {
  it('needs qc_manage_users and a write, clamps to the admin\'s own keys, and never invites an admin', async () => {
    const res = await POST(req({
      email: 'b@client.com', first_name: 'B', last_name: '', is_company_admin: true,
      views: ['qc_samples', 'qc_dashboard'], capabilities: ['qc_cupping_score', 'qc_spec_edit', 'qc_manage_users', 'manage_users'],
    }))
    expect(res.status).toBe(200)
    expect(m.need).toEqual({ capability: 'qc_manage_users', write: true })
    expect(m.invite.mock.calls[0][1]).toEqual({
      companyId: 'co-1', email: 'b@client.com', firstName: 'B', lastName: '',
      keys: { views: ['qc_samples'], capabilities: ['qc_cupping_score'] }, isCompanyAdmin: false,
      inviter: { userId: 'mgr-1', name: 'Bea Costa', kind: 'manager' },
    })
  })

  it('passes a refusal from the invite service through', async () => {
    m.invite.mockResolvedValue({ outcome: 'refused', status: 409, error: 'This person is already on the team. Edit their access in the team list.' })
    expect((await POST(req({ email: 'b@client.com', first_name: 'B', views: ['qc_samples'] }))).status).toBe(409)
  })
})
