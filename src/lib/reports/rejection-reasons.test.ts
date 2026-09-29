import { describe, it, expect } from 'vitest'
import {
  REJECTION_REASONS,
  classifyRejection,
  reasonsOfViolation,
  summarizeWorstReasons,
  summarizeAllReasons,
  reasonCombinations,
  rejectionViolations,
} from './rejection-reasons'

const QUAKERS = 'Quakers: 12 exceeds maximum (8)'
const PRIMARY = 'Primary defects: 3 exceeds limit (2)'
const SECONDARY = 'Secondary defects: 20 exceeds limit (15)'
const TOTAL = 'Total defects: 22 exceeds limit (8)'
const FAULT = 'Fault "Hard (riado)": Intensity 4 exceeds maximum (2)'
const TAINT = 'Taint "Earthy": Intensity 3 exceeds maximum (1)'
const SCREEN = 'Screen 17: 40.0% is below minimum (60%)'

describe('REJECTION_REASONS', () => {
  it('runs from worst to least severe: cup fault, primary, secondary, cup taint, quakers, screen', () => {
    expect(REJECTION_REASONS.slice(0, 6).map(r => r.key)).toEqual([
      'cup_fault', 'primary', 'secondary', 'cup_taint', 'quakers', 'screen',
    ])
  })
})

describe('reasonsOfViolation', () => {
  it.each([
    [FAULT, ['cup_fault']],
    ['Cupping faults: 2 exceeds limit (0)', ['cup_fault']],
    ['Cupping defects combined: 3 exceeds limit (1)', ['cup_fault']],
    ['Finish: 2.50 is below minimum (3)', ['cup_score']],
    ['Overall: 9.50 is above maximum (9)', ['cup_score']],
    ['CVA score 82 is below the 84 pass mark', ['cup_score']],
    ['Manual rejection by cupper', ['cupper']],
    ['Status override', ['override']],
    [PRIMARY, ['primary']],
    [SECONDARY, ['secondary']],
    [TOTAL, ['secondary']],
    [TAINT, ['cup_taint']],
    ['Cupping taints: 2 exceeds limit (0)', ['cup_taint']],
    [QUAKERS, ['quakers']],
    [SCREEN, ['screen']],
    ['Screen Pan: 3.0% exceeds maximum (2%)', ['screen']],
    ['Moisture: 13% exceeds maximum (12%)', ['moisture']],
    ['something new', ['other']],
  ])('%s', (v, expected) => {
    expect(reasonsOfViolation(v)).toEqual(expected)
  })

  it('splits a zero-tolerance line into the fault and the taint it names', () => {
    expect(reasonsOfViolation('Zero tolerance: 1 taint(s) and 2 fault(s) detected')).toEqual(['cup_fault', 'cup_taint'])
    expect(reasonsOfViolation('Zero tolerance: 1 taint(s) and 0 fault(s) detected')).toEqual(['cup_taint'])
    expect(reasonsOfViolation('Zero tolerance: 0 taint(s) and 3 fault(s) detected')).toEqual(['cup_fault'])
  })
})

describe('classifyRejection', () => {
  it('lists every reason once, in severity order, and names the worst', () => {
    const c = classifyRejection([QUAKERS, SCREEN, SECONDARY, TOTAL, PRIMARY, QUAKERS])
    expect(c.reasons).toEqual(['primary', 'secondary', 'quakers', 'screen'])
    expect(c.worst).toBe('primary')
  })

  it('puts a cup fault above everything', () => {
    expect(classifyRejection([QUAKERS, FAULT, PRIMARY]).worst).toBe('cup_fault')
  })

  it('ranks a cup taint below secondary defects but above quakers', () => {
    expect(classifyRejection([QUAKERS, TAINT]).worst).toBe('cup_taint')
    expect(classifyRejection([TAINT, SECONDARY]).worst).toBe('secondary')
  })

  it('calls a rejection with no recorded violation "not recorded" so it still counts', () => {
    expect(classifyRejection([])).toEqual({ reasons: ['other'], worst: 'other' })
    expect(classifyRejection(null)).toEqual({ reasons: ['other'], worst: 'other' })
  })

  it('keeps Cup (fault) for real cup faults: a low cup score is its own reason', () => {
    expect(classifyRejection(['Finish: 2.50 is below minimum (3)', QUAKERS]).reasons).toEqual(['quakers', 'cup_score'])
  })

})

describe('rejectionViolations', () => {
  it('names a status override that recorded no criterion', () => {
    expect(rejectionViolations(true, null, 'Buyer asked')).toEqual(['Status override'])
    expect(rejectionViolations(true, [], '  ')).toEqual([])
  })
  it('keeps recorded violations, drops non-strings, ignores approved certificates', () => {
    expect(rejectionViolations(true, [QUAKERS, 3], 'x')).toEqual([QUAKERS])
    expect(rejectionViolations(false, null, 'Buyer asked')).toEqual([])
  })
})

