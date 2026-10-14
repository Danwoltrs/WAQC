// src/lib/portal/staff-gate.test.ts
import { describe, expect, it } from 'vitest'
import { canManageClientPortal } from './staff-gate'

describe('canManageClientPortal', () => {
  it('admins, quality admins and lab admins', () => {
    expect(canManageClientPortal({ qc_role: 'global_admin', is_global_admin: true })).toBe(true)
    expect(canManageClientPortal({ qc_role: 'global_quality_admin', is_global_admin: true })).toBe(true)
    expect(canManageClientPortal({ qc_role: 'lab_quality_manager', is_global_admin: false })).toBe(true)
    expect(canManageClientPortal({ qc_role: 'lab_personnel', is_global_admin: false })).toBe(false)
    expect(canManageClientPortal({ qc_role: 'client', is_global_admin: false })).toBe(false)
    expect(canManageClientPortal(null)).toBe(false)
  })
})
