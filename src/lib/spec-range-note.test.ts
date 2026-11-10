import { describe, it, expect } from 'vitest'
import { rangeNote } from './spec-range-note'

const g = (n: number) => n.toFixed(3)

describe('rangeNote', () => {
  it('below min', () => expect(rangeNote(0.64, 0.65, 0.72, g)).toBe('(min 0.650)'))
  it('above max', () => expect(rangeNote(0.73, 0.65, 0.72, g)).toBe('(max 0.720)'))
  it('inside', () => expect(rangeNote(0.7, 0.65, 0.72, g)).toBeNull())
  it('on the boundary is inside', () => {
    expect(rangeNote(0.65, 0.65, 0.72, g)).toBeNull()
    expect(rangeNote(0.72, 0.65, 0.72, g)).toBeNull()
  })
  it('one-sided limits', () => {
    expect(rangeNote(0.9, undefined, 0.72, g)).toBe('(max 0.720)')
    expect(rangeNote(0.1, 0.65, undefined, g)).toBe('(min 0.650)')
  })
  it('no value, no note', () => expect(rangeNote(null, 0.65, 0.72, g)).toBeNull())
  it('a 0 limit still counts', () => expect(rangeNote(-0.1, 0, undefined, g)).toBe('(min 0.000)'))
})
