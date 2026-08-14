import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SendReportModal } from './send-report-modal'
import type { ReportKind } from './preview-report-modal'

// Built inline rather than imported from preview-report-modal, which imports
// SendReportModal back — a type-only cycle in source, but a real one in a test.
const KIND: ReportKind = {
  reportType: 'weekly_ss',
  previewEndpoint: '/api/reports/weekly-ss',
  sendEndpoint: '/api/reports/weekly-ss/send',
  label: 'SS Report',
}

const CONTACTS = {
  people: [
    {
      id: 'c1', company_id: 'co1', email: 'marieke@ahold.nl', name: 'Marieke de Vries',
      nickname: null, phone: null, whatsapp: null, preferred_language: 'en',
      is_group: false, is_primary: true, is_active: true, routing_purposes: ['qc_certificates'],
    },
  ],
  groups: [
    {
      id: 'c2', company_id: 'co1', email: 'qc@ahold.nl', name: 'QC Team',
      nickname: null, phone: null, whatsapp: null, preferred_language: 'en',
      is_group: true, is_primary: null, is_active: true, routing_purposes: ['qc_certificates'],
    },
  ],
}

interface StubOpts {
  contactsOk?: boolean
  recipientsOk?: boolean
  lastSendTo?: string[]
}

function stubFetch(opts: StubOpts = {}) {
  const { contactsOk = true, recipientsOk = true, lastSendTo = [] } = opts
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/qc-contacts')) {
      return contactsOk
        ? ({ ok: true, json: async () => CONTACTS } as Response)
        : ({ ok: false, json: async () => ({ error: 'boom' }) } as Response)
    }
    if (u.includes('/api/reports/recipients')) {
      return recipientsOk
        ? ({ ok: true, json: async () => ({ to: lastSendTo, cc: [], bcc: [], last_sent_at: null }) } as Response)
        : ({ ok: false, json: async () => ({ error: 'boom' }) } as Response)
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderModal() {
  return render(
    <SendReportModal
      open
      onOpenChange={() => {}}
      kind={KIND}
      clientId="co1"
      clientName="Ahold"
      startDate="2026-08-03"
      endDate="2026-08-07"
    />,
  )
}

beforeEach(() => vi.restoreAllMocks())

describe('SendReportModal recipient pre-fill', () => {
  it('pre-fills To from tagged contacts, people before groups', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    expect(screen.getByTitle('marieke@ahold.nl')).toHaveTextContent('Marieke de Vries')
    expect(screen.getByTitle('qc@ahold.nl')).toHaveTextContent('QC Team')
  })

  it('unions contacts with the last-send list', async () => {
    stubFetch({ lastSendTo: ['jan@ahold.nl'] })
    renderModal()
    await waitFor(() => expect(screen.getByTitle('jan@ahold.nl')).toBeInTheDocument())
    expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument()
  })

  it('still pre-fills from last-send when the contacts fetch fails', async () => {
    stubFetch({ contactsOk: false, lastSendTo: ['jan@ahold.nl'] })
    renderModal()
    await waitFor(() => expect(screen.getByTitle('jan@ahold.nl')).toBeInTheDocument())
    expect(screen.queryByTitle('marieke@ahold.nl')).toBeNull()
  })

  it('still pre-fills from contacts when the last-send fetch fails', async () => {
    stubFetch({ recipientsOk: false })
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
  })

  it('leaves usable empty inputs when both fetches fail', async () => {
    stubFetch({ contactsOk: false, recipientsOk: false })
    renderModal()
    await waitFor(() => expect(screen.getAllByPlaceholderText('Add…').length).toBe(3))
    expect(screen.queryByTitle('marieke@ahold.nl')).toBeNull()
  })
})

