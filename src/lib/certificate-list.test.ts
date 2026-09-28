import { describe, it, expect } from 'vitest'
import { certificateDecision, clientContractRef, qualityLine, sampleTypeTag } from './certificate-list'

describe('clientContractRef', () => {
  it('is the buyer ref when the importer is the QC client', () => {
    expect(clientContractRef({ client_id: 'blaser', importer_id: 'blaser', importer_is_qc_client: true, buyer_contract_nr: '106761', qc_client_contract_nr: 'Q-1' }))
      .toBe('106761')
  })

  it('is the end client\'s ref when the QC client is the end client', () => {
    expect(clientContractRef({
      client_id: 'dunkin', end_client_id: 'dunkin', importer_id: 'ofi', importer_is_qc_client: false,
      buyer_contract_nr: 'S049504-13', end_client_contract_nr: 'DD-77',
    })).toBe('DD-77')
  })

  it('is the roaster\'s ref when the QC client is the roaster', () => {
    expect(clientContractRef({ client_id: 'ahold', roaster_id: 'ahold', importer_id: 'rothfos', buyer_contract_nr: 'R-1', roaster_contract_nr: 'IR0007621-1' }))
      .toBe('IR0007621-1')
  })

  it('is the QC client\'s own slot otherwise, falling back to the buyer\'s', () => {
    expect(clientContractRef({ client_id: 'x', importer_id: 'y', qc_client_contract_nr: 'Q-3', buyer_contract_nr: 'B-1' })).toBe('Q-3')
    expect(clientContractRef({ client_id: 'x', importer_id: 'y', buyer_contract_nr: 'B-1' })).toBe('B-1')
    expect(clientContractRef({ client_id: 'x' })).toBeNull()
    expect(clientContractRef(null)).toBeNull()
  })
})

describe('qualityLine', () => {
  it('prefers the registered quality, then the spec name, then its template', () => {
    expect(qualityLine({ quality_name: '14/16 FC', quality_spec: { custom_name: 'Blaser 14/16' } })).toBe('14/16 FC')
    expect(qualityLine({ quality_name: ' ', quality_spec: { custom_name: 'Blaser 14/16' } })).toBe('Blaser 14/16')
    expect(qualityLine({ quality_spec: { custom_name: null, template: { name: 'NY 2/3 Fine Cup' } } })).toBe('NY 2/3 Fine Cup')
    expect(qualityLine({})).toBeNull()
  })
})

describe('certificateDecision', () => {
  it('reads approved and rejected issued certificates, and nothing else', () => {
    expect(certificateDecision({ status: 'issued', is_rejected: false })).toBe('approved')
    expect(certificateDecision({ status: 'issued', is_rejected: true })).toBe('rejected')
    expect(certificateDecision({ status: 'issued', is_rejected: null, sample: { workflow_stage: 'rejected' } })).toBe('rejected')
    expect(certificateDecision({ status: 'draft', is_rejected: true })).toBe('other')
  })
})

describe('sampleTypeTag', () => {
  it('shortens the sample types', () => {
    expect(sampleTypeTag('pss')).toBe('PSS')
    expect(sampleTypeTag('SS')).toBe('SS')
    expect(sampleTypeTag('type')).toBe('Type')
    expect(sampleTypeTag(null)).toBeNull()
  })
})
