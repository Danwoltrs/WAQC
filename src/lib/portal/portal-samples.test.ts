// src/lib/portal/portal-samples.test.ts
import { describe, it, expect } from 'vitest'
import { mapSampleRow, portalSampleLabel, portalSampleReference, portalSampleSearchFilter } from './portal-samples'

const SAMPLE_ID = '0b4c3f1e-1111-2222-3333-444455556666'

describe('mapSampleRow', () => {
  it('maps a certified sample: reference from its own identifiers, link by sample id, certificate number shown', () => {
    const row = mapSampleRow({
      id: SAMPLE_ID, tracking_number: 'SAN-01234/26', origin: 'Brazil',
      quality_name: 'GC17', sample_type: 'ss', workflow_stage: 'certified', status: 'approved',
      container_nr: 'HASU 155.201-6', ico_number: '002/1649/0185',
      certificates: [{ id: 'c1', certificate_number: 'SAG-011895/26', created_at: '2026-10-01T00:00:00Z' }],
    })
    expect(row).toEqual({
      id: SAMPLE_ID, reference: 'HASU 155.201-6 · 002/1649/0185', origin: 'Brazil', quality: 'GC17',
      sampleType: 'ss', stage: 'certified', status: 'approved',
      certificateNumber: 'SAG-011895/26',
      certificateUrl: `/api/portal/certificate/${SAMPLE_ID}/pdf`,
    })
    expect(JSON.stringify(row)).not.toMatch(/SAN-/)
  })

  it('omits the certificate link for non-certified samples', () => {
    const row = mapSampleRow({
      id: 's2', tracking_number: 'SAN-00188/26', origin: 'Colombia',
      quality_name: 'EP', sample_type: 'pss', workflow_stage: 'analysis', status: 'received',
      exporter_sample_number: '144/26',
    })
    expect(row.certificateUrl).toBeNull()
    expect(row.reference).toBe('144/26')
  })

  it('never shows a legacy lab-number certificate', () => {
    const row = mapSampleRow({
      id: SAMPLE_ID, tracking_number: 'SAN-01234/26', sample_type: 'pss', workflow_stage: 'certified',
      buyer_contract_nr: 'P-5521',
      certificates: [{ id: 'c1', certificate_number: 'SAN-01234/26', created_at: '2026-01-01T00:00:00Z' }],
    })
    expect(row.certificateNumber).toBeNull()
    expect(row.reference).toBe('P-5521')
    expect(JSON.stringify(row)).not.toMatch(/SAN-/)
  })
})

describe('portalSampleReference', () => {
  it('falls back to the contract numbers, then a dash, never the lab number', () => {
    expect(portalSampleReference({ tracking_number: 'SAN-01234/26', wolthers_contract_nr: '41922/26' })).toBe('41922/26')
    expect(portalSampleReference({ tracking_number: 'SAN-01234/26' })).toBe('—')
  })
})

describe('portalSampleLabel', () => {
  it('uses the latest certificate number once issued', () => {
    expect(portalSampleLabel({
      exporter_sample_number: '144/26',
      certificates: [
        { id: 'old', certificate_number: 'SAG-000001/26', created_at: '2026-01-01' },
        { id: 'new', certificate_number: 'SAG-000002/26', created_at: '2026-02-01' },
      ],
    })).toBe('SAG-000002/26')
  })

  it('uses the tagged identifier without a certificate', () => {
    expect(portalSampleLabel({ tracking_number: 'SAN-01234/26', exporter_sample_number: '144/26' })).toBe('SMP 144/26')
  })
})

describe('portalSampleSearchFilter', () => {
  it('searches the lot identifiers and contract numbers, tracking_number kept for pasted lab numbers', () => {
    expect(portalSampleSearchFilter('155.201')).toBe([
      'container_nr.ilike.%155.201%',
      'ico_number.ilike.%155.201%',
      'exporter_sample_number.ilike.%155.201%',
      'wolthers_contract_nr.ilike.%155.201%',
      'buyer_contract_nr.ilike.%155.201%',
      'tracking_number.ilike.%155.201%',
    ].join(','))
  })

  it('drops characters that would break the filter grammar', () => {
    expect(portalSampleSearchFilter('a,b(c)')).not.toMatch(/[()]|a,b/)
    expect(portalSampleSearchFilter(' , ')).toBeNull()
  })
})
