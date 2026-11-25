import { describe, it, expect, vi } from 'vitest'
import { fetchShareWithAllClients, shareKey } from './send-queue'

const db = (result: { data: unknown; error: unknown }) =>
  ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = () => q
      q.eq = () => Promise.resolve(result)
      return q
    },
  }) as never

describe('fetchShareWithAllClients', () => {
  it('returns the (client, lab) pairs that share with every party', async () => {
    const set = await fetchShareWithAllClients(
      db({ data: [{ company_id: 'c1', laboratory_id: 'hq' }], error: null }),
      [{ company_id: 'c1', laboratory_id: 'hq' }, { company_id: 'c2', laboratory_id: 'hq' }],
    )
    expect([...set]).toEqual([shareKey('c1', 'hq')])
  })
  it('only the sample\'s own lab counts: a flag on HQ does not reach a Colombia sample', async () => {
    const rows = db({ data: [{ company_id: 'c1', laboratory_id: 'hq' }], error: null })
    const hq = await fetchShareWithAllClients(rows, [{ company_id: 'c1', laboratory_id: 'hq' }])
    const co = await fetchShareWithAllClients(rows, [{ company_id: 'c1', laboratory_id: 'co' }])
    expect(hq.has(shareKey('c1', 'hq'))).toBe(true)
    expect(co.has(shareKey('c1', 'co'))).toBe(false)
    expect(co.size).toBe(0)
  })
  it('fails closed: a read error gives an empty set, so the PDF stays with the client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const set = await fetchShareWithAllClients(db({ data: null, error: { message: 'boom' } }), [{ company_id: 'c1', laboratory_id: 'hq' }])
    expect(set.size).toBe(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('does not query when there are no clients', async () => {
    expect((await fetchShareWithAllClients(db({ data: [], error: null }), [])).size).toBe(0)
  })
})
