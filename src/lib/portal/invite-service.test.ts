// src/lib/portal/invite-service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  setQcAccess: vi.fn(),
  createPortalInvitation: vi.fn(),
  sendPortalInviteEmail: vi.fn(),
  sendPortalHouseCopy: vi.fn(),
  recordQcTeamActivity: vi.fn(),
}))
vi.mock('./qc-grants', async (orig) => ({ ...(await orig<any>()), setQcAccess: m.setQcAccess }))
vi.mock('./portal-invitations', async (orig) => ({ ...(await orig<any>()), createPortalInvitation: m.createPortalInvitation }))
vi.mock('./invite-email', async (orig) => ({
  ...(await orig<any>()), sendPortalInviteEmail: m.sendPortalInviteEmail, sendPortalHouseCopy: m.sendPortalHouseCopy,
}))
vi.mock('./team-activity', () => ({ recordQcTeamActivity: m.recordQcTeamActivity }))

import { PENDING_SYS_INVITATION, SWITCHED_OFF } from './account-status'
import { inviteToCompany } from './invite-service'

/**
 * Rows per table; .ilike matches case-insensitively without wildcards;
 * `failing` tables answer an error. `tables` records every table read.
 */
function fakeAdmin(rows: Record<string, any[]>, failing: string[] = [], authEmail?: string | Error | { notFound: true }) {
  const tables: string[] = []
  return {
    tables,
    auth: {
      admin: {
        getUserById: async (id: string) => {
          if (authEmail && typeof authEmail === 'object' && 'notFound' in authEmail) return { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } }
          if (authEmail instanceof Error) return { data: { user: null }, error: { message: 'down' } }
          const row = (rows.user_profiles ?? []).find((r) => r.id === id)
          return { data: { user: { id, email: authEmail ?? row?.email } }, error: null }
        },
      },
    },
    from(table: string) {
      tables.push(table)
      const preds: Array<(r: any) => boolean> = []
      const chain: any = {
        select() { return chain },
        gt(c: string, v: string) { preds.push((r) => String(r[c]) > v); return chain },
        eq(c: string, v: unknown) { preds.push((r) => r[c] === v); return chain },
        ilike(c: string, v: string) { const want = v.replace(/\\(.)/g, '$1').toLowerCase(); preds.push((r) => String(r[c]).toLowerCase() === want); return chain },
        maybeSingle() {
          if (failing.includes(table)) return Promise.resolve({ data: null, error: { message: 'more than one row' } })
          return Promise.resolve({ data: (rows[table] ?? []).find((r) => preds.every((p) => p(r))) ?? null, error: null })
        },
      }
      return chain
    },
  } as any
}

const company = { id: 'co-1', name: 'Roastery One Ltda', fantasy_name: 'Roastery One' }
const keys = { views: ['qc_samples'] as any, capabilities: [] as any }
const staff = { userId: 'staff-1', name: 'Daniel Wolthers', kind: 'staff' as const }
const manager = { userId: 'mgr-1', name: 'Bea Costa', kind: 'manager' as const }
const active = (over: Record<string, unknown> = {}) => ({ id: 'u-9', email: 'sys@client.com', user_type: 'external', status: 'active', ...over })
const invite = (admin: any, over: Record<string, unknown> = {}) => inviteToCompany(admin, {
  companyId: 'co-1', email: 'sys@client.com', firstName: 'S', lastName: '', keys, isCompanyAdmin: false, inviter: staff, ...over,
} as any)

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.createPortalInvitation.mockResolvedValue({ invitation: { id: 'inv-1', expires_at: '2026-10-21T00:00:00Z' }, token: 'tok' })
  m.setQcAccess.mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: [] } })
  m.sendPortalHouseCopy.mockResolvedValue(true)
})

