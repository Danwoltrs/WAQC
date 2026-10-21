import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ profile: { laboratory_id: 'lab-1', email: 'd@w.com' } }),
}))

const tables: Record<string, any[]> = {
  companies: [
    { id: 'seller-1', name: 'Cooxupé', fantasy_name: 'Cooxupe' },
    { id: 'buyer-1', name: 'Buyer GmbH', fantasy_name: 'Buyer' },
  ],
  couriers: [{ id: 'c1', name: 'DHL' }],
  contacts: [{ id: 'ct1', name: 'Anna', email: 'anna@buyer.de' }],
}
vi.mock('@/lib/supabase', () => {
  const chain = (table: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => Promise.resolve({ data: tables[table] ?? [] }),
    }
    return q
  }
  return { supabase: { from: (t: string) => chain(t) } }
})

// The cmdk combobox is not what's under test: a plain select stands in.
vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ options, value, onValueChange, placeholder }: any) => (
    <select aria-label={placeholder} value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}))

vi.mock('@/components/samples/print-labels-dialog', () => ({
  PrintLabelsDialog: ({ open }: { open: boolean }) => (open ? <div>print-dialog-open</div> : null),
}))

import { OfferSampleIntake } from './offer-sample-intake'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/laboratories') {
      return new Response(JSON.stringify({ laboratories: [{ id: 'lab-1', name: 'Santos', is_active: true }] }))
    }
    if (url === '/api/samples' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ sample: { id: 'new-1', offer_number: 'TS-0042/26' } }),
        { status: 201 },
      )
    }
    if (url.endsWith('/recipients')) {
      return new Response(JSON.stringify({ recipients: [] }), { status: 201 })
    }
    return new Response('{}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function postedSample() {
  const call = fetchMock.mock.calls.find(([u, i]) => u === '/api/samples' && i?.method === 'POST')
  return JSON.parse(call![1].body)
}

async function fillRequired() {
  await screen.findAllByRole('option', { name: 'Cooxupe' })
  fireEvent.change(screen.getByLabelText('Who is selling this coffee?'), { target: { value: 'seller-1' } })
  fireEvent.change(screen.getByPlaceholderText(/NY 2\/3/), {
    target: { value: 'NY 2/3 17/18 fine cup\nCerrado, semi-washed' },
  })
}

describe('OfferSampleIntake (stocklot / type)', () => {
  it('asks for no contract and saves seller + open quality text', async () => {
    render(<OfferSampleIntake sampleType="stocklot" />)

    expect(screen.queryByText(/contract \*/i)).toBeNull()
    const save = screen.getByRole('button', { name: /save stocklot sample/i })
    expect(save).toBeDisabled()

    await fillRequired()
    await waitFor(() => expect(save).not.toBeDisabled())
    fireEvent.click(save)

    expect(await screen.findByText('TS-0042/26')).toBeInTheDocument()
    const body = postedSample()
    expect(body).toMatchObject({
      sample_category: 'other',
      sample_type: 'stocklot',
      seller_id: 'seller-1',
      laboratory_id: 'lab-1',
      quality_name: 'NY 2/3 17/18 fine cup',
      quality_description: 'NY 2/3 17/18 fine cup\nCerrado, semi-washed',
      qc_in_house: false,
    })
    expect(body.contract_id).toBeUndefined()
    // No in-house QC → no QR label offered.
    expect(screen.queryByRole('button', { name: /print qr label/i })).toBeNull()
  })

  it('offers the QR label only when the lab cups and grades it', async () => {
    render(<OfferSampleIntake sampleType="type" />)
    await fillRequired()
    fireEvent.click(screen.getByRole('switch', { name: /cup and grade in house/i }))
    fireEvent.click(screen.getByRole('button', { name: /save type sample/i }))

    const qr = await screen.findByRole('button', { name: /print qr label/i })
    expect(postedSample()).toMatchObject({ sample_type: 'type', qc_in_house: true, status: 'received' })
    fireEvent.click(qr)
    expect(screen.getByText('print-dialog-open')).toBeInTheDocument()
  })

  it('records who it was sent to as a recipient, without the lab flow', async () => {
    render(<OfferSampleIntake sampleType="stocklot" />)
    await fillRequired()
    fireEvent.change(screen.getByLabelText('Prospective buyer'), { target: { value: 'buyer-1' } })
    await screen.findByRole('option', { name: 'Anna' })
    fireEvent.change(screen.getByDisplayValue('— Any contact —'), { target: { value: 'ct1' } })
    fireEvent.click(screen.getByRole('button', { name: /save stocklot sample/i }))

    await screen.findByText('TS-0042/26')
    expect(postedSample().status).toBe('sent_to_clients')
    const rec = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/recipients'))
    expect(rec![0]).toBe('/api/samples/new-1/recipients')
    expect(JSON.parse(rec![1].body)).toEqual({
      recipients: [{ client_id: 'buyer-1', contact_emails: ['anna@buyer.de'] }],
    })
  })
})
