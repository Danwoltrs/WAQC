import { describe, it, expect } from 'vitest'
import { buildMonthlyGrid, buildMonthTotals, MONTH_LABELS } from './annual-monthly'
import { aggregateBucket } from './performance-data'
import { annualRow } from './__fixtures__/annual-rows'
import type { AnnualRow } from './annual-row'

const shipper = (r: AnnualRow) => r.exporter_name

describe('buildMonthlyGrid', () => {
  it('puts approved/total per company per month, leaves silent months empty and totals the year', () => {
    const grid = buildMonthlyGrid([
      annualRow({ exporter_name: 'EISA', approval_date: '2026-06-03T00:00:00.000Z' }),
      annualRow({ exporter_name: 'EISA', approval_date: '2026-06-20T00:00:00.000Z', is_rejected: true }),
      annualRow({ exporter_name: 'EISA', approval_date: '2026-08-01T00:00:00.000Z' }),
      annualRow({ exporter_name: 'Comexim', approval_date: '2026-06-05T00:00:00.000Z' }),
    ], shipper, 'count')
    expect(grid.rows.map(r => r.name)).toEqual(['EISA', 'Comexim'])
    const eisa = grid.rows[0]
    expect(eisa.cells).toHaveLength(12)
    expect(eisa.cells[5]).toEqual({ approved: 1, rejected: 1, total: 2, rate: 50 })
    expect(eisa.cells[6]).toBeNull()
    expect(eisa.cells[7]).toEqual({ approved: 1, rejected: 0, total: 1, rate: 100 })
    expect(eisa.year).toEqual({ approved: 2, rejected: 1, total: 3, rate: 67 })
    expect(grid.others).toBeNull()
  })

  it('measures shipment rows in bags', () => {
    const grid = buildMonthlyGrid([
      annualRow({ exporter_name: 'EISA', bags: 320 }),
      annualRow({ exporter_name: 'EISA', bags: 80, is_rejected: true }),
    ], shipper, 'bags')
    expect(grid.basis).toBe('bags')
    expect(grid.rows[0].cells[5]).toEqual({ approved: 320, rejected: 80, total: 400, rate: 80 })
  })

  it('drops rows without a name', () => {
    const grid = buildMonthlyGrid([annualRow({ exporter_name: null }), annualRow({ exporter_name: '  ' })], shipper, 'count')
    expect(grid.rows).toEqual([])
  })

  it('folds everything past the cap into one Others row that sums them', () => {
    const rows: AnnualRow[] = []
    for (let i = 0; i < 5; i++) for (let n = 0; n < 5 - i; n++) rows.push(annualRow({ exporter_name: `S${i}` }))
    const grid = buildMonthlyGrid(rows, shipper, 'count', 3)
    expect(grid.rows.map(r => r.name)).toEqual(['S0', 'S1', 'S2'])
    expect(grid.others?.name).toBe('Others (2)')
    expect(grid.others?.folded).toBe(2)
    expect(grid.others?.year).toEqual({ approved: 3, rejected: 0, total: 3, rate: 100 })
    expect(grid.others?.cells[5]).toEqual({ approved: 3, rejected: 0, total: 3, rate: 100 })
  })

  it('breaks volume ties by name so the order never changes between renders', () => {
    const grid = buildMonthlyGrid([annualRow({ exporter_name: 'Zeta' }), annualRow({ exporter_name: 'Alpha' })], shipper, 'count')
    expect(grid.rows.map(r => r.name)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('buildMonthTotals', () => {
  const rows = [
    annualRow({ approval_date: '2026-06-02T00:00:00.000Z', bags: 320, container_nr: 'A1' }),
    annualRow({ approval_date: '2026-06-09T00:00:00.000Z', bags: 320, container_nr: 'A2' }),
    annualRow({ approval_date: '2026-07-01T00:00:00.000Z', bags: 320, container_nr: 'A3', is_rejected: true }),
  ]

  it('returns twelve labelled months whose totals add up to the bucket', () => {
    const totals = buildMonthTotals(rows, 'bags')
    expect(totals.map(t => t.label)).toEqual([...MONTH_LABELS])
    const bucket = aggregateBucket(rows, 'bags')
    expect(totals.reduce((s, t) => s + t.approved, 0)).toBe(bucket.totals.bagsApproved)
    expect(totals.reduce((s, t) => s + t.rejected, 0)).toBe(bucket.totals.bagsRejected)
    expect(totals[5]).toMatchObject({ approved: 640, rejected: 0, total: 640, rate: 100, containers: 2 })
    expect(totals[6]).toMatchObject({ approved: 0, rejected: 320, rate: 0, containers: 0 })
    expect(totals[0]).toMatchObject({ total: 0, rate: 0 })
  })

  it('counts certificates and no containers on the count basis', () => {
    const totals = buildMonthTotals(rows, 'count')
    expect(totals[5]).toMatchObject({ approved: 2, total: 2, containers: null })
  })
})
