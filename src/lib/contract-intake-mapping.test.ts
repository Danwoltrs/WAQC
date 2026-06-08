import { describe, it, expect } from 'vitest'
import {
  parseBagType,
  companyLegalName,
  companyDisplayName,
  mapContractToFormData,
  type ContractWithParties,
  type ContractResolution,
  type ContractCompany,
} from './contract-intake-mapping'

const company = (over: Partial<ContractCompany> & { id: string }): ContractCompany => ({
  fantasy_name: null,
  name: null,
  ...over,
})

const baseResolution: ContractResolution = {
  resolved_client_id: null,
  importer_is_qc_client: false,
  resolved_importer_id: null,
  candidate_seller_exporter_ids: [],
  candidate_shipper_exporter_ids: [],
  multiple_seller_matches: false,
  multiple_shipper_matches: false,
}

const baseContract = (over: Partial<ContractWithParties>): ContractWithParties => ({
  id: 'c1',
  contract_number: '41762/26',
  status: 'active',
  contract_date: null,
  crop: '2025/2026',
  volume_bags: 440,
  bag_type: 'BAGS OF 60 KG EACH',
  bag_weight_kg: 60,
  quality_description: 'NY 2, 17/18',
  shipment_period_start: '2026-06-01',
  shipment_period_end: null,
  seller_reference: null,
  buyer_reference: null,
  certifications: null,
  seller_id: 'seller-1',
  buyer_id: 'buyer-1',
  shipper_id: null,
  end_buyer_id: null,
  seller: company({ id: 'seller-1', fantasy_name: 'Carpec', name: 'Cooperativa dos Produtores X Ltda' }),
  buyer: company({ id: 'buyer-1', fantasy_name: 'Floriana', name: 'Floriana Impex Limited' }),
  shipper: null,
  end_buyer: null,
  ...over,
})

const patchOf = (c: ContractWithParties, r: ContractResolution = baseResolution) =>
  mapContractToFormData(c, r).patch

describe('parseBagType', () => {
  it('maps explicit materials', () => {
    expect(parseBagType('60kg Jute')).toBe('jute_bag')
    expect(parseBagType('PP Bag')).toBe('pp_bag')
    expect(parseBagType('Polypropylene')).toBe('pp_bag')
    expect(parseBagType('Big Bag')).toBe('big_bag')
    expect(parseBagType('Bulk')).toBe('bulk')
  })

  it('falls back to jute for generic bag wording (the sys.wolthers.com case)', () => {
    expect(parseBagType('BAGS OF 60 KG EACH')).toBe('jute_bag')
    expect(parseBagType('60 kg bag')).toBe('jute_bag')
    expect(parseBagType('sacks')).toBe('jute_bag')
  })

  it('does not let the generic fallback swallow pp/big/bulk', () => {
    expect(parseBagType('PP bags of 60 kg')).toBe('pp_bag')
    expect(parseBagType('Big bags')).toBe('big_bag')
    expect(parseBagType('Bulk container bags')).toBe('bulk')
  })

  it('returns empty for null/unknown', () => {
    expect(parseBagType(null)).toBe('')
    expect(parseBagType(undefined)).toBe('')
    expect(parseBagType('something else')).toBe('')
  })
})

describe('companyLegalName / companyDisplayName', () => {
  const c = company({ id: 'x', fantasy_name: 'Carpec', name: 'Cooperativa Ltda' })
  it('legal name prefers name, display name prefers fantasy', () => {
    expect(companyLegalName(c)).toBe('Cooperativa Ltda')
    expect(companyDisplayName(c)).toBe('Carpec')
  })
  it('each falls back to the other when one is missing', () => {
    expect(companyLegalName(company({ id: 'x', fantasy_name: 'Only Fantasy', name: null }))).toBe('Only Fantasy')
    expect(companyDisplayName(company({ id: 'x', fantasy_name: null, name: 'Only Legal' }))).toBe('Only Legal')
  })
})

describe('mapContractToFormData — seller and bag type', () => {
  it('fills seller with the legal name (matches dropdown value + DB lookup)', () => {
    const patch = patchOf(baseContract({}))
    expect(patch.seller).toBe('Cooperativa dos Produtores X Ltda')
  })

  it('prefills bag type + weight + count from a generic-bag contract', () => {
    const patch = patchOf(baseContract({}))
    expect(patch.bag_type).toBe('jute_bag')
    expect(patch.bag_weight_kg).toBe('60')
    expect(patch.bag_count).toBe('440')
  })

  it('skips bag_count for bulk contracts', () => {
    const patch = patchOf(baseContract({ bag_type: 'Bulk', volume_bags: 100 }))
    expect(patch.bag_type).toBe('bulk')
    expect(patch.bag_count).toBeUndefined()
  })
})

describe('mapContractToFormData — smart =Shipper rule', () => {
  it('checks =Shipper when there is no shipper', () => {
    const patch = patchOf(baseContract({ shipper_id: null, shipper: null }))
    expect(patch.same_seller_shipper).toBe(true)
    expect(patch.shipper).toBeUndefined()
  })

  it('checks =Shipper when shipper equals seller', () => {
    const patch = patchOf(baseContract({ shipper_id: 'seller-1', shipper: baseContract({}).seller }))
    expect(patch.same_seller_shipper).toBe(true)
    expect(patch.shipper).toBeUndefined()
  })

  it('treats a placeholder shipper (T.B.I.) as same-as-seller', () => {
    const patch = patchOf(baseContract({
      shipper_id: 'shipper-tbi',
      shipper: company({ id: 'shipper-tbi', name: 'T.B.I.' }),
    }))
    expect(patch.same_seller_shipper).toBe(true)
    expect(patch.shipper).toBeUndefined()
  })

  it('treats other placeholders (TBN, To Be Nominated, -) as same-as-seller', () => {
    for (const name of ['TBN', 'To Be Nominated', '-', 'n/a']) {
      const patch = patchOf(baseContract({
        shipper_id: 'shipper-x',
        shipper: company({ id: 'shipper-x', name }),
      }))
      expect(patch.same_seller_shipper, name).toBe(true)
      expect(patch.shipper, name).toBeUndefined()
    }
  })

  it('keeps a genuine distinct shipper and unchecks =Shipper (legal name)', () => {
    const patch = patchOf(baseContract({
      shipper_id: 'shipper-real',
      shipper: company({ id: 'shipper-real', fantasy_name: 'Cooxupe', name: 'Cooperativa Regional de Cafeicultores em Guaxupe Ltda' }),
    }))
    expect(patch.same_seller_shipper).toBe(false)
    expect(patch.shipper).toBe('Cooperativa Regional de Cafeicultores em Guaxupe Ltda')
  })
})
