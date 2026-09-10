import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Adding contracts from the sample overlay: references continue the series
 * from the lab unit (contract #1), the whole batch is POSTed once to
 * /siblings, and per-contract failures come back as "Contract #N: …".
 */

vi.mock('@/lib/supabase', () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => (prop === 'maybeSingle'
      ? async () => ({ data: { id: 'company-1' } })
      : () => chain),
  })
  return { supabase: { from: () => chain } }
})

import { AddSubContractDialog, AddContractsDialog } from './add-sub-contract-dialog'

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

const refInputs = () => screen.getAllByPlaceholderText('Ref.')
const wolthersInputs = () => screen.getAllByPlaceholderText('Wolthers ref.')

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

  // Only the exporter's own SAMPLE number continues a series. Contract numbers
  // are typed on every contract (2026-09-10) — the auto-increment used to
  // invent a Wolthers number ("50235-1" -> "50236-1") for a contract nobody had
  // read off the paperwork, and a wrong number that reached a certificate is a
  // far worse outcome than typing one.
  it('continues the exporter sample number, and never guesses a contract number', async () => {
    stubFetch({ status: 201, body: { created: [], failed: [] } })
    render(<AddSubContractDialog open onOpenChange={() => {}} sample={sample} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(1))
    expect(screen.getByPlaceholderText('Sample ref.')).toHaveValue('ES-101')

    // Every contract number starts blank — neither copied nor stepped.
    expect(wolthersInputs()[0]).toHaveValue('')
    const refs = refInputs().map((i) => (i as HTMLInputElement).value)
    expect(refs).not.toContain('IR0007507-1')
    expect(refs).not.toContain('IR0007506-1')
    expect(refs).not.toContain('S664244-13')
    expect(refs.every((v) => v === '')).toBe(true)

    // The user corrects the sample-number step (ES-101 -> ES-105); the next
    // contract adopts the step of 5 (ES-100 is the seed before it).
    fireEvent.change(screen.getByPlaceholderText('Sample ref.'), { target: { value: 'ES-105' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Contract/ }))
    await waitFor(() => expect(wolthersInputs()).toHaveLength(2))
    expect(screen.getAllByPlaceholderText('Sample ref.')[1]).toHaveValue('ES-110')
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
    // The sample number is still the one thing that steps.
    expect(body.contracts[0].exporter_sample_number).toBe('ES-101')
    expect(body.contracts[1].exporter_sample_number).toBe('ES-102')
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
