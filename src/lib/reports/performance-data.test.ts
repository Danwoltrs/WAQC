import { describe, it, expect } from 'vitest'
import {
  aggregateBucket,
  sortAppendixRows,
  getPerformanceReportData,
  countContracts, countFcl,
  type PerformanceRow,
} from './performance-data'

const row = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
  approval_date: '2026-01-05T00:00:00Z',
  certificate_number: 'BR-000001/26',
  exporter_name: 'Cooxupe',
  seller_name: 'Cooxupe',
  importer_name: 'Coffee America',
  importer_contract_nr: 'IR1',
  roaster_name: 'Unsold',
  container_nr: 'C1',
  ico_marks: '001',
  bags: 333,
  mt: 20.0,
  is_rejected: false,
  region: 'Cerrado',
  ...over,
})

describe('aggregateBucket — counts (PSS)', () => {
  const rows = [
    row({ exporter_name: 'Ofi', importer_name: 'Ofi', is_rejected: false }),
    row({ exporter_name: 'Ofi', importer_name: 'Ofi', is_rejected: false }),
    row({ exporter_name: 'Cocatrel', importer_name: 'American Coffee', is_rejected: true }),
  ]

  it('totals approved/rejected and rejection rate', () => {
    const agg = aggregateBucket(rows, 'count')
    expect(agg.totals.evaluated).toBe(3)
    expect(agg.totals.approved).toBe(2)
    expect(agg.totals.rejected).toBe(1)
    expect(agg.totals.rejectionRate).toBe(33)
  })

  it('per-exporter approved/rejected with rate', () => {
    const agg = aggregateBucket(rows, 'count')
    const ofi = agg.byExporter.find(e => e.name === 'Ofi')!
    const coc = agg.byExporter.find(e => e.name === 'Cocatrel')!
    expect(ofi.approvedCount).toBe(2)
    expect(ofi.rejectionRate).toBe(0)
    expect(coc.rejectedCount).toBe(1)
    expect(coc.rejectionRate).toBe(100)
  })

  it('approved-by-region uses counts and percentages', () => {
    const agg = aggregateBucket(rows, 'count')
    const cerrado = agg.approvedByRegion.find(r => r.region === 'Cerrado')!
    expect(cerrado.count).toBe(2)
    expect(cerrado.pct).toBe(100)
  })
})

describe('aggregateBucket — bags + MT (SS)', () => {
  const rows = [
    row({ bags: 3334, mt: 200.0, region: 'Cerrado/South Of Minas', is_rejected: false }),
    row({ bags: 2667, mt: 160.0, region: 'Cerrado/Mogiana', is_rejected: false }),
    row({ bags: 333, mt: 20.0, is_rejected: true }),   // rejected — excluded from approved sums
  ]
  it('sums approved bags and MT only', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.totals.bagsApproved).toBe(6001)
    expect(agg.totals.mtApproved).toBe(360.0)
    const a = agg.approvedByRegion.find(r => r.region === 'Cerrado/South Of Minas')!
    expect(a.bags).toBe(3334)
    expect(a.pct).toBe(56)
  })
  it('rounds mtApproved to 1 decimal', () => {
    const agg = aggregateBucket([row({ mt: 17.7 }), row({ mt: 19.24 })], 'bags')
    expect(agg.totals.mtApproved).toBe(36.9)
  })
})

