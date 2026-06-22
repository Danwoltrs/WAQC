import { describe, it, expect } from 'vitest'
import { firstHalf, secondHalf, previousHalfMonth } from './periods'

describe('firstHalf / secondHalf', () => {
  it('first half is the 1st through the 15th', () => {
    expect(firstHalf(2026, 0)).toEqual({ start: '2026-01-01', end: '2026-01-15' })
  })
  it('second half runs 16th to last day (31 in Jan)', () => {
    expect(secondHalf(2026, 0)).toEqual({ start: '2026-01-16', end: '2026-01-31' })
  })
  it('second half handles February length (28 in 2026)', () => {
    expect(secondHalf(2026, 1)).toEqual({ start: '2026-02-16', end: '2026-02-28' })
  })
})

describe('previousHalfMonth', () => {
  it('mid-month today (Jan 20) → previous completed half = Jan 1-15', () => {
    expect(previousHalfMonth(new Date(2026, 0, 20))).toEqual({
      start: '2026-01-01', end: '2026-01-15',
    })
  })
  it('early-month today (Jan 10) → previous completed half = prior month 2nd half (Dec 16-31)', () => {
    expect(previousHalfMonth(new Date(2026, 0, 10))).toEqual({
      start: '2025-12-16', end: '2025-12-31',
    })
  })
})