describe('inviteToCompany', () => {
  it('invites a new person with a normalized email: their mail alone, plus a link-free copy for head office', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    const out = await invite(admin, { email: ' Ana.Lima@Client.COM ', firstName: 'Ana', lastName: 'Lima', isCompanyAdmin: true })
    expect(out).toEqual({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
    expect(m.createPortalInvitation.mock.calls[0][1]).toMatchObject({ email: 'ana.lima@client.com', isCompanyAdmin: true, invitedByKind: 'staff' })
    expect(m.sendPortalInviteEmail.mock.calls[0][0]).toBe('ana.lima@client.com')
    expect(m.sendPortalInviteEmail.mock.calls[0][1].subject).toContain('Roastery One')
    expect(m.sendPortalHouseCopy).toHaveBeenCalledWith({
      kind: 'invitation', inviterName: 'Daniel Wolthers', email: 'ana.lima@client.com', companyName: 'Roastery One',
      keys, isCompanyAdmin: true,
    })
  })

  it('a company admin can never create another admin', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    await invite(admin, { email: 'b@client.com', isCompanyAdmin: true, inviter: manager })
    expect(m.createPortalInvitation.mock.calls[0][1]).toMatchObject({ isCompanyAdmin: false, invitedByKind: 'manager' })
  })

  it('an external account still pending (the sign-up row) gets an invitation, not keys', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active({ status: 'pending' })], profiles: [] })
    expect(await invite(admin)).toMatchObject({ outcome: 'invited' })
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('writes the QC access row of an active external user, with an access email and a head-office copy', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] })
    const out = await invite(admin, { email: 'SYS@client.com' })
    expect(out).toEqual({ outcome: 'access_added', userId: 'u-9', emailSent: true })
    expect(m.setQcAccess.mock.calls[0][1]).toEqual({ userId: 'u-9', companyId: 'co-1', keys, manageUsers: false, createdBy: 'staff-1' })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
    // Only lookups: the active profile is not rewritten, and sys's company grants are never read.
    expect([...new Set(admin.tables)].sort()).toEqual(['companies', 'profiles', 'user_profiles'])
    expect(m.sendPortalHouseCopy.mock.calls[0][0]).toMatchObject({ kind: 'access_added', email: 'sys@client.com' })
    expect(m.recordQcTeamActivity.mock.calls[0][1]).toMatchObject({ action: 'team_update', targetUserId: 'u-9' })
  })

  it('refuses a switched-off or sys-invited account and writes nothing', async () => {
    for (const [status, error] of [['disabled', SWITCHED_OFF], ['invited', PENDING_SYS_INVITATION]]) {
      const admin = fakeAdmin({ companies: [company], user_profiles: [active({ status })], profiles: [] })
      expect(await invite(admin)).toEqual({ outcome: 'refused', status: 409, error })
    }
    expect(m.setQcAccess).not.toHaveBeenCalled()
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
  })

  it('refuses Wolthers and partner accounts, and any @wolthers.com address', async () => {
    const internal = fakeAdmin({ companies: [company], user_profiles: [{ id: 'u-1', email: 'x@partner.com', user_type: 'internal', status: 'active' }], profiles: [] })
    expect(await invite(internal, { email: 'x@partner.com' })).toMatchObject({ outcome: 'refused', status: 409 })
    const edited = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [{ id: 'u-9', email: 'changed@elsewhere.com', qc_role: 'lab_manager' }] })
    expect(await invite(edited)).toMatchObject({ outcome: 'refused', status: 409 })
    expect(m.setQcAccess).not.toHaveBeenCalled()
    const staffProfile = fakeAdmin({ companies: [company], user_profiles: [], profiles: [{ id: 'u-2', email: 'Lab@Partner.com', qc_role: 'lab_personnel' }] })
    expect(await invite(staffProfile, { email: 'lab@partner.com' })).toMatchObject({ outcome: 'refused', status: 409 })
    const nobody = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(nobody, { email: 'New.Person@Wolthers.com' })).toMatchObject({ outcome: 'refused', status: 400 })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
  })

  it('fails closed when the email cannot be checked', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] }, ['user_profiles'])
    expect(await invite(admin, { email: 'a@b.com' })).toMatchObject({ outcome: 'refused', status: 500 })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
  })

  it('validates email, name and pages', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(admin, { email: 'nope' })).toMatchObject({ status: 400 })
    expect(await invite(admin, { email: 'a@b.com', firstName: ' ' })).toMatchObject({ status: 400 })
    expect(await invite(admin, { email: 'a@b.com', keys: { views: [], capabilities: [] } })).toMatchObject({ status: 400 })
  })

  it('reports a failed email without losing the invitation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.sendPortalInviteEmail.mockRejectedValue(new Error('graph down'))
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(admin, { email: 'a@b.com' })).toEqual({ outcome: 'invited', invitationId: 'inv-1', emailSent: false })
  })

  it('maps a concurrent-create conflict to 409', async () => {
    const { InvitationConflictError } = await import('./portal-invitations')
    m.createPortalInvitation.mockRejectedValue(new InvitationConflictError())
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(admin, { email: 'a@b.com' })).toMatchObject({ outcome: 'refused', status: 409 })
  })

  it('rejects a wildcard address', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(admin, { email: 'a*@b.com' })).toMatchObject({ outcome: 'refused', status: 400 })
  })

  it('a lookup row whose email is not exactly the address is no account', async () => {
    const stray = { id: 'x', email: 'someone.else@client.com', user_type: 'internal', status: 'active', qc_role: 'global_admin' }
    const loose = (table: string) => {
      const c: any = {
        select: () => c, eq: () => c, ilike: () => c,
        maybeSingle: async () => ({ data: table === 'companies' ? company : stray, error: null }),
      }
      return c
    }
    expect(await invite({ from: loose } as any, { email: 'a@client.com' })).toMatchObject({ outcome: 'invited' })
  })
})

