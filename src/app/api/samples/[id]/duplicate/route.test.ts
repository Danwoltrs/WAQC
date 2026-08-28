import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Duplicating a bulk sample goes through the containers rule: the copy stores
 * container_count + MT with bag_count = the 60 kg equivalent, whether the
 * popover overrode the quantity or the source was a legacy inconsistent row.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { POST } from './route'

function fakeDb(source: Record<string, any>) {
  const inserts: Record<string, any>[] = []
  const client: any = {
    inserts,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: async () => ({ data: `SAN-0100${inserts.length + 1}/26`, error: null }),
    from() {
      let pending: Record<string, any> | null = null
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        is() { return chain },
        insert(values: Record<string, any>) { pending = values; return chain },
        single: async () => {
          if (pending) {
            const row = { id: `dup-${inserts.length + 1}`, ...pending }
            inserts.push(row)
            return { data: row, error: null }
          }
          return { data: source, error: null }
        },
      }
      return chain
    },
  }
  return client
}

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/samples/src-1/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any,
    { params: Promise.resolve({ id: 'src-1' }) },
  )

const bulkSource = {
  id: 'src-1', laboratory_id: 'lab-1', client_id: 'c-1', bag_type: 'bulk',
  container_count: 1, bags_quantity_mt: 21.6, bag_count: 1, bag_weight_kg: 21600, equivalent_60kg_bags: 360,
}

describe('POST /api/samples/[id]/duplicate — bulk', () => {
  beforeEach(() => { state.db = null })

  it('copies container_count and re-derives the quintet from the source containers + MT (repairing a legacy bag_count)', async () => {
    state.db = fakeDb(bulkSource)
    const res = await post({ count: 1 })
    expect(res.status).toBe(201)
    const [row] = state.db.inserts
    expect(row).toMatchObject({
      bag_type: 'bulk', container_count: 1, bags_quantity_mt: 21.6,
      equivalent_60kg_bags: 360, bag_count: 360, bag_weight_kg: 21600,
    })
  })

  it('applies a containers + MT override through bulkQuantitiesFromContainers', async () => {
    state.db = fakeDb(bulkSource)
    const res = await post({ count: 2, container_count: 2, bags_quantity_mt: 43.2 })
    expect(res.status).toBe(201)
    expect(state.db.inserts).toHaveLength(2)
    for (const row of state.db.inserts) {
      expect(row).toMatchObject({
        container_count: 2, bags_quantity_mt: 43.2, equivalent_60kg_bags: 720, bag_count: 720, bag_weight_kg: 21600,
      })
    }
  })

  it('derives containers × 21.6 when only the container count is overridden on a source without MT', async () => {
    state.db = fakeDb({ ...bulkSource, bags_quantity_mt: null, container_count: null, bag_count: 360, equivalent_60kg_bags: 360 })
    await post({ count: 1, container_count: 2 })
    expect(state.db.inserts[0]).toMatchObject({ container_count: 2, bags_quantity_mt: 43.2, bag_count: 720, equivalent_60kg_bags: 720 })
  })

  it('copies a bulk source with neither containers nor MT verbatim instead of blanking it', async () => {
    state.db = fakeDb({ ...bulkSource, bags_quantity_mt: null, container_count: null, bag_count: 360, equivalent_60kg_bags: 360 })
    await post({ count: 1 })
    expect(state.db.inserts[0]).toMatchObject({ container_count: null, bags_quantity_mt: null, bag_count: 360, equivalent_60kg_bags: 360 })
  })

  it('leaves bags count-driven: a bag_count override recomputes MT and equivalent, container_count copied as is', async () => {
    state.db = fakeDb({ ...bulkSource, bag_type: 'jute_bag', bag_weight_kg: 60, bag_count: 320, bags_quantity_mt: 19.2, equivalent_60kg_bags: 320, container_count: null })
    await post({ count: 1, bag_count: 100 })
    expect(state.db.inserts[0]).toMatchObject({ bag_type: 'jute_bag', bag_count: 100, bag_weight_kg: 60, bags_quantity_mt: 6, equivalent_60kg_bags: 100, container_count: null })
  })
})
