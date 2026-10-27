import { describe, expect, it } from 'vitest'
import { fetchPortalContainers, matchContainerSearch, MILESTONE_LABEL } from './portal-containers'

const CO = '11111111-1111-4111-8111-111111111111'

function mockAdmin(tables: Record<string, any[]>) {
  const calls: { table: string; select: string; filters: { op: string; args: any[] }[] }[] = []
  const admin = {
    from(table: string) {
      const rec = { table, select: '', filters: [] as { op: string; args: any[] }[] }
      calls.push(rec)
      const b: any = {
        select(s: string) { rec.select = s; return b },
        order() { return b },
        range(from: number, to: number) { b._r = [from, to]; return b },
        then(res: any, rej: any) {
          let data = tables[table] ?? []
          for (const f of rec.filters) {
            if (f.op === 'in') data = data.filter(r => (f.args[1] as string[]).includes(r[f.args[0]]))
          }
          if (b._r) data = data.slice(b._r[0], b._r[1] + 1)
          return Promise.resolve({ data, error: null }).then(res, rej)
        },
      }
      for (const op of ['or', 'eq', 'is', 'not', 'in']) b[op] = (...args: any[]) => { rec.filters.push({ op, args }); return b }
      return b
    },
  }
  return { admin: admin as any, calls }
}

const pss = (id: string, contract: string, ref: string, extra: object = {}) => ({
  id, client_id: CO, end_client_id: null, lab_source_sample_id: id, sample_type: 'pss', contract_id: contract, container_nr: null,
  created_at: '2026-09-01T10:00:00Z', wolthers_contract_nr: ref, quality_name: null, seller: null, exporter: null, ...extra,
})
const samples = [
  pss('s1', 'k1', '42089/26', { quality_name: 'GC17', seller: { name: 'Legal Seller', fantasy_name: 'Fancy Seller' } }),
  pss('s2', 'k2', '42090/26', { exporter: { name: 'Exp Ltd', fantasy_name: null } }),
]
const certs = [
  { sample_id: 's1', certificate_number: 'SAG-011895/26', is_rejected: false },
  { sample_id: 's1', certificate_number: 'SAN-00231/26', is_rejected: false },
]
const shipments = [
  { id: 'sh1', contract_id: 'k1', vessel_name: 'MSC A', voyage_number: 'V1', bl_number: 'BL1',
    etd: '2026-10-01', etd_actual: '2026-10-03', eta: '2026-11-01', eta_actual: null, transport_milestone: 'loaded_on_vessel',
    shipment_containers: [{ container: { container_number: 'MSNU 1', seal_number: 'S1' } }, { container: { container_number: 'MSNU 1', seal_number: 'S1' } }] },
  { id: 'sh2', contract_id: 'k2', vessel_name: null, voyage_number: null, bl_number: null,
    etd: null, etd_actual: null, eta: null, eta_actual: null, transport_milestone: 'weird_value',
    shipment_containers: [{ container: { container_number: 'TGHU 2', seal_number: null } }] },
  { id: 'sh3', contract_id: 'k1', vessel_name: 'MSC B', voyage_number: null, bl_number: null,
    etd: '2026-12-01', etd_actual: null, eta: null, eta_actual: null, transport_milestone: 'received_at_cy',
    shipment_containers: [{ container: { container_number: 'ZZZU 3', seal_number: null } }] },
]

const ss = (id: string, container: string, extra: object = {}) => ({
  id, client_id: CO, end_client_id: null, lab_source_sample_id: id, sample_type: 'ss', contract_id: null, container_nr: container,
  created_at: '2026-10-01T10:00:00Z', wolthers_contract_nr: null, quality_name: 'NY2 17/18', seller: { name: 'Coop', fantasy_name: 'Cooxupe' },
  exporter: null, ...extra,
})

