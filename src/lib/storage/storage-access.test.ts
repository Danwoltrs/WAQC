import { describe, it, expect } from 'vitest'
import { canAssignLabZones, canEditLabStorage, canViewLabStorage } from './storage-access'

const LAB = 'lab-santos'

describe('lab storage access', () => {
  it('lets every internal user of the lab, and global roles, view', () => {
    expect(canViewLabStorage({ qc_role: 'lab_personnel', laboratory_id: LAB }, LAB)).toBe(true)
    expect(canViewLabStorage({ qc_role: 'lab_personnel', laboratory_id: 'other' }, LAB)).toBe(false)
    expect(canViewLabStorage({ qc_role: 'global_finance_admin', laboratory_id: null }, LAB)).toBe(true)
    expect(canViewLabStorage({ qc_role: 'client', laboratory_id: LAB }, LAB)).toBe(false)
    expect(canViewLabStorage(null, LAB)).toBe(false)
  })

  it('lets only admins, global quality admins and that lab quality manager edit', () => {
    expect(canEditLabStorage({ is_global_admin: true }, LAB)).toBe(true)
    expect(canEditLabStorage({ qc_role: 'global_quality_admin' }, LAB)).toBe(true)
    expect(canEditLabStorage({ qc_role: 'lab_quality_manager', laboratory_id: LAB }, LAB)).toBe(true)
    expect(canEditLabStorage({ qc_role: 'lab_quality_manager', laboratory_id: 'other' }, LAB)).toBe(false)
    expect(canEditLabStorage({ qc_role: 'lab_personnel', laboratory_id: LAB }, LAB)).toBe(false)
  })

  it('lets everyone who works in the lab assign zones, and nobody outside it', () => {
    expect(canAssignLabZones({ qc_role: 'lab_personnel', laboratory_id: LAB }, LAB)).toBe(true)
    expect(canAssignLabZones({ qc_role: 'global_quality_admin', laboratory_id: null }, LAB)).toBe(true)
    expect(canAssignLabZones({ qc_role: 'lab_personnel', laboratory_id: 'other' }, LAB)).toBe(false)
    expect(canAssignLabZones({ qc_role: 'client', laboratory_id: LAB }, LAB)).toBe(false)
  })
})
