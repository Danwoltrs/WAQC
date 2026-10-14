// src/lib/portal/portal-certificates.test.ts
import { describe, expect, it } from 'vitest'
import { mapCertRow } from './portal-certificates'

const CO = '11111111-1111-4111-8111-111111111111'

describe('mapCertRow', () => {
  it('shows the certificate number, the sample\'s own identifier and the contract, never the SAN', () => {
    const row = mapCertRow({
      id: 'cert-1', certificate_number: 'SAG-011895/26', is_rejected: false, created_at: '2026-10-01T10:00:00Z',
      samples: { tracking_number: 'SAN-00231/26', wolthers_contract_nr: '42089/26', container_nr: 'HASU 155.201-6', ico_number: null, exporter_sample_number: null },
    }, CO)
    expect(row).toEqual({
      id: 'cert-1', certificateNumber: 'SAG-011895/26', sample: 'CTR HASU 155.201-6', contract: '42089/26',
      status: 'approved', issuedDate: '2026-10-01T10:00:00Z', downloadUrl: `/api/portal/certificates/cert-1/pdf?company=${CO}`,
    })
    expect(JSON.stringify(row)).not.toContain('SAN-')
  })

  it('marks rejected certificates', () => {
    expect(mapCertRow({ id: 'c', certificate_number: 'R-SAG-1/26', is_rejected: true, samples: null }, CO)).toMatchObject({ status: 'rejected', sample: null, contract: null })
  })
})
