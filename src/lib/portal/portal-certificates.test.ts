// src/lib/portal/portal-certificates.test.ts
import { describe, it, expect } from 'vitest'
import { mapCertRow } from './portal-certificates'

describe('mapCertRow', () => {
  it('maps an approved certificate with a PDF download url', () => {
    const row = mapCertRow({
      id: 'c1',
      certificate_number: 'BD-036991/26',
      is_rejected: false,
      created_at: '2026-05-10T12:00:00Z',
      sample: { tracking_number: 'BD-036991/26', client_id: 'client-uuid', end_client_id: null, deleted_at: null },
    })
    expect(row).toEqual({
      id: 'c1',
      certificateNumber: 'BD-036991/26',
      trackingNumber: 'BD-036991/26',
      status: 'approved',
      issuedDate: '2026-05-10T12:00:00Z',
      downloadUrl: '/api/certificate/BD-036991_26/pdf',
    })
  })

  it('maps a rejected certificate with a PDF download url', () => {
    const row = mapCertRow({
      id: 'c2',
      certificate_number: 'BD-036992/26',
      is_rejected: true,
      created_at: '2026-05-11T09:00:00Z',
      sample: { tracking_number: 'BD-036992/26', client_id: 'client-uuid', end_client_id: null, deleted_at: null },
    })
    expect(row).toEqual({
      id: 'c2',
      certificateNumber: 'BD-036992/26',
      trackingNumber: 'BD-036992/26',
      status: 'rejected',
      issuedDate: '2026-05-11T09:00:00Z',
      downloadUrl: '/api/certificate/BD-036992_26/pdf',
    })
  })
})
