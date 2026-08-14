import { describe, it, expect } from 'vitest'
import { mapPssToFormData, mapSubContractOverride } from './pss-intake-mapping'

const basePss = {
  id: 'pss-1',
  tracking_number: 'BR-036991/26',
  seller_name: 'Louis Dreyfus Company',
  exporter_name: 'COOXUPE',
  importer_name: 'Acme Importers',
  roaster_name: 'Best Roast',
  qc_client_name: 'Acme Importers',
  end_client_name: "Dunkin'",
  same_seller_shipper: false,
  importer_is_qc_client: true,
  client_id: 'client-1',
  seller_contract_nr: 'S-100',
  shipper_contract_nr: 'SH-100',
  exporter_contract_nr: 'EX-100',
  buyer_contract_nr: 'B-100',
  roaster_contract_nr: 'R-100',
  qc_client_contract_nr: 'QC-100',
  end_client_contract_nr: 'EC-100',
  wolthers_contract_nr: '41966',
  exporter_sample_number: 'EXP-77',
  ico_number: '123456789',
  container_nr: null,
  quality_spec_id: 'spec-1',
  quality_name: 'Fine Cup NY2/3',
  origin: 'Brazil',
  micro_origin: 'Sul de Minas',
  processing_method: 'Natural',
  certifications: ['Rainforest Alliance', 'Organic'],
  crop_year: '25/26',
  bag_type: 'jute_bag',
  bag_weight_kg: 60,
  bag_count: 320,
  bags_quantity_mt: 19.2,
  equivalent_60kg_bags: 320,
  shipment_month: '2026-07',
}

describe('mapPssToFormData', () => {
  it('maps the full shared field set onto the SS form', () => {
    const { patch } = mapPssToFormData(basePss)
    expect(patch.seller).toBe('Louis Dreyfus Company')
    expect(patch.importer).toBe('Acme Importers')
    expect(patch.end_client).toBe("Dunkin'")
    expect(patch.roaster).toBe('Best Roast')
    expect(patch.seller_contract_nr).toBe('S-100')
    expect(patch.importer_contract_nr).toBe('B-100') // buyer_contract_nr -> importer_contract_nr
    expect(patch.wolthers_contract_nr).toBe('41966')
    expect(patch.quality_spec_id).toBe('spec-1')
    expect(patch.quality_name).toBe('Fine Cup NY2/3')
    expect(patch.origin).toBe('Brazil')
    expect(patch.certifications).toEqual(['Rainforest Alliance', 'Organic'])
    expect(patch.crop_year).toBe('25/26')
    expect(patch.bag_type).toBe('jute_bag')
    expect(patch.bag_count).toBe('320')
    expect(patch.bag_weight_kg).toBe('60')
  })

  it('sets a distinct shipper when same_seller_shipper is false', () => {
    const { patch } = mapPssToFormData(basePss)
    expect(patch.same_seller_shipper).toBe(false)
    expect(patch.shipper).toBe('COOXUPE')
  })

  it('omits shipper and uses =shipper when same_seller_shipper is true', () => {
    const { patch } = mapPssToFormData({ ...basePss, same_seller_shipper: true })
    expect(patch.same_seller_shipper).toBe(true)
    expect(patch.shipper).toBeUndefined()
  })

  it('sets qc_client only when importer is not the QC client', () => {
    const noQc = mapPssToFormData(basePss)
    expect(noQc.patch.qc_client).toBeUndefined()
    const withQc = mapPssToFormData({ ...basePss, importer_is_qc_client: false, qc_client_name: 'Separate QC' })
    expect(withQc.patch.importer_is_qc_client).toBe(false)
    expect(withQc.patch.qc_client).toBe('Separate QC')
  })

  it('skips bag_count for bulk', () => {
    const { patch } = mapPssToFormData({ ...basePss, bag_type: 'bulk' })
    expect(patch.bag_type).toBe('bulk')
    expect(patch.bag_count).toBeUndefined()
  })

  it('does not list empty/missing fields as prefilled', () => {
    const sparse = { id: 'x', tracking_number: 'T', origin: 'Peru' }
    const { patch, prefilled } = mapPssToFormData(sparse)
    expect(patch.origin).toBe('Peru')
    expect(prefilled).toContain('origin')
    expect(prefilled).not.toContain('seller')
    expect(prefilled).not.toContain('ico_number')
  })

  it('uses legal name (seller_legal_name) for seller/shipper when it differs from fantasy', () => {
    // Companies with a fantasy name that differs from their legal name.
    // The GET /api/samples response sets seller_legal_name = companies.name (legal),
    // seller_name = fantasy-preferring. The mapper must use the legal name so the
    // dropdown and submit-time ilike lookup against companies.name resolves correctly.
    const pssWithLegal = {
      ...basePss,
      seller_name: 'LDC Fantasy',      // fantasy-preferring (what basePss would show)
      seller_legal_name: 'Louis Dreyfus Company Brasil S.A.', // companies.name (legal)
      exporter_name: 'COOXUPE Fantasy',
      exporter_legal_name: 'Cooperativa dos Cafeicultores da Zona de Três Pontas Ltda',
      same_seller_shipper: false,
    }
    const { patch } = mapPssToFormData(pssWithLegal)
    expect(patch.seller).toBe('Louis Dreyfus Company Brasil S.A.')
    expect(patch.shipper).toBe('Cooperativa dos Cafeicultores da Zona de Três Pontas Ltda')
    // Importer must STILL use the display/fantasy name (not changed by this fix)
    expect(patch.importer).toBe('Acme Importers')
  })

  it('falls back to seller_name/exporter_name when no legal name field is present', () => {
    // Simulates older data or a PSS fetched without the legal_name fields
    // (e.g. unit-test objects that only populate the flattened *_name fields).
    const pssNoLegal = {
      ...basePss,
      seller_legal_name: undefined,
      exporter_legal_name: undefined,
      same_seller_shipper: false,
    }
    const { patch } = mapPssToFormData(pssNoLegal)
    expect(patch.seller).toBe('Louis Dreyfus Company')
    expect(patch.shipper).toBe('COOXUPE')
  })
})

