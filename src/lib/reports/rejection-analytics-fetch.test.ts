import { describe, it, expect } from 'vitest'
import { fetchAnalyticsCertificates } from './rejection-analytics-fetch'

/** Certificates behind a server that caps every answer at 1000 rows. */
function fake(rows: unknown[]) {
  return {
    from: () => {
      let data = rows
      const chain: any = {
        select: () => chain, gte: () => chain, lt: () => chain, order: () => chain,
        range: (from: number, to: number) => { data = data.slice(from, to + 1); return chain },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: data.slice(0, 1000), error: null }),
      }
      return chain
    },
  } as any
}

const sample = { id: 's', deleted_at: null, sample_type: 'ss', wolthers_contract_nr: 'W-1', buyer_contract_nr: 'P-1',
  client: { name: 'Dunkin Brands', fantasy_name: 'Dunkin' }, exporter: { name: 'Cooxupé Ltda', fantasy_name: null } }
const row = (i: number, over: Record<string, unknown> = {}) => ({
  id: `c${i}`, certificate_number: `BR-${i}/26`, created_at: '2026-09-21T12:00:00Z', is_rejected: false,
  compliance_violations: null, sample, ...over,
})

describe('fetchAnalyticsCertificates', () => {
  it('reads past 1000 rows and maps the fields the page shows', async () => {
    const rows = Array.from({ length: 1203 }, (_, i) => row(i))
    rows[1202] = row(1202, { is_rejected: true, compliance_violations: ['Quakers: 12 exceeds maximum (8)', 7] })
    const out = await fetchAnalyticsCertificates(fake(rows), { start: 'a', end: 'b' })
    expect(out).toHaveLength(1203)
    expect(out[1202]).toMatchObject({
      certificateNumber: 'BR-1202/26', isRejected: true, violations: ['Quakers: 12 exceeds maximum (8)'],
      contract: 'W-1', buyerContract: 'P-1', client: 'Dunkin', shipper: 'Cooxupé Ltda', sampleType: 'ss',
    })
  })

  it('leaves out certificates of deleted or unjoined samples', async () => {
    const out = await fetchAnalyticsCertificates(
      fake([row(1), row(2, { sample: { ...sample, deleted_at: '2026-09-22' } }), row(3, { sample: null })]),
      { start: 'a', end: 'b' },
    )
    expect(out.map(c => c.id)).toEqual(['c1'])
  })
})
