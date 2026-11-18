// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DestinationOption } from '@/lib/seller-requests/destinations'
import type { BuyerSampleDestination } from '@/lib/seller-requests/types'
import { DestinationPicker } from './destination-picker'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const dest = (over: Partial<BuyerSampleDestination>): BuyerSampleDestination => ({
  companyId: 'blaser', companyName: 'Blaser', savedAddressId: null, lines: [], country: null,
  recipientName: null, attention: null, phone: null, instructions: null, ...over,
})

const lager = dest({ savedAddressId: 'addr-lager', lines: ['Industriestrasse 12', '8304 Wallisellen'], country: 'Switzerland' })
const guter = dest({ lines: ['Guterstrasse 4', 'CH-3001 Bern'], country: 'Switzerland' })

const options: DestinationOption[] = [
  { key: 'saved:addr-lager', section: 'saved', sectionTitle: 'Saved for Blaser', destination: lager },
  { key: 'company:blaser', section: 'company', sectionTitle: 'Blaser company address', destination: guter },
]

let posts: unknown[] = []
let postReply: { destination: BuyerSampleDestination; duplicate: boolean } = { destination: lager, duplicate: true }

beforeEach(() => {
  posts = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/companies/blaser/sample-destinations') && init?.method === 'POST') {
      posts.push(JSON.parse(init.body as string))
      return { ok: true, json: async () => postReply } as Response
    }
    if (u.startsWith('/api/companies/blaser/sample-destinations')) {
      return { ok: true, json: async () => ({ options }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

const renderPicker = (value: BuyerSampleDestination | null = null) => {
  const onChange = vi.fn()
  render(
    <DestinationPicker
      clientId="blaser"
      clientName="Blaser"
      importerId={null}
      roasterId={null}
      value={value}
      onChange={onChange}
    />,
  )
  return onChange
}

const trigger = () => screen.getByRole('combobox', { name: /^Sample address/ })
const openPicker = async () => {
  fireEvent.click(trigger())
  await screen.findByText(/Guterstrasse 4/)
}

describe('DestinationPicker', () => {
  it('lists the sections from the destinations route and shows the picked address', async () => {
    renderPicker(guter)
    // The picked address is part of the trigger's accessible name.
    expect(screen.getByRole('combobox', { name: 'Sample address: Blaser' }).textContent).toContain('Guterstrasse 4')
    await openPicker()
    expect(screen.getByText('Saved for Blaser')).toBeInTheDocument()
    expect(screen.getByText('Blaser company address')).toBeInTheDocument()
    const url = vi.mocked(fetch).mock.calls.map(([u]) => String(u)).find((u) => u.includes('sample-destinations'))!
    expect(url.startsWith('/api/companies/blaser/sample-destinations')).toBe(true)
  })

  it('typing Gut filters to the Guterstrasse option', async () => {
    renderPicker()
    await openPicker()
    expect(screen.getByText(/Industriestrasse 12/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search addresses…'), { target: { value: 'Gut' } })
    await waitFor(() => expect(screen.queryByText(/Industriestrasse 12/)).toBeNull())
    expect(screen.getByText(/Guterstrasse 4/)).toBeInTheDocument()
  })

  it('picking an option hands its destination over', async () => {
    const onChange = renderPicker()
    await openPicker()
    fireEvent.click(screen.getByText(/Guterstrasse 4/))
    expect(onChange).toHaveBeenCalledWith(guter)
  })

  it('saves a new address as {label, lines}; a duplicate reply selects the existing one', async () => {
    postReply = { destination: lager, duplicate: true }
    const onChange = renderPicker()
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: '+ New address for Blaser…' }))
    fireEvent.change(screen.getByLabelText('Label *'), { target: { value: 'Lager' } })
    fireEvent.change(screen.getByLabelText('Address *'), { target: { value: 'Industriestrasse 12\n8304 Wallisellen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(lager))
    expect(posts).toEqual([{ label: 'Lager', lines: 'Industriestrasse 12\n8304 Wallisellen' }])
    expect(await screen.findByText('Already saved')).toBeInTheDocument()
  })

  it('sends the optional fields only when they are filled in', async () => {
    const fresh = dest({ savedAddressId: 'addr-new', lines: ['Hafenstrasse 1'], attention: 'Lab' })
    postReply = { destination: fresh, duplicate: false }
    const onChange = renderPicker()
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: '+ New address for Blaser…' }))
    fireEvent.change(screen.getByLabelText('Label *'), { target: { value: 'Port' } })
    fireEvent.change(screen.getByLabelText('Address *'), { target: { value: 'Hafenstrasse 1' } })
    fireEvent.change(screen.getByLabelText('ATTN'), { target: { value: 'Lab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(fresh))
    expect(posts).toEqual([{ label: 'Port', lines: 'Hafenstrasse 1', attention: 'Lab' }])
    expect(screen.queryByText('Already saved')).toBeNull()
  })

  it('files a newly saved address under the existing saved section, not a second one', async () => {
    const fresh = dest({ savedAddressId: 'addr-new', lines: ['Hafenstrasse 1'] })
    postReply = { destination: fresh, duplicate: false }
    const onChange = vi.fn()
    const { rerender } = render(
      <DestinationPicker clientId="blaser" clientName="Blaser AG" importerId={null} roasterId={null} value={null} onChange={onChange} />,
    )
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: '+ New address for Blaser AG…' }))
    fireEvent.change(screen.getByLabelText('Label *'), { target: { value: 'Port' } })
    fireEvent.change(screen.getByLabelText('Address *'), { target: { value: 'Hafenstrasse 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(fresh))
    rerender(
      <DestinationPicker clientId="blaser" clientName="Blaser AG" importerId={null} roasterId={null} value={fresh} onChange={onChange} />,
    )
    fireEvent.click(trigger())
    // The trigger and the new option both show it.
    await waitFor(() => expect(screen.getAllByText(/Hafenstrasse 1/)).toHaveLength(2))
    expect(screen.getAllByText('Saved for Blaser')).toHaveLength(1)
    expect(screen.queryByText('Saved for Blaser AG')).toBeNull()
  })

  it('clears a load error when the retry starts', async () => {
    let fail = true
    let release!: () => void
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (fail) return { ok: false, json: async () => ({ error: 'Could not load the sample destinations' }) } as Response
      await new Promise<void>((r) => (release = r))
      return { ok: true, json: async () => ({ options }) } as Response
    }))
    renderPicker()
    fireEvent.click(trigger())
    expect(await screen.findByText('Could not load the sample destinations')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Could not load the sample destinations')).toBeNull())
    fail = false
    fireEvent.click(trigger())
    expect(await screen.findByText('Loading addresses…')).toBeInTheDocument()
    expect(screen.queryByText('Could not load the sample destinations')).toBeNull()
    release()
    expect(await screen.findByText(/Guterstrasse 4/)).toBeInTheDocument()
  })

  it('a different client drops the half-filled form and the note', async () => {
    postReply = { destination: lager, duplicate: true }
    const onChange = vi.fn()
    const { rerender } = render(
      <DestinationPicker clientId="blaser" clientName="Blaser" importerId={null} roasterId={null} value={null} onChange={onChange} />,
    )
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: '+ New address for Blaser…' }))
    fireEvent.change(screen.getByLabelText('Label *'), { target: { value: 'Lager' } })
    fireEvent.change(screen.getByLabelText('Address *'), { target: { value: 'Industriestrasse 12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByText('Already saved')).toBeInTheDocument()
    fireEvent.click(trigger())
    await screen.findByText(/Guterstrasse 4/)
    fireEvent.click(screen.getByRole('button', { name: '+ New address for Blaser…' }))
    fireEvent.change(screen.getByLabelText('Label *'), { target: { value: 'Half typed' } })
    rerender(
      <DestinationPicker clientId="ahold" clientName="Ahold" importerId={null} roasterId={null} value={null} onChange={onChange} />,
    )
    expect(screen.queryByText('Already saved')).toBeNull()
    expect(screen.queryByLabelText('Label *')).toBeNull()
  })

  it('keeps Save off until the label and the address are filled in', async () => {
    renderPicker()
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: '+ New address for Blaser…' }))
    const save = screen.getByRole('button', { name: 'Save address' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Label *'), { target: { value: 'Lager' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Address *'), { target: { value: 'Street 1' } })
    expect(save).not.toBeDisabled()
  })
})
