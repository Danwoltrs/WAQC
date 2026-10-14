import { describe, expect, it } from 'vitest'
import { ensureWaqcProfile } from './ensure-profile'

/** Tiny fake of the service-role client: canned rows per table, records writes. */
function fakeAdmin(rows: Record<string, any[]>, opts: { userProfilesError?: any; insertError?: any } = {}) {
  const writes: Array<{ table: string; op: string; values: any }> = []
  const db: any = {
    writes,
    from(table: string) {
      const preds: Array<(r: any) => boolean> = []
      let op = 'select'
      let values: any = null
      const chain: any = {
        select() { return chain },
        insert(v: any) { op = 'insert'; values = v; return chain },
        update(v: any) { op = 'update'; values = v; return chain },
        eq(c: string, v: unknown) { preds.push((r) => r[c] === v); return chain },
        ilike(c: string, v: string) {
          // real LIKE semantics: % and _ are wildcards unless escaped with a backslash
          let re = ''
          for (let i = 0; i < v.length; i++) {
            const ch = v[i]
            if (ch === '\\') { i++; re += (v[i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
            else if (ch === '%') re += '.*'
            else if (ch === '_') re += '.'
            else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          }
          const rx = new RegExp(`^${re}$`, 'i')
          preds.push((r) => rx.test(String(r[c])))
          return chain
        },
        gt() { return chain },
        not(c: string, _op: string, list: string) {
          const banned = list.replace(/[()"]/g, '').split(',')
          preds.push((r) => !banned.includes(r[c]))
          return chain
        },
        order() { return chain },
        limit() { return chain },
        maybeSingle() {
          if (op !== 'select') writes.push({ table, op, values })
          const hit = (rows[table] ?? []).find((r) => preds.every((p) => p(r)))
          if (table === 'user_profiles' && opts.userProfilesError) return Promise.resolve({ data: null, error: opts.userProfilesError })
          if (op === 'insert' && opts.insertError) return Promise.resolve({ data: null, error: opts.insertError })
          if (op === 'insert') return Promise.resolve({ data: { id: values.id, ...values }, error: null })
          return Promise.resolve({ data: hit ?? null, error: null })
        },
        then(ok: any, bad: any) {
          if (op !== 'select') writes.push({ table, op, values })
          return Promise.resolve({ data: null, error: null }).then(ok, bad)
        },
      }
      return chain
    },
  }
  return db
}

const CONFIRMED = '2026-01-01T00:00:00Z'
const SANTOS_ROW = { id: 'santos', code: 'SANTOS_HQ' }

describe('ensureWaqcProfile', () => {
  it('returns an existing profile untouched', async () => {
    const admin = fakeAdmin({ profiles: [{ id: 'u1', qc_role: 'lab_personnel' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u1', email: 'x@wolthers.com', email_confirmed_at: CONFIRMED }))
      .toEqual({ profile: { id: 'u1', qc_role: 'lab_personnel' }, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing for an external user', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u2', user_type: 'external' }], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u2', email: 'buyer@client.com', email_confirmed_at: CONFIRMED })).toEqual({ profile: null, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing for a stranger', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [], user_invitations: [], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u3', email: 'a@gmail.com', email_confirmed_at: CONFIRMED })).toEqual({ profile: null, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates a staff profile for a wolthers address', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u4', user_type: 'internal' }], user_invitations: [], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    const result = await ensureWaqcProfile(admin, { id: 'u4', email: 'joao@wolthers.com', email_confirmed_at: CONFIRMED, user_metadata: { full_name: 'Joao Silva' } })
    expect(result.created).toBe(true)
    expect(admin.writes[0]).toMatchObject({ table: 'profiles', op: 'insert', values: { id: 'u4', email: 'joao@wolthers.com', qc_role: 'lab_personnel', laboratory_id: 'santos' } })
  })

  const inv = (over: Record<string, any> = {}) => ({
    id: 'inv-1', email: 'aXb@x.com', first_name: 'A', last_name: 'B', qc_role: 'lab_personnel', laboratory_id: 'lab-gt',
    is_cupper: false, is_q_grader: false, qc_enabled: true, status: 'pending', ...over,
  })

  it('claims an invitation for the exact sign-in email, ignoring case', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [], user_invitations: [inv({ email: 'A_b@x.com' })], laboratories: [SANTOS_ROW] })
    const result = await ensureWaqcProfile(admin, { id: 'u5', email: 'a_B@x.com', email_confirmed_at: CONFIRMED })
    expect(result.created).toBe(true)
    expect(admin.writes[0]).toMatchObject({ table: 'profiles', values: { qc_role: 'lab_personnel', laboratory_id: 'lab-gt' } })
    expect(admin.writes[1]).toMatchObject({ table: 'user_invitations', op: 'update' })
  })

  it('does not let a_b@x.com claim the invitation for aXb@x.com', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [], user_invitations: [inv()], laboratories: [SANTOS_ROW] })
    expect(await ensureWaqcProfile(admin, { id: 'u6', email: 'a_b@x.com', email_confirmed_at: CONFIRMED })).toEqual({ profile: null, created: false })
    expect(admin.writes).toEqual([])
  })

  it('ignores an invitation for an external role', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [], user_invitations: [inv({ email: 'c@x.com', qc_role: 'client' })], laboratories: [SANTOS_ROW] })
    expect(await ensureWaqcProfile(admin, { id: 'u7', email: 'c@x.com', email_confirmed_at: CONFIRMED })).toEqual({ profile: null, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing while the sign-in email is unconfirmed', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [], user_invitations: [inv({ email: 'c@x.com' })], laboratories: [SANTOS_ROW] })
    expect(await ensureWaqcProfile(admin, { id: 'u8', email: 'c@x.com' })).toEqual({ profile: null, created: false })
    expect(await ensureWaqcProfile(admin, { id: 'u8', email: 'joao@wolthers.com', email_confirmed_at: null })).toEqual({ profile: null, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing for a non-pending external row, even with a staff invitation or a wolthers address', async () => {
    for (const status of ['active', 'invited', 'disabled']) {
      const withInvite = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u9', user_type: 'external', status }], user_invitations: [inv({ email: 'ana@lab.com' })], laboratories: [SANTOS_ROW] })
      expect(await ensureWaqcProfile(withInvite, { id: 'u9', email: 'ana@lab.com', email_confirmed_at: CONFIRMED })).toEqual({ profile: null, created: false })
      expect(withInvite.writes).toEqual([])
      const wolthers = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u9', user_type: 'external', status }], user_invitations: [], laboratories: [SANTOS_ROW] })
      expect(await ensureWaqcProfile(wolthers, { id: 'u9', email: 'joao@wolthers.com', email_confirmed_at: CONFIRMED })).toEqual({ profile: null, created: false })
      expect(wolthers.writes).toEqual([])
    }
  })

  it('a pending external row is claimed only through the exact staff invitation', async () => {
    const withInvite = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u9', user_type: 'external', status: 'pending' }], user_invitations: [inv({ email: 'ana@lab.com' })], laboratories: [SANTOS_ROW] })
    const result = await ensureWaqcProfile(withInvite, { id: 'u9', email: 'ana@lab.com', email_confirmed_at: CONFIRMED })
    expect(result.created).toBe(true)
    expect(withInvite.writes[0]).toMatchObject({ table: 'profiles', values: { qc_enabled: true, qc_role: 'lab_personnel' } })
    const wolthers = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u9', user_type: 'external', status: 'pending' }], user_invitations: [], laboratories: [SANTOS_ROW] })
    expect(await ensureWaqcProfile(wolthers, { id: 'u9', email: 'joao@wolthers.com', email_confirmed_at: CONFIRMED })).toEqual({ profile: null, created: false })
    expect(wolthers.writes).toEqual([])
  })

  it('fails closed when user_profiles cannot be read', async () => {
    const admin = fakeAdmin({ profiles: [], laboratories: [SANTOS_ROW] }, { userProfilesError: { message: 'boom' } })
    await expect(ensureWaqcProfile(admin, { id: 'u10', email: 'joao@wolthers.com', email_confirmed_at: CONFIRMED })).rejects.toMatchObject({ message: 'boom' })
    expect(admin.writes).toEqual([])
  })

  it('re-reads the profile when a concurrent insert wins (23505)', async () => {
    let reads = 0
    const rows: any[] = []
    Object.defineProperty(rows, 'find', { value: () => (++reads >= 2 ? { id: 'u11', qc_role: 'lab_personnel' } : undefined) })
    const admin = fakeAdmin({ profiles: rows, user_profiles: [], user_invitations: [], laboratories: [SANTOS_ROW] }, { insertError: { code: '23505' } })
    const result = await ensureWaqcProfile(admin, { id: 'u11', email: 'joao@wolthers.com', email_confirmed_at: CONFIRMED })
    expect(result).toEqual({ profile: { id: 'u11', qc_role: 'lab_personnel' }, created: false })
  })
})
