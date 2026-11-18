import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BatchApprovalSendView } from './batch-approval-send-view'
import type { BatchUnit } from '@/lib/approval-notification/batch-send'
import type { QcClientOption } from '@/lib/approval-notification/qc-client-filter'
import type { RecipientMeta } from '@/components/samples/approval/recipient-chips'
import { buildQualityCoverNote, type QualitySampleSummary } from '@/lib/approval-notification/quality-summary-render'
import { literalDraftText } from '@/lib/email/draft-markup'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The composer loads the TipTap cover-note editor with next/dynamic (ssr:false)
// so TipTap stays out of the certificates page and cert-editor bundles. Here
// it resolves synchronously to the real editor, so the cover-note tests never
// race the lazy chunk. (No JSX: vi.mock is hoisted above the jsx-runtime import.)
vi.mock('next/dynamic', async () => {
  const { RichBodyEditor } = await import('@/components/email/rich-body-editor')
  return { default: () => RichBodyEditor }
})

const line = (over: Partial<BatchUnit['samples'][number]> = {}): BatchUnit['samples'][number] => ({
  sampleId: 's1', containerNr: 'C1', certNumber: 'CERT-1',
  contractNumber: '100/26', decision: 'approved', reason: null, reference: null, date: null, attach: true,
  sampleType: null, ...over,
})

