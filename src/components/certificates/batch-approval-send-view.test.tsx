import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BatchApprovalSendView } from './batch-approval-send-view'
import type { BatchUnit } from '@/lib/approval-notification/batch-send'

const line = (over: Partial<BatchUnit['samples'][number]> = {}): BatchUnit['samples'][number] => ({
  sampleId: 's1', sampleContractId: null, containerNr: 'C1', certNumber: 'CERT-1',
  contractNumber: '100/26', decision: 'approved', reason: null, reference: null, date: null, ...over,
})

const emptyUnit: BatchUnit = {
  side: 'buyer', companyId: 'co1', companyName: 'Ahold', greeting: 'all',
  to: [], cc: ['qualitycontrol@wolthers.com'], subject: 'Subj', body: 'Body',
  samples: [line()],
  needsRecipients: true,
}

// A mother sample with one commercial split: TWO certificates, one email.
const splitUnit: BatchUnit = {
  ...emptyUnit,
  to: ['buyer@ahold.nl'],
  needsRecipients: false,
  samples: [
    line({ certNumber: 'SAG-011791/26', contractNumber: '41912/26' }),
    line({ sampleContractId: 'sub1', certNumber: 'SAG-011792/26', contractNumber: '41913/26' }),
  ],
}

const stubFetch = (unit: BatchUnit) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    void init
    if (String(url).includes('/batch-send/queue')) {
      return { ok: true, json: async () => ({ units: [unit], skipped: { noContract: 0, noRecipients: 0 } }) } as Response
    }
    if (String(url).endsWith('/contacts')) {
      return { ok: true, json: async () => ({ contacts: [] }) } as Response
    }
    if (String(url).endsWith('/api/certificates/batch-send')) {
      return { ok: true, json: async () => ({ ok: true, results: [] }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  stubFetch(emptyUnit)
})

describe('BatchApprovalSendView capture', () => {
  it('shows the capture form for a needsRecipients unit and unlocks Send after adding', async () => {
    render(<BatchApprovalSendView open range={{ from: '2026-06-01', to: '2026-06-30' }} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /add a new email instead/i })).toBeInTheDocument())
    const send = screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    await waitFor(() => expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'buyer@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect((screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('BatchApprovalSendView sub-contract certificates', () => {
  it('lists the mother AND every sub-contract certificate as attached', async () => {
    stubFetch(splitUnit)
    render(<BatchApprovalSendView open range={{ from: '2026-06-01', to: '2026-06-30' }} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/2 certificates attached/i)).toBeInTheDocument())
    expect(screen.getByText(/SAG-011791\/26/)).toBeInTheDocument()
    expect(screen.getByText(/SAG-011792\/26/)).toBeInTheDocument()
  })

  it('posts every certificate — not one entry per sample — so splits are attached', async () => {
    const fetchMock = stubFetch(splitUnit)
    render(<BatchApprovalSendView open range={{ from: '2026-06-01', to: '2026-06-30' }} onClose={() => {}} />)
    await waitFor(() => expect((screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/certificates/batch-send'))).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/certificates/batch-send'))!
    const sent = JSON.parse(call[1]!.body as string)
    expect(sent.certificates).toEqual([
      { sampleId: 's1', sampleContractId: null },
      { sampleId: 's1', sampleContractId: 'sub1' },
    ])
  })
})
