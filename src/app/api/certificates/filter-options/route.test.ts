import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  rpcResult: { data: [] as unknown[], error: null as { message: string } | null },
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
    rpc: (name: string) => {
      h.rpc(name)
      return Promise.resolve(h.rpcResult)
    },
  }),
}))

import { GET } from './route'

const call = () => GET()

describe('GET /api/certificates/filter-options', () => {
  beforeEach(() => {
    h.user = { id: 'u1' }
    h.rpc.mockClear()
    h.rpcResult = { data: [], error: null }
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns the folded clients and qualities', async () => {
    h.rpcResult = {
      data: [
        { client_id: 'c1', client_name: 'Ahold', quality_id: 'q1', quality_name: 'Santos 17/18' },
        { client_id: 'c1', client_name: 'Ahold', quality_id: null, quality_name: null },
        { client_id: 'c2', client_name: 'Dunkin', quality_id: 'q2', quality_name: 'Rainforest' },
      ],
      error: null,
    }
    const res = await call()
    expect(res.status).toBe(200)
    expect(h.rpc).toHaveBeenCalledWith('certificate_list_filter_options')
    const body = await res.json()
    expect(body.clients.map((c: { id: string }) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(body.qualities).toEqual(
      expect.arrayContaining([
        { id: 'q1', name: 'Santos 17/18', client_id: 'c1' },
        { id: 'q2', name: 'Rainforest', client_id: 'c2' },
      ]),
    )
    expect(body.qualities).toHaveLength(2)
  })

  it('returns 401 without a user', async () => {
    h.user = null
    const res = await call()
    expect(res.status).toBe(401)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('returns a generic 500 when the rpc fails, and logs the database error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dbError = { message: 'function public.certificate_list_filter_options() does not exist' }
    h.rpcResult = { data: [], error: dbError }
    const res = await call()
    expect(res.status).toBe(500)
    // The database's own words stay in the server log, not in the response.
    expect(await res.json()).toEqual({ error: 'Failed to load filter options' })
    expect(spy).toHaveBeenCalledWith(expect.any(String), dbError)
  })
})
