import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * An SS linked to an approved PSS ships against the PSS's OWN contract, and
 * that contract's own number.
 *
 * sys splits a contract into a suffix family sharing one base contract_number
 * (42089/26A, /26B, /26C) that differs only by split_suffix. Bug: linking a PSS
 * registered against sub-contract B compared the contract's bare "42089/26"
 * with the PSS's "42089/26B", read that as a mislink and silently dropped the
 * link; the SS then reached the review step with no contract, and the only way
 * to relink showed the whole family as identical "#42089/26" rows — mother
 * first. The SS ended up filed on, and filled from, the mother.
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

const ipanema = { id: 'co-ipanema', fantasy_name: 'Ipanema', name: 'Ipanema Agrícola S.A.' }
const blaser = { id: 'co-blaser', fantasy_name: 'Blaser', name: 'Blaser Trading AG' }

const contractBase = {
  status: 'active', contract_date: '2026-09-01', crop: '2026/2027', bag_type: 'BAGS OF 60 KG EACH', bag_weight_kg: 60,
  quality_description: 'NY 2, 16/18, Fine Cup', shipment_period_start: '2026-10-01', shipment_period_end: null,
  seller_reference: '027/26', certifications: [], seller_id: 'co-ipanema', buyer_id: 'co-blaser', shipper_id: null, end_buyer_id: null,
  seller: ipanema, buyer: blaser, shipper: null, end_buyer: null,
}
const solo = { ...contractBase, id: 'c-solo', contract_number: '42611/26', split_suffix: null, parent_contract_id: null, family: [], volume_bags: 320, buyer_reference: '107048' }
const member = (id: string, split_suffix: string, relation: string) => ({
  id, contract_number: '42089/26', split_suffix, status: 'active', parent_contract_id: id === 'c-a' ? null : 'c-a', relation,
  buyer_reference: `${split_suffix}-REF`, seller_reference: '027/26', volume_bags: 100, bag_type: 'BAGS OF 60 KG EACH', shipment_period_start: '2026-10-01', buyer: blaser, end_buyer: null,
})
const family = (self: string) => ['c-a', 'c-b', 'c-c', 'c-d'].filter((id) => id !== self).map((id) =>
  member(id, id.slice(-1).toUpperCase(), id === 'c-a' ? 'parent' : self === 'c-a' ? 'child' : 'sibling'))
const mother = { ...contractBase, id: 'c-a', contract_number: '42089/26', split_suffix: 'A', parent_contract_id: null, family: family('c-a'), volume_bags: 320, buyer_reference: 'A-REF' }
const subB = { ...contractBase, id: 'c-b', contract_number: '42089/26', split_suffix: 'B', parent_contract_id: 'c-a', family: family('c-b'), volume_bags: 100, buyer_reference: 'B-REF' }
const subC = { ...contractBase, id: 'c-c', contract_number: '42089/26', split_suffix: 'C', parent_contract_id: 'c-a', family: family('c-c'), volume_bags: 120, buyer_reference: 'C-REF' }
const contracts: Record<string, any> = { 'c-solo': solo, 'c-a': mother, 'c-b': subB, 'c-c': subC }

const resolution = {
  resolved_client_id: 'co-blaser', importer_is_qc_client: true, resolved_importer_id: null,
  candidate_seller_exporter_ids: ['co-ipanema'], candidate_shipper_exporter_ids: [],
  multiple_seller_matches: false, multiple_shipper_matches: false, resolved_quality_spec_id: null, quality_match: null,
}

