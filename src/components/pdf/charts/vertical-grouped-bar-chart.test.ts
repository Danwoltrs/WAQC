import { describe, it, expect } from 'vitest'
import { niceAxisMax } from './vertical-grouped-bar-chart'

describe('niceAxisMax', () => {
  it('rounds a small count up to a clean tick', () => {
    expect(niceAxisMax(8)).toBe(9)   // small integers: max+1 headroom
    expect(niceAxisMax(2)).toBe(3)
  })
  it('rounds large bag counts up to a clean magnitude', () => {
    expect(niceAxisMax(6001)).toBe(7000)
  })
  it('returns a positive axis even for all-zero data', () => {
    expect(niceAxisMax(0)).toBeGreaterThan(0)
  })
})
