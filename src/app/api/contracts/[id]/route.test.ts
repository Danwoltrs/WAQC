import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A laboratory other than HQ gets no sys contract lookup for now: the contract
 * by id is a 404 for it, and contracts is never read.
 */

const state = vi.hoisted(() => ({
  from: null as any,
  scope: { ownLabId: null as string | null, isGlobal: false, isHq: false },
}))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    from: (t: string) => state.from(t),
  }),
}))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/lab-scope')>()),
  loadLabScope: async () => state.scope,
}))

import { GET } from './route'

const ID = '11111111-1111-4111-8111-111111111111'
const call = () => GET({} as any, { params: Promise.resolve({ id: ID }) })

beforeEach(() => {
  state.from = vi.fn(() => {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }
    return q
  })
})

describe('GET /api/contracts/[id] for a confined laboratory', () => {
  it('answers 404 Contract not found and never reads contracts', async () => {
    state.scope = { ownLabId: 'lab-co', isGlobal: false, isHq: false }
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Contract not found' })
    expect(state.from).not.toHaveBeenCalledWith('contracts')
  })

  it('still reads contracts for HQ staff', async () => {
    state.scope = { ownLabId: 'lab-hq', isGlobal: false, isHq: true }
    const res = await call()
    expect(res.status).toBe(404)
    expect(state.from).toHaveBeenCalledWith('contracts')
  })
})
