// src/lib/portal/portal-invitations.test.ts
import { describe, expect, it, vi } from 'vitest'
import {
  cancelInvitation, claimInvitation, findCompanyInvitation, findInvitationByToken, InvitationConflictError,
  listPendingInvitations, recordAcceptedUser, releaseInvitation, reissueInvitation, createInvitationToken, createPortalInvitation, escapeLike, hashInvitationToken,
  invitationState, isValidEmail, normalizeEmail, toInvitationSummary,
} from './portal-invitations'

/** Records every call; `results[table]` answers the awaited chain. */
function fakeAdmin(results: Record<string, any> = {}, insertErrors: any[] = [], updateError: any = null) {
  const calls: Array<{ table: string; op: string; values?: any; filters: Array<[string, unknown]> }> = []
  return {
    calls,
    from(table: string) {
      const call: any = { table, op: 'select', filters: [] }
      calls.push(call)
      const chain: any = {
        select() { return chain },
        insert(v: any) { call.op = 'insert'; call.values = v; return chain },
        update(v: any) { call.op = 'update'; call.values = v; return chain },
        eq(c: string, v: unknown) { call.filters.push([c, v]); return chain },
        gt(c: string, v: unknown) { call.filters.push([`${c}>`, v]); return chain },
        is(c: string, v: unknown) { call.filters.push([`${c} is`, v]); return chain },
        order() { return chain },
        single() {
          const error = insertErrors.shift() ?? null
          return Promise.resolve({ data: error ? null : { id: 'inv-new', ...call.values }, error })
        },
        maybeSingle() { return Promise.resolve({ data: results[`${table}:${call.op}`] ?? null, error: null }) },
        then(ok: any, bad: any) {
          const error = call.op === 'update' ? updateError : null
          return Promise.resolve({ data: results[`${table}:${call.op}`] ?? null, error }).then(ok, bad)
        },
      }
      return chain
    },
  } as any
}

describe('email helpers', () => {
  it('normalizes and validates', () => {
    expect(normalizeEmail('  John.Doe@Client.COM ')).toBe('john.doe@client.com')
    expect(isValidEmail('john.doe@client.com')).toBe(true)
    expect(isValidEmail('john@client')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('rejects the unescapable "*" wildcard', () => {
    expect(isValidEmail('a*b@x.com')).toBe(false)
    expect(isValidEmail('a@x.com*')).toBe(false)
    expect(() => escapeLike('j*@client.com')).toThrow()
  })

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('a_b%c\\d@x.com')).toBe('a\\_b\\%c\\\\d@x.com')
  })
})

describe('tokens', () => {
  it('stores only a SHA-256 hash of a random 32-byte token', () => {
    const a = createInvitationToken()
    const b = createInvitationToken()
    expect(a.token).not.toBe(b.token)
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.tokenHash).toBe(hashInvitationToken(a.token))
  })
})

describe('invitationState', () => {
  const now = new Date('2026-10-14T12:00:00Z')
  it('is usable only while pending and unexpired', () => {
    expect(invitationState({ status: 'pending', expires_at: '2026-10-15T00:00:00Z' }, now)).toBe('usable')
    expect(invitationState({ status: 'pending', expires_at: '2026-10-14T12:00:00Z' }, now)).toBe('expired')
    expect(invitationState({ status: 'expired', expires_at: '2026-10-20T00:00:00Z' }, now)).toBe('expired')
    expect(invitationState({ status: 'pending', expires_at: 'garbage' }, now)).toBe('expired')
    expect(invitationState({ status: 'accepted', expires_at: '2026-10-20T00:00:00Z' }, now)).toBe('used')
    expect(invitationState({ status: 'cancelled', expires_at: '2026-10-20T00:00:00Z' }, now)).toBe('cancelled')
  })
})

describe('createPortalInvitation', () => {
  it('cancels the pending one for the same company and email, then inserts a hashed, 7-day invitation', async () => {
    const admin = fakeAdmin()
    const now = new Date('2026-10-14T12:00:00Z')
    const { invitation, token } = await createPortalInvitation(admin, {
      companyId: 'co-1', email: ' Ana@Client.com ', firstName: ' Ana ', lastName: 'Lima',
      keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: true, invitedBy: 'staff-1', invitedByKind: 'staff', now,
    })
    expect(admin.calls.map((c: any) => c.op)).toEqual(['update', 'insert'])
    expect(admin.calls[0]).toMatchObject({ values: { status: 'cancelled' }, filters: [['company_id', 'co-1'], ['email', 'ana@client.com'], ['status', 'pending']] })
    expect(admin.calls[1].values).toMatchObject({
      company_id: 'co-1', email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima', views: ['qc_samples'], capabilities: [],
      is_company_admin: true, invited_by: 'staff-1', invited_by_kind: 'staff', status: 'pending',
      token_hash: hashInvitationToken(token), expires_at: '2026-10-21T12:00:00.000Z',
    })
    expect(invitation.id).toBe('inv-new')
  })
})

