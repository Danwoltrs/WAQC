import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET, PUT } from './route'

const LAB = 'lab-santos'
const ctx = { params: Promise.resolve({ id: LAB }) }
const tables = (profile: Record<string, unknown>) => ({
  profiles: profile,
  laboratories: { id: LAB, name: 'Santos', floor_plan: null },
  lab_shelves: [],
  storage_positions: [],
  companies: [],
})
const put = (body: unknown) => ({ json: async () => body }) as any
const validBody = {
  floor_plan: { version: 1, rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600 }], items: [] },
  shelves: [{ shelf_letter: 'A', rows: 2, columns: 3, samples_per_position: 42, x_cm: 50, y_cm: 50, width_cm: 120, depth_cm: 40, rot: 0, access_side: 'front' }],
}

describe('GET /api/laboratories/[id]/storage', () => {
  it('returns the layout and whether the user may edit', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: LAB }) })
    const res = await GET({} as any, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.laboratory.name).toBe('Santos')
    expect(body.can_edit).toBe(false)
  })

  it('refuses another lab user and an anonymous request', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: 'other' }) })
    expect((await GET({} as any, ctx)).status).toBe(403)
    state.db = fakeSupabase({ user: null })
    expect((await GET({} as any, ctx)).status).toBe(401)
  })
})

describe('PUT /api/laboratories/[id]/storage', () => {
  const manager = { qc_role: 'lab_quality_manager', laboratory_id: LAB }

  it('saves the parsed plan through save_lab_floor_plan', async () => {
    state.db = fakeSupabase({ tables: tables(manager) })
    const res = await PUT(put(validBody), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toContainEqual({
      fn: 'save_lab_floor_plan',
      args: {
        p_lab: LAB,
        p_plan: { ...validBody.floor_plan, rooms: [{ ...validBody.floor_plan.rooms[0], name: null, locked: false }], groups: [] },
        p_shelves: [{ ...validBody.shelves[0], locked: false, group_id: null }],
      },
    })
  })

  it('refuses a shelf whose group the plan does not name', async () => {
    state.db = fakeSupabase({ tables: tables(manager) })
    const body = { ...validBody, shelves: [{ ...validBody.shelves[0], group_id: 'g9' }] }
    const res = await PUT(put(body), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Shelf A: unknown group')
  })

  it('never calls the database for a user who may not edit', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: LAB }) })
    expect((await PUT(put(validBody), ctx)).status).toBe(403)
    expect(state.db.rpcCalls.find((c: { fn: string }) => c.fn === 'save_lab_floor_plan')).toBeUndefined()
  })

  it('answers 400 for an invalid plan', async () => {
    state.db = fakeSupabase({ tables: tables(manager) })
    const res = await PUT(put({ ...validBody, shelves: [{ ...validBody.shelves[0], rows: 40 }] }), ctx)
    expect(res.status).toBe(400)
  })

  it('lists every conflict on 409', async () => {
    state.db = fakeSupabase({
      tables: tables(manager),
      rpc: { save_lab_floor_plan: { data: null, error: { code: 'P0001', message: 'storage_conflict', details: '["Cubby A-B3 holds 2 samples and is outside the new grid"]' } } },
    })
    const res = await PUT(put(validBody), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).conflicts).toEqual(['Cubby A-B3 holds 2 samples and is outside the new grid'])
  })

  it('asks for a reload when a shelf vanished elsewhere', async () => {
    state.db = fakeSupabase({
      tables: tables(manager),
      rpc: { save_lab_floor_plan: { data: null, error: { code: '22023', message: 'unknown_shelf' } } },
    })
    const res = await PUT(put(validBody), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/reload/i)
  })
})
