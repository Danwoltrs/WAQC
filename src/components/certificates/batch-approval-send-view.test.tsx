import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BatchApprovalSendView } from './batch-approval-send-view'
import type { BatchUnit } from '@/lib/approval-notification/batch-send'

const emptyUnit: BatchUnit = {
  side: 'buyer', companyId: 'co1', companyName: 'Ahold', greeting: 'Ahold team',
  to: [], cc: ['qualitycontrol@wolthers.com'], subject: 'Subj', body: 'Body',
  samples: [{ sampleId: 's1', containerNr: 'C1', certNumber: 'CERT-1', contractNumber: '100/26', decision: 'approved', reason: null, reference: null, date: null }],
  needsRecipients: true,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/batch-send/queue')) {
      return { ok: true, json: async () => ({ units: [emptyUnit], skipped: { noContract: 0, noRecipients: 0 } }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

describe('BatchApprovalSendView capture', () => {
  it('shows the capture form for a needsRecipients unit and unlocks Send after adding', async () => {
    render(<BatchApprovalSendView open range={{ from: '2026-06-01', to: '2026-06-30' }} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument())
    const send = screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'buyer@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect((screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled).toBe(false))
  })
})
