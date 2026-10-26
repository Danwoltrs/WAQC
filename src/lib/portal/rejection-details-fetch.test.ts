import { describe, it, expect, vi } from 'vitest'
import { fetchRejectionDetails } from './rejection-details-fetch'

type Row = { sample_id: string; green_bean_data: unknown; resolved_defects: unknown; created_at: string }

function adminWith(rows: Row[], error: unknown = null) {
  const inCalls: string[][] = []
  const admin = {
    from: () => {
      const q: any = {
        select: () => q,
        in: (_c: string, ids: string[]) => { inCalls.push(ids); q.ids = ids; return q },
        order: () => Promise.resolve({ data: error ? null : rows.filter(r => q.ids.includes(r.sample_id)), error }),
      }
      return q
    },
  }
  return { admin: admin as any, inCalls }
}
const qa = (id: string, at: string, defects: { name: string; count: number }[]): Row =>
  ({ sample_id: id, green_bean_data: { defects }, resolved_defects: null, created_at: at })

describe('fetchRejectionDetails', () => {
  it('the newest assessment of a sample wins', async () => {
    const { admin } = adminWith([
      qa('L1', '2026-01-01T00:00:00Z', [{ name: 'Black', count: 5 }]),
      qa('L1', '2026-02-01T00:00:00Z', [{ name: 'Sour', count: 5 }]),
    ])
    const out = await fetchRejectionDetails(admin, ['L1'])
    expect(out.get('L1')?.secondaryDefects).toEqual(['Sour'])
    expect(out.get('L1')?.primaryDefects).toEqual([])
  })

  it('splits 450 ids into 3 chunks of at most 200', async () => {
    const { admin, inCalls } = adminWith([])
    await fetchRejectionDetails(admin, Array.from({ length: 450 }, (_, i) => `L${i}`))
    expect(inCalls).toHaveLength(3)
    expect(inCalls.every(c => c.length <= 200)).toBe(true)
  })

  it('throws on a database error', async () => {
    const { admin } = adminWith([], { message: 'boom' })
    await expect(fetchRejectionDetails(admin, ['L1'])).rejects.toBeTruthy()
  })

  it('leaves out a sample whose assessment names nothing', async () => {
    const { admin } = adminWith([qa('L1', '2026-01-01T00:00:00Z', []), qa('L2', '2026-01-01T00:00:00Z', [{ name: 'Black', count: 2 }])])
    const out = await fetchRejectionDetails(admin, ['L1', 'L2'])
    expect(out.has('L1')).toBe(false)
    expect(out.has('L2')).toBe(true)
  })

  it('does not query for no ids', async () => {
    const { admin, inCalls } = adminWith([])
    expect((await fetchRejectionDetails(admin, [])).size).toBe(0)
    expect(inCalls).toHaveLength(0)
  })
})
