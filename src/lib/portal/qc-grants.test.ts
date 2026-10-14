// src/lib/portal/qc-grants.test.ts
import { describe, expect, it } from 'vitest'
import { listQcMembers, planQcAccess, removeQcAccess, setQcAccess, toQcMembers } from './qc-grants'

/**
 * Records every call. `existing` answers maybeSingle (readQcAccess), `rows`
 * an awaited select (listQcMembers), `deleted` an awaited delete().select().
 * auth.admin.getUserById answers from `signIns`, or with an error when
 * `failSignIn` is set.
 */
function fakeAdmin(opts: {
  existing?: any
  rows?: any[]
  deleted?: any[]
  signIns?: Record<string, string | null>
  failSignIn?: boolean
} = {}) {
  const calls: any[] = []
  return {
    calls,
    auth: {
      admin: {
        getUserById: async (id: string) =>
          opts.failSignIn
            ? { data: { user: null }, error: { message: 'auth down' } }
            : { data: { user: { id, last_sign_in_at: opts.signIns?.[id] ?? null } }, error: null },
      },
    },
    from(table: string) {
      const call: any = { table, op: 'select', filters: [] }
      calls.push(call)
      const chain: any = {
        select(columns?: string) { call.columns = columns; return chain },
        upsert(values: any, options: any) { call.op = 'upsert'; call.values = values; call.options = options; return chain },
        delete() { call.op = 'delete'; return chain },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return chain },
        maybeSingle() { return Promise.resolve({ data: opts.existing ?? null, error: null }) },
        then(ok: any, bad: any) {
          const data = call.op === 'delete' ? opts.deleted ?? [] : call.op === 'select' ? opts.rows ?? [] : null
          return Promise.resolve({ data, error: null }).then(ok, bad)
        },
      }
      return chain
    },
  } as any
}

describe('planQcAccess', () => {
  it('writes both arrays explicitly', () => {
    expect(planQcAccess(null, { keys: { views: ['qc_samples'], capabilities: [] } })).toEqual({ views: ['qc_samples'], capabilities: [] })
  })

  it('keeps only registry QC keys, whatever the caller passes: no sys key, no unknown key, no admin key without the flag', () => {
    const keys = {
      views: ['contracts', 'qc_reports', 'qc_samples', 'qc_samples', 'qc_unknown'],
      capabilities: ['manage_users', 'qc_manage_users', 'see_prices', 'qc_spec_edit'],
    } as any
    expect(planQcAccess(null, { keys })).toEqual({ views: ['qc_samples', 'qc_reports'], capabilities: ['qc_spec_edit'] })
  })

  it('adds qc_manage_users for a staff-made company admin', () => {
    expect(planQcAccess(null, { keys: { views: ['qc_samples'], capabilities: ['qc_spec_edit'] }, manageUsers: true }).capabilities)
      .toEqual(['qc_spec_edit', 'qc_manage_users'])
  })

  it('keeps qc_manage_users when the write does not mention it, and clears it only when told', () => {
    const existing = { views: ['qc_samples'], capabilities: ['qc_manage_users'] }
    expect(planQcAccess(existing, { keys: { views: ['qc_samples'], capabilities: [] } }).capabilities).toEqual(['qc_manage_users'])
    expect(planQcAccess(existing, { keys: { views: ['qc_samples'], capabilities: [] }, manageUsers: false }).capabilities).toEqual([])
  })
})

