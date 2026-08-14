import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SaveContactPrompt } from './save-contact-prompt'

const SAVED = {
  id: 'c9',
  company_id: 'co1',
  email: 'jan@ahold.nl',
  name: 'Jan Bakker',
  nickname: null,
  phone: null,
  whatsapp: null,
  preferred_language: 'en',
  is_group: false,
  is_primary: null,
  is_active: true,
  routing_purposes: ['qc_certificates'],
}

function stubFetch(result: { ok: boolean; json: any } = { ok: true, json: { contact: SAVED } }) {
  const fetchMock = vi.fn(async () => ({ ok: result.ok, json: async () => result.json }) as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function body(fetchMock: ReturnType<typeof stubFetch>) {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
}

beforeEach(() => vi.restoreAllMocks())

describe('SaveContactPrompt', () => {
  it('POSTs a person with name and nickname', async () => {
    const fetchMock = stubFetch()
    const onSaved = vi.fn()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={onSaved}
        onSkip={() => {}}
      />,
    )
    // Anchored: /name/i would also match the "Nickname …" placeholder.
    fireEvent.change(screen.getByPlaceholderText(/^name \(optional/i), { target: { value: 'Jan Bakker' } })
    fireEvent.change(screen.getByPlaceholderText(/nickname/i), { target: { value: 'Jan' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED))
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/companies/co1/qc-contacts')
    expect(body(fetchMock)).toEqual({
      email: 'jan@ahold.nl',
      name: 'Jan Bakker',
      nickname: 'Jan',
      isGroup: false,
    })
  })

  it('POSTs a group inbox with a name and no nickname', async () => {
    const fetchMock = stubFetch()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="qc@ahold.nl"
        onSaved={() => {}}
        onSkip={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /group inbox/i }))
    expect(screen.queryByPlaceholderText(/nickname/i)).toBeNull()
    fireEvent.change(screen.getByPlaceholderText(/^name \(optional/i), { target: { value: 'Ahold QC Team' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(body(fetchMock)).toEqual({
      email: 'qc@ahold.nl',
      name: 'Ahold QC Team',
      nickname: null,
      isGroup: true,
    })
  })

  it('sends a null name when the field is left blank', async () => {
    const fetchMock = stubFetch()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={() => {}}
        onSkip={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(body(fetchMock)).toMatchObject({ name: null, nickname: null })
  })

  it('keeps the panel open with the server message when the save fails', async () => {
    stubFetch({ ok: false, json: { error: 'That email already exists for this company.' } })
    const onSaved = vi.fn()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={onSaved}
        onSkip={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('calls onSkip without any request', async () => {
    const fetchMock = stubFetch()
    const onSkip = vi.fn()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={() => {}}
        onSkip={onSkip}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('states that saving also subscribes them to certificates', () => {
    stubFetch()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={() => {}}
        onSkip={() => {}}
      />,
    )
    expect(screen.getByText(/certificates and reports/i)).toBeInTheDocument()
  })
})
