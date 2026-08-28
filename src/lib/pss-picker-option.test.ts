import { describe, it, expect } from 'vitest'
import { buildPssPickerOption, buildPssPickerOptions, pssOfficialRef, resolvePssSelection, siblingAsSample } from './pss-picker-option'

// Mirrors the flattened PSS shape returned by GET /api/samples. A real person
// references an approved PSS by its certificate number, contract number, the
// exporter's sample number, or the supplier — never the internal SAN lab number.
const basePss = {
  id: 'pss-1',
  // Internal lab number — must stay findable but never lead the display.
  tracking_number: 'SAN-00042/26',
  certificate_id: 'cert-1',
  certificate_number: 'BR-036991/26',
  seller_name: 'Comexim', // fantasy name (API already prefers fantasy)
  exporter_name: 'Comexim Exportadora',
  importer_name: 'Acme Importers',
  roaster_name: 'Best Roast',
  qc_client_name: 'Dunkin',
  end_client_name: 'Dunkin',
  supplier: 'Fazenda Santa Rita',
  origin: 'Brazil',
  quality_name: 'Fine Cup NY2/3',
  wolthers_contract_nr: '42250/26',
  seller_contract_nr: 'S-100',
  shipper_contract_nr: 'SH-100',
  exporter_contract_nr: 'EX-100',
  buyer_contract_nr: 'B-100',
  roaster_contract_nr: 'R-100',
  qc_client_contract_nr: 'QC-100',
  end_client_contract_nr: 'EC-100',
  supplier_contract_nr: 'SUP-100',
  exporter_sample_number: 'COEXP327',
  ico_number: '123456789',
  container_nr: 'MSCU1234567',
}

describe('buildPssPickerOption', () => {
  it('uses the sample id as the option value', () => {
    expect(buildPssPickerOption(basePss).value).toBe('pss-1')
  })

  it('leads the label with the official certificate number, then supplier and origin', () => {
    expect(buildPssPickerOption(basePss).label).toBe('BR-036991/26 · Comexim · Brazil')
  })

  it('never shows the internal SAN tracking number in the label when better refs exist', () => {
    expect(buildPssPickerOption(basePss).label).not.toContain('SAN-00042/26')
  })

  it('falls back to container > ICO > exporter sample > tracking when no certificate', () => {
    const noCert = { ...basePss, certificate_id: null, certificate_number: null }
    expect(buildPssPickerOption(noCert).label).toBe('MSCU1234567 · Comexim · Brazil')

    const noContainer = { ...noCert, container_nr: null }
    expect(buildPssPickerOption(noContainer).label).toBe('123456789 · Comexim · Brazil')

    const noIco = { ...noContainer, ico_number: null }
    expect(buildPssPickerOption(noIco).label).toBe('COEXP327 · Comexim · Brazil')

    const nothing = { ...noIco, exporter_sample_number: null }
    expect(buildPssPickerOption(nothing).label).toBe('SAN-00042/26 · Comexim · Brazil')
  })

  it('ignores certificate_number when certificate_id is absent', () => {
    const orphanCert = { ...basePss, certificate_id: null, container_nr: null, ico_number: null, exporter_sample_number: null }
    expect(buildPssPickerOption(orphanCert).label).toBe('SAN-00042/26 · Comexim · Brazil')
  })

  it('uses the fantasy seller name, falling back to exporter name', () => {
    const noSeller = { ...basePss, seller_name: null }
    expect(buildPssPickerOption(noSeller).label).toBe('BR-036991/26 · Comexim Exportadora · Brazil')
  })

  it('makes the certificate number, all contract numbers, exporter sample number, and ICO searchable', () => {
    const { keywords } = buildPssPickerOption(basePss)
    expect(keywords).toContain('BR-036991/26')
    expect(keywords).toContain('42250/26')
    expect(keywords).toContain('S-100')
    expect(keywords).toContain('B-100')
    expect(keywords).toContain('EX-100')
    expect(keywords).toContain('COEXP327')
    expect(keywords).toContain('123456789')
    expect(keywords).toContain('MSCU1234567')
  })

  it('keeps the internal SAN tracking number searchable even though it is hidden', () => {
    expect(buildPssPickerOption(basePss).keywords).toContain('SAN-00042/26')
  })

  it('makes supplier, exporter, importer names and origin searchable', () => {
    const { keywords } = buildPssPickerOption(basePss)
    expect(keywords).toContain('Comexim')
    expect(keywords).toContain('Comexim Exportadora')
    expect(keywords).toContain('Acme Importers')
    expect(keywords).toContain('Brazil')
    expect(keywords).toContain('Fazenda Santa Rita')
  })

  it('exposes the official reference for the linked badge (cert number, never SAN)', () => {
    expect(pssOfficialRef(basePss)).toBe('BR-036991/26')
    const noCert = { ...basePss, certificate_id: null, certificate_number: null }
    expect(pssOfficialRef(noCert)).toBe('MSCU1234567')
    const bare = { ...noCert, container_nr: null, ico_number: null, exporter_sample_number: null }
    expect(pssOfficialRef(bare)).toBe('SAN-00042/26')
  })

  it('excludes null/undefined/empty values from keywords', () => {
    const sparse = {
      id: 'pss-2',
      tracking_number: 'SAN-00099/26',
      certificate_id: null,
      certificate_number: null,
      seller_name: null,
      exporter_name: null,
      origin: 'Colombia',
      wolthers_contract_nr: '',
    }
    const { keywords } = buildPssPickerOption(sparse)
    expect(keywords).not.toContain(null)
    expect(keywords).not.toContain(undefined)
    expect(keywords).not.toContain('')
    expect(keywords).toContain('SAN-00099/26')
    expect(keywords).toContain('Colombia')
  })
})

