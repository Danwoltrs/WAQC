import { describe, it, expect } from 'vitest'
import { buildSupplierRatings } from './supplier-ratings'
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