describe('fetchPortalContainers: sys containers on contracts', () => {
  it('returns [] without reading certificates or shipments when the company has no SS sample and no contract', async () => {
    const { admin, calls } = mockAdmin({ samples: [] })
    expect(await fetchPortalContainers(admin, CO)).toEqual([])
    expect(calls.map(c => c.table)).toEqual(['samples', 'samples'])
  })

  it('builds one row per container, sorted by ETD desc with nulls last', async () => {
    const { admin } = mockAdmin({ samples, certificates: certs, shipments })
    const rows = await fetchPortalContainers(admin, CO)
    expect(rows.map(r => r.containerNr)).toEqual(['ZZZU 3', 'MSNU 1', 'TGHU 2'])
    expect(rows[1]).toEqual({
      containerNr: 'MSNU 1', seal: 'S1', certificates: ['SAG-011895/26'], rejected: null, receivedAt: null, contractRefs: ['42089/26'],
      quality: 'GC17', seller: 'Fancy Seller', vessel: 'MSC A', voyage: 'V1', bl: 'BL1',
      etd: '2026-10-03', etdActual: true, eta: '2026-11-01', etaActual: false, milestone: MILESTONE_LABEL.loaded_on_vessel,
    })
    expect(rows[2]).toMatchObject({ seller: 'Exp Ltd', milestone: 'weird_value', etd: null, etdActual: false, certificates: [], contractRefs: ['42090/26'] })
  })

  it('never renders a SAN number and never selects commercial columns', async () => {
    const { admin, calls } = mockAdmin({ samples, certificates: certs, shipments })
    const rows = await fetchPortalContainers(admin, CO)
    expect(JSON.stringify(rows)).not.toContain('SAN-')
    const sel = calls.map(c => c.select).join(' | ')
    expect(sel).not.toMatch(/commission|price|freight/i)
    expect(calls.find(c => c.table === 'shipments')!.select).toContain('containers')
  })

  it('records the scoping filters on every table', async () => {
    const { admin, calls } = mockAdmin({ samples, certificates: certs, shipments })
    await fetchPortalContainers(admin, CO)
    const sampleCalls = calls.filter(c => c.table === 'samples').map(c => c.filters)
    const scope = { op: 'or', args: [`client_id.eq.${CO},end_client_id.eq.${CO}`] }
    const live = { op: 'is', args: ['deleted_at', null] }
    expect(sampleCalls[0]).toEqual(expect.arrayContaining([scope, live,
      { op: 'eq', args: ['sample_type', 'ss'] }, { op: 'not', args: ['container_nr', 'is', null] }]))
    expect(sampleCalls[1]).toEqual(expect.arrayContaining([scope, live, { op: 'not', args: ['contract_id', 'is', null] }]))
    const of = (t: string) => calls.find(c => c.table === t)!.filters
    expect(of('certificates')).toEqual(expect.arrayContaining([
      { op: 'is', args: ['voided_at', null] },
      { op: 'in', args: ['sample_id', ['s1', 's2']] },
    ]))
    expect(of('shipments')).toEqual([{ op: 'in', args: ['contract_id', ['k1', 'k2']] }])
  })

  it('drops a sample of another company even if the query returned it', async () => {
    const foreign = pss('x', 'k9', '99999/26', { client_id: 'other' })
    const { admin } = mockAdmin({ samples: [...samples, foreign],
      certificates: [...certs, { sample_id: 'other', certificate_number: 'SAG-999/26', is_rejected: false }], shipments })
    const text = JSON.stringify(await fetchPortalContainers(admin, CO))
    expect(text).not.toContain('SAG-999/26')
    expect(text).not.toContain('99999/26')
  })

  it('gives one row per shipment for a container reused across two contracts, in ETD order', async () => {
    const reuse = [
      { id: 'a', contract_id: 'k1', vessel_name: 'Old Ship', voyage_number: null, bl_number: null, etd: '2026-03-01', etd_actual: null, eta: null, eta_actual: null, transport_milestone: null,
        shipment_containers: [{ container: { container_number: 'REUSED 1', seal_number: null } }] },
      { id: 'b', contract_id: 'k2', vessel_name: 'New Ship', voyage_number: null, bl_number: null, etd: '2026-09-01', etd_actual: null, eta: null, eta_actual: null, transport_milestone: null,
        shipment_containers: [{ container: { container_number: 'REUSED 1', seal_number: null } }] },
    ]
    const { admin } = mockAdmin({ samples, certificates: [...certs, { sample_id: 's2', certificate_number: 'SAG-2/26', is_rejected: false }], shipments: reuse })
    const rows = await fetchPortalContainers(admin, CO)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ vessel: 'New Ship', contractRefs: ['42090/26'], certificates: ['SAG-2/26'], quality: null })
    expect(rows[1]).toMatchObject({ vessel: 'Old Ship', contractRefs: ['42089/26'], certificates: ['SAG-011895/26'], quality: 'GC17' })
  })
})