// The flattened shape GET /api/samples returns for an approved PSS lab unit.
const pssBase = {
  sample_type: 'pss', status: 'approved', lab_source_sample_id: null, contract_ordinal: 1,
  seller_name: 'Ipanema', seller_legal_name: 'Ipanema Agrícola S.A.', exporter_name: 'Ipanema', exporter_legal_name: 'Ipanema Agrícola S.A.',
  same_seller_shipper: true, importer_name: 'Blaser', importer_is_qc_client: true, client_id: 'co-blaser', qc_client_name: 'Blaser',
  roaster_name: null, end_client_name: null, seller_contract_nr: '027/26', origin: 'Brazil', quality_spec_id: 'spec-1',
  quality_name: 'NY 2, 16/18, Fine Cup', crop_year: '2026/2027', bag_type: 'jute_bag', bag_weight_kg: 60,
  certifications: [], shipment_month: '2026-10',
}
const pssSolo = {
  ...pssBase, id: 'pss-solo', tracking_number: 'SAN-00100/26', certificate_id: 'cert-solo', certificate_number: 'BR-036980/26',
  contract_id: 'c-solo', wolthers_contract_nr: '42611/26', buyer_contract_nr: '107048', bag_count: 320, bags_quantity_mt: 19.2, equivalent_60kg_bags: 320,
  sub_contracts: [],
}
// A lot covering the whole family: the lab unit is contract A, siblings B/C/D
// are samples of their own. Their stored number is the BARE family number,
// as the 2026-09-15 backfill wrote it from contracts.contract_number.
const sibling = (id: string, letter: string, contract_id: string, bag_count: number, wolthers_contract_nr = '42089/26') => ({
  id, tracking_number: `SAN-0020${letter}/26`, contract_ordinal: 'BCD'.indexOf(letter) + 2, importer_name: 'Blaser', roaster_name: null,
  end_client_name: null, qc_client_name: 'Blaser', client_id: 'co-blaser', importer_is_qc_client: true,
  buyer_contract_nr: `${letter}-REF`, wolthers_contract_nr, contract_id, roaster_contract_nr: null, end_client_contract_nr: null,
  qc_client_contract_nr: null, supplier_contract_nr: null, ico_number: null, container_nr: null, exporter_sample_number: `EXP-${letter}`,
  bag_count, bag_weight_kg: 60, bag_type: 'jute_bag', bags_quantity_mt: bag_count * 0.06, equivalent_60kg_bags: bag_count,
  container_count: null, shipment_month: '2026-10', has_certificate: true, certificate_id: `cert-${letter}`,
  certificate_number: `BR-03699${letter === 'B' ? 5 : letter === 'C' ? 6 : 7}/26`, status: 'approved', workflow_stage: 'certified',
  deleted_at: null, deleted_reason: null, deleted_by_name: null,
})
const pssFamily = {
  ...pssBase, id: 'pss-a', tracking_number: 'SAN-00200/26', certificate_id: 'cert-a', certificate_number: 'BR-036991/26',
  contract_id: 'c-a', wolthers_contract_nr: '42089/26', buyer_contract_nr: 'A-REF', bag_count: 320, bags_quantity_mt: 19.2, equivalent_60kg_bags: 320,
  sub_contracts: [
    sibling('pss-b', 'B', 'c-b', 100),
    // Mislinked on purpose: its number says B while its FK is C.
    sibling('pss-c', 'C', 'c-c', 120, '42089/26B'),
    sibling('pss-d', 'D', 'c-d', 140),
  ],
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
    if (url.startsWith('/api/samples?sample_type=pss')) return json({ samples: [pssSolo, pssFamily] })
    if (url.startsWith('/api/contracts/search')) return json({ contracts: [] })
    const contractId = url.match(/^\/api\/contracts\/([^/?]+)/)?.[1]
    if (contractId) {
      const contract = contracts[contractId]
      return contract ? json({ contract, resolution }) : json({ error: 'Contract not found' }, 404)
    }
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
const pssPicker = () =>
  screen.getAllByRole('combobox').find((el) => el.textContent?.includes('Search by certificate')) as HTMLElement

async function linkPss(optionLabel: string) {
  await waitFor(() => expect(pssPicker()).toBeDefined(), { timeout: 4000 })
  fireEvent.click(pssPicker())
  fireEvent.click(await screen.findByText(optionLabel, {}, { timeout: 4000 }))
}

async function walkToReviewAndSubmit() {
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
  expect(stepTitle()).toContain('Supply chain and contract references')
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
  expect(stepTitle()).toContain('Quality, micro-origins')
  await waitFor(() => expect(screen.getByRole('button', { name: /^Next/ })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
  expect(stepTitle()).toContain('Quantity and shipment')
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
  expect(stepTitle()).toContain('Sample photo and review')
  fireEvent.click(screen.getByRole('button', { name: /Create Sample/ }))
  await waitFor(() => expect(posted).toHaveLength(1), { timeout: 4000 })
  return posted[0]
}

describe('SampleIntakeForm — an SS linked to a PSS', () => {
  beforeEach(() => {
    stubNetwork()
    localStorage.setItem('sample-intake-form', JSON.stringify({ sample_type: 'ss' }))
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('files on the PSS\'s own sub-contract, under that contract\'s own number, with the sub-contract\'s figures', async () => {
    render(<SampleIntakeForm />)
    await linkPss('BR-036995/26 · Blaser · Brazil')
    await screen.findByText(/Linked PSS #BR-036995\/26/)

    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    // The badge names the sub-contract as sys prints it, not the family's bare number.
    await screen.findByText('Linked to contract #42089/26B', {}, { timeout: 4000 })
    expect(screen.getByDisplayValue('42089/26B')).toBeInTheDocument()
    expect(screen.getByDisplayValue('B-REF')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))

    const body = await walkToReviewAndSubmit()
    expect(body).toMatchObject({
      sample_type: 'ss',
      linked_pss_sample_id: 'pss-b',
      contract_id: 'c-b',
      wolthers_contract_nr: '42089/26B',
      buyer_contract_nr: 'B-REF',
      bag_count: 100,
    })
    // Nothing of the mother's.
    expect(body.contracts ?? []).toEqual([])
  })

  it('takes the PSS\'s contract link over its stale number: the link IS the contract', async () => {
    render(<SampleIntakeForm />)
    await linkPss('BR-036996/26 · Blaser · Brazil')
    await screen.findByText(/Linked PSS #BR-036996\/26/)
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    await screen.findByText('Linked to contract #42089/26C', {}, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))

    const body = await walkToReviewAndSubmit()
    expect(body).toMatchObject({ linked_pss_sample_id: 'pss-c', contract_id: 'c-c', wolthers_contract_nr: '42089/26C', buyer_contract_nr: 'C-REF' })
  })

  it('files on a standalone contract the same way', async () => {
    render(<SampleIntakeForm />)
    await linkPss('BR-036980/26 · Ipanema · Brazil')
    await screen.findByText(/Linked PSS #BR-036980\/26/)
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    await screen.findByText('Linked to contract #42611/26', {}, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))

    const body = await walkToReviewAndSubmit()
    expect(body).toMatchObject({ linked_pss_sample_id: 'pss-solo', contract_id: 'c-solo', wolthers_contract_nr: '42611/26', buyer_contract_nr: '107048', bag_count: 320 })
  })

  it('an SS with no PSS carries no contract link at all', async () => {
    localStorage.setItem('sample-intake-form', JSON.stringify({
      sample_type: 'ss', seller: 'Ipanema Agrícola S.A.', importer: 'Blaser', importer_is_qc_client: true,
      origin: 'Brazil', quality_spec_id: 'spec-1', bag_type: 'jute_bag', bag_count: '10', bag_weight_kg: '60', bags_quantity_mt: '0.6',
    }))
    render(<SampleIntakeForm />)
    await waitFor(() => expect(pssPicker()).toBeDefined(), { timeout: 4000 })
    expect(screen.getByText(/No PSS linked yet/)).toBeInTheDocument()

    const body = await walkToReviewAndSubmit()
    expect(body.sample_type).toBe('ss')
    expect(body.linked_pss_sample_id).toBeUndefined()
    expect(body.contract_id).toBeUndefined()
  })
})
