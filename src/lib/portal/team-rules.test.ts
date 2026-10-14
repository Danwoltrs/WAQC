// src/lib/portal/team-rules.test.ts
import { describe, expect, it } from 'vitest'
import { teamGuard, teamTargetError } from './team-rules'

const member = { views: ['qc_samples'], capabilities: [] }

describe('teamGuard', () => {
  it('a company admin cannot act on themselves, with or without a row', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u1', target: member })).toMatchObject({ status: 403 })
    expect(teamGuard({ selfId: 'u1', targetId: 'u1', target: null })).toMatchObject({ status: 403 })
  })
  it('nor on another QC company admin', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u2', target: { ...member, capabilities: ['qc_manage_users'] } })).toMatchObject({ status: 403 })
  })
  it('an ordinary member, or no row, is no refusal', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u2', target: member })).toBeNull()
    expect(teamGuard({ selfId: 'u1', targetId: 'u2', target: null })).toBeNull()
  })
})

describe('teamTargetError', () => {
  it('404 when the person has no QC access row here', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: null })).toMatchObject({ status: 404 })
  })
  it('the guard comes first', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u1', target: null })).toMatchObject({ status: 403 })
  })
  it('allows an ordinary member', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: member })).toBeNull()
  })
})
