import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The grading queue has no membership of its own: /grading lists whatever this
 * route returns, and the route walked COMMODITY sessions only. A specialty lot
 * is assigned onto a CVA roster instead, so it never reached the grading table
 * and nobody graded it. The grading surface asks for both protocols; the
 * cupping surface keeps specialty lots off the commodity attribute grid.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
// The route builds its service-role client at import time, before a test seeds
// the fake, so delegate per call (same pattern as cva/session/route.test.ts).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))

import { GET } from './route'

type Row = Record<string, any>

/**
 * A tiny in-memory PostgREST: records the filter chain and applies it to the
 * seeded rows when awaited, so the test asserts on what the route ASKED for
 * rather than on which mock it happened to call.
 */
function fakeDb(tables: Record<string, Row[]>, me: string) {
  const client: any = {
    auth: { getUser: async () => ({ data: { user: { id: me } }, error: null }) },
    from(table: string) {
      const calls: Array<[string, any[]]> = []
      const run = () => {
        let rows = [...(tables[table] ?? [])]
        for (const [op, args] of calls) {
          if (op === 'eq') rows = rows.filter((r) => r[args[0]] === args[1])
          if (op === 'neq') rows = rows.filter((r) => r[args[0]] !== args[1])
          if (op === 'in') rows = rows.filter((r) => (args[1] as any[]).includes(r[args[0]]))
          if (op === 'is') rows = rows.filter((r) => (r[args[0]] ?? null) === args[1])
          if (op === 'filter' && args[1] === 'cs') {
            const needle = JSON.parse(args[2]) as string[]
            rows = rows.filter((r) => needle.every((n) => (r[args[0]] ?? []).includes(n)))
          }
        }
        return rows
      }
      const chain: any = {
        then(resolve: (v: any) => void) { resolve({ data: run(), error: null }) },
        single: async () => ({ data: run()[0] ?? null, error: run()[0] ? null : { message: 'none' } }),
      }
      for (const op of ['select', 'eq', 'neq', 'in', 'is', 'filter', 'or', 'order', 'limit']) {
        chain[op] = (...args: any[]) => { calls.push([op, args]); return chain }
      }
      return chain
    },
  }
  return client
}

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/cupping/my-samples${query}`))

const commoditySession = {
  id: 'sess-commodity', session_type: 'regular', status: 'active',
  sample_ids: ['lot-commodity'], cupper_ids: ['me'],
}
const roster = {
  id: 'sess-roster', session_type: 'cva', status: 'setup',
  sample_ids: ['lot-specialty'], cupper_ids: ['me'],
}
const lots = [
  { id: 'lot-commodity', tracking_number: 'SAN-1', workflow_stage: 'analysis', deleted_at: null, lab_source_sample_id: null, created_at: '2026-09-16T10:00:00Z' },
  { id: 'lot-specialty', tracking_number: 'SAN-2', workflow_stage: 'analysis', deleted_at: null, lab_source_sample_id: null, created_at: '2026-09-16T11:00:00Z' },
]
const seed = (sessions: Row[]) => ({
  profiles: [{ id: 'me', qc_role: 'cupper', laboratory_id: 'lab-1' }],
  cupping_sessions: sessions,
  samples: lots,
  cupping_scores: [],
})

const trackingNumbers = async (res: Response) =>
  ((await res.json()).samples ?? []).map((s: any) => s.tracking_number)

describe('GET /api/cupping/my-samples', () => {
  it('the grading surface lists a specialty lot that sits only on the caller\'s CVA roster', async () => {
    state.db = fakeDb(seed([commoditySession, roster]), 'me')
    expect(await trackingNumbers(await get('?include_completed=true&surface=grading'))).toEqual(['SAN-1', 'SAN-2'])
  })

  it('the grading surface still lists the roster lot when the caller has no commodity session at all', async () => {
    state.db = fakeDb(seed([roster]), 'me')
    expect(await trackingNumbers(await get('?include_completed=true&surface=grading'))).toEqual(['SAN-2'])
  })

  it('the cupping surface keeps specialty lots off the commodity grid', async () => {
    state.db = fakeDb(seed([commoditySession, roster]), 'me')
    expect(await trackingNumbers(await get('?include_completed=true'))).toEqual(['SAN-1'])
  })

  it('a roster the caller is not on contributes nothing to their grading queue', async () => {
    state.db = fakeDb(seed([commoditySession, { ...roster, cupper_ids: ['someone-else'] }]), 'me')
    expect(await trackingNumbers(await get('?include_completed=true&surface=grading'))).toEqual(['SAN-1'])
  })
})
