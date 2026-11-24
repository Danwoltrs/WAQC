import { describe, it, expect } from 'vitest'
import {
  checkQuakers,
  quakerLimit,
  quakerLimitPhrase,
  quakerPhrase,
  quakerSampleGrams,
  quakerViolation,
} from './quakers'
import { violationDetails } from './reports/rejection-overview'

describe('quakerLimit', () => {
  it('reads both numbers from the quality', () => {
    expect(quakerLimit({ max_quakers: 5, roast_sample_size_grams: 300 })).toEqual({ max: 5, perGrams: 300 })
  })
  it('keeps a limit of zero, and a limit without a weight', () => {
    expect(quakerLimit({ max_quakers: 0, roast_sample_size_grams: 100 })).toEqual({ max: 0, perGrams: 100 })
    expect(quakerLimit({ max_quakers: 8 })).toEqual({ max: 8, perGrams: null })
  })
  it('is null when the quality sets no limit', () => {
    expect(quakerLimit({ roast_sample_size_grams: 300 })).toBeNull()
    expect(quakerLimit(null)).toBeNull()
    expect(quakerLimit({ max_quakers: '' })).toBeNull()
  })
})

describe('quakerSampleGrams', () => {
  it("prefers the lot's own weight, else the quality's", () => {
    expect(quakerSampleGrams({ quaker_sample_grams: 150 }, { roast_sample_size_grams: 300 })).toBe(150)
    expect(quakerSampleGrams({}, { roast_sample_size_grams: 300 })).toBe(300)
    expect(quakerSampleGrams(null, null)).toBeNull()
  })
})

describe('checkQuakers', () => {
  const limit = { max: 5, perGrams: 300 }
  it('compares with the limit as stated on the same weight', () => {
    expect(checkQuakers(5, limit, 300)).toEqual({ passed: true, allowed: 5, scaled: false })
    expect(checkQuakers(6, limit, 300).passed).toBe(false)
    expect(checkQuakers(5, limit, null)).toEqual({ passed: true, allowed: 5, scaled: false })
  })
  it('scales the limit to the weight counted', () => {
    expect(checkQuakers(2, limit, 150)).toEqual({ passed: true, allowed: 2.5, scaled: true })
    expect(checkQuakers(3, limit, 150)).toEqual({ passed: false, allowed: 2.5, scaled: true })
    expect(checkQuakers(10, limit, 600)).toEqual({ passed: true, allowed: 10, scaled: true })
    expect(checkQuakers(11, limit, 600).passed).toBe(false)
  })
  it('does not scale a limit that names no weight', () => {
    expect(checkQuakers(6, { max: 8, perGrams: null }, 150)).toEqual({ passed: true, allowed: 8, scaled: false })
  })
})

describe('wording', () => {
  it('says "X quakers per Y g"', () => {
    expect(quakerPhrase(3, 300)).toBe('3 quakers per 300 g')
    expect(quakerPhrase(1, 100)).toBe('1 quaker per 100 g')
    expect(quakerPhrase(0, 300)).toBe('0 quakers per 300 g')
    expect(quakerPhrase(4, null)).toBe('4 quakers')
  })
  it('states the limit the same way', () => {
    expect(quakerLimitPhrase({ max: 5, perGrams: 300 })).toBe('max 5 per 300 g')
    expect(quakerLimitPhrase({ max: 8, perGrams: null })).toBe('max 8')
  })
})

describe('quakerViolation', () => {
  it('keeps the sentence the reports read, unchanged on the same weight', () => {
    expect(quakerViolation(12, { max: 8, perGrams: 300 }, 300)).toBe('Quakers: 12 exceeds maximum (8)')
    expect(quakerViolation(12, { max: 8, perGrams: null })).toBe('Quakers: 12 exceeds maximum (8)')
  })
  it('names the scaled limit, the weight and where it came from', () => {
    const v = quakerViolation(3, { max: 5, perGrams: 300 }, 150)
    expect(v).toBe('Quakers: 3 exceeds maximum (2.5) on 150 g, from 5 per 300 g')
    // The rejection overview still reads count and limit out of it.
    expect(violationDetails(v)).toEqual([{ key: 'quakers', value: '3', limit: 'max 2.5' }])
  })
})
