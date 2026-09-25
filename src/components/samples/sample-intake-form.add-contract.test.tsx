import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * "+ Add Sub-Contract" in the intake wizard, end to end through the form's own
 * handler and its POST body.
 *
 * One physical sample covering several contracts is usually one package with
 * one sample nr (Ecom AS300226 for 42885/26 and 42886/26). The button used to
 * step that number (AS300226 -> AS300227) and copy the parent's buyer ref onto
 * the new contract; a contract left alone was then saved with a number and a
 * ref that were not its own. A new contract now carries the parent's sample
 * nr (editable) and blank contract references.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let posted: Array<Record<string, any>>

function stubNetwork() {
  posted = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/api/samples') && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)))
      return json({ sample: { id: 's-new', tracking_number: 'SAN-01065/26' }, siblings: { created: [], failed: [] } }, 201)
    }
    if (url.startsWith('/api/contracts/search')) return json({ contracts: [] })
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

describe('SampleIntakeForm — "+ Add Sub-Contract"', () => {
  beforeEach(() => {
    stubNetwork()
    // The parent as Step 2 left it: its own sample nr and references.
    localStorage.setItem('sample-intake-form', JSON.stringify({
      sample_type: 'pss', seller: 'Ecom Agroindustrial', seller_contract_nr: '4155263042',
      exporter_sample_number: 'AS300226', importer: 'Floriana', importer_contract_nr: 'IR-42885', importer_is_qc_client: true,
      supplier_contract_nr: 'FARM-1', origin: 'Brazil', quality_spec_id: 'spec-1', laboratory_id: 'lab-1',
      bag_type: 'jute_bag', bag_count: '320', bag_weight_kg: '60',
    }))
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('gives every added contract the parent\'s sample nr and none of its references', async () => {
    render(<SampleIntakeForm />)
    for (const title of ['Supply chain and contract references', 'Quality, micro-origins', 'Quantity and shipment', 'Sample photo and review']) {
      await waitFor(() => expect(screen.getByRole('button', { name: /^Next/ })).toBeEnabled(), { timeout: 4000 })
      fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
      expect(stepTitle()).toContain(title)
    }
    fireEvent.click(screen.getByRole('button', { name: /Add Sub-Contracts/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add Sub-Contract$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add Sub-Contract$/ }))

    const sampleRefs = (screen.getAllByPlaceholderText('Sample ref.') as HTMLInputElement[]).map((i) => i.value)
    expect(sampleRefs).toEqual(['AS300226', 'AS300226'])

    fireEvent.click(screen.getByRole('button', { name: /Submit All/ }))
    await waitFor(() => expect(posted).toHaveLength(1), { timeout: 4000 })
    const body = posted[0]
    expect(body.exporter_sample_number).toBe('AS300226')
    expect(body.contracts.map((c: any) => c.exporter_sample_number)).toEqual(['AS300226', 'AS300226'])
    for (const c of body.contracts) {
      expect(c).toMatchObject({
        supplier_contract_nr: null, buyer_contract_nr: null, roaster_contract_nr: null,
        qc_client_contract_nr: null, end_client_contract_nr: null, wolthers_contract_nr: null,
      })
    }
  })
})
