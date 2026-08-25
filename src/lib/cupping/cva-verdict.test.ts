// src/lib/cupping/cva-verdict.test.ts
import { describe, it, expect } from 'vitest'
import {
  decideCvaVerdict,
  decideCvaOutcome,
  overrideError,
  cvaCupIntegrity,
  cupWasAssessed,
  pickAuthoritativeCvaRow,
} from './cva-verdict'
import { createEmptyAssessment } from '@/types/cva'

describe('decideCvaVerdict', () => {
  it('passes a cup at the mark', () => {
    expect(decideCvaVerdict({ cvaScore: 84, cvaMinScore: 84 })).toEqual({
      cupPassed: true, source: 'auto', reason: 'CVA score 84 meets the 84 pass mark',
    })
  })

  it('passes a cup above the mark', () => {
    expect(decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: 84 }).cupPassed).toBe(true)
  })

  it('fails a cup below the mark', () => {
    expect(decideCvaVerdict({ cvaScore: 83.75, cvaMinScore: 84 })).toEqual({
      cupPassed: false, source: 'auto', reason: 'CVA score 83.75 is below the 84 pass mark',
    })
  })

  it('cannot judge a cup with no score', () => {
    expect(decideCvaVerdict({ cvaScore: null, cvaMinScore: 84 })).toEqual({
      cupPassed: null, source: 'auto', reason: 'No CVA score recorded for this sample',
    })
  })

  it('cannot judge a cup with no pass mark on the template', () => {
    expect(decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: null })).toEqual({
      cupPassed: null, source: 'auto', reason: 'This quality has no CVA pass mark set',
    })
  })

  it('lets an override approve a cup that failed the mark', () => {
    expect(decideCvaVerdict({
      cvaScore: 83.75,
      cvaMinScore: 84,
      override: { decision: 'approved', comment: 'right coffee for this buyer' },
    })).toEqual({
      cupPassed: true, source: 'override', reason: 'right coffee for this buyer',
    })
  })

  it('lets an override reject a cup that passed the mark', () => {
    expect(decideCvaVerdict({
      cvaScore: 90,
      cvaMinScore: 84,
      override: { decision: 'rejected', comment: 'phenolic on the second table' },
    }).cupPassed).toBe(false)
  })

  it('lets an override decide a cup that could not be judged at all', () => {
    expect(decideCvaVerdict({
      cvaScore: null,
      cvaMinScore: null,
      override: { decision: 'approved', comment: 'cupped on paper, entered late' },
    }).cupPassed).toBe(true)
  })
})

describe('overrideError', () => {
  it('accepts a well-formed override', () => {
    expect(overrideError({ decision: 'approved', comment: 'because' })).toBeNull()
  })

  it('accepts an absent override', () => {
    expect(overrideError(null)).toBeNull()
    expect(overrideError(undefined)).toBeNull()
  })

  it('requires a comment', () => {
    expect(overrideError({ decision: 'approved', comment: '' }))
      .toBe('An override comment is required')
    expect(overrideError({ decision: 'approved', comment: '   ' }))
      .toBe('An override comment is required')
  })

  it('requires a valid decision', () => {
    expect(overrideError({ decision: 'maybe', comment: 'because' }))
      .toBe('Override decision must be "approved" or "rejected"')
  })
})

describe('cvaCupIntegrity', () => {
  const empty = { sections: {}, cups: { non_uniform: [], defective: [] } }

  it('is clean and uniform when no cup was flagged', () => {
    expect(cvaCupIntegrity(empty)).toEqual({ cleanCup: true, uniformCup: true })
  })

  it('is not uniform when a cup was flagged non-uniform', () => {
    expect(cvaCupIntegrity({ ...empty, cups: { non_uniform: [3], defective: [] } }))
      .toEqual({ cleanCup: true, uniformCup: false })
  })

  it('is not clean when a cup was flagged defective', () => {
    expect(cvaCupIntegrity({
      ...empty,
      cups: { non_uniform: [], defective: [{ cup: 2, type: 'phenolic' }] },
    })).toEqual({ cleanCup: false, uniformCup: true })
  })
})

