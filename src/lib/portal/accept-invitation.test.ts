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
import { INVALID_INVITATION, acceptInvitation, describeInvitation } from './accept-invitation'

const pending = {
  id: 'inv-1', company_id: 'co-1', email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima',
  views: ['qc_samples'], capabilities: [], is_company_admin: true, invited_by: 'staff-1', invited_by_kind: 'staff',
  status: 'pending', expires_at: '2999-01-01T00:00:00Z', accepted_at: null, accepted_user_id: null, created_at: '2026-10-14T00:00:00Z',
}
const TOKEN = 't'.repeat(43)

function fakeAdmin(opts: { account?: any; createError?: any; confirmed?: boolean; staff?: any; staffById?: any; qcAccess?: any; loginEmail?: string; updateError?: any } = {}) {
  const auth = {
    createUser: vi.fn(async () => (opts.createError ? { data: null, error: opts.createError } : { data: { user: { id: 'new-user' } }, error: null })),
    getUserById: vi.fn(async (id: string) => ({
      data: { user: { id, email: opts.loginEmail ?? 'ana@client.com', email_confirmed_at: opts.confirmed === false ? null : '2026-01-01T00:00:00Z' } }, error: null,
    })),
    updateUserById: vi.fn(async () => ({ data: {}, error: opts.updateError ?? null })),
  }
  const writes: any[] = []
  const admin: any = {
    auth: { admin: auth },
    writes,
    from(table: string) {
      let op = 'select'
      let values: any = null
      let byId = false
      const chain: any = {
        select() { return chain },
        update(v: any) { op = 'update'; values = v; return chain },
        insert(v: any) { writes.push({ table, op: 'insert', values: v }); return Promise.resolve({ error: null }) },
        eq(c?: string) { if (c === 'id') byId = true; return chain },
        ilike() { return chain },
        maybeSingle() { return Promise.resolve({ data: table === 'user_profiles' ? opts.account ?? null : table === 'profiles' ? (byId ? opts.staffById ?? null : opts.staff ?? null) : table === 'qc_portal_access' ? opts.qcAccess ?? null : null, error: null }) },
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

let errorLog: ReturnType<typeof vi.spyOn>
let logsExpected = false
/** Failure tests call this to say console.error output is expected; any other test must stay silent. */
const logged = () => { logsExpected = true }
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  logsExpected = false
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  m.find.mockResolvedValue(pending)
  m.claim.mockResolvedValue(true)
  m.setQcAccess.mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
})

afterEach(() => {
  if (!logsExpected) expect(errorLog).not.toHaveBeenCalled()
  vi.restoreAllMocks(); delete process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN })

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

  it('ignores an account row whose email only matches the invitation by pattern, not exactly', async () => {
    const admin = fakeAdmin({ account: { email: 'ana@client.com.evil', id: 'x-1', user_type: 'internal', status: 'active' } })
    expect((await accept(admin)).status).toBe(200)
    expect(admin.auth.admin.createUser).toHaveBeenCalled()
  })

  it('still answers success when the activity log fails after the link is spent', async () => {
    m.activity.mockRejectedValue(new Error('log down'))
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(200)
    expect(m.release).not.toHaveBeenCalled()
    logged(); expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('activity log failed'), expect.any(Error))
  })

  it('500 and release when something fails half-way', async () => {
    const admin = fakeAdmin({ createError: { message: 'boom' } })
    expect((await accept(admin)).status).toBe(500)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    logged(); expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('accepting invitation failed'), expect.anything())
  })

  it('500 and release when the QC access row cannot be written', async () => {
    m.setQcAccess.mockRejectedValue(new Error('check violation'))
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(500)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    expect(m.record).not.toHaveBeenCalled()
    logged(); expect(errorLog).toHaveBeenCalled()
  })

  it('410 and nothing claimed when the invitation grants no QC view', async () => {
    m.find.mockResolvedValue({ ...pending, views: [], capabilities: ['qc_spec_edit'] })
    const admin = fakeAdmin()
    expect(await accept(admin)).toEqual({ status: 410, body: { error: INVALID_INVITATION } })
    expect(m.claim).not.toHaveBeenCalled()
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('409 and release when the reused login email differs from the invitation', async () => {
    const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-1', user_type: 'external', status: 'active' }, loginEmail: 'other@x.com' })
    expect((await accept(admin)).status).toBe(409)
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('counts password bytes: 37 two-byte characters (74 bytes) are too long', async () => {
    expect((await accept(fakeAdmin(), { password: 'é'.repeat(37) })).status).toBe(400)
    expect(m.claim).not.toHaveBeenCalled()
    expect((await accept(fakeAdmin(), { password: 'é'.repeat(36) })).status).toBe(200)
  })

  it('400 with a readable reason and a release when GoTrue rejects the password', async () => {
    const admin = fakeAdmin({
      account: { email: 'ana@client.com', id: 'ext-1', user_type: 'external', status: 'active' },
      updateError: { code: 'weak_password', message: 'Password is known to be weak', status: 422 },
    })
    const result = await accept(admin)
    logged()
    expect(result.status).toBe(400)
    expect(String(result.body.error)).toContain('Password is known to be weak')
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
  })

  it('500 JSON when the lookup or the claim throws; a claim that may have landed is released', async () => {
    m.find.mockRejectedValueOnce(new Error('db down'))
    expect((await accept(fakeAdmin())).status).toBe(500)
    expect(m.release).not.toHaveBeenCalled()
    m.claim.mockRejectedValueOnce(new Error('timeout'))
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(500)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    logged(); expect(errorLog).toHaveBeenCalled()
  })

  it('a Microsoft-method secret rejected by GoTrue is a 500 (a retry draws a new one)', async () => {
    process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN = 'true'
    const admin = fakeAdmin({
      account: { email: 'ana@client.com', id: 'ext-2', user_type: 'external', status: 'pending' }, confirmed: false,
      updateError: { code: 'weak_password', message: 'weak', status: 422 },
    })
    expect((await accept(admin, { method: 'microsoft', password: null })).status).toBe(500)
    logged()
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
  })

  it('activates a pending account whose access row already exists and leaves the row unchanged, logging the row keys', async () => {
    const row = { views: ['qc_cupping'], capabilities: ['qc_spec_edit', 'qc_manage_users'] }
    const admin = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-5', user_type: 'external', status: 'pending' }, qcAccess: row })
    expect((await accept(admin)).status).toBe(200)
    expect(profileUpdate(admin).values.status).toBe('active')
    expect(m.setQcAccess).not.toHaveBeenCalled()
    expect(m.activity.mock.calls[0][1].keysAfter).toEqual({ views: ['qc_cupping'], capabilities: ['qc_spec_edit'] })
  })

  it('leaves an existing qc_portal_access row alone (stale non-admin invitation over an admin row)', async () => {
    m.find.mockResolvedValue({ ...pending, is_company_admin: false, invited_by_kind: 'manager' })
    const admin = fakeAdmin({
      account: { email: 'ana@client.com', id: 'ext-1', user_type: 'external', status: 'active' },
      qcAccess: { views: ['qc_samples', 'qc_cupping'], capabilities: ['qc_manage_users'] },
    })
    expect((await accept(admin)).status).toBe(200)
    expect(m.setQcAccess).not.toHaveBeenCalled()
    expect(m.record).toHaveBeenCalledWith(admin, { invitationId: 'inv-1', userId: 'ext-1' })
  })

  it('409 and release for a Wolthers staff profile, and ignores an external-role or inexact one', async () => {
    const staff = fakeAdmin({ staff: { id: 's1', email: 'ana@client.com', qc_role: 'lab_manager' } })
    expect((await accept(staff)).status).toBe(409)
    expect(m.release).toHaveBeenCalledWith(staff, 'inv-1')
    expect(staff.auth.admin.createUser).not.toHaveBeenCalled()
    expect((await accept(fakeAdmin({ staff: { id: 's2', email: 'ana@client.com', qc_role: 'client' } }))).status).toBe(200)
    // the profiles.email copy was edited away: the account id still finds the staff row
    const edited = fakeAdmin({ account: { email: 'ana@client.com', id: 'ext-1', user_type: 'external', status: 'active' }, staffById: { id: 'ext-1', qc_role: 'lab_manager' } })
    expect((await accept(edited)).status).toBe(409)
    expect(m.release).toHaveBeenCalledWith(edited, 'inv-1')
    expect((await accept(fakeAdmin({ staff: { id: 's3', email: 'ana@client.com.x', qc_role: 'lab_manager' } }))).status).toBe(200)
  })
})

describe('describeInvitation', () => {
  it('returns exactly the fields the page shows', async () => {
    const admin = fakeAdmin({ account: { full_name: 'Dan Wolthers' } })
    expect(await describeInvitation(admin, TOKEN)).toEqual({
      email: 'ana@client.com', firstName: 'Ana', companyName: 'Roastery One', inviterName: 'Dan Wolthers',
      expiresAt: '2999-01-01T00:00:00Z', microsoft: false,
    })
  })

  it('is null for unknown, used, expired, cancelled and view-less invitations', async () => {
    for (const row of [null, { ...pending, status: 'accepted' }, { ...pending, expires_at: '2000-01-01T00:00:00Z' }, { ...pending, status: 'cancelled' }, { ...pending, views: [] }]) {
      m.find.mockResolvedValueOnce(row)
      expect(await describeInvitation(fakeAdmin(), TOKEN)).toBeNull()
    }
  })
})
