import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * One sample per contract on the sample detail route: a legacy ?contract_id=
 * resolves to the sibling it became, the response carries the whole group,
 * bulk quantities are derived server-side from containers + MT, and deleting a
 * lab unit deletes its siblings while deleting a sibling deletes only itself.
 */

const state = vi.hoisted(() => ({ db: null as any }))

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  // The route builds its admin client (service role) at import time, before a
  // test seeds the fake, so delegate per call: reads through it see the same
  // seeded rows as the user-scoped client.
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))
vi.mock('@/lib/certificate-storage', () => ({ invalidateCertificatePdf: vi.fn(async () => undefined) }))
vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: vi.fn(async () => undefined),
}))
vi.mock('@/lib/contract-ref-sync', () => ({
  pinnedFieldsAfterPatch: (_c: unknown, _p: unknown, pins: string[] | null) => pins ?? [],
  refreshMotherRefsFromSys: vi.fn(async () => undefined),
}))

import { GET, PATCH, DELETE } from './route'

type Row = Record<string, any>
type Filter =
  | { kind: 'eq'; col: string; value: unknown }
  | { kind: 'in'; col: string; values: unknown[] }
  | { kind: 'or'; clauses: Array<{ col: string; value: string }> }

/**
 * Minimal PostgREST stand-in: seeded rows per table, narrowed by .eq/.is/.in
 * and the `id.eq.X,lab_source_sample_id.eq.X` .or() that fetchGroup uses.
 * Updates mutate the seeded rows in place and are recorded with their filters
 * so a test can assert exactly which ids a write touched.
 */