describe('aggregateBucket — rejection reasons (certificates per reason)', () => {
  // _violations is attached to rows by the fetcher and read via a cast.
  const rej = (violations: string[]): PerformanceRow =>
    ({ ...row({ is_rejected: true }), _violations: violations } as PerformanceRow)

  it('counts each rejected certificate once per reason category', () => {
    const rows = [
      // one cert, two "Total defects" lines → still ONE cert for that reason
      rej(['Total defects: 12 exceeds maximum (8)', 'Total defects: 20 exceeds maximum (8)']),
      rej(['Total defects: 9 exceeds maximum (8)', 'Cupping faults: 2 exceeds maximum (0)']),
      row({ is_rejected: false }),   // approved — contributes no reasons
    ]
    const byCat = Object.fromEntries(
      aggregateBucket(rows, 'count').rejectionReasons.map(r => [r.category, r.count]),
    )
    // Total defects collapses into "Secondary defects" (see below).
    expect(byCat['Secondary defects']).toBe(2)   // two certs, not three occurrences
    expect(byCat['Cupping faults']).toBe(1)
  })

  it('collapses the green-defect family: total→secondary, primary wins per cert', () => {
    const rows = [
      rej(['Total defects: 12 exceeds maximum (8)']),                       // total-only → Secondary
      rej(['Secondary defects: 20 exceeds maximum (15)',
           'Total defects: 22 exceeds maximum (8)']),                       // secondary+total → one Secondary
      rej(['Primary defects: 3 exceeds maximum (2)',                        // primary present → Primary only
           'Secondary defects: 10 exceeds maximum (15)',
           'Total defects: 13 exceeds maximum (8)']),
    ]
    const byCat = Object.fromEntries(
      aggregateBucket(rows, 'count').rejectionReasons.map(r => [r.category, r.count]),
    )
    expect(byCat['Secondary defects']).toBe(2)   // certs 1 + 2
    expect(byCat['Primary defects']).toBe(1)     // cert 3 (secondary/total suppressed)
    expect(byCat['Total defects']).toBeUndefined()
  })

  it('ranks reasons by certificate count descending', () => {
    const rows = [
      rej(['Total defects: 12 exceeds maximum (8)']),
      rej(['Total defects: 12 exceeds maximum (8)']),
      rej(['Moisture: 13 exceeds maximum (12)']),
    ]
    expect(aggregateBucket(rows, 'count').rejectionReasons.map(r => r.category))
      .toEqual(['Secondary defects', 'Moisture'])
  })
})

describe('aggregateBucket — empty', () => {
  it('handles no rows without dividing by zero', () => {
    const agg = aggregateBucket([], 'count')
    expect(agg.totals.evaluated).toBe(0)
    expect(agg.totals.rejectionRate).toBe(0)
    expect(agg.totals.mtApproved).toBe(0)
    expect(agg.byImporter).toEqual([])
    expect(agg.approvedByRegion).toEqual([])
  })
})

describe('countContracts', () => {
  it('counts distinct importer contract numbers', () => {
    expect(countContracts([
      row({ importer_contract_nr: 'IR0007919-1' }),
      row({ importer_contract_nr: 'IR0007919-1' }),
      row({ importer_contract_nr: 'IR0007920-1' }),
    ])).toBe(2)
  })
  it('trims and ignores case-identical whitespace variants', () => {
    expect(countContracts([
      row({ importer_contract_nr: ' IR1 ' }),
      row({ importer_contract_nr: 'IR1' }),
    ])).toBe(1)
  })
  it('counts each certificate with no contract number as its own contract', () => {
    expect(countContracts([
      row({ importer_contract_nr: 'IR1' }),
      row({ importer_contract_nr: null }),
      row({ importer_contract_nr: '  ' }),
    ])).toBe(3)
  })
})

describe('countFcl', () => {
  it('counts distinct containers', () => {
    expect(countFcl([
      row({ container_nr: 'MSNU 315.234-7' }),
      row({ container_nr: 'MSNU 315.234-7' }),
      row({ container_nr: 'MSMU 386.677-8' }),
    ])).toBe(2)
  })
  it('is zero when no row carries a container (PSS)', () => {
    expect(countFcl([row({ container_nr: null }), row({ container_nr: '' })])).toBe(0)
  })
})

describe('aggregateBucket — contracts, FCL, MT', () => {
  const rows = [
    row({ importer_contract_nr: 'IR1', container_nr: 'C1', bags: 350, mt: 21.0, is_rejected: false }),
    row({ importer_contract_nr: 'IR1', container_nr: 'C2', bags: 350, mt: 21.0, is_rejected: false }),
    row({ importer_contract_nr: 'IR2', container_nr: 'C3', bags: 360, mt: 21.6, is_rejected: true }),
  ]
  it('reports contracts and FCL on the totals', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.totals.contracts).toBe(2)
    expect(agg.totals.fcl).toBe(3)
  })
  it('sums rejected bags and MT separately from approved', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.totals.bagsApproved).toBe(700)
    expect(agg.totals.mtApproved).toBe(42.0)
    expect(agg.totals.bagsRejected).toBe(360)
    expect(agg.totals.mtRejected).toBe(21.6)
  })
  it('carries approved and rejected MT on each group', () => {
    const agg = aggregateBucket(rows, 'bags')
    const g = agg.byExporter.find(e => e.name === 'Cooxupe')!
    expect(g.approvedMt).toBe(42.0)
    expect(g.rejectedMt).toBe(21.6)
  })
  it('carries MT on each region row', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.approvedByRegion.find(r => r.region === 'Cerrado')!.mt).toBe(42.0)
  })
})

