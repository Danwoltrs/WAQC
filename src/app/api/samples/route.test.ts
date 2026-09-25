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
import { resolvePssSelection, siblingAsSample } from '@/lib/pss-picker-option'
import { mapPssToFormData, mapSiblingToContractRow } from '@/lib/pss-intake-mapping'
import { GET, POST } from './route'

type Row = Record<string, any>
type Filter =
  | { kind: 'eq'; col: string; value: unknown }
  | { kind: 'in'; col: string; values: unknown[] }

/**
 * Minimal PostgREST stand-in: seeded rows per table narrowed by .eq/.is/.in;
 * a head+count select answers with the match count; inserts append a row with
 * a generated id and hand it back through .select().single(); updates mutate
 * the matching rows in place.
 *
 * A plain column list (no `*`, no embed) returns ONLY those columns, as
 * PostgREST does — a column the route forgets to select is absent from the
 * result instead of leaking through from the seeded row. That is what lets a
 * test see a missing SIBLING_COLUMNS entry.
 */
function project(row: Row, cols: string | undefined): Row {
  if (!cols || cols.includes('*') || cols.includes('(')) return row
  const out: Row = {}
  for (const col of cols.split(',').map((c) => c.trim()).filter(Boolean)) out[col] = row[col] ?? null
  return out
}

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
      let pendingUpdate: Row | null = null
      let countOnly = false
      let columns: string | undefined
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
        if (pendingUpdate) {
          for (const row of matching()) Object.assign(row, pendingUpdate)
          return { data: null, error: null }
        }
        if (countOnly) return { data: null, count: matching().length, error: null }
        return { data: matching().map((r) => project(r, columns)), error: null }
      }
      const chain: any = {
        select(cols?: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.head) countOnly = true
          columns = cols
          return chain
        },
        insert(values: Row) { pendingInsert = values; return chain },
        update(values: Row) { pendingUpdate = values; return chain },
        eq(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        is(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        in(col: string, values: unknown[]) { filters.push({ kind: 'in', col, values }); return chain },
        order() { return chain },
        range() { return chain },
        limit() { return chain },
        single: async () => {
          if (pendingInsert) return settle()
          const [row] = matching()
          return row ? { data: project(row, columns), error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        },
        maybeSingle: async () => {
          const [row] = matching()
          return { data: row ? project(row, columns) : null, error: null }
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
        buyer_contract_nr: 'S049504-14', wolthers_contract_nr: 'W-14', contract_id: 'sys-contract-14', exporter_sample_number: '130307',
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
    // Its own sys contract link too: an SS that links this sibling files on
    // sys by id, as the sibling itself does.
    expect(two.contract_id).toBe('sys-contract-14')
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

  // "Show deleted" is a global-admin view; the flag means nothing to anyone else.
  it('ignores include_deleted for a non-admin: deleted rows stay out', async () => {
    state.db.rows.profiles = [{ id: 'user-1', is_global_admin: false, qc_role: 'lab_personnel' }]
    const body = await (await GET(req('/api/samples?include_deleted=1'))).json()
    expect(body.pagination.total).toBe(4)
    const lab = body.samples.find((s: any) => s.id === LAB)
    expect(lab.sub_contracts.map((c: any) => c.id)).not.toContain(GONE)
  })

  it('lists deleted lab units and siblings for a global admin, naming who deleted them and why', async () => {
    const DEL = '99999999-9999-4999-8999-999999999999'
    state.db.rows.profiles = [
      { id: 'user-1', is_global_admin: true, qc_role: 'global_admin' },
      { id: 'user-9', full_name: 'Anderson', email: 'anderson@wolthers.com' },
    ]
    state.db.rows.samples.push({
      id: DEL, tracking_number: 'SAN-00900/26', lab_source_sample_id: null, contract_ordinal: null,
      created_at: '2026-09-01T00:00:00Z', status: 'received', workflow_stage: 'received',
      deleted_at: '2026-09-16T12:00:00Z', deleted_by: 'user-9', deleted_reason: 'registered twice',
      client_id: 'dunkin', sample_type: 'pss', qc_client: dunkin, certificate: [],
    })
    const gone = state.db.rows.samples.find((s: any) => s.id === GONE)
    gone.deleted_by = 'user-9'

    const body = await (await GET(req('/api/samples?include_deleted=1'))).json()
    expect(body.pagination.total).toBe(5)
    const del = body.samples.find((s: any) => s.id === DEL)
    expect(del).toMatchObject({ deleted_at: '2026-09-16T12:00:00Z', deleted_reason: 'registered twice', deleted_by_name: 'Anderson' })
    // Live rows carry no deleter.
    expect(body.samples.find((s: any) => s.id === SOLO).deleted_by_name).toBeNull()
    // The deleted sibling shows under its lab unit, marked.
    const lab = body.samples.find((s: any) => s.id === LAB)
    const goneRow = lab.sub_contracts.find((c: any) => c.id === GONE)
    expect(goneRow).toMatchObject({ deleted_at: '2026-08-10T00:00:00Z', deleted_by_name: 'Anderson' })
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

// An SS ships against the contract its PSS was approved for. The form sends
// that contract's id, but the server guarantees it: a body that names a PSS
// and no contract is filed on the PSS's own contract — never re-resolved by
// number, which would land on the family (one shared contract_number for
// 42089/26A/B/C) rather than the sub-contract.
describe('POST /api/samples — an SS follows its PSS\'s contract', () => {
  const ss = {
    laboratory_id: 'lab-santos', origin: 'Brazil', client_id: 'dunkin', sample_type: 'ss', auto_detect_quality: false,
    bag_type: 'jute_bag', bag_count: 10, bag_weight_kg: 60, bags_quantity_mt: 0.6,
  }

  it('fills contract_id from the linked PSS when the body carries none', async () => {
    const res = await POST(req('/api/samples', { ...ss, linked_pss_sample_id: SIB2 }))
    expect(res.status).toBe(201)
    expect(state.db.inserts[0].values.contract_id).toBe('sys-contract-14')
  })

  it('keeps an explicit contract_id: a deliberate relink wins over inheritance', async () => {
    const res = await POST(req('/api/samples', { ...ss, linked_pss_sample_id: SIB2, contract_id: 'sys-contract-99' }))
    expect(res.status).toBe(201)
    expect(state.db.inserts[0].values.contract_id).toBe('sys-contract-99')
  })

  it('leaves contract_id empty when the linked PSS has none', async () => {
    const res = await POST(req('/api/samples', { ...ss, linked_pss_sample_id: SIB3 }))
    expect(res.status).toBe(201)
    expect(state.db.inserts[0].values.contract_id).toBeNull()
  })

  it('fills each contract row from ITS linked PSS sibling the same way', async () => {
    vi.mocked(createSiblingSamples).mockResolvedValue({ created: [], failed: [] })
    await POST(req('/api/samples', {
      ...ss, linked_pss_sample_id: LAB,
      contracts: [
        { buyer_contract_nr: 'S049504-14', linked_pss_sample_id: SIB2 },
        { buyer_contract_nr: 'S049504-15', linked_pss_sample_id: SIB3, contract_id: 'typed-15' },
      ],
    }))
    const [, , inputs] = vi.mocked(createSiblingSamples).mock.calls[0]
    expect(inputs.map((i: any) => i.contract_id ?? null)).toEqual(['sys-contract-14', 'typed-15'])
  })
})

// SS intake prefills from the PSS row the user picks in the picker, and the
// picker is built from THIS route's list: a lab unit plus its `sub_contracts`.
// Each contract's references are its own record's. On 2026-09-23 an SS for
// OFI contract S664243-12 (PSS sibling SAN-00752/26) was prefilled with the
// lab unit's S664243-9: the sibling rows did not carry seller_contract_nr, so
// the lab unit's showed through. These tests run the real route, its real
// column list (the fake returns only selected columns) and the real mappers.
describe('GET /api/samples → SS prefill: each picked contract brings its own references', () => {
  const OFI = { id: 'ofi', name: 'Olam Agrícola Ltda', fantasy_name: 'OFI', country: 'BR' }
  const LU = 'aaaaaaaa-0000-4000-8000-000000000529'
  const S10 = 'aaaaaaaa-0000-4000-8000-000000000750'
  const S11 = 'aaaaaaaa-0000-4000-8000-000000000751'
  const S12 = 'aaaaaaaa-0000-4000-8000-000000000752'

  const labUnit = (over: Row = {}): Row => ({
    id: LU, tracking_number: 'SAN-00529/26', lab_source_sample_id: null, contract_ordinal: 1,
    created_at: '2026-08-13T13:12:00Z', status: 'approved', workflow_stage: 'certified', deleted_at: null,
    sample_type: 'pss', client_id: 'ofi', importer_id: 'ofi', importer_is_qc_client: true, same_seller_shipper: false,
    seller_contract_nr: 'S664243-9', buyer_contract_nr: 'S049504-9', shipper_contract_nr: 'SHP-9',
    exporter_contract_nr: 'EXP-LOT', supplier_contract_nr: null, roaster_contract_nr: '5224',
    seller: OFI, exporter: OFI, importer: OFI, qc_client: { ...OFI, client_types: ['importer'] }, certificate: [],
    origin: 'Brazil', bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60,
    ...over,
  })
  const sibling = (id: string, ordinal: number, over: Row): Row => ({
    id, tracking_number: `SAN-00${749 + ordinal - 1}/26`, lab_source_sample_id: LU, contract_ordinal: ordinal,
    created_at: `2026-08-13T13:12:0${ordinal}Z`, status: 'approved', workflow_stage: 'certified', deleted_at: null,
    sample_type: 'pss', client_id: 'ofi', importer_id: 'ofi', importer_is_qc_client: true, same_seller_shipper: false,
    exporter_contract_nr: 'EXP-LOT', shipper_contract_nr: 'SHP-9', roaster_contract_nr: null,
    origin: 'Brazil', bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60,
    ...over,
  })

  async function listedPss(samples: Row[]) {
    state.db = fakeDb({ samples, companies: [OFI], certificates: [], client_qualities: [] })
    const body = await (await GET(req('/api/samples?sample_type=pss&status=approved&limit=200'))).json()
    return body.samples as any[]
  }
  const prefillOf = (list: any[], id: string) => {
    const sel = resolvePssSelection(list, id)
    expect(sel, `picker row ${id}`).not.toBeNull()
    return mapPssToFormData(sel!.sample)
  }

  it('contracts SHARING one sample nr: the picked contract prefills its own seller and importer refs', async () => {
    const list = await listedPss([
      labUnit({ exporter_sample_number: '129762' }),
      sibling(S10, 2, { exporter_sample_number: '129762', seller_contract_nr: 'S664243-10', supplier_contract_nr: 'S664243-10', buyer_contract_nr: 'S049504-10' }),
      sibling(S12, 3, {
        exporter_sample_number: '129762', seller_contract_nr: 'S664243-12', supplier_contract_nr: 'S664243-12',
        buyer_contract_nr: 'S049504-12', roaster_contract_nr: '5227', shipper_contract_nr: 'SHP-12',
      }),
    ])

    const { patch } = prefillOf(list, S12)
    expect(patch.seller_contract_nr).toBe('S664243-12')
    expect(patch.importer_contract_nr).toBe('S049504-12')
    expect(patch.roaster_contract_nr).toBe('5227')
    expect(patch.exporter_sample_number).toBe('129762')
    // The shipper ref is lot-level in practice, but the prefill reads the
    // picked contract's own stored value.
    expect(patch.shipper_contract_nr).toBe('SHP-12')
    // The exporter's contract ref is shared by the lot (MOTHER_SHARED_FIELDS).
    expect(patch.exporter_contract_nr).toBe('EXP-LOT')
    expect(Object.values(patch)).not.toContain('S664243-9')

    expect(prefillOf(list, S10).patch.seller_contract_nr).toBe('S664243-10')
  })

  it('contracts with DIFFERENT sample nrs: each pick prefills its own sample nr and seller ref', async () => {
    const list = await listedPss([
      labUnit({ exporter_sample_number: '129763' }),
      sibling(S10, 2, { exporter_sample_number: '129760', seller_contract_nr: 'S664243-10', supplier_contract_nr: 'S664243-10', buyer_contract_nr: 'S049504-10' }),
      sibling(S12, 3, { exporter_sample_number: '129762', seller_contract_nr: 'S664243-12', supplier_contract_nr: 'S664243-12', buyer_contract_nr: 'S049504-12' }),
    ])

    for (const [id, esn, seller, importer] of [
      [S10, '129760', 'S664243-10', 'S049504-10'],
      [S12, '129762', 'S664243-12', 'S049504-12'],
      [LU, '129763', 'S664243-9', 'S049504-9'],
    ]) {
      const { patch } = prefillOf(list, id)
      expect(patch.exporter_sample_number, id).toBe(esn)
      expect(patch.seller_contract_nr, id).toBe(seller)
      expect(patch.importer_contract_nr, id).toBe(importer)
    }

    // Picking the LAB UNIT proposes one row per sibling, each with its own seller ref.
    const lab = resolvePssSelection(list, LU)!.sample
    const rows = lab.sub_contracts.map((sc: any) => mapSiblingToContractRow(siblingAsSample(lab, sc)))
    expect(rows.map((r: any) => [r.exporter_sample_number, r.supplier_contract_nr])).toEqual([
      ['129760', 'S664243-10'],
      ['129762', 'S664243-12'],
    ])
  })

  it('a contract with no seller ref of its own prefills none, not the lab unit\'s', async () => {
    const list = await listedPss([
      labUnit({ exporter_sample_number: '129763' }),
      sibling(S11, 2, { exporter_sample_number: '129761', seller_contract_nr: null, supplier_contract_nr: null, buyer_contract_nr: 'S049504-11' }),
    ])
    const { patch, prefilled } = prefillOf(list, S11)
    expect(patch.seller_contract_nr).toBeUndefined()
    expect(prefilled).not.toContain('seller_contract_nr')
    expect(patch.importer_contract_nr).toBe('S049504-11')
  })

  it('emits both supply-side refs on every sub_contracts entry, null when blank', async () => {
    const list = await listedPss([
      labUnit({ exporter_sample_number: '129763' }),
      sibling(S11, 2, { seller_contract_nr: null, shipper_contract_nr: null, buyer_contract_nr: 'S049504-11' }),
      sibling(S12, 3, { seller_contract_nr: 'S664243-12', shipper_contract_nr: 'SHP-9' }),
    ])
    const [blank, own] = list.find((s) => s.id === LU).sub_contracts
    expect(blank).toHaveProperty('seller_contract_nr', null)
    expect(blank).toHaveProperty('shipper_contract_nr', null)
    expect(own).toMatchObject({ seller_contract_nr: 'S664243-12', shipper_contract_nr: 'SHP-9' })
  })
})

// The save side of the same rule: an SS that covers several contracts sends
// each one's own seller ref, and the server stores exactly that on the
// contract's sibling — never the SS main row's (contract #1's) and never its
// farm Supplier ref. Runs the real createSiblingSamples on the fake.
describe('POST /api/samples — each contract row keeps its own seller ref', () => {
  it('stores every sibling\'s own seller ref, and a blank one as blank', async () => {
    const actual = await vi.importActual<typeof import('@/lib/sample-group')>('@/lib/sample-group')
    vi.mocked(createSiblingSamples).mockImplementation(actual.createSiblingSamples)

    const res = await POST(req('/api/samples', {
      laboratory_id: 'lab-santos', origin: 'Brazil', client_id: 'dunkin', sample_type: 'ss', auto_detect_quality: false,
      bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60, bags_quantity_mt: 19.2,
      linked_pss_sample_id: LAB, seller_contract_nr: 'S664243-9', supplier_contract_nr: 'FARM-1',
      contracts: [
        { buyer_contract_nr: 'S049504-14', linked_pss_sample_id: SIB2, supplier_contract_nr: 'S664243-14' },
        { buyer_contract_nr: 'S049504-15', linked_pss_sample_id: SIB3, supplier_contract_nr: 'S664243-15' },
        { buyer_contract_nr: 'S049504-16', supplier_contract_nr: null },
      ],
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.siblings.failed).toEqual([])

    const main = state.db.inserts[0].values
    expect(main.seller_contract_nr).toBe('S664243-9')
    const siblings = state.db.inserts
      .filter((i: any) => i.table === 'samples' && i.values.lab_source_sample_id === main.id)
      .map((i: any) => i.values)
    expect(siblings.map((s: any) => s.buyer_contract_nr)).toEqual(['S049504-14', 'S049504-15', 'S049504-16'])
    expect(siblings.map((s: any) => s.seller_contract_nr)).toEqual(['S664243-14', 'S664243-15', null])
    expect(siblings.map((s: any) => s.supplier_contract_nr)).toEqual(['S664243-14', 'S664243-15', null])
  })
})
