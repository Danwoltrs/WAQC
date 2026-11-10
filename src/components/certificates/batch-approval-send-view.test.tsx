import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BatchApprovalSendView } from './batch-approval-send-view'
import type { BatchUnit } from '@/lib/approval-notification/batch-send'
import type { QcClientOption } from '@/lib/approval-notification/qc-client-filter'
import type { RecipientMeta } from '@/components/samples/approval/recipient-chips'

const line = (over: Partial<BatchUnit['samples'][number]> = {}): BatchUnit['samples'][number] => ({
  sampleId: 's1', containerNr: 'C1', certNumber: 'CERT-1',
  contractNumber: '100/26', decision: 'approved', reason: null, reference: null, date: null, attach: true, ...over,
})

const emptyUnit: BatchUnit = {
  side: 'buyer', companyId: 'co1', companyName: 'Ahold', qcClientName: null, greeting: 'all',
  to: [], cc: ['qualitycontrol@wolthers.com'], subject: 'Subj', body: 'Body',
  samples: [line()],
  needsRecipients: true,
}

// A lab unit with one contract sibling: TWO samples, TWO certificates, one email.
const splitUnit: BatchUnit = {
  ...emptyUnit,
  to: ['buyer@ahold.nl'],
  needsRecipients: false,
  samples: [
    line({ certNumber: 'SAG-011791/26', contractNumber: '41912/26' }),
    line({ sampleId: 's2', certNumber: 'SAG-011792/26', contractNumber: '41913/26' }),
  ],
}

interface StubOptions {
  clients?: QcClientOption[]
  savedContacts?: Record<string, Record<string, RecipientMeta>>
}

const PROMPT = /save it so future certificates pre-fill/i

