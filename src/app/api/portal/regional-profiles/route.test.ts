import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const state = vi.hoisted(() => ({ gate: null as any, result: { data: [] as any, error: null as any }, calls: [] as { op: string; args: unknown[] }[] }))

vi.mock('@/lib/portal/qc-portal-gate', () => ({ requireQcPortal: async () => state.gate }))

import { GET } from './route'

const admin = {
  from(table: string) {
    state.calls.push({ op: 'from', args: [table] })
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (res: any, rej: any) => Promise.resolve(state.result).then(res, rej)
        return (...args: unknown[]) => { state.calls.push({ op: prop, args }); return chain }
      },
    })
    return chain
  },
}
const row = { id: 'p1', name: 'Cerrado Mineiro', origin: 'Brazil', region: 'Cerrado', notes: [['Fruity', 'Berry']], description: null, is_active: true }

beforeEach(() => {
  state.calls = []
  state.result = { data: [row], error: null }
  state.gate = { ok: true, ctx: { admin, companyId: 'c1' } }
})

describe('GET /api/portal/regional-profiles', () => {
  it('answers the gate response when there is no portal session', async () => {
    state.gate = { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const res = await GET({ url: 'http://x/api/portal/regional-profiles', nextUrl: new URL('http://x/api/portal/regional-profiles') } as any)
    expect(res.status).toBe(401)
    expect(state.calls).toEqual([])
  })

  it('returns active profiles only, sorted by name', async () => {
    const res = await GET({} as any)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ profiles: [row] })
    expect(state.calls).toContainEqual({ op: 'from', args: ['regional_profiles'] })
    expect(state.calls).toContainEqual({ op: 'eq', args: ['is_active', true] })
    expect(state.calls).toContainEqual({ op: 'order', args: ['name', { ascending: true }] })
  })

  it('drops malformed notes', async () => {
    state.result = { data: [{ ...row, notes: 'junk' }], error: null }
    const body = await (await GET({} as any)).json()
    expect(body.profiles[0].notes).toEqual([])
  })

  it('fails soft with an empty list when the table is missing (42P01)', async () => {
    state.result = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    const res = await GET({} as any)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ profiles: [] })
  })

  it('answers 500 on any other database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.result = { data: null, error: { code: 'XX000', message: 'boom' } }
    expect((await GET({} as any)).status).toBe(500)
  })
})
