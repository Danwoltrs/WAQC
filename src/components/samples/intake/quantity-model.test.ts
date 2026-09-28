import { describe, it, expect } from 'vitest'
import {
  BULK_MAX_EQUIVALENT_BAGS,
  bagTypeChange,
  contractQuantities,
  formatFormQuantity,
  quantityIssues,
  standardBagWeight,
  type QuantityFields,
} from './quantity-model'

const q = (over: Partial<QuantityFields>): QuantityFields => ({
  bag_type: '', bag_count: '', bag_weight_kg: '', bags_quantity_mt: '', container_count: '', ...over,
})

describe('contractQuantities', () => {
  it('derives bags from count × weight', () => {
    expect(contractQuantities(q({ bag_type: 'jute_bag', bag_count: '640', bag_weight_kg: '60' }))).toEqual({
      bag_type: 'jute_bag', bag_count: 640, bag_weight_kg: 60, bags_quantity_mt: 38.4, equivalent_60kg_bags: 640, container_count: null,
    })
  })

  it('reads bulk as 60 kg equivalents in one container, under the bag_count = equivalent invariant', () => {
    expect(contractQuantities(q({ bag_type: 'bulk', bag_count: '340' }))).toEqual({
      bag_type: 'bulk', bag_count: 340, bag_weight_kg: 21600, bags_quantity_mt: 20.4, equivalent_60kg_bags: 340, container_count: 1,
    })
  })

  it('ignores a stale MT on bulk: only the typed equivalents count', () => {
    expect(contractQuantities(q({ bag_type: 'bulk', bag_count: '', bags_quantity_mt: '43.2', container_count: '2' }))).toMatchObject({
      bag_count: null, bags_quantity_mt: null, equivalent_60kg_bags: null, container_count: null,
    })
  })

  it('prints the agreed wording', () => {
    expect(formatFormQuantity(q({ bag_type: 'bulk', bag_count: '340' }))).toBe('1 container in bulk (20.4 MT)')
    expect(formatFormQuantity(q({ bag_type: 'jute_bag', bag_count: '640', bag_weight_kg: '60' }))).toBe('640 × 60 kg jute bags (38.4 MT)')
  })
})

describe('quantityIssues', () => {
  it('asks for the bag type first', () => {
    expect(quantityIssues(q({}))).toEqual(['Bag type'])
  })

  it('asks for the count and weight of bags', () => {
    expect(quantityIssues(q({ bag_type: 'jute_bag' }))).toEqual(['Quantity of bags', 'Bag weight'])
    expect(quantityIssues(q({ bag_type: 'jute_bag', bag_count: '320', bag_weight_kg: '60' }))).toEqual([])
  })

  it('accepts bulk up to one container (360 equivalents = 21.6 MT) and refuses more', () => {
    expect(BULK_MAX_EQUIVALENT_BAGS).toBe(360)
    expect(quantityIssues(q({ bag_type: 'bulk' }))).toEqual(['Quantity (60 kg bag equivalents)'])
    expect(quantityIssues(q({ bag_type: 'bulk', bag_count: '360' }))).toEqual([])
    expect(quantityIssues(q({ bag_type: 'bulk', bag_count: '361' }))).toEqual([
      'Bulk is at most 360 × 60 kg bag equivalents (21.6 MT) per sample',
    ])
  })

  it('treats zero and negative counts as missing', () => {
    expect(quantityIssues(q({ bag_type: 'bulk', bag_count: '0' }))).toEqual(['Quantity (60 kg bag equivalents)'])
    expect(quantityIssues(q({ bag_type: 'pp_bag', bag_count: '-5', bag_weight_kg: '60' }))).toEqual(['Quantity of bags'])
  })
})

describe('bagTypeChange', () => {
  it('sets the standard weight and keeps the count between bag kinds', () => {
    expect(bagTypeChange({ bag_type: 'jute_bag', bag_count: '320' }, 'pp_bag', 'Brazil')).toEqual({
      bag_type: 'pp_bag', bag_weight_kg: '60',
    })
  })

  it('clears the quantity when crossing between bags and bulk', () => {
    expect(bagTypeChange({ bag_type: 'jute_bag', bag_count: '320' }, 'bulk', 'Brazil')).toEqual({
      bag_type: 'bulk', bag_weight_kg: '21600', bag_count: '', bags_quantity_mt: '', container_count: '',
    })
    expect(bagTypeChange({ bag_type: 'bulk', bag_count: '340' }, 'big_bag')).toMatchObject({ bag_count: '', bag_weight_kg: '1000' })
  })

  it('weighs jute and PP by origin', () => {
    expect(standardBagWeight('jute_bag', 'Brazil')).toBe('60')
    expect(standardBagWeight('jute_bag', 'Colombia')).toBe('70')
    expect(standardBagWeight('', 'Brazil')).toBe('')
  })
})
