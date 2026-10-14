import { describe, expect, it } from 'vitest'
import { decideNewProfile, isExternalQcRole, type StaffInvitationRow } from './new-profile'

const SANTOS = 'lab-santos'
const invitation = (over: Partial<StaffInvitationRow> = {}): StaffInvitationRow => ({
  id: 'inv-1', first_name: 'Ana', last_name: 'Lima', qc_role: 'lab_personnel', laboratory_id: 'lab-gt',
  is_cupper: true, is_q_grader: false, qc_enabled: true, ...over,
})

describe('isExternalQcRole', () => {
  it('is true for client, supplier and buyer only', () => {
    expect(['client', 'supplier', 'buyer'].every(isExternalQcRole)).toBe(true)
    expect(isExternalQcRole('lab_personnel')).toBe(false)
    expect(isExternalQcRole(null)).toBe(false)
  })
})

describe('decideNewProfile', () => {
  it('builds the profile from a staff invitation', () => {
    expect(decideNewProfile({ email: 'ana@lab.com', userType: null, invitation: invitation(), metadataName: null, santosLabId: SANTOS }))
      .toEqual({
        first_name: 'Ana', last_name: 'Lima', full_name: 'Ana Lima', qc_role: 'lab_personnel', qc_enabled: true,
        is_cupper: true, is_q_grader: false, is_global_admin: false, laboratory_id: 'lab-gt',
      })
  })

  it('marks global roles from an invitation as global admin and falls back to Santos', () => {
    const p = decideNewProfile({
      email: 'x@lab.com', userType: null, invitation: invitation({ qc_role: 'global_quality_admin', laboratory_id: null }),
      metadataName: null, santosLabId: SANTOS,
    })
    expect(p?.is_global_admin).toBe(true)
    expect(p?.laboratory_id).toBe(SANTOS)
  })

  it('ignores an invitation for an external role', () => {
    expect(decideNewProfile({ email: 'buyer@client.com', userType: null, invitation: invitation({ qc_role: 'client' }), metadataName: null, santosLabId: SANTOS }))
      .toBeNull()
  })

  it('gives @wolthers.com staff defaults, admins by email', () => {
    expect(decideNewProfile({ email: ' Joao@Wolthers.com ', userType: 'internal', invitation: null, metadataName: 'Joao Silva', santosLabId: SANTOS }))
      .toEqual({
        first_name: 'Joao', last_name: 'Silva', full_name: 'Joao Silva', qc_role: 'lab_personnel', qc_enabled: true,
        is_cupper: false, is_q_grader: false, is_global_admin: false, laboratory_id: SANTOS,
      })
    expect(decideNewProfile({ email: 'daniel@wolthers.com', userType: null, invitation: null, metadataName: null, santosLabId: SANTOS })?.qc_role)
      .toBe('global_admin')
  })

  it('creates nothing for a stranger', () => {
    expect(decideNewProfile({ email: 'someone@gmail.com', userType: null, invitation: null, metadataName: 'Someone', santosLabId: SANTOS })).toBeNull()
  })

  it('creates nothing for an external user, even with a staff invitation or a wolthers address', () => {
    expect(decideNewProfile({ email: 'x@wolthers.com', userType: 'external', invitation: invitation(), metadataName: null, santosLabId: SANTOS })).toBeNull()
  })

  it('creates nothing for an external row of any status, even pending', () => {
    expect(decideNewProfile({ email: 'ana@lab.com', userType: 'external', invitation: invitation(), metadataName: null, santosLabId: SANTOS })).toBeNull()
    expect(decideNewProfile({ email: 'x@wolthers.com', userType: 'external', invitation: null, metadataName: null, santosLabId: SANTOS })).toBeNull()
  })

  it('does not treat look-alike domains as wolthers.com', () => {
    for (const email of ['x@wolthers.com.evil.io', 'x@evil-wolthers.com', 'x@mail.wolthers.com']) {
      expect(decideNewProfile({ email, userType: null, invitation: null, metadataName: null, santosLabId: SANTOS })).toBeNull()
    }
  })
})