describe('inviteToCompany — review fixes', () => {
  it('a staff invite honours the Company-admin switch both ways', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] })
    await invite(admin, { isCompanyAdmin: true })
    expect(m.setQcAccess.mock.calls[0][1].manageUsers).toBe(true)
    await invite(admin, { isCompanyAdmin: false })
    expect(m.setQcAccess.mock.calls[1][1].manageUsers).toBe(false)
  })

  it("refuses when the login's own email disagrees with the profile copy, or cannot be read", async () => {
    const out = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] }, [], 'someone.else@client.com')
    expect(await invite(out)).toMatchObject({ outcome: 'refused', status: 409 })
    const down = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] }, [], new Error('x'))
    expect(await invite(down)).toMatchObject({ outcome: 'refused', status: 500 })
    expect(m.setQcAccess).not.toHaveBeenCalled()
    expect(m.sendPortalInviteEmail).not.toHaveBeenCalled()
  })

  it('a manager cannot replace a pending staff-issued Company-admin invitation; member and expired ones are replaceable; a lookup error is a 500', async () => {
    const future = '2999-01-01T00:00:00Z'
    const pending = (over: Record<string, unknown>) => ({ company_id: 'co-1', email: 'new@client.com', status: 'pending', is_company_admin: false, invited_by_kind: 'staff', expires_at: future, ...over })
    const go = (rows: any[], failing: string[] = []) => invite(fakeAdmin({ companies: [company], user_profiles: [], profiles: [], portal_invitations: rows }, failing), { email: 'new@client.com', inviter: manager })
    expect(await go([pending({ is_company_admin: true })])).toMatchObject({ outcome: 'refused', status: 403 })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
    expect(await go([], ['portal_invitations'])).toMatchObject({ outcome: 'refused', status: 500 })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
    expect(await go([pending({})])).toMatchObject({ outcome: 'invited' })
    expect(await go([pending({ is_company_admin: true, expires_at: '2020-01-01T00:00:00Z' })])).toMatchObject({ outcome: 'invited' })
  })

  it('an account without a login is a 409', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] }, [], { notFound: true })
    expect(await invite(admin)).toMatchObject({ outcome: 'refused', status: 409 })
  })

  it('a company read error is a 500, not "Company not found"', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] }, ['companies'])
    expect(await invite(admin)).toMatchObject({ outcome: 'refused', status: 500 })
  })
})

describe('inviteToCompany — a company admin inviting an existing account', () => {
  const row = (over: Record<string, unknown>) => ({ user_id: 'u-9', company_id: 'co-1', views: ['qc_samples'], capabilities: [], ...over })

  it('refuses someone already on the team: they are edited in the team list', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [], qc_portal_access: [row({})] })
    expect(await invite(admin, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 409 })
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it("refuses a company admin's address and their own", async () => {
    const adminRow = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [], qc_portal_access: [row({ capabilities: ['qc_manage_users'] })] })
    expect(await invite(adminRow, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 403 })
    const self = fakeAdmin({ companies: [company], user_profiles: [active({ id: 'mgr-1' })], profiles: [], qc_portal_access: [] })
    expect(await invite(self, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 403 })
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('writes a QC access row for an account with none here yet; their sys access is never looked at', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [], qc_portal_access: [row({ company_id: 'other-co' })] })
    expect(await invite(admin, { inviter: manager })).toMatchObject({ outcome: 'access_added', userId: 'u-9' })
    expect(m.setQcAccess.mock.calls[0][1]).toEqual({ userId: 'u-9', companyId: 'co-1', keys, manageUsers: undefined, createdBy: 'mgr-1' })
    expect([...new Set(admin.tables)].sort()).toEqual(['companies', 'profiles', 'qc_portal_access', 'user_profiles'])
  })

  it('fails closed when the QC access row cannot be read', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] }, ['qc_portal_access'])
    expect(await invite(admin, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 500 })
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })
})
