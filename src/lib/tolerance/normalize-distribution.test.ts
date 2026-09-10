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
})
