import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ApprovalSendView } from './approval-send-view'
import type { ApprovalPrefill } from '@/lib/approval-notification/types'

const prefill: ApprovalPrefill = {
  sample: {
    trackingNumber: 'BR-036991/26',
    status: 'approved',
    contractNumber: '42221/26',
    sampleCode: 'PSS',
    awb: '872243057708',
    courier: 'FedEx',
    sellerReference: null,
    buyerReference: '106197',
  },
  panels: {
    seller: { greeting: 'João', to: [{ email: 'seller@x.com', name: 'João', nickname: null, isGroupMailbox: false }], cc: [{ email: 'qualitycontrol@wolthers.com', name: 'Quality Control', nickname: null, isGroupMailbox: false }] },
    buyer: { greeting: 'Regula', to: [{ email: 'regula@blaser.com', name: 'Regula', nickname: null, isGroupMailbox: false }], cc: [{ email: 'qualitycontrol@wolthers.com', name: 'Quality Control', nickname: null, isGroupMailbox: false }] },
  },
  certificateAvailable: true,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/approval-recipients')) {
      return { ok: true, json: async () => prefill } as Response
    }
    if (String(url).endsWith('/notify-approval')) {
      return { ok: true, json: async () => ({ ok: true, results: [{ side: 'seller', ok: true }, { side: 'buyer', ok: true }] }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

describe('ApprovalSendView', () => {
  it('loads prefill and shows both panels with seller first + signature toggle', async () => {
    render(<ApprovalSendView sampleId="abc" open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('SELLER')).toBeInTheDocument())
    expect(screen.getByText('BUYER')).toBeInTheDocument()
    expect(screen.getByText('seller@x.com')).toBeInTheDocument()
    expect(screen.getByText('regula@blaser.com')).toBeInTheDocument()
    expect(screen.getByText(/include html signature/i)).toBeInTheDocument()
    const seller = screen.getByText('SELLER')
    const buyer = screen.getByText('BUYER')
    expect(seller.compareDocumentPosition(buyer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('posts a two-panel payload (signature on by default) and calls onSent', async () => {
    const onSent = vi.fn()
    render(<ApprovalSendView sampleId="abc" open onClose={() => {}} onSent={onSent} />)
    await waitFor(() => expect(screen.getByText('SELLER')).toBeInTheDocument())
    screen.getByRole('button', { name: /send to both/i }).click()
    await waitFor(() => expect(onSent).toHaveBeenCalled())
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    const sendCall = calls.find((c) => String(c[0]).endsWith('/notify-approval'))!
    const payload = JSON.parse((sendCall[1] as RequestInit).body as string)
    expect(payload.panels).toHaveLength(2)
    expect(payload.panels.map((p: any) => p.side)).toEqual(['seller', 'buyer'])
    expect(payload.includeSignature).toBe(true)
    expect(payload.includeCertificate).toBe(true)
  })
})
