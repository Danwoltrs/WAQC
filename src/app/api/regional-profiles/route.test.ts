import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  db: null as any,
  staff: true,
}))

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/auth/sample-access', () => ({ isInternalStaff: async () => state.staff }))

import { GET, POST } from './route'
import { PATCH } from './[id]/route'

type Call = { op: string; args: unknown[] }

/** Recording PostgREST stand-in: every chained call is logged, awaiting yields `result`. */
function fakeDb(result: { data: unknown; error: unknown }, user: { id: string } | null = { id: 'user-1' }) {
  const calls: Call[] = []
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          calls.push({ op: prop, args })
          return chain
        }
      },
    },
  )
  return {
    calls,
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) },
    from(table: string) {
      calls.push({ op: 'from', args: [table] })
      return chain
    },
  }
}

const json = (body: unknown) => ({ json: async () => body }) as any
const getReq = (qs = '') => ({ nextUrl: new URL(`http://localhost/api/regional-profiles${qs}`) }) as any
const ctx = (id = 'p1') => ({ params: Promise.resolve({ id }) })
const row = { id: 'p1', name: 'Cerrado Mineiro', origin: 'Brazil', region: 'Cerrado Mineiro', notes: [], description: null, is_active: true }

beforeEach(() => {
  state.staff = true
})

describe('GET /api/regional-profiles', () => {
  it('returns 401 without a session', async () => {
    state.db = fakeDb({ data: [], error: null }, null)
    expect((await GET(getReq())).status).toBe(401)
  })

  it('lists profiles sorted by name and filters active=true', async () => {
    state.db = fakeDb({ data: [row], error: null })
    const res = await GET(getReq('?active=true'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ profiles: [row] })
    expect(state.db.calls).toContainEqual({ op: 'order', args: ['name', { ascending: true }] })
    expect(state.db.calls).toContainEqual({ op: 'eq', args: ['is_active', true] })
  })

  it('fails soft with an empty list when the table is missing (42P01)', async () => {
    state.db = fakeDb({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ profiles: [] })
  })
})

describe('POST /api/regional-profiles', () => {
  it('returns 401 without a session', async () => {
    state.db = fakeDb({ data: row, error: null }, null)
    expect((await POST(json({ name: 'X' }))).status).toBe(401)
  })

  it('returns 403 for non-staff', async () => {
    state.staff = false
    state.db = fakeDb({ data: row, error: null })
    const res = await POST(json({ name: 'X' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Only lab staff can manage regional profiles' })
  })

  it('returns 400 when the name is missing', async () => {
    state.db = fakeDb({ data: row, error: null })
    const res = await POST(json({ name: '   ' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Name is required' })
  })

  it('sanitizes notes to the cap and trims text, stamping created_by', async () => {
    state.db = fakeDb({ data: row, error: null })
    const notes = [
      ['Fruity', 'Berry', 'Blackberry'],
      ['not a real path'],
      ['Sweet', 'Brown Sugar', 'Honey'],
      ['Floral', 'Black Tea'],
      ['Nutty/Cocoa', 'Nutty', 'Almond'],
      ['Spices', 'Pungent'],
      ['Fruity', 'Citrus Fruit', 'Lemon'],
      ['Sweet', 'Vanilla'],
    ]
    const res = await POST(json({ name: '  Cerrado Mineiro ', origin: ' Brazil ', region: '', description: ' Sweet ', notes }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ profile: row })
    const insert = state.db.calls.find((c: Call) => c.op === 'insert')!.args[0] as any
    expect(insert.name).toBe('Cerrado Mineiro')
    expect(insert.origin).toBe('Brazil')
    expect(insert.region).toBeNull()
    expect(insert.description).toBe('Sweet')
    expect(insert.created_by).toBe('user-1')
    expect(insert.notes.length).toBeLessThanOrEqual(6)
    expect(insert.notes).not.toContainEqual(['not a real path'])
  })

  it('maps a duplicate name (23505) to 409', async () => {
    state.db = fakeDb({ data: null, error: { code: '23505', message: 'dup' } })
    const res = await POST(json({ name: 'X' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'A profile with this name already exists.' })
  })

  it('maps an RLS denial (42501) to 403', async () => {
    state.db = fakeDb({ data: null, error: { code: '42501', message: 'rls' } })
    expect((await POST(json({ name: 'X' }))).status).toBe(403)
  })
})

describe('PATCH /api/regional-profiles/[id]', () => {
  it('returns 403 for non-staff', async () => {
    state.staff = false
    state.db = fakeDb({ data: row, error: null })
    expect((await PATCH(json({ name: 'X' }), ctx())).status).toBe(403)
  })

  it('returns 400 for an empty name', async () => {
    state.db = fakeDb({ data: row, error: null })
    expect((await PATCH(json({ name: ' ' }), ctx())).status).toBe(400)
  })

  it('updates only the given fields, including is_active, and stamps updated_at', async () => {
    state.db = fakeDb({ data: { ...row, is_active: false }, error: null })
    const res = await PATCH(json({ is_active: false }), ctx())
    expect(res.status).toBe(200)
    const update = state.db.calls.find((c: Call) => c.op === 'update')!.args[0] as any
    expect(update.is_active).toBe(false)
    expect(typeof update.updated_at).toBe('string')
    expect('name' in update).toBe(false)
    expect('notes' in update).toBe(false)
  })

  it('returns 404 when the profile does not exist', async () => {
    state.db = fakeDb({ data: null, error: null })
    expect((await PATCH(json({ is_active: true }), ctx())).status).toBe(404)
  })

  it('maps a duplicate name (23505) to 409', async () => {
    state.db = fakeDb({ data: null, error: { code: '23505', message: 'dup' } })
    expect((await PATCH(json({ name: 'X' }), ctx())).status).toBe(409)
  })
})
