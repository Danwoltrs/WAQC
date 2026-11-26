// src/app/api/clients/[id]/portal-access/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, invite: vi.fn(), listMembers: vi.fn(async () => []) }))
vi.mock('@/lib/portal/staff-gate', () => ({ requirePortalStaff: async () => m.gate }))
vi.mock('@/lib/portal/qc-grants', () => ({ listQcMembers: m.listMembers }))
vi.mock('@/lib/portal/portal-invitations', () => ({ listPendingInvitations: async () => [], toInvitationSummary: (i: unknown) => i }))
vi.mock('@/lib/portal/team-activity', () => ({ listQcTeamActivity: async () => [] }))
vi.mock('@/lib/portal/invite-service', async () => ({
  inviteToCompany: m.invite,
  inviteOutcomeResponse: (o: any) => o.outcome === 'refused'
    ? NextResponse.json({ error: o.error }, { status: o.status })
    : NextResponse.json(o),
}))

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GET, POST } from './route'
import { PORTAL_ACCESS_HQ_ONLY } from '@/lib/auth/lab-scope'

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

describe('portal access: a confined laboratory', () => {
  const confined = () => ({ ok: false, response: NextResponse.json({ error: PORTAL_ACCESS_HQ_ONLY }, { status: 403 }) })

  it('GET: 403 with the Santos message, and no member, invitation or activity is read', async () => {
    m.gate = confined()
    const res = await GET(req(null), params(CO))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(PORTAL_ACCESS_HQ_ONLY)
    expect(m.listMembers).not.toHaveBeenCalled()
  })

  it('POST: 403, and nobody is invited', async () => {
    m.gate = confined()
    expect((await POST(req({ email: 'a@b.com' }), params(CO))).status).toBe(403)
    expect(m.invite).not.toHaveBeenCalled()
  })

  // The lab check lives in requirePortalStaff (staff-gate-wiring.test.ts): every
  // handler under portal-access must go through it before anything else.
  it('every portal-access handler starts with requirePortalStaff', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (f === 'route.ts') files.push(p)
      }
    }
    walk(__dirname)
    expect(files.length).toBe(3)
    for (const f of files) {
      const handlers = readFileSync(f, 'utf8').split(/export async function (?:GET|POST|PATCH|DELETE|PUT)\b/).slice(1)
      expect(handlers.length).toBeGreaterThan(0)
      for (const h of handlers) {
        const body = h.slice(h.indexOf('{', h.indexOf(')')))
        expect(body.split('\n').slice(0, 4).join('\n')).toContain('await requirePortalStaff()')
      }
    }
  })
})
