import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The intake wizard from the keyboard (redesign, 2026-09-28): Enter in a
 * field continues, a Continue pressed too early takes the user to what is
 * missing, the review step never creates on a stray Enter, and completed
 * steps (stepper, Edit links) lead back.
 */

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'u-anderson', email: 'anderson@wolthers.com' },
    profile: { id: 'u-anderson', email: 'anderson@wolthers.com', qc_role: 'lab_personnel', laboratory_id: 'lab-1', is_global_admin: false },
  }),
}))

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
      return json({ sample: { id: 's-new', tracking_number: 'SAN-01066/26' }, siblings: { created: [], failed: [] } }, 201)
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

const COMPLETE_DRAFT = {
  sample_type: 'type', seller: 'Ecom Agroindustrial', exporter_sample_number: 'AS300226',
  importer: 'Floriana', importer_is_qc_client: true, origin: 'Brazil', laboratory_id: 'lab-1',
  bag_type: 'jute_bag', bag_count: '320', bag_weight_kg: '60',
}

const stepTitle = () => document.querySelector('[aria-current="step"]')?.textContent ?? ''
const continueButton = () => screen.getByRole('button', { name: /^Continue/ })
const noContract = () => screen.getByRole('button', { name: 'No contract' })
const noIssuesLeft = () =>
  waitFor(() => expect(screen.queryByTestId('step-issues')).not.toBeInTheDocument(), { timeout: 4000 })

describe('SampleIntakeForm from the keyboard', () => {
  beforeEach(() => stubNetwork())
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('opens Step 2 with the cursor in the sample ref, and Enter there continues once the step is complete', async () => {
    localStorage.setItem('sample-intake-form', JSON.stringify(COMPLETE_DRAFT))
    render(<SampleIntakeForm />)
    fireEvent.click(noContract())
    expect(stepTitle()).toContain('Sample and quantity')
    const sampleRef = screen.getByDisplayValue('AS300226')
    await waitFor(() => expect(sampleRef).toHaveFocus())

    await noIssuesLeft()
    fireEvent.keyDown(sampleRef, { key: 'Enter' })
    expect(stepTitle()).toContain('Review and finish')
    await waitFor(() => expect(screen.getByLabelText(/Arrival date/)).toHaveFocus())
  })

  it('a Continue pressed too early names what is missing and goes to the first of it', async () => {
    localStorage.setItem('sample-intake-form', JSON.stringify({ ...COMPLETE_DRAFT, seller: '' }))
    render(<SampleIntakeForm />)
    fireEvent.click(noContract())
    await waitFor(() => expect(screen.getByTestId('step-issues')).toHaveTextContent('Still needed: Seller'), { timeout: 4000 })

    fireEvent.click(continueButton())
    expect(stepTitle()).toContain('Sample and quantity')
    expect(screen.getByRole('alert')).toHaveTextContent('Still needed: Seller')
    const sellerBox = document.querySelector('[data-field="seller"]') as HTMLElement
    expect(sellerBox.contains(document.activeElement)).toBe(true)
  })

  it('never creates on Enter in the review step; Create is a click', async () => {
    localStorage.setItem('sample-intake-form', JSON.stringify(COMPLETE_DRAFT))
    render(<SampleIntakeForm />)
    fireEvent.click(noContract())
    await noIssuesLeft()
    fireEvent.click(continueButton())
    expect(stepTitle()).toContain('Review and finish')

    fireEvent.keyDown(screen.getByLabelText(/Arrival date/), { key: 'Enter' })
    await new Promise((r) => setTimeout(r, 50))
    expect(posted).toHaveLength(0)
    expect(stepTitle()).toContain('Review and finish')
  })

  it('goes back through a completed step in the stepper, and an Edit link lands on its section', async () => {
    localStorage.setItem('sample-intake-form', JSON.stringify(COMPLETE_DRAFT))
    render(<SampleIntakeForm />)
    fireEvent.click(noContract())
    await noIssuesLeft()
    fireEvent.click(continueButton())

    // The current and later steps are not buttons: nothing is skipped forward.
    expect(screen.queryByRole('button', { name: /Review and finish/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit quantity and shipment' }))
    expect(stepTitle()).toContain('Sample and quantity')
    const quantitySection = document.querySelector('[data-section="quantity"]') as HTMLElement
    await waitFor(() => expect(quantitySection.contains(document.activeElement)).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Back to step 1, Contract' }))
    expect(stepTitle()).toContain('Contract')
  })
})
