import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The queue runs against a fake database that honours the filters the route
 * emits (eq / in / gte / lte / not-null), so a certificate is queued or left out
 * for the same reason the real query would give.
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Filter = { op: 'eq' | 'in' | 'gte' | 'lte' | 'not' | 'is'; column: string; value: unknown }
  const queries: Array<{ table: string; filters: Filter[] }> = []
  const tables: Record<string, Row[]> = {}
  // Tables whose reads fail the way a statement timeout does.
  const failing = new Set<string>()
  const read = (row: Row, column: string): unknown =>
    column === 'metadata->>sample_id' ? (row.metadata as Row | null)?.sample_id : row[column]
  const passes = (row: Row, f: Filter): boolean => {
    const v = read(row, f.column)
    if (f.op === 'eq') return v === f.value
    if (f.op === 'in') return (f.value as unknown[]).includes(v)
    if (f.op === 'gte') return String(v) >= String(f.value)
    if (f.op === 'lte') return String(v) <= String(f.value)
    if (f.op === 'is') return (v ?? null) === f.value // .is(column, null)
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
      q.is = filter('is')
      q.maybeSingle = () =>
        Promise.resolve({ data: (tables[table] ?? []).filter((r) => record.filters.every((f) => passes(r, f)))[0] ?? null, error: null })
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(
          failing.has(table)
            ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
            : { data: (tables[table] ?? []).filter((r) => record.filters.every((f) => passes(r, f))), error: null },
        ).then(resolve, reject)
      return q
    },
  })
  // The quality table, empty unless a test hands one in.
  const summaries = { byId: new Map<string, unknown>() }
  return { queries, tables, failing, fakeDb, summaries }
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
// checks is who gets which certificate, so the table is left empty, except where
// a test hands in a ready summary (the renderers stay real).
vi.mock('@/lib/approval-notification/quality-summary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/approval-notification/quality-summary')>()),
  fetchQualitySampleSummaries: async () => h.summaries.byId,
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
  laboratory_id: 'hq',
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
  h.failing.clear()
  h.summaries.byId = new Map()
  for (const key of Object.keys(h.tables)) delete h.tables[key]
  h.tables.certificates = [aholdCert, dunkinCert, julyCert]
  h.tables.laboratories = [{ id: 'hq', type: 'hq' }]
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
      owner_lab_id: null,
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
      owner_lab_id: null,
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
    const { status, body } = await get('sampleIds=san-921&parties=buyer')
    expect(status).toBe(200)
    expect(summary(body.units)).toEqual(['buyer Ahold: san-921'])
    expect(body.units[0].to).toEqual(['sven.drillenburg@adcoffeecompany.nl'])
    expect(body.units[0].samples[0].certNumber).toBe('SAK-011877/26')
  })

  it('emails the QC clients first, then each seller once per QC client', async () => {
    const { body } = await get('from=2026-09-14&to=2026-09-14')
    expect(summary(body.units)).toEqual([
      'buyer Ahold: san-921',
      'buyer Dunkin: san-d1',
      'seller LDC Suisse: san-921',
      'seller LDC Suisse: san-d1',
    ])
  })

  it('leaves out already-sent pairs in a selection unless includeSent is passed', async () => {
    h.tables.email_messages = [
      {
        status: 'sent',
        sent_by: 'user-anderson',
        sent_at: '2026-09-14T18:30:00Z',
        metadata: { source: 'batch_approval', sample_id: 'san-921', side: 'buyer' },
      },
    ]
    const omitted = await get('sampleIds=san-921&parties=buyer')
    expect(summary(omitted.body.units)).toEqual([])
    const restored = await get('sampleIds=san-921&parties=buyer&includeSent=1')
    expect(summary(restored.body.units)).toEqual(['buyer Ahold: san-921'])
  })

  it('hands a resend the earlier sends of its certificates: when, to whom', async () => {
    h.tables.email_messages = [
      {
        status: 'sent',
        sent_by: 'user-anderson',
        sent_at: '2026-09-14T18:30:00Z',
        to_recipients: [{ email: 'qc@ahold.com' }],
        cc_recipients: [{ email: 'wolthers@wolthers.com' }],
        metadata: { source: 'batch_approval', sample_id: 'san-921', side: 'buyer', company_id: 'ahold' },
      },
    ]
    const { body } = await get('sampleIds=san-921&parties=buyer&includeSent=1')
    expect(body.units[0].history).toMatchObject([
      { party: 'buyer', sentAt: '2026-09-14T18:30:00Z', to: ['qc@ahold.com'], cc: ['wolthers@wolthers.com'], sampleIds: ['san-921'] },
    ])
  })

  it('honours the chosen parties: the seller alone, without the client', async () => {
    const { body } = await get('sampleIds=san-d1&parties=seller')
    expect(summary(body.units)).toEqual(['seller LDC Suisse: san-d1'])
  })

  it('refuses a send with no party chosen', async () => {
    const { status, body } = await get('sampleIds=san-d1&parties=')
    expect(status).toBe(400)
    expect(body.error).toMatch(/at least one party/i)
  })

  it('attaches for every party when the client shares with everyone', async () => {
    h.tables.qc_client_settings = [
      { company_id: 'dunkin', laboratory_id: 'hq', certificates_to_all_parties: true },
      { company_id: 'ahold', laboratory_id: 'hq', certificates_to_all_parties: false },
    ]
    const { body } = await get('from=2026-09-14&to=2026-09-14')
    const attach = (side: string, company: string) =>
      (body.units as Array<{ side: string; companyName: string; samples: Array<{ attach: boolean }> }>)
        .filter((u) => u.side === side && u.companyName === company)
        .flatMap((u) => u.samples.map((s) => s.attach))
    expect(attach('seller', 'LDC Suisse')).toEqual([false, true])
    expect(attach('buyer', 'Ahold')).toEqual([true])
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
    expect(summary(body.units)).toEqual(['buyer Dunkin: san-d1', 'seller LDC Suisse: san-921', 'seller LDC Suisse: san-d1'])
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

describe('GET /api/certificates/batch-send/queue — a lot approved with comments', () => {
  // Issued after go-live, so the importer is owed it; the importer is not the client.
  const toleranceCert = {
    id: 'cert-t1',
    certificate_number: 'SAK-012001/26',
    is_rejected: false,
    status: 'issued',
    created_at: '2026-11-10T09:00:00+00:00',
    sample_id: 'san-t1',
    sample: sample({
      id: 'san-t1',
      client_id: 'ahold',
      importer_id: 'coffee-america',
      seller_id: 'ldc-suisse',
      buyer_contract_nr: 'IR0008000-1',
    }),
  }

  // fetchQualitySampleSummaries puts the tolerance fields on the summary for
  // every party; only the renderer decides who reads them. Mocked here because
  // the fake database holds none of the lab data a real summary is built from.
  const withTolerance = {
    sampleId: 'san-t1',
    qcClientName: 'Ahold',
    sellerName: 'LDC Suisse',
    exporterSampleNumber: null,
    sellerContractNr: null,
    wolthersContractNr: null,
    buyerContractNr: 'IR0008000-1',
    certificateNumber: 'SAK-012001/26',
    containerNr: null,
    icoNumber: null,
    sampleType: 'ss',
    qualityName: 'NY 2/3 SC 17/18',
    screen: [{ key: '18', label: '18', pct: 27, isPan: false, sortKey: 18 }, { key: '15', label: '15', pct: 69, isPan: false, sortKey: 15 }],
    defects: 14,
    issuedScreen: [{ key: '18', label: '18', pct: 30, isPan: false, sortKey: 18 }, { key: '15', label: '15', pct: 66, isPan: false, sortKey: 15 }],
    issuedDefects: 12,
    typeOk: true,
    cupOk: true,
    decision: 'approved',
    reason: null,
    sellerComment: null,
    toleranceItems: [
      { key: 'screen_18', label: 'Screen 18', quadrant: 'screen', direction: 'min', actual: 27.2, limit: 30, gap: 2.8, tolerance: 5 },
    ],
    toleranceComments: ['Comentário confidencial do vendedor.'],
    requestAdditionalSample: true,
  }

  beforeEach(() => {
    h.tables.certificates = [toleranceCert]
    h.tables.companies.push({ id: 'coffee-america', name: 'Coffee America Corp.', fantasy_name: 'Coffee America' })
    h.summaries.byId = new Map([['san-t1', withTolerance]])
  })

  type FullUnit = Omit<UnitView, 'samples'> & {
    summaryHtml?: string
    summaryText?: string
    samples: Array<{ sampleId: string; attach: boolean }>
  }
  const unit = (units: FullUnit[], side: string) => units.find((u) => u.side === side)!

  it('the importer reads the client version: issued numbers, no tolerance block, no attachment', async () => {
    const { body } = await get('sampleIds=san-t1')
    expect(summary(body.units)).toEqual([
      'buyer Ahold: san-t1',
      'importer Coffee America: san-t1',
      'seller LDC Suisse: san-t1',
    ])
    const importer = unit(body.units, 'importer')
    // The table was rendered, with the numbers the certificate prints.
    expect(importer.summaryHtml).toContain('>30</td>')
    for (const out of [importer.summaryHtml!, importer.summaryText!]) {
      expect(out).not.toContain('Comentário confidencial do vendedor.')
      expect(out).not.toMatch(/amostra adicional|additional sample/i)
      expect(out).not.toContain('>27</td>')
    }
    expect(importer.summaryHtml).not.toContain('Aprovado com observações')
    expect(importer.summaryHtml).not.toContain('Approved with comments')
    expect(importer.samples.map((s) => s.attach)).toEqual([false])
  })

  it('the seller version on the same lot does carry the block and the real value', async () => {
    const { body } = await get('sampleIds=san-t1')
    const seller = unit(body.units, 'seller')
    expect(seller.summaryHtml).toContain('Comentário confidencial do vendedor.')
    expect(seller.summaryHtml).toContain('>27</td>')
  })
})

describe('GET /api/certificates/batch-send/queue — a lot with only a roaster', () => {
  it('is queued for the roaster, not skipped as having no party', async () => {
    h.tables.companies.push({ id: 'roaster-1', name: 'Roastery B.V.', fantasy_name: 'Roastery' })
    h.tables.certificates = [
      {
        id: 'cert-r1',
        certificate_number: 'SAK-012002/26',
        is_rejected: false,
        status: 'issued',
        created_at: '2026-11-10T09:00:00+00:00',
        sample_id: 'san-r1',
        sample: sample({ id: 'san-r1', roaster_id: 'roaster-1' }),
      },
    ]
    const { body } = await get('sampleIds=san-r1')
    expect(summary(body.units)).toEqual(['roaster Roastery: san-r1'])
    expect(body.skipped.noParties).toBe(0)
  })
})

describe('GET /api/certificates/batch-send/queue — view=parties', () => {
  it('lists the parties on the chosen certificates', async () => {
    h.tables.certificates = [{ ...dunkinCert, sample: { ...dunkinCert.sample, importer_id: 'imp', roaster_id: 'roa' } }]
    h.tables.companies = [
      ...h.tables.companies,
      { id: 'imp', name: 'Olam', fantasy_name: null },
      { id: 'roa', name: 'Roaster Co', fantasy_name: null },
    ]
    const { status, body } = await get(`view=parties&sampleIds=${dunkinCert.sample_id}`)
    expect(status).toBe(200)
    expect(body.parties.map((p: any) => p.party)).toEqual(['seller', 'importer', 'roaster', 'buyer'])
    expect(body.parties.at(-1).companies[0].name).toBe('Dunkin')
    expect(body.units).toBeUndefined()
    // No contact lookups in this mode.
    expect(h.queries.some((q) => q.table === 'contacts')).toBe(false)
  })

  it('with nothing matching returns an empty list', async () => {
    const { body } = await get('view=parties&sampleIds=nope')
    expect(body).toEqual({ parties: [] })
  })

  it.each(['view=parties&sampleIds=', 'view=parties&sampleIds=%20,'])('an empty selection (%s) lists nobody and reads no certificates', async (q) => {
    const { body } = await get(q)
    expect(body).toEqual({ parties: [] })
    expect(h.queries.some((x) => x.table === 'certificates')).toBe(false)
  })

  it('applies the decisions filter: a rejected-only certificate lists no party under decisions=approved', async () => {
    h.tables.certificates = [{ ...dunkinCert, is_rejected: true }]
    const approved = await get('view=parties&decisions=approved&sampleIds=san-d1')
    expect(approved.body).toEqual({ parties: [] })
    const both = await get('view=parties&sampleIds=san-d1')
    expect(both.body.parties.length).toBeGreaterThan(0)
  })
})

describe('GET /api/certificates/batch-send/queue — language and seller requests', () => {
  // SAG-012100/26: a Blaser Dulce PSS from a Brazilian seller. Blaser has the
  // pre-approval rule, fixed, so the seller is asked to send a sample to Blaser.
  const blaserPss = {
    id: 'cert-p1',
    certificate_number: 'SAG-012100/26',
    is_rejected: false,
    status: 'issued',
    created_at: '2026-11-17T09:00:00+00:00',
    sample_id: 'san-p1',
    sample: sample({ id: 'san-p1', sample_type: 'pss', client_id: 'blaser', seller_id: 'cooxupe' }),
  }
  const pssSummary = {
    sampleId: 'san-p1',
    qcClientName: 'Blaser',
    sellerName: 'Cooxupé',
    exporterSampleNumber: null,
    sellerContractNr: null,
    wolthersContractNr: '41950/26',
    buyerContractNr: null,
    certificateNumber: 'SAG-012100/26',
    containerNr: null,
    icoNumber: null,
    sampleType: 'pss',
    qualityName: 'Dulce',
    screen: [{ key: '17', label: '17', pct: 40, isPan: false, sortKey: 17 }],
    defects: 8,
    typeOk: true,
    cupOk: true,
    decision: 'approved',
    reason: null,
    sellerComment: null,
  }

  type Line = { sampleId: string; sampleType: string | null; sellerRequest?: any }
  type Unit = { side: string; companyId: string; qcClientId: string | null; language: string; body: string; summaryHtml?: string; summaryGroups?: any[]; samples: Line[] }
  const unitOf = (units: Unit[], side: string) => units.find((u) => u.side === side)!

  beforeEach(() => {
    h.tables.certificates = [blaserPss]
    h.tables.companies.push(
      {
        id: 'blaser', name: 'Blaser Trading AG', fantasy_name: 'Blaser', group_id: null,
        street: 'Guterstrasse', street_number: '1', neighbourhood: null, city: 'Bern', state: null, zip_code: '3008', country: 'Switzerland',
      },
      { id: 'cooxupe', name: 'Cooperativa Regional de Cafeicultores em Guaxupé', fantasy_name: 'Cooxupé', country: 'Brazil', state: 'MG' },
    )
    h.tables.qc_client_settings = [
      {
        company_id: 'blaser', laboratory_id: 'hq', certificates_to_all_parties: false,
        final_word: 'pre_approval', final_word_fixed: true, buyer_sample_address_id: null, stuffing_request: 'off',
      },
    ]
    h.tables.samples = [
      {
        id: 'san-p1', sample_type: 'pss', status: 'approved', client_id: 'blaser', laboratory_id: 'hq', quality_spec_id: null,
        importer_id: null, roaster_id: null, wolthers_contract_nr: '41950/26', seller_requests: null,
      },
    ]
    h.summaries.byId = new Map([['san-p1', pssSummary]])
  })

  it('a Brazilian seller is written to in Portuguese, and the pre-approval PSS asks for a sample to Blaser', async () => {
    const { status, body } = await get('sampleIds=san-p1')
    expect(status).toBe(200)
    const seller = unitOf(body.units, 'seller')
    expect(seller.language).toBe('pt')
    expect(seller.body.startsWith('Prezado')).toBe(true)
    expect(seller.qcClientId).toBe('blaser')
    const line = seller.samples[0]
    expect(line.sampleType).toBe('pss')
    expect(line.sellerRequest.requests.buyerSample.companyName).toBe('Blaser')
    expect(line.sellerRequest.locks.buyerSample.locked).toBe(true)
    expect(line.sellerRequest).toMatchObject({ clientId: 'blaser', clientName: 'Blaser', importerId: null, roasterId: null })
    // The table the composer re-renders, and the one rendered here with the line.
    expect(seller.summaryGroups?.[0].samples.map((s: { sampleId: string }) => s.sampleId)).toEqual(['san-p1'])
    expect(seller.summaryHtml).toContain('Pré-aprovado pela Wolthers – favor enviar 1 amostra para Blaser:')
    expect(seller.summaryHtml).toContain('APROVADO')
  })

  it('the buyer unit carries no seller request and speaks its own language', async () => {
    const { body } = await get('sampleIds=san-p1')
    const buyer = unitOf(body.units, 'buyer')
    expect(buyer.language).toBe('en')
    expect(buyer.body.startsWith('Dear')).toBe(true)
    expect(buyer.qcClientId).toBeNull()
    expect(buyer.samples.every((s) => s.sellerRequest === undefined)).toBe(true)
    expect(buyer.summaryHtml).not.toMatch(/Pré-aprovado|Pre-approved/)
  })

  it('a rejected PSS carries no seller request', async () => {
    h.tables.certificates = [{ ...blaserPss, is_rejected: true }]
    const { body } = await get('sampleIds=san-p1')
    expect(unitOf(body.units, 'seller').samples[0].sellerRequest).toBeUndefined()
  })

  it('a failed request read still builds the queue, with no ticks and no request lines', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.failing.add('qc_client_settings')
    const { status, body } = await get('sampleIds=san-p1')
    expect(status).toBe(200)
    const seller = unitOf(body.units, 'seller')
    expect(seller.samples[0].sellerRequest).toBeUndefined()
    expect(seller.summaryHtml).toContain('APROVADO')
    expect(seller.summaryHtml).not.toContain('Pré-aprovado')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
