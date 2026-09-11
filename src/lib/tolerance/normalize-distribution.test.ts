import { describe, expect, it } from 'vitest'
import { normalizeDistribution, type ScreenLimit } from './normalize-distribution'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

describe('normalizeDistribution', () => {
  it('lifts a short screen by taking from the next smaller one', () => {
    const actual = { '18': 27.2, '15': 68.9, Pan: 3.9 }
    const limits: ScreenLimit[] = [{ screen_size: '18', min: 30 }]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued['18']).toBeCloseTo(30)
    expect(r.issued['15']).toBeCloseTo(66.1)
    expect(r.issued.Pan).toBeCloseTo(3.9)
    expect(sum(r.issued)).toBeCloseTo(sum(actual))
  })

  it('moves pan excess up into the smallest screen above it', () => {
    const actual = { '18': 30, '15': 63, Pan: 7 }
    const limits: ScreenLimit[] = [{ screen_size: 'Pan', max: 5 }]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.Pan).toBeCloseTo(5)
    expect(r.issued['15']).toBeCloseTo(65)
    expect(r.issued['18']).toBeCloseTo(30)
    expect(sum(r.issued)).toBeCloseTo(sum(actual))
  })

  it('does not push a receiving screen past its own maximum', () => {
    const actual = { '18': 30, '15': 63, Pan: 7 }
    const limits: ScreenLimit[] = [
      { screen_size: 'Pan', max: 5 },
      { screen_size: '15', max: 64 },
    ]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued['15']).toBeCloseTo(64)
    expect(r.issued['18']).toBeCloseTo(31)
    expect(r.issued.Pan).toBeCloseTo(5)
  })

  it('handles a pan excess and a short screen in one pass', () => {
    const actual = { '18': 28, '15': 65, Pan: 7 }
    const limits: ScreenLimit[] = [
      { screen_size: '18', min: 30 },
      { screen_size: 'Pan', max: 5 },
    ]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.Pan).toBeCloseTo(5)
    expect(r.issued['18']).toBeCloseTo(30)
    expect(sum(r.issued)).toBeCloseTo(100)
  })

  it('never pulls a donor below its own minimum', () => {
    const actual = { '18': 28, '15': 68, Pan: 4 }
    const limits: ScreenLimit[] = [
      { screen_size: '18', min: 30 },
      { screen_size: '15', min: 67 },
    ]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    // Only 1 point available from 15; the remaining point comes from Pan.
    expect(r.issued['15']).toBeCloseTo(67)
    expect(r.issued.Pan).toBeCloseTo(3)
    expect(r.issued['18']).toBeCloseTo(30)
  })

  it('refuses when donors cannot cover the shortfall', () => {
    const actual = { '18': 28, '15': 68, Pan: 4 }
    const limits: ScreenLimit[] = [
      { screen_size: '18', min: 30 },
      { screen_size: '15', min: 68 },
      { screen_size: 'Pan', min: 4 },
    ]
    const r = normalizeDistribution(actual, limits)
    expect(r.ok).toBe(false)
  })

  it('refuses a non-pan screen over its maximum', () => {
    const actual = { '18': 40, '15': 56, Pan: 4 }
    const limits: ScreenLimit[] = [{ screen_size: '18', max: 35 }]
    const r = normalizeDistribution(actual, limits)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/maximum/i)
  })

  it('returns the input untouched when nothing is out of spec', () => {
    const actual = { '18': 31, '15': 65, Pan: 4 }
    const limits: ScreenLimit[] = [{ screen_size: '18', min: 30 }, { screen_size: 'Pan', max: 5 }]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued).toEqual(actual)
  })

  it('lands a short screen inside its minimum so the caller round trip cannot drop below it', () => {
    const actual = { '18': 27.2, '15': 68.9, Pan: 3.9 }
    const r = normalizeDistribution(actual, [{ screen_size: '18', min: 30 }])
    if (!r.ok) throw new Error(r.reason)
    // Re-derive percentages the way the approval gate does.
    const total = Object.values(r.issued).reduce((a, b) => a + b, 0)
    const roundTripped = (r.issued['18'] / total) * 100
    expect(roundTripped).toBeGreaterThanOrEqual(30)
  })

  /**
   * Every other case in this file uses round percentages ({18: 30, 15: 63,
   * Pan: 7}), which are exactly representable, so the pan branch's arithmetic
   * came out exact and the preservation guard never fired. Real lots are not
   * like that: screens are stored as GRAMS and every percentage is derived as
   * `g / Σg * 100`, which lands on an ordinary double.
   *
   * The pan branch used to distribute `issued[pan] - max` and then assign
   * `issued[pan] = max - LIMIT_MARGIN`, so the distribution total fell by
   * exactly LIMIT_MARGIN (1e-6) — precisely the drift the final guard rejects.
   * Any double rounding at the 100 scale tipped `Math.abs(drift) > 1e-6` over,
   * and a sweep of integer-gram triples found ~11% of pan-over-max lots refused
   * this way. Distributing `issued[pan] - (max - LIMIT_MARGIN)` instead — the
   * shape the screen-minimum branch already had — preserves the total exactly.
   */
  it('accepts a pan over its maximum when the percentages come from real grams', () => {
    const grams = { '18': 60, '15': 153, Pan: 20 }
    const total = Object.values(grams).reduce((a, b) => a + b, 0)
    const actual = Object.fromEntries(
      Object.entries(grams).map(([k, g]) => [k, (g / total) * 100]),
    ) as Record<string, number>
    expect(actual.Pan).toBeGreaterThan(5) // the pan branch really does run

    const r = normalizeDistribution(actual, [{ screen_size: 'Pan', max: 5 }])
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.Pan).toBeLessThanOrEqual(5)
    expect(sum(r.issued)).toBeCloseTo(100, 10)
    // The excess lands on the smallest screen above the pan. Compared at 5
    // decimals because the pan is issued one LIMIT_MARGIN (1e-6) inside its
    // maximum, so the receiver gets that much more than `actual.Pan - 5`.
    expect(r.issued['15']).toBeCloseTo(actual['15'] + (actual.Pan - 5), 5)
    expect(r.issued['18']).toBeCloseTo(actual['18'])
  })
})