// A lab unit with two contract siblings, as GET /api/samples lists them: the
// lab unit is the flattened sample row and `sub_contracts` carries each
// sibling's OWN commercial fields (a sibling is a sample in its own right,
// keyed by its own sample id). Shared fields (seller, quality, origin) are not
// repeated on the sibling rows.
const labUnitWithSiblings = {
  ...basePss,
  id: 'pss-1',
  origin: 'Brazil',
  contract_count: 2,
  sub_contracts: [
    {
      id: 'sib-9',
      tracking_number: 'SAN-00700/26',
      contract_ordinal: 2,
      has_certificate: true,
      certificate_id: 'cert-9',
      certificate_number: 'BR-036995/26',
      importer_name: 'Leaf Importer',
      roaster_name: 'Leaf Roaster',
      end_client_name: null,
      qc_client_name: 'Dunkin',
      client_id: 'client-1',
      importer_is_qc_client: false,
      buyer_contract_nr: 'LB-1',
      wolthers_contract_nr: '40995/26',
      roaster_contract_nr: null,
      end_client_contract_nr: null,
      qc_client_contract_nr: null,
      supplier_contract_nr: 'LSUP-1',
      ico_number: '999888777',
      container_nr: 'LEAFU7654321',
      exporter_sample_number: 'COEXP328',
      bag_count: 20,
      bag_weight_kg: 1000,
      bag_type: 'big_bag',
      bags_quantity_mt: 20,
      equivalent_60kg_bags: 333,
      container_count: null,
      shipment_month: '2026-09',
      status: 'approved',
      workflow_stage: 'certified',
    },
    {
      id: 'sib-10',
      tracking_number: 'SAN-00701/26',
      contract_ordinal: 3,
      has_certificate: false,
      certificate_id: null,
      certificate_number: null,
      importer_name: 'Second Leaf Importer',
      roaster_name: null,
      container_nr: null,
      ico_number: null,
      exporter_sample_number: null,
    },
  ],
}

describe('siblingAsSample', () => {
  const sibling = siblingAsSample(labUnitWithSiblings, labUnitWithSiblings.sub_contracts[0])

  it('is the sibling itself: its own id, lab number, certificate and buy side', () => {
    expect(sibling.id).toBe('sib-9')
    expect(sibling.tracking_number).toBe('SAN-00700/26')
    expect(sibling.certificate_id).toBe('cert-9')
    expect(sibling.certificate_number).toBe('BR-036995/26')
    expect(sibling.importer_name).toBe('Leaf Importer')
    expect(sibling.buyer_contract_nr).toBe('LB-1')
    expect(sibling.wolthers_contract_nr).toBe('40995/26')
    expect(sibling.contract_ordinal).toBe(2)
  })

  it('carries its own quantity, not the lab unit\'s', () => {
    expect(sibling.bag_type).toBe('big_bag')
    expect(sibling.bag_count).toBe(20)
    expect(sibling.bag_weight_kg).toBe(1000)
    expect(sibling.bags_quantity_mt).toBe(20)
  })

  it('inherits the lot the group shares: seller, shipper, quality, origin', () => {
    expect(sibling.seller_name).toBe('Comexim')
    expect(sibling.exporter_name).toBe('Comexim Exportadora')
    expect(sibling.origin).toBe('Brazil')
    expect(sibling.quality_name).toBe('Fine Cup NY2/3')
    expect(sibling.seller_contract_nr).toBe('S-100')
    expect(sibling.shipper_contract_nr).toBe('SH-100')
    expect(sibling.exporter_contract_nr).toBe('EX-100')
  })

  it('points at its lab unit and never looks like it has siblings of its own', () => {
    expect(sibling.lab_source_sample_id).toBe('pss-1')
    expect(sibling.sub_contracts).toEqual([])
    // Kept from the lab unit so a badge can say "contract 2 of 3".
    expect(sibling.contract_count).toBe(2)
  })

  it('keeps a blank of its own blank instead of borrowing the lab unit\'s value', () => {
    // A sibling owns its buy side outright: no roaster on the contract means
    // no roaster, even though the lab unit sells contract #1 to one.
    const second = siblingAsSample(labUnitWithSiblings, labUnitWithSiblings.sub_contracts[1])
    expect(second.roaster_name).toBeNull()
    expect(second.certificate_number).toBeNull()
    expect(second.exporter_sample_number).toBeNull()
  })
})