describe('fetchPortalContainers: the lab record (SS samples)', () => {
  it('lists a QC-only client\'s containers from its SS samples, without any sys contract', async () => {
    const { admin, calls } = mockAdmin({
      samples: [ss('a', 'MSNU 111.500-4'), ss('b', 'HLBU 297.835-0', { created_at: '2026-10-05T10:00:00Z' })],
      certificates: [
        { sample_id: 'a', certificate_number: 'SAG-1/26', is_rejected: false },
        { sample_id: 'b', certificate_number: 'SAG-2/26', is_rejected: true },
      ],
    })
    const rows = await fetchPortalContainers(admin, CO)
    expect(calls.some(c => c.table === 'shipments')).toBe(false)
    expect(rows.map(r => r.containerNr)).toEqual(['HLBU 297.835-0', 'MSNU 111.500-4'])
    expect(rows[0]).toMatchObject({ certificates: ['SAG-2/26'], rejected: true, receivedAt: '2026-10-05T10:00:00Z', seller: 'Cooxupe', quality: 'NY2 17/18', vessel: null })
    expect(rows[1]).toMatchObject({ certificates: ['SAG-1/26'], rejected: false })
  })

  it('shows "no result yet" for an SS sample without a certificate', async () => {
    const { admin } = mockAdmin({ samples: [ss('a', 'MSNU 1')], certificates: [] })
    expect((await fetchPortalContainers(admin, CO))[0]).toMatchObject({ certificates: [], rejected: null })
  })

  it('fills in sys logistics when the contract\'s shipment holds the same container, and does not list it twice', async () => {
    const sh = [{ id: 'sh9', contract_id: 'k1', vessel_name: 'MSC C', voyage_number: null, bl_number: 'BL9', etd: '2026-10-10', etd_actual: null,
      eta: null, eta_actual: null, transport_milestone: null,
      shipment_containers: [{ container: { container_number: 'MSBU1480571/MSNU1115004', seal_number: 'S9' } }] }]
    const { admin } = mockAdmin({
      samples: [ss('a', 'MSNU 111.500-4', { contract_id: 'k1', wolthers_contract_nr: '42089/26' })],
      certificates: [{ sample_id: 'a', certificate_number: 'SAG-1/26', is_rejected: false }],
      shipments: sh,
    })
    const rows = await fetchPortalContainers(admin, CO)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ containerNr: 'MSNU 111.500-4', seal: 'S9', vessel: 'MSC C', bl: 'BL9', contractRefs: ['42089/26'], certificates: ['SAG-1/26'] })
  })

  it('does not borrow logistics from another contract\'s shipment of the same container', async () => {
    const sh = [{ id: 'sh9', contract_id: 'k2', vessel_name: 'Other', voyage_number: null, bl_number: null, etd: null, etd_actual: null,
      eta: null, eta_actual: null, transport_milestone: null, shipment_containers: [{ container: { container_number: 'MSNU1', seal_number: null } }] }]
    const { admin } = mockAdmin({ samples: [ss('a', 'MSNU 1', { contract_id: 'k1' })], certificates: [], shipments: sh })
    const rows = await fetchPortalContainers(admin, CO)
    expect(rows).toHaveLength(1)
    expect(rows[0].vessel).toBeNull()
  })

  it('merges contract siblings of one physical SS sample into one row', async () => {
    const { admin } = mockAdmin({
      samples: [ss('a', 'MSNU 1', { wolthers_contract_nr: '1/26' }), ss('b', 'MSNU 1', { lab_source_sample_id: 'a', wolthers_contract_nr: '2/26' })],
      certificates: [
        { sample_id: 'a', certificate_number: 'SAG-1/26', is_rejected: false },
        { sample_id: 'b', certificate_number: 'SAG-2/26', is_rejected: false },
      ],
    })
    const rows = await fetchPortalContainers(admin, CO)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ contractRefs: ['1/26', '2/26'], certificates: ['SAG-1/26', 'SAG-2/26'], rejected: false })
  })

  it('never renders a SAN-valued certificate number on a lab row', async () => {
    const { admin } = mockAdmin({ samples: [ss('a', 'MSNU 1')], certificates: [{ sample_id: 'a', certificate_number: 'SAN-00231/26', is_rejected: false }] })
    expect(JSON.stringify(await fetchPortalContainers(admin, CO))).not.toContain('SAN-')
  })
})

describe('matchContainerSearch', () => {
  const row = { containerNr: 'MSNU 111.500-4', seal: null, certificates: ['SAG-1/26'], rejected: null, receivedAt: null, contractRefs: ['42089/26'],
    quality: null, seller: null, vessel: 'MSC Aurora', voyage: null, bl: 'BL99', etd: null, etdActual: false, eta: null, etaActual: false, milestone: null }
  it('matches container, contract, certificate, vessel and BL case-insensitively', () => {
    for (const q of ['', 'msnu', '42089', 'sag-1', 'aurora', 'bl99']) expect(matchContainerSearch(row, q)).toBe(true)
    expect(matchContainerSearch(row, 'zzz')).toBe(false)
  })
  it('matches a container number typed without its punctuation, but not bare digits across it', () => {
    expect(matchContainerSearch(row, 'MSNU1115004')).toBe(true)
    expect(matchContainerSearch(row, '1115004')).toBe(false)
  })
})
