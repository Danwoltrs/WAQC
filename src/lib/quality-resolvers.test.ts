import { describe, it, expect } from 'vitest'
import {
  screenGramsToPercent,
  resolveDefectCounts,
  resolveTaintFaultCounts,
  resolveFinalScores,
  resolveCupDefects,
  isFlavorDescriptor,
  type CuppingScoreRow,
} from './quality-resolvers'

describe('screenGramsToPercent', () => {
  it('converts grams to percentages of the sieved total', () => {
    expect(screenGramsToPercent({ '16': 750, '15': 200, '14': 50 })).toEqual({
      '16': 75, '15': 20, '14': 5,
    })
  })

  it('returns null when there is nothing to divide by', () => {
    expect(screenGramsToPercent(null)).toBeNull()
    expect(screenGramsToPercent(undefined)).toBeNull()
    expect(screenGramsToPercent({})).toBeNull()
    expect(screenGramsToPercent({ '16': 0, '15': 0 })).toBeNull()
  })

  it('treats non-numeric entries as zero rather than poisoning the total', () => {
    expect(screenGramsToPercent({ '16': 75, '15': 25, Pan: NaN })).toEqual({
      '16': 75, '15': 25, Pan: 0,
    })
  })
})

describe('resolveDefectCounts', () => {
  it('reads the shape grading writes', () => {
    expect(resolveDefectCounts({ primary: 1, secondary: 21 })).toEqual({
      primary: 1, secondary: 21, total: 22,
    })
  })

  it('reads only the plain keys, matching the approval gate exactly', () => {
    // The gate has always read defects.primary. Honouring total_primary here
    // would re-judge historical lots that were approved as zero-defect.
    expect(resolveDefectCounts({ total_primary: 9, total_secondary: 9 })).toEqual({
      primary: 0, secondary: 0, total: 0,
    })
  })

  it('prefers the plain keys when both shapes are present', () => {
    // The approval gate reads defects.primary. Preferring the other key here
    // would silently change verdicts on any row carrying both.
    expect(resolveDefectCounts({ primary: 1, total_primary: 9, secondary: 2 })).toEqual({
      primary: 1, secondary: 2, total: 3,
    })
  })

  it('always computes the total, ignoring a stored one', () => {
    expect(resolveDefectCounts({ primary: 1, secondary: 21, total: 5 })).toEqual({
      primary: 1, secondary: 21, total: 22,
    })
  })

  it('treats a missing count as zero', () => {
    expect(resolveDefectCounts({ primary: 4 })).toEqual({ primary: 4, secondary: 0, total: 4 })
  })

  it('returns null when there is no defect record at all', () => {
    expect(resolveDefectCounts(null)).toBeNull()
    expect(resolveDefectCounts(undefined)).toBeNull()
    expect(resolveDefectCounts('nope')).toBeNull()
  })
})

describe('resolveTaintFaultCounts', () => {
  const rows: CuppingScoreRow[] = [
    { cupper_id: 'master', scores: null, defects: { taints: [{ name: 'a' }], faults: [] } },
    { cupper_id: 'c2', scores: null, defects: { taints: [{ name: 'a' }, { name: 'b' }], faults: [{ name: 'x' }] } },
  ]

  it("uses only the master cupper's defects when one is designated", () => {
    expect(resolveTaintFaultCounts(rows, 'master')).toEqual({ taints: 1, faults: 0 })
  })

  it('takes the maximum across cuppers when there is no master', () => {
    // Max, not sum: two cuppers flagging the same taint is one taint.
    expect(resolveTaintFaultCounts(rows, null)).toEqual({ taints: 2, faults: 1 })
  })

  it('returns zeros for no scores', () => {
    expect(resolveTaintFaultCounts([], null)).toEqual({ taints: 0, faults: 0 })
  })

  it('returns zeros when the designated master filed no scores', () => {
    expect(resolveTaintFaultCounts(rows, 'absent')).toEqual({ taints: 0, faults: 0 })
  })
})

describe('resolveFinalScores', () => {
  const rows: CuppingScoreRow[] = [
    { cupper_id: 'master', scores: { Body: 2 }, defects: null },
    { cupper_id: 'c2', scores: { Body: 5, Acidity: 3 }, defects: null },
  ]

  it("prefers the master cupper's score", () => {
    expect(resolveFinalScores(rows, 'master').Body).toBe(2)
  })

  it('fills attributes the master did not score with the mean', () => {
    expect(resolveFinalScores(rows, 'master').Acidity).toBe(3)
  })

  it('averages every attribute when there is no master', () => {
    expect(resolveFinalScores(rows, null)).toEqual({ Body: 3.5, Acidity: 3 })
  })

  it('ignores non-numeric score values', () => {
    const withText: CuppingScoreRow[] = [
      { cupper_id: 'c1', scores: { Body: 4, Flavor_descriptor: 'nutty' }, defects: null },
    ]
    expect(resolveFinalScores(withText, null)).toEqual({ Body: 4 })
  })

  it('returns nothing for no scores', () => {
    expect(resolveFinalScores([], null)).toEqual({})
  })
})

