import { describe, it, expect } from 'vitest'
import {
  bagsPerBoxFromMt,
  boxesFromTotal,
  defaultBagsPerBox,
  maxMtPerBox,
  mtPerBoxFromBags,
  parsePackaging,
} from './container-quantity'

describe('defaultBagsPerBox', () => {
  it('fills a 20\' with 19.2 t of bagged coffee', () => {
    expect(defaultBagsPerBox('jute_bag', 60, "20'")).toBe(320)
    expect(defaultBagsPerBox('jute_bag', 59, "20'")).toBe(325)
    expect(defaultBagsPerBox('pp_bag', 30, "20'")).toBe(640)
  })

  it('takes 440/320 of the 20\' figure for a 40\'', () => {
    expect(defaultBagsPerBox('jute_bag', 60, "40'")).toBe(440)
    expect(defaultBagsPerBox('jute_bag', 59, "40'")).toBe(447)
    expect(defaultBagsPerBox('bulk', null, "40'")).toBe(495)
  })

  it('counts bulk and big bags in 60 kg equivalents', () => {
    expect(defaultBagsPerBox('bulk', null, "20'")).toBe(360)
    expect(defaultBagsPerBox('big_bag', null, "20'")).toBe(333)
  })
})

describe('MT per box', () => {
  it('follows bags per box', () => {
    expect(mtPerBoxFromBags(325, 59)).toBe(19.175)
    expect(mtPerBoxFromBags(447, 59)).toBe(26.373)
    expect(mtPerBoxFromBags(360, 60)).toBe(21.6)
  })

  it('works back to decimal equivalents for bulk and big bags', () => {
    expect(bagsPerBoxFromMt(19.338, 'bulk', 60)).toBe(322.3)
    expect(bagsPerBoxFromMt(20, 'big_bag', 60)).toBe(333.33)
  })

  it('rounds up to a whole bag for bagged coffee, without float dust', () => {
    expect(bagsPerBoxFromMt(19, 'jute_bag', 59)).toBe(323)
    expect(bagsPerBoxFromMt(16.26, 'jute_bag', 60)).toBe(271)
  })

  it('caps a box at a full box of bulk', () => {
    expect(maxMtPerBox("20'")).toBe(21.6)
    expect(maxMtPerBox("40'")).toBe(29.7)
  })
})

describe('boxesFromTotal', () => {
  it('splits a total into whole boxes', () => {
    expect(boxesFromTotal(1080, 360)).toEqual({ boxes: 3, bagsPerBox: 360 })
    expect(boxesFromTotal(975, 325)).toEqual({ boxes: 3, bagsPerBox: 325 })
  })

  it('keeps an uneven total as one box', () => {
    expect(boxesFromTotal(500, 320)).toEqual({ boxes: 1, bagsPerBox: 500 })
  })
})

describe('parsePackaging', () => {
  it('reads sys packaging strings', () => {
    expect(parsePackaging('60kg')).toEqual({ kind: 'jute_bag', liner: null, weightKg: 60 })
    expect(parsePackaging('60kg Jute')).toEqual({ kind: 'jute_bag', liner: null, weightKg: 60 })
    expect(parsePackaging('59kg Generic GrainPro')).toEqual({ kind: 'jute_bag', liner: 'Generic GrainPro', weightKg: 59 })
    expect(parsePackaging('60kg PP')).toEqual({ kind: 'pp_bag', liner: null, weightKg: 60 })
    expect(parsePackaging('Bulk')).toEqual({ kind: 'bulk', liner: null, weightKg: null })
    expect(parsePackaging('Big Bags + Pallets')).toEqual({ kind: 'big_bag', liner: '+ Pallets', weightKg: null })
  })

  it('returns null for nothing it can read', () => {
    expect(parsePackaging('')).toBeNull()
    expect(parsePackaging('BAGS OF 60 KG EACH')).toBeNull()
  })
})