describe('mapSubContractOverride', () => {
  const sub = {
    id: 'sc-1',
    tracking_number: 'BR-036995/26',
    certificate_number: 'BR-036995/26',
    importer_name: 'Leaf Importer',
    roaster_name: 'Leaf Roaster',
    end_client_name: 'Leaf End Client',
    qc_client_name: 'Leaf QC',
    buyer_contract_nr: 'LB-1',
    wolthers_contract_nr: '40995/26',
    roaster_contract_nr: 'LR-1',
    end_client_contract_nr: 'LEC-1',
    qc_client_contract_nr: 'LQC-1',
    supplier_contract_nr: 'LSUP-1',
    ico_number: '999888777',
    container_nr: 'LEAFU7654321',
    bags_quantity_mt: 6.0,
  }

  it('overrides the per-leaf counterparty and quantity fields', () => {
    const { patch, prefilled } = mapSubContractOverride(sub)
    expect(patch.importer).toBe('Leaf Importer')
    expect(patch.roaster).toBe('Leaf Roaster')
    expect(patch.end_client).toBe('Leaf End Client')
    expect(patch.importer_contract_nr).toBe('LB-1') // buyer_contract_nr -> importer_contract_nr
    expect(patch.roaster_contract_nr).toBe('LR-1')
    expect(patch.wolthers_contract_nr).toBe('40995/26')
    expect(patch.ico_number).toBe('999888777')
    expect(patch.container_nr).toBe('LEAFU7654321')
    expect(patch.bags_quantity_mt).toBe('6')
    expect(prefilled).toContain('importer')
    expect(prefilled).toContain('bags_quantity_mt')
  })

  it('does not list empty/missing leaf fields as prefilled', () => {
    const { patch, prefilled } = mapSubContractOverride({ id: 'sc-2', importer_name: 'Only Importer' })
    expect(patch.importer).toBe('Only Importer')
    expect(prefilled).toEqual(['importer'])
    expect(patch.roaster).toBeUndefined()
    expect(patch.container_nr).toBeUndefined()
  })

  // The leaf carries its OWN quantity, not a share of the mother's. Taking the
  // tonnage from the leaf but leaving the bag count on the mother printed a
  // contradiction on the SS: 1800 bags weighing 21.6 MT.
  it('overrides the whole quantity block, not just the tonnage', () => {
    const { patch, prefilled } = mapSubContractOverride({
      ...sub,
      bag_count: 360,
      bag_weight_kg: 60,
      bag_type: 'jute_bag',
      equivalent_60kg_bags: 360,
      shipment_month: '2026-09',
    })
    expect(patch.bag_count).toBe('360')
    expect(patch.bag_weight_kg).toBe('60')
    expect(patch.bag_type).toBe('jute_bag')
    expect(patch.equivalent_60kg_bags).toBe('360')
    expect(patch.shipment_month).toBe('2026-09')
    expect(prefilled).toContain('bag_count')
  })

  it('skips bag_count for a bulk leaf', () => {
    const { patch } = mapSubContractOverride({ ...sub, bag_type: 'bulk', bag_count: 0, equivalent_60kg_bags: 320 })
    expect(patch.bag_type).toBe('bulk')
    expect(patch.equivalent_60kg_bags).toBe('320')
    expect(patch.bag_count).toBeUndefined()
  })

  it("overrides the exporter's sample number when the leaf has its own", () => {
    const { patch } = mapSubContractOverride({ ...sub, exporter_sample_number: 'CCT-2214/26-B' })
    expect(patch.exporter_sample_number).toBe('CCT-2214/26-B')
  })

  // The QC client drives the certificate sequence, so a split sold to a
  // different QC client must not inherit the mother's.
  it('overrides the QC client id and the importer_is_qc_client flag', () => {
    const { patch, prefilled } = mapSubContractOverride({
      ...sub,
      client_id: 'company-leaf',
      importer_is_qc_client: false,
    })
    expect(patch.client_id).toBe('company-leaf')
    expect(patch.importer_is_qc_client).toBe(false)
    expect(prefilled).toContain('importer_is_qc_client')
  })

  it('leaves the importer_is_qc_client flag on the mother when the leaf omits it', () => {
    const { patch, prefilled } = mapSubContractOverride({ id: 'sc-3', importer_name: 'Only Importer' })
    expect(patch.importer_is_qc_client).toBeUndefined()
    expect(prefilled).not.toContain('importer_is_qc_client')
  })
})
