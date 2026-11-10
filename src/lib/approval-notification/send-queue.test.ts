import { describe, it, expect, vi } from 'vitest'
import { fetchShareWithAllClients } from './send-queue'

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
  it('returns the clients that share with every party', async () => {
    const set = await fetchShareWithAllClients(db({ data: [{ company_id: 'c1' }], error: null }), ['c1', 'c2'])
    expect([...set]).toEqual(['c1'])
  })
  it('fails closed: a read error gives an empty set, so the PDF stays with the client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const set = await fetchShareWithAllClients(db({ data: null, error: { message: 'boom' } }), ['c1'])
    expect(set.size).toBe(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('does not query when there are no clients', async () => {
    expect((await fetchShareWithAllClients(db({ data: [], error: null }), [])).size).toBe(0)
  })
})
