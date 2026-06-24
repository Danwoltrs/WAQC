import { describe, it, expect } from 'vitest'
import {
  pickShipmentSampleMatch,
  buildWritebackUpdate,
  buildWritebackInsert,
  type ShipmentSampleRow,
} from './shipment-sample-writeback'

const r = (over: Partial<ShipmentSampleRow>): ShipmentSampleRow => ({
  id: 'id1',
  waqc_ref: null,
  sample_type: 'pss',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('pickShipmentSampleMatch', () => {
  it('prefers an exact waqc_ref match', () => {
    const rows = [r({ id: 'a', waqc_ref: 'OTHER' }), r({ id: 'b', waqc_ref: 'BR-036991/26' })]
    expect(pickShipmentSampleMatch(rows, 'BR-036991/26')).toBe('b')
  })
  it('claims a single unclaimed PSS placeholder when no waqc_ref match', () => {
    const rows = [
      r({ id: 'pss', sample_type: 'pss', waqc_ref: null }),
      r({ id: 'ss', sample_type: 'ss', waqc_ref: null }),
    ]
    expect(pickShipmentSampleMatch(rows, 'BR-036991/26')).toBe('pss')
  })
  it('returns null (→ insert) when multiple PSS rows are ambiguous', () => {
    const rows = [
      r({ id: 'a', sample_type: 'pss', waqc_ref: null }),
      r({ id: 'b', sample_type: 'pss', waqc_ref: null }),
    ]
    expect(pickShipmentSampleMatch(rows, 'BR-036991/26')).toBeNull()
  })
  it('never overwrites a PSS row that already has a different waqc_ref', () => {
    const rows = [r({ id: 'a', sample_type: 'pss', waqc_ref: 'SOMEONE-ELSE/26' })]
    expect(pickShipmentSampleMatch(rows, 'BR-036991/26')).toBeNull()
  })
  it('returns null when there are no rows', () => {
    expect(pickShipmentSampleMatch([], 'X')).toBeNull()
  })
})

describe('pickShipmentSampleMatch — SS sample type', () => {
  it('matches an existing SS row by exact waqc_ref, ignoring the PSS row', () => {
    const rows = [
      r({ id: 'pss', sample_type: 'pss', waqc_ref: 'OLD-PSS/26' }),
      r({ id: 'ss', sample_type: 'ss', waqc_ref: 'SAN-00060/26' }),
    ]
    expect(pickShipmentSampleMatch(rows, 'SAN-00060/26', 'ss')).toBe('ss')
  })
  it('never claims a PSS placeholder for an SS decision (→ insert a new SS row)', () => {
    const rows = [r({ id: 'pss', sample_type: 'pss', waqc_ref: null })]
    expect(pickShipmentSampleMatch(rows, 'SAN-00060/26', 'ss')).toBeNull()
  })
  it('does not hijack a PSS row that happens to share the waqc_ref', () => {
    const rows = [r({ id: 'pss', sample_type: 'pss', waqc_ref: 'SAN-00060/26' })]
    expect(pickShipmentSampleMatch(rows, 'SAN-00060/26', 'ss')).toBeNull()
  })
  it('returns null when the contract has no SS row yet', () => {
    const rows = [r({ id: 'pss', sample_type: 'pss', waqc_ref: 'X' })]
    expect(pickShipmentSampleMatch(rows, 'SAN-00060/26', 'ss')).toBeNull()
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
