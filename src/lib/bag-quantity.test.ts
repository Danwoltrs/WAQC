import { describe, it, expect } from 'vitest'
import {
  computeBagQuantities,
  bagWeightForType,
  bulkQuantitiesFromMt,
  approxBulkContainers,
} from './bag-quantity'

describe('computeBagQuantities', () => {
  it('computes MT and 60kg-equivalent for standard 60kg bags', () => {
    // 1050 bags × 60kg = 63 MT, 1050 equivalent 60kg bags
    expect(computeBagQuantities(1050, 60, 'jute_bag')).toEqual({
      bags_quantity_mt: 63,
      equivalent_60kg_bags: 1050,
    })
  })

  it('computes the corrected sub-contract value (732 bags, not the mother 1050)', () => {
    expect(computeBagQuantities(732, 60, 'jute_bag')).toEqual({
      bags_quantity_mt: 43.92,
      equivalent_60kg_bags: 732,
    })
  })

  it('handles 70kg bags (non-Brazil origin)', () => {
    expect(computeBagQuantities(300, 70, 'pp_bag')).toEqual({
      bags_quantity_mt: 21,
      equivalent_60kg_bags: 350,
    })
  })

  // Regression, cert SAK-011813/26: the certificate editor multiplied its own
  // count x weight and wrote 388,800 bags / 23,328 MT for three containers.
  it('never multiplies a bulk count by the container weight', () => {
    expect(computeBagQuantities(1080, 21600, 'bulk')).toEqual({
      bags_quantity_mt: 64.8,
      equivalent_60kg_bags: 1080,
    })
  })

  it('treats bulk as 60kg-per-unit and self-equivalent', () => {
    expect(computeBagQuantities(500, 21600, 'bulk')).toEqual({
      bags_quantity_mt: 30,
      equivalent_60kg_bags: 500,
    })
  })

  it('returns nulls when inputs are insufficient', () => {
    expect(computeBagQuantities(0, 60, 'jute_bag')).toEqual({
      bags_quantity_mt: null,
      equivalent_60kg_bags: null,
    })
    expect(computeBagQuantities(100, 0, 'jute_bag')).toEqual({
      bags_quantity_mt: null,
      equivalent_60kg_bags: null,
    })
    expect(computeBagQuantities(null, null, '')).toEqual({
      bags_quantity_mt: null,
      equivalent_60kg_bags: null,
    })
  })
})

describe('bulkQuantitiesFromMt (MT-driven bulk)', () => {
  it('derives the 60kg-bag equivalent from net MT (standard density)', () => {
    expect(bulkQuantitiesFromMt(63)).toEqual({
      bags_quantity_mt: 63,
      equivalent_60kg_bags: 1050,
    })
  })

  it('keeps the actual MT for lower-density (grinder) containers', () => {
    // 3 containers under-weight at 60 MT total stays 60, equiv = 1000
    expect(bulkQuantitiesFromMt(60)).toEqual({
      bags_quantity_mt: 60,
      equivalent_60kg_bags: 1000,
    })
  })

  it('returns nulls for missing/zero MT', () => {
    expect(bulkQuantitiesFromMt(null)).toEqual({ bags_quantity_mt: null, equivalent_60kg_bags: null })
    expect(bulkQuantitiesFromMt(0)).toEqual({ bags_quantity_mt: null, equivalent_60kg_bags: null })
  })
})

describe('approxBulkContainers', () => {
  it('estimates containers at ~21.6 MT each', () => {
    expect(approxBulkContainers(21.6)).toBe(1)
    expect(approxBulkContainers(43.2)).toBe(2)
    expect(approxBulkContainers(63)).toBe(3)
    expect(approxBulkContainers(0)).toBe(0)
  })
})

describe('bagWeightForType', () => {
  it('returns fixed weights for big_bag and bulk', () => {
    expect(bagWeightForType('big_bag')).toBe(1000)
    expect(bagWeightForType('bulk')).toBe(21600)
  })

  it('returns 60kg for Brazil jute/pp and 70kg otherwise', () => {
    expect(bagWeightForType('jute_bag', 'Brazil')).toBe(60)
    expect(bagWeightForType('pp_bag', 'Colombia')).toBe(70)
  })

  it('returns null for unknown type', () => {
    expect(bagWeightForType('')).toBeNull()
  })
})
