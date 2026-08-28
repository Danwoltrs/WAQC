import { describe, it, expect } from 'vitest'
import { splitCommercialPayload, SUB_CONTRACT_OWNED_FIELDS } from './split-commercial-payload'

describe('splitCommercialPayload', () => {
  it('sends everything to the sample when the certificate is the mother cert', () => {
    const { contractPatch, samplePatch } = splitCommercialPayload(
      { bag_count: 320, origin: 'BR', quality_spec_id: 'q1' },
      null,
    )
    expect(contractPatch).toEqual({})
    expect(samplePatch).toEqual({ bag_count: 320, origin: 'BR', quality_spec_id: 'q1' })
  })

  it('routes the split-owned fields to the sub-contract and the shared ones to the mother', () => {
    const { contractPatch, samplePatch } = splitCommercialPayload(
      {
        bag_count: 20,
        bag_type: 'big_bag',
        bag_weight_kg: 1000,
        bags_quantity_mt: 20,
        equivalent_60kg_bags: 333,
        buyer_contract_nr: 'S049504-14',
        exporter_sample_number: '130307',
        shipment_month: '2026-10',
        // shared lab-unit fields
        quality_spec_id: 'q1',
        processing_method: 'natural',
        crop_year: '26/27',
        origin: 'BR',
      },
      'sub-1',
    )
    expect(contractPatch).toEqual({
      bag_count: 20,
      bag_type: 'big_bag',
      bag_weight_kg: 1000,
      bags_quantity_mt: 20,
      equivalent_60kg_bags: 333,
      buyer_contract_nr: 'S049504-14',
      exporter_sample_number: '130307',
      shipment_month: '2026-10',
    })
    expect(samplePatch).toEqual({
      quality_spec_id: 'q1',
      processing_method: 'natural',
      crop_year: '26/27',
      origin: 'BR',
    })
  })

  it('treats every quantity and reference column of sample_contracts as split-owned', () => {
    for (const f of [
      'bag_count', 'bag_weight_kg', 'bag_type', 'bags_quantity_mt', 'equivalent_60kg_bags',
      'wolthers_contract_nr', 'buyer_contract_nr', 'roaster_contract_nr', 'qc_client_contract_nr',
      'end_client_contract_nr', 'supplier_contract_nr', 'seller_contract_nr', 'shipper_contract_nr',
      'ico_number', 'container_nr', 'exporter_sample_number', 'shipment_month',
      'importer_id', 'importer_is_qc_client', 'roaster_id', 'end_client_id',
    ]) {
      expect(SUB_CONTRACT_OWNED_FIELDS.has(f)).toBe(true)
    }
    expect(SUB_CONTRACT_OWNED_FIELDS.has('quality_spec_id')).toBe(false)
    expect(SUB_CONTRACT_OWNED_FIELDS.has('client_id')).toBe(false)
  })
})
