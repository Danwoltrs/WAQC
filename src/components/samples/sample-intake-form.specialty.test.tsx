import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The CVA picker's Add sample (Daniel 2026-10-07: "add a add sample button
 * here, which will only add specialty samples"). A lot is specialty because
 * its quality sits on a CVA template, so the specialty intake is the New
 * Sample wizard that only lets a CVA quality through: it lists no other, it
 * drops a commodity quality a draft or a contract filled in, and it does not
 * create a sample without one.
 */

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'cupper@wolthers.com' },
    profile: { id: 'u-1', email: 'cupper@wolthers.com', qc_role: 'lab_personnel', laboratory_id: 'lab-1', is_global_admin: false },
  }),
}))

// The CVA qualities come from quality_templates -> client_qualities; every
// submit-time name lookup finds nothing.
const TABLES: Record<string, any[]> = {
  quality_templates: [{ id: 't-cva', methodology: 'cva' }, { id: 't-com', methodology: 'commodity' }],
  client_qualities: [{ id: 'q-cva', template_id: 't-cva' }, { id: 'q-com', template_id: 't-com' }],
}
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const filters: Array<(r: any) => boolean> = []
      const chain: any = {
        select: () => chain,
        eq: (col: string, v: any) => { filters.push((r) => r[col] === v); return chain },
        in: (col: string, vs: any[]) => { filters.push((r) => vs.includes(r[col])); return chain },
        filter: () => chain, contains: () => chain, ilike: () => chain, or: () => chain, limit: () => chain, order: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: (v: any) => void) =>
          resolve({ data: (TABLES[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
      }
      return chain
    },
  },
}))

import { SampleIntakeForm } from './sample-intake-form'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const SPECS = [
  { id: 'q-cva', custom_name: 'Spec Natural Capoeirinha', template: { id: 't-cva', methodology: 'cva' } },
  { id: 'q-com', custom_name: 'NY2 16/18 FC', template: { id: 't-com', methodology: 'commodity' } },
]

let posted: Array<Record<string, any>>

function stubNetwork() {
  posted = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/api/samples') && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)))
      return json({ sample: { id: 's-new', tracking_number: 'SAN-00999/26' }, siblings: { created: [], failed: [] } }, 201)
    }
    if (url.startsWith('/api/clients/co-daterra/quality-specifications')) return json({ specifications: SPECS })
    if (url.startsWith('/api/clients?is_qc_client=true')) {
      return json({ clients: [{ id: 'co-daterra', company: 'Daterra Coffee', name: 'Daterra Coffee', fantasy_name: 'Daterra' }] })
    }
    if (url.startsWith('/api/laboratories')) {
      return json({ laboratories: [{ id: 'lab-1', name: 'Santos HQ', is_active: true, location: 'Santos, Brazil', country: 'Brazil' }] })
    }
    if (url.startsWith('/api/exporters')) return json({ exporters: [{ id: 'ex-1', name: 'Ipanema' }] })
    if (url.startsWith('/api/importers')) return json({ importers: [] })
    if (url.startsWith('/api/roasters')) return json({ roasters: [] })
    if (url.startsWith('/api/clients')) return json({ clients: [] })
    if (url.startsWith('/api/samples')) return json({ samples: [] })
    return json({ error: `unexpected ${url}` }, 404)
  }))
}

const SPECIALTY_DRAFT = 'sample-intake-form:specialty'
// A type sample for a QC client, carrying a commodity quality: what a draft or
// a contract can leave behind.
const draft = {
  sample_type: 'type',
  seller: 'Ipanema',
  importer_is_qc_client: false,
  qc_client: 'Daterra',
  quality_spec_id: 'q-com',
  quality_name: 'NY2 16/18 FC',
  laboratory_id: 'lab-1',
  origin: 'Brazil',
  bag_type: 'jute_bag',
  bag_weight_kg: '60',
  container_count: '1',
  container_size: "20'",
}

const qualitySelect = () =>
  screen.getAllByRole('combobox').find((el) => el.closest('[data-field="quality_spec"]'))!

async function toDetails() {
  fireEvent.click(await screen.findByRole('button', { name: 'No contract' }))
  await waitFor(() => expect(document.querySelector('[aria-current="step"]')?.textContent).toMatch(/Sample and quantity/))
}

describe('SampleIntakeForm — specialty only', () => {
  beforeEach(() => stubNetwork())
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('says it adds a specialty sample, and offers no Other Sample', async () => {
    render(<SampleIntakeForm specialtyOnly />)
    expect(await screen.findByRole('heading', { name: 'New specialty sample' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Other Sample' })).toBeNull()
    expect(screen.queryByText('Other Sample')).toBeNull()
  })

  it('keeps its own draft: the New Sample draft does not come in, and its own does', async () => {
    localStorage.setItem('sample-intake-form', JSON.stringify({ ...draft, seller: 'From the other form' }))
    localStorage.setItem(SPECIALTY_DRAFT, JSON.stringify(draft))
    render(<SampleIntakeForm specialtyOnly />)
    await toDetails()
    expect(screen.queryByDisplayValue('From the other form')).toBeNull()
    // The general draft is left alone for the New Sample form.
    expect(JSON.parse(localStorage.getItem('sample-intake-form')!).seller).toBe('From the other form')
  })

  it('drops a commodity quality and lists only the specialty ones', async () => {
    localStorage.setItem(SPECIALTY_DRAFT, JSON.stringify(draft))
    render(<SampleIntakeForm specialtyOnly />)
    await toDetails()
    await waitFor(() => expect(qualitySelect()).toHaveTextContent('Select quality'))
    expect(screen.getByTestId('step-issues')).toHaveTextContent('Specialty quality')

    fireEvent.keyDown(qualitySelect(), { key: 'Enter' })
    expect(await screen.findByRole('option', { name: 'Spec Natural Capoeirinha' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'NY2 16/18 FC' })).toBeNull()
  })

  it('creates the sample on the specialty quality once one is picked', async () => {
    const onSuccess = vi.fn()
    localStorage.setItem(SPECIALTY_DRAFT, JSON.stringify(draft))
    render(<SampleIntakeForm specialtyOnly onSuccess={onSuccess} />)
    await toDetails()
    await waitFor(() => expect(qualitySelect()).toHaveTextContent('Select quality'))

    fireEvent.keyDown(qualitySelect(), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('option', { name: 'Spec Natural Capoeirinha' }))
    await waitFor(() => expect(screen.queryByTestId('step-issues')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create sample' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0].quality_spec_id).toBe('q-cva')
    // The host takes the new lot by its id; the form shows no success screen
    // (it would print the internal lab number).
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('SAN-00999/26', 's-new'))
    expect(screen.queryByText('SAN-00999/26')).toBeNull()
    expect(localStorage.getItem(SPECIALTY_DRAFT)).toBeNull()
  })
})
