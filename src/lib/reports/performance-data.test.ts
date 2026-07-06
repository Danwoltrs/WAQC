import { describe, it, expect } from 'vitest'
import { aggregateBucket, type PerformanceRow } from './performance-data'

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
