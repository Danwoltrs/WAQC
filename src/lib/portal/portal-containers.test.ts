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

const samples = [
  { id: 's1', contract_id: 'k1', wolthers_contract_nr: '42089/26', quality_name: 'GC17',
    seller: { name: 'Legal Seller', fantasy_name: 'Fancy Seller' }, exporter: null },
  { id: 's2', contract_id: 'k2', wolthers_contract_nr: '42090/26', quality_name: null,
    seller: null, exporter: { name: 'Exp Ltd', fantasy_name: null } },
]
const certs = [
  { sample_id: 's1', certificate_number: 'SAG-011895/26' },
  { sample_id: 's1', certificate_number: 'SAN-00231/26' },
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

describe('fetchPortalContainers', () => {
  it('returns [] with no shipments query when the company has no contracts', async () => {
    const { admin, calls } = mockAdmin({ samples: [] })
    expect(await fetchPortalContainers(admin, CO)).toEqual([])
    expect(calls.map(c => c.table)).toEqual(['samples'])
  })

  it('builds one row per container, sorted by ETD desc with nulls last', async () => {
    const { admin } = mockAdmin({ samples, certificates: certs, shipments })
    const rows = await fetchPortalContainers(admin, CO)
    expect(rows.map(r => r.containerNr)).toEqual(['ZZZU 3', 'MSNU 1', 'TGHU 2'])
    const r = rows[1]
    expect(r).toEqual({
      containerNr: 'MSNU 1', seal: 'S1', certificates: ['SAG-011895/26'], contractRefs: ['42089/26'],
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
})

describe('scoping and per-shipment rows', () => {
  it('records the scoping filters on every table', async () => {
    const { admin, calls } = mockAdmin({ samples, certificates: certs, shipments })
    await fetchPortalContainers(admin, CO)
    const of = (t: string) => calls.find(c => c.table === t)!.filters
    expect(of('samples')).toEqual(expect.arrayContaining([
      { op: 'or', args: [`client_id.eq.${CO},end_client_id.eq.${CO}`] },
      { op: 'is', args: ['deleted_at', null] },
      { op: 'not', args: ['contract_id', 'is', null] },
    ]))
    expect(of('certificates')).toEqual(expect.arrayContaining([
      { op: 'is', args: ['voided_at', null] },
      { op: 'in', args: ['sample_id', ['s1', 's2']] },
    ]))
    expect(of('shipments')).toEqual([{ op: 'in', args: ['contract_id', ['k1', 'k2']] }])
  })

  it('never surfaces a certificate of another company\'s sample', async () => {
    const { admin } = mockAdmin({ samples, certificates: [...certs, { sample_id: 'other', certificate_number: 'SAG-999/26' }], shipments })
    expect(JSON.stringify(await fetchPortalContainers(admin, CO))).not.toContain('SAG-999/26')
  })

  it('gives one row per shipment for a container reused across two contracts, in ETD order', async () => {
    const reuse = [
      { id: 'a', contract_id: 'k1', vessel_name: 'Old Ship', voyage_number: null, bl_number: null, etd: '2026-03-01', etd_actual: null, eta: null, eta_actual: null, transport_milestone: null,
        shipment_containers: [{ container: { container_number: 'REUSED 1', seal_number: null } }] },
      { id: 'b', contract_id: 'k2', vessel_name: 'New Ship', voyage_number: null, bl_number: null, etd: '2026-09-01', etd_actual: null, eta: null, eta_actual: null, transport_milestone: null,
        shipment_containers: [{ container: { container_number: 'REUSED 1', seal_number: null } }] },
    ]
    const { admin } = mockAdmin({ samples, certificates: [...certs, { sample_id: 's2', certificate_number: 'SAG-2/26' }], shipments: reuse })
    const rows = await fetchPortalContainers(admin, CO)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ vessel: 'New Ship', contractRefs: ['42090/26'], certificates: ['SAG-2/26'], quality: null })
    expect(rows[1]).toMatchObject({ vessel: 'Old Ship', contractRefs: ['42089/26'], certificates: ['SAG-011895/26'], quality: 'GC17' })
  })
})

describe('matchContainerSearch', () => {
  const row = { containerNr: 'MSNU 1', seal: null, certificates: ['SAG-1/26'], contractRefs: ['42089/26'], quality: null, seller: null,
    vessel: 'MSC Aurora', voyage: null, bl: 'BL99', etd: null, etdActual: false, eta: null, etaActual: false, milestone: null }
  it('matches container, contract, certificate, vessel and BL case-insensitively', () => {
    for (const q of ['', 'msnu', '42089', 'sag-1', 'aurora', 'bl99']) expect(matchContainerSearch(row, q)).toBe(true)
    expect(matchContainerSearch(row, 'zzz')).toBe(false)
  })
})
