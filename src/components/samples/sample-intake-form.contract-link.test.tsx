import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Regression: a contract picked in Step 1 must reach the submit with every
 * field it mapped — through the wizard's single form state, with no step
 * re-fetching or re-deriving what the link resolved.
 *
 * Prod 2026-09-17, #42611/26 (Ipanema -> Blaser): Step 2 showed the seller
 * empty (the exporter list did not carry Ipanema, so the combobox dropped the
 * value it held) and "Wolthers Contract" blank (the picker had stopped writing
 * it on 2026-09-10). The contract ref and importer survived.
 *
 * The exporter list is EMPTY here on purpose and every name lookup at submit
 * finds nothing, so the ids in the POST can only have come from the link.
 */

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'u-anderson', email: 'anderson@wolthers.com' },
    profile: { id: 'u-anderson', email: 'anderson@wolthers.com', qc_role: 'lab_personnel', laboratory_id: 'lab-1', is_global_admin: false },
  }),
}))

// Submit-time name lookups: nothing is ever found.
vi.mock('@/lib/supabase', () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => (prop === 'maybeSingle' || prop === 'single'
      ? async () => ({ data: null, error: null })
      : prop === 'then' ? undefined : () => chain),
  })
  return { supabase: { from: () => chain } }
})

import { SampleIntakeForm } from './sample-intake-form'

const contractRow = {
  id: 'c-42611',
  contract_number: '42611/26',
  split_suffix: null,
  parent_contract_id: null,
  family: [],
  status: 'active',
  contract_date: '2026-09-01',
  crop: '2026/2027',
  volume_bags: 320,
  bag_type: 'BAGS OF 60 KG EACH',
  bag_weight_kg: 60,
  quality_description: 'NY 2, 16/18, Fine Cup',
  shipment_period_start: '2026-10-01',
  shipment_period_end: null,
  seller_reference: '027/26',
  buyer_reference: '107048',
  certifications: ['ra'],
  seller_id: 'co-ipanema',
  buyer_id: 'co-blaser',
  shipper_id: null,
  end_buyer_id: null,
  seller: { id: 'co-ipanema', fantasy_name: 'Ipanema', name: 'Ipanema Agrícola S.A.' },
  buyer: { id: 'co-blaser', fantasy_name: 'Blaser', name: 'Blaser Trading AG' },
  shipper: null,
  end_buyer: null,
}

const resolution = {
  resolved_client_id: 'co-blaser',
  importer_is_qc_client: true,
  resolved_importer_id: null,
  candidate_seller_exporter_ids: ['co-ipanema'],
  candidate_shipper_exporter_ids: [],
  multiple_seller_matches: false,
  multiple_shipper_matches: false,
  resolved_quality_spec_id: null,
  quality_match: null,
}

const searchRow = {
  id: 'c-42611', contract_number: '42611/26', seller_reference: '027/26', buyer_reference: '107048',
  contract_date: '2026-09-01', crop: '2026/2027', volume_bags: 320, bag_type: 'BAGS OF 60 KG EACH',
  quality_description: 'NY 2, 16/18, Fine Cup', shipment_period_start: '2026-10-01',
  seller: { fantasy_name: 'Ipanema', name: 'Ipanema Agrícola S.A.' },
  buyer: { fantasy_name: 'Blaser', name: 'Blaser Trading AG' },
  sample_count: 0,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let posted: Array<Record<string, any>>

function stubNetwork() {
  posted = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/api/samples') && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)))
      return json({ sample: { id: 's-new', tracking_number: 'SAN-00999/26' }, siblings: { created: [], failed: [] } }, 201)
    }
    if (url.startsWith('/api/contracts/search')) return json({ contracts: [searchRow] })
    if (url.startsWith('/api/contracts/c-42611')) return json({ contract: contractRow, resolution })
    if (url.startsWith('/api/laboratories')) {
      return json({ laboratories: [{ id: 'lab-1', name: 'Santos HQ', is_active: true, location: 'Santos, Brazil', country: 'Brazil' }] })
    }
    if (url.startsWith('/api/exporters')) return json({ exporters: [] })
    if (url.startsWith('/api/importers')) return json({ importers: [] })
    if (url.startsWith('/api/roasters')) return json({ roasters: [] })
    if (url.startsWith('/api/clients')) return json({ clients: [] })
    if (url.startsWith('/api/samples')) return json({ samples: [] })
    return json({ error: `unexpected ${url}` }, 404)
  }))
}

const stepTitle = () => document.querySelector('[aria-current="step"]')?.textContent ?? ''
const continueButton = () => screen.getByRole('button', { name: /^Continue/ })
// A combobox never takes its accessible name from its content; its text is
// the selected option's label.
const comboboxTexts = () => screen.getAllByRole('combobox').map((el) => el.textContent)

const searchBox = () => screen.getByPlaceholderText(/Contract nr, seller or buyer reference/)
const header = () => screen.getByTestId('linked-header')

