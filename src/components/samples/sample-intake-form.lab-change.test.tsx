import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * A quality spec belongs to one laboratory. The intake matched the linked
 * contract's quality among the laboratory it was in; moving the sample to
 * another laboratory drops that spec and matches the contract again among
 * the new laboratory's specs, so the sample is never saved on another
 * laboratory's spec.
 */

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'u-admin', email: 'admin@wolthers.com' },
    profile: { id: 'u-admin', email: 'admin@wolthers.com', qc_role: 'global_admin', laboratory_id: 'lab-1', is_global_admin: true },
  }),
}))

// Every lookup finds nothing (lists come back empty).
vi.mock('@/lib/supabase', () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => (prop === 'maybeSingle' || prop === 'single'
      ? async () => ({ data: null, error: null })
      : prop === 'then'
        ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
        : () => chain),
  })
  return { supabase: { from: () => chain } }
})

import { SampleIntakeForm } from './sample-intake-form'

const contractRow = {
  id: 'c-42611', contract_number: '42611/26', split_suffix: null, parent_contract_id: null, family: [],
  status: 'active', contract_date: '2026-09-01', crop: '2026/2027', volume_bags: 320,
  bag_type: 'BAGS OF 60 KG EACH', bag_weight_kg: 60, quality_description: 'NY 2, 16/18, Fine Cup',
  shipment_period_start: '2026-10-01', shipment_period_end: null, seller_reference: '027/26',
  buyer_reference: '107048', certifications: [], seller_id: 'co-ipanema', buyer_id: 'co-blaser',
  shipper_id: null, end_buyer_id: null,
  seller: { id: 'co-ipanema', fantasy_name: 'Ipanema', name: 'Ipanema Agrícola S.A.' },
  buyer: { id: 'co-blaser', fantasy_name: 'Blaser', name: 'Blaser Trading AG' },
  shipper: null, end_buyer: null,
}

// Each laboratory holds its own spec for the contract's quality.
const resolutionIn = (labId: string | null) => {
  const specId = labId === 'lab-2' ? 'spec-lab-2' : 'spec-lab-1'
  return {
    resolved_client_id: 'co-blaser', importer_is_qc_client: true, resolved_importer_id: null,
    candidate_seller_exporter_ids: ['co-ipanema'], candidate_shipper_exporter_ids: [],
    multiple_seller_matches: false, multiple_shipper_matches: false,
    resolved_quality_spec_id: specId,
    quality_match: { spec_id: specId, confidence: 'high', source_text: 'NY 2, 16/18, Fine Cup' },
  }
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
let contractReads: string[]

function stubNetwork() {
  posted = []
  contractReads = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/api/samples') && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)))
      return json({ sample: { id: 's-new', exporter_sample_number: '148' }, siblings: { created: [], failed: [] } }, 201)
    }
    if (url.startsWith('/api/contracts/search')) return json({ contracts: [searchRow] })
    if (url.startsWith('/api/contracts/c-42611')) {
      contractReads.push(url)
      const lab = new URL(url, 'http://x').searchParams.get('laboratory_id')
      return json({ contract: contractRow, resolution: resolutionIn(lab) })
    }
    if (url.startsWith('/api/laboratories')) {
      return json({
        laboratories: [
          { id: 'lab-1', name: 'Santos HQ', is_active: true, location: 'Santos, Brazil', country: 'Brazil' },
          { id: 'lab-2', name: 'Minas Lab', is_active: true, location: 'Varginha, Brazil', country: 'Brazil' },
        ],
      })
    }
    if (url.startsWith('/api/exporters')) return json({ exporters: [] })
    if (url.startsWith('/api/importers')) return json({ importers: [] })
    if (url.startsWith('/api/roasters')) return json({ roasters: [] })
    if (url.startsWith('/api/clients')) return json({ clients: [], specifications: [] })
    if (url.startsWith('/api/samples')) return json({ samples: [] })
    return json({ error: `unexpected ${url}` }, 404)
  }))
}

const stepTitle = () => document.querySelector('[aria-current="step"]')?.textContent ?? ''

describe('SampleIntakeForm — moving the sample to another laboratory', () => {
  beforeEach(() => {
    stubNetwork()
    localStorage.setItem('sample-intake-form', JSON.stringify({ sample_type: 'type' }))
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('drops the old laboratory\'s spec and saves the one the contract matches in the new laboratory', async () => {
    render(<SampleIntakeForm />)
    fireEvent.change(screen.getByPlaceholderText(/Contract nr, seller or buyer reference/), { target: { value: '42611' } })
    fireEvent.click(await screen.findByText('#42611/26', {}, { timeout: 4000 }))
    await waitFor(() => expect(stepTitle()).toContain('Sample and quantity'), { timeout: 4000 })
    expect(contractReads.at(-1)).toContain('laboratory_id=lab-1')

    const lab = screen.getByRole('combobox', { name: 'Laboratory' })
    fireEvent.keyDown(lab, { key: 'Enter' })
    fireEvent.keyDown(await screen.findByRole('option', { name: 'Minas Lab' }), { key: 'Enter' })

    await waitFor(() => expect(contractReads.at(-1)).toContain('laboratory_id=lab-2'))

    await waitFor(() => expect(screen.queryByTestId('step-issues')).not.toBeInTheDocument(), { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Create sample/ }))
    await waitFor(() => expect(posted).toHaveLength(1), { timeout: 4000 })
    expect(posted[0]).toMatchObject({
      laboratory_id: 'lab-2',
      quality_spec_id: 'spec-lab-2',
      quality_name: 'NY 2, 16/18, Fine Cup',
      contract_id: 'c-42611',
    })
  })
})
