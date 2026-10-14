// src/lib/portal/qc-portal-gate.test.ts
import { describe, expect, it } from 'vitest'
import { evaluatePortalAccess, type QcAccessRow } from './qc-portal-gate'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const rowA: QcAccessRow = { company_id: A, views: ['qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] }
const adminRowB: QcAccessRow = { company_id: B, views: ['qc_samples'], capabilities: ['qc_manage_users'] }
const noViewC: QcAccessRow = { company_id: C, views: [], capabilities: ['qc_spec_edit'] }

const base = { signedIn: true, kind: 'external' as const, userStatus: 'active', requestedCompanyId: null, access: [rowA], need: {} }

describe('evaluatePortalAccess', () => {
  it('401 when not signed in', () => {
    expect(evaluatePortalAccess({ ...base, signedIn: false })).toMatchObject({ ok: false, status: 401 })
  })

  it('picks the only QC company when none is asked for', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, noViewC] })).toEqual({
      ok: true, companyId: A, keys: { views: ['qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] },
      isCompanyAdmin: false, isStaffViewAs: false,
    })
  })

  it('asks to choose when there are several QC companies', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, adminRowB] })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...base, access: [rowA, adminRowB], requestedCompanyId: B })).toMatchObject({ ok: true, companyId: B, isCompanyAdmin: true })
  })

  it('refuses a company whose row holds no QC view, or that has no row', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, noViewC], requestedCompanyId: C })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: B })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [noViewC] })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [] })).toMatchObject({ ok: false, status: 403 })
  })

  it('400 on a malformed company id', () => {
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: "x' or 1=1" })).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses an external user who is not active', () => {
    expect(evaluatePortalAccess({ ...base, userStatus: 'invited' })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, userStatus: 'disabled' })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, userStatus: null })).toMatchObject({ ok: false, status: 403 })
  })

  it('checks the view and the capability the route needs', () => {
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_certificates' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_dashboard' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_cupping_score' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_spec_edit' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [adminRowB], need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: true })
  })

  it("only qc_manage_users makes a company admin; sys's manage_users never does", () => {
    // The table's CHECK refuses non-qc_ keys; the gate would ignore one anyway.
    const stray: QcAccessRow = { company_id: B, views: ['contracts', 'qc_samples'], capabilities: ['manage_users'] }
    expect(evaluatePortalAccess({ ...base, access: [stray] })).toMatchObject({
      ok: true, isCompanyAdmin: false, keys: { views: ['qc_samples'], capabilities: [] },
    })
    expect(evaluatePortalAccess({ ...base, access: [stray], need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('lets staff view any company read-only', () => {
    const staff = { ...base, kind: 'staff' as const, userStatus: null, access: [] }
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { view: 'qc_dashboard' } })).toMatchObject({
      ok: true, companyId: A, isStaffViewAs: true, isCompanyAdmin: false,
    })
    expect(evaluatePortalAccess({ ...staff })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { write: true } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses everyone else', () => {
    expect(evaluatePortalAccess({ ...base, kind: 'none' })).toMatchObject({ ok: false, status: 403 })
  })
})
