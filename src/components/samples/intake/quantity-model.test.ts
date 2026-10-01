import { describe, it, expect } from 'vitest'
import {
  EMPTY_QUANTITY,
  contractQuantities,
  formatFormQuantity,
  overBoxMessage,
  packagingChange,
  quantityFieldsFromContract,
  quantityFieldsFromStored,
  quantityIssues,
  quantitySummary,
  standardBagWeight,
  type QuantityFields,
} from './quantity-model'

const q = (over: Partial<QuantityFields>): QuantityFields => ({ ...EMPTY_QUANTITY, ...over })

describe('contractQuantities', () => {
  it('stores bags as boxes × the default bags per box', () => {
    expect(contractQuantities(q({ bag_type: 'jute_bag', bag_weight_kg: '59', container_count: '3' }))).toEqual({
      bag_type: 'jute_bag', bag_liner: null, bag_count: 975, bag_weight_kg: 59, bags_quantity_mt: 57.525,
      equivalent_60kg_bags: 958.75, container_count: 3, container_size: "20'",
    })
  })

  it('fills a 40\' with 1.375× the bags', () => {
    expect(contractQuantities(q({ bag_type: 'jute_bag', bag_weight_kg: '59', container_count: '3', container_size: "40'" }))).toMatchObject({
      bag_count: 1341, bags_quantity_mt: 79.119, container_size: "40'",
    })
  })

  it('keeps a lined bag as jute with its liner', () => {
    expect(contractQuantities(q({ bag_type: 'jute_bag', bag_liner: 'GrainPro', bag_weight_kg: '60', container_count: '1' }))).toMatchObject({
      bag_type: 'jute_bag', bag_liner: 'GrainPro', bag_count: 320, bags_quantity_mt: 19.2,
    })
  })

  it('stores bulk as containers + MT under the bag_count = equivalent rule', () => {
    expect(contractQuantities(q({ bag_type: 'bulk', container_count: '3' }))).toEqual({
      bag_type: 'bulk', bag_liner: null, bag_count: 1080, bag_weight_kg: 21600, bags_quantity_mt: 64.8,
      equivalent_60kg_bags: 1080, container_count: 3, container_size: "20'",
    })
  })

  it('keeps decimal equivalents when the MT per box is typed', () => {
    expect(contractQuantities(q({ bag_type: 'bulk', container_count: '1', mt_per_box: '19.338' }))).toMatchObject({
      bags_quantity_mt: 19.338, equivalent_60kg_bags: 322.3, bag_count: 322,
    })
    expect(contractQuantities(q({ bag_type: 'bulk', container_count: '2', bags_per_box: '322.3' }))).toMatchObject({
      bags_quantity_mt: 38.676, equivalent_60kg_bags: 644.6,
    })
  })

  it('rounds a typed MT up to whole bags for bagged coffee', () => {
    expect(contractQuantities(q({ bag_type: 'jute_bag', bag_weight_kg: '60', container_count: '1', mt_per_box: '19' }))).toMatchObject({
      bag_count: 317, bags_quantity_mt: 19.02,
    })
  })

  it('stores big bags as physical bags carrying the MT typed', () => {
    expect(contractQuantities(q({ bag_type: 'big_bag', container_count: '2', mt_per_box: '20' }))).toMatchObject({
      bag_count: 40, bag_weight_kg: 1000, bags_quantity_mt: 40, equivalent_60kg_bags: 666.67,
    })
  })

  it('has no totals without boxes', () => {
    expect(contractQuantities(q({ bag_type: 'bulk' }))).toMatchObject({ bag_count: null, bags_quantity_mt: null, container_count: null })
  })

  it('prints the agreed wording', () => {
    expect(formatFormQuantity(q({ bag_type: 'bulk', container_count: '3' }))).toBe('3 containers in bulk (64.8 MT)')
    expect(formatFormQuantity(q({ bag_type: 'jute_bag', bag_liner: 'GrainPro', bag_weight_kg: '60', container_count: '2' }))).toBe(
      '640 × 60 kg jute bags, GrainPro (38.4 MT)',
    )
  })
})

describe('quantitySummary', () => {
  it('reads like sys', () => {
    expect(quantitySummary(q({ bag_type: 'jute_bag', bag_weight_kg: '59', container_count: '3' }))).toBe(
      "3 × 20' Jute 59 kg · 325 bags/box · 19.175 MT/box = 975 bags · 57.525 MT",
    )
    expect(quantitySummary(q({ bag_type: 'bulk', container_count: '1', mt_per_box: '19.338' }))).toBe(
      "1 × 20' Bulk · 322.3 bags eq./box · 19.338 MT/box = 322.3 bags eq. · 19.338 MT",
    )
  })
})

