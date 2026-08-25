// src/lib/cupping/cva-verdict.test.ts
import { describe, it, expect } from 'vitest'
import { decideCvaVerdict, overrideError, cvaCupIntegrity } from './cva-verdict'

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
