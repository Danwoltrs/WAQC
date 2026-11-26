import { describe, it, expect } from 'vitest'
import { planQcUpsert, upsertQcRecipient, findContactByEmail } from './upsert'
import type { QcContactRecord } from './tags'

const existing = (over: Partial<QcContactRecord>): QcContactRecord => ({
  id: 'c1', company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost', nickname: null,
  phone: null, whatsapp: null, preferred_language: null, is_group: false,
  is_primary: null, is_active: true, routing_purposes: ['shipping_documents'], ...over,
})

const input = {
  email: 'joost@ahold.nl', name: 'Joost Pollmann', nickname: 'Joost',
  isGroup: false, phone: '+31', whatsapp: null, preferredLanguage: 'en',
}

describe('planQcUpsert', () => {
  it('plans an INSERT (tagged) when no contact exists', () => {
    const plan = planQcUpsert(null, 'co1', input, 'user1')
    expect(plan.kind).toBe('insert')
    if (plan.kind !== 'insert') return
    expect(plan.values).toMatchObject({
      company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost Pollmann',
      is_group: false, is_active: true, routing_purposes: ['qc_certificates'], created_by: 'user1',
    })
  })

  it('derives name from the email local-part when none is given', () => {
    const plan = planQcUpsert(null, 'co1', { email: 'team@ahold.nl', isGroup: true }, null)
    if (plan.kind !== 'insert') throw new Error('expected insert')
    expect(plan.values.name).toBe('team')
    expect(plan.values.is_group).toBe(true)
  })

  it('plans an UPDATE that unions the tag and preserves other purposes', () => {
    const plan = planQcUpsert(existing({}), 'co1', input, 'user1')
    expect(plan.kind).toBe('update')
    if (plan.kind !== 'update') return
    expect(plan.id).toBe('c1')
    expect(plan.values.routing_purposes).toEqual(['shipping_documents', 'qc_certificates'])
    expect(plan.values.is_active).toBe(true)
  })

  it('reactivates a deactivated contact on re-add', () => {
    const plan = planQcUpsert(existing({ is_active: false }), 'co1', input, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.is_active).toBe(true)
  })

  it('fills only BLANK fields and never clobbers an existing name', () => {
    const plan = planQcUpsert(existing({ name: 'Existing Name', phone: null }), 'co1', input, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.name).toBeUndefined() // existing non-blank name kept
    expect(plan.values.phone).toBe('+31')    // blank phone filled
  })

  it('does not flip an existing person/group kind', () => {
    const plan = planQcUpsert(existing({ is_group: false }), 'co1', { ...input, isGroup: true }, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.is_group).toBeUndefined()
  })
})

describe('owner-aware upsert', () => {
  function recDb(found: unknown[]) {
    const calls: Array<[string, ...unknown[]]> = []
    const q: any = {}
    for (const m of ['select', 'eq', 'ilike', 'is', 'order', 'limit', 'insert', 'update', 'single']) {
      q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q }
    }
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: found, error: null }).then(res)
    q.single = () => Promise.resolve({ data: { id: 'new' }, error: null })
    return { db: { from: () => q } as never, calls }
  }
  it('looks only at the owner\'s rows: HQ -> owner_lab_id IS NULL, a lab -> its id', async () => {
    const hq = recDb([])
    await findContactByEmail(hq.db, 'co1', 'a@b.c', null)
    expect(hq.calls).toContainEqual(['is', 'owner_lab_id', null])
    const co = recDb([])
    await findContactByEmail(co.db, 'co1', 'a@b.c', 'co')
    expect(co.calls).toContainEqual(['eq', 'owner_lab_id', 'co'])
  })
  it('Colombia upserting an email Santos owns inserts its own row with owner_lab_id', async () => {
    const { db, calls } = recDb([]) // Colombia has no copy of its own
    await upsertQcRecipient(db, 'co1', { email: 'joost@ahold.nl', isGroup: false }, 'u1', 'co')
    const ins = calls.find((c) => c[0] === 'insert')!
    expect(ins[1]).toMatchObject({ owner_lab_id: 'co', email: 'joost@ahold.nl' })
    expect(calls.find((c) => c[0] === 'update')).toBeUndefined()
  })
  it('orders the lookup (oldest first) before taking one row', async () => {
    const { db, calls } = recDb([])
    await findContactByEmail(db, 'co1', 'a@b.c', null)
    const order = calls.findIndex((c) => c[0] === 'order')
    expect(calls[order]).toEqual(['order', 'created_at', { ascending: true }])
    expect(order).toBeLessThan(calls.findIndex((c) => c[0] === 'limit'))
  })
  it('plans an insert stamped with the owner (NULL for HQ)', () => {
    const plan = planQcUpsert(null, 'co1', input, 'u1', 'co')
    if (plan.kind !== 'insert') throw new Error('expected insert')
    expect(plan.values.owner_lab_id).toBe('co')
    const hq = planQcUpsert(null, 'co1', input, 'u1')
    if (hq.kind !== 'insert') throw new Error('expected insert')
    expect(hq.values.owner_lab_id).toBeNull()
  })
})

