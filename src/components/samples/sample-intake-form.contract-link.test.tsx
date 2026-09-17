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

const stepTitle = () => screen.getByText(/^Sample Intake - /).textContent
// A combobox never takes its accessible name from its content; its text is
// the selected option's label.
const comboboxTexts = () => screen.getAllByRole('combobox').map((el) => el.textContent)

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

  it('carries every mapped field to the review step and the POST, skipping Step 2 when the link is complete', async () => {
    render(<SampleIntakeForm />)

    fireEvent.change(screen.getByPlaceholderText(/Type contract number/), { target: { value: '42611' } })
    fireEvent.click(await screen.findByText('#42611/26', {}, { timeout: 4000 }))

    // Complete link: seller, both references, importer and the Wolthers number
    // arrived, so the wizard lands on Step 3, not on "Supply chain and contract references".
    await waitFor(() => expect(stepTitle()).toContain('Quality, micro-origins'), { timeout: 4000 })

    // Step 2 stays one "Previous" away, and shows everything the link filled —
    // with the exporter list empty, the seller can only come from the form state.
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))
    expect(stepTitle()).toContain('Supply chain and contract references')
    expect(comboboxTexts()).toContain('Ipanema')
    expect(screen.queryByText('Select seller')).not.toBeInTheDocument()
    expect(comboboxTexts()).toContain('Blaser')
    expect(screen.getByDisplayValue('027/26')).toBeInTheDocument()
    expect(screen.getByDisplayValue('107048')).toBeInTheDocument()
    expect(screen.getByDisplayValue('42611/26')).toBeInTheDocument()

    // Forward through quality and quantity to the review step.
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    expect(stepTitle()).toContain('Quality, micro-origins')
    await waitFor(() => expect(screen.getByRole('button', { name: /^Next/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    expect(stepTitle()).toContain('Quantity and shipment')
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    expect(stepTitle()).toContain('Sample photo and review')

    // The review step still shows the link.
    const chip = screen.getByText('#42611/26')
    expect(within(chip.parentElement as HTMLElement).getByText(/Ipanema → Blaser/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Create Sample/ }))
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
      crop_year: '2026/2027',
      bag_type: 'jute_bag',
      bag_count: 320,
      shipment_month: '2026-10',
      certifications: ['Rainforest Alliance'],
      laboratory_id: 'lab-1',
      origin: 'Brazil',
      sample_type: 'type',
    })
  })

  it('stops on Step 2 when the contract leaves a reference blank', async () => {
    ;(fetch as any).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('/api/contracts/c-42611')) {
        return json({ contract: { ...contractRow, buyer_reference: null }, resolution })
      }
      if (url.startsWith('/api/contracts/search')) return json({ contracts: [searchRow] })
      if (url.startsWith('/api/laboratories')) return json({ laboratories: [] })
      return json({ exporters: [], importers: [], roasters: [], clients: [], samples: [] })
    })
    render(<SampleIntakeForm />)
    fireEvent.change(screen.getByPlaceholderText(/Type contract number/), { target: { value: '42611' } })
    fireEvent.click(await screen.findByText('#42611/26', {}, { timeout: 4000 }))
    await waitFor(() => expect(stepTitle()).toContain('Supply chain and contract references'), { timeout: 4000 })
    expect(comboboxTexts()).toContain('Ipanema')
    expect(screen.getByDisplayValue('42611/26')).toBeInTheDocument()
  })
})