describe('setQcAccess', () => {
  it('creates the row with both arrays, the creator and a timestamp, and touches no other table', async () => {
    const admin = fakeAdmin()
    const result = await setQcAccess(admin, {
      userId: 'u1', companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: [] }, manageUsers: true, createdBy: 'staff-1',
    })
    expect(admin.calls[0]).toMatchObject({ op: 'select', filters: [['user_id', 'u1'], ['company_id', 'co-1']] })
    const write = admin.calls.find((c: any) => c.op === 'upsert')
    expect(write.values).toEqual({
      user_id: 'u1', company_id: 'co-1', views: ['qc_samples'], capabilities: ['qc_manage_users'],
      updated_at: expect.any(String), created_by: 'staff-1',
    })
    expect(write.options).toEqual({ onConflict: 'user_id,company_id' })
    expect(result).toEqual({ before: null, after: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
    expect(new Set(admin.calls.map((c: any) => c.table))).toEqual(new Set(['qc_portal_access']))
  })

  it('updates an existing row: new keys, the admin flag kept, the creator kept', async () => {
    const admin = fakeAdmin({ existing: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
    const result = await setQcAccess(admin, {
      userId: 'u1', companyId: 'co-1', keys: { views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] }, createdBy: 'm-1',
    })
    const write = admin.calls.find((c: any) => c.op === 'upsert')
    expect(write.values).not.toHaveProperty('created_by')
    expect(write.values).toMatchObject({ views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score', 'qc_manage_users'] })
    expect(result.before).toEqual({ views: ['qc_samples'], capabilities: ['qc_manage_users'] })
  })
})

describe('removeQcAccess', () => {
  it('deletes the row and reports what it held', async () => {
    const admin = fakeAdmin({ deleted: [{ views: ['qc_samples'], capabilities: ['qc_manage_users'] }] })
    expect(await removeQcAccess(admin, { userId: 'u1', companyId: 'co-1' }))
      .toEqual({ before: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
    expect(admin.calls).toHaveLength(1)
    expect(admin.calls[0]).toMatchObject({ table: 'qc_portal_access', op: 'delete', filters: [['user_id', 'u1'], ['company_id', 'co-1']] })
  })

  it('reports nothing removed when there was no row', async () => {
    expect(await removeQcAccess(fakeAdmin({ deleted: [] }), { userId: 'u1', companyId: 'co-1' })).toEqual({ before: null })
  })
})

describe('members', () => {
  const rows = [
    { user_id: 'u2', views: ['qc_samples'], capabilities: ['qc_manage_users'], user_profiles: { email: 'b@c.com', full_name: 'Bea', status: 'active' } },
    { user_id: 'u1', views: ['qc_samples'], capabilities: ['qc_spec_edit'], user_profiles: { email: 'a@c.com', full_name: 'Ana', status: 'active' } },
    { user_id: 'u3', views: [], capabilities: [], user_profiles: null },
  ]

  it('lists every row of the company, sorted by name, with keys, the admin flag and the last sign-in', () => {
    const members = toQcMembers(rows, new Map([['u1', '2026-10-01T00:00:00Z']]))
    expect(members.map((m) => [m.userId, m.isCompanyAdmin, m.lastSignInAt])).toEqual([
      ['u3', false, null], ['u1', false, '2026-10-01T00:00:00Z'], ['u2', true, null],
    ])
    expect(members[1]).toEqual({
      userId: 'u1', email: 'a@c.com', fullName: 'Ana', status: 'active',
      keys: { views: ['qc_samples'], capabilities: ['qc_spec_edit'] }, isCompanyAdmin: false, lastSignInAt: '2026-10-01T00:00:00Z',
    })
  })

  it("reads the company's rows with their profiles, and the last sign-in from the auth admin API", async () => {
    const admin = fakeAdmin({ rows: rows.slice(0, 2), signIns: { u2: '2026-10-10T00:00:00Z' } })
    const members = await listQcMembers(admin, 'co-1')
    expect(admin.calls[0]).toMatchObject({ table: 'qc_portal_access', op: 'select', filters: [['company_id', 'co-1']] })
    expect(admin.calls[0].columns).toContain('user_profiles(')
    expect(members.find((m) => m.userId === 'u2')?.lastSignInAt).toBe('2026-10-10T00:00:00Z')
    expect(new Set(admin.calls.map((c: any) => c.table))).toEqual(new Set(['qc_portal_access']))
  })

  it('a failed sign-in lookup leaves the date empty instead of failing the list', async () => {
    const admin = fakeAdmin({ rows: rows.slice(0, 1), failSignIn: true })
    expect((await listQcMembers(admin, 'co-1'))[0].lastSignInAt).toBeNull()
  })
})
