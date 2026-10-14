// src/lib/portal/accept-invitation.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  find: vi.fn(), claim: vi.fn(), release: vi.fn(), record: vi.fn(), setQcAccess: vi.fn(), activity: vi.fn(),
}))
vi.mock('./portal-invitations', async (orig) => ({
  ...(await orig<any>()),
  findInvitationByToken: m.find, claimInvitation: m.claim, releaseInvitation: m.release, recordAcceptedUser: m.record,
}))
vi.mock('./qc-grants', async (orig) => ({ ...(await orig<any>()), setQcAccess: m.setQcAccess }))
vi.mock('./team-activity', () => ({ recordQcTeamActivity: m.activity }))
vi.mock('./invite-service', () => ({ loadCompanyName: async () => 'Roastery One' }))

import { PENDING_SYS_INVITATION, SWITCHED_OFF } from './account-status'
import { INVALID_INVITATION, acceptInvitation } from './accept-invitation'

const pending = {
  id: 'inv-1', company_id: 'co-1', email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima',
  views: ['qc_samples'], capabilities: [], is_company_admin: true, invited_by: 'staff-1', invited_by_kind: 'staff',
  status: 'pending', expires_at: '2999-01-01T00:00:00Z', accepted_at: null, accepted_user_id: null, created_at: '2026-10-14T00:00:00Z',
}
const TOKEN = 't'.repeat(43)

function fakeAdmin(opts: { account?: any; createError?: any; confirmed?: boolean } = {}) {
  const auth = {
    createUser: vi.fn(async () => (opts.createError ? { data: null, error: opts.createError } : { data: { user: { id: 'new-user' } }, error: null })),
    getUserById: vi.fn(async (id: string) => ({
      data: { user: { id, email_confirmed_at: opts.confirmed === false ? null : '2026-01-01T00:00:00Z' } }, error: null,
    })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
  }
  const writes: any[] = []
  const admin: any = {
    auth: { admin: auth },
    writes,
    from(table: string) {
      let op = 'select'
      let values: any = null
      const chain: any = {
        select() { return chain },
        update(v: any) { op = 'update'; values = v; return chain },
        insert(v: any) { writes.push({ table, op: 'insert', values: v }); return Promise.resolve({ error: null }) },
        eq() { return chain },
        ilike() { return chain },
        maybeSingle() { return Promise.resolve({ data: table === 'user_profiles' ? opts.account ?? null : null, error: null }) },
        then(ok: any, bad: any) {
          writes.push({ table, op, values })
          return Promise.resolve({ data: op === 'update' ? [{ id: 'row' }] : null, error: null }).then(ok, bad)
        },
      }
      return chain
    },
  }
  return admin
}

const accept = (admin: any, over: Record<string, unknown> = {}) =>
  acceptInvitation(admin, { token: TOKEN, method: 'password', password: 'long-enough', ...over } as any)
const profileUpdate = (admin: any) => admin.writes.find((w: any) => w.table === 'user_profiles' && w.op === 'update')
const profileWrites = (admin: any) => admin.writes.filter((w: any) => w.table === 'user_profiles' && (w.op === 'update' || w.op === 'insert'))

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.find.mockResolvedValue(pending)
  m.claim.mockResolvedValue(true)
  m.setQcAccess.mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
})

afterEach(() => { vi.restoreAllMocks(); delete process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN })

