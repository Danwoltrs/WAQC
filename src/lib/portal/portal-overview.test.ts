import { describe, it, expect } from 'vitest'
import { buildStatusRollup } from './portal-overview'

describe('buildStatusRollup', () => {
  it('counts PSS by status, SS, and certified', () => {
    const rollup = buildStatusRollup([
      { sample_type: 'pss', status: 'approved', workflow_stage: 'certified' },
      { sample_type: 'pss', status: 'rejected', workflow_stage: 'rejected' },
      { sample_type: 'pss', status: 'received', workflow_stage: 'analysis' },
      { sample_type: 'ss', status: 'approved', workflow_stage: 'certified' },
    ])
    expect(rollup).toEqual({ pssPending: 1, pssApproved: 1, pssRejected: 1, ssTotal: 1, certified: 2, total: 4 })
  })

  it('handles empty input', () => {
    expect(buildStatusRollup([])).toEqual({ pssPending: 0, pssApproved: 0, pssRejected: 0, ssTotal: 0, certified: 0, total: 0 })
  })
})
