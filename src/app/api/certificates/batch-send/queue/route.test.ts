import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The queue runs against a fake database that honours the filters the route
 * emits (eq / in / gte / lte / not-null), so a certificate is queued or left out
 * for the same reason the real query would give.
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Filter = { op: 'eq' | 'in' | 'gte' | 'lte' | 'not'; column: string; value: unknown }
  const queries: Array<{ table: string; filters: Filter[] }> = []
  const tables: Record<string, Row[]> = {}
  const read = (row: Row, column: string): unknown =>
    column === 'metadata->>sample_id' ? (row.metadata as Row | null)?.sample_id : row[column]
  const passes = (row: Row, f: Filter): boolean => {
    const v = read(row, f.column)
    if (f.op === 'eq') return v === f.value
    if (f.op === 'in') return (f.value as unknown[]).includes(v)
    if (f.op === 'gte') return String(v) >= String(f.value)
    if (f.op === 'lte') return String(v) <= String(f.value)
    return v !== null && v !== undefined // .not(column, 'is', null)
  }
  const fakeDb = () => ({
    from(table: string) {
      const record = { table, filters: [] as Filter[] }
      queries.push(record)
      const q: Record<string, unknown> = {}
      const filter = (op: Filter['op']) => (column: string, value: unknown) => {
        record.filters.push({ op, column, value })
        return q
      }
      q.select = () => q
      q.order = () => q
      q.eq = filter('eq')
      q.in = filter('in')
      q.gte = filter('gte')
      q.lte = filter('lte')
      q.not = (column: string) => filter('not')(column, null)
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({
          data: (tables[table] ?? []).filter((r) => record.filters.every((f) => passes(r, f))),
          error: null,
        }).then(resolve, reject)
      return q
    },
  })
  return { queries, tables, fakeDb }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.fakeDb() }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-anderson', user_metadata: { full_name: 'Anderson Nunes' } } } }),
    },
  }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => true }))
// The quality table is assembled from a dozen tables of lab data. What this file
// checks is who gets which certificate, so the table is left empty.
vi.mock('@/lib/approval-notification/quality-summary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/approval-notification/quality-summary')>()),
  fetchQualitySampleSummaries: async () => new Map(),
}))

import { GET } from './route'

const sample = (over: Record<string, unknown>) => ({
  tracking_number: null,
  container_nr: null,
  sample_type: 'ss',
  wolthers_contract_nr: null,
  contract_id: null,
  status: 'approved',
  lab_source_sample_id: null,
  client_id: null,
  importer_id: null,
  seller_id: null,
  exporter_id: null,
  buyer_contract_nr: null,
  seller_contract_nr: null,
  ...over,
})

// SAK-011877/26: the Ahold SS lot Anderson could not send — no Wolthers contract.
const aholdCert = {
  id: 'cert-877',
  certificate_number: 'SAK-011877/26',
  is_rejected: false,
  status: 'issued',
  created_at: '2026-09-14T15:00:00+00:00',
  sample_id: 'san-921',
  sample: sample({
    id: 'san-921',
    tracking_number: 'SAN-00921/26',
    container_nr: 'MSBU 203.351-5',
    client_id: 'ahold',
    importer_id: 'ahold',
    seller_id: 'ldc-suisse',
    exporter_id: 'dreyfus',
    buyer_contract_nr: 'IR0007621-1',
  }),
}

// A Dunkin lot from the same seller. Dunkin lots never carry a Wolthers contract.
const dunkinCert = {
  id: 'cert-d1',
  certificate_number: 'BR-037329/26',
  is_rejected: false,
  status: 'issued',
  created_at: '2026-09-14T16:00:00+00:00',
  sample_id: 'san-d1',
  sample: sample({
    id: 'san-d1',
    tracking_number: 'SAN-00930/26',
    sample_type: 'pss',
    client_id: 'dunkin',
    importer_id: 'coffee-america',
    seller_id: 'ldc-suisse',
    exporter_id: 'ldc-suisse',
  }),
}

// Issued in July — outside any four-week window that ends on 14 September.
const julyCert = {
  ...aholdCert,
  id: 'cert-old',
  certificate_number: 'SAK-011001/26',
  created_at: '2026-07-01T10:00:00+00:00',
  sample_id: 'san-old',
  sample: sample({ id: 'san-old', client_id: 'ahold', seller_id: 'ldc-suisse' }),
}

