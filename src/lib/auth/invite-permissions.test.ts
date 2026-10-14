import { describe, expect, it } from 'vitest'
import { checkInvitePermission } from './invite-permissions'

const LAB_A = '11111111-1111-1111-1111-111111111111'
const LAB_B = '22222222-2222-2222-2222-222222222222'

describe('checkInvitePermission', () => {
  it('rejects a caller with no profile as unauthorized', () => {
    expect(checkInvitePermission(null, { qc_role: 'lab_personnel', laboratory_id: LAB_A }))
      .toEqual({ ok: false, status: 401, error: 'Unauthorized' })
  })

  it('rejects an unknown role before looking at the inviter', () => {
    const admin = { qc_role: 'global_admin', is_global_admin: true, laboratory_id: null }
    expect(checkInvitePermission(admin, { qc_role: 'superuser', laboratory_id: null }))
      .toMatchObject({ ok: false, status: 400 })
  })

  it('lets a global admin invite any role into any lab', () => {
    const admin = { qc_role: 'global_admin', is_global_admin: true, laboratory_id: null }
    expect(checkInvitePermission(admin, { qc_role: 'global_admin', laboratory_id: null })).toEqual({ ok: true })
    expect(checkInvitePermission(admin, { qc_role: 'lab_personnel', laboratory_id: LAB_B })).toEqual({ ok: true })
  })

  it('treats is_global_admin as a global admin whatever the role label', () => {
    const quality = { qc_role: 'global_quality_admin', is_global_admin: true, laboratory_id: null }
    expect(checkInvitePermission(quality, { qc_role: 'lab_quality_manager', laboratory_id: LAB_A })).toEqual({ ok: true })
  })

  it('lets a lab quality manager invite lower roles into their own lab', () => {
    const qm = { qc_role: 'lab_quality_manager', is_global_admin: false, laboratory_id: LAB_A }
    expect(checkInvitePermission(qm, { qc_role: 'lab_personnel', laboratory_id: LAB_A })).toEqual({ ok: true })
    expect(checkInvitePermission(qm, { qc_role: 'lab_finance_manager', laboratory_id: LAB_A })).toEqual({ ok: true })
  })

  it('stops a lab quality manager inviting their own level or higher, or outside roles', () => {
    const qm = { qc_role: 'lab_quality_manager', is_global_admin: false, laboratory_id: LAB_A }
    // Matches can_update_profile: a lab quality manager manages lab_personnel and
    // lab_finance_manager only. Client logins have their own invite flow.
    for (const role of ['lab_quality_manager', 'santos_hq_finance', 'global_finance_admin', 'global_quality_admin', 'global_admin', 'client', 'supplier', 'buyer']) {
      expect(checkInvitePermission(qm, { qc_role: role, laboratory_id: LAB_A })).toMatchObject({ ok: false, status: 403 })
    }
  })

  it('stops a lab quality manager inviting into another lab or no lab', () => {
    const qm = { qc_role: 'lab_quality_manager', is_global_admin: false, laboratory_id: LAB_A }
    expect(checkInvitePermission(qm, { qc_role: 'lab_personnel', laboratory_id: LAB_B })).toMatchObject({ ok: false, status: 403 })
    // A missing lab would land the new user in Santos by default.
    expect(checkInvitePermission(qm, { qc_role: 'lab_personnel', laboratory_id: null })).toMatchObject({ ok: false, status: 403 })
  })

  it('stops a lab quality manager who has no lab', () => {
    const qm = { qc_role: 'lab_quality_manager', is_global_admin: false, laboratory_id: null }
    expect(checkInvitePermission(qm, { qc_role: 'lab_personnel', laboratory_id: null })).toMatchObject({ ok: false, status: 403 })
  })

  it('stops everyone else from inviting', () => {
    for (const role of ['lab_personnel', 'lab_finance_manager', 'santos_hq_finance', 'global_finance_admin', 'client', 'supplier', 'buyer', null]) {
      const caller = { qc_role: role, is_global_admin: false, laboratory_id: LAB_A }
      expect(checkInvitePermission(caller, { qc_role: 'lab_personnel', laboratory_id: LAB_A })).toMatchObject({ ok: false, status: 403 })
    }
  })
})
