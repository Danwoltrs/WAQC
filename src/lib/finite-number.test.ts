import { describe, it, expect } from 'vitest'
import { finiteNumber } from './finite-number'

describe('finiteNumber', () => {
  it('passes numbers through', () => expect(finiteNumber(0.65)).toBe(0.65))
  it('keeps 0', () => expect(finiteNumber(0)).toBe(0))
  it('reads numeric strings from hand-edited JSON', () => expect(finiteNumber('0.72')).toBe(0.72))
  it('drops nothing-like and non-numeric values', () => {
    for (const v of [undefined, null, '', 'abc', NaN, Infinity, {}, []]) expect(finiteNumber(v)).toBeUndefined()
  })
})
