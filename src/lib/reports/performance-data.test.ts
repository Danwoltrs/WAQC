import { describe, it, expect } from 'vitest'
import { aggregateBucket, sortAppendixRows, type PerformanceRow } from './performance-data'

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
