import { describe, it, expect } from 'vitest'
import { toleranceForSample, type ToleranceForSample } from './for-sample'
import type { ToleranceAssessment } from './types'

const assessment: ToleranceAssessment = {
  offered: true,
  items: [
    {
      key: 'screen_18_max',
      label: 'Screen 18',
      quadrant: 'distribution',
      direction: 'max',
      actual: 12.5,
      limit: 10,
      gap: 2.5,
      tolerance: 3,
    },
  ],
  blockedBy: [],
}

const stateFor = (sampleId: string): ToleranceForSample => ({
  sampleId,
  assessment,
  issued: null,
})

describe('toleranceForSample', () => {
  it('returns the state when its sampleId matches the active sample', () => {
    const state = stateFor('sample-a')
    expect(toleranceForSample(state, 'sample-a')).toBe(state)
  })

  it('returns null when the state was fetched for a different sample than the active one', () => {
    // This is the exact shape of the bug: a fetch for sample A resolved (or
    // never got cleared) after the grader switched to sample B. The state is
    // non-null and would pass a bare `state && ...` check, but must not be
    // shown or acted on against B.
    const state = stateFor('sample-a')
    expect(toleranceForSample(state, 'sample-b')).toBeNull()
  })

  it('returns null when there is no state at all', () => {
    expect(toleranceForSample(null, 'sample-a')).toBeNull()
  })

  /**
   * Proves the helper is actually discriminating on identity and not just
   * echoing truthiness. If the implementation were the naive `state &&
   * activeSampleId ? state : null` (i.e. checking that an active sample
   * exists, not that it MATCHES), this test would incorrectly pass the
   * mismatched-sample case above. This test locks in that a bare truthy
   * stand-in cannot satisfy the contract.
   */
  it('does not degrade to a bare truthiness check', () => {
    const bareTruthinessCheck = (
      state: ToleranceForSample | null,
      activeSampleId: string,
    ): ToleranceForSample | null => (state && activeSampleId ? state : null)

    const state = stateFor('sample-a')
    // The naive version wrongly returns the stale state for a mismatched id...
    expect(bareTruthinessCheck(state, 'sample-b')).toBe(state)
    // ...while the real helper correctly rejects it.
    expect(toleranceForSample(state, 'sample-b')).toBeNull()
  })
})
