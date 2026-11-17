import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  writes: [] as { op: string; payload: any }[],
  failSensory: false,
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) } }),
}))
vi.mock('@/lib/cupping-protocol-scope', () => ({ excludeCvaScores: (q: any) => q, excludeCvaSessions: (q: any) => q }))
vi.mock('@/lib/sample-edit-permissions', () => ({ computeContentLock: () => ({ contentLocked: false }) }))
const load = vi.hoisted(() => ({ loadSampleSensoryConfig: vi.fn() }))
vi.mock('@/lib/sensory/load-config', () => load)

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      let op = 'select'
      let payload: any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        contains: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (res: any) => res({ data: [], error: null }),
        insert: (p: any) => { op = 'insert'; payload = p; return chain },
        update: (p: any) => { op = 'update'; payload = p; return chain },
        single: async () => {
          if (table !== 'cupping_scores' || op === 'select') return { data: { id: 'x' }, error: null }
          state.writes.push({ op, payload })
          if (state.failSensory && 'sensory' in payload) return { data: null, error: { code: '42703', message: 'column "sensory" does not exist' } }
          return { data: { id: 'row', ...payload }, error: null }
        },
      }
      return chain
    },
  }),
}))

import { POST } from './route'

const base = { attributes: [{ attribute: 'Body', value: 7 }], defects: { taints: [], faults: [] } }
const call = (extra: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/samples/lot-1/cupping-score', { method: 'POST', body: JSON.stringify({ ...base, ...extra }) }), {
    params: Promise.resolve({ id: 'lot-1' }),
  })

const GOOD = ['Sweet', 'Brown Sugar']
const lastPayload = () => state.writes[state.writes.length - 1].payload

describe('POST /api/samples/[id]/cupping-score sensory', () => {
  beforeEach(() => {
    state.writes = []
    state.failSensory = false
    load.loadSampleSensoryConfig.mockReset().mockResolvedValue({ notesEnabled: true, profile: { id: 'p1', name: 'P' } })
  })

  it('stores the valid picks only, capped at 5', async () => {
    const picks = [GOOD, ['Fruity', 'Berry'], ['Nutty/Cocoa', 'Cocoa', 'Chocolate'], ['Sweet'], ['Fruity'], ['Nope', 'Bad'], ['Floral']]
    const res = await call({ sensory: { picks, profile_id: 'p1', profile_match: true } })
    expect(res.status).toBe(200)
    expect(lastPayload().sensory.picks).toHaveLength(5)
    expect(lastPayload().sensory.picks).not.toContainEqual(['Nope', 'Bad'])
    expect(lastPayload().sensory.profile_match).toBe(true)
  })

  it("drops profile_match when profile_id is not the lot's configured profile", async () => {
    await call({ sensory: { picks: [GOOD], profile_id: 'other', profile_match: true } })
    expect(lastPayload().sensory).toEqual({ picks: [GOOD], profile_id: 'p1', profile_match: null })
  })

  it('stores profile_id null when the lot has no profile', async () => {
    load.loadSampleSensoryConfig.mockResolvedValue({ notesEnabled: true, profile: null })
    await call({ sensory: { picks: [GOOD], profile_id: 'p1', profile_match: true } })
    expect(lastPayload().sensory).toEqual({ picks: [GOOD], profile_id: null, profile_match: null })
  })

  it('leaves the column untouched when sensory is absent', async () => {
    await call({})
    expect('sensory' in lastPayload()).toBe(false)
  })

  it('never puts sensory keys in scores', async () => {
    await call({ sensory: { picks: [GOOD], profile_id: 'p1', profile_match: true } })
    expect(Object.keys(lastPayload().scores)).toEqual(['Body'])
  })

  it('retries without sensory when the column is missing (42703)', async () => {
    state.failSensory = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call({ sensory: { picks: [GOOD], profile_id: 'p1', profile_match: true } })
    expect(res.status).toBe(200)
    expect('sensory' in lastPayload()).toBe(false)
    err.mockRestore()
  })
})
