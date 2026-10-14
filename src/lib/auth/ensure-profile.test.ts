import { describe, expect, it } from 'vitest'
import { ensureWaqcProfile } from './ensure-profile'

/** Tiny fake of the service-role client: canned rows per table, records writes. */
function fakeAdmin(rows: Record<string, any[]>) {
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
        ilike(c: string, v: string) { preds.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return chain },
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

describe('ensureWaqcProfile', () => {
  it('returns an existing profile untouched', async () => {
    const admin = fakeAdmin({ profiles: [{ id: 'u1', qc_role: 'lab_personnel' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u1', email: 'x@wolthers.com' }))
      .toEqual({ profile: { id: 'u1', qc_role: 'lab_personnel' }, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing for an external user', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u2', user_type: 'external' }], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u2', email: 'buyer@client.com' })).toEqual({ profile: null, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing for a stranger', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [], user_invitations: [], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u3', email: 'a@gmail.com' })).toEqual({ profile: null, created: false })
  })

  it('creates a staff profile for a wolthers address', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u4', user_type: 'internal' }], user_invitations: [], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    const result = await ensureWaqcProfile(admin, { id: 'u4', email: 'joao@wolthers.com', user_metadata: { full_name: 'Joao Silva' } })
    expect(result.created).toBe(true)
    expect(admin.writes[0]).toMatchObject({ table: 'profiles', op: 'insert', values: { id: 'u4', email: 'joao@wolthers.com', qc_role: 'lab_personnel', laboratory_id: 'santos' } })
  })
})