describe('aggregateBucket — bySeller', () => {
  it('groups on the seller, falling back to the shipper when unset', () => {
    const agg = aggregateBucket([
      row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH' }),
      row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH' }),
      row({ exporter_name: 'Veloso Green Coffee', seller_name: null }),
    ], 'count')
    expect(agg.bySeller.map(g => g.name)).toEqual(['Volcafe CH', 'Veloso Green Coffee'])
    expect(agg.bySeller.find(g => g.name === 'Volcafe CH')!.approvedCount).toBe(2)
  })
})

describe('sortAppendixRows', () => {
  it('puts approved before rejected, each sub-sorted by shipper then date', () => {
    const rows = [
      row({ certificate_number: 'R-Ofi', exporter_name: 'Ofi', is_rejected: true, approval_date: '2026-01-02T00:00:00Z' }),
      row({ certificate_number: 'A-Ofi', exporter_name: 'Ofi', is_rejected: false, approval_date: '2026-01-05T00:00:00Z' }),
      row({ certificate_number: 'A-Cooxupe-2', exporter_name: 'Cooxupe', is_rejected: false, approval_date: '2026-01-09T00:00:00Z' }),
      row({ certificate_number: 'A-Cooxupe-1', exporter_name: 'Cooxupe', is_rejected: false, approval_date: '2026-01-03T00:00:00Z' }),
      row({ certificate_number: 'R-Cocatrel', exporter_name: 'Cocatrel', is_rejected: true, approval_date: '2026-01-01T00:00:00Z' }),
    ]
    const sorted = sortAppendixRows(rows).map(r => r.certificate_number)
    expect(sorted).toEqual([
      // approved, by shipper (Cooxupe < Ofi), Cooxupe by date asc
      'A-Cooxupe-1', 'A-Cooxupe-2', 'A-Ofi',
      // then rejected, by shipper (Cocatrel < Ofi)
      'R-Cocatrel', 'R-Ofi',
    ])
  })
  it('does not mutate the input array', () => {
    const rows = [row({ is_rejected: true }), row({ is_rejected: false })]
    const copy = [...rows]
    sortAppendixRows(rows)
    expect(rows).toEqual(copy)
  })
})

// ---------------------------------------------------------------------------
// Fetcher: the report's unit is the CERTIFICATE, so every commercial split
// counts. Reporting only mother certificates showed a 3-container shipment as
// one certificate.
// ---------------------------------------------------------------------------

const CLIENT = {
  id: 'client-1', name: 'Ahold Delhaize Coffee Company', fantasy_name: null,
  logo_url: null, company_types: ['roaster'], trading_roles: [],
}

const motherSample = {
  id: 's1', sample_type: 'ss', client_id: 'client-1', origin: 'Brazil',
  micro_origin: 'Cerrado', container_nr: 'MOTHER1', ico_number: '001/1',
  bag_count: 300, bag_weight_kg: 60, equivalent_60kg_bags: null,
  bags_quantity_mt: null, buyer_contract_nr: 'IR-1',
  exporter: { name: 'Veloso Green Coffee', fantasy_name: null },
  seller: { name: 'Veloso Green Coffee', fantasy_name: null },
  importer: { name: 'Coffee America', fantasy_name: null },
  roaster: null,
}

/** Mother certificate + two split certificates on the same sample. */
const CERTS = [
  { certificate_number: 'BR-000001/26', created_at: '2026-07-02T00:00:00Z', is_rejected: false, compliance_violations: null, sample_contract_id: null, sample: motherSample },
  { certificate_number: 'BR-000002/26', created_at: '2026-07-03T00:00:00Z', is_rejected: false, compliance_violations: null, sample_contract_id: 'sc1', sample: motherSample },
  { certificate_number: 'BR-000003/26', created_at: '2026-07-04T00:00:00Z', is_rejected: false, compliance_violations: null, sample_contract_id: 'sc2', sample: motherSample },
]

const SUBS = [
  { id: 'sc1', client_id: null, container_nr: 'SPLIT1', ico_number: '001/2', buyer_contract_nr: 'IR-1a', bag_count: 275, bag_weight_kg: 60, equivalent_60kg_bags: null, bags_quantity_mt: null, importer_is_qc_client: null, importer: { name: 'Ahold Delhaize', fantasy_name: null }, roaster: null },
  { id: 'sc2', client_id: null, container_nr: 'SPLIT2', ico_number: '001/3', buyer_contract_nr: 'IR-1b', bag_count: 100, bag_weight_kg: 60, equivalent_60kg_bags: null, bags_quantity_mt: null, importer_is_qc_client: null, importer: { name: 'Ahold Delhaize', fantasy_name: null }, roaster: null },
]

