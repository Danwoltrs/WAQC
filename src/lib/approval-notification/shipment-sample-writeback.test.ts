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
  it('falls back to the latest pss row when no waqc_ref match', () => {
    const rows = [
      r({ id: 'old', sample_type: 'pss', created_at: '2026-01-01T00:00:00Z' }),
      r({ id: 'new', sample_type: 'pss', created_at: '2026-05-01T00:00:00Z' }),
      r({ id: 'ss', sample_type: 'ss', created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(pickShipmentSampleMatch(rows, 'BR-036991/26')).toBe('new')
  })
  it('returns null when there are no rows', () => {
    expect(pickShipmentSampleMatch([], 'X')).toBeNull()
  })
})

describe('buildWritebackUpdate / buildWritebackInsert', () => {
  it('builds an approved update payload', () => {
    const p = buildWritebackUpdate({
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-03',
      certificateUrl: 'path/cert.pdf',
    })
    expect(p).toEqual({
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-03',
      certificate_url: 'path/cert.pdf',
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
