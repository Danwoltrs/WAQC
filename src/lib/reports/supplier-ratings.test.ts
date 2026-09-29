import { describe, it, expect } from 'vitest'
import { buildSupplierRatings, wilsonLowerBound } from './supplier-ratings'
import type { PerformanceRow } from './performance-data'

const row = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
  approval_date: '2026-03-05T00:00:00Z',
  certificate_number: 'BR-1/26',
  exporter_name: 'Comexim',
  seller_name: 'Volcafe CH',
  importer_name: 'Ahold',
  importer_contract_nr: 'IR1',
  roaster_name: 'Unsold',
  container_nr: 'C1',
  ico_marks: '001',
  bags: 350,
  mt: 21.0,
  is_rejected: false,
  region: 'Cerrado',
  ...over,
})

describe('buildSupplierRatings', () => {
  it('splits PSS and SS counts and computes the approval rate', () => {
    const out = buildSupplierRatings(
      [row({ exporter_name: 'Comexim' }), row({ exporter_name: 'Comexim', is_rejected: true })],
      [row({ exporter_name: 'Comexim' }), row({ exporter_name: 'Comexim' })],
      r => r.exporter_name,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ rank: 1, name: 'Comexim', total: 4, pss: 2, ss: 2, approvalRate: 75 })
  })

  it('ranks by approval rate, then volume, then name', () => {
    const out = buildSupplierRatings(
      [],
      [
        row({ exporter_name: 'Ecom' }),
        row({ exporter_name: 'Ecom' }),
        row({ exporter_name: 'Comexim' }),
        row({ exporter_name: 'Expocacer', is_rejected: true }),
      ],
      r => r.exporter_name,
    )
    expect(out.map(r => [r.rank, r.name, r.approvalRate])).toEqual([
      [1, 'Ecom', 100],
      [2, 'Comexim', 100],
      [3, 'Expocacer', 0],
    ])
  })

  it('weights the rate by volume: a few perfect certificates do not outrank a long record', () => {
    const many = (name: string, approved: number, total: number) =>
      Array.from({ length: total }, (_, i) => row({ exporter_name: name, is_rejected: i >= approved }))
    // Dunkin, year to date on 29/09/2026.
    const out = buildSupplierRatings([], [
      ...many('Grano', 3, 3), ...many('StoneX CDI', 1, 1), ...many('OFI', 191, 208),
      ...many('Brascof', 4, 5), ...many('Cooxupé', 66, 86), ...many('COCATREL', 84, 110),
      ...many('CDN', 3, 4), ...many('Sucden Brasil', 5, 14),
    ], r => r.exporter_name)
    expect(out.map(r => r.name)).toEqual([
      'OFI', 'COCATREL', 'Cooxupé', 'Grano', 'Brascof', 'CDN', 'StoneX CDI', 'Sucden Brasil',
    ])
    // The table still prints the plain rate.
    expect(out.find(r => r.name === 'Grano')!.approvalRate).toBe(100)
  })

  it('wilsonLowerBound: less evidence, lower bound; none, zero', () => {
    expect(wilsonLowerBound(3, 3)).toBeCloseTo(0.44, 2)
    expect(wilsonLowerBound(191, 208)).toBeCloseTo(0.874, 2)
    expect(wilsonLowerBound(0, 0)).toBe(0)
  })

  it('groups on the seller when picking seller_name', () => {
    const out = buildSupplierRatings(
      [],
      [row({ seller_name: 'Volcafe CH' }), row({ seller_name: 'Rothfos GmbH' })],
      r => r.seller_name,
    )
    expect(out.map(r => r.name).sort()).toEqual(['Rothfos GmbH', 'Volcafe CH'])
  })

  it('skips rows whose picked name is blank', () => {
    const out = buildSupplierRatings([], [row({ seller_name: null }), row({ seller_name: '  ' })], r => r.seller_name)
    expect(out).toEqual([])
  })

  it('returns an empty list for no rows', () => {
    expect(buildSupplierRatings([], [], r => r.exporter_name)).toEqual([])
  })
})
