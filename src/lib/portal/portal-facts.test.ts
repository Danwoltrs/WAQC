import { describe, expect, it } from 'vitest'
import { fetchPortalCertFacts, NOT_RECORDED } from './portal-facts'
import { parsePortalPeriod } from './portal-period'

const CO = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const period = parsePortalPeriod('crop-2026')

function sample(over: any = {}) {
  return {
    id: 's1', deleted_at: null, lab_source_sample_id: null, sample_type: 'pss', client_id: CO, end_client_id: null,
    origin: 'Brazil', quality_name: 'GC17', crop_year: '26/27', container_nr: null, wolthers_contract_nr: '42089/26',
    importer_is_qc_client: false, bag_count: null, bag_weight_kg: null, bag_type: null, equivalent_60kg_bags: null, bags_quantity_mt: null,
    laboratory: { name: 'Santos' }, seller: { name: 'Seller Ltd', fantasy_name: 'Seller' }, exporter: null,
    importer: { name: 'Imp', fantasy_name: null }, roaster: { name: 'Roast', fantasy_name: 'Roasty' },
    ...over,
  }
}
function cert(id: string, over: any = {}, sampleOver: any = {}) {
  return { id, certificate_number: 'SAG-011895/26', created_at: '2026-10-01T10:00:00Z', is_rejected: false,
    compliance_violations: null, override_comment: null, sample: sample({ id: `s-${id}`, ...sampleOver }), ...over }
}

function mock(pages: (from: number, to: number) => any[]) {
  const calls = { eq: [] as any[], or: [] as any[], range: [] as any[], companies: 0 }
  const admin = {
    from(table: string) {
      if (table === 'companies') {
        const c: any = {
          select() { return c }, eq() { return c }, maybeSingle() { calls.companies++; return Promise.resolve({ data: { name: 'Client Legal', fantasy_name: 'Client Fancy' }, error: null }) },
        }
        return c
      }
      let r: [number, number] = [0, 0]
      const chain: any = {
        select() { return chain }, is() { return chain }, in() { return chain }, gte() { return chain }, lt() { return chain }, order() { return chain },
        eq(...a: any[]) { calls.eq.push(a); return chain },
        or(...a: any[]) { calls.or.push(a); return chain },
        range(a: number, b: number) { calls.range.push([a, b]); r = [a, b]; return chain },
        then(ok: any, bad: any) { return Promise.resolve({ data: pages(r[0], r[1]), error: null }).then(ok, bad) },
      }
      return chain
    },
  }
  return { admin: admin as any, calls }
}

describe('fetchPortalCertFacts', () => {
  it('scopes by client or by client-or-end', async () => {
    const a = mock(() => [])
    await fetchPortalCertFacts(a.admin, { companyId: CO, period, scope: 'client' })
    expect(a.calls.eq).toContainEqual(['samples.client_id', CO])
    const b = mock(() => [])
    await fetchPortalCertFacts(b.admin, { companyId: CO, period, scope: 'client_or_end' })
    expect(b.calls.or).toContainEqual([`client_id.eq.${CO},end_client_id.eq.${CO}`, { referencedTable: 'samples' }])
  })

  it('never exposes a SAN number and falls back to the contract ref', async () => {
    const m = mock(() => [cert('c1', { certificate_number: 'SAN-00231/26' })])
    const facts = await fetchPortalCertFacts(m.admin, { companyId: CO, period, scope: 'client' })
    expect(facts[0].certificateNumber).toBeNull()
    expect(facts[0].contractRef).toBe('42089/26')
    expect(JSON.stringify(facts)).not.toContain('SAN-')
  })

  it('maps missing parties to Not recorded and names the lab', async () => {
    const m = mock(() => [cert('c1', {}, { seller: null, exporter: null, roaster: null, laboratory: null, importer: null, importer_is_qc_client: true })])
    const f = (await fetchPortalCertFacts(m.admin, { companyId: CO, period, scope: 'client' }))[0]
    expect(f.seller).toBe(NOT_RECORDED)
    expect(f.roaster).toBe(NOT_RECORDED)
    expect(f.lab).toBe(NOT_RECORDED)
    expect(f.importer).toBe('Client Fancy')
    const m2 = mock(() => [cert('c1', {}, { importer: null })])
    expect((await fetchPortalCertFacts(m2.admin, { companyId: CO, period, scope: 'client' }))[0].importer).toBe(NOT_RECORDED)
    const m3 = mock(() => [cert('c1'), cert('c2', {}, { importer: null, importer_is_qc_client: true })])
    await fetchPortalCertFacts(m3.admin, { companyId: CO, period, scope: 'client' })
    expect(m3.calls.companies).toBe(1)
  })

  it('labels the lab, falls back seller to exporter, and sets type and ids', async () => {
    const m = mock(() => [cert('c1', {}, { seller: null, exporter: { name: 'Exp', fantasy_name: null }, sample_type: 'ss', lab_source_sample_id: 'lab-1' })])
    const f = (await fetchPortalCertFacts(m.admin, { companyId: CO, period, scope: 'client' }))[0]
    expect(f.lab).toBe('Santos lab')
    expect(f.seller).toBe('Exp')
    expect(f.type).toBe('ss')
    expect(f.labSampleId).toBe('lab-1')
    expect(f.issuedAt).toBe('2026-10-01T10:00:00Z')
  })

  it('names a status-override rejection', async () => {
    const m = mock(() => [cert('c1', { is_rejected: true, compliance_violations: [], override_comment: 'Customer request' })])
    const f = (await fetchPortalCertFacts(m.admin, { companyId: CO, period, scope: 'client' }))[0]
    expect(f.rejected).toBe(true)
    expect(f.violations).toEqual(['Status override'])
  })

  it('drops deleted samples and other clients (client scope)', async () => {
    const m = mock(() => [cert('c1'), cert('c2', {}, { deleted_at: '2026-10-02T00:00:00Z' }), cert('c3', {}, { client_id: OTHER })])
    const facts = await fetchPortalCertFacts(m.admin, { companyId: CO, period, scope: 'client' })
    expect(facts.map((f) => f.id)).toEqual(['c1'])
  })

  it('keeps end-client rows in client_or_end scope', async () => {
    const m = mock(() => [cert('c1', {}, { client_id: OTHER, end_client_id: CO }), cert('c2', {}, { client_id: OTHER })])
    const facts = await fetchPortalCertFacts(m.admin, { companyId: CO, period, scope: 'client_or_end' })
    expect(facts.map((f) => f.id)).toEqual(['c1'])
  })

  it('pages past 1000 rows', async () => {
    const m = mock((from) => from === 0
      ? Array.from({ length: 1000 }, (_, i) => cert(`a${i}`))
      : from === 1000 ? Array.from({ length: 3 }, (_, i) => cert(`b${i}`)) : [])
    const facts = await fetchPortalCertFacts(m.admin, { companyId: CO, period, scope: 'client' })
    expect(facts).toHaveLength(1003)
    expect(m.calls.range).toEqual([[0, 999], [1000, 1999]])
  })
})
