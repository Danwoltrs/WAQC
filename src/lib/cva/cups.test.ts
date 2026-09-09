import { describe, it, expect } from 'vitest'
import { CUP_COUNT, cycleMark, marksFromCups, cupsFromMarks, cupPenalty, type CupMark } from './cups'
import type { CvaCups } from '@/types/cva'

const marks = (...m: CupMark[]): CupMark[] => {
  const out = Array<CupMark>(CUP_COUNT).fill('none')
  m.forEach((v, i) => { out[i] = v })
  return out
}

describe('cups — SCA-104 §5.4', () => {
  it('there are five cups', () => {
    expect(CUP_COUNT).toBe(5)
  })

  it('a tap cycles none → non-uniform → defective → none', () => {
    expect(cycleMark('none')).toBe('nu')
    expect(cycleMark('nu')).toBe('def')
    expect(cycleMark('def')).toBe('none')
  })

  describe('cupsFromMarks — what gets written', () => {
    it('a defective cup is ALSO written as non-uniform (§5.4.2)', () => {
      // "all defective cups shall be also marked as non-uniform"
      const cups = cupsFromMarks(marks('none', 'def'), 'potato')
      expect(cups.defective).toEqual([{ cup: 2, type: 'potato' }])
      expect(cups.non_uniform).toEqual([2])
    })

    it('except when all five are evenly defective (§5.4.2, the sole exception)', () => {
      const cups = cupsFromMarks(marks('def', 'def', 'def', 'def', 'def'), 'moldy')
      expect(cups.defective).toHaveLength(5)
      expect(cups.non_uniform).toEqual([])
    })

    it('a defect with no type is NOT counted as defective (§5.4.1) — but the cup is still different', () => {
      // "If any of these two fields are not properly filled out, the coffee
      // shall not be counted as defective." The cup was still marked as
      // qualitatively different from the rest, so it stays non-uniform.
      const cups = cupsFromMarks(marks('def', 'nu'), null)
      expect(cups.defective).toEqual([])
      expect(cups.non_uniform).toEqual([1, 2])
    })

    it('cup numbers are 1-based and in cup order, whatever order they were marked', () => {
      const cups = cupsFromMarks(marks('nu', 'none', 'def', 'none', 'nu'), 'phenolic')
      expect(cups.non_uniform).toEqual([1, 3, 5])
      expect(cups.defective).toEqual([{ cup: 3, type: 'phenolic' }])
    })

    it('an untouched table writes nothing', () => {
      expect(cupsFromMarks(marks(), null)).toEqual({ non_uniform: [], defective: [] })
    })
  })

  describe('marksFromCups — reading a saved assessment back', () => {
    it('round-trips typed defects and non-uniform cups', () => {
      const m = marks('nu', 'none', 'def', 'none', 'nu')
      const back = marksFromCups(cupsFromMarks(m, 'phenolic'))
      expect(back.marks).toEqual(m)
      expect(back.type).toBe('phenolic')
    })

    it('a defective cup wins over its own non-uniform flag', () => {
      const cups: CvaCups = { non_uniform: [1, 2], defective: [{ cup: 2, type: 'moldy' }] }
      expect(marksFromCups(cups).marks).toEqual(marks('nu', 'def'))
    })

    it('tolerates a row saved before cups existed', () => {
      const back = marksFromCups(undefined)
      expect(back.marks).toEqual(marks())
      expect(back.type).toBeNull()
    })
  })

  describe('cupPenalty — the live line under the cups', () => {
    it('−2 per non-uniform, −4 per counted defect', () => {
      expect(cupPenalty(marks('nu', 'nu'), null)).toEqual({ u: 2, d: 0, uncounted: 0, penalty: 4 })
      // a defective cup is also non-uniform: one cup = −2 −4
      expect(cupPenalty(marks('def'), 'potato')).toEqual({ u: 1, d: 1, uncounted: 0, penalty: 6 })
    })

    it('an untyped defect is reported as not counted and only costs its −2', () => {
      expect(cupPenalty(marks('def'), null)).toEqual({ u: 1, d: 0, uncounted: 1, penalty: 2 })
    })

    it('five UNTYPED defects are not "evenly defective" — they are five flagged cups, never a clean score', () => {
      // The §5.4.2 exception is about defective cups; without a type nothing is
      // defective (§5.4.1), so an unfinished entry keeps its five −2s.
      expect(cupPenalty(marks('def', 'def', 'def', 'def', 'def'), null)).toEqual({ u: 5, d: 0, uncounted: 5, penalty: 10 })
    })

    it('five evenly defective cups cost only the four-point defects', () => {
      expect(cupPenalty(marks('def', 'def', 'def', 'def', 'def'), 'moldy')).toEqual({ u: 0, d: 5, uncounted: 0, penalty: 20 })
    })
  })
})
