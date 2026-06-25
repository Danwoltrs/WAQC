import { describe, it, expect } from 'vitest'
import {
  selectShipmentSampleTargets,
  buildRejectionReason,
  buildWritebackUpdate,
  buildWritebackInsert,
  type ShipmentSampleRow,
} from './shipment-sample-writeback'

const r = (over: Partial<ShipmentSampleRow>): ShipmentSampleRow => ({
  id: 'id1',
  waqc_ref: null,
  sample_type: 'pss',
  group_id: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('selectShipmentSampleTargets — PSS', () => {
  it('prefers an exact waqc_ref match', () => {
    const rows = [r({ id: 'a', waqc_ref: 'OTHER' }), r({ id: 'b', waqc_ref: 'BR-036991/26' })]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: ['b'], insert: false })
  })
  it('updates EVERY row already claimed under our ref (idempotent group resend)', () => {
    const rows = [
      r({ id: 'l1', waqc_ref: 'SAN-00081/26', group_id: 'g1' }),
      r({ id: 'l2', waqc_ref: 'SAN-00081/26', group_id: 'g1' }),
      r({ id: 'other', waqc_ref: 'ELSE/26' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00081/26')).toEqual({
      updateIds: ['l1', 'l2'],
      insert: false,
    })
  })
  it('claims a single unclaimed PSS placeholder when no waqc_ref match', () => {
    const rows = [
      r({ id: 'pss', sample_type: 'pss', waqc_ref: null }),
      r({ id: 'ss', sample_type: 'ss', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: ['pss'], insert: false })
  })
  it('claims ALL leaves of a single container-split group (the core fix)', () => {
    // Real Ahold shape: one "per sub" group, two unclaimed per-container leaves.
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: null }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00081/26')).toEqual({
      updateIds: ['slot1', 'slot2'],
      insert: false,
    })
  })
  it('does NOT phantom-insert when unclaimed group leaves exist (old bug)', () => {
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: null }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00081/26').insert).toBe(false)
  })
  it('skips (no insert, no clobber) when two distinct groups are ambiguous', () => {
    const rows = [
      r({ id: 'a', group_id: 'g1', waqc_ref: null }),
      r({ id: 'b', group_id: 'g2', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'X/26')).toEqual({ updateIds: [], insert: false })
  })
  it('skips when multiple standalone placeholders are ambiguous', () => {
    const rows = [
      r({ id: 'a', sample_type: 'pss', waqc_ref: null }),
      r({ id: 'b', sample_type: 'pss', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: [], insert: false })
  })
  it('never overwrites a PSS row that already has a different waqc_ref (skips)', () => {
    const rows = [r({ id: 'a', sample_type: 'pss', waqc_ref: 'SOMEONE-ELSE/26' })]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: [], insert: false })
  })
  it('inserts a fresh row when the contract has no PSS row at all', () => {
    expect(selectShipmentSampleTargets([], 'X')).toEqual({ updateIds: [], insert: true })
  })
  it('SELF-HEALS: a phantom standalone carrying our ref no longer blocks the real leaves', () => {
    // Exact mirror of the broken Ahold 42067 record: two unclaimed real leaves
    // plus the phantom standalone a prior buggy run inserted under our ref.
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: null }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: null }),
      r({ id: 'phantom', group_id: null, waqc_ref: 'SAN-00081/26' }),
    ]
    const t = selectShipmentSampleTargets(rows, 'SAN-00081/26')
    expect(t.insert).toBe(false)
    expect([...t.updateIds].sort()).toEqual(['phantom', 'slot1', 'slot2'])
  })
  it('re-completes a container-split group that grew after the first claim', () => {
    // We already hold slot1/slot2 under our ref; sys later added slot3 (unclaimed).
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: 'SAN-00081/26' }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: 'SAN-00081/26' }),
      r({ id: 'slot3', group_id: 'g1', waqc_ref: null }),
    ]
    const t = selectShipmentSampleTargets(rows, 'SAN-00081/26')
    expect(t.insert).toBe(false)
    expect([...t.updateIds].sort()).toEqual(['slot1', 'slot2', 'slot3'])
  })
})

