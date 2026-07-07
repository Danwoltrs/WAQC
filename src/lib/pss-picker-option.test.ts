import { describe, it, expect } from 'vitest'
import { buildPssPickerOption, buildPssPickerOptions, pssOfficialRef, subContractRef, resolvePssSelection } from './pss-picker-option'

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

const motherWithSubs = {
  ...basePss,
  id: 'pss-1',
  origin: 'Brazil',
  sub_contracts: [
    {
      id: 'sc-9',
      certificate_number: 'BR-036995/26',
      tracking_number: 'BR-036995/26',
      importer_name: 'Leaf Importer',
      roaster_name: 'Leaf Roaster',
      qc_client_name: 'Dunkin',
      buyer_contract_nr: 'LB-1',
      wolthers_contract_nr: '40995/26',
      ico_number: '999888777',
      container_nr: 'LEAFU7654321',
    },
    {
      id: 'sc-10',
      certificate_number: null,
      tracking_number: 'BR-036996/26',
      importer_name: 'Second Leaf Importer',
    },
  ],
}

describe('buildPssPickerOptions', () => {
  it('emits the mother row plus one row per sub-contract', () => {
    const opts = buildPssPickerOptions(motherWithSubs)
    expect(opts).toHaveLength(3)
    expect(opts[0].value).toBe('pss-1')
    expect(opts[1].value).toBe('sc-9')
    expect(opts[2].value).toBe('sc-10')
  })

  it('leads a leaf row with its own cert number, then buyer and mother origin', () => {
    const opts = buildPssPickerOptions(motherWithSubs)
    expect(opts[1].label).toBe('BR-036995/26 · Leaf Importer · Brazil')
  })

  it('falls back to the leaf tracking number when it has no minted cert', () => {
    const opts = buildPssPickerOptions(motherWithSubs)
    expect(opts[2].label).toBe('BR-036996/26 · Second Leaf Importer · Brazil')
  })

  it('makes a leaf findable by its own cert/tracking/contract numbers', () => {
    const leaf = buildPssPickerOptions(motherWithSubs)[1]
    expect(leaf.keywords).toContain('BR-036995/26')
    expect(leaf.keywords).toContain('40995/26')
    expect(leaf.keywords).toContain('LB-1')
    expect(leaf.keywords).toContain('999888777')
    expect(leaf.keywords).toContain('LEAFU7654321')
  })

  it('returns just the mother row when there are no sub-contracts', () => {
    expect(buildPssPickerOptions(basePss)).toHaveLength(1)
  })
})

describe('resolvePssSelection', () => {
  const list = [motherWithSubs]

  it('resolves a mother id to the mother with no sub-contract', () => {
    const sel = resolvePssSelection(list, 'pss-1')
    expect(sel?.mother.id).toBe('pss-1')
    expect(sel?.subContract).toBeNull()
  })

  it('resolves a sub-contract id to its leaf and mother', () => {
    const sel = resolvePssSelection(list, 'sc-9')
    expect(sel?.mother.id).toBe('pss-1')
    expect(sel?.subContract.id).toBe('sc-9')
  })

  it('returns null for an unknown value', () => {
    expect(resolvePssSelection(list, 'nope')).toBeNull()
  })
})

describe('subContractRef', () => {
  it('prefers the minted cert number, falling back to tracking', () => {
    expect(subContractRef({ certificate_number: 'BR-036995/26', tracking_number: 'x' })).toBe('BR-036995/26')
    expect(subContractRef({ certificate_number: null, tracking_number: 'BR-036996/26' })).toBe('BR-036996/26')
  })
})
