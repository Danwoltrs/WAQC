import { describe, it, expect } from 'vitest'
import { pickLabRow, settingsLabFor, loadHqLabId } from './lab-row'

const hq = { laboratory_id: 'hq', v: 1 }
const co = { laboratory_id: 'co', v: 2 }

describe('pickLabRow', () => {
  it('returns the row of the requested laboratory', () => {
    expect(pickLabRow([hq, co], 'co')).toBe(co)
  })
  it('never returns another laboratory\'s row', () => {
    expect(pickLabRow([hq], 'co')).toBeNull()
  })
  it('accepts the legacy single-object embed', () => {
    expect(pickLabRow(hq, 'hq')).toBe(hq)
    expect(pickLabRow(hq, 'co')).toBeNull()
  })
  it('null / undefined rows or null lab give null', () => {
    expect(pickLabRow(null, 'hq')).toBeNull()
    expect(pickLabRow(undefined, 'hq')).toBeNull()
    expect(pickLabRow([hq], null)).toBeNull()
  })
})

describe('settingsLabFor', () => {
  it('a global user with no lab uses HQ', () => {
    expect(settingsLabFor({ ownLabId: null, isGlobal: true, isHq: false }, 'hq')).toBe('hq')
  })
  it('own lab wins', () => {
    expect(settingsLabFor({ ownLabId: 'co', isGlobal: false, isHq: false }, 'hq')).toBe('co')
  })
})

function fakeDb(rows: { id: string }[] | null, error: unknown = null) {
  let calls = 0
  const db = {
    from: (_t: string) => ({
      select: () => ({
        eq: async () => {
          calls++
          return { data: rows, error }
        },
      }),
    }),
  }
  return { db: db as any, calls: () => calls }
}

describe('loadHqLabId', () => {
  it('returns the HQ lab id and caches per client', async () => {
    const f = fakeDb([{ id: 'hq' }])
    expect(await loadHqLabId(f.db)).toBe('hq')
    expect(await loadHqLabId(f.db)).toBe('hq')
    expect(f.calls()).toBe(1)
  })
  it('does not share the cache between clients', async () => {
    const a = fakeDb([{ id: 'a' }])
    const b = fakeDb([{ id: 'b' }])
    expect(await loadHqLabId(a.db)).toBe('a')
    expect(await loadHqLabId(b.db)).toBe('b')
  })
  it('throws when there is no HQ laboratory', async () => {
    await expect(loadHqLabId(fakeDb([]).db)).rejects.toThrow(/HQ/)
  })
  it('throws when there are several', async () => {
    await expect(loadHqLabId(fakeDb([{ id: 'a' }, { id: 'b' }]).db)).rejects.toThrow(/HQ/)
  })
  it('throws on a query error, and retries next time', async () => {
    const f = fakeDb(null, { message: 'boom' })
    await expect(loadHqLabId(f.db)).rejects.toThrow(/boom/)
    await expect(loadHqLabId(f.db)).rejects.toThrow(/boom/)
    expect(f.calls()).toBe(2)
  })
})