describe('SendReportModal loading guard', () => {
  it('disables the To input while a pre-fill fetch is in flight, then enables it once resolved', async () => {
    let resolveContacts!: (v: Response) => void
    let resolveRecipients!: (v: Response) => void
    const fetchMock = vi.fn((url: string) => {
      const u = String(url)
      if (u.includes('/qc-contacts')) {
        return new Promise<Response>((resolve) => { resolveContacts = resolve })
      }
      if (u.includes('/api/reports/recipients')) {
        return new Promise<Response>((resolve) => { resolveRecipients = resolve })
      }
      return Promise.resolve({ ok: false, json: async () => ({ error: 'unexpected' }) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderModal()

    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    await waitFor(() => expect(toInput).toBeDisabled())

    resolveContacts({ ok: true, json: async () => CONTACTS } as Response)
    resolveRecipients({
      ok: true,
      json: async () => ({ to: [], cc: [], bcc: [], last_sent_at: null }),
    } as Response)

    await waitFor(() => expect(toInput).not.toBeDisabled())
  })
})

describe('SendReportModal stale recipients on reopen', () => {
  it('clears Cc when a reopen finds the recipients fetch failing after a prior successful load', async () => {
    let recipientsCalls = 0
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/qc-contacts')) {
        return { ok: true, json: async () => CONTACTS } as Response
      }
      if (u.includes('/api/reports/recipients')) {
        recipientsCalls += 1
        if (recipientsCalls === 1) {
          return {
            ok: true,
            json: async () => ({
              to: [],
              cc: ['old@ahold.nl'],
              bcc: [],
              last_sent_at: '2026-08-01T00:00:00Z',
            }),
          } as Response
        }
        return { ok: false, json: async () => ({ error: 'boom' }) } as Response
      }
      return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const element = (open: boolean) => (
      <SendReportModal
        open={open}
        onOpenChange={() => {}}
        kind={KIND}
        clientId="co1"
        clientName="Ahold"
        startDate="2026-08-03"
        endDate="2026-08-07"
      />
    )

    const { rerender } = render(element(true))
    await waitFor(() => expect(screen.getByText('old@ahold.nl')).toBeInTheDocument())

    rerender(element(false))
    rerender(element(true))

    await waitFor(() => expect(recipientsCalls).toBe(2))
    await waitFor(() => expect(screen.queryByText('old@ahold.nl')).toBeNull())
  })
})

describe('SendReportModal save prompt', () => {
  it('opens the prompt when an unknown address is committed', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'jan@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
  })

  it('does not prompt for an address that is already a saved contact', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'MARIEKE@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByText(/isn't saved for Ahold/i)).toBeNull())
    // …and it is not added a second time under different casing.
    expect(screen.getByText('2 recipients')).toBeInTheDocument()
  })

  it('does not re-prompt an address that was skipped', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'jan@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    await waitFor(() => expect(screen.queryByText(/isn't saved for Ahold/i)).toBeNull())
    fireEvent.click(screen.getByLabelText('Save jan@ahold.nl'))
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
  })

  it('keeps Send enabled while a prompt is open', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'jan@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /send report/i })).toBeEnabled()
  })

  it('disables Send when an address is malformed', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'not-an-email' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled(),
    )
  })

  it('gives a paste-artifact address no save affordance and blocks Send', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    // A stray trailing ')' — the real paste artifact that broke a prod send —
    // survives Fix 4's comma/semicolon/whitespace splitting (nothing there to
    // split on), so it still reaches isValidEmail as one malformed address.
    fireEvent.change(toInput, { target: { value: 'adccpurchasing@adcoffeecompany.nl)' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled(),
    )
    expect(screen.queryByText(/isn't saved for Ahold/i)).toBeNull()
    expect(screen.queryByLabelText('Save adccpurchasing@adcoffeecompany.nl)')).toBeNull()
  })

  it('drops a queued address from the save prompt once its chip is removed from To', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]

    // Type a typo'd address — it gets queued for the save prompt.
    fireEvent.change(toInput, { target: { value: 'jna@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())

    // Remove the typo'd chip before it gets saved.
    fireEvent.click(screen.getByLabelText('Remove jna@ahold.nl'))
    await waitFor(() => expect(screen.queryByText('jna@ahold.nl')).toBeNull())
    await waitFor(() => expect(screen.queryByText(/isn't saved for Ahold/i)).toBeNull())

    // Type the corrected address — the prompt now offers THAT one, not the typo.
    fireEvent.change(toInput, { target: { value: 'jan@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
    expect(screen.getByLabelText('Save jan@ahold.nl')).toBeInTheDocument()
    expect(screen.queryByLabelText('Save jna@ahold.nl')).toBeNull()
  })
})
