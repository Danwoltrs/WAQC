import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The typeahead behind Step 1 and every "Wolthers contract" field. sys splits
 * a contract into a suffix family that shares ONE base contract_number and
 * differs only by split_suffix (42089/26A, /26B, /26C). The search must hand
 * the letter and the parent back — or every member renders as "#42089/26" and
 * the mother is picked as "the" contract — and must find the family when the
 * printed number of a member is typed.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET } from './route'

// Minimal PostgREST stand-in: projects the selected columns (embeds by alias),
// narrows by .eq/.is/.in, and evaluates an .or() of `col.ilike.%needle%` terms.
function fakeDb(rows: Record<string, any[]>) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    from(table: string) {
      const preds: Array<(r: any) => boolean> = []
      let columns: string[] = []
      const chain: any = {
        select(cols: string) {
          columns = cols.replace(/\([^)]*\)/g, '').split(',').map((c) => c.trim().split(':')[0]).filter(Boolean)
          return chain
        },
        eq(col: string, v: unknown) { preds.push((r) => r[col] === v); return chain },
        is(col: string, v: unknown) { preds.push((r) => r[col] === v); return chain },
        in(col: string, vs: unknown[]) { preds.push((r) => vs.includes(r[col])); return chain },
        or(expr: string) {
          const terms = expr.split(',').map((t) => {
            const m = t.match(/^(\w+)\.ilike\.(.+)$/)
            if (!m) throw new Error(`unsupported term ${t}`)
            return { col: m[1], needle: m[2].replace(/%/g, '').toLowerCase() }
          })
          preds.push((r) => terms.some((t) => String(r[t.col] ?? '').toLowerCase().includes(t.needle)))
          return chain
        },
        order() { return chain },
        limit() { return chain },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          const data = (rows[table] ?? [])
            .filter((r) => preds.every((p) => p(r)))
            .map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])))
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  }
}

const contract = (id: string, split_suffix: string | null, parent_contract_id: string | null, contract_number = '42089/26') => ({
  id, contract_number, split_suffix, parent_contract_id, status: 'active', seller_reference: '027/26', buyer_reference: `${split_suffix ?? 'X'}-REF`,
  contract_date: '2026-09-01', crop: '2026/2027', volume_bags: 100, bag_type: null, quality_description: null, shipment_period_start: null,
  seller: null, buyer: null,
})

beforeEach(() => {
  state.db = fakeDb({
    contracts: [contract('c-a', 'A', null), contract('c-b', 'B', 'c-a'), contract('c-c', 'C', 'c-a'), contract('c-x', null, null, '42090/26')],
    samples: [],
  })
})

const req = (url: string) => ({ nextUrl: new URL(url, 'http://localhost') }) as any

describe('GET /api/contracts/search with a split family', () => {
  it('hands back each member with its split letter and its parent', async () => {
    const res = await GET(req('/api/contracts/search?q=42089/26'))
    const body = await res.json()
    expect(body.contracts.map((c: any) => [c.id, c.split_suffix, c.parent_contract_id])).toEqual([
      ['c-a', 'A', null], ['c-b', 'B', 'c-a'], ['c-c', 'C', 'c-a'],
    ])
  })

  it('finds the family when the printed number of a member is typed', async () => {
    const res = await GET(req('/api/contracts/search?q=42089/26B'))
    const body = await res.json()
    expect(body.contracts.map((c: any) => c.id)).toEqual(['c-a', 'c-b', 'c-c'])
  })

  it('still finds a standalone contract by its number', async () => {
    const res = await GET(req('/api/contracts/search?q=42090'))
    const body = await res.json()
    expect(body.contracts.map((c: any) => c.id)).toEqual(['c-x'])
  })
})