beforeEach(() => {
  h.queries.length = 0
  for (const key of Object.keys(h.tables)) delete h.tables[key]
  h.tables.certificates = [aholdCert, dunkinCert, julyCert]
  h.tables.companies = [
    { id: 'ahold', name: 'Ahold Delhaize Coffee Company B.V.', fantasy_name: 'Ahold' },
    { id: 'dunkin', name: "Dunkin' Brands Group", fantasy_name: 'Dunkin' },
    { id: 'ldc-suisse', name: 'Louis Dreyfus Company Suisse S.A.', fantasy_name: 'LDC Suisse' },
  ]
  h.tables.contacts = [
    {
      id: 'k-sven',
      company_id: 'ahold',
      email: 'sven.drillenburg@adcoffeecompany.nl',
      name: 'Sven Drillenburg',
      nickname: null,
      role: null,
      is_primary: false,
      is_group: false,
      routing_purposes: ['qc_certificates'],
      is_active: true,
    },
    {
      id: 'k-logistics',
      company_id: 'ahold',
      email: 'logistics@adcoffeecompany.nl',
      name: 'Logistics',
      nickname: null,
      role: null,
      is_primary: false,
      is_group: true,
      routing_purposes: ['shipping_documents'],
      is_active: true,
    },
  ]
  h.tables.profiles = [{ id: 'user-anderson', full_name: 'Anderson Nunes' }]
})

const get = async (query: string) => {
  const res = await GET({ nextUrl: new URL(`http://localhost/api/certificates/batch-send/queue?${query}`) } as never)
  return { status: res.status, body: await res.json() }
}

type UnitView = { side: string; companyName: string; samples: Array<{ sampleId: string }> }
const summary = (units: UnitView[]) =>
  units.map((u) => `${u.side} ${u.companyName}: ${u.samples.map((s) => s.sampleId).join(', ')}`)

describe('GET /api/certificates/batch-send/queue — certificates with no sys contract', () => {
  it('queues the Ahold lot for Ahold, pre-filled with its QC-certificate contact', async () => {
    const { status, body } = await get('sampleIds=san-921&side=buyer')
    expect(status).toBe(200)
    expect(summary(body.units)).toEqual(['buyer Ahold: san-921'])
    expect(body.units[0].to).toEqual(['sven.drillenburg@adcoffeecompany.nl'])
    expect(body.units[0].samples[0].certNumber).toBe('SAK-011877/26')
  })

  it('emails the QC clients first, then each seller once for all of its clients', async () => {
    const { body } = await get('from=2026-09-14&to=2026-09-14')
    expect(summary(body.units)).toEqual([
      'buyer Ahold: san-921',
      'buyer Dunkin: san-d1',
      'seller LDC Suisse: san-921, san-d1',
    ])
  })

  it('leaves out a side that was already emailed', async () => {
    h.tables.email_messages = [
      {
        status: 'sent',
        sent_by: 'user-anderson',
        sent_at: '2026-09-14T18:30:00Z',
        metadata: { source: 'batch_approval', sample_id: 'san-921', side: 'buyer' },
      },
    ]
    const { body } = await get('from=2026-09-14&to=2026-09-14')
    expect(summary(body.units)).toEqual(['buyer Dunkin: san-d1', 'seller LDC Suisse: san-921, san-d1'])
  })

  it("returns each company's saved QC-certificate contacts for the composer to mark", async () => {
    const { body } = await get('from=2026-09-14&to=2026-09-14')
    expect(body.savedContacts).toEqual({
      ahold: {
        'sven.drillenburg@adcoffeecompany.nl': { name: 'Sven Drillenburg', isGroup: false, contactId: 'k-sven' },
      },
    })
  })
})

describe('GET /api/certificates/batch-send/queue — period and QC clients', () => {
  it('lists the QC clients with unsent certificates for the client step', async () => {
    const { body } = await get('from=2026-09-14&to=2026-09-14&view=clients')
    expect(body.clients).toEqual([
      { id: 'ahold', name: 'Ahold', certificates: 1 },
      { id: 'dunkin', name: 'Dunkin', certificates: 1 },
    ])
    expect(body.units).toBeUndefined()
  })

  it('keeps only the chosen QC clients, so the seller email covers just theirs', async () => {
    const { body } = await get('from=2026-09-14&to=2026-09-14&clientIds=dunkin')
    expect(summary(body.units)).toEqual(['buyer Dunkin: san-d1', 'seller LDC Suisse: san-d1'])
  })

  it('never reaches back more than four weeks, whatever range is asked for', async () => {
    const { body } = await get('from=2026-01-01&to=2026-09-14')
    const certQuery = h.queries.find((q) => q.table === 'certificates')!
    expect(certQuery.filters).toContainEqual({ op: 'gte', column: 'created_at', value: '2026-08-18' })
    expect((body.units as UnitView[]).flatMap((u) => u.samples.map((s) => s.sampleId))).not.toContain('san-old')
  })
})