describe('SampleIntakeForm — a Step-1 contract pick', () => {
  beforeEach(() => {
    stubNetwork()
    // The sample type is picked on Step 1; the draft restore is the form's own
    // way of arriving with one already chosen.
    localStorage.setItem('sample-intake-form', JSON.stringify({ sample_type: 'type' }))
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  // Anderson, 2026-09-28: a complete link used to jump straight past Step 2,
  // where the sample reference and the shipper are checked. Daniel,
  // 2026-09-29: a pick goes straight to Step 2 (never further), as New
  // Inquiry does, and the header names the contract as the confirmation.
  it('goes straight to the details step, names the contract in the header, and carries every mapped field to the POST', async () => {
    render(<SampleIntakeForm />)

    fireEvent.change(searchBox(), { target: { value: '42611' } })
    fireEvent.click(await screen.findByText('#42611/26', {}, { timeout: 4000 }))

    await waitFor(() => expect(stepTitle()).toContain('Sample and quantity'), { timeout: 4000 })
    // Wolthers ref, client, client ref and quality, with Change beside them.
    expect(header()).toHaveTextContent('#42611/26')
    expect(header()).toHaveTextContent('Blaser · 107048 · NY 2, 16/18, Fine Cup')

    // Everything the link filled is on the details step — with the exporter
    // list empty, the seller can only come from the form state.
    expect(comboboxTexts()).toContain('Ipanema')
    expect(screen.queryByText('Select seller')).not.toBeInTheDocument()
    expect(comboboxTexts()).toContain('Blaser')
    expect(screen.getByDisplayValue('027/26')).toBeInTheDocument()
    expect(screen.getByDisplayValue('107048')).toBeInTheDocument()
    // The Wolthers number is the header's; no field repeats it (2026-09-29).
    expect(header()).toHaveTextContent('#42611/26')
    expect(screen.queryByDisplayValue('42611/26')).not.toBeInTheDocument()
    // Values the link filled say so.
    expect(screen.getAllByText('Prefilled').length).toBeGreaterThan(0)
    // The quantity came with it, and the footer reads it out live.
    expect(screen.getByLabelText(/^Boxes/)).toHaveValue(1)
    expect(screen.getByTestId('quantity-summary')).toHaveTextContent("1 × 20' Jute 60 kg · 320 bags/box · 19.2 MT/box = 320 bags · 19.2 MT")
    expect(screen.getByTestId('quantity-equivalent')).toHaveTextContent('320 bags')
    expect(screen.getByTestId('quantity-mt')).toHaveTextContent('19.2 MT')

    // On to the review step.
    await waitFor(() => expect(screen.queryByTestId('step-issues')).not.toBeInTheDocument(), { timeout: 4000 })
    fireEvent.click(continueButton())
    expect(stepTitle()).toContain('Review and finish')

    // The review names the link.
    const linkedRow = document.querySelector('[data-summary-row="Linked contract"]') as HTMLElement
    expect(linkedRow).toHaveTextContent('#42611/26 · Ipanema → Blaser')

    fireEvent.click(screen.getByRole('button', { name: /^Create sample/ }))
    await waitFor(() => expect(posted).toHaveLength(1), { timeout: 4000 })

    expect(posted[0]).toMatchObject({
      contract_id: 'c-42611',
      wolthers_contract_nr: '42611/26',
      seller_contract_nr: '027/26',
      buyer_contract_nr: '107048',
      seller_id: 'co-ipanema',
      exporter_id: 'co-ipanema',
      importer_id: 'co-blaser',
      client_id: 'co-blaser',
      importer_is_qc_client: true,
      same_seller_shipper: true,
      quality_name: 'NY 2, 16/18, Fine Cup',
      crop_year: '26/27', // sys "2026/2027" as the dropdown lists it
      bag_type: 'jute_bag',
      bag_count: 320,
      shipment_month: '2026-10',
      certifications: ['Rainforest Alliance'],
      laboratory_id: 'lab-1',
      origin: 'Brazil',
      sample_type: 'type',
    })
  })

  it('picks the first match on Enter and still stops at the details step when a reference is blank', async () => {
    ;(fetch as any).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('/api/contracts/c-42611')) {
        return json({ contract: { ...contractRow, buyer_reference: null }, resolution })
      }
      if (url.startsWith('/api/contracts/search')) return json({ contracts: [searchRow] })
      if (url.startsWith('/api/laboratories')) return json({ laboratories: [] })
      return json({ exporters: [], importers: [], roasters: [], clients: [], samples: [] })
    })
    render(<SampleIntakeForm />)
    fireEvent.change(searchBox(), { target: { value: '42611' } })
    await screen.findByText('#42611/26', {}, { timeout: 4000 })
    fireEvent.keyDown(searchBox(), { key: 'Enter' })

    await waitFor(() => expect(stepTitle()).toContain('Sample and quantity'), { timeout: 4000 })
    // The blank client ref is left out, never someone else's.
    expect(header()).toHaveTextContent('Blaser · NY 2, 16/18, Fine Cup')
    expect(comboboxTexts()).toContain('Ipanema')
    expect(header()).toHaveTextContent('#42611/26')
  })

  it('Change goes back to the contract; changing it there clears what the link filled', async () => {
    render(<SampleIntakeForm />)
    fireEvent.change(searchBox(), { target: { value: '42611' } })
    fireEvent.click(await screen.findByText('#42611/26', {}, { timeout: 4000 }))
    await waitFor(() => expect(stepTitle()).toContain('Sample and quantity'), { timeout: 4000 })

    fireEvent.click(within(header()).getByRole('button', { name: 'Change' }))
    expect(stepTitle()).toContain('Contract')
    // Step 1 shows the link in one line; Continue goes back to the details.
    expect(continueButton()).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(await screen.findByPlaceholderText(/Contract nr, seller or buyer reference/)).toBeInTheDocument()
    expect(continueButton()).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'No contract' }))
    expect(screen.queryByDisplayValue('42611/26')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('027/26')).not.toBeInTheDocument()
  })
})
