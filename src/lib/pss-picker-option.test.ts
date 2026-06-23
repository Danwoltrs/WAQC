import { describe, it, expect } from 'vitest'
import { buildPssPickerOption, pssOfficialRef } from './pss-picker-option'

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

  it('makes Wolthers and other contract numbers from sub-contracts searchable too', () => {
    const withSubs = {
      ...basePss,
      sample_contracts: [
        { tracking_number: 'BR-099001/26', wolthers_contract_nr: '40994/26', buyer_contract_nr: 'SUB-B-1' },
        { wolthers_contract_nr: '40995/26' },
      ],
    }
    const { keywords } = buildPssPickerOption(withSubs)
    expect(keywords).toContain('40994/26')
    expect(keywords).toContain('40995/26')
    expect(keywords).toContain('SUB-B-1')
    expect(keywords).toContain('BR-099001/26')
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
