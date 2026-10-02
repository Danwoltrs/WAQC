import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { SubContractsTable } from './sub-contracts-table'
import { appendContract, createEmptyContract } from './contracts-step'
import type { FormData, SubContractFormData } from './types'

// The packaging lists come from the shared sys tables; answer with what they hold.
vi.mock('@/lib/supabase', () => {
  const rows: Record<string, { value: string }[]> = {
    packaging_liners: [{ value: 'Jute' }, { value: 'GrainPro' }, { value: 'Generic GrainPro' }, { value: '+ Pallets' }],
    packaging_bag_sizes: [{ value: '60kg' }, { value: '59kg' }, { value: '30kg' }, { value: 'Bulk' }],
  }
  const query = (table: string) => {
    const result = Promise.resolve({ data: rows[table] ?? [], error: null })
    const chain: any = { select: () => chain, eq: () => chain, order: () => chain, then: result.then.bind(result) }
    return chain
  }
  return { supabase: { from: query } }
})

// The sample the way the review step sees it: one lot, its buy side and
// references filled in, no contracts yet. Tests override what they need.
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

// Adds and removes contracts exactly as SampleIntakeForm does: both go
// through appendContract / a filter, so these tests exercise the form's path.
function Harness({ initial }: { initial: FormData }) {
  const [formData, setFormData] = useState(initial)
  const updateFormData = (field: keyof FormData, value: unknown) =>
    setFormData((prev) => ({ ...prev, [field]: value }))
  const addContract = () => setFormData((prev) => ({ ...prev, contracts: appendContract(prev) }))
  return (
    <>
      <SubContractsTable
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
        onRemoveContract={(i: number) => setFormData((prev) => ({ ...prev, contracts: prev.contracts.filter((_, k) => k !== i) }))}
      />
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

const addButton = () => screen.getByRole('button', { name: /Add sub-contract/ })

describe('SubContractsTable', () => {
  it('says so when there are none, and adds a row on the first click', () => {
    render(<Harness initial={motherForm()} />)
    expect(screen.getByText(/No sub-contracts/)).toBeInTheDocument()
    fireEvent.click(addButton())
    expect(savedContracts()).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('Wolthers ref.')).toHaveLength(1)
  })

  it('adds contracts that share the parent\'s sample nr, with an EMPTY contract number', () => {
    render(<Harness initial={motherForm({ exporter_sample_number: 'AS300226' })} />)
    fireEvent.click(addButton())
    fireEvent.click(addButton())
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
    fireEvent.click(addButton())
    fireEvent.click(addButton())
    const [first, second] = screen.getAllByPlaceholderText('Sample ref.')
    fireEvent.change(first, { target: { value: '129762' } })
    fireEvent.change(second, { target: { value: '129761' } })
    expect(savedContracts().map((c) => c.exporter_sample_number)).toEqual(['129762', '129761'])

    // Typed numbers teach no series: neither 129760 nor 129764.
    fireEvent.click(addButton())
    expect(savedContracts().map((c) => c.exporter_sample_number)).toEqual(['129762', '129761', '129763'])
  })

  it('puts the cursor in a new row\'s Wolthers contract', async () => {
    render(<Harness initial={motherForm()} />)
    fireEvent.click(addButton())
    await waitFor(() => expect(screen.getByPlaceholderText('Wolthers ref.')).toHaveFocus())
    fireEvent.click(addButton())
    await waitFor(() => expect(screen.getAllByPlaceholderText('Wolthers ref.')[1]).toHaveFocus())
  })

  // Several contracts are typed in one go: Enter moves down, and the last
  // row's Enter adds the next one.
  it('moves to the next row on Enter, and adds a row after the last', async () => {
    const form = motherForm()
    render(<Harness initial={{ ...form, contracts: [contractOf(form), contractOf(form)] }} />)
    const [firstIco, secondIco] = screen.getAllByPlaceholderText('Sample ref.')
    fireEvent.keyDown(firstIco, { key: 'Enter' })
    expect(screen.getAllByPlaceholderText('Wolthers ref.')[1]).toHaveFocus()
    expect(savedContracts()).toHaveLength(2)

    fireEvent.keyDown(secondIco, { key: 'Enter' })
    expect(savedContracts()).toHaveLength(3)
    await waitFor(() => expect(screen.getAllByPlaceholderText('Wolthers ref.')[2]).toHaveFocus())
  })

  it('removes an untouched row at once, and asks once for a row with typed references', () => {
    const form = motherForm()
    render(<Harness initial={{ ...form, contracts: [contractOf(form), contractOf(form, { wolthers_contract_nr: '41967/26' })] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove sub-contract #3' }))
    expect(savedContracts()).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removing sub-contract #3' }))
    expect(savedContracts().map((c) => c.wolthers_contract_nr)).toEqual([''])

    fireEvent.click(screen.getByRole('button', { name: 'Remove sub-contract #2' }))
    expect(savedContracts()).toHaveLength(0)
  })

  // The row reads its quantity out; the boxes are entered once, under More.
  it('reads the quantity out in the row and flags what is missing', () => {
    const form = motherForm()
    render(<Harness initial={{ ...form, contracts: [contractOf(form, { container_count: '' })] }} />)
    expect(screen.getByLabelText('Quantity, sub-contract #2')).toHaveTextContent('Boxes')
    expect(screen.queryByRole('spinbutton', { name: 'Boxes, sub-contract #2' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More fields, sub-contract #2' }))
    fireEvent.change(screen.getByLabelText(/^Boxes/), { target: { value: '2' } })
    expect(screen.getByLabelText('Quantity, sub-contract #2')).toHaveTextContent("2 × 20' Jute · 38.4 MT")
  })

  it('shows ICO and container number only for a shipment sample', () => {
    const pss = motherForm()
    const { unmount } = render(<Harness initial={{ ...pss, contracts: [contractOf(pss)] }} />)
    expect(screen.queryByPlaceholderText('ICO number')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Container nr.')).not.toBeInTheDocument()
    unmount()
    const ss = motherForm({ sample_type: 'ss' })
    render(<Harness initial={{ ...ss, contracts: [contractOf(ss)] }} />)
    expect(screen.getByPlaceholderText('ICO number')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Container nr.')).toBeInTheDocument()
  })

  it('gives a row without a shipment month the sample\'s, and keeps a month typed on the row', () => {
    const form = motherForm({ shipment_month: '2026-09' })
    render(<Harness initial={{ ...form, contracts: [contractOf(form, { shipment_month: '' }), contractOf(form, { shipment_month: '2026-11' })] }} />)
    expect(savedContracts().map((c) => c.shipment_month)).toEqual(['2026-09', '2026-11'])
  })

  // Boxes are containers: a packaging change keeps them and drops only the
  // per-box figures, and no box may hold more than a full box of bulk.
  it('switching a contract to bulk keeps its boxes, reads out the totals and flags an over-full box', async () => {
    const form = motherForm()
    const jute = contractOf(form, { bag_type: 'jute_bag', container_count: '3', bag_weight_kg: '60' })
    render(<Harness initial={{ ...form, contracts: [jute] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'More fields, sub-contract #2' }))
    expect(screen.getByTestId('quantity-summary')).toHaveTextContent("3 × 20' Jute 60 kg · 320 bags/box · 19.2 MT/box = 960 bags · 57.6 MT")

    const packaging = screen.getByRole('button', { name: 'Packaging' })
    await waitFor(() => expect(packaging).toBeEnabled())
    fireEvent.click(packaging)
    fireEvent.click(await screen.findByRole('option', { name: 'Bulk' }))
    expect(savedContracts()[0]).toMatchObject({ bag_type: 'bulk', bag_liner: '', container_count: '3', bag_weight_kg: '' })
    expect(screen.getByTestId('quantity-summary')).toHaveTextContent("3 × 20' Bulk · 360 bags eq./box · 21.6 MT/box = 1,080 bags eq. · 64.8 MT")
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('MT/box'), { target: { value: '19.338' } })
    expect(screen.getByTestId('quantity-summary')).toHaveTextContent('322.3 bags eq./box')

    fireEvent.change(screen.getByLabelText('MT/box'), { target: { value: '22' } })
    expect(screen.getByRole('alert')).toHaveTextContent("A 20' container holds at most 21.6 MT")
  })
})

// A contract's Wolthers number finds its sys contract as it is typed; the
// contract then fills what sys already knows (buyer, both references,
// quantity, shipment) and the contract is linked, so the sibling reaches sys
// by id rather than by a number that is not unique.
describe('SubContractsTable contract lookup', () => {
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
      container_count: '1',
      shipment_month: '2026-08',
    })
    expect(screen.getByDisplayValue('IR0007621-1')).toBeInTheDocument()
    expect(screen.getByText('Filled from the contract on the system.')).toBeInTheDocument()
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

// 2026-09-30: a Dunkin PSS (143/26 + 144/26) saved contract #2 with no seller
// ref although it has its own (TTE-0058/26): the box sat under "More", so a
// row filled in as seen still left it blank. It is in the row now.
describe('SubContractsTable — seller ref in the row', () => {
  it("takes each contract's own seller ref without opening More", () => {
    const form = motherForm()
    render(<Harness initial={{ ...form, contracts: [contractOf(form)] }} />)
    expect(screen.queryByRole('button', { name: 'More fields, sub-contract #2', expanded: true })).not.toBeInTheDocument()
    const sellerRef = screen.getByRole('textbox', { name: 'Seller ref., sub-contract #2' })
    expect(sellerRef).toHaveValue('')
    fireEvent.change(sellerRef, { target: { value: 'TTE-0058/26' } })
    expect(savedContracts()[0]).toMatchObject({ supplier_contract_nr: 'TTE-0058/26' })
    // One box only: More no longer repeats it.
    fireEvent.click(screen.getByRole('button', { name: 'More fields, sub-contract #2' }))
    expect(screen.getAllByDisplayValue('TTE-0058/26')).toHaveLength(1)
  })
})
