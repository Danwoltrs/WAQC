// src/app/api/clients/[id]/portal-access/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, invite: vi.fn() }))
vi.mock('@/lib/portal/staff-gate', () => ({ requirePortalStaff: async () => m.gate }))
vi.mock('@/lib/portal/invite-service', async () => ({
  inviteToCompany: m.invite,
  inviteOutcomeResponse: (o: any) => o.outcome === 'refused'
    ? NextResponse.json({ error: o.error }, { status: o.status })
    : NextResponse.json(o),
}))

import { POST } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const req = (body: unknown) => ({ json: async () => body }) as any
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  m.invite.mockReset()
  m.gate = { ok: true, ctx: { userId: 'staff-1', name: 'Daniel', admin: {} } }
})

describe('POST /api/clients/[id]/portal-access', () => {
  it('refuses non-staff', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    const res = await POST(req({}), params(CO))
    expect(res.status).toBe(403)
    expect(m.invite).not.toHaveBeenCalled()
  })

  it('passes only grantable QC keys and the admin flag through, as a staff invitation', async () => {
    m.invite.mockResolvedValue({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
    const res = await POST(req({
      email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima',
      views: ['qc_samples', 'contracts'], capabilities: ['manage_users', 'qc_manage_users', 'qc_spec_edit'], is_company_admin: true,
    }), params(CO))
    expect(res.status).toBe(200)
    expect(m.invite.mock.calls[0][1]).toEqual({
      companyId: CO, email: 'ana@client.com', firstName: 'Ana', lastName: 'Lima',
      keys: { views: ['qc_samples'], capabilities: ['qc_spec_edit'] }, isCompanyAdmin: true,
      inviter: { userId: 'staff-1', name: 'Daniel', kind: 'staff' },
    })
  })

  it('400 on a malformed company id', async () => {
    expect((await POST(req({}), params('nope'))).status).toBe(400)
  })
})
