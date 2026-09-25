import { describe, it, expect } from 'vitest'
import { round1, pct } from './annual-math'

describe('annual-math', () => {
  describe('round1', () => {
    it('rounds to one decimal place', () => {
      expect(round1(2444.44)).toBe(2444.4)
      expect(round1(0.05)).toBeCloseTo(0.1, 1)
    })
  })

  describe('pct', () => {
    it('returns 0 when whole is 0', () => {
      expect(pct(0, 0)).toBe(0)
    })

    it('calculates percentage and rounds', () => {
      expect(pct(69, 102)).toBe(68)
      expect(pct(1, 3)).toBe(33)
      expect(pct(2, 3)).toBe(67)
    })
  })
})