const stubFetch = (unit: BatchUnit, opts: StubOptions = {}) => {
  const clients = opts.clients ?? [{ id: 'co1', name: 'Ahold', certificates: unit.samples.length }]
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/batch-send/queue') && u.includes('view=clients')) {
      return { ok: true, json: async () => ({ clients }) } as Response
    }
    if (u.includes('/batch-send/queue')) {
      return {
        ok: true,
        json: async () => ({
          units: [unit],
          skipped: { noParties: 0, noRecipients: 0 },
          savedContacts: opts.savedContacts ?? {},
        }),
      } as Response
    }
    if (u.endsWith('/contacts')) {
      return { ok: true, json: async () => ({ contacts: [] }) } as Response
    }
    if (u.endsWith('/qc-contacts') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string)
      return {
        ok: true,
        json: async () => ({
          contact: {
            id: 'k-new', company_id: 'co1', email: body.email, name: body.name ?? 'QC', nickname: null,
            phone: null, whatsapp: null, preferred_language: 'en', is_group: !!body.isGroup,
            is_primary: null, is_active: true, routing_purposes: ['qc_certificates'],
          },
        }),
      } as Response
    }
    if (u.endsWith('/api/certificates/batch-send')) {
      return { ok: true, json: async () => ({ ok: true, results: [] }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Range mode opens on the QC client step; continue with every client ticked. */
const openRange = async () => {
  render(<BatchApprovalSendView open range={{ from: '2026-06-01', to: '2026-06-30' }} onClose={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: /continue/i }))
}

beforeEach(() => {
  stubFetch(emptyUnit)
})

describe('BatchApprovalSendView capture', () => {
  it('shows the capture form for a needsRecipients unit and unlocks Send after adding', async () => {
    await openRange()
    await waitFor(() => expect(screen.getByRole('button', { name: /add a new email instead/i })).toBeInTheDocument())
    const send = screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    await waitFor(() => expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'buyer@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect((screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled).toBe(false))
  })

  // The composer offers to save every new address itself, so the capture form
  // must not carry a second save control of its own.
  it('adds through the capture form without its own save checkbox, then offers to save', async () => {
    await openRange()
    fireEvent.click(await screen.findByRole('button', { name: /add a new email instead/i }))
    expect(screen.queryByLabelText(/save as a QC-certificate recipient/i)).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'qc@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    expect(await screen.findByText(PROMPT)).toBeInTheDocument()
  })
})

describe('BatchApprovalSendView sub-contract certificates', () => {
  it('lists the mother AND every sub-contract certificate as attached', async () => {
    stubFetch(splitUnit)
    await openRange()
    await waitFor(() => expect(screen.getByText(/2 certificates attached/i)).toBeInTheDocument())
    expect(screen.getByText(/SAG-011791\/26/)).toBeInTheDocument()
    expect(screen.getByText(/SAG-011792\/26/)).toBeInTheDocument()
  })

  it('marks each attached certificate in the status colours: green approved, red rejected (never chart olive)', async () => {
    stubFetch({ ...splitUnit, samples: [splitUnit.samples[0], { ...splitUnit.samples[1], decision: 'rejected' }] })
    await openRange()
    const approved = await screen.findByText('Approved')
    expect(approved).toHaveClass('text-green-600')
    expect(approved.className).not.toContain('556b2f')
    expect(screen.getByText('Rejected')).toHaveClass('text-red-500')
  })

  it('posts every certificate — not one entry per sample — so splits are attached', async () => {
    const fetchMock = stubFetch(splitUnit)
    await openRange()
    await waitFor(() => expect((screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/certificates/batch-send'))).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/certificates/batch-send'))!
    const sent = JSON.parse(call[1]!.body as string)
    expect(sent.certificates).toEqual([
      { sampleId: 's1', attach: true },
      { sampleId: 's2', attach: true },
    ])
    expect(sent.includeCertificates).toBeUndefined()
  })
})

describe('BatchApprovalSendView subject', () => {
  // The subject now names the shipper/client/contract, so the sender must be
  // able to see it — and correct it — before Send.
  it('shows the subject in an editable field and posts the edited value', async () => {
    const fetchMock = stubFetch(splitUnit)
    await openRange()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /subject/i })).toBeInTheDocument())
    const field = screen.getByRole('textbox', { name: /subject/i }) as HTMLInputElement
    expect(field.value).toBe('Subj')
    fireEvent.change(field, { target: { value: 'PSS Quality Report / Edited' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/certificates/batch-send'))).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/certificates/batch-send'))!
    expect(JSON.parse(call[1]!.body as string).subject).toBe('PSS Quality Report / Edited')
  })
})

describe('BatchApprovalSendView attach-certificates toggle', () => {
  const buyerUnit: BatchUnit = { ...splitUnit }
  const sellerUnit: BatchUnit = {
    ...splitUnit, side: 'seller', companyName: 'Ecom Agroindustrial',
    samples: splitUnit.samples.map((s) => ({ ...s, attach: false })),
  }
  const box = () => screen.getByRole('checkbox', { name: /attach certificates/i }) as HTMLInputElement
  const openWith = async (unit: BatchUnit) => {
    const f = stubFetch(unit)
    await openRange()
    await waitFor(() => expect(box()).toBeInTheDocument())
    return f
  }
  const sentBody = (f: ReturnType<typeof stubFetch>) => {
    const call = f.mock.calls.find(([u]) => String(u).endsWith('/api/certificates/batch-send'))!
    return JSON.parse(call[1]!.body as string)
  }

  it('defaults to checked for a buyer', async () => {
    await openWith(buyerUnit)
    expect(box().checked).toBe(true)
    expect(screen.getByText(/2 certificates attached/i)).toBeInTheDocument()
  })

  // Sellers didn't hire the QC service, so they don't get certificates by default.
  it('defaults to unchecked for a seller', async () => {
    await openWith(sellerUnit)
    expect(box().checked).toBe(false)
    expect(screen.queryByText(/certificates attached/i)).not.toBeInTheDocument()
  })

  it('lets a seller send be opted IN, and posts the flag', async () => {
    const f = await openWith(sellerUnit)
    fireEvent.click(box())
    await waitFor(() => expect(box().checked).toBe(true))
    expect(screen.getByText(/2 certificates attached/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await waitFor(() => expect(sentBody(f).certificates.map((c: { attach: boolean }) => c.attach)).toEqual([true, true]))
  })

  it('posts each certificate with its own attach flag', async () => {
    const mixed: BatchUnit = {
      ...splitUnit, side: 'importer',
      samples: [splitUnit.samples[0], { ...splitUnit.samples[1], attach: false }],
    }
    const f = await openWith(mixed)
    expect(screen.getByText(/1 of 2 certificates attached/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await waitFor(() =>
      expect(sentBody(f).certificates).toEqual([
        { sampleId: 's1', attach: true },
        { sampleId: 's2', attach: false },
      ]),
    )
    expect(sentBody(f).includeCertificates).toBeUndefined()
  })

  it('names the client on a seller split', async () => {
    await openWith({ ...sellerUnit, companyName: 'Exportadora', qcClientName: 'Blaser' })
    expect(screen.getByText(/Exportadora \(seller, for Blaser\)/)).toBeInTheDocument()
  })

  it('lets a buyer send be opted OUT, and posts the flag', async () => {
    const f = await openWith(buyerUnit)
    fireEvent.click(box())
    await waitFor(() => expect(box().checked).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await waitFor(() => expect(sentBody(f).certificates.map((c: { attach: boolean }) => c.attach)).toEqual([false, false]))
  })
})

describe('BatchApprovalSendView — choosing QC clients', () => {
  it('asks which QC clients to send to, all ticked, and builds the emails for the ones kept', async () => {
    const fetchMock = stubFetch(splitUnit, {
      clients: [
        { id: 'ahold', name: 'Ahold', certificates: 2 },
        { id: 'dunkin', name: 'Dunkin', certificates: 11 },
      ],
    })
    render(<BatchApprovalSendView open range={{ from: '2026-09-01', to: '2026-09-14' }} onClose={() => {}} />)
    const dunkin = (await screen.findByRole('checkbox', { name: /dunkin/i })) as HTMLInputElement
    expect(dunkin.checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /ahold/i }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(dunkin)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /subject/i })).toBeInTheDocument())

    const unitsUrl = fetchMock.mock.calls
      .map(([u]) => String(u))
      .find((u) => u.includes('/batch-send/queue') && !u.includes('view=clients'))!
    const params = new URL(unitsUrl, 'http://localhost').searchParams
    expect(params.get('clientIds')).toBe('ahold')
    expect(params.get('from')).toBe('2026-09-01')
    expect(params.get('to')).toBe('2026-09-14')
  })

  it('says so when the period has nothing left to send', async () => {
    stubFetch(splitUnit, { clients: [] })
    render(<BatchApprovalSendView open range={{ from: '2026-09-14', to: '2026-09-14' }} onClose={() => {}} />)
    expect(await screen.findByText(/no unsent certificates/i)).toBeInTheDocument()
  })

  const selectionUrls = (f: ReturnType<typeof stubFetch>) =>
    f.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/batch-send/queue'))

  it('opens a selection straight on the first email, loading the chosen parties once', async () => {
    const fetchMock = stubFetch(splitUnit)
    render(
      <BatchApprovalSendView
        open
        selection={{ sampleIds: ['s1'], parties: ['buyer', 'seller'], includeSent: false }}
        onClose={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByRole('textbox', { name: /subject/i })).toBeInTheDocument())
    expect(screen.queryByText(/who should receive them/i)).toBeNull()
    const urls = selectionUrls(fetchMock)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('sampleIds=s1')
    expect(urls[0]).toContain('parties=buyer%2Cseller')
    expect(urls[0]).not.toContain('includeSent')
    expect(urls[0]).not.toContain('view=clients')
  })

  it('asks for already-sent certificates when the selection says so', async () => {
    const fetchMock = stubFetch(splitUnit)
    render(
      <BatchApprovalSendView
        open
        selection={{ sampleIds: ['s1', 's2'], parties: ['buyer'], includeSent: true }}
        onClose={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByRole('textbox', { name: /subject/i })).toBeInTheDocument())
    const urls = selectionUrls(fetchMock)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('sampleIds=s1%2Cs2')
    expect(urls[0]).toContain('includeSent=1')
  })

  it('passes the chosen parties on in range mode, without includeSent', async () => {
    const fetchMock = stubFetch(splitUnit)
    await openRange()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /subject/i })).toBeInTheDocument())
    const url = fetchMock.mock.calls
      .map(([u]) => String(u))
      .find((u) => u.includes('/batch-send/queue') && !u.includes('view=clients'))!
    expect(url).toContain('parties=buyer%2Cimporter%2Croaster%2Cseller')
    expect(url).not.toContain('includeSent')
  })
})

