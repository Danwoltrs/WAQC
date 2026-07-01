import { describe, it, expect } from 'vitest'
import { resolveSupplyRefs } from './certificate-supply-refs'

describe('resolveSupplyRefs', () => {
  const mother = {
    seller_contract_nr: '4155261663',
    shipper_contract_nr: 'SHIP-MOTHER',
    exporter_sample_number: 'AS-MOTHER',
  }

  it('uses mother sample values when no split contract is given', () => {
    expect(resolveSupplyRefs({ sample: mother })).toEqual({
      sellerContract: '4155261663',
      shipperContract: 'SHIP-MOTHER',
      exporterSampleNumber: 'AS-MOTHER',
    })
  })

  it("prefers the split's supplier_contract_nr for the seller/Ecom reference", () => {
    const refs = resolveSupplyRefs({
      sample: mother,
      contract: { supplier_contract_nr: '4155261514' },
    })
    expect(refs.sellerContract).toBe('4155261514')
  })

  it('prefers seller_contract_nr on the split when supplier_contract_nr is blank', () => {
    const refs = resolveSupplyRefs({
      sample: mother,
      contract: { supplier_contract_nr: '  ', seller_contract_nr: 'SPLIT-SELLER' },
    })
    expect(refs.sellerContract).toBe('SPLIT-SELLER')
  })

  it('falls back to the mother seller ref when the split leaves supply fields blank', () => {
    const refs = resolveSupplyRefs({
      sample: mother,
      contract: { supplier_contract_nr: null, seller_contract_nr: '', shipper_contract_nr: null },
    })
    expect(refs.sellerContract).toBe('4155261663')
    expect(refs.shipperContract).toBe('SHIP-MOTHER')
    expect(refs.exporterSampleNumber).toBe('AS-MOTHER')
  })

  it('takes the split shipper ref and split sample number when present', () => {
    const refs = resolveSupplyRefs({
      sample: mother,
      contract: {
        supplier_contract_nr: '4155261514',
        shipper_contract_nr: 'SHIP-SPLIT',
        exporter_sample_number: 'AS-SPLIT',
      },
    })
    expect(refs).toEqual({
      sellerContract: '4155261514',
      shipperContract: 'SHIP-SPLIT',
      exporterSampleNumber: 'AS-SPLIT',
    })
  })

  it('returns nulls when nothing is set anywhere', () => {
    expect(resolveSupplyRefs({ sample: {} })).toEqual({
      sellerContract: null,
      shipperContract: null,
      exporterSampleNumber: null,
    })
  })
})
