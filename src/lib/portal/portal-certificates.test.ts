// src/lib/portal/portal-certificates.test.ts
import { describe, it, expect } from 'vitest'
import { mapCertRow } from './portal-certificates'

const SAMPLE_ID = '0b4c3f1e-1111-2222-3333-444455556666'

describe('mapCertRow', () => {
  it('maps an approved certificate: lot reference, download by sample id', () => {
    const row = mapCertRow({
      id: 'c1',
      certificate_number: 'BD-036991/26',
      is_rejected: false,
      created_at: '2026-05-10T12:00:00Z',
      sample: {
        id: SAMPLE_ID, tracking_number: 'SAN-01234/26', client_id: 'client-uuid', end_client_id: null, deleted_at: null,
        sample_type: 'pss', exporter_sample_number: '144/26',
      },
    })
    expect(row).toEqual({
      id: 'c1',
      certificateNumber: 'BD-036991/26',
      reference: '144/26',
      status: 'approved',
      issuedDate: '2026-05-10T12:00:00Z',
      downloadUrl: `/api/portal/certificate/${SAMPLE_ID}/pdf`,
    })
    expect(JSON.stringify(row)).not.toMatch(/SAN-/)
  })

  it('maps a rejected certificate with a container reference', () => {
    const row = mapCertRow({
      id: 'c2',
      certificate_number: 'R-BD-036992/26',
      is_rejected: true,
      created_at: '2026-05-11T09:00:00Z',
      sample: { id: SAMPLE_ID, client_id: 'client-uuid', end_client_id: null, deleted_at: null, sample_type: 'ss', container_nr: 'HASU 155.201-6' },
    })
    expect(row.status).toBe('rejected')
    expect(row.reference).toBe('HASU 155.201-6')
    expect(row.downloadUrl).toBe(`/api/portal/certificate/${SAMPLE_ID}/pdf`)
  })

  it('hides a legacy certificate numbered with the lab number and names the lot by its contract', () => {
    const row = mapCertRow({
      id: 'c3',
      certificate_number: 'SAN-01234/26',
      is_rejected: false,
      created_at: '2026-01-11T09:00:00Z',
      sample: { id: SAMPLE_ID, tracking_number: 'SAN-01234/26', buyer_contract_nr: 'P-5521' },
    })
    expect(row.certificateNumber).toBeNull()
    expect(row.reference).toBe('P-5521')
    expect(JSON.stringify(row)).not.toMatch(/SAN-/)
  })
})
