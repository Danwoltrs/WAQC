import { describe, it, expect } from 'vitest'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { isWheelPath, sanitizePicks, leafTerm, parseCupperSensory } from './picks'

const choc = ['Nutty/Cocoa', 'Cocoa', 'Chocolate']
const leaves = NODES.filter((n) => n.ring === 3).slice(0, 6).map((n) => n.path)

describe('isWheelPath', () => {
  it('accepts 1-3 level paths in the wheel', () => {
    expect(isWheelPath(choc)).toBe(true)
    expect(isWheelPath(['Sweet'])).toBe(true)
    expect(isWheelPath(['Sweet', 'Brown Sugar'])).toBe(true)
  })
  it('rejects everything else', () => {
    expect(isWheelPath([])).toBe(false)
    expect(isWheelPath(['Not', 'A', 'Path'])).toBe(false)
    expect(isWheelPath('Sweet')).toBe(false)
    expect(isWheelPath([1])).toBe(false)
    expect(isWheelPath([...choc, 'extra'])).toBe(false)
  })
})

describe('sanitizePicks', () => {
  it('drops invalid and duplicate paths', () => {
    expect(sanitizePicks([choc, ['Not', 'A', 'Path'], choc, 'x'], 5)).toEqual([choc])
  })
  it('returns [] for non-arrays', () => {
    expect(sanitizePicks(null, 5)).toEqual([])
    expect(sanitizePicks({}, 5)).toEqual([])
  })
  it('keeps the first cap entries in order', () => {
    expect(sanitizePicks(leaves, 5)).toEqual(leaves.slice(0, 5))
  })
  it('returns copies', () => {
    const out = sanitizePicks([choc], 5)
    expect(out[0]).not.toBe(choc)
  })
})

describe('leafTerm', () => {
  it('is the last element', () => {
    expect(leafTerm(['Sweet', 'Brown Sugar'])).toBe('Brown Sugar')
  })
})

describe('parseCupperSensory', () => {
  it('nulls non-objects', () => {
    expect(parseCupperSensory(null)).toBeNull()
    expect(parseCupperSensory('x')).toBeNull()
  })
  it('parses fields strictly', () => {
    expect(parseCupperSensory({ picks: [['Sweet']], profile_id: 'p1', profile_match: 'yes' }))
      .toEqual({ picks: [['Sweet']], profile_id: 'p1', profile_match: null })
    expect(parseCupperSensory({ picks: [['Sweet']], profile_id: '', profile_match: false }))
      .toEqual({ picks: [['Sweet']], profile_id: null, profile_match: false })
    expect(parseCupperSensory({})).toEqual({ picks: [], profile_id: null, profile_match: null })
  })
})
