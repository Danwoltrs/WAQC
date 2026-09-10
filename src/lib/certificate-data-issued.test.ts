import { describe, expect, it } from 'vitest'
import { resolveScreenPercentages } from './certificate-data'

describe('resolveScreenPercentages', () => {
  it('derives percentages from grams when there is no decision', () => {
    const r = resolveScreenPercentages({ '18': 272, '15': 689, Pan: 39 }, null)
    expect(r?.percentages['18']).toBeCloseTo(27.2)
    expect(r?.percentages['15']).toBeCloseTo(68.9)
    expect(r?.issued).toBe(false)
  })

  it('prefers issued percentages over the grams', () => {
    const r = resolveScreenPercentages(
      { '18': 272, '15': 689, Pan: 39 },
      { screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 }, defects: null },
    )
    expect(r?.percentages['18']).toBeCloseTo(30)
    expect(r?.issued).toBe(true)
  })

  it('returns null when there are no screens', () => {
    expect(resolveScreenPercentages(null, null)).toBeNull()
    expect(resolveScreenPercentages({}, null)).toBeNull()
  })
})
