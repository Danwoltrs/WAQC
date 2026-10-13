import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { PUT } from './route'

const LAB = 'lab-santos'
const CO = '11111111-1111-4111-8111-111111111111'
const ctx = { params: Promise.resolve({ id: LAB }) }
const tables = (profile: Record<string, unknown>) => ({
  profiles: profile,
  laboratories: { id: LAB, name: 'Santos', floor_plan: null },
  lab_shelves: [],
  storage_positions: [],
  companies: [],
})
const put = (body: unknown) => ({ json: async () => body }) as any
const tech = { qc_role: 'lab_personnel', laboratory_id: LAB }

describe('PUT /api/laboratories/[id]/storage/zones', () => {
  it('lets anyone in the lab save zones through save_storage_zones', async () => {
    state.db = fakeSupabase({ tables: tables(tech) })
    const res = await PUT(put({ changes: [{ code: 'B-A1', company_id: CO }] }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toContainEqual({
      fn: 'save_storage_zones', args: { p_lab: LAB, p_changes: [{ code: 'B-A1', company_id: CO }] },
    })
    const body = await res.json()
    expect([body.can_edit, body.can_assign]).toEqual([false, true])
  })

  it('refuses another lab, an anonymous request and a bad body without calling the database', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: 'other' }) })
    expect((await PUT(put({ changes: [] }), ctx)).status).toBe(403)
    state.db = fakeSupabase({ user: null })
    expect((await PUT(put({ changes: [] }), ctx)).status).toBe(401)
    state.db = fakeSupabase({ tables: tables(tech) })
    expect((await PUT(put({ changes: 'B-A1' }), ctx)).status).toBe(400)
    expect(state.db.rpcCalls.find((c: { fn: string }) => c.fn === 'save_storage_zones')).toBeUndefined()
  })

  it('says when a cubby in the changes no longer exists', async () => {
    state.db = fakeSupabase({
      tables: tables(tech),
      rpc: { save_storage_zones: { data: null, error: { code: 'P0001', message: 'unknown_cubby' } } },
    })
    const res = await PUT(put({ changes: [{ code: 'B-A9', company_id: null }] }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer exists/)
  })
})
