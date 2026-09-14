import { describe, it, expect } from 'vitest'
import { resolveCertificateParties, type SampleCounterparties } from './certificate-parties'
import type { ContractContext } from './contract-resolver'

// SAN-00921/26 (prod 2026-09-14): an Ahold SS lot registered without a Wolthers
// contract. Its certificate could not be sent at all — every send surface found
// the buyer and seller only through the sys contract, and there was none.
const unlinkedAholdLot: SampleCounterparties = {
  client_id: 'ahold',
  importer_id: 'ahold',
  seller_id: 'ldc-suisse',
  exporter_id: 'dreyfus',
  wolthers_contract_nr: null,
  buyer_contract_nr: 'IR0007621-1',
  seller_contract_nr: null,
}

const contract41923: ContractContext = {
  contractId: 'contract-41923',
  buyerId: 'contract-buyer',
  sellerId: 'contract-seller',
  buyerReference: 'B-REF-1',
  sellerReference: 'S030103',
  contractNumber: '41923/26',
}

describe('resolveCertificateParties', () => {
  it('names the QC client and the seller when the sample links no sys contract', () => {
    expect(resolveCertificateParties(unlinkedAholdLot, null)).toEqual({
      contractId: null,
      buyerId: 'ahold',
      sellerId: 'ldc-suisse',
      buyerReference: 'IR0007621-1',
      sellerReference: null,
      contractNumber: null,
    })
  })

  // Dunkin lots never have a Wolthers contract, and their importer is a trading
  // house (Coffee America, OFI) — the certificate is issued for Dunkin.
  it('sends the buyer side to the QC client, not the importer', () => {
    const dunkinLot = { ...unlinkedAholdLot, client_id: 'dunkin', importer_id: 'coffee-america' }
    expect(resolveCertificateParties(dunkinLot, null).buyerId).toBe('dunkin')
  })

  it('falls back to the importer and the exporter when the sample has no QC client or seller', () => {
    const sparse = {
      ...unlinkedAholdLot,
      client_id: null,
      importer_id: 'importer-1',
      seller_id: null,
      exporter_id: 'exporter-1',
    }
    const parties = resolveCertificateParties(sparse, null)
    expect(parties.buyerId).toBe('importer-1')
    expect(parties.sellerId).toBe('exporter-1')
  })

  it('lets a resolved sys contract decide the parties and references', () => {
    expect(resolveCertificateParties(unlinkedAholdLot, contract41923)).toEqual({
      contractId: 'contract-41923',
      buyerId: 'contract-buyer',
      sellerId: 'contract-seller',
      buyerReference: 'B-REF-1',
      sellerReference: 'S030103',
      contractNumber: '41923/26',
    })
  })

  it('fills a party or reference the contract leaves blank from the sample itself', () => {
    const partial: ContractContext = {
      ...contract41923,
      buyerId: null,
      buyerReference: '  ',
      sellerReference: null,
    }
    const sample = { ...unlinkedAholdLot, seller_contract_nr: 'LDC-778' }
    expect(resolveCertificateParties(sample, partial)).toEqual({
      contractId: 'contract-41923',
      buyerId: 'ahold',
      sellerId: 'contract-seller',
      buyerReference: 'IR0007621-1',
      sellerReference: 'LDC-778',
      contractNumber: '41923/26',
    })
  })

  it('keeps the contract number the sample recorded when no contract row resolved', () => {
    const numbered = { ...unlinkedAholdLot, wolthers_contract_nr: '41923/26' }
    expect(resolveCertificateParties(numbered, null).contractNumber).toBe('41923/26')
  })
})
