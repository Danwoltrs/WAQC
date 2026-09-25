import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { ContractsStep, ContractPanel, appendContract, createEmptyContract } from './contracts-step'
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
    bag_count: '320', bag_weight_kg: '60', bag_type: 'jute_bag', bags_quantity_mt: '19.200',
    equivalent_60kg_bags: '320', container_count: '', shipment_month: '2026-09',
    arrival_date: '2026-08-28', notes: '', photo_file: null,
    contracts: [],
    selected_contract: null, contract_prefilled_fields: [], contract_resolution: null,
    ...over,
  }
}

// Adds a contract exactly as SampleIntakeForm.handleAddContract does: both go
// through appendContract, so these tests exercise the form's own code path.
function Harness({ initial }: { initial: FormData }) {
  const [formData, setFormData] = useState(initial)
  const updateFormData = (field: keyof FormData, value: unknown) =>
    setFormData((prev) => ({ ...prev, [field]: value }))
  const addContract = () => setFormData((prev) => ({ ...prev, contracts: appendContract(prev) }))
  return (
    <>
      <ContractsStep
        formData={formData}
        updateFormData={updateFormData}
        clients={[]}
        laboratories={[]}
        filteredClients={[]}
        approvedPSSSamples={[]}
        importers={[]}
        roasters={[]}
        qcClients={[]}
        onAddContract={addContract}
        onRemoveContract={(i) => setFormData((prev) => ({ ...prev, contracts: prev.contracts.filter((_, k) => k !== i) }))}
      />
      <button type="button" onClick={addContract}>Add contract</button>
      <output data-testid="contracts">{JSON.stringify(formData.contracts)}</output>
    </>
  )
}

const contractOf = (form: FormData, over: Partial<SubContractFormData> = {}): SubContractFormData => ({
  ...createEmptyContract(form),
  ...over,
})

const savedContracts = (): SubContractFormData[] =>
  JSON.parse(screen.getByTestId('contracts').textContent || '[]')

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
      bag_type: 'jute_bag', bag_count: '320', bag_weight_kg: '60', shipment_month: '2026-09',
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