describe('BatchApprovalSendView — saving a recipient for next time', () => {
  const saved = { co1: { 'buyer@ahold.nl': { name: 'Joost Pollmann', isGroup: false, contactId: 'k1' } } }

  it('shows a saved contact by name and saves a typed-in address as a group inbox', async () => {
    const fetchMock = stubFetch(splitUnit, { savedContacts: saved })
    await openRange()
    expect(await screen.findByText('Joost Pollmann')).toBeInTheDocument()

    const cc = screen.getAllByPlaceholderText('Add…')[1]
    fireEvent.change(cc, { target: { value: 'qc@ahold.nl' } })
    fireEvent.keyDown(cc, { key: 'Enter' })
    expect(await screen.findByText(PROMPT)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /group inbox/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    const isSave = ([u, init]: [url: string, init?: RequestInit]) =>
      String(u) === '/api/companies/co1/qc-contacts' && init?.method === 'POST'
    await waitFor(() => expect(fetchMock.mock.calls.some(isSave)).toBe(true))
    const post = fetchMock.mock.calls.find(isSave)!
    expect(JSON.parse(post[1]!.body as string)).toMatchObject({ email: 'qc@ahold.nl', isGroup: true })
    await waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull())
  })

  it('does not ask again about an address used for this send only', async () => {
    stubFetch(splitUnit, { savedContacts: saved })
    await openRange()
    const to = (await screen.findAllByPlaceholderText('Add…'))[0]
    fireEvent.change(to, { target: { value: 'new@ahold.nl' } })
    fireEvent.keyDown(to, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: /only this send/i }))
    await waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Remove new@ahold.nl' }))
    fireEvent.change(to, { target: { value: 'new@ahold.nl' } })
    fireEvent.keyDown(to, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove new@ahold.nl' })).toBeInTheDocument())
    expect(screen.queryByText(PROMPT)).toBeNull()
  })
})