describe('summarizeWorstReasons', () => {
  it('counts each certificate once, under its worst reason, so the counts add up to the rejections', () => {
    // Two certificates rejected on quakers; one of them also failed screen size.
    const s = summarizeWorstReasons([[QUAKERS], [QUAKERS, SCREEN]])
    expect(s.rows).toEqual([{ key: 'quakers', label: 'Quakers', count: 2 }])
    expect(s.total).toBe(2)
    expect(s.multiReason).toBe(1)
  })

  it('lists reasons in severity order, not by count', () => {
    const s = summarizeWorstReasons([[QUAKERS], [QUAKERS], [QUAKERS], [FAULT, QUAKERS], [SECONDARY]])
    expect(s.rows.map(r => [r.key, r.count])).toEqual([['cup_fault', 1], ['secondary', 1], ['quakers', 3]])
    expect(s.rows.reduce((n, r) => n + r.count, 0)).toBe(5)
    expect(s.multiReason).toBe(1)
  })

  it('does not count primary + secondary on one certificate as more than one reason twice', () => {
    const s = summarizeWorstReasons([[PRIMARY, SECONDARY, TOTAL]])
    expect(s.rows).toEqual([{ key: 'primary', label: 'Primary defects', count: 1 }])
    expect(s.multiReason).toBe(1)
  })
})

describe('summarizeAllReasons', () => {
  it('counts a certificate under every reason it failed', () => {
    const rows = summarizeAllReasons([[QUAKERS, SCREEN], [QUAKERS], [FAULT]])
    expect(rows.map(r => [r.key, r.count])).toEqual([['cup_fault', 1], ['quakers', 2], ['screen', 1]])
  })
})

describe('reasonCombinations', () => {
  it('groups certificates by their exact set of reasons, largest first', () => {
    const combos = reasonCombinations([[QUAKERS], [QUAKERS], [SCREEN, QUAKERS], [QUAKERS, SCREEN], [QUAKERS, SCREEN], [FAULT]])
    expect(combos.map(c => [c.reasons, c.count])).toEqual([
      [['quakers', 'screen'], 3],
      [['quakers'], 2],
      [['cup_fault'], 1],
    ])
    expect(combos[0].indices).toEqual([2, 3, 4])
  })

  it('breaks count ties by the worst reason in the set', () => {
    const combos = reasonCombinations([[SCREEN], [FAULT]])
    expect(combos.map(c => c.reasons)).toEqual([['cup_fault'], ['screen']])
  })
})

describe('the Dunkin week of 21–25/09/2026 (real compliance_violations)', () => {
  const FIN = 'Finish: 2.50 is below minimum (3)'
  const BAL = 'Balance: 2.50 is below minimum (3)'
  const CF = 'Cupping faults: 1 exceeds limit (0)'
  const P = 'Primary defects: 2 exceeds limit (1)'
  const S = 'Secondary defects: 22.5 exceeds limit (21)'
  const T = 'Total defects: 23.5 exceeds limit (21)'
  const Q = 'Quakers: 18 exceeds maximum (12)'

  it('PSS: eight certificates from three cupped lots, all worst on the cup fault', () => {
    const s = summarizeWorstReasons([
      [FIN, BAL, CF], [FIN, BAL, CF],                  // lot 45df…, 2 contracts
      [FIN, BAL, P, S, T, Q, CF],                      // lot c7b6…, 1 contract
      [CF], [CF], [CF], [CF], [CF],                    // lot eec4…, 5 contracts
    ])
    expect(s.rows).toEqual([{ key: 'cup_fault', label: 'Cup (fault)', count: 8 }])
    expect(s.multiReason).toBe(3)
  })

  it('SS: fifteen rejections split 3 cup fault / 5 primary / 7 secondary', () => {
    const s = summarizeWorstReasons([
      [S, T, Q], [P, S, T, Q], [P, S, T], [S, T, Q], [P, S, T, Q],
      [S, T, Q, CF], [S, T, Q], [S, T, Q], [S, T, Q], [P, S, T, Q],
      [P, S, T, Q], [S, T, Q], [S, T, Q, CF], [S, T, Q], [S, T, Q, CF],
    ])
    expect(s.rows.map(r => [r.label, r.count])).toEqual([
      ['Cup (fault)', 3], ['Primary defects', 5], ['Secondary defects', 7],
    ])
    expect(s.multiReason).toBe(15)
  })
})
