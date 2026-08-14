import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecipientCaptureForm } from './recipient-capture'

const CONTACTS = [
  { id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl', isGroup: false },
]

function stubFetch(postImpl?: (body: any) => { ok: boolean; json: any }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/contacts') && (!init || init.method === undefined || init.method === 'GET')) {
      return { ok: true, json: async () => ({ contacts: CONTACTS }) } as Response
    }
    if (u.endsWith('/qc-contacts') && init?.method === 'POST') {
      const body = JSON.parse((init.body as string) || '{}')
      const r = postImpl ? postImpl(body) : { ok: true, json: { contact: { id: 'c9' } } }
      return { ok: r.ok, json: async () => r.json } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => vi.restoreAllMocks())

describe('RecipientCaptureForm — free-type (new) path', () => {
  it('ephemeral add: no POST when save-for-future is unchecked', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'one@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('one@ahold.nl'))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')).toBe(false)
  })

  it('persist: POSTs email + nickname then adds when save-for-future is checked', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'two@ahold.nl' } })
    fireEvent.change(screen.getByPlaceholderText(/nickname/i), { target: { value: 'Twoey' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('two@ahold.nl'))
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({ email: 'two@ahold.nl', nickname: 'Twoey', isGroup: false })
  })

  it('does NOT add when the save POST fails', async () => {
    stubFetch(() => ({ ok: false, json: { error: 'That email already exists for this company.' } }))
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'dupe@ahold.nl' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling onAdd', () => {
    stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('no company → free-type directly, no save checkbox', () => {
    stubFetch()
    render(<RecipientCaptureForm companyId={null} companyName="Unknown" onAdd={() => {}} />)
    expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument()
    expect(screen.queryByLabelText(/save as a QC-certificate recipient/i)).toBeNull()
  })

  it('group inbox: collects a name and posts it, with no nickname field', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.click(screen.getByRole('button', { name: /group inbox/i }))
    expect(screen.queryByPlaceholderText(/nickname/i)).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'qc@ahold.nl' } })
    fireEvent.change(screen.getByPlaceholderText(/^name \(optional/i), { target: { value: 'Ahold QC Team' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('qc@ahold.nl'))
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({
      email: 'qc@ahold.nl',
      name: 'Ahold QC Team',
      nickname: null,
      isGroup: true,
    })
  })
})

describe('RecipientCaptureForm — pick existing path', () => {
  it('picking a contact then saving POSTs that contact email + nickname', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    // Open the combobox and pick the loaded contact.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('combobox'))
    await waitFor(() => expect(screen.getByText(/Joost Pollmann — joost@ahold\.nl/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Joost Pollmann — joost@ahold\.nl/))
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('joost@ahold.nl'))
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({ email: 'joost@ahold.nl', nickname: 'Joost', isGroup: false })
  })
})