describe('findContactByEmail: the email is a literal, not a pattern', () => {
  /** Postgres ILIKE with the default backslash escape: % any run, _ any one character, \x literal x. */
  function ilike(pattern: string, value: string): boolean {
    let re = ''
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i]
      if (ch === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      else if (ch === '%') re += '.*'
      else if (ch === '_') re += '.'
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    return new RegExp(`^${re}$`, 'i').test(value)
  }
  // A contacts table the query filters, as PostgREST would.
  function tableDb(rows: Array<Record<string, unknown>>) {
    let hits = [...rows]
    // ORDER BY the columns in the order given (the first is the primary key of the sort).
    const keys: string[] = []
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { hits = hits.filter((r) => r[c] === v); return q },
      is: (c: string, v: unknown) => { hits = hits.filter((r) => (r[c] ?? null) === v); return q },
      ilike: (c: string, p: string) => { hits = hits.filter((r) => ilike(p, String(r[c] ?? ''))); return q },
      order: (c: string) => { keys.push(c); return q },
      limit: (n: number) => {
        hits = [...hits].sort((a, b) => {
          for (const k of keys) { const d = String(a[k]).localeCompare(String(b[k])); if (d) return d }
          return 0
        }).slice(0, n)
        return q
      },
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: hits, error: null }).then(res),
    }
    return { from: () => q } as never
  }
  const row = (id: string, email: string, created_at = '2026-01-01') =>
    ({ id, company_id: 'co1', email, owner_lab_id: null, created_at })

  it('a_b@x.com does not match axb@x.com', async () => {
    expect(await findContactByEmail(tableDb([row('c1', 'axb@x.com')]), 'co1', 'a_b@x.com', null)).toBeNull()
  })
  it('a%b@x.com does not match a-long-b@x.com, and a backslash is literal too', async () => {
    expect(await findContactByEmail(tableDb([row('c1', 'a-long-b@x.com')]), 'co1', 'a%b@x.com', null)).toBeNull()
    expect(await findContactByEmail(tableDb([row('c1', 'ab@x.com')]), 'co1', 'a\\b@x.com', null)).toBeNull()
  })
  it('still matches the same email in another case, with the underscore', async () => {
    const found = await findContactByEmail(tableDb([row('c1', 'axb@x.com'), row('c2', 'A_B@X.com')]), 'co1', ' a_b@x.com ', null)
    expect(found?.id).toBe('c2')
  })
  it('the oldest of two copies wins', async () => {
    const found = await findContactByEmail(
      tableDb([row('new', 'ana@x.com', '2026-06-01'), row('old', 'ANA@x.com', '2025-01-01')]), 'co1', 'ana@x.com', null,
    )
    expect(found?.id).toBe('old')
  })
})
