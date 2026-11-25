import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * DELETE /api/clients/[id]: a laboratory's delete only ever removes that
 * laboratory's own settings; the shared companies.is_qc_client flag is cleared
 * only when no other laboratory still serves the client.
 */

const LAB = 'lab-co'
const CO_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  db: null as any,
  svc: null as any,
  scope: { ownLabId: null as string | null, isGlobal: false, isHq: false },
}))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.svc }))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/lab-scope')>()),
  loadLabScope: async () => state.scope,
}))
vi.mock('@/lib/qc-settings/lab-row', async (orig) => ({
  ...(await orig<typeof import('@/lib/qc-settings/lab-row')>()),
  loadHqLabId: async () => 'lab-hq',
}))

import { DELETE, GET } from './route'

type Call = { table: string; op: string; args: any[]; filters: Array<[string, string, unknown]> }

/** In-memory Supabase stand-in: records every write with its eq/neq filters. */
function fakeDb(opts: { otherLabRows?: number; countFails?: boolean } = {}) {
  const calls: Call[] = []
  const from = (table: string) => {
    const filters: Array<[string, string, unknown]> = []
    const chain = (op: string, args: any[], result: any = { error: null }) => {
      calls.push({ table, op, args, filters })
      const w: any = { eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return w }, then: (r: any) => r(result) }
      return w
    }
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return q },
      neq: (c: string, v: unknown) => { filters.push(['neq', c, v]); return q },
      single: async () => ({ data: { id: CO_ID }, error: null }),
      update: (...a: any[]) => chain('update', a),
      delete: (...a: any[]) => chain('delete', a),
      then: (r: any) =>
        r(opts.countFails && table === 'qc_client_settings'
          ? { count: null, error: { message: 'boom' } }
          : { count: table === 'qc_client_settings' ? opts.otherLabRows ?? 0 : 0, error: null }),
    }
    return q
  }
  return {
    from, calls,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  }
}

const del = () =>
  DELETE({ nextUrl: new URL('http://x/api/clients/' + CO_ID + '?force=true') } as any, {
    params: Promise.resolve({ id: CO_ID }),
  })

const writes = (db: any, table: string, op: string) =>
  db.calls.filter((c: Call) => c.table === table && c.op === op)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.svc = fakeDb()
})

describe('DELETE /api/clients/[id]', () => {
  it('a confined lab removes only its own settings, never the shared flag, with no service-role count', async () => {
    state.scope = { ownLabId: LAB, isGlobal: false, isHq: false }
    state.db = fakeDb({ otherLabRows: 0 }) // RLS hides other labs, so the count would read 0
    const svcFrom = vi.spyOn(state.svc, 'from')
    const res = await del()
    expect(res.status).toBe(200)
    expect(writes(state.db, 'companies', 'update')).toHaveLength(0)
    expect(writes(state.db, 'samples', 'update')).toHaveLength(0)
    const own = writes(state.db, 'qc_client_settings', 'delete')
    expect(own).toHaveLength(1)
    expect(own[0].filters).toContainEqual(['eq', 'laboratory_id', LAB])
    expect(svcFrom).not.toHaveBeenCalled()
  })

  it('HQ with another lab still serving the client keeps the shared flag', async () => {
    state.scope = { ownLabId: 'lab-hq', isGlobal: false, isHq: true }
    state.db = fakeDb()
    state.svc = fakeDb({ otherLabRows: 1 })
    const res = await del()
    expect(res.status).toBe(200)
    expect(writes(state.db, 'companies', 'update')).toHaveLength(0)
    const own = writes(state.db, 'qc_client_settings', 'delete')
    expect(own).toHaveLength(1)
    expect(own[0].filters).toContainEqual(['eq', 'laboratory_id', 'lab-hq'])
  })

  it('HQ with no other lab rows takes the global path and clears the flag', async () => {
    state.scope = { ownLabId: 'lab-hq', isGlobal: false, isHq: true }
    state.db = fakeDb()
    state.svc = fakeDb({ otherLabRows: 0 })
    const res = await del()
    expect(res.status).toBe(200)
    const flag = writes(state.db, 'companies', 'update')
    expect(flag).toHaveLength(1)
    expect(flag[0].args[0]).toEqual({ is_qc_client: false })
  })

  it('HQ with a failing other-lab count gets a 500 and nothing is changed', async () => {
    state.scope = { ownLabId: 'lab-hq', isGlobal: false, isHq: true }
    state.db = fakeDb()
    state.svc = fakeDb({ countFails: true })
    const res = await del()
    expect(res.status).toBe(500)
    expect(state.db.calls).toHaveLength(0)
  })
})

/** Read-only stand-in for GET: records each table's filters, answers by table. */
function readDb() {
  const reads: Array<{ table: string; filters: Array<[string, string, unknown]> }> = []
  const answer: Record<string, unknown> = {
    companies: { id: CO_ID, name: 'Ahold Delhaize Coffee Company', fantasy_name: 'Ahold', qc_settings: [] },
    samples: [],
    client_qualities: [{ id: 'cq-co', origin: null, custom_parameters: null, created_at: '2026-11-01', template: null }],
  }
  const from = (table: string) => {
    const filters: Array<[string, string, unknown]> = []
    reads.push({ table, filters })
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return q },
      in: (c: string, v: unknown) => { filters.push(['in', c, v]); return q },
      is: () => q,
      order: () => q,
      limit: () => q,
      single: async () => ({ data: answer[table] ?? null, error: null }),
      then: (r: any) => r({ data: answer[table] ?? [], count: 0, error: null }),
    }
    return q
  }
  return { from, reads, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }
}

describe('GET /api/clients/[id]', () => {
  const get = () => GET({ nextUrl: new URL('http://x/api/clients/' + CO_ID) } as any, { params: Promise.resolve({ id: CO_ID }) })

  it("lists the quality specs of the user's laboratory only", async () => {
    state.scope = { ownLabId: LAB, isGlobal: false, isHq: false }
    state.db = readDb()
    const res = await get()
    expect(res.status).toBe(200)
    const specReads = state.db.reads.filter((r: any) => r.table === 'client_qualities')
    expect(specReads).toHaveLength(1)
    expect(specReads[0].filters).toContainEqual(['eq', 'client_id', CO_ID])
    expect(specReads[0].filters).toContainEqual(['eq', 'laboratory_id', LAB])
  })

  it('a user with no laboratory lists the HQ specs', async () => {
    state.scope = { ownLabId: null, isGlobal: true, isHq: false }
    state.db = readDb()
    await get()
    const specReads = state.db.reads.filter((r: any) => r.table === 'client_qualities')
    expect(specReads[0].filters).toContainEqual(['eq', 'laboratory_id', 'lab-hq'])
  })
})