function fakeDb(rows: Record<string, Row[]>) {
  const writes: Array<{ table: string; values: Row; filters: Filter[] }> = []
  const client: any = {
    writes,
    rows,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      const filters: Filter[] = []
      let pending: Row | null = null
      const matches = (row: Row) =>
        filters.every((f) => {
          if (f.kind === 'eq') return row[f.col] === f.value
          if (f.kind === 'in') return f.values.includes(row[f.col])
          return f.clauses.some((c) => row[c.col] === c.value)
        })
      const matching = () => (rows[table] ?? []).filter(matches)
      const settle = () => {
        if (pending) {
          writes.push({ table, values: pending, filters: [...filters] })
          for (const row of matching()) Object.assign(row, pending)
          const [row] = matching()
          return { data: row ?? null, error: null }
        }
        return { data: matching(), error: null }
      }
      const chain: any = {
        select() { return chain },
        update(values: Row) { pending = values; return chain },
        eq(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        is(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        in(col: string, values: unknown[]) { filters.push({ kind: 'in', col, values }); return chain },
        or(expr: string) {
          const clauses = expr.split(',').map((part) => {
            const [col, , value] = part.split('.')
            return { col, value }
          })
          filters.push({ kind: 'or', clauses })
          return chain
        },
        ilike() { return chain },
        order() { return chain },
        limit() { return chain },
        single: async () => {
          if (pending) return settle()
          const [row] = matching()
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        },
        maybeSingle: async () => {
          if (pending) return settle()
          return { data: matching()[0] ?? null, error: null }
        },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          return Promise.resolve(settle()).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  }
  return client
}

const LAB = '11111111-1111-4111-8111-111111111111'
const SIB2 = '22222222-2222-4222-8222-222222222222'
const SIB3 = '33333333-3333-4333-8333-333333333333'
const GONE = '44444444-4444-4444-8444-444444444444'
const LEGACY_SC = '55555555-5555-4555-8555-555555555555'
const SOLO = '66666666-6666-4666-8666-666666666666'

function seed() {
  return {
    profiles: [{ id: 'user-1', is_master_cupper: true, is_global_admin: true, qc_role: 'global_admin' }],
    companies: [
      { id: 'imp-a', name: 'Importer A Ltda', fantasy_name: 'Importer A' },
      { id: 'imp-b', name: 'Importer B GmbH', fantasy_name: null },
      { id: 'dunkin', name: 'Dunkin Donuts', fantasy_name: 'Dunkin' },
    ],
    samples: [
      {
        id: LAB, tracking_number: 'SAN-00654/26', lab_source_sample_id: null, contract_ordinal: 1,
        created_at: '2026-08-01T00:00:00Z', status: 'approved', workflow_stage: 'analysis', deleted_at: null,
        client_id: 'dunkin', importer_id: 'imp-a', importer_is_qc_client: false,
        buyer_contract_nr: 'S049504-13', wolthers_contract_nr: 'W-13', exporter_sample_number: '130306',
        bag_count: 333, bag_type: 'jute_bag', bag_weight_kg: 60, bags_quantity_mt: 19.98, container_count: null,
        certificate: [{ id: 'cert-lab', certificate_number: 'BR-037250/26', status: 'issued', created_at: '2026-08-02' }],
      },
      {
        id: SIB2, tracking_number: 'SAN-00700/26', lab_source_sample_id: LAB, contract_ordinal: 2,
        created_at: '2026-08-01T00:01:00Z', status: 'approved', workflow_stage: 'analysis', deleted_at: null,
        client_id: 'dunkin', importer_id: null, importer_is_qc_client: true,
        buyer_contract_nr: 'S049504-14', wolthers_contract_nr: 'W-14', exporter_sample_number: '130307',
        bag_count: 20, bag_type: 'big_bag', bag_weight_kg: 1000, bags_quantity_mt: 20, container_count: null,
        certificate: [{ id: 'cert-2', certificate_number: 'BR-037251/26', status: 'issued', created_at: '2026-08-02' }],
      },
      {
        id: SIB3, tracking_number: 'SAN-00701/26', lab_source_sample_id: LAB, contract_ordinal: 3,
        created_at: '2026-08-01T00:02:00Z', status: 'approved', workflow_stage: 'analysis', deleted_at: null,
        client_id: 'dunkin', importer_id: 'imp-b', importer_is_qc_client: false,
        buyer_contract_nr: 'S049504-15', wolthers_contract_nr: 'W-15', exporter_sample_number: '130308',
        bag_count: 720, bag_type: 'bulk', bag_weight_kg: 21600, bags_quantity_mt: 43.2, container_count: 2,
        certificate: [],
      },
      {
        id: GONE, tracking_number: 'SAN-00702/26', lab_source_sample_id: LAB, contract_ordinal: 4,
        created_at: '2026-08-01T00:03:00Z', status: 'approved', workflow_stage: 'analysis',
        deleted_at: '2026-08-10T00:00:00Z', client_id: 'dunkin', importer_id: null, certificate: [],
      },
      {
        id: SOLO, tracking_number: 'SAN-00800/26', lab_source_sample_id: null, contract_ordinal: null,
        created_at: '2026-08-05T00:00:00Z', status: 'received', workflow_stage: 'received', deleted_at: null,
        client_id: 'dunkin', bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60, bags_quantity_mt: 19.2,
        container_count: null, certificate: [],
      },
    ],
    certificates: [
      { id: 'cert-lab', sample_id: LAB, certificate_number: 'BR-037250/26', status: 'issued', created_at: '2026-08-02' },
      { id: 'cert-2', sample_id: SIB2, certificate_number: 'BR-037251/26', status: 'issued', created_at: '2026-08-02' },
    ],
    sample_contract_migrations: [{ sample_contract_id: LEGACY_SC, sibling_sample_id: SIB2, certificate_id: 'cert-2' }],
  }
}

const req = (url: string, body?: unknown) =>
  ({ nextUrl: new URL(url, 'http://localhost'), json: async () => body }) as any
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  state.db = fakeDb(seed())
})

describe('GET /api/samples/[id]', () => {
  it('resolves a legacy ?contract_id= to the sibling it became and returns that sample', async () => {
    const res = await GET(req(`/api/samples/${LAB}?contract_id=${LEGACY_SC}`), params(LAB))
    const { sample } = await res.json()
    expect(sample.id).toBe(SIB2)
    expect(sample.tracking_number).toBe('SAN-00700/26')
    expect(sample.buyer_contract_nr).toBe('S049504-14')
    expect(sample.lab_source_sample_id).toBe(LAB)
    expect(sample.contract_ordinal).toBe(2)
    expect(sample.certificate_number).toBe('BR-037251/26')
    expect(sample.certificate_id).toBe('cert-2')
    // The sub-contract overlay is gone: no marker, no sample_contracts read.
    expect(sample.sub_contract_id).toBeUndefined()
  })

  it('ignores an unknown legacy contract id and returns the requested sample', async () => {
    const res = await GET(req(`/api/samples/${LAB}?contract_id=99999999-9999-4999-8999-999999999999`), params(LAB))
    const { sample } = await res.json()
    expect(sample.id).toBe(LAB)
  })

  it('carries the whole group, lab unit first, with each member\'s own certificate and quantity', async () => {
    const res = await GET(req(`/api/samples/${SIB3}`), params(SIB3))
    const { sample } = await res.json()
    expect(sample.id).toBe(SIB3)
    expect(sample.container_count).toBe(2)
    expect(sample.certificate_number).toBeNull()
    expect(sample.group.map((g: any) => g.id)).toEqual([LAB, SIB2, SIB3])
    const [lab, s2, s3] = sample.group
    expect(lab).toMatchObject({
      contract_ordinal: 1, lab_source_sample_id: null, certificate_number: 'BR-037250/26', certificate_id: 'cert-lab',
      buyer_contract_nr: 'S049504-13', wolthers_contract_nr: 'W-13', exporter_sample_number: '130306',
      importer_name: 'Importer A', bag_count: 333, bag_type: 'jute_bag', bags_quantity_mt: 19.98,
      container_count: null, status: 'approved', tracking_number: 'SAN-00654/26',
    })
    // importer_is_qc_client with no importer row: the QC client is the importer.
    expect(s2).toMatchObject({ certificate_number: 'BR-037251/26', importer_name: 'Dunkin', bag_type: 'big_bag' })
    expect(s3).toMatchObject({ certificate_number: null, certificate_id: null, importer_name: 'Importer B GmbH', container_count: 2 })
    // A soft-deleted sibling is not part of the group any more.
    expect(sample.group.some((g: any) => g.id === GONE)).toBe(false)
  })

  it('returns a single-contract sample as a group of one', async () => {
    const res = await GET(req(`/api/samples/${SOLO}`), params(SOLO))
    const { sample } = await res.json()
    expect(sample.group.map((g: any) => g.id)).toEqual([SOLO])
    expect(sample.lab_source_sample_id).toBeNull()
  })
})

describe('PATCH /api/samples/[id]', () => {
  const sampleWrite = () => state.db.writes.find((w: any) => w.table === 'samples')!.values

  it('keeps the stored MT when only the container count changes on a bulk lot', async () => {
    // The form defaults MT from containers; the server only fills in what the
    // body omits from the stored row, so the bag columns still follow the MT.
    const res = await PATCH(req(`/api/samples/${SIB3}`, { container_count: 3 }), params(SIB3))
    expect(res.status).toBe(200)
    expect(sampleWrite()).toMatchObject({
      container_count: 3, bags_quantity_mt: 43.2, equivalent_60kg_bags: 720, bag_count: 720, bag_weight_kg: 21600,
    })
  })

  it('keeps the stored container count when only the MT changes on a bulk lot', async () => {
    const res = await PATCH(req(`/api/samples/${SIB3}`, { bags_quantity_mt: 40 }), params(SIB3))
    expect(res.status).toBe(200)
    expect(sampleWrite()).toMatchObject({
      container_count: 2, bags_quantity_mt: 40, equivalent_60kg_bags: 667, bag_count: 667, bag_weight_kg: 21600,
    })
  })

  it('applies the bulk rule when the body switches a lot to bulk with containers + MT', async () => {
    const res = await PATCH(
      req(`/api/samples/${SOLO}`, { bag_type: 'bulk', container_count: 1, bags_quantity_mt: 21.6 }),
      params(SOLO),
    )
    expect(res.status).toBe(200)
    expect(sampleWrite()).toMatchObject({
      bag_type: 'bulk', container_count: 1, bags_quantity_mt: 21.6, equivalent_60kg_bags: 360, bag_count: 360,
      bag_weight_kg: 21600,
    })
  })

  it('stores container_count verbatim on a non-bulk lot without touching the bag columns', async () => {
    const res = await PATCH(req(`/api/samples/${SOLO}`, { container_count: 1 }), params(SOLO))
    expect(res.status).toBe(200)
    expect(sampleWrite()).toEqual({ container_count: 1 })
  })
})

describe('DELETE /api/samples/[id]', () => {
  const deletedIds = () => {
    const w = state.db.writes.find((x: any) => x.table === 'samples' && x.values.deleted_at)!
    const f = w.filters.find((x: any) => x.kind === 'in') as { values: string[] } | undefined
    const e = w.filters.find((x: any) => x.kind === 'eq' && x.col === 'id') as { value: string } | undefined
    return f ? f.values : e ? [e.value] : []
  }

  it('soft-deletes every live member of the group when the lab unit is deleted', async () => {
    const res = await DELETE(req(`/api/samples/${LAB}`), params(LAB))
    expect(res.status).toBe(200)
    expect([...deletedIds()].sort()).toEqual([LAB, SIB2, SIB3, GONE].sort())
    // Members already deleted keep their original deleted_at.
    const gone = state.db.rows.samples.find((s: any) => s.id === GONE)
    expect(gone.deleted_at).toBe('2026-08-10T00:00:00Z')
    expect(state.db.rows.samples.find((s: any) => s.id === SIB2).deleted_at).toBeTruthy()
  })

  it('soft-deletes only the sibling itself', async () => {
    const res = await DELETE(req(`/api/samples/${SIB2}`), params(SIB2))
    expect(res.status).toBe(200)
    expect(deletedIds()).toEqual([SIB2])
    expect(state.db.rows.samples.find((s: any) => s.id === LAB).deleted_at).toBeNull()
    expect(state.db.rows.samples.find((s: any) => s.id === SIB3).deleted_at).toBeNull()
  })
})
