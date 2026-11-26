import { describe, it, expect } from 'vitest'
import { fetchOwnedContacts, ownerLabForSample } from './owned-rows'

function recorder(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: Array<[string, ...unknown[]]> = []
  const q: any = {}
  for (const m of ['select', 'in', 'eq', 'is', 'contains', 'not']) {
    q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q }
  }
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  const db = { from: (t: string) => { calls.push(['from', t]); return q } } as never
  return { db, calls }
}

describe('fetchOwnedContacts', () => {
  it('HQ owner (null) reads rows with no owner', async () => {
    const { db, calls } = recorder()
    await fetchOwnedContacts(db, ['c1'], null)
    expect(calls).toContainEqual(['is', 'owner_lab_id', null])
    expect(calls).toContainEqual(['in', 'company_id', ['c1']])
    expect(calls).toContainEqual(['eq', 'is_active', true])
  })
  it('a confined lab reads its own rows only', async () => {
    const { db, calls } = recorder()
    await fetchOwnedContacts(db, ['c1'], 'co')
    expect(calls).toContainEqual(['eq', 'owner_lab_id', 'co'])
    expect(calls.find((c) => c[0] === 'is')).toBeUndefined()
  })
  it('taggedOnly adds the qc_certificates tag filter; withEmailOnly drops empty emails', async () => {
    const { db, calls } = recorder()
    await fetchOwnedContacts(db, ['c1'], null, { taggedOnly: true, withEmailOnly: true })
    expect(calls).toContainEqual(['contains', 'routing_purposes', ['qc_certificates']])
    expect(calls).toContainEqual(['not', 'email', 'is', null])
  })
  it('no companies: no query', async () => {
    const { db, calls } = recorder()
    expect(await fetchOwnedContacts(db, [], null)).toEqual([])
    expect(calls).toEqual([])
  })
  it('throws on a read error', async () => {
    const { db } = recorder({ data: null, error: { message: 'boom' } })
    await expect(fetchOwnedContacts(db, ['c1'], null)).rejects.toThrow()
  })
})

function labDb(rows: Record<string, string>) {
  let reads = 0
  const db = {
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: () => { reads++; return Promise.resolve({ data: rows[id] ? { type: rows[id] } : null, error: null }) },
        }),
      }),
    }),
  } as never
  return { db, reads: () => reads }
}

describe('ownerLabForSample', () => {
  it('null for no lab and for the HQ lab', async () => {
    const { db } = labDb({ hq: 'hq', co: 'satellite' })
    expect(await ownerLabForSample(db, null)).toBeNull()
    expect(await ownerLabForSample(db, 'hq')).toBeNull()
  })
  it('the lab id for any other lab, cached per client', async () => {
    const { db, reads } = labDb({ hq: 'hq', co: 'satellite' })
    expect(await ownerLabForSample(db, 'co')).toBe('co')
    expect(await ownerLabForSample(db, 'co')).toBe('co')
    expect(reads()).toBe(1)
  })
})