describe('BatchApprovalSendView stale responses', () => {
  const queueBody = (u: BatchUnit) =>
    ({ ok: true, json: async () => ({ units: [u], skipped: { noParties: 0, noRecipients: 0 }, savedContacts: {} }) }) as Response
  const seller: BatchUnit = { ...splitUnit, side: 'seller', companyId: 'co-s', companyName: 'Sellerco Alpha', to: ['a@sellerco.example'] }
  const client: BatchUnit = { ...splitUnit, companyId: 'co-c', companyName: 'Clientco Beta', to: ['b@clientco.example'] }
  const sel = (parties: ('seller' | 'buyer')[]) => ({ sampleIds: ['s1'], parties, includeSent: false })

  it('never shows a late queue response after Close and a new selection', async () => {
    let resolveA!: (r: Response) => void
    const a = new Promise<Response>((r) => (resolveA = r))
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(a))
    const { rerender } = render(<BatchApprovalSendView open selection={sel(['seller', 'buyer'])} onClose={() => {}} />)
    rerender(<BatchApprovalSendView open={false} selection={sel(['seller', 'buyer'])} onClose={() => {}} />)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(queueBody(client)))
    rerender(<BatchApprovalSendView open selection={sel(['buyer'])} onClose={() => {}} />)
    expect(await screen.findByText(/Clientco Beta/)).toBeInTheDocument()
    await act(async () => {
      resolveA(queueBody(seller))
    })
    expect(screen.queryByText(/Sellerco Alpha/)).toBeNull()
    expect(screen.getByText(/Clientco Beta/)).toBeInTheDocument()
  })

  it('does not land a response that arrives after Close', async () => {
    let resolveA!: (r: Response) => void
    const a = new Promise<Response>((r) => (resolveA = r))
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(a))
    const { rerender } = render(<BatchApprovalSendView open selection={sel(['seller'])} onClose={() => {}} />)
    rerender(<BatchApprovalSendView open={false} selection={sel(['seller'])} onClose={() => {}} />)
    rerender(<BatchApprovalSendView open={false} selection={sel(['seller'])} onClose={() => {}} />)
    await act(async () => {
      resolveA(queueBody(seller))
    })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    rerender(<BatchApprovalSendView open selection={sel(['seller'])} onClose={() => {}} />)
    // Reopened: its own load is pending, so the old units must not show.
    expect(screen.queryByText(/Sellerco Alpha/)).toBeNull()
  })

  it('never shows a late QC clients response for an earlier range', async () => {
    let resolveA!: (r: Response) => void
    const a = new Promise<Response>((r) => (resolveA = r))
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(a))
    const r1 = { from: '2026-01-01', to: '2026-01-31' }
    const r2 = { from: '2026-02-01', to: '2026-02-28' }
    const { rerender } = render(<BatchApprovalSendView open range={r1} onClose={() => {}} />)
    rerender(<BatchApprovalSendView open={false} range={r1} onClose={() => {}} />)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clients: [{ id: 'c2', name: 'Febclient', certificates: 1 }] }) } as Response))
    rerender(<BatchApprovalSendView open range={r2} onClose={() => {}} />)
    expect(await screen.findByText(/Febclient/)).toBeInTheDocument()
    await act(async () => {
      resolveA({ ok: true, json: async () => ({ clients: [{ id: 'c1', name: 'Janclient', certificates: 1 }] }) } as Response)
    })
    expect(screen.queryByText(/Janclient/)).toBeNull()
    expect(screen.getByText(/Febclient/)).toBeInTheDocument()
  })
})
