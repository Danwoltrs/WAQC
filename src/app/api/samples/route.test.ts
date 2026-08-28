import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * One sample per contract on the samples list and intake:
 *  - GET lists LAB UNITS only and hangs each one's contract siblings under it
 *    as `sub_contracts`, every field the sibling's own (id = its sample id).
 *  - the linked-PSS chip of an SS resolves through the exact sample linked,
 *    a sibling included.
 *  - POST creates contracts #2..N as siblings server-side and enforces the
 *    bulk rule (containers + MT in, bag columns derived).
 */

const state = vi.hoisted(() => ({ db: null as any }))

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/notifications', () => ({ activities: { sampleRegistered: vi.fn(async () => undefined) } }))
vi.mock('@/lib/email/awb-arrival', () => ({ sendAwbArrivalEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/sample-group', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sample-group')>()),
  createSiblingSamples: vi.fn(),
}))

import { createSiblingSamples } from '@/lib/sample-group'
import { GET, POST } from './route'

type Row = Record<string, any>
type Filter =
  | { kind: 'eq'; col: string; value: unknown }
  | { kind: 'in'; col: string; values: unknown[] }

/**
 * Minimal PostgREST stand-in: seeded rows per table narrowed by .eq/.is/.in;
 * a head+count select answers with the match count; inserts append a row with
 * a generated id and hand it back through .select().single().
 */