/**
 * Minimal awaitable Supabase stub for the four tables the fetcher reads.
 * `.is()` and `.in()` really filter, so a query that excludes sub-contract
 * certificates here excludes them in production too.
 */
function fakeSupabase(over: { certs?: unknown[]; subs?: unknown[]; qa?: unknown[] } = {}) {
  return {
    from(table: string) {
      const rows: any =
        table === 'companies' ? CLIENT
        : table === 'certificates' ? (over.certs ?? CERTS)
        : table === 'sample_contracts' ? (over.subs ?? SUBS)
        : table === 'quality_assessments' ? (over.qa ?? [])
        : []
      let data = rows
      const chain: Record<string, unknown> = {}
      const self = () => chain
      const payload = () => ({ data, error: null })
      Object.assign(chain, {
        select: self, eq: self, gte: self, lt: self, order: self, limit: self,
        is: (col: string, val: unknown) => {
          if (Array.isArray(data)) data = data.filter((r: any) => (r[col] ?? null) === val)
          return chain
        },
        in: (col: string, vals: unknown[]) => {
          if (Array.isArray(data)) data = data.filter((r: any) => vals.includes(r[col]))
          return chain
        },
        single: async () => payload(),
        maybeSingle: async () => payload(),
        then: (resolve: (v: unknown) => unknown) => resolve(payload()),
      })
      return chain
    },
  } as any
}

const runSS = (supabase: any) =>
  getPerformanceReportData(supabase, {
    clientId: 'client-1', startDate: '2026-07-01', endDate: '2026-07-31', buckets: ['ss'],
  })

describe('getPerformanceReportData — sub-contract certificates', () => {
  it('counts every certificate, mother plus each split', async () => {
    const data = await runSS(fakeSupabase())
    expect(data!.ss!.totals.evaluated).toBe(3)
    expect(data!.ss!.totals.approved).toBe(3)
    expect(data!.ss!.rows.map(r => r.certificate_number)).toEqual([
      'BR-000001/26', 'BR-000002/26', 'BR-000003/26',
    ])
  })

  it('adds each split under the mother’s shipper, so the shipper bar counts all of them', async () => {
    const data = await runSS(fakeSupabase())
    const veloso = data!.ss!.byExporter.find(e => e.name === 'Veloso Green Coffee')!
    expect(veloso.approvedCount).toBe(3)
  })

  it('sums each contract’s own bags — the split’s, not a repeat of the mother’s', async () => {
    const data = await runSS(fakeSupabase())
    // 300 (mother contract) + 275 (split 1) + 100 (split 2)
    expect(data!.ss!.totals.bagsApproved).toBe(675)
    expect(data!.ss!.rows.map(r => r.container_nr)).toEqual(['MOTHER1', 'SPLIT1', 'SPLIT2'])
    expect(data!.ss!.rows.map(r => r.importer_contract_nr)).toEqual(['IR-1', 'IR-1a', 'IR-1b'])
  })

  it('routes a split sold to another QC client out of this client’s report', async () => {
    const subs = [SUBS[0], { ...SUBS[1], client_id: 'client-2' }]
    const data = await runSS(fakeSupabase({ subs }))
    expect(data!.ss!.totals.evaluated).toBe(2)
  })

  it('drops a split certificate whose contract row is missing rather than repeating the mother', async () => {
    const data = await runSS(fakeSupabase({ subs: [SUBS[0]] }))
    expect(data!.ss!.totals.evaluated).toBe(2)
    expect(data!.ss!.totals.bagsApproved).toBe(575)
  })
})

// ---------------------------------------------------------------------------
// The certificate query was widened to fetch the whole calendar year (for the
// YTD supplier rating), so everything except `ratings` must be re-filtered
// back down to the report period in memory. These fixtures give the YTD and
// period views a certificate that only one of them should see, to pin that
// re-filtering against a regression that drops it (e.g. a stray use of the
// year-wide row set where the period-filtered one belongs).
// ---------------------------------------------------------------------------

