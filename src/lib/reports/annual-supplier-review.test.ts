import { describe, it, expect } from 'vitest'
import { buildSupplierReview } from './annual-supplier-review'
import { annualRow } from './__fixtures__/annual-rows'

const MOISTURE = 'Moisture: 12.9 exceeds maximum (12.5)'
const SECONDARY = 'Secondary defects: 25 exceeds maximum (20)'

describe('buildSupplierReview', () => {
  it('ranks like the Supplier Review leaderboard: approval rate, then volume, then name', () => {
    const review = buildSupplierReview(
      [
        annualRow({ exporter_name: 'EISA' }),
        annualRow({ exporter_name: 'EISA', is_rejected: true, violations: [MOISTURE] }),
        annualRow({ exporter_name: 'Comexim' }),
      ],
      [annualRow({ exporter_name: 'Comexim' }), annualRow({ exporter_name: 'Dreyfus' })],
      [],
    )
    expect(review.shippers.map(s => [s.rank, s.name, s.approvalRate])).toEqual([
      [1, 'Comexim', 100],
      [2, 'Dreyfus', 100],
      [3, 'EISA', 50],
    ])
    expect(review.shippers[0]).toMatchObject({ certificates: 2, pss: 1, ss: 1 })
  })

  it('reports shipped MT from approved shipment certificates only, and none for a PSS-only supplier', () => {
    const review = buildSupplierReview(
      [annualRow({ exporter_name: 'EISA', mt: 99 })],
      [
        annualRow({ exporter_name: 'Comexim', mt: 19.2 }),
        annualRow({ exporter_name: 'Comexim', mt: 19.2 }),
        annualRow({ exporter_name: 'Comexim', mt: 19.2, is_rejected: true }),
      ],
      [],
    )
    const byName = Object.fromEntries(review.shippers.map(s => [s.name, s]))
    expect(byName.Comexim.mtShipped).toBe(38.4)
    expect(byName.EISA.mtShipped).toBeNull()
  })

  it('names the most frequent rejection reason, breaking ties by the client-wide order', () => {
    const review = buildSupplierReview(
      [
        annualRow({ exporter_name: 'EISA', is_rejected: true, violations: [MOISTURE] }),
        annualRow({ exporter_name: 'EISA', is_rejected: true, violations: [SECONDARY] }),
        annualRow({ exporter_name: 'Comexim' }),
      ],
      [],
      ['Secondary defects', 'Moisture'],
    )
    const byName = Object.fromEntries(review.shippers.map(s => [s.name, s]))
    expect(byName.EISA.mainIssue).toBe('Secondary defects')
    expect(byName.Comexim.mainIssue).toBeNull()
  })

  it('rates the seller, falling back to the shipper when no seller is recorded', () => {
    const review = buildSupplierReview(
      [annualRow({ exporter_name: 'Grano', seller_name: 'Volcafe CH' }), annualRow({ exporter_name: 'Comexim', seller_name: null })],
      [],
      [],
    )
    expect(review.sellers.map(s => s.name).sort()).toEqual(['Comexim', 'Volcafe CH'])
  })
})
