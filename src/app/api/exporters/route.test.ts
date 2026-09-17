import { describe, it, expect, vi } from 'vitest'

/**
 * The exporter list feeds the Seller AND the Shipper pickers. On sys a company
 * is often tagged with the shipper trading role alone (prod, 2026-09-17: the
 * one active Ipanema row), and the seller-tagged duplicates are inactive, so a
 * list keyed on seller/exporter only hid it from every user. The filter must
 * name all three tags and keep the active-only guard.
 */

const state = vi.hoisted(() => ({ db: null as any }))

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET } from './route'

type Call = { op: string; args: unknown[] }

/** Recording PostgREST stand-in: every chained call is logged, awaiting yields the rows. */
function fakeDb(rows: unknown[], user: { id: string } | null = { id: 'user-1' }) {
  const calls: Call[] = []
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(resolve, reject)
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

const request = (qs = '') => ({ nextUrl: new URL(`http://localhost/api/exporters${qs}`) }) as any

describe('GET /api/exporters', () => {
  it('lists active companies tagged seller, shipper or exporter, so a shipper-only seller is offered', async () => {
    state.db = fakeDb([
      { id: 'co-ipanema', name: 'Ipanema Comercial e Exportadora S.A.', fantasy_name: 'Ipanema', country: 'Brazil' },
    ])
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect((await res.json()).exporters.map((e: { id: string }) => e.id)).toEqual(['co-ipanema'])

    expect(state.db.calls).toContainEqual({ op: 'from', args: ['companies'] })
    const or = state.db.calls.find((c: Call) => c.op === 'or')
    expect(or?.args[0]).toBe('trading_roles.cs.["seller"],trading_roles.cs.["shipper"],company_types.cs.{exporter}')
    expect(state.db.calls).toContainEqual({ op: 'eq', args: ['is_active', true] })
  })

  it('narrows by search and country when asked', async () => {
    state.db = fakeDb([])
    await GET(request('?search=ipa&country=Brazil'))
    expect(state.db.calls).toContainEqual({ op: 'ilike', args: ['name', '%ipa%'] })
    expect(state.db.calls).toContainEqual({ op: 'eq', args: ['country', 'Brazil'] })
  })

  it('rejects an anonymous request', async () => {
    state.db = fakeDb([], null)
    expect((await GET(request())).status).toBe(401)
    expect(state.db.calls.find((c: Call) => c.op === 'from')).toBeUndefined()
  })
})