describe('quantityIssues', () => {
  it('asks for the packaging first', () => {
    expect(quantityIssues(q({}))).toEqual(['Packaging'])
  })

  it('asks for boxes and the bag weight', () => {
    expect(quantityIssues(q({ bag_type: 'jute_bag' }))).toEqual(['Boxes', 'Bag weight'])
    expect(quantityIssues(q({ bag_type: 'bulk' }))).toEqual(['Boxes'])
    expect(quantityIssues(q({ bag_type: 'jute_bag', bag_weight_kg: '60', container_count: '4' }))).toEqual([])
  })

  it('allows any number of boxes but no box over a full box of bulk', () => {
    expect(quantityIssues(q({ bag_type: 'bulk', container_count: '12' }))).toEqual([])
    expect(quantityIssues(q({ bag_type: 'bulk', container_count: '1', mt_per_box: '21.7' }))).toEqual([overBoxMessage("20'")])
    expect(quantityIssues(q({ bag_type: 'bulk', container_count: '1', container_size: "40'", mt_per_box: '29.7' }))).toEqual([])
  })
})

describe('packagingChange', () => {
  it('keeps the boxes and drops typed per-box figures when the packaging changes', () => {
    expect(packagingChange({ bag_type: 'jute_bag', bag_weight_kg: '60' }, { bag_type: 'bulk', bag_liner: '' })).toEqual({
      bag_type: 'bulk', bag_liner: '', bags_per_box: '', mt_per_box: '', bag_weight_kg: '',
    })
  })

  it('keeps the weight between bag packagings and gives a bag its standard weight coming from bulk', () => {
    expect(packagingChange({ bag_type: 'jute_bag', bag_weight_kg: '59' }, { bag_type: 'jute_bag', bag_liner: 'GrainPro' })).toEqual({
      bag_type: 'jute_bag', bag_liner: 'GrainPro',
    })
    expect(packagingChange({ bag_type: 'bulk', bag_weight_kg: '' }, { bag_type: 'jute_bag', bag_liner: '' }, 'Brazil')).toMatchObject({
      bag_weight_kg: '60',
    })
  })

  it('weighs jute and PP by origin', () => {
    expect(standardBagWeight('jute_bag', 'Brazil')).toBe('60')
    expect(standardBagWeight('jute_bag', 'Colombia')).toBe('70')
    expect(standardBagWeight('', 'Brazil')).toBe('')
  })
})

describe('quantityFieldsFromStored', () => {
  it('reads a bulk row back into boxes', () => {
    expect(quantityFieldsFromStored({ bag_type: 'bulk', bag_count: 1080, bags_quantity_mt: 64.8, container_count: 3 })).toMatchObject({
      bag_type: 'bulk', container_count: '3', mt_per_box: '',
    })
    expect(quantityFieldsFromStored({ bag_type: 'bulk', bags_quantity_mt: 19.338, container_count: 1 })).toMatchObject({
      container_count: '1', mt_per_box: '19.338',
    })
  })

  it('splits a bag count into default boxes, else one box', () => {
    expect(quantityFieldsFromStored({ bag_type: 'jute_bag', bag_count: 640, bag_weight_kg: 60 })).toMatchObject({
      container_count: '2', bags_per_box: '', bag_weight_kg: '60',
    })
    expect(quantityFieldsFromStored({ bag_type: 'jute_bag', bag_count: 500, bag_weight_kg: 60 })).toMatchObject({
      container_count: '1', bags_per_box: '500',
    })
  })
})

describe('quantityFieldsFromContract', () => {
  it('reads a sys contract\'s packaging and volume', () => {
    expect(quantityFieldsFromContract({ packaging: '59kg Generic GrainPro', volume_bags: 325 }, '')).toMatchObject({
      bag_type: 'jute_bag', bag_liner: 'Generic GrainPro', bag_weight_kg: '59', container_count: '1', bags_per_box: '',
    })
    expect(quantityFieldsFromContract({ packaging: 'Bulk', volume_bags: 2880 }, '')).toMatchObject({
      bag_type: 'bulk', container_count: '8',
    })
    expect(quantityFieldsFromContract({ packaging: '59kg', bags_per_box: 332, volume_bags: 664 }, '')).toMatchObject({
      container_count: '2', bags_per_box: '332',
    })
  })
})
