import { describe, it, expect } from 'vitest'
import {
  screenGramsToPercent,
  resolveDefectCounts,
  resolveTaintFaultCounts,
  resolveFinalScores,
  type CuppingScoreRow,
} from './quality-resolvers'

describe('screenGramsToPercent', () => {
  it('converts grams to percentages of the sieved total', () => {
    expect(screenGramsToPercent({ '16': 750, '15': 200, '14': 50 })).toEqual({
      '16': 75, '15': 20, '14': 5,
    })
  })

  it('returns null when there is nothing to divide by', () => {
    expect(screenGramsToPercent(null)).toBeNull()
    expect(screenGramsToPercent(undefined)).toBeNull()
    expect(screenGramsToPercent({})).toBeNull()
    expect(screenGramsToPercent({ '16': 0, '15': 0 })).toBeNull()
  })

  it('treats non-numeric entries as zero rather than poisoning the total', () => {
    expect(screenGramsToPercent({ '16': 75, '15': 25, Pan: NaN })).toEqual({
      '16': 75, '15': 25, Pan: 0,
    })
  })
})

describe('resolveDefectCounts', () => {
  it('reads the shape grading writes', () => {
    expect(resolveDefectCounts({ primary: 1, secondary: 21 })).toEqual({
      primary: 1, secondary: 21, total: 22,
    })
  })

  it('falls back to the total_* shape when the plain keys are absent', () => {
    expect(resolveDefectCounts({ total_primary: 3, total_secondary: 4 })).toEqual({
      primary: 3, secondary: 4, total: 7,
    })
  })

  it('prefers the plain keys when both shapes are present', () => {
    // The approval gate reads defects.primary. Preferring the other key here
    // would silently change verdicts on any row carrying both.
    expect(resolveDefectCounts({ primary: 1, total_primary: 9, secondary: 2 })).toEqual({
      primary: 1, secondary: 2, total: 3,
    })
  })

  it('always computes the total, ignoring a stored one', () => {
    expect(resolveDefectCounts({ primary: 1, secondary: 21, total: 5 }).total).toBe(22)
  })

  it('treats a missing count as zero', () => {
    expect(resolveDefectCounts({ primary: 4 })).toEqual({ primary: 4, secondary: 0, total: 4 })
  })

  it('returns null when there is no defect record at all', () => {
    expect(resolveDefectCounts(null)).toBeNull()
    expect(resolveDefectCounts(undefined)).toBeNull()
    expect(resolveDefectCounts('nope')).toBeNull()
  })
})

describe('resolveTaintFaultCounts', () => {
  const rows: CuppingScoreRow[] = [
    { cupper_id: 'master', scores: null, defects: { taints: [{ name: 'a' }], faults: [] } },
    { cupper_id: 'c2', scores: null, defects: { taints: [{ name: 'a' }, { name: 'b' }], faults: [{ name: 'x' }] } },
  ]

  it("uses only the master cupper's defects when one is designated", () => {
    expect(resolveTaintFaultCounts(rows, 'master')).toEqual({ taints: 1, faults: 0 })
  })

  it('takes the maximum across cuppers when there is no master', () => {
    // Max, not sum: two cuppers flagging the same taint is one taint.
    expect(resolveTaintFaultCounts(rows, null)).toEqual({ taints: 2, faults: 1 })
  })

  it('returns zeros for no scores', () => {
    expect(resolveTaintFaultCounts([], null)).toEqual({ taints: 0, faults: 0 })
  })

  it('returns zeros when the designated master filed no scores', () => {
    expect(resolveTaintFaultCounts(rows, 'absent')).toEqual({ taints: 0, faults: 0 })
  })
})

describe('resolveFinalScores', () => {
  const rows: CuppingScoreRow[] = [
    { cupper_id: 'master', scores: { Body: 2 }, defects: null },
    { cupper_id: 'c2', scores: { Body: 5, Acidity: 3 }, defects: null },
  ]

  it("prefers the master cupper's score", () => {
    expect(resolveFinalScores(rows, 'master').Body).toBe(2)
  })

  it('fills attributes the master did not score with the mean', () => {
    expect(resolveFinalScores(rows, 'master').Acidity).toBe(3)
  })

  it('averages every attribute when there is no master', () => {
    expect(resolveFinalScores(rows, null)).toEqual({ Body: 3.5, Acidity: 3 })
  })

  it('ignores non-numeric score values', () => {
    const withText: CuppingScoreRow[] = [
      { cupper_id: 'c1', scores: { Body: 4, Flavor_descriptor: 'nutty' }, defects: null },
    ]
    expect(resolveFinalScores(withText, null)).toEqual({ Body: 4 })
  })

  it('returns nothing for no scores', () => {
    expect(resolveFinalScores([], null)).toEqual({})
  })
})
