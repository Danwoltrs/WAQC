import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET } from './route'

const LAB = 'lab-santos'
const SHELF = '22222222-2222-4222-8222-222222222222'
const ctx = { params: Promise.resolve({ id: LAB }) }
const get = (query = '') => ({ nextUrl: new URL(`http://localhost/zone-history${query}`) }) as any
const tables = (profile: Record<string, unknown>) => ({ profiles: profile })
const tech = { qc_role: 'lab_personnel', laboratory_id: LAB }

describe('GET /api/laboratories/[id]/storage/zone-history', () => {
  it("reads one shelf's events, at most 100", async () => {
    const event = { changed_at: '2026-10-13T17:02:00Z', changed_by_name: 'Daniel Wolthers', from_name: null, to_name: 'Ahold', codes: ['B-A1'] }
    state.db = fakeSupabase({ tables: tables(tech), rpc: { storage_zone_history_events: { data: [event], error: null } } })
    const res = await GET(get(`?shelf=${SHELF}&limit=500`), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).events).toEqual([event])
    expect(state.db.rpcCalls).toContainEqual({
      fn: 'storage_zone_history_events', args: { p_lab: LAB, p_shelf: SHELF, p_limit: 100 },
    })
  })

  it('reads the whole lab by default, and refuses another lab and a shelf that is not an id', async () => {
    state.db = fakeSupabase({ tables: tables(tech) })
    await GET(get(), ctx)
    expect(state.db.rpcCalls).toContainEqual({ fn: 'storage_zone_history_events', args: { p_lab: LAB, p_shelf: null, p_limit: 20 } })
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: 'other' }) })
    expect((await GET(get(), ctx)).status).toBe(403)
    state.db = fakeSupabase({ tables: tables(tech) })
    expect((await GET(get('?shelf=B'), ctx)).status).toBe(400)
  })
})
