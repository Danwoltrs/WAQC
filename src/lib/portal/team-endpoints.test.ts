// src/lib/portal/team-endpoints.test.ts
import { describe, expect, it } from 'vitest'
import { QC_CAPABILITIES, QC_VIEWS } from './qc-keys'
import { normalizeTeamData, teamEndpoints } from './team-endpoints'

const CO = '11111111-1111-4111-8111-111111111111'

describe('teamEndpoints', () => {
  it('a company admin manages the team through the portal team routes', () => {
    const e = teamEndpoints(false, CO)
    expect(e.list).toBe('/api/portal/team')
    expect(e.invite).toBe(`/api/portal/team?company=${CO}`)
    expect(e.member('u-1')).toBe('/api/portal/team/u-1')
    expect(e.invitation('i-1')).toBe('/api/portal/team/invitations/i-1')
  })

  it('staff viewing the portal manage it through the client page routes', () => {
    const e = teamEndpoints(true, CO)
    expect(e.list).toBe(`/api/clients/${CO}/portal-access`)
    expect(e.invite).toBe(`/api/clients/${CO}/portal-access`)
    expect(e.member('u-1')).toBe(`/api/clients/${CO}/portal-access/u-1`)
    expect(e.invitation('i-1')).toBe(`/api/clients/${CO}/portal-access/invitations/i-1`)
  })
})

describe('normalizeTeamData', () => {
  it('keeps the portal team answer as it is', () => {
    const body = { members: [{ userId: 'u-1' }], invitations: [], ceiling: { views: ['qc_samples'], capabilities: [] }, selfId: 'u-1' }
    expect(normalizeTeamData(body)).toEqual(body)
  })

  it('gives the staff answer the full key set and no self', () => {
    const data = normalizeTeamData({ members: [{ userId: 'u-1' }], invitations: [{ id: 'i-1' }], activity: [] })
    expect(data.ceiling).toEqual({ views: [...QC_VIEWS], capabilities: [...QC_CAPABILITIES] })
    expect(data.selfId).toBe('')
    expect(data.members).toHaveLength(1)
    expect(data.invitations).toHaveLength(1)
  })

  it('treats missing lists as empty', () => {
    const data = normalizeTeamData({})
    expect(data.members).toEqual([])
    expect(data.invitations).toEqual([])
  })
})
