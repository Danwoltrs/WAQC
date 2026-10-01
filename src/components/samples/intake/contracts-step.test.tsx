import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContractPanel, appendContract, createEmptyContract } from './contracts-step'
import type { FormData, SubContractFormData } from './types'

// A mother form the way step 6 sees it: one lot, its buy side and references
// filled in, no contracts yet. Tests override what they need.
function motherForm(over: Partial<FormData> = {}): FormData {
  return {
    sample_category: 'qc', awb_number: '', courier_name: '', is_quick_look: false, recipients: [],
    seller: 'Louis Dreyfus Company', seller_contract_nr: 'S-100', exporter_sample_number: '50235-1',
    same_seller_shipper: true, shipper: '', shipper_contract_nr: '',
    importer: 'Acme Importers', importer_contract_nr: 'S049504-13', importer_is_qc_client: true,
    qc_client: '', qc_client_contract_nr: '', supplier: '', supplier_contract_nr: '',
    roaster: '', roaster_contract_nr: '', end_client: '', end_client_contract_nr: '',
    client_id: 'client-1', laboratory_id: 'lab-1', origin: 'Brazil', micro_origin: '', processing_method: 'Natural',
    sample_type: 'pss', linked_pss_sample_id: '', quality_spec_id: 'spec-1', quality_name: 'Fine Cup',
    hide_exporter_on_label: false, certifications: [], crop_year: '25/26',
    wolthers_contract_nr: '41966/26', exporter_contract_nr: '', ico_number: '', container_nr: '',
    bag_type: 'jute_bag', bag_liner: '', bag_weight_kg: '60',
    container_count: '1', container_size: "20'", bags_per_box: '', mt_per_box: '', shipment_month: '2026-09',
    arrival_date: '2026-08-28', notes: '', photo_file: null,
    contracts: [],
    selected_contract: null, contract_prefilled_fields: [], contract_resolution: null,
    ...over,
  }
}

// A hand-added contract is the same physical sample under another contract.
//  - Its SAMPLE nr defaults to the parent's own: one package usually covers
//    every contract (Ecom AS300226 for 42885/26 and 42886/26). It is an
//    ordinary input, so exporters that tag each contract separately (OFI,
//    Alfi) type theirs; nothing is ever stepped (AS300226 -> AS300227 was the
//    2026-08-28 series guess, reversed 2026-09-23).
//  - Its contract REFERENCES start blank: each contract's refs are its own
//    record's, never the parent's. A copied or silently inherited ref is how
//    42886/26 was saved with 42885/26's seller ref.
//  - Parties, ICO, container, quantity and shipment month are copied as the
//    starting point, because they usually match.
describe('createEmptyContract', () => {
  const ofi = () => motherForm({
    exporter_sample_number: 'AS300226', importer_contract_nr: 'S049504-9', roaster: 'Qusac', roaster_contract_nr: '5224',
    qc_client_contract_nr: 'QC-9', end_client_contract_nr: 'EC-9', supplier_contract_nr: 'FARM-1', seller_contract_nr: 'S664243-9',
    ico_number: '002/1234/0001', container_nr: 'MSCU1234567',
  })

  it('takes the parent\'s sample nr and starts every contract reference blank', () => {
    const c = createEmptyContract(ofi())
    expect(c.exporter_sample_number).toBe('AS300226')
    expect(c).toMatchObject({
      wolthers_contract_nr: '', contract_id: '', buyer_contract_nr: '', roaster_contract_nr: '',
      qc_client_contract_nr: '', end_client_contract_nr: '', supplier_contract_nr: '',
    })
  })

  it('copies the parties, ICO, container, quantity and shipment month', () => {
    expect(createEmptyContract(ofi())).toMatchObject({
      importer: 'Acme Importers', importer_is_qc_client: true, roaster: 'Qusac',
      ico_number: '002/1234/0001', container_nr: 'MSCU1234567',
      bag_type: 'jute_bag', container_count: '1', bag_weight_kg: '60', shipment_month: '2026-09',
    })
  })

  it('copies a non-numeric parent number unchanged', () => {
    expect(createEmptyContract(motherForm({ exporter_sample_number: 'PENDING' })).exporter_sample_number).toBe('PENDING')
  })
})

describe('appendContract', () => {
  it('adds a contract carrying the PARENT\'s sample nr, whatever the previous contract carries', () => {
    const form = motherForm({ exporter_sample_number: 'AS300226' })
    const once = appendContract(form)
    expect(once.map((c) => c.exporter_sample_number)).toEqual(['AS300226'])
    const edited = { ...form, contracts: [{ ...once[0], exporter_sample_number: 'X-1' }] }
    expect(appendContract(edited).map((c) => c.exporter_sample_number)).toEqual(['X-1', 'AS300226'])
  })
})

// OFI sells to OFI: the seller and the importer carry the same name, so a box
// labelled only "OFI" next to an importer select that also reads "OFI" is how
// the importer's S049504-12 was typed into the seller-ref slot (2026-08-13,
// SAN-00750/751/752). The boxes say whose ref they are, and a seller ref equal
// to the importer ref is flagged (not blocked).
describe('ContractPanel references', () => {
  const panel = (over: Partial<SubContractFormData>) =>
    render(
      <ContractPanel
        contract={{ ...createEmptyContract(motherForm()), ...over }}
        updateContract={vi.fn()}
        importerOptions={[]}
        mergedImporterOptions={[]}
        roasterOptions={[]}
        qcClients={[]}
        origin="Brazil"
        sellerName="OFI"
      />,
    )

  it('labels the seller-ref and importer-ref boxes as such', () => {
    panel({ supplier_contract_nr: 'S664243-12', buyer_contract_nr: 'S049504-12' })
    expect(screen.getByPlaceholderText('Seller ref.')).toHaveValue('S664243-12')
    expect(screen.getByPlaceholderText('Importer ref.')).toHaveValue('S049504-12')
    expect(screen.getByText('Seller ref.')).toBeInTheDocument()
    // Never the seller's name alone, which read the same as the importer's.
    expect(screen.queryByText('OFI')).not.toBeInTheDocument()
    expect(screen.queryByText(/Seller ref and importer ref are the same/)).not.toBeInTheDocument()
  })

  it('warns when the seller ref equals the importer ref', () => {
    panel({ supplier_contract_nr: 'S049504-12', buyer_contract_nr: ' s049504-12 ' })
    expect(screen.getByText('Seller ref and importer ref are the same. Each belongs in its own box.')).toBeInTheDocument()
  })
})

// A buyer filled from sys under a trade name the loaded importer list does
// not carry used to leave the select blank over a value it held.
describe('ContractPanel party selects', () => {
  it('shows a party that is not among the loaded options', () => {
    render(
      <ContractPanel
        contract={{ ...createEmptyContract(motherForm()), importer: 'Blaser' }}
        updateContract={vi.fn()}
        importerOptions={[{ name: 'Rothfos GmbH' }]}
        mergedImporterOptions={[{ name: 'Rothfos GmbH' }]}
        roasterOptions={[]}
        qcClients={[]}
        origin="Brazil"
      />,
    )
    expect(screen.getAllByRole('combobox').map((c) => c.textContent)).toContain('Blaser')
  })
})