describe('decideCvaOutcome', () => {
  const passed = { cupPassed: true, source: 'auto', reason: 'CVA score 88.75 meets the 84 pass mark' } as const
  const failed = { cupPassed: false, source: 'auto', reason: 'CVA score 82 is below the 84 pass mark' } as const
  const unjudged = { cupPassed: null, source: 'auto', reason: 'No CVA score recorded for this sample' } as const

  it('certifies only when the cup passed, the green bean passed and grading exists', () => {
    expect(decideCvaOutcome({ verdict: passed, complianceViolations: [], hasGradingData: true })).toEqual({
      decision: 'approved',
      blocked: false,
      reason: 'CVA score 88.75 meets the 84 pass mark',
      violations: [],
    })
  })

  it('parks a passing cup that has no grading yet', () => {
    const outcome = decideCvaOutcome({ verdict: passed, complianceViolations: [], hasGradingData: false })
    expect(outcome.decision).toBe('pending')
    expect(outcome.blocked).toBe(false)
    expect(outcome.reason).toBe('Cup approved - awaiting green bean grading')
  })

  it('rejects a cup below the mark, and says why on the certificate', () => {
    expect(decideCvaOutcome({ verdict: failed, complianceViolations: [], hasGradingData: true })).toEqual({
      decision: 'rejected',
      blocked: false,
      reason: 'CVA score 82 is below the 84 pass mark',
      violations: ['CVA score 82 is below the 84 pass mark'],
    })
  })

  it('rejects a graded lot that failed green bean even though the cup passed', () => {
    const outcome = decideCvaOutcome({
      verdict: passed,
      complianceViolations: ['Screen size 17/18 below minimum'],
      hasGradingData: true,
    })
    expect(outcome.decision).toBe('rejected')
    expect(outcome.violations).toEqual(['Screen size 17/18 below minimum'])
  })

  it('does not let an override of the cup rescue a lot failing green bean', () => {
    const outcome = decideCvaOutcome({
      verdict: { cupPassed: true, source: 'override', reason: 'right coffee for this buyer' },
      complianceViolations: ['Moisture 13.5% above maximum'],
      hasGradingData: true,
    })
    expect(outcome.decision).toBe('rejected')
  })

  it('NEVER certifies a cup that could not be judged, even with clean grading', () => {
    const outcome = decideCvaOutcome({ verdict: unjudged, complianceViolations: [], hasGradingData: true })
    expect(outcome.decision).toBe('pending')
    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toBe('No CVA score recorded for this sample')
    expect(outcome.violations).toEqual([])
  })

  it('blocks an unjudgeable cup rather than rejecting it', () => {
    const outcome = decideCvaOutcome({ verdict: unjudged, complianceViolations: [], hasGradingData: false })
    expect(outcome.decision).toBe('pending')
    expect(outcome.blocked).toBe(true)
    expect(outcome.decision).not.toBe('rejected')
  })

  it('still rejects on the green bean when the cup could not be judged', () => {
    const outcome = decideCvaOutcome({
      verdict: unjudged,
      complianceViolations: ['Primary defects 8 above maximum'],
      hasGradingData: true,
    })
    expect(outcome.decision).toBe('rejected')
    expect(outcome.blocked).toBe(false)
    expect(outcome.violations).toEqual(['Primary defects 8 above maximum'])
  })

  it('reports the failed cup ahead of the green-bean violations', () => {
    const outcome = decideCvaOutcome({
      verdict: failed,
      complianceViolations: ['Moisture 13.5% above maximum'],
      hasGradingData: true,
    })
    expect(outcome.violations).toEqual([
      'CVA score 82 is below the 84 pass mark',
      'Moisture 13.5% above maximum',
    ])
  })

  it('never returns approved for any unjudgeable cup, whatever the green bean says', () => {
    for (const hasGradingData of [true, false]) {
      for (const complianceViolations of [[], ['Screen size 17/18 below minimum']]) {
        expect(
          decideCvaOutcome({ verdict: unjudged, complianceViolations, hasGradingData }).decision,
        ).not.toBe('approved')
      }
    }
  })
})

describe('cupWasAssessed', () => {
  const emptyBlob = createEmptyAssessment()

  it('is false when there is no assessment at all', () => {
    expect(cupWasAssessed(null)).toBe(false)
    expect(cupWasAssessed(undefined)).toBe(false)
  })

  it('is false for the empty blob the CVA save path writes on first autosave', () => {
    // cupping_scores.scores is JSONB NOT NULL DEFAULT '{}' and the journey
    // autosaves a full createEmptyAssessment(), so "nobody assessed this" is a
    // present, well-formed, entirely unscored blob — not a missing one.
    expect(cupWasAssessed(emptyBlob)).toBe(false)
  })

  it('is false for a row whose scores column is the bare default', () => {
    expect(cupWasAssessed({} as any)).toBe(false)
  })

  it('is false when a cup was flagged but no section was ever scored', () => {
    expect(cupWasAssessed({
      sections: {},
      cups: { non_uniform: [2], defective: [{ cup: 3, type: 'potato' }] },
    })).toBe(false)
  })

  it('is true once a single section carries an impression', () => {
    expect(cupWasAssessed({ ...emptyBlob, sections: { fragrance: { impression: 6 } } })).toBe(true)
  })

  it('is true when only the cooled-final impression was recorded', () => {
    expect(cupWasAssessed({ ...emptyBlob, sections: { acidity: { impression_final: 7 } } })).toBe(true)
  })
})

describe('pickAuthoritativeCvaRow', () => {
  // Callers pass rows newest-first; these fixtures follow that order.
  const master = { cupper_id: 'master-1', cva_score: 88.75 }
  const other = { cupper_id: 'cupper-2', cva_score: null }

  it('has nothing to pick from an empty session', () => {
    expect(pickAuthoritativeCvaRow([], 'master-1')).toBeNull()
  })

  it("prefers the master cupper's row over a newer one from someone else", () => {
    expect(pickAuthoritativeCvaRow([other, master], 'master-1')).toBe(master)
  })

  it('falls back to the newest row when the master cupper never cupped this lot', () => {
    expect(pickAuthoritativeCvaRow([other, master], 'someone-who-did-not-cup')).toBe(other)
  })

  it('falls back to the newest row when the session designates no master cupper', () => {
    expect(pickAuthoritativeCvaRow([other, master], null)).toBe(other)
  })

  it('returns the master row even when it is also the newest', () => {
    expect(pickAuthoritativeCvaRow([master, other], 'master-1')).toBe(master)
  })

  it('ignores rows with no cupper when looking for the master', () => {
    const orphan = { cupper_id: null, cva_score: 90 }
    expect(pickAuthoritativeCvaRow([orphan, master], 'master-1')).toBe(master)
  })
})
