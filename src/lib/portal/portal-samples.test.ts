// src/lib/portal/portal-samples.test.ts
import { describe, expect, it } from 'vitest'
import { certificatePdfUrl, mapSampleRow, sampleSearchFilter } from './portal-samples'

const CO = '11111111-1111-4111-8111-111111111111'

describe('mapSampleRow', () => {
  it('names a certified sample by its certificate number and links the PDF by certificate id', () => {
    const row = mapSampleRow({
      id: 's1', tracking_number: 'SAN-00231/26', origin: 'Brazil', quality_name: 'GC17', sample_type: 'pss',
      workflow_stage: 'certified', status: 'approved', wolthers_contract_nr: '42089/26', buyer_contract_nr: 'B-77',
      container_nr: null, ico_number: null, exporter_sample_number: '144/26',
      certificates: [{ id: 'cert-1', certificate_number: 'SAG-011895/26' }],
    }, CO, true)
    expect(row).toEqual({
      id: 's1', label: 'SAG-011895/26', contract: '42089/26', buyerRef: 'B-77', origin: 'Brazil', quality: 'GC17',
      sampleType: 'pss', stage: 'certified', status: 'approved',
      certificateUrl: `/api/portal/certificates/cert-1/pdf?company=${CO}`,
    })
    expect(JSON.stringify(row)).not.toContain('SAN-')
  })

  it('names an uncertified sample by its own identifier, else by contract', () => {
    expect(mapSampleRow({ id: 's2', exporter_sample_number: '144/26', certificates: [] }, CO, true).label).toBe('SMP 144/26')
    expect(mapSampleRow({ id: 's3', wolthers_contract_nr: '42090/26', certificates: [] }, CO, true).label).toBe('Contract 42090/26')
    expect(mapSampleRow({ id: 's4', tracking_number: 'SAN-1/26', certificates: null }, CO, true).label).toBe('Sample')
    expect(mapSampleRow({ id: 's4', certificates: null }, CO, true).certificateUrl).toBeNull()
  })
})

describe('without qc_certificates', () => {
  it('withholds the PDF link but keeps the certificate number as the label', () => {
    const row = mapSampleRow({ id: 's6', certificates: [{ id: 'cert-1', certificate_number: 'SAG-011895/26' }] }, CO, false)
    expect(row.certificateUrl).toBeNull()
    expect(row.label).toBe('SAG-011895/26')
  })
})

describe('voided certificates', () => {
  it('are not offered', () => {
    const row = mapSampleRow({ id: 's5', wolthers_contract_nr: '1/26', certificates: [{ id: 'c', certificate_number: 'X-1/26', voided_at: '2026-01-01' }] }, CO, true)
    expect(row.certificateUrl).toBeNull()
    expect(row.label).toBe('Contract 1/26')
  })
})

describe('sampleSearchFilter', () => {
  it('searches contract, buyer ref, container, ICO and sample number, never the SAN', () => {
    expect(sampleSearchFilter(' 42089 ')).toBe(
      'wolthers_contract_nr.ilike.*42089*,buyer_contract_nr.ilike.*42089*,container_nr.ilike.*42089*,ico_number.ilike.*42089*,exporter_sample_number.ilike.*42089*',
    )
  })
  it('drops characters PostgREST would read as syntax, and empty searches', () => {
    expect(sampleSearchFilter('a,b(c)*%\\')).toContain('*abc*')
    expect(sampleSearchFilter('  ')).toBeNull()
  })
})

describe('certificatePdfUrl', () => {
  it('carries the company', () => {
    expect(certificatePdfUrl('c1', CO)).toBe(`/api/portal/certificates/c1/pdf?company=${CO}`)
  })
})