function fakeDb(rows: Record<string, Row[]>) {
  const inserts: Array<{ table: string; values: Row }> = []
  let nextId = 1
  const client: any = {
    rows,
    inserts,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: async (name: string) => (name === 'generate_sample_number'
      ? { data: `SAN-0090${nextId}/26`, error: null }
      : { data: null, error: { message: `unknown rpc ${name}` } }),
    from(table: string) {
      const filters: Filter[] = []
      let pendingInsert: Row | null = null
      let countOnly = false
      const matches = (row: Row) =>
        filters.every((f) => (f.kind === 'eq' ? row[f.col] === f.value : f.values.includes(row[f.col])))
      const matching = () => (rows[table] ?? []).filter(matches)
      const settle = () => {
        if (pendingInsert) {
          const row = { id: `ins-${nextId++}`, ...pendingInsert }
          ;(rows[table] ??= []).push(row)
          inserts.push({ table, values: row })
          return { data: row, error: null }
        }
        if (countOnly) return { data: null, count: matching().length, error: null }
        return { data: matching(), error: null }
      }
      const chain: any = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.head) countOnly = true
          return chain
        },
        insert(values: Row) { pendingInsert = values; return chain },
        eq(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        is(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        in(col: string, values: unknown[]) { filters.push({ kind: 'in', col, values }); return chain },
        order() { return chain },
        range() { return chain },
        limit() { return chain },
        single: async () => {
          if (pendingInsert) return settle()
          const [row] = matching()
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
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
const SOLO = '66666666-6666-4666-8666-666666666666'
const SS_A = '77777777-7777-4777-8777-777777777777'
const SS_B = '88888888-8888-4888-8888-888888888888'

const dunkin = { id: 'dunkin', name: 'Dunkin Donuts', fantasy_name: 'Dunkin', country: 'US', client_types: ['importer'] }

function seed() {
  return {
    companies: [
      { id: 'imp-a', name: 'Importer A Ltda', fantasy_name: 'Importer A' },
      { id: 'imp-b', name: 'Importer B GmbH', fantasy_name: null },
      { id: 'roast-c', name: 'Roaster C', fantasy_name: null },
      { id: 'dunkin', name: 'Dunkin Donuts', fantasy_name: 'Dunkin' },
    ],
    samples: [
      {
        id: LAB, tracking_number: 'SAN-00654/26', lab_source_sample_id: null, contract_ordinal: 1,
        created_at: '2026-08-01T00:00:00Z', status: 'approved', workflow_stage: 'certified', deleted_at: null,
        client_id: 'dunkin', importer_id: 'imp-a', importer_is_qc_client: false, sample_type: 'pss',
        buyer_contract_nr: 'S049504-13', wolthers_contract_nr: 'W-13', exporter_sample_number: '130306',
        bag_count: 333, bag_type: 'jute_bag', bag_weight_kg: 60, bags_quantity_mt: 19.98, container_count: null,
        qc_client: dunkin, importer: { id: 'imp-a', name: 'Importer A Ltda', fantasy_name: 'Importer A', country: 'BR' },
        certificate: [{ id: 'cert-lab', certificate_number: 'BR-037250/26', status: 'issued', created_at: '2026-08-02' }],
      },
      {
        id: SIB3, tracking_number: 'SAN-00701/26', lab_source_sample_id: LAB, contract_ordinal: 3,
        created_at: '2026-08-01T00:02:00Z', status: 'approved', workflow_stage: 'certified', deleted_at: null,
        client_id: 'dunkin', importer_id: 'imp-b', roaster_id: 'roast-c', end_client_id: null, importer_is_qc_client: false,
        buyer_contract_nr: 'S049504-15', wolthers_contract_nr: 'W-15', roaster_contract_nr: 'RC-15',
        exporter_sample_number: '130308', ico_number: null, container_nr: 'MSCU1234567', supplier_contract_nr: 'SUP-15',
        bag_count: 720, bag_type: 'bulk', bag_weight_kg: 21600, bags_quantity_mt: 43.2, equivalent_60kg_bags: 720,
        container_count: 2, shipment_month: '2026-10',
      },
      {
        id: SIB2, tracking_number: 'SAN-00700/26', lab_source_sample_id: LAB, contract_ordinal: 2,
        created_at: '2026-08-01T00:01:00Z', status: 'approved', workflow_stage: 'certified', deleted_at: null,
        client_id: 'dunkin', importer_id: null, roaster_id: null, end_client_id: null, importer_is_qc_client: true,
        buyer_contract_nr: 'S049504-14', wolthers_contract_nr: 'W-14', exporter_sample_number: '130307',
        bag_count: 20, bag_type: 'big_bag', bag_weight_kg: 1000, bags_quantity_mt: 20, equivalent_60kg_bags: 333,
        container_count: null, shipment_month: null,
      },
      {
        id: GONE, tracking_number: 'SAN-00702/26', lab_source_sample_id: LAB, contract_ordinal: 4,
        created_at: '2026-08-01T00:03:00Z', status: 'approved', workflow_stage: 'certified',
        deleted_at: '2026-08-10T00:00:00Z', client_id: 'dunkin', importer_id: null,
      },
      {
        id: SOLO, tracking_number: 'SAN-00800/26', lab_source_sample_id: null, contract_ordinal: null,
        created_at: '2026-08-05T00:00:00Z', status: 'received', workflow_stage: 'received', deleted_at: null,
        client_id: 'dunkin', sample_type: 'pss', bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60,
        bags_quantity_mt: 19.2, qc_client: dunkin, certificate: [],
      },
      {
        id: SS_A, tracking_number: 'SAN-00810/26', lab_source_sample_id: null, contract_ordinal: null,
        created_at: '2026-08-06T00:00:00Z', status: 'received', workflow_stage: 'received', deleted_at: null,
        client_id: 'dunkin', sample_type: 'ss', linked_pss_sample_id: SIB2, qc_client: dunkin, certificate: [],
      },
      {
        id: SS_B, tracking_number: 'SAN-00811/26', lab_source_sample_id: null, contract_ordinal: null,
        created_at: '2026-08-06T00:01:00Z', status: 'received', workflow_stage: 'received', deleted_at: null,
        client_id: 'dunkin', sample_type: 'ss', linked_pss_sample_id: SIB3, qc_client: dunkin, certificate: [],
      },
    ],
    certificates: [
      { id: 'cert-lab', sample_id: LAB, certificate_number: 'BR-037250/26', status: 'issued', created_at: '2026-08-02' },
      { id: 'cert-2', sample_id: SIB2, certificate_number: 'BR-037251/26', status: 'issued', created_at: '2026-08-02' },
    ],
    client_qualities: [],
  }
}

const req = (url: string, body?: unknown) =>
  ({ nextUrl: new URL(url, 'http://localhost'), json: async () => body }) as any

beforeEach(() => {
  state.db = fakeDb(seed())
  vi.mocked(createSiblingSamples).mockReset()
})

describe('GET /api/samples', () => {
  it('lists lab units only and counts them alone', async () => {
    const res = await GET(req('/api/samples'))
    const body = await res.json()
    expect(res.status).toBe(200)
    const ids = body.samples.map((s: any) => s.id)
    expect(ids).toEqual(expect.arrayContaining([LAB, SOLO, SS_A, SS_B]))
    expect(ids).not.toContain(SIB2)
    expect(ids).not.toContain(SIB3)
    expect(body.pagination.total).toBe(4)
  })

  it('hangs each contract sibling under its lab unit, in contract order, with its own fields', async () => {
    const body = await (await GET(req('/api/samples'))).json()
    const lab = body.samples.find((s: any) => s.id === LAB)
    expect(lab.contract_count).toBe(2)
    expect(lab.sub_contract_tracking_numbers).toEqual(['SAN-00700/26', 'SAN-00701/26'])
    expect(lab.sub_contracts.map((c: any) => c.id)).toEqual([SIB2, SIB3])

    const [two, three] = lab.sub_contracts
    expect(two.contract_ordinal).toBe(2)
    expect(two.buyer_contract_nr).toBe('S049504-14')
    expect(two.wolthers_contract_nr).toBe('W-14')
    expect(two.exporter_sample_number).toBe('130307')
    // Its own quantity, whole: 20 big bags, not the lab unit's 333 jute bags.
    expect(two.bag_type).toBe('big_bag')
    expect(two.bag_count).toBe(20)
    expect(two.bag_weight_kg).toBe(1000)
    expect(two.bags_quantity_mt).toBe(20)
    // Sold to the QC client itself: the importer name is the QC client's.
    expect(two.importer_is_qc_client).toBe(true)
    expect(two.importer_name).toBe('Dunkin')
    expect(two.client_id).toBe('dunkin')
    // The buy side has no fallback to the lab unit: no roaster means no roaster.
    expect(two.roaster_name).toBeNull()
    expect(two.has_certificate).toBe(true)
    expect(two.certificate_id).toBe('cert-2')
    expect(two.certificate_number).toBe('BR-037251/26')
    expect(two.status).toBe('approved')
    expect(two.workflow_stage).toBe('certified')

    expect(three.contract_ordinal).toBe(3)
    expect(three.importer_name).toBe('Importer B GmbH') // no fantasy name → legal name
    expect(three.roaster_name).toBe('Roaster C')
    expect(three.roaster_contract_nr).toBe('RC-15')
    expect(three.supplier_contract_nr).toBe('SUP-15')
    expect(three.container_nr).toBe('MSCU1234567')
    expect(three.ico_number).toBeNull()
    expect(three.bag_type).toBe('bulk')
    expect(three.container_count).toBe(2)
    expect(three.bags_quantity_mt).toBe(43.2)
    expect(three.equivalent_60kg_bags).toBe(720)
    expect(three.shipment_month).toBe('2026-10')
    expect(three.has_certificate).toBe(false)
    expect(three.certificate_id).toBeNull()
    expect(three.certificate_number).toBeNull()
  })

  it('leaves a soft-deleted sibling out of the group', async () => {
    const body = await (await GET(req('/api/samples'))).json()
    const lab = body.samples.find((s: any) => s.id === LAB)
    expect(lab.sub_contracts.map((c: any) => c.id)).not.toContain(GONE)
  })

  it('keeps the lab unit\'s own certificate and reports a single-contract sample as having none', async () => {
    const body = await (await GET(req('/api/samples'))).json()
    const lab = body.samples.find((s: any) => s.id === LAB)
    expect(lab.certificate_number).toBe('BR-037250/26')
    const solo = body.samples.find((s: any) => s.id === SOLO)
    expect(solo.contract_count).toBe(0)
    expect(solo.sub_contracts).toEqual([])
    expect(solo.sub_contract_tracking_numbers).toEqual([])
    expect(solo.certificate_number).toBeNull()
  })

  it('resolves an SS\'s linked PSS through the exact sample linked: its certificate number, else its lab number', async () => {
    const body = await (await GET(req('/api/samples'))).json()
    const linkedToCertified = body.samples.find((s: any) => s.id === SS_A)
    expect(linkedToCertified.linked_pss).toEqual({ id: SIB2, tracking_number: 'BR-037251/26' })
    const linkedToUncertified = body.samples.find((s: any) => s.id === SS_B)
    expect(linkedToUncertified.linked_pss).toEqual({ id: SIB3, tracking_number: 'SAN-00701/26' })
    const notLinked = body.samples.find((s: any) => s.id === SOLO)
    expect(notLinked.linked_pss).toBeNull()
  })

  it('never emits the retired sub-contract plumbing', async () => {
    const body = await (await GET(req('/api/samples'))).json()
    for (const s of body.samples) {
      expect(s).not.toHaveProperty('sample_contracts')
      for (const c of s.sub_contracts) expect(c).not.toHaveProperty('sample_contract_id')
    }
  })
})

describe('POST /api/samples', () => {
  const base = {
    laboratory_id: 'lab-santos',
    origin: 'Brazil',
    client_id: 'dunkin',
    sample_type: 'pss',
    auto_detect_quality: false,
    bag_type: 'jute_bag',
    bag_count: 333,
    bag_weight_kg: 60,
    bags_quantity_mt: 19.98,
  }

  it('creates contracts #2..N as siblings of the new lab unit and reports them on the 201', async () => {
    const contracts = [
      { buyer_contract_nr: 'S049504-14', importer_is_qc_client: true, bag_type: 'big_bag', bag_count: 20, bag_weight_kg: 1000, bags_quantity_mt: 20 },
      { buyer_contract_nr: 'S049504-15', bag_type: 'bulk', container_count: 2, bags_quantity_mt: 43.2 },
    ]
    vi.mocked(createSiblingSamples).mockResolvedValue({
      created: [{ id: 'sib-a', lab_source_sample_id: 'ins-1', contract_ordinal: 2, created_at: null }],
      failed: [{ index: 1, error: 'duplicate key' }],
    })

    const res = await POST(req('/api/samples', { ...base, contracts }))
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.sample.id).toBe('ins-1')
    expect(body.sample.tracking_number).toBe('SAN-00901/26')
    expect(body.sample.lab_source_sample_id ?? null).toBeNull()

    expect(createSiblingSamples).toHaveBeenCalledTimes(1)
    const [, labUnit, inputs, userId] = vi.mocked(createSiblingSamples).mock.calls[0]
    expect(labUnit.id).toBe('ins-1')
    expect(inputs).toEqual(contracts)
    expect(userId).toBe('user-1')
    expect(body.siblings.created.map((s: any) => s.id)).toEqual(['sib-a'])
    expect(body.siblings.failed).toEqual([{ index: 1, error: 'duplicate key' }])
  })

  it('creates no siblings and reports none when the body carries no contracts', async () => {
    const res = await POST(req('/api/samples', base))
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(createSiblingSamples).not.toHaveBeenCalled()
    expect(body).not.toHaveProperty('siblings')
    // A stored sibling pointer is never written at intake.
    expect(state.db.inserts[0].values).not.toHaveProperty('linked_pss_sample_contract_id')
  })

  it('keeps the lab unit and reports every contract failed when sibling creation throws', async () => {
    vi.mocked(createSiblingSamples).mockRejectedValue(new Error('rpc down'))
    const res = await POST(req('/api/samples', { ...base, contracts: [{ buyer_contract_nr: 'A' }, { buyer_contract_nr: 'B' }] }))
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.sample.id).toBe('ins-1')
    expect(body.siblings.created).toEqual([])
    expect(body.siblings.failed).toEqual([{ index: 0, error: 'rpc down' }, { index: 1, error: 'rpc down' }])
  })

  it('derives every bag column of a bulk lot from containers + MT', async () => {
    const res = await POST(req('/api/samples', {
      ...base, bag_type: 'bulk', bag_count: undefined, bag_weight_kg: undefined,
      container_count: 2, bags_quantity_mt: 43.2,
    }))
    expect(res.status).toBe(201)
    const row = state.db.inserts[0].values
    expect(row.container_count).toBe(2)
    expect(row.bags_quantity_mt).toBe(43.2)
    expect(row.equivalent_60kg_bags).toBe(720)
    expect(row.bag_count).toBe(720)
    expect(row.bag_weight_kg).toBe(21600)
  })

  it('stores a non-bulk container count verbatim and leaves the bag columns as sent', async () => {
    const res = await POST(req('/api/samples', { ...base, container_count: 1 }))
    expect(res.status).toBe(201)
    const row = state.db.inserts[0].values
    expect(row.container_count).toBe(1)
    expect(row.bag_count).toBe(333)
    expect(row.bag_weight_kg).toBe(60)
    expect(row.bags_quantity_mt).toBe(19.98)
  })

  it('links an SS to the exact sample chosen, a sibling included', async () => {
    const res = await POST(req('/api/samples', { ...base, sample_type: 'ss', linked_pss_sample_id: SIB2 }))
    expect(res.status).toBe(201)
    expect(state.db.inserts[0].values.linked_pss_sample_id).toBe(SIB2)
  })
})
