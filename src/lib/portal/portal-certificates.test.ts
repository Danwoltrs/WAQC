import { describe, expect, it } from 'vitest'
import { certificatePdfUrl, factToCertRow, matchCertSearch } from './portal-certificates'
import type { PortalCertFact } from './portal-facts'

const CO = '11111111-1111-4111-8111-111111111111'
const fact: PortalCertFact = {
  id: 'cert-1', certificateNumber: 'SAG-011895/26', contractRef: '42089/26', issuedAt: '2026-10-01T10:00:00Z',
  type: 'ss', rejected: false, violations: [], origin: 'Brazil', lab: 'Santos lab', seller: 'Seller', importer: 'I',
  roaster: 'R', quality: 'GC17', crop: '25/26', containerNr: 'MSNU 123', mt: 1, labSampleId: 's',
}

describe('factToCertRow', () => {
  it('maps the fact to a row with type, origin, quality, seller, crop and the download link', () => {
    expect(factToCertRow(fact, CO)).toEqual({
      id: 'cert-1', certificateNumber: 'SAG-011895/26', contract: '42089/26', origin: 'Brazil', quality: 'GC17',
      seller: 'Seller', type: 'SS', crop: '25/26', status: 'approved', issuedDate: '2026-10-01T10:00:00Z',
      downloadUrl: `/api/portal/certificates/cert-1/pdf?company=${CO}`,
    })
  })
  it('marks rejected and keeps a null number null', () => {
    expect(factToCertRow({ ...fact, rejected: true, certificateNumber: null }, CO)).toMatchObject({ status: 'rejected', certificateNumber: null })
  })
})

describe('matchCertSearch', () => {
  it('matches contract, certificate and container; empty matches all', () => {
    expect(matchCertSearch(fact, '')).toBe(true)
    expect(matchCertSearch(fact, ' 42089 ')).toBe(true)
    expect(matchCertSearch(fact, 'sag-0118')).toBe(true)
    expect(matchCertSearch(fact, 'msnu')).toBe(true)
    expect(matchCertSearch(fact, 'zzz')).toBe(false)
    expect(matchCertSearch({ ...fact, containerNr: null, certificateNumber: null }, 'null')).toBe(false)
  })
})

describe('certificatePdfUrl', () => {
  it('carries the company', () => {
    expect(certificatePdfUrl('c1', CO)).toBe(`/api/portal/certificates/c1/pdf?company=${CO}`)
  })
})
