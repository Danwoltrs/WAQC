import { describe, it, expect } from 'vitest'
import {
  parseBagType,
  companyLegalName,
  companyDisplayName,
  mapContractToFormData,
  mapContractToSubContract,
  mapContractToSampleEdit,
  contractSellerDiffers,
  sellerRefIsImporterRef,
  SELLER_REF_IS_IMPORTER_REF_WARNING,
  isStaleContractLink,
  isContractPrefillComplete,
  linkedPartyIds,
  toSelectedContract,
  normalizeCertifications,
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
  resolved_quality_spec_id: null,
  quality_match: null,
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
  it('a blank fantasy name is treated as missing, never shown as an empty label', () => {
    expect(companyDisplayName(company({ id: 'x', fantasy_name: '   ', name: 'Only Legal' }))).toBe('Only Legal')
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

describe('mapContractToFormData — quality spec prefill', () => {
  it('sets quality_spec_id and marks it prefilled when the resolver matched a spec', () => {
    const c = baseContract({ quality_description: 'NY 2/3 17/18 FC' })
    const resolution: ContractResolution = {
      ...baseResolution,
      resolved_quality_spec_id: 'spec-123',
      quality_match: {
        matched: true,
        spec_id: 'spec-123',
        spec_label: '17/18 FC',
        source_text: 'NY 2/3 17/18 FC',
        confidence: 'high',
      },
    }
    const { patch, prefilled } = mapContractToFormData(c, resolution)
    expect(patch.quality_spec_id).toBe('spec-123')
    expect(prefilled).toContain('quality_spec_id')
    // Free-text quality_name is still set as before.
    expect(patch.quality_name).toBe('NY 2/3 17/18 FC')
  })

  it('does not set quality_spec_id when there is no confident match', () => {
    const c = baseContract({ quality_description: 'NY 2/3 17/18 FC' })
    const { patch, prefilled } = mapContractToFormData(c, baseResolution)
    expect(patch.quality_spec_id).toBeUndefined()
    expect(prefilled).not.toContain('quality_spec_id')
  })
})

describe('normalizeCertifications', () => {
  it('maps short codes to canonical names', () => {
    expect(normalizeCertifications(['ra', 'ft', 'flo', 'organic', 'eudr'])).toEqual(
      ['Rainforest Alliance', 'Fair Trade', 'FLO Fair Trade', 'Organic', 'EUDR'],
    )
  })
  it('normalizes hyphens/spaces/case', () => {
    expect(normalizeCertifications(['Fair-Trade', 'fair trade', 'RFA'])).toEqual(['Fair Trade', 'Rainforest Alliance'])
  })
  it('passes through already-canonical values', () => {
    expect(normalizeCertifications(['Organic', 'EUDR'])).toEqual(['Organic', 'EUDR'])
  })
  it('drops unknown codes', () => {
    expect(normalizeCertifications(['organic', 'totally-made-up'])).toEqual(['Organic'])
  })
  it('returns [] for a non-array', () => {
    expect(normalizeCertifications(null)).toEqual([])
    expect(normalizeCertifications('organic')).toEqual([])
  })
})

// A contract added to a lot (a sibling) fills only what that contract owns on
// sys: the link, its buyer, both references, end client, quantity, shipment.
describe('mapContractToSubContract', () => {
  const contract = baseContract({
    id: 'contract-41923', contract_number: '41923/26',
    seller_reference: 'S664243-13', buyer_reference: 'IR0007621-1',
    end_buyer_id: 'end-1', end_buyer: company({ id: 'end-1', fantasy_name: "Dunkin'", name: 'Dunkin Brands' }),
  })

  it("fills the link, buyer, both references, end client, quantity and shipment month", () => {
    const patch = mapContractToSubContract(contract, { ...baseResolution, importer_is_qc_client: true })
    expect(patch).toEqual({
      contract_id: 'contract-41923',
      importer: 'Floriana',
      importer_is_qc_client: true,
      buyer_contract_nr: 'IR0007621-1',
      supplier_contract_nr: 'S664243-13',
      end_client: "Dunkin'",
      bag_type: 'jute_bag',
      bag_count: '440',
      shipment_month: '2026-06',
    })
  })

  it('leaves out what the contract does not carry, so a blank never wipes a typed value', () => {
    const patch = mapContractToSubContract(
      baseContract({ volume_bags: null, bag_type: null, shipment_period_start: null }),
      baseResolution,
    )
    expect(patch).toEqual({ contract_id: 'c1', importer: 'Floriana', importer_is_qc_client: false })
  })

  it('never sets a bag count on a bulk contract (containers are entered)', () => {
    const patch = mapContractToSubContract(baseContract({ bag_type: 'Bulk', volume_bags: 720 }), baseResolution)
    expect(patch.bag_type).toBe('bulk')
    expect(patch).not.toHaveProperty('bag_count')
  })

  it('keeps the QC-client flag alone when the host locks it', () => {
    const patch = mapContractToSubContract(contract, { ...baseResolution, importer_is_qc_client: true }, { keepQcClient: true })
    expect(patch).not.toHaveProperty('importer_is_qc_client')
  })
})

// A contract picked in the sample editor (2026-09-25): staff duplicate a
// sample, then type one number (Wolthers nr, seller ref or buyer ref) and pick
// the contract. The QC client never changes: it picks the certificate-number
// line, and a contract's buyer is not always the QC client.
describe('mapContractToSampleEdit', () => {
  const contract = baseContract({
    id: 'contract-41923', contract_number: '41923/26',
    seller_reference: 'S664243-13', buyer_reference: 'IR0007621-1',
    end_buyer_id: 'end-1', end_buyer: company({ id: 'end-1', fantasy_name: "Dunkin'", name: 'Dunkin Brands' }),
  })
  const sample = { client_id: 'c-dunkin', seller_id: 'seller-old' }

  it('fills the number, both refs, buyer, end client, shipment month, seller and shipper on a sample that stands alone', () => {
    const { fields, sellerKept } = mapContractToSampleEdit(contract, sample, { standalone: true })
    expect(fields).toEqual({
      wolthers_contract_nr: '41923/26',
      seller_contract_nr: 'S664243-13',
      buyer_contract_nr: 'IR0007621-1',
      importer_id: 'buyer-1',
      importer_is_qc_client: false,
      end_client_id: 'end-1',
      shipment_month: '2026-06',
      seller_id: 'seller-1',
      exporter_id: 'seller-1',
      same_seller_shipper: true,
    })
    expect(sellerKept).toBeNull()
  })

  it('prints a split member by its letter', () => {
    const { fields } = mapContractToSampleEdit(
      baseContract({ contract_number: '42089/26', split_suffix: 'C' }), sample, { standalone: true },
    )
    expect(fields.wolthers_contract_nr).toBe('42089/26C')
  })

  it('takes a distinct shipper as the exporter, and a placeholder shipper as the seller', () => {
    const distinct = mapContractToSampleEdit(
      baseContract({ shipper_id: 'ship-1', shipper: company({ id: 'ship-1', name: 'Exportadora Y' }) }),
      sample, { standalone: true },
    ).fields
    expect(distinct).toMatchObject({ seller_id: 'seller-1', exporter_id: 'ship-1', same_seller_shipper: false })
    const tbi = mapContractToSampleEdit(
      baseContract({ shipper_id: 'ship-tbi', shipper: company({ id: 'ship-tbi', name: 'T.B.I.' }) }),
      sample, { standalone: true },
    ).fields
    expect(tbi).toMatchObject({ seller_id: 'seller-1', exporter_id: 'seller-1', same_seller_shipper: true })
  })

  it('marks the importer as the QC client only when the buyer is the QC client', () => {
    const { fields } = mapContractToSampleEdit(contract, { ...sample, client_id: 'buyer-1' }, { standalone: true })
    expect(fields).toMatchObject({ importer_id: 'buyer-1', importer_is_qc_client: true })
    expect(fields).not.toHaveProperty('client_id')
  })

  it('leaves out what the contract does not carry, so a blank on sys never wipes a value', () => {
    const { fields } = mapContractToSampleEdit(
      baseContract({ shipment_period_start: null, seller_id: null, seller: null }), sample, { standalone: true },
    )
    expect(fields).toEqual({
      wolthers_contract_nr: '41762/26',
      importer_id: 'buyer-1',
      importer_is_qc_client: false,
    })
  })

  it("keeps a lot's seller and shipper when the lot has other contracts, naming the contract's seller when it differs", () => {
    const { fields, sellerKept } = mapContractToSampleEdit(contract, sample, { standalone: false })
    expect(fields).not.toHaveProperty('seller_id')
    expect(fields).not.toHaveProperty('exporter_id')
    expect(fields).not.toHaveProperty('same_seller_shipper')
    expect(fields).toMatchObject({ wolthers_contract_nr: '41923/26', importer_id: 'buyer-1', seller_contract_nr: 'S664243-13' })
    expect(sellerKept).toBe('Carpec')
    expect(mapContractToSampleEdit(contract, { ...sample, seller_id: 'seller-1' }, { standalone: false }).sellerKept).toBeNull()
  })
})

describe('contractSellerDiffers', () => {
  it("is null when the lot's seller is the contract's, by legal or trade name", () => {
    expect(contractSellerDiffers(baseContract({}), 'Carpec')).toBeNull()
    expect(contractSellerDiffers(baseContract({}), ' cooperativa dos produtores x ltda ')).toBeNull()
  })

  it("names the contract's seller when it differs", () => {
    expect(contractSellerDiffers(baseContract({}), 'Louis Dreyfus Company')).toBe('Carpec')
  })

  it('is null when either side is unknown', () => {
    expect(contractSellerDiffers(baseContract({ seller: null }), 'Carpec')).toBeNull()
    expect(contractSellerDiffers(baseContract({}), '')).toBeNull()
  })
})

// A seller ref equal to the importer ref is almost always one ref typed into
// both boxes (OFI sells to OFI, so both boxes sit next to "OFI"). Flagged,
// never blocked: the user may know better.
describe('sellerRefIsImporterRef', () => {
  it('is true for the same ref, ignoring case and surrounding spaces', () => {
    expect(sellerRefIsImporterRef('S049504-12', 'S049504-12')).toBe(true)
    expect(sellerRefIsImporterRef(' s049504-12', 'S049504-12 ')).toBe(true)
  })

  it('is false for different refs, or when either box is blank', () => {
    expect(sellerRefIsImporterRef('S664243-12', 'S049504-12')).toBe(false)
    expect(sellerRefIsImporterRef('', '')).toBe(false)
    expect(sellerRefIsImporterRef('  ', '  ')).toBe(false)
    expect(sellerRefIsImporterRef('S049504-12', '')).toBe(false)
    expect(sellerRefIsImporterRef(null, undefined)).toBe(false)
  })

  it('words the warning for both boxes', () => {
    expect(SELLER_REF_IS_IMPORTER_REF_WARNING).toBe('Seller ref and importer ref are the same. Each belongs in its own box.')
  })
})

// The sample's link must follow the typed number: sys resolves contract_id
// before the number, so a link left behind by a corrected number would file
// the sample on the wrong contract.
describe('isStaleContractLink', () => {
  it('is false with no linked contract', () => {
    expect(isStaleContractLink('41923/26', null)).toBe(false)
  })

  it('is false while the number still reads as the linked one', () => {
    expect(isStaleContractLink(' 41923/26 ', '41923/26')).toBe(false)
  })

  it('is true once the number is changed to another one', () => {
    expect(isStaleContractLink('41923/2', '41923/26')).toBe(true)
    expect(isStaleContractLink('41924/26', '41923/26')).toBe(true)
  })

  it('is false for a blank number: a contract picked in Step 1 before any number was typed stays linked', () => {
    expect(isStaleContractLink('', '41923/26')).toBe(false)
    expect(isStaleContractLink('   ', '41923/26')).toBe(false)
  })
})

// A Step-1 contract pick carries EVERYTHING the intake needs through the wizard
// in the form state: the Wolthers number (restored 2026-09-17 for the contract
// path, as 2026-09-16 did for the PSS path — the number now sits in a visible
// field that searches as you type, and a corrected number drops the link at
// submit), and the parties' company ids so no later step re-derives them from a
// name that may not be in a dropdown.
describe('mapContractToFormData — the Wolthers contract number', () => {
  it('fills the number from the contract and tracks it as prefilled', () => {
    const { patch, prefilled } = mapContractToFormData(baseContract({}), baseResolution)
    expect(patch.wolthers_contract_nr).toBe('41762/26')
    expect(prefilled).toContain('wolthers_contract_nr')
  })

  it('prints a split child with its suffix after the year, as the family rows do', () => {
    const { patch } = mapContractToFormData(baseContract({ contract_number: '42089/26', split_suffix: 'B' }), baseResolution)
    expect(patch.wolthers_contract_nr).toBe('42089/26B')
  })
})

describe('toSelectedContract — party ids travel with the link', () => {
  it('carries each party company id, its legal name and the split suffix', () => {
    const sc = toSelectedContract(baseContract({
      contract_number: '42089/26', split_suffix: 'B',
      shipper_id: 'shipper-1',
      shipper: company({ id: 'shipper-1', fantasy_name: 'Cooxupé', name: 'Cooperativa Regional Cooxupé' }),
    }))
    expect(sc.seller_id).toBe('seller-1')
    expect(sc.seller_legal_name).toBe('Cooperativa dos Produtores X Ltda')
    expect(sc.seller_name).toBe('Carpec')
    expect(sc.shipper_id).toBe('shipper-1')
    expect(sc.shipper_legal_name).toBe('Cooperativa Regional Cooxupé')
    expect(sc.buyer_id).toBe('buyer-1')
    expect(sc.buyer_legal_name).toBe('Floriana Impex Limited')
    expect(sc.split_suffix).toBe('B')
  })

  it('leaves absent parties null', () => {
    const sc = toSelectedContract(baseContract({ seller_id: null, seller: null, shipper_id: null }))
    expect(sc.seller_id).toBeNull()
    expect(sc.seller_legal_name).toBeNull()
    expect(sc.shipper_id).toBeNull()
  })
})

describe('isStaleContractLink — split suffix', () => {
  it('reads the suffixed display number as the linked contract', () => {
    expect(isStaleContractLink('42089/26B', '42089/26', 'B')).toBe(false)
    expect(isStaleContractLink('42089/26', '42089/26', 'B')).toBe(false)
  })
  it('still drops the link for another number', () => {
    expect(isStaleContractLink('42089/26C', '42089/26', 'B')).toBe(true)
  })
})

describe('isContractPrefillComplete', () => {
  const complete = {
    seller: 'Ipanema Agrícola S.A.', same_seller_shipper: true, shipper: '',
    importer: 'Blaser', seller_contract_nr: '027/26', importer_contract_nr: '107048',
    wolthers_contract_nr: '42611/26',
  }
  it('is complete with seller, both references, importer and the Wolthers number', () => {
    expect(isContractPrefillComplete(complete)).toBe(true)
  })
  it('needs the shipper only when it is not the seller', () => {
    expect(isContractPrefillComplete({ ...complete, same_seller_shipper: false, shipper: '' })).toBe(false)
    expect(isContractPrefillComplete({ ...complete, same_seller_shipper: false, shipper: 'Cooxupé' })).toBe(true)
  })
  it.each([
    ['seller'], ['importer'], ['seller_contract_nr'], ['importer_contract_nr'], ['wolthers_contract_nr'],
  ] as const)('is incomplete without %s', (key) => {
    expect(isContractPrefillComplete({ ...complete, [key]: '  ' })).toBe(false)
  })
})

describe('linkedPartyIds', () => {
  const linked = toSelectedContract(baseContract({
    shipper_id: 'shipper-1',
    shipper: company({ id: 'shipper-1', fantasy_name: 'Cooxupé', name: 'Cooperativa Regional Cooxupé' }),
  }))
  const form = {
    selected_contract: linked,
    seller: 'Cooperativa dos Produtores X Ltda', same_seller_shipper: false,
    shipper: 'Cooperativa Regional Cooxupé', importer: 'Floriana',
  }

  it('resolves seller, shipper and importer by id while the names still read as the contract\'s', () => {
    expect(linkedPartyIds(form)).toEqual({ seller_id: 'seller-1', exporter_id: 'shipper-1', importer_id: 'buyer-1' })
  })

  it('matches the trade name as well as the legal name, ignoring case and spacing', () => {
    expect(linkedPartyIds({ ...form, seller: ' carpec ', importer: 'floriana impex limited' })).toMatchObject({
      seller_id: 'seller-1', importer_id: 'buyer-1',
    })
  })

  it('the shipper is the seller when =Shipper is ticked', () => {
    expect(linkedPartyIds({ ...form, same_seller_shipper: true, shipper: '' }).exporter_id).toBe('seller-1')
  })

  it('leaves a party null once the user changed its name, so the name lookup runs instead', () => {
    expect(linkedPartyIds({ ...form, seller: 'Another Exporter Ltda' })).toMatchObject({ seller_id: null, exporter_id: 'shipper-1' })
    expect(linkedPartyIds({ ...form, importer: 'Someone Else' }).importer_id).toBeNull()
  })

  it('is all null without a linked contract', () => {
    expect(linkedPartyIds({ ...form, selected_contract: null })).toEqual({ seller_id: null, exporter_id: null, importer_id: null })
  })
})