describe('ContractsStep', () => {
  it('adds contracts that share the parent\'s sample nr, with an EMPTY contract number', () => {
    render(<Harness initial={motherForm({ exporter_sample_number: 'AS300226' })} />)
    fireEvent.click(screen.getByText('Add contract'))
    fireEvent.click(screen.getByText('Add contract'))
    const sampleInputs = screen.getAllByPlaceholderText('Sample ref.') as HTMLInputElement[]
    expect(sampleInputs.map((i) => i.value)).toEqual(['AS300226', 'AS300226'])
    expect(screen.queryByDisplayValue('AS300227')).not.toBeInTheDocument()
    expect(savedContracts().map((c) => c.exporter_sample_number)).toEqual(['AS300226', 'AS300226'])
    // The mother's 41966/26 is neither copied nor stepped onto the new rows.
    expect(screen.queryByDisplayValue('41967/26')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('41966/26')).not.toBeInTheDocument()
  })

  it('keeps sample nrs typed per contract, and a later contract still starts from the parent\'s', () => {
    render(<Harness initial={motherForm({ exporter_sample_number: '129763' })} />)
    fireEvent.click(screen.getByText('Add contract'))
    fireEvent.click(screen.getByText('Add contract'))
    const [first, second] = screen.getAllByPlaceholderText('Sample ref.')
    fireEvent.change(first, { target: { value: '129762' } })
    fireEvent.change(second, { target: { value: '129761' } })
    expect(savedContracts().map((c) => c.exporter_sample_number)).toEqual(['129762', '129761'])

    // Typed numbers teach no series: neither 129760 nor 129764.
    fireEvent.click(screen.getByText('Add contract'))
    expect(savedContracts().map((c) => c.exporter_sample_number)).toEqual(['129762', '129761', '129763'])
  })

  // The summary's Shipper line is the shipper's own contract ref. It used to
  // print supplier_contract_nr, which is the farm / co-op Supplier's.
  it('shows the shipper\'s own ref on the summary\'s Shipper line', () => {
    render(<Harness initial={motherForm({
      same_seller_shipper: false, shipper: 'Cooxupe', shipper_contract_nr: 'SHP-77', supplier_contract_nr: 'FARM-1',
    })} />)
    expect(screen.getByText(/SHP-77/)).toBeInTheDocument()
    expect(screen.queryByText(/FARM-1/)).not.toBeInTheDocument()
  })

  it('switching a contract to bulk shows Containers + Total MT and derives the equivalent', async () => {
    const form = motherForm()
    const jute = contractOf(form, { bag_type: 'jute_bag', bag_count: '320', bag_weight_kg: '60' })
    render(<Harness initial={{ ...form, contracts: [jute] }} />)

    expect(screen.queryByLabelText('Containers')).not.toBeInTheDocument()

    // Radix Select opens from the keyboard in jsdom (pointer events carry no
    // pointerType there); items select on Enter.
    const trigger = screen.getByText('Jute Bag').closest('button')!
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const bulkOption = await screen.findByRole('option', { name: 'Bulk' })
    fireEvent.keyDown(bulkOption, { key: 'Enter' })

    await waitFor(() => expect(screen.getByLabelText('Containers')).toBeInTheDocument())
    expect(screen.getByLabelText('Total MT')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Containers'), { target: { value: '2' } })
    await waitFor(() => expect(screen.getByText('eq. 720 × 60 kg bags')).toBeInTheDocument())
    // The summary prints the agreed bulk wording, not "720 × 21600 kg bulk bags".
    expect(screen.getAllByText('2 containers in bulk (43.2 MT)').length).toBeGreaterThan(0)
  })
})

// A contract's Wolthers number finds its sys contract as it is typed; the
// contract then fills what sys already knows (buyer, both references,
// quantity, shipment) and the contract is linked, so the sibling reaches sys
// by id rather than by a number that is not unique.
describe('ContractPanel contract lookup', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const found = {
    id: 'contract-41923', contract_number: '41923/26', seller_reference: 'S664243-13', buyer_reference: 'IR0007621-1',
    contract_date: null, crop: null, seller: null, buyer: null,
  }
  const detail = {
    contract: {
      ...found, status: 'active', crop: '2025/2026', volume_bags: 320, bag_type: 'BAGS OF 60 KG EACH', bag_weight_kg: 60,
      quality_description: null, shipment_period_start: '2026-08-01', shipment_period_end: null, certifications: null,
      seller_id: 'seller-1', buyer_id: 'buyer-1', shipper_id: null, end_buyer_id: null,
      seller: { id: 'seller-1', fantasy_name: 'Carpec', name: 'Carpec Ltda' },
      buyer: { id: 'buyer-1', fantasy_name: 'Ahold Delhaize', name: 'Ahold Delhaize Coffee Company' },
      shipper: null, end_buyer: null,
    },
    resolution: {
      resolved_client_id: 'buyer-1', importer_is_qc_client: true, resolved_importer_id: null,
      candidate_seller_exporter_ids: [], candidate_shipper_exporter_ids: [],
      multiple_seller_matches: false, multiple_shipper_matches: false,
      resolved_quality_spec_id: null, quality_match: null,
    },
  }

  function stubContracts() {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = String(url).startsWith('/api/contracts/search')
        ? { contracts: [found] }
        : String(url) === '/api/contracts/contract-41923' ? detail : {}
      return new Response(JSON.stringify(body), { status: 200 })
    }))
  }

  it('fills the contract from sys and links it once the typed number is found', async () => {
    stubContracts()
    const form = motherForm()
    render(<Harness initial={{ ...form, contracts: [contractOf(form)] }} />)

    fireEvent.change(screen.getByPlaceholderText('Wolthers ref.'), { target: { value: '41923/26' } })

    await waitFor(() => expect(savedContracts()[0].contract_id).toBe('contract-41923'), { timeout: 2000 })
    expect(savedContracts()[0]).toMatchObject({
      wolthers_contract_nr: '41923/26',
      importer: 'Ahold Delhaize',
      importer_is_qc_client: true,
      buyer_contract_nr: 'IR0007621-1',
      supplier_contract_nr: 'S664243-13',
      bag_type: 'jute_bag',
      bag_count: '320',
      shipment_month: '2026-08',
    })
    expect(screen.getByDisplayValue('IR0007621-1')).toBeInTheDocument()
    // The lot's seller is shared by every contract, so a different one is
    // flagged, never overwritten.
    expect(screen.getByText(/This contract's seller is Carpec/)).toBeInTheDocument()
  })

  it('drops the link when the number is changed afterwards', async () => {
    stubContracts()
    const form = motherForm()
    render(<Harness initial={{ ...form, contracts: [contractOf(form)] }} />)
    const input = screen.getByPlaceholderText('Wolthers ref.')

    fireEvent.change(input, { target: { value: '41923/26' } })
    await waitFor(() => expect(savedContracts()[0].contract_id).toBe('contract-41923'), { timeout: 2000 })

    fireEvent.change(input, { target: { value: '41923/2' } })
    expect(savedContracts()[0].contract_id).toBe('')
    expect(savedContracts()[0].wolthers_contract_nr).toBe('41923/2')
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