const inPeriodSample = {
  id: 's-ytd-in', sample_type: 'ss', client_id: 'client-1', origin: 'Brazil',
  micro_origin: 'Cerrado', container_nr: 'YTD-IN', ico_number: '900/1',
  bag_count: 300, bag_weight_kg: 60, equivalent_60kg_bags: null,
  bags_quantity_mt: null, buyer_contract_nr: 'IR-YTD-IN',
  exporter: { name: 'In-Period Farms', fantasy_name: null },
  seller: { name: 'In-Period Sellers', fantasy_name: null },
  importer: { name: 'Coffee America', fantasy_name: null },
  roaster: null,
}

// Same client, same calendar year, but BEFORE the report's startDate — and
// origin/count chosen so it would win the header's dominant-origin vote and
// would show up in the named-defect breakdown if it leaked into the period.
const outOfPeriodSample = {
  id: 's-ytd-out', sample_type: 'ss', client_id: 'client-1', origin: 'Colombia',
  micro_origin: 'Huila', container_nr: 'YTD-OUT', ico_number: '900/2',
  bag_count: 400, bag_weight_kg: 60, equivalent_60kg_bags: null,
  bags_quantity_mt: null, buyer_contract_nr: 'IR-YTD-OUT',
  exporter: { name: 'Out-of-Period Farms', fantasy_name: null },
  seller: { name: 'Out-of-Period Sellers', fantasy_name: null },
  importer: { name: 'Coffee America', fantasy_name: null },
  roaster: null,
}

const CERTS_YTD_SPLIT = [
  { certificate_number: 'BR-YTD-IN/26', created_at: '2026-07-05T00:00:00Z', is_rejected: false, compliance_violations: null, sample_contract_id: null, sample: inPeriodSample },
  // Two rejected certs in March — same year as the July report, but before
  // its startDate. Two of these outvotes the single in-period Brazil cert,
  // so an origin leak would flip the header from Brazil to Colombia.
  { certificate_number: 'BR-YTD-OUT-1/26', created_at: '2026-03-01T00:00:00Z', is_rejected: true, compliance_violations: ['Primary defects: 5 exceeds maximum (2)'], sample_contract_id: null, sample: outOfPeriodSample },
  { certificate_number: 'BR-YTD-OUT-2/26', created_at: '2026-03-02T00:00:00Z', is_rejected: true, compliance_violations: ['Primary defects: 5 exceeds maximum (2)'], sample_contract_id: null, sample: outOfPeriodSample },
]

// Real green-defect data for the out-of-period rejected sample. If
// `rejectedIdsFor` regressed to reading the year-wide row set instead of the
// period-filtered one, this sample's id would end up in the quality_assessments
// `.in()` query and its defect would leak into `ss.greenDefects`.
const QA_YTD_SPLIT = [
  { sample_id: 's-ytd-out', green_bean_data: { counts: { Black: 9 } }, resolved_defects: null, created_at: '2026-03-01T00:00:00Z' },
]

describe('getPerformanceReportData — YTD ratings vs. period aggregates', () => {
  it('feeds the whole year into ratings but keeps period aggregates, defect breakdown, and header origin scoped to the report window', async () => {
    const data = await runSS(fakeSupabase({ certs: CERTS_YTD_SPLIT, subs: [], qa: QA_YTD_SPLIT }))

    // The YTD rating sees both shippers/sellers, in-period and out-of-period alike.
    const shipperNames = data!.ratings.shippers.map(r => r.name)
    expect(shipperNames).toEqual(expect.arrayContaining(['In-Period Farms', 'Out-of-Period Farms']))
    const outShipper = data!.ratings.shippers.find(r => r.name === 'Out-of-Period Farms')!
    expect(outShipper).toMatchObject({ total: 2, ss: 2, approvalRate: 0 })
    const sellerNames = data!.ratings.sellers.map(r => r.name)
    expect(sellerNames).toEqual(expect.arrayContaining(['In-Period Sellers', 'Out-of-Period Sellers']))

    // The report-period bucket sees ONLY the in-period certificate.
    expect(data!.ss!.totals.evaluated).toBe(1)
    expect(data!.ss!.totals.rejected).toBe(0)
    expect(data!.ss!.rows.map(r => r.certificate_number)).toEqual(['BR-YTD-IN/26'])

    // The named rejection breakdown must not see the out-of-period sample's defect.
    expect(data!.ss!.greenDefects).toEqual([])

    // Colombia (2 out-of-period certs) would beat Brazil (1 in-period cert) if
    // counted — the header origin must still resolve to the in-period-only origin.
    expect(data!.origin).toBe('Brazil')
  })
})