describe('resolveCupDefects', () => {
  const row = (
    cupper_id: string | null,
    defects: Record<string, unknown> | null,
  ): CuppingScoreRow => ({ cupper_id, scores: null, defects: defects as never })

  it('reads the master cupper\'s record when one is designated', () => {
    const defects = resolveCupDefects([
      row('a', { faults: [{ name: 'Rioy', intensity: 4, cups_affected: 3 }] }),
      row('master', { faults: [{ name: 'Hard (Riado)', intensity: 2, cups_affected: 1 }] }),
    ], 'master')
    expect(defects).toEqual([
      { kind: 'Fault', name: 'Hard (Riado)', cups: 1, intensity: 2 },
    ])
  })

  // Must match resolveTaintFaultCounts exactly: it takes the longest list, so
  // merging across cuppers here would list two entries under a count of one.
  it('takes the single longest list when there is no master cupper', () => {
    const defects = resolveCupDefects([
      row('a', { taints: [{ name: 'Fermented', intensity: 1 }] }),
      row('b', { taints: [{ name: 'Phenol', intensity: 3 }, { name: 'Moldy', intensity: 2 }] }),
    ], null)
    expect(defects.map(d => d.name)).toEqual(['Phenol', 'Moldy'])
    expect(resolveTaintFaultCounts([
      row('a', { taints: [{ name: 'Fermented', intensity: 1 }] }),
      row('b', { taints: [{ name: 'Phenol', intensity: 3 }, { name: 'Moldy', intensity: 2 }] }),
    ], null).taints).toBe(defects.length)
  })

  it('reads legacy bare-string entries', () => {
    expect(resolveCupDefects([row('a', { taints: ['Fermented', '  '] })], null))
      .toEqual([{ kind: 'Taint', name: 'Fermented', cups: null, intensity: null }])
  })

  it('returns taints before faults, and nothing at all for an empty record', () => {
    const defects = resolveCupDefects([
      row('a', { taints: [{ name: 'Phenol' }], faults: [{ name: 'Rioy' }] }),
    ], null)
    expect(defects.map(d => d.kind)).toEqual(['Taint', 'Fault'])
    expect(resolveCupDefects([row('a', null)], null)).toEqual([])
    expect(resolveCupDefects([], null)).toEqual([])
  })

  it('drops an unnamed entry rather than printing a blank line', () => {
    expect(resolveCupDefects([row('a', { faults: [{ intensity: 3 }, { name: '' }] })], null))
      .toEqual([])
  })

  it('returns nothing when the designated master cupper filed no record', () => {
    expect(resolveCupDefects([row('a', { taints: [{ name: 'Phenol' }] })], 'master')).toEqual([])
  })
})

describe('isFlavorDescriptor', () => {
  it('matches the key cuppers actually write, and the spellings around it', () => {
    for (const name of ['Flavor_descriptor', 'flavour descriptor', 'Flavor-Descriptor']) {
      expect(isFlavorDescriptor(name)).toBe(true)
    }
  })

  it('does not match a real sensory attribute', () => {
    for (const name of ['Flavor', 'Aftertaste', 'Body']) {
      expect(isFlavorDescriptor(name)).toBe(false)
    }
  })
})

describe('resolveFinalScores with a CVA assessment', () => {
  // Specialty samples store the whole CvaAssessment object in `scores`, so its
  // struct fields sit where attribute names normally are. Four are numbers.
  const cva = {
    protocol: 'cva',
    version: 1,
    score: 86.5,
    u: 5,
    d: 0,
    roast: {},
    sections: { acidity: { impression_final: 7 } },
    describe: {},
    cups: {},
    highlights: null,
  }

  it('never publishes version, score, u or d as cupping attributes', () => {
    const final = resolveFinalScores(
      [{ cupper_id: 'a', scores: cva as never, defects: null }],
      null,
    )
    expect(final).toEqual({})
  })

  it('ignores a CVA envelope filed by the designated master cupper too', () => {
    const final = resolveFinalScores(
      [{ cupper_id: 'master', scores: cva as never, defects: null }],
      'master',
    )
    expect(final).toEqual({})
  })

  it('still reads the ordinary cuppers on a session that mixes both', () => {
    const final = resolveFinalScores([
      { cupper_id: 'a', scores: cva as never, defects: null },
      { cupper_id: 'b', scores: { Body: 4, Acidity: 3 }, defects: null },
    ], null)
    expect(final).toEqual({ Body: 4, Acidity: 3 })
  })
})
