// src/lib/cupping/cva-verdict.test.ts
import { describe, it, expect } from 'vitest'
import {
  decideCvaVerdict,
  decideCvaOutcome,
  overrideError,
  cvaCupIntegrity,
  cupWasAssessed,
  pickAuthoritativeCvaRow,
  buildCvaAssessmentFields,
  OVERRIDE_REJECTION_VIOLATION,
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

  // --- what the CERTIFICATE is allowed to say --------------------------------
  // `violations` is published: the route stamps it on
  // certificates.compliance_violations, which the public QR page prints as the
  // verdict reason. An override's comment answers CertifyStep's INTERNAL prompt
  // and must never get there.

  it('never publishes the override comment as the certificate rejection reason', () => {
    const outcome = decideCvaOutcome({
      verdict: {
        cupPassed: false,
        source: 'override',
        reason: 'customer always complains about this exporter, reject',
      },
      complianceViolations: [],
      hasGradingData: true,
    })
    expect(outcome.violations).toEqual(['Manual rejection by cupper'])
    expect(outcome.violations.join(' ')).not.toContain('exporter')
  })

  it('still tells the CUPPER what they typed, in the response reason', () => {
    // The free text is fine to echo back to the person who wrote it, and stays
    // durably on quality_assessments.cva_override_comment. Only the published
    // violations line is sanitised.
    const outcome = decideCvaOutcome({
      verdict: { cupPassed: false, source: 'override', reason: 'phenolic on the second table' },
      complianceViolations: [],
      hasGradingData: true,
    })
    expect(outcome.reason).toBe('phenolic on the second table')
    expect(outcome.decision).toBe('rejected')
  })

  it('leaves the AUTO rejection reason alone — it is already written for the buyer', () => {
    expect(
      decideCvaOutcome({ verdict: failed, complianceViolations: [], hasGradingData: true }).violations,
    ).toEqual(['CVA score 82 is below the 84 pass mark'])
  })

  it('keeps the green-bean violations after the fixed override line', () => {
    const outcome = decideCvaOutcome({
      verdict: { cupPassed: false, source: 'override', reason: 'internal note, do not print' },
      complianceViolations: ['Moisture 13.5% above maximum'],
      hasGradingData: true,
    })
    expect(outcome.violations).toEqual([
      'Manual rejection by cupper',
      'Moisture 13.5% above maximum',
    ])
  })

  it('adds no cup violation when an override APPROVED the cup', () => {
    const outcome = decideCvaOutcome({
      verdict: { cupPassed: true, source: 'override', reason: 'right coffee for this buyer' },
      complianceViolations: [],
      hasGradingData: true,
    })
    expect(outcome.violations).toEqual([])
  })

  it('uses the commodity route\'s own wording, so both rails read the same', () => {
    // Word-for-word src/app/api/cupping/finalize/route.ts's manual rejection.
    expect(OVERRIDE_REJECTION_VIOLATION).toBe('Manual rejection by cupper')
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

describe('buildCvaAssessmentFields', () => {
  const assessed = { ...createEmptyAssessment(), sections: { flavor: { impression: 8 } } }
  /** What the journey persists on the first edit — a roast level, say. Nothing scored. */
  const unscored = createEmptyAssessment()
  const actor = { overrideBy: 'profile-1', overrideAt: '2026-08-25T12:00:00.000Z' }

  it('writes the verdict triad when the authoritative row carried a score', () => {
    const verdict = decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: 84 })
    expect(buildCvaAssessmentFields({
      ...actor,
      cvaScore: 88.75,
      cvaMinScore: 84,
      verdict,
      override: null,
      assessment: assessed,
      existingCleanCup: null,
      existingUniformCup: null,
    })).toEqual({
      cva_score: 88.75,
      cva_min_score: 84,
      cva_passed: true,
      clean_cup: true,
      uniform_cup: true,
      // No clean_cup_auto / uniform_cup_auto: the commodity route keeps those
      // mirror columns, nothing on the specialty rail reads them, and adding
      // them here was deliberately declined.
    })
  })

  it('writes NO cva_* column when a later session re-opened a certified lot and nobody re-scored it', () => {
    // The failure this exists for: a lot certified at 88.75 in a two-lot
    // session is opened alone from the picker, which mints a FRESH session
    // because the sample set differs. Picking a roast level on step 0 persists
    // an unscored CVA row; the gate passes on it, no score resolves, and the
    // route decides pending and mints nothing. Writing cva_score: null /
    // cva_passed: null here would erase the verdict from an ISSUED
    // certificate — PDFs regenerate on the fly, so every later send would
    // print no score and "Could not be judged" for a lot that scored 88.75.
    const verdict = decideCvaVerdict({ cvaScore: null, cvaMinScore: 84 })
    const fields = buildCvaAssessmentFields({
      ...actor,
      cvaScore: null,
      cvaMinScore: 84,
      verdict,
      override: null,
      assessment: unscored,
      // The lot was certified earlier, so its cup flags are already set.
      existingCleanCup: true,
      existingUniformCup: true,
    })
    expect(fields).toEqual({})
    expect('cva_score' in fields).toBe(false)
    expect('cva_passed' in fields).toBe(false)
    expect('cva_min_score' in fields).toBe(false)
  })

  it('writes no cva_* column for an unscored lot that was never certified either', () => {
    const verdict = decideCvaVerdict({ cvaScore: null, cvaMinScore: null })
    expect(buildCvaAssessmentFields({
      ...actor,
      cvaScore: null,
      cvaMinScore: null,
      verdict,
      override: null,
      assessment: null,
      existingCleanCup: null,
      existingUniformCup: null,
    })).toEqual({})
  })

  it('writes the triad for an override even when nothing was scored', () => {
    // An override IS something real to write: a human decided this cup.
    const override = { decision: 'approved', comment: 'cupped on paper, entered late' } as const
    const verdict = decideCvaVerdict({ cvaScore: null, cvaMinScore: 84, override })
    expect(buildCvaAssessmentFields({
      ...actor,
      cvaScore: null,
      cvaMinScore: 84,
      verdict,
      override,
      assessment: unscored,
      existingCleanCup: null,
      existingUniformCup: null,
    })).toEqual({
      cva_score: null,
      cva_min_score: 84,
      cva_passed: true,
      cva_override_decision: 'approved',
      cva_override_comment: 'cupped on paper, entered late',
      cva_override_by: 'profile-1',
      cva_override_at: '2026-08-25T12:00:00.000Z',
    })
  })

  it('never restores the CVA reading over a cup flag a human corrected', () => {
    // Certifying a specialty lot normally takes TWO Certify passes (pass 1
    // parks pending awaiting grading, pass 2 runs once grading lands). A lab
    // user who corrects "Clean cup" to No in the cert editor between them must
    // not have pass 2 silently put the CVA-derived value back — the commodity
    // route's `=== null` guard, adopted verbatim.
    const verdict = decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: 84 })
    const fields = buildCvaAssessmentFields({
      ...actor,
      cvaScore: 88.75,
      cvaMinScore: 84,
      verdict,
      override: null,
      assessment: assessed,
      existingCleanCup: false,
      existingUniformCup: true,
    })
    expect('clean_cup' in fields).toBe(false)
    expect('uniform_cup' in fields).toBe(false)
    // The verdict itself is still this pass's job to record.
    expect(fields.cva_score).toBe(88.75)
  })

  it('guards the two cup flags independently, exactly as the commodity route does', () => {
    const verdict = decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: 84 })
    const fields = buildCvaAssessmentFields({
      ...actor,
      cvaScore: 88.75,
      cvaMinScore: 84,
      verdict,
      override: null,
      assessment: assessed,
      existingCleanCup: false,
      existingUniformCup: null,
    })
    expect('clean_cup' in fields).toBe(false)
    expect(fields.uniform_cup).toBe(true)
  })

  it('writes both cup flags on a first finalize, when the columns are still null', () => {
    const verdict = decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: 84 })
    const fields = buildCvaAssessmentFields({
      ...actor,
      cvaScore: 88.75,
      cvaMinScore: 84,
      verdict,
      override: null,
      assessment: { ...assessed, cups: { non_uniform: [3], defective: [] } },
      existingCleanCup: null,
      existingUniformCup: null,
    })
    expect(fields.clean_cup).toBe(true)
    expect(fields.uniform_cup).toBe(false)
  })

  it('writes no cup flag for a blob nobody actually scored, even on a first finalize', () => {
    // cvaCupIntegrity would read the unscored blob as zero non-uniform and
    // zero defective cups — "clean and uniform" for a lot nobody tasted.
    const override = { decision: 'rejected', comment: 'off the record' } as const
    const verdict = decideCvaVerdict({ cvaScore: null, cvaMinScore: 84, override })
    const fields = buildCvaAssessmentFields({
      ...actor,
      cvaScore: null,
      cvaMinScore: 84,
      verdict,
      override,
      assessment: unscored,
      existingCleanCup: null,
      existingUniformCup: null,
    })
    expect('clean_cup' in fields).toBe(false)
    expect('uniform_cup' in fields).toBe(false)
  })

  it('omits every override column when no override was submitted', () => {
    const verdict = decideCvaVerdict({ cvaScore: 83, cvaMinScore: 84 })
    const fields = buildCvaAssessmentFields({
      ...actor,
      cvaScore: 83,
      cvaMinScore: 84,
      verdict,
      override: null,
      assessment: assessed,
      existingCleanCup: null,
      existingUniformCup: null,
    })
    for (const column of [
      'cva_override_decision',
      'cva_override_comment',
      'cva_override_by',
      'cva_override_at',
    ]) {
      expect(column in fields).toBe(false)
    }
    expect(fields.cva_passed).toBe(false)
  })
})
