import { describe, it, expect } from 'vitest'
import {
  aggregateBucket,
  sortAppendixRows,
  getPerformanceReportData,
  countContracts, countFcl,
  buildBucketSankey,
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
  // One sample per contract: each certificate IS one contract, so the count is
  // the row count. Counting distinct importer references collapsed contracts
  // that share a buyer reference (and certificates with none), which is how the
  // Pre-Shipment band read 19 contracts against 12 approved + 10 rejected.
  it('reports 22 contracts for 12 approved + 10 rejected certificates', () => {
    const approved = Array.from({ length: 12 }, (_, i) => row({
      certificate_number: `A-${i}`,
      // two pairs share a buyer reference — distinct refs would say 10
      importer_contract_nr: ['IR-1', 'IR-1', 'IR-2', 'IR-2'][i] ?? `IR-${i}`,
      is_rejected: false,
    }))
    const rejected = Array.from({ length: 10 }, (_, i) => row({
      certificate_number: `R-${i}`,
      // one shared reference and one missing — distinct refs would say 9
      importer_contract_nr: i < 2 ? 'IR-R' : i === 9 ? null : `IR-R${i}`,
      is_rejected: true,
    }))
    expect(countContracts([...approved, ...rejected])).toBe(22)
  })
  it('counts a certificate with no importer reference like any other', () => {
    expect(countContracts([
      row({ importer_contract_nr: 'IR1' }),
      row({ importer_contract_nr: null }),
      row({ importer_contract_nr: '  ' }),
    ])).toBe(3)
  })
  it('is zero for an empty bucket', () => {
    expect(countContracts([])).toBe(0)
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
    expect(agg.totals.contracts).toBe(3)   // one per certificate, shared IR1 or not
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

describe('buildBucketSankey', () => {
  it('builds a flow from approved rows only and reports 3 columns for a roaster', () => {
    const built = buildBucketSankey(
      [
        row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH', importer_name: 'Ahold', bags: 350 }),
        row({ exporter_name: 'Ecom', seller_name: 'Ecom', importer_name: 'Ahold', bags: 360, is_rejected: true }),
      ],
      [
        { name: 'Grano Trading', approvedCount: 1, rejectedCount: 0, approvedBags: 350, rejectedBags: 0, approvedMt: 21, rejectedMt: 0, rejectionRate: 0 },
      ],
      'roaster',
      'Ahold',
    )
    expect(built.sankeyColumns).toEqual(['Shipper', 'Seller', 'Importer'])
    expect(built.showSankey).toBe(true)
    expect(built.sankey).not.toBeNull()
  })

  it('hides a 2-column flow', () => {
    const built = buildBucketSankey([row()], [], 'importer', 'Blaser')
    expect(built.sankeyColumns).toEqual(['Shipper', 'Seller'])
    expect(built.showSankey).toBe(false)
  })

  it('hides a 3+ column flow when every row has no quantity, so buildSankey draws no links', () => {
    // A PSS bucket whose samples carry no bag count: the column list still
    // resolves to 3 (roaster client), but buildSankey skips every row
    // (bags <= 0), leaving a "Supply chain flow" panel with nothing to draw.
    const built = buildBucketSankey(
      [row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH', importer_name: 'Ahold', bags: 0 })],
      [{ name: 'Grano Trading', approvedCount: 1, rejectedCount: 0, approvedBags: 0, rejectedBags: 0, approvedMt: 0, rejectedMt: 0, rejectionRate: 0 }],
      'roaster',
      'Ahold',
    )
    expect(built.sankeyColumns).toEqual(['Shipper', 'Seller', 'Importer'])
    expect(built.sankey!.links).toEqual([])
    expect(built.showSankey).toBe(false)
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
// Fetcher: one sample per contract. A physical sample covering three contracts
// is three `samples` rows — the LAB UNIT (cupped, graded) plus two SIBLINGS
// pointing at it through `lab_source_sample_id` — each with its own
// certificate. The report's unit is the certificate, and every one counts.
// ---------------------------------------------------------------------------

const CLIENT = {
  id: 'client-1', name: 'Ahold Delhaize Coffee Company', fantasy_name: null,
  logo_url: null, company_types: ['roaster'], trading_roles: [],
}

const labUnit = {
  id: 's1', lab_source_sample_id: null, sample_type: 'ss', client_id: 'client-1', origin: 'Brazil',
  micro_origin: 'Cerrado', container_nr: 'MOTHER1', ico_number: '001/1',
  bag_count: 300, bag_weight_kg: 60, equivalent_60kg_bags: null,
  bags_quantity_mt: null, container_count: null, buyer_contract_nr: 'IR-1',
  importer_is_qc_client: null,
  exporter: { name: 'Veloso Green Coffee', fantasy_name: null },
  seller: { name: 'Veloso Green Coffee', fantasy_name: null },
  importer: { name: 'Coffee America', fantasy_name: null },
  roaster: null,
}

// Siblings carry the supply side the copy rule gave them and their OWN buyer
// side, container, ICO and quantity.
const sibling1 = {
  ...labUnit, id: 's2', lab_source_sample_id: 's1', container_nr: 'SIBLING1', ico_number: '001/2',
  buyer_contract_nr: 'IR-1a', bag_count: 275, importer: { name: 'Ahold Delhaize', fantasy_name: null },
}
const sibling2 = {
  ...labUnit, id: 's3', lab_source_sample_id: 's1', container_nr: 'SIBLING2', ico_number: '001/3',
  buyer_contract_nr: 'IR-1b', bag_count: 100, importer: { name: 'Ahold Delhaize', fantasy_name: null },
}

const cert = (over: Record<string, unknown>) => ({
  created_at: '2026-07-02T00:00:00Z', is_rejected: false, compliance_violations: null, ...over,
})

/** The lab unit's certificate plus one per sibling. */
const CERTS = [
  cert({ certificate_number: 'BR-000001/26', created_at: '2026-07-02T00:00:00Z', sample: labUnit }),
  cert({ certificate_number: 'BR-000002/26', created_at: '2026-07-03T00:00:00Z', sample: sibling1 }),
  cert({ certificate_number: 'BR-000003/26', created_at: '2026-07-04T00:00:00Z', sample: sibling2 }),
]

/**
 * Minimal awaitable Supabase stub for the tables the fetcher reads. `.is()`
 * and `.in()` really filter, so a query that excludes sibling certificates
 * here excludes them in production too; every `.in()` call is recorded so a
 * test can pin WHICH ids a lookup was keyed on.
 */
function fakeSupabase(over: { certs?: unknown[]; qa?: unknown[] } = {}) {
  const inFilters: Array<{ table: string; col: string; vals: unknown[] }> = []
  return {
    inFilters,
    from(table: string) {
      const rows: any =
        table === 'companies' ? CLIENT
        : table === 'certificates' ? (over.certs ?? CERTS)
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
          inFilters.push({ table, col, vals })
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

describe('getPerformanceReportData — sibling certificates', () => {
  it('counts every certificate: the lab unit’s and each sibling’s', async () => {
    const data = await runSS(fakeSupabase())
    expect(data!.ss!.totals.evaluated).toBe(3)
    expect(data!.ss!.totals.approved).toBe(3)
    expect(data!.ss!.rows.map(r => r.certificate_number)).toEqual([
      'BR-000001/26', 'BR-000002/26', 'BR-000003/26',
    ])
  })

  it('reports one contract per certificate', async () => {
    const data = await runSS(fakeSupabase())
    expect(data!.ss!.totals.contracts).toBe(3)
  })

  it('adds each sibling under the shipper it shares with the lab unit, so the shipper bar counts all of them', async () => {
    const data = await runSS(fakeSupabase())
    const veloso = data!.ss!.byExporter.find(e => e.name === 'Veloso Green Coffee')!
    expect(veloso.approvedCount).toBe(3)
  })

  it('sums each contract’s own bags — siblings add up, they never subdivide the lab unit', async () => {
    const data = await runSS(fakeSupabase())
    // 300 (lab unit's contract) + 275 (sibling 1) + 100 (sibling 2)
    expect(data!.ss!.totals.bagsApproved).toBe(675)
    expect(data!.ss!.rows.map(r => r.container_nr)).toEqual(['MOTHER1', 'SIBLING1', 'SIBLING2'])
    expect(data!.ss!.rows.map(r => r.importer_contract_nr)).toEqual(['IR-1', 'IR-1a', 'IR-1b'])
  })

  it('routes a sibling sold to another QC client out of this client’s report', async () => {
    const certs = [CERTS[0], CERTS[1], cert({ certificate_number: 'BR-000003/26', sample: { ...sibling2, client_id: 'client-2' } })]
    const data = await runSS(fakeSupabase({ certs }))
    expect(data!.ss!.totals.evaluated).toBe(2)
    expect(data!.ss!.totals.bagsApproved).toBe(575)
  })

  it('drops a certificate whose sample row did not join rather than crashing the report', async () => {
    const certs = [CERTS[0], CERTS[1], cert({ certificate_number: 'BR-000003/26', sample: null })]
    const data = await runSS(fakeSupabase({ certs }))
    expect(data!.ss!.totals.evaluated).toBe(2)
  })
})

// Lab data lives only on the lab unit. A rejected sibling's defects are the
// lab unit's, and a group rejected on one cupping is one graded lot however
// many certificates carry the rejection.
describe('getPerformanceReportData — rejection defects through the lab unit', () => {
  const REJECTED = ['Primary defects: 5 exceeds maximum (2)']
  const QA = [
    { sample_id: 's1', green_bean_data: { defects: { counts: { Black: 9 }, primary: 9, secondary: 0 } }, resolved_defects: null, created_at: '2026-07-02T00:00:00Z' },
  ]

  it('reads a rejected sibling’s grading from its lab unit', async () => {
    const db = fakeSupabase({
      certs: [cert({ certificate_number: 'R-000002/26', is_rejected: true, compliance_violations: REJECTED, sample: sibling1 })],
      qa: QA,
    })
    const data = await runSS(db)
    const qaLookup = db.inFilters.find((f: any) => f.table === 'quality_assessments')!
    expect(qaLookup.vals).toEqual(['s1'])   // the lab id, not the sibling's own
    expect(data!.ss!.greenDefects).toEqual([{ name: 'Black', count: 9, max: 9 }])
    expect(data!.ss!.defectLoad).toEqual({ avg: 9, max: 9, graded: 1 })
  })

  it('counts the group’s grading once while every certificate still counts as a rejection', async () => {
    const db = fakeSupabase({
      certs: [
        cert({ certificate_number: 'R-000001/26', is_rejected: true, compliance_violations: REJECTED, sample: labUnit }),
        cert({ certificate_number: 'R-000002/26', is_rejected: true, compliance_violations: REJECTED, sample: sibling1 }),
        cert({ certificate_number: 'R-000003/26', is_rejected: true, compliance_violations: REJECTED, sample: sibling2 }),
      ],
      qa: QA,
    })
    const data = await runSS(db)
    const qaLookup = db.inFilters.find((f: any) => f.table === 'quality_assessments')!
    expect(qaLookup.vals).toEqual(['s1'])
    expect(data!.ss!.totals.rejected).toBe(3)
    expect(data!.ss!.rejectionReasons).toEqual([{ category: 'Primary defects', count: 3 }])
    expect(data!.ss!.greenDefects).toEqual([{ name: 'Black', count: 9, max: 9 }])
    expect(data!.ss!.defectLoad).toEqual({ avg: 9, max: 9, graded: 1 })
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
  id: 's-ytd-in', lab_source_sample_id: null, sample_type: 'ss', client_id: 'client-1', origin: 'Brazil',
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
  id: 's-ytd-out', lab_source_sample_id: null, sample_type: 'ss', client_id: 'client-1', origin: 'Colombia',
  micro_origin: 'Huila', container_nr: 'YTD-OUT', ico_number: '900/2',
  bag_count: 400, bag_weight_kg: 60, equivalent_60kg_bags: null,
  bags_quantity_mt: null, buyer_contract_nr: 'IR-YTD-OUT',
  exporter: { name: 'Out-of-Period Farms', fantasy_name: null },
  seller: { name: 'Out-of-Period Sellers', fantasy_name: null },
  importer: { name: 'Coffee America', fantasy_name: null },
  roaster: null,
}

const CERTS_YTD_SPLIT = [
  { certificate_number: 'BR-YTD-IN/26', created_at: '2026-07-05T00:00:00Z', is_rejected: false, compliance_violations: null, sample: inPeriodSample },
  // Two rejected certs in March — same year as the July report, but before
  // its startDate. Two of these outvotes the single in-period Brazil cert,
  // so an origin leak would flip the header from Brazil to Colombia.
  { certificate_number: 'BR-YTD-OUT-1/26', created_at: '2026-03-01T00:00:00Z', is_rejected: true, compliance_violations: ['Primary defects: 5 exceeds maximum (2)'], sample: outOfPeriodSample },
  { certificate_number: 'BR-YTD-OUT-2/26', created_at: '2026-03-02T00:00:00Z', is_rejected: true, compliance_violations: ['Primary defects: 5 exceeds maximum (2)'], sample: outOfPeriodSample },
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
    const data = await runSS(fakeSupabase({ certs: CERTS_YTD_SPLIT, qa: QA_YTD_SPLIT }))

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

describe('getPerformanceReportData — YTD year boundary (endDate is exclusive)', () => {
  it('a report ending 31 Dec computes yearStart from the year actually covered, not the exclusive bound', async () => {
    // endDate is exclusive, so a report covering Dec 16-31 2025 arrives with
    // endDate = 2026-01-01. Taking the year of endDate directly (old code)
    // puts yearStart at 2026-01-01 — at/after endDate itself — which
    // collapses the `min` guard to startDate and silently shrinks "year to
    // date" down to the two-week report period.
    const data = await getPerformanceReportData(fakeSupabase(), {
      clientId: 'client-1', startDate: '2025-12-16', endDate: '2026-01-01', buckets: ['ss'],
    })
    expect(data!.ratings.window.start).toBe('2025-01-01T00:00:00.000Z')
  })

  it('a report entirely inside one year keeps the year-boundary fix a no-op', () => {
    return getPerformanceReportData(fakeSupabase(), {
      clientId: 'client-1', startDate: '2026-06-01', endDate: '2026-07-01', buckets: ['ss'],
    }).then(data => {
      expect(data!.ratings.window.start).toBe('2026-01-01T00:00:00.000Z')
    })
  })
})
