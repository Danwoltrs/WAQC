import { describe, it, expect } from 'vitest'
import { roundToQuarter, cvaScoreFromSum, effectiveImpression, computeAssessmentScore } from './scoring'
import { createEmptyAssessment } from '@/types/cva'

// SCA Standard 104-2024, Appendix 7.1 — Two-Way Table (Σ of 8 sections → score). The exact oracle.
const TWO_WAY: Record<number, number> = {
  8: 58.0, 9: 58.75, 10: 59.25, 11: 60.0, 12: 60.75, 13: 61.25, 14: 62.0, 15: 62.5,
  16: 63.25, 17: 64.0, 18: 64.5, 19: 65.25, 20: 66.0, 21: 66.5, 22: 67.25, 23: 67.75,
  24: 68.5, 25: 69.25, 26: 69.75, 27: 70.5, 28: 71.25, 29: 71.75, 30: 72.5, 31: 73.0,
  32: 73.75, 33: 74.5, 34: 75.0, 35: 75.75, 36: 76.5, 37: 77.0, 38: 77.75, 39: 78.25,
  40: 79.0, 41: 79.75, 42: 80.25, 43: 81.0, 44: 81.75, 45: 82.25, 46: 83.0, 47: 83.5,
  48: 84.25, 49: 85.0, 50: 85.5, 51: 86.25, 52: 87.0, 53: 87.5, 54: 88.25, 55: 88.75,
  56: 89.5, 57: 90.25, 58: 90.75, 59: 91.5, 60: 92.25, 61: 92.75, 62: 93.5, 63: 94.0,
  64: 94.75, 65: 95.5, 66: 96.0, 67: 96.75, 68: 97.5, 69: 98.0, 70: 98.75, 71: 99.25, 72: 100.0,
}

describe('roundToQuarter', () => {
  it('rounds to nearest 0.25', () => {
    expect(roundToQuarter(73.09375)).toBe(73.0)
    expect(roundToQuarter(83.59375)).toBe(83.5)
    expect(roundToQuarter(58.65625)).toBe(58.75)
    expect(roundToQuarter(60.625)).toBe(60.75) // half-up boundary
  })
})

describe('cvaScoreFromSum — matches the SCA two-way table for every sum 8..72', () => {
  for (const [sumStr, expected] of Object.entries(TWO_WAY)) {
    const sum = Number(sumStr)
    it(`Σ=${sum} → ${expected}`, () => {
      expect(cvaScoreFromSum(sum, 0, 0)).toBe(expected)
    })
  }
})

describe('cvaScoreFromSum — spec checkpoints', () => {
  it('all sections = 5 (Σ40) → 79.00', () => expect(cvaScoreFromSum(40, 0, 0)).toBe(79.0))
  it('all sections = 9 (Σ72) → 100.00', () => expect(cvaScoreFromSum(72, 0, 0)).toBe(100.0))
  it('Σ31 → 73.00', () => expect(cvaScoreFromSum(31, 0, 0)).toBe(73.0))
})

describe('cvaScoreFromSum — penalties', () => {
  it('−2 per non-uniform cup', () => expect(cvaScoreFromSum(72, 1, 0)).toBe(98.0))
  it('−4 per defective cup', () => expect(cvaScoreFromSum(72, 0, 1)).toBe(96.0))
  it('combined u=2, d=1', () => expect(cvaScoreFromSum(72, 2, 1)).toBe(92.0))
})

describe('effectiveImpression — final-if-shifted', () => {
  it('uses impression when no final', () => expect(effectiveImpression({ impression: 7 })).toBe(7))
  it('uses impression_final when set', () => expect(effectiveImpression({ impression: 7, impression_final: 8 })).toBe(8))
  it('null when empty', () => expect(effectiveImpression(undefined)).toBe(null))
})

describe('computeAssessmentScore', () => {
  it('reports partial progress', () => {
    const a = createEmptyAssessment()
    a.sections = { fragrance: { impression: 8 }, aroma: { impression: 8 } }
    const r = computeAssessmentScore(a)
    expect(r.count).toBe(2)
    expect(r.complete).toBe(false)
    expect(r.sum).toBe(16)
  })

  it('full all-8s with a cooled-final, one non-uniform + one defective', () => {
    const a = createEmptyAssessment()
    a.sections = {
      fragrance: { impression: 8 }, aroma: { impression: 8 }, flavor: { impression: 8 },
      aftertaste: { impression: 8 }, acidity: { impression: 7, impression_final: 8 },
      sweetness: { impression: 8 }, mouthfeel: { impression: 8 }, overall: { impression: 8 },
    }
    a.cups = { non_uniform: [3], defective: [{ cup: 5, type: 'phenolic' }] }
    const r = computeAssessmentScore(a)
    expect(r.complete).toBe(true)
    expect(r.sum).toBe(64)        // eight 8s (acidity uses final 8)
    expect(r.u).toBe(1)
    expect(r.d).toBe(1)
    // Σ64 → 94.75, minus 2 minus 4 = 88.75
    expect(r.score).toBe(88.75)
  })
})