describe('selectShipmentSampleTargets — SS sample type', () => {
  it('matches an existing SS row by exact waqc_ref, ignoring the PSS row', () => {
    const rows = [
      r({ id: 'pss', sample_type: 'pss', waqc_ref: 'OLD-PSS/26' }),
      r({ id: 'ss', sample_type: 'ss', waqc_ref: 'SAN-00060/26' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: ['ss'], insert: false })
  })
  it('never claims a PSS placeholder for an SS decision (→ insert a new SS row)', () => {
    const rows = [r({ id: 'pss', sample_type: 'pss', waqc_ref: null })]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: [], insert: true })
  })
  it('does not hijack a PSS row that happens to share the waqc_ref', () => {
    const rows = [r({ id: 'pss', sample_type: 'pss', waqc_ref: 'SAN-00060/26' })]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: [], insert: true })
  })
  it('inserts a distinct SS row even when other claimed SS rows exist', () => {
    const rows = [r({ id: 'ss-other', sample_type: 'ss', waqc_ref: 'OTHER-SS/26' })]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: [], insert: true })
  })
})

describe('buildRejectionReason', () => {
  it('prefixes a cup-only reason with CUP:', () => {
    expect(buildRejectionReason({ cuppingComment: '1 COPO SUJO' })).toBe('CUP: 1 COPO SUJO')
  })
  it('prefixes a green-only reason with GREEN:', () => {
    expect(buildRejectionReason({ gradingComment: 'screen out of spec' })).toBe('GREEN: screen out of spec')
  })
  it('joins both stages when both carry a note', () => {
    expect(buildRejectionReason({ cuppingComment: '1 COPO SUJO', gradingComment: 'PVA high' })).toBe(
      'CUP: 1 COPO SUJO | GREEN: PVA high',
    )
  })
  it('returns null when neither comment is present', () => {
    expect(buildRejectionReason({ cuppingComment: '  ', gradingComment: null })).toBeNull()
  })
})

describe('buildWritebackInsert / buildWritebackUpdate — SS marked QC', () => {
  it('inserts a distinct ss row tagged source=qc', () => {
    const p = buildWritebackInsert({
      contractId: 'k1',
      waqcRef: 'SAN-00060/26',
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-24',
      certificateUrl: null,
      sampleType: 'ss',
      source: 'qc',
    })
    expect(p).toEqual({
      contract_id: 'k1',
      sample_type: 'ss',
      source: 'qc',
      waqc_ref: 'SAN-00060/26',
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-24',
      certificate_url: null,
      created_by: 'u1',
    })
  })
  it('marks an existing row source=qc on update when provided', () => {
    const p = buildWritebackUpdate({
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-24',
      certificateUrl: null,
      waqcRef: 'SAN-00060/26',
      source: 'qc',
    })
    expect(p).toEqual({
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-24',
      certificate_url: null,
      waqc_ref: 'SAN-00060/26',
      source: 'qc',
    })
  })
})

describe('buildWritebackUpdate / buildWritebackInsert', () => {
  it('builds an approved update payload', () => {
    const p = buildWritebackUpdate({
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-03',
      certificateUrl: 'path/cert.pdf',
      waqcRef: 'BR-036991/26',
    })
    expect(p).toEqual({
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-03',
      certificate_url: 'path/cert.pdf',
      waqc_ref: 'BR-036991/26',
    })
  })
  it('builds an insert payload with contract link and waqc_ref', () => {
    const p = buildWritebackInsert({
      contractId: 'k1',
      waqcRef: 'BR-036991/26',
      decision: 'rejected',
      userId: 'u1',
      today: '2026-06-03',
      certificateUrl: null,
    })
    expect(p).toEqual({
      contract_id: 'k1',
      sample_type: 'pss',
      waqc_ref: 'BR-036991/26',
      status: 'rejected',
      approved_by: 'u1',
      approved_date: '2026-06-03',
      certificate_url: null,
      created_by: 'u1',
    })
  })
})