describe('acceptInvitation', () => {
  it('410 for an unknown, used or expired link, without creating anything', async () => {
    for (const row of [null, { ...pending, status: 'accepted' }, { ...pending, expires_at: '2000-01-01T00:00:00Z' }, { ...pending, status: 'cancelled' }]) {
      m.find.mockResolvedValueOnce(row)
      const admin = fakeAdmin()
      expect(await accept(admin)).toEqual({ status: 410, body: { error: INVALID_INVITATION } })
      expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    }
  })

  it('410 when a second click finds the invitation already claimed', async () => {
    m.claim.mockResolvedValue(false)
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(410)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('400 on a short password, before claiming', async () => {
    expect((await accept(fakeAdmin(), { password: 'short' })).status).toBe(400)
    expect(m.claim).not.toHaveBeenCalled()
  })

  it('400 for Microsoft while the flag is off', async () => {
    expect((await accept(fakeAdmin(), { method: 'microsoft', password: null })).status).toBe(400)
  })

  it('creates the login, marks it external, active and is_active, and writes the QC access row from the invitation', async () => {
    const admin = fakeAdmin()
    expect(await accept(admin)).toEqual({ status: 200, body: { ok: true, email: 'ana@client.com', method: 'password' } })
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'ana@client.com', email_confirm: true, password: 'long-enough', user_metadata: { full_name: 'Ana Lima' },
    })
    expect(profileUpdate(admin).values).toEqual({ user_type: 'external', status: 'active', is_active: true, full_name: 'Ana Lima' })
    expect(m.setQcAccess.mock.calls[0][1]).toEqual({
      userId: 'new-user', companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: [] },
      manageUsers: true, createdBy: 'staff-1',
    })
    expect(m.record).toHaveBeenCalledWith(admin, { invitationId: 'inv-1', userId: 'new-user' })
    expect(admin.writes.some((w: any) => w.table === 'contacts')).toBe(false)
  })

  it('names the profile by the invited email when the invitation has no name', async () => {
    m.find.mockResolvedValue({ ...pending, first_name: '', last_name: '' })
    const admin = fakeAdmin()
    await accept(admin)
    expect(profileUpdate(admin).values.full_name).toBe('ana@client.com')
  })

  it('reuses a confirmed external login and sets the chosen password', async () => {
    const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-1', user_type: 'external', status: 'active' } })
    await accept(admin)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('ext-1', { password: 'long-enough', email_confirm: true })
  })

  it("leaves an active external profile as it is: a sys portal user keeps sys's type, status and name", async () => {
    const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-1', user_type: 'external', status: 'active' } })
    expect((await accept(admin)).status).toBe(200)
    expect(profileWrites(admin)).toEqual([])
    expect(m.setQcAccess.mock.calls[0][1]).toMatchObject({ userId: 'ext-1', companyId: 'co-1' })
  })

  it('activates a pending external profile (the sign-up trigger row)', async () => {
    const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-6', user_type: 'external', status: 'pending' } })
    expect((await accept(admin)).status).toBe(200)
    expect(profileUpdate(admin).values).toEqual({ user_type: 'external', status: 'active', is_active: true, full_name: 'Ana Lima' })
  })

  it('leaves a confirmed login alone with Microsoft', async () => {
    process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN = 'true'
    const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-1', user_type: 'external', status: 'active' } })
    expect((await accept(admin, { method: 'microsoft', password: null })).status).toBe(200)
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
  })

  it('always replaces the password of a login nobody confirmed, and confirms it', async () => {
    const withPassword = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-2', user_type: 'external', status: 'pending' }, confirmed: false })
    await accept(withPassword)
    expect(withPassword.auth.admin.updateUserById).toHaveBeenCalledWith('ext-2', { password: 'long-enough', email_confirm: true })

    process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN = 'true'
    const withMicrosoft = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-3', user_type: 'external', status: 'pending' }, confirmed: false })
    expect((await accept(withMicrosoft, { method: 'microsoft', password: null })).status).toBe(200)
    const [id, attrs] = withMicrosoft.auth.admin.updateUserById.mock.calls[0]
    expect(id).toBe('ext-3')
    expect(attrs.email_confirm).toBe(true)
    expect(typeof attrs.password).toBe('string')
    expect(attrs.password.length).toBeGreaterThanOrEqual(40)
  })

  it('refuses a switched-off or sys-invited account before writing anything, and the link works again', async () => {
    for (const [status, error] of [['disabled', SWITCHED_OFF], ['invited', PENDING_SYS_INVITATION]]) {
      const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-4', user_type: 'external', status } })
      expect(await accept(admin)).toEqual({ status: 409, body: { error } })
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
      expect(profileUpdate(admin)).toBeUndefined()
    }
    expect(m.release).toHaveBeenCalledTimes(2)
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('409 for a Wolthers account, and the link works again', async () => {
    const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'int-1', user_type: 'internal', status: 'active' } })
    expect((await accept(admin)).status).toBe(409)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('ignores a case-variant lookalike row whose email is not the invitation email', async () => {
    const admin = fakeAdmin({ account: { email: 'ana@client.com.evil', id: 'x-1', user_type: 'internal', status: 'active' } })
    expect((await accept(admin)).status).toBe(200)
    expect(admin.auth.admin.createUser).toHaveBeenCalled()
  })

  it('still answers success when the activity log fails after the link is spent', async () => {
    m.activity.mockRejectedValue(new Error('log down'))
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(200)
    expect(m.release).not.toHaveBeenCalled()
  })

  it('500 and release when something fails half-way', async () => {
    const admin = fakeAdmin({ createError: { message: 'boom' } })
    expect((await accept(admin)).status).toBe(500)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
  })

  it('500 and release when the QC access row cannot be written', async () => {
    m.setQcAccess.mockRejectedValue(new Error('check violation'))
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(500)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    expect(m.record).not.toHaveBeenCalled()
  })
})
