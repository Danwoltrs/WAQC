import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Adding contracts from the sample overlay: a new contract starts with the
 * sample's own sample nr and blank contract references, the whole batch is
 * POSTed once to /siblings, and per-contract failures come back as
 * "Contract #N: …".
 */

vi.mock('@/lib/supabase', () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => (prop === 'maybeSingle'
      ? async () => ({ data: { id: 'company-1' } })
      : () => chain),
  })
  return { supabase: { from: () => chain } }
})

import { AddSubContractDialog, AddContractsDialog, parentSampleNr } from './add-sub-contract-dialog'

const sample = {
  id: 's1', tracking_number: 'SAN-000001/26', client_id: 'qc-1', sample_type: 'pss', origin: 'Brazil',
  importer_name: 'Rich Coop', importer_is_qc_client: true,
  wolthers_contract_nr: '50235-1', buyer_contract_nr: 'IR0007506-1', supplier_contract_nr: 'S664243-13',
  exporter_sample_number: 'ES-100', roaster_contract_nr: 'no digits here',
  bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60, bags_quantity_mt: 19.2, shipment_month: '2026-02',
}

let fetchMock: ReturnType<typeof vi.fn>
function stubFetch(siblingsResponse: { status: number; body: unknown }) {
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/siblings')) {
      return new Response(JSON.stringify(siblingsResponse.body), { status: siblingsResponse.status })
    }
    return new Response(JSON.stringify({ importers: [], roasters: [], clients: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

// Every contract-reference box of the open panels: seller, importer, and the
// QC-client / roaster / end-client ones when shown.
const refInputs = () => [
  ...screen.queryAllByPlaceholderText('Seller ref.'),
  ...screen.queryAllByPlaceholderText('Importer ref.'),
  ...screen.queryAllByPlaceholderText('Ref.'),
]
const sampleRefs = () => (screen.getAllByPlaceholderText('Sample ref.') as HTMLInputElement[]).map((i) => i.value)
const wolthersInputs = () => screen.getAllByPlaceholderText('Wolthers ref.')

// Opened from the overlay on contract #N, the dialog still adds to the lab
// unit, so an added contract's sample nr is the lab unit's, not the open
// contract's own tag (OFI tags each contract: 129762 on #4, 129763 on #1).
describe('parentSampleNr', () => {
  it('is the lab unit\'s number when a sibling is open', () => {
    expect(parentSampleNr({ exporter_sample_number: '129763' }, { exporter_sample_number: '129762' })).toBe('129763')
  })
  it('is blank, not the open sibling\'s, when the lab unit has none', () => {
    expect(parentSampleNr({ exporter_sample_number: null }, { exporter_sample_number: '129762' })).toBe('')
  })
  it('falls back to the open sample only while the lab unit is not loaded', () => {
    expect(parentSampleNr(null, { exporter_sample_number: 'AS300226' })).toBe('AS300226')
    expect(parentSampleNr(undefined, { exporter_sample_number: null })).toBe('')
  })
})

describe('AddSubContractDialog', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('is also exported as AddContractsDialog', () => {
    expect(AddContractsDialog).toBe(AddSubContractDialog)
  })

  it('prints the mother quantity with formatQuantityLine', async () => {
    stubFetch({ status: 201, body: { created: [], failed: [] } })
    render(<AddSubContractDialog open onOpenChange={() => {}} sample={sample} />)
    expect(await screen.findByText('320 × 60 kg jute bags (19.2 MT) | February 2026 shpt')).toBeInTheDocument()
  })

  // An added contract is the same physical sample under another contract: its
  // sample nr defaults to the sample's own (one package usually covers every
  // contract) and is never stepped — ES-100 stays ES-100 for every contract
  // added, whatever an earlier one was changed to. Its contract numbers and
  // references are its own, so they start blank: neither copied from the
  // sample nor guessed (2026-09-10 for the numbers, 2026-09-23 for the refs).
  it('defaults every added contract to the sample\'s own number, with blank contract numbers and refs', async () => {
    stubFetch({ status: 201, body: { created: [], failed: [] } })
    render(<AddSubContractDialog open onOpenChange={() => {}} sample={sample} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(1))
    expect(sampleRefs()).toEqual(['ES-100'])

    expect(wolthersInputs()[0]).toHaveValue('')
    const refs = refInputs().map((i) => (i as HTMLInputElement).value)
    expect(refs.length).toBeGreaterThan(0)
    expect(refs).not.toContain('IR0007506-1')
    expect(refs).not.toContain('S664243-13')
    expect(refs.every((v) => v === '')).toBe(true)

    // A changed number is that contract's own; the next one starts from the sample's again.
    fireEvent.change(screen.getByPlaceholderText('Sample ref.'), { target: { value: 'ES-105' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(2))
    expect(sampleRefs()).toEqual(['ES-105', 'ES-100'])
  })

  it('sends hand-typed different sample nrs as typed', async () => {
    stubFetch({ status: 201, body: { created: [{ id: 'sib-1' }, { id: 'sib-2' }], failed: [] } })
    render(<AddSubContractDialog open onOpenChange={() => {}} sample={sample} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(2))
    const [first, second] = screen.getAllByPlaceholderText('Sample ref.')
    fireEvent.change(first, { target: { value: 'ES-201' } })
    fireEvent.change(second, { target: { value: 'ES-202' } })
    // Typed tags teach no series: the next contract is the sample's own again.
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(3))
    expect(sampleRefs()).toEqual(['ES-201', 'ES-202', 'ES-100'])
    fireEvent.click(screen.getByRole('button', { name: /Save 3 Contracts/ }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/siblings'))).toBe(true))
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/siblings'))!
    const body = JSON.parse(call[1].body)
    expect(body.contracts.map((c: any) => c.exporter_sample_number)).toEqual(['ES-201', 'ES-202', 'ES-100'])
  })

  // The summary's Shipper line is the shipper's own ref, not the farm /
  // co-op Supplier's (supplier_contract_nr).
  it('shows the shipper\'s own ref on the summary\'s Shipper line', async () => {
    stubFetch({ status: 201, body: { created: [], failed: [] } })
    render(
      <AddSubContractDialog
        open
        onOpenChange={() => {}}
        sample={{ ...sample, same_seller_shipper: false, exporter_name: 'Cooxupe', shipper_contract_nr: 'SHP-5' }}
      />,
    )
    // The summary's Entity is re-created on every render, so the lookup waits
    // for the settled tree instead of holding on to a node that gets replaced.
    await waitFor(() => expect(screen.getByText(/SHP-5/)).toBeInTheDocument())
    expect(screen.queryByText(/S664243-13/)).not.toBeInTheDocument()
  })

  it('POSTs the whole batch once to /siblings with the derived quantities and closes on success', async () => {
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    stubFetch({ status: 201, body: { created: [{ id: 'sib-1' }, { id: 'sib-2' }], failed: [] } })
    render(<AddSubContractDialog open onOpenChange={onOpenChange} sample={sample} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: /Save 2 Contracts/ }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    const siblingCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/siblings'))
    expect(siblingCalls).toHaveLength(1)
    expect(siblingCalls[0][0]).toBe('/api/samples/s1/siblings')
    const body = JSON.parse(siblingCalls[0][1].body)
    expect(body.contracts).toHaveLength(2)
    expect(body.contracts[0]).toMatchObject({
      importer_id: 'company-1', client_id: 'qc-1',
      bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60, bags_quantity_mt: 19.2, equivalent_60kg_bags: 320,
      shipment_month: '2026-02',
    })
    // Untyped contract numbers go up as null, never as a guess.
    expect(body.contracts[0].wolthers_contract_nr).toBeNull()
    expect(body.contracts[1].wolthers_contract_nr).toBeNull()
    // Both contracts carry the sample's own number, and no reference of its.
    expect(body.contracts.map((c: any) => c.exporter_sample_number)).toEqual(['ES-100', 'ES-100'])
    expect(body.contracts[0].supplier_contract_nr).toBeNull()
    expect(body.contracts[0].buyer_contract_nr).toBeNull()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows per-contract failures as "Contract #N: …" and keeps the dialog open', async () => {
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    stubFetch({ status: 201, body: { created: [{ id: 'sib-1' }], failed: [{ index: 1, error: 'duplicate key' }] } })
    render(<AddSubContractDialog open onOpenChange={onOpenChange} sample={sample} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: /Save 2 Contracts/ }))

    expect(await screen.findByText('Contract #3: duplicate key')).toBeInTheDocument()
    expect(onSuccess).toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    // Only the contract that was not created stays for another attempt.
    await waitFor(() => expect(wolthersInputs()).toHaveLength(1))
  })

  // The typed Wolthers number finds the sys contract; what sys already knows
  // fills in and the contract's id rides along, so the sibling reaches sys by
  // id. The QC client stays the sample's own in this dialog.
  it('links a contract found by its typed number and sends its id with the filled references', async () => {
    const found = {
      id: 'contract-41923', contract_number: '41923/26', seller_reference: 'S664243-13', buyer_reference: 'IR0007621-1',
      contract_date: null, crop: null, seller: null, buyer: null,
    }
    const detail = {
      contract: {
        ...found, status: 'active', crop: null, volume_bags: 320, bag_type: 'BAGS OF 60 KG EACH', bag_weight_kg: 60,
        quality_description: null, shipment_period_start: '2026-08-01', shipment_period_end: null, certifications: null,
        seller_id: 'seller-1', buyer_id: 'buyer-1', shipper_id: null, end_buyer_id: null,
        seller: { id: 'seller-1', fantasy_name: 'Carpec', name: 'Carpec Ltda' },
        buyer: { id: 'buyer-1', fantasy_name: 'Ahold Delhaize', name: 'Ahold Delhaize Coffee Company' },
        shipper: null, end_buyer: null,
      },
      resolution: {
        resolved_client_id: null, importer_is_qc_client: false, resolved_importer_id: null,
        candidate_seller_exporter_ids: [], candidate_shipper_exporter_ids: [],
        multiple_seller_matches: false, multiple_shipper_matches: false,
        resolved_quality_spec_id: null, quality_match: null,
      },
    }
    fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      const body = u.includes('/siblings') ? { created: [{ id: 'sib-1' }], failed: [] }
        : u.startsWith('/api/contracts/search') ? { contracts: [found] }
        : u === '/api/contracts/contract-41923' ? detail
        : { importers: [], roasters: [], clients: [] }
      return new Response(JSON.stringify(body), { status: u.includes('/siblings') ? 201 : 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AddSubContractDialog open onOpenChange={() => {}} sample={sample} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(1))
    fireEvent.change(wolthersInputs()[0], { target: { value: '41923/26' } })
    expect(await screen.findByDisplayValue('IR0007621-1', {}, { timeout: 2000 })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save 1 Contract/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/siblings'))).toBe(true))
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/siblings'))!
    const body = JSON.parse(call[1].body)
    expect(body.contracts[0]).toMatchObject({
      contract_id: 'contract-41923',
      wolthers_contract_nr: '41923/26',
      buyer_contract_nr: 'IR0007621-1',
      supplier_contract_nr: 'S664243-13',
      shipment_month: '2026-08',
      // Locked to the sample's QC client: the contract does not flip it.
      importer_is_qc_client: true,
    })
  })

  it('sends a bulk contract through the containers rule', async () => {
    stubFetch({ status: 201, body: { created: [{ id: 'sib-1' }], failed: [] } })
    const bulkSample = { ...sample, bag_type: 'bulk', bag_count: 720, bag_weight_kg: 21600, bags_quantity_mt: 43.2, container_count: 2 }
    render(<AddSubContractDialog open onOpenChange={() => {}} sample={bulkSample} />)
    expect(await screen.findByText('2 containers in bulk (43.2 MT) | February 2026 shpt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: /Save 1 Contract/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/siblings'))).toBe(true))
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/siblings'))!
    const body = JSON.parse(call[1].body)
    expect(body.contracts[0]).toMatchObject({
      bag_type: 'bulk', container_count: 2, bags_quantity_mt: 43.2, equivalent_60kg_bags: 720, bag_count: 720, bag_weight_kg: 21600,
    })
  })
})