describe('buildPssPickerOptions', () => {
  it('emits the lab unit plus one row per sibling, each valued by its own sample id', () => {
    const opts = buildPssPickerOptions(labUnitWithSiblings)
    expect(opts).toHaveLength(3)
    expect(opts[0].value).toBe('pss-1')
    expect(opts[1].value).toBe('sib-9')
    expect(opts[2].value).toBe('sib-10')
  })

  it('leads a sibling row with its own cert number, then its buyer and the origin', () => {
    const opts = buildPssPickerOptions(labUnitWithSiblings)
    expect(opts[1].label).toBe('BR-036995/26 · Leaf Importer · Brazil')
  })

  it('falls back to the sibling\'s own lab number when it has no certificate and no container/ICO', () => {
    const opts = buildPssPickerOptions(labUnitWithSiblings)
    expect(opts[2].label).toBe('SAN-00701/26 · Second Leaf Importer · Brazil')
  })

  it('makes a sibling findable by its own cert/lab/contract numbers', () => {
    const leaf = buildPssPickerOptions(labUnitWithSiblings)[1]
    expect(leaf.keywords).toContain('BR-036995/26')
    expect(leaf.keywords).toContain('SAN-00700/26')
    expect(leaf.keywords).toContain('40995/26')
    expect(leaf.keywords).toContain('LB-1')
    expect(leaf.keywords).toContain('999888777')
    expect(leaf.keywords).toContain('LEAFU7654321')
    expect(leaf.keywords).toContain('COEXP328')
  })

  it('makes a sibling findable by the seller/shipper/exporter references the group shares', () => {
    // The supply side is one lot for every contract in the group and is
    // carried on the lab unit row; a sibling must still be reachable by it.
    const leaf = buildPssPickerOptions(labUnitWithSiblings)[1]
    expect(leaf.keywords).toContain('S-100')   // seller_contract_nr
    expect(leaf.keywords).toContain('SH-100')  // shipper_contract_nr
    expect(leaf.keywords).toContain('EX-100')  // exporter_contract_nr
    expect(leaf.keywords).toContain('Comexim') // seller
  })

  it('does not let a sibling match on the lab unit\'s own certificate number', () => {
    const leaf = buildPssPickerOptions(labUnitWithSiblings)[1]
    expect(leaf.keywords).not.toContain('BR-036991/26')
    expect(leaf.keywords).not.toContain('SAN-00042/26')
  })

  it('returns just the lab unit row when the sample covers one contract', () => {
    expect(buildPssPickerOptions(basePss)).toHaveLength(1)
  })
})

describe('resolvePssSelection', () => {
  const list = [labUnitWithSiblings]

  it('resolves a lab unit id to that sample', () => {
    const sel = resolvePssSelection(list, 'pss-1')
    expect(sel?.sample.id).toBe('pss-1')
    expect(sel?.sample.lab_source_sample_id ?? null).toBeNull()
  })

  it('resolves a sibling id to the sibling as a full sample', () => {
    const sel = resolvePssSelection(list, 'sib-9')
    expect(sel?.sample.id).toBe('sib-9')
    expect(sel?.sample.lab_source_sample_id).toBe('pss-1')
    expect(sel?.sample.importer_name).toBe('Leaf Importer')
    expect(sel?.sample.seller_name).toBe('Comexim')
  })

  it('returns null for an unknown value or no value', () => {
    expect(resolvePssSelection(list, 'nope')).toBeNull()
    expect(resolvePssSelection(list, '')).toBeNull()
  })
})