describe('claimInvitation', () => {
  it('is true only when the pending row flipped', async () => {
    expect(await claimInvitation(fakeAdmin({ 'portal_invitations:update': [{ id: 'i' }] }), { invitationId: 'i' })).toBe(true)
    expect(await claimInvitation(fakeAdmin({ 'portal_invitations:update': [] }), { invitationId: 'i' })).toBe(false)
  })
})

describe('toInvitationSummary', () => {
  it('never carries the token hash', () => {
    const summary = toInvitationSummary({
      id: 'i', company_id: 'c', email: 'a@b.com', first_name: 'A', last_name: 'B', views: ['qc_samples', 'contracts'], capabilities: [],
      is_company_admin: false, invited_by: 'u', invited_by_kind: 'manager', status: 'pending', expires_at: 'x',
      accepted_at: null, accepted_user_id: null, created_at: 'y', token_hash: 'secret',
    } as any)
    expect(JSON.stringify(summary)).not.toContain('secret')
    expect(summary.keys).toEqual({ views: ['qc_samples'], capabilities: [] })
  })
})

const NOW = new Date('2026-10-14T12:00:00Z')
const createArgs = {
  companyId: 'co-1', email: 'a@b.com', firstName: 'A', lastName: 'B',
  keys: { views: [], capabilities: [] }, isCompanyAdmin: false, invitedBy: 'u', invitedByKind: 'manager' as const, now: NOW,
}

describe('createPortalInvitation concurrency', () => {
  it('retries cancel + insert once after a 23505', async () => {
    const admin = fakeAdmin({}, [{ code: '23505' }])
    const { invitation } = await createPortalInvitation(admin, createArgs)
    expect(admin.calls.map((c: any) => c.op)).toEqual(['update', 'insert', 'update', 'insert'])
    expect(invitation.id).toBe('inv-new')
  })

  it('throws InvitationConflictError when the retry conflicts too', async () => {
    const admin = fakeAdmin({}, [{ code: '23505' }, { code: '23505' }])
    await expect(createPortalInvitation(admin, createArgs)).rejects.toBeInstanceOf(InvitationConflictError)
    expect(admin.calls).toHaveLength(4)
  })

  it('does not retry other errors', async () => {
    const admin = fakeAdmin({}, [{ code: '42501' }])
    await expect(createPortalInvitation(admin, createArgs)).rejects.toMatchObject({ code: '42501' })
    expect(admin.calls).toHaveLength(2)
  })
})

describe('store guards', () => {
  it('claim filters pending and unexpired', async () => {
    const admin = fakeAdmin({ 'portal_invitations:update': [{ id: 'i' }] })
    await claimInvitation(admin, { invitationId: 'i', now: NOW })
    expect(admin.calls[0].filters).toEqual([['id', 'i'], ['status', 'pending'], ['expires_at>', NOW.toISOString()]])
    expect(admin.calls[0].values).toMatchObject({ status: 'accepted' })
  })

  it('release only undoes a claim that has no user yet', async () => {
    const admin = fakeAdmin()
    await releaseInvitation(admin, 'i')
    expect(admin.calls[0].filters).toEqual([['id', 'i'], ['status', 'accepted'], ['accepted_user_id is', null]])
    expect(admin.calls[0].values).toMatchObject({ status: 'pending', accepted_at: null })
  })

  it('release is quiet on 23505 and logs other errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await releaseInvitation(fakeAdmin({}, [], { code: '23505' }), 'i')
    expect(spy).not.toHaveBeenCalled()
    await releaseInvitation(fakeAdmin({}, [], { code: 'XX000' }), 'i')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('recordAcceptedUser is guarded and needs exactly one row', async () => {
    const ok = fakeAdmin({ 'portal_invitations:update': [{ id: 'i' }] })
    await recordAcceptedUser(ok, { invitationId: 'i', userId: 'u' })
    expect(ok.calls[0].filters).toEqual([['id', 'i'], ['status', 'accepted'], ['accepted_user_id is', null]])
    await expect(recordAcceptedUser(fakeAdmin({ 'portal_invitations:update': [] }), { invitationId: 'i', userId: 'u' })).rejects.toThrow()
  })

  it('cancel, reissue, find and list are scoped to the company', async () => {
    const admin = fakeAdmin()
    await cancelInvitation(admin, { invitationId: 'i', companyId: 'co-1' })
    await reissueInvitation(admin, { invitationId: 'i', companyId: 'co-1', now: NOW })
    await findCompanyInvitation(admin, { invitationId: 'i', companyId: 'co-1' })
    await listPendingInvitations(admin, 'co-1', NOW)
    for (const c of admin.calls) expect(c.filters).toContainEqual(['company_id', 'co-1'])
    expect(admin.calls[0].filters).toContainEqual(['status', 'pending'])
    expect(admin.calls[1].filters).toContainEqual(['status', 'pending'])
    expect(admin.calls[3].filters).toContainEqual(['expires_at>', NOW.toISOString()])
  })

  it('finds by the hash of the token, never the raw token', async () => {
    const admin = fakeAdmin()
    const { token, tokenHash } = createInvitationToken()
    await findInvitationByToken(admin, token)
    expect(admin.calls[0].filters).toEqual([['token_hash', tokenHash]])
    await findInvitationByToken(admin, 'short')
    expect(admin.calls).toHaveLength(1)
  })
})
