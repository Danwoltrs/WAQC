import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecipientCaptureForm } from './recipient-capture'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('RecipientCaptureForm', () => {
  it('adds an email ephemerally without POSTing when save-for-future is unchecked', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'one@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('one@ahold.nl'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs to qc-contacts then adds the email when save-for-future is checked', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok: true, json: async () => ({ contact: { id: 'c9' } }) } as Response))
    vi.stubGlobal('fetch', fetchMock)
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'two@ahold.nl' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('two@ahold.nl'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/companies/co1/qc-contacts')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ email: 'two@ahold.nl', isGroup: false })
  })

  it('does NOT add the email when the save POST fails', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'That email already exists for this company.' }) } as Response))
    vi.stubGlobal('fetch', fetchMock)
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'dupe@ahold.nl' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling onAdd', () => {
    vi.stubGlobal('fetch', vi.fn())
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('hides the save-for-future checkbox when there is no company', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<RecipientCaptureForm companyId={null} companyName="Unknown" onAdd={() => {}} />)
    expect(screen.queryByLabelText(/save as a QC-certificate recipient/i)).toBeNull()
  })
})
