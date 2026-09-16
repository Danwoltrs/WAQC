import { describe, it, expect } from 'vitest'
import { gradingStateFor, isAwaitingGrading } from './awaiting-grading'

describe('isAwaitingGrading', () => {
  // 'review' is the stage a finalize leaves a lot at when its cupping is done
  // and the certificate waits on green-bean grading (applyDecision walks the
  // lot there and stops when the decision is 'pending'), for both protocols.
  it('a lot at the review stage that is not yet decided is awaiting grading', () => {
    expect(isAwaitingGrading({ status: 'in_progress', workflow_stage: 'review' })).toBe(true)
  })
  it('a decided lot is not, whatever stage it reports', () => {
    expect(isAwaitingGrading({ status: 'approved', workflow_stage: 'review' })).toBe(false)
    expect(isAwaitingGrading({ status: 'rejected', workflow_stage: 'review' })).toBe(false)
  })
  it('a lot still being cupped is not', () => {
    expect(isAwaitingGrading({ status: 'in_progress', workflow_stage: 'analysis' })).toBe(false)
    expect(isAwaitingGrading({ status: 'in_progress', workflow_stage: null })).toBe(false)
  })
})

describe('gradingStateFor', () => {
  it('reads the recorded cup verdict and whether grading exists off the assessment row', () => {
    expect(gradingStateFor({ cva_passed: true, green_bean_data: null })).toEqual({ cup_passed: true, grading_pending: true })
    expect(gradingStateFor({ cva_passed: true, green_bean_data: { screen_sizes: {} } })).toEqual({ cup_passed: true, grading_pending: false })
  })
  it('a lot with no assessment row has an unjudged cup and no grading', () => {
    expect(gradingStateFor(null)).toEqual({ cup_passed: null, grading_pending: true })
    expect(gradingStateFor(undefined)).toEqual({ cup_passed: null, grading_pending: true })
  })
})