const emptyUnit: BatchUnit = {
  side: 'buyer', companyId: 'co1', companyName: 'Ahold', qcClientId: null, qcClientName: null, language: 'en', greeting: 'all',
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
  /** Several emails in the queue; `unit` alone when omitted. */
  units?: BatchUnit[]
  /** The send route's reply; ok by default. */
  send?: () => Promise<Response>
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
          units: opts.units ?? [unit],
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
      if (opts.send) return opts.send()
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

describe('BatchApprovalSendView — seller requests, language and the cover', () => {
  const blaserDest = {
    companyId: 'blaser', companyName: 'Blaser', savedAddressId: null,
    lines: ['Guterstrasse 4', 'CH-3001 Bern'], country: 'Switzerland',
    recipientName: null, attention: null, phone: null, instructions: null,
  }
  const unlocked = { locked: false, on: false, reason: null }
  const sellerRequest = (
    over: Partial<NonNullable<BatchUnit['samples'][number]['sellerRequest']>> = {},
  ): NonNullable<BatchUnit['samples'][number]['sellerRequest']> => ({
    requests: { buyerSample: blaserDest, stuffing: false, setBy: null, setAt: null },
    locks: { buyerSample: { locked: true, on: true, reason: 'Blaser · Dulce: pre-approval, sample to Blaser' }, stuffing: unlocked },
    clientId: 'blaser', clientName: 'Blaser', importerId: null, roasterId: null,
    ...over,
  })
  const summary: QualitySampleSummary = {
    sampleId: 'p1', qcClientName: 'Blaser', sellerName: 'Exportadora', exporterSampleNumber: 'AS 1',
    sellerContractNr: '42235', wolthersContractNr: '42235/26', buyerContractNr: 'BL-1',
    certificateNumber: 'SAG-011895/26', containerNr: null, icoNumber: null, sampleType: 'pss',
    qualityName: 'Dulce', screen: [], defects: 4, typeOk: true, cupOk: true,
    decision: 'approved', reason: null, sellerComment: null,
  }
  const pssUnit = (req = sellerRequest()): BatchUnit => ({
    side: 'seller', companyId: 'exp', companyName: 'Exportadora', qcClientId: 'blaser', qcClientName: 'Blaser',
    language: 'pt', greeting: 'all', to: ['qc@exportadora.example'], cc: [], subject: 'PSS Quality Report',
    body: literalDraftText(buildQualityCoverNote('all', false, 'pt')),
    samples: [line({ sampleId: 'p1', certNumber: 'SAG-011895/26', contractNumber: '42235/26', sampleType: 'pss', attach: false, sellerRequest: req })],
    summaryHtml: '<p>queue copy</p>',
    summaryGroups: [{ heading: 'Blaser', samples: [summary] }],
    needsRecipients: false,
  })
  const preview = () => screen.getByRole('region', { name: 'Email preview' })
  const cover = () => screen.getByRole('textbox', { name: 'Cover note' })
  const buyerBox = () => screen.getByRole('checkbox', { name: 'Send sample to buyer' })
  const sendButton = () => screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement
  const openWith = async (unit: BatchUnit, opts: StubOptions = {}) => {
    const f = stubFetch(unit, opts)
    await openRange()
    await waitFor(() => expect(screen.getByText('Requests to seller')).toBeInTheDocument())
    return f
  }
  /** Type into the TipTap surface the way the browser does: the DOM changes, ProseMirror reads it. */
  const typeInto = async (el: HTMLElement, text: string) => {
    await act(async () => {
      const p = el.querySelector('p')!
      p.firstChild!.textContent = text
      fireEvent.input(el)
      await new Promise((r) => setTimeout(r, 30))
    })
  }

  it('shows the fixed buyer-sample tick and renders its request line in Portuguese', async () => {
    await openWith(pssUnit())
    expect(screen.getByText('42235/26 · Cert SAG-011895/26')).toBeInTheDocument()
    expect(buyerBox()).toHaveAttribute('aria-checked', 'true')
    expect(buyerBox()).toBeDisabled()
    expect(screen.getByText('Blaser · Dulce: pre-approval, sample to Blaser')).toBeInTheDocument()
    expect(preview().innerHTML).toContain('Pré-aprovado pela Wolthers – favor enviar 1 amostra para Blaser:')
    expect(preview().innerHTML).not.toContain('queue copy')
  })

  it('switching to EN re-renders the preview and an unedited cover; after typing, the cover stays', async () => {
    await openWith(pssUnit())
    expect(cover().textContent).toContain('Prezados,')
    fireEvent.click(screen.getByRole('radio', { name: 'EN' }))
    await waitFor(() => expect(preview().innerHTML).toContain('Pre-approved by Wolthers'))
    expect(screen.getByRole('radio', { name: 'EN' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(cover().textContent).toContain('Dear all,'))
    // A switch is not an edit: back to BR rebuilds the cover again.
    fireEvent.click(screen.getByRole('radio', { name: 'BR' }))
    await waitFor(() => expect(cover().textContent).toContain('Prezados,'))
    fireEvent.click(screen.getByRole('radio', { name: 'EN' }))
    await waitFor(() => expect(cover().textContent).toContain('Dear all,'))

    await typeInto(cover(), 'Hello Exportadora team')
    fireEvent.click(screen.getByRole('radio', { name: 'BR' }))
    await waitFor(() => expect(preview().innerHTML).toContain('Pré-aprovado pela Wolthers'))
    expect(cover().textContent).toContain('Hello Exportadora team')
    expect(cover().textContent).not.toContain('Prezados,')
  })

  it('unticking an unlocked buyer sample takes the line out of the preview', async () => {
    await openWith(pssUnit(sellerRequest({ locks: { buyerSample: unlocked, stuffing: unlocked } })))
    expect(preview().innerHTML).toContain('Pré-aprovado pela Wolthers')
    fireEvent.click(buyerBox())
    await waitFor(() => expect(preview().innerHTML).not.toContain('Pré-aprovado pela Wolthers'))
    expect(sendButton().disabled).toBe(false)
  })

  it('blocks Send while a ticked buyer sample has no destination', async () => {
    await openWith(pssUnit(sellerRequest({
      requests: { buyerSample: null, stuffing: false, setBy: null, setAt: null },
      locks: { buyerSample: unlocked, stuffing: unlocked },
    })))
    expect(sendButton().disabled).toBe(false)
    fireEvent.click(buyerBox())
    await waitFor(() => expect(sendButton().disabled).toBe(true))
    expect(screen.getByText('Pick where the sample goes')).toBeInTheDocument()
    fireEvent.click(buyerBox())
    await waitFor(() => expect(sendButton().disabled).toBe(false))
    expect(screen.queryByText('Pick where the sample goes')).toBeNull()
  })

  it('a fixed pre-approval with no address shows ticked and locked, with an empty picker, and blocks Send', async () => {
    await openWith(pssUnit(sellerRequest({ requests: { buyerSample: null, stuffing: false, setBy: null, setAt: null } })))
    expect(buyerBox()).toHaveAttribute('aria-checked', 'true')
    expect(buyerBox()).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Sample address' }).textContent).toContain('Choose the address')
    expect(sendButton().disabled).toBe(true)
    expect(screen.getByText('Pick where the sample goes')).toBeInTheDocument()
    expect((screen.getByRole('button', { name: /send all remaining/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('an unfixed pre-approval with nothing stored and no address starts ticked, waiting on a pick', async () => {
    await openWith(pssUnit(sellerRequest({
      requests: { buyerSample: null, stuffing: false, setBy: null, setAt: null },
      locks: { buyerSample: { locked: false, on: true, reason: null }, stuffing: unlocked },
    })))
    expect(buyerBox()).toHaveAttribute('aria-checked', 'true')
    expect(buyerBox()).not.toBeDisabled()
    expect(sendButton().disabled).toBe(true)
    // Unticking is allowed: no request, nothing to wait for.
    fireEvent.click(buyerBox())
    await waitFor(() => expect(sendButton().disabled).toBe(false))
  })

  it('an unfixed pre-approval unticked on an earlier send stays unticked', async () => {
    await openWith(pssUnit(sellerRequest({
      requests: { buyerSample: null, stuffing: false, setBy: 'u1', setAt: '2026-11-17T09:00:00Z' },
      locks: { buyerSample: { locked: false, on: true, reason: null }, stuffing: unlocked },
    })))
    expect(buyerBox()).toHaveAttribute('aria-checked', 'false')
    expect(sendButton().disabled).toBe(false)
  })

  it('locks the request rows and the cover while the email is sending', async () => {
    await openWith(pssUnit(sellerRequest({ locks: { buyerSample: unlocked, stuffing: unlocked } })), {
      send: () => new Promise<Response>(() => {}),
    })
    expect(buyerBox()).not.toBeDisabled()
    expect(cover().closest('[inert]')).toBeNull()
    fireEvent.click(sendButton())
    await waitFor(() => expect(buyerBox()).toBeDisabled())
    expect(screen.getByRole('checkbox', { name: 'Inform stuffing date/time/place' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: /^Sample address/ })).toBeDisabled()
    expect(cover().closest('[inert]')).not.toBeNull()
  })

  it('the hand-edited flag belongs to one email: the next unedited cover still follows the language', async () => {
    const second: BatchUnit = {
      ...pssUnit(), companyId: 'exp2', companyName: 'Segunda Exportadora', greeting: 'Joao',
      body: literalDraftText(buildQualityCoverNote('Joao', false, 'pt')),
    }
    stubFetch(pssUnit(), { units: [pssUnit(), second] })
    await openRange()
    await waitFor(() => expect(screen.getByText('Requests to seller')).toBeInTheDocument())
    await typeInto(cover(), 'Edited for the first seller')
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }))
    await waitFor(() => expect(cover().textContent).toContain('Prezado(a) Joao,'))
    fireEvent.click(screen.getByRole('radio', { name: 'EN' }))
    await waitFor(() => expect(cover().textContent).toContain('Dear Joao,'))
  })

  it('ticking stuffing adds its line to the preview', async () => {
    await openWith(pssUnit())
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inform stuffing date/time/place' }))
    await waitFor(() => expect(preview().innerHTML).toContain('Favor nos informar data, hora e local da estufagem'))
  })

  it('posts the language and the seller requests of this email', async () => {
    const f = await openWith(pssUnit())
    fireEvent.click(sendButton())
    await waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u).endsWith('/api/certificates/batch-send'))).toBe(true),
    )
    const call = f.mock.calls.find(([u]) => String(u).endsWith('/api/certificates/batch-send'))!
    const sent = JSON.parse(call[1]!.body as string)
    expect(sent.language).toBe('pt')
    expect(sent.sellerRequests.p1.buyerSample.companyName).toBe('Blaser')
    expect(Object.keys(sent.sellerRequests)).toEqual(['p1'])
    expect(sent.bodyText).toContain('Prezados,')
  })

  it('posts the edited cover as typed', async () => {
    const f = await openWith(pssUnit())
    await typeInto(cover(), 'Hello Exportadora team')
    fireEvent.click(sendButton())
    await waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u).endsWith('/api/certificates/batch-send'))).toBe(true),
    )
    const call = f.mock.calls.find(([u]) => String(u).endsWith('/api/certificates/batch-send'))!
    expect(JSON.parse(call[1]!.body as string).bodyText).toContain('Hello Exportadora team')
  })

  it('a buyer email gets the language switch and the cover editor, but no Requests card', async () => {
    const f = stubFetch({ ...splitUnit, body: 'Dear all,' })
    await openRange()
    await waitFor(() => expect(screen.getByRole('radio', { name: 'EN' })).toBeInTheDocument())
    expect(screen.queryByText('Requests to seller')).toBeNull()
    expect(cover().textContent).toContain('Dear all,')
    expect(screen.queryByRole('textbox', { name: /message$/i })).toBeNull()
    fireEvent.click(sendButton())
    await waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u).endsWith('/api/certificates/batch-send'))).toBe(true),
    )
    const call = f.mock.calls.find(([u]) => String(u).endsWith('/api/certificates/batch-send'))!
    const sent = JSON.parse(call[1]!.body as string)
    expect(sent.language).toBe('en')
    expect(sent.sellerRequests).toEqual({})
  })

  it('renders no internal sample number anywhere', async () => {
    await openWith(pssUnit())
    expect(document.body.textContent ?? '').not.toMatch(/SAN-/)
  })
})

describe('bundle: TipTap is loaded lazily', () => {
  it('never imports the rich body editor statically (next/dynamic only)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/certificates/batch-approval-send-view.tsx'), 'utf8')
    expect(src).not.toMatch(/^import[^\n]*from '@\/components\/email\/rich-body-editor'/m)
    expect(src).toMatch(/dynamic\(\s*\(\) => import\('@\/components\/email\/rich-body-editor'\)/)
  })
})
