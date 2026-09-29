import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Daniel, 2026-09-29: an approval with comments reaches the seller and the QC
 * department at once; the buyer gets the certificate with the end-of-day batch.
 */
const h = vi.hoisted(() => ({
  loadSendQueue: vi.fn(),
  sendCertificateUnit: vi.fn(),
}))
vi.mock('./send-queue', () => ({ loadSendQueue: h.loadSendQueue }))
vi.mock('./send-unit', () => ({ sendCertificateUnit: h.sendCertificateUnit }))

import { sendSellerNoticeNow } from './tolerance-seller-send'

const sender = { userId: 'u1', email: 'cupper@wolthers.com', name: 'Cupper', signatureHtml: null }
const unit = (over: Record<string, unknown> = {}) => ({
  side: 'seller',
  companyId: 'exporter-1',
  companyName: 'Exportadora',
  to: ['qc@exportadora.com.br'],
  cc: ['wolthers@wolthers.com'],
  subject: 'PSS Quality Report / Exportadora for Ahold / Contract no. 1234',
  body: 'Dear all,\n\nPlease find the results below.',
  samples: [{ sampleId: 'lab-1' }, { sampleId: 'sib-1' }],
  needsRecipients: false,
  ...over,
})

beforeEach(() => {
  h.loadSendQueue.mockReset()
  h.sendCertificateUnit.mockReset().mockResolvedValue({ status: 200, body: { ok: true, results: [] } })
})

describe('sendSellerNoticeNow', () => {
  it('builds the seller side only, for the approved group, and sends it without certificates', async () => {
    h.loadSendQueue.mockResolvedValue({ status: 200, body: { units: [unit()] } })
    const out = await sendSellerNoticeNow({} as any, ['lab-1', 'sib-1'], sender)

    const opts = h.loadSendQueue.mock.calls[0][1]
    expect(opts).toMatchObject({ explicitIds: ['lab-1', 'sib-1'], onlySide: 'seller', clientsView: false })
    expect([...opts.wantDecisions]).toEqual(['approved'])

    expect(h.sendCertificateUnit).toHaveBeenCalledTimes(1)
    const [, input, passedSender] = h.sendCertificateUnit.mock.calls[0]
    expect(input).toMatchObject({
      side: 'seller',
      companyId: 'exporter-1',
      to: ['qc@exportadora.com.br'],
      cc: ['wolthers@wolthers.com'],
      subject: unit().subject,
      bodyText: unit().body,
      certRefs: [{ sampleId: 'lab-1' }, { sampleId: 'sib-1' }],
      includeCertificates: false,
    })
    expect(passedSender).toBe(sender)
    expect(out).toEqual({ sent: ['Exportadora'], waiting: [] })
  })

  it('leaves a seller with no QC contact for the end-of-day batch', async () => {
    h.loadSendQueue.mockResolvedValue({ status: 200, body: { units: [unit({ to: [], needsRecipients: true })] } })
    const out = await sendSellerNoticeNow({} as any, ['lab-1'], sender)
    expect(h.sendCertificateUnit).not.toHaveBeenCalled()
    expect(out).toEqual({ sent: [], waiting: ['Exportadora'] })
  })

  it('reports a failed send as waiting and never throws', async () => {
    h.loadSendQueue.mockResolvedValue({ status: 200, body: { units: [unit()] } })
    h.sendCertificateUnit.mockResolvedValue({ status: 502, body: { ok: false, results: [], error: 'Graph down' } })
    expect(await sendSellerNoticeNow({} as any, ['lab-1'], sender)).toEqual({ sent: [], waiting: ['Exportadora'] })

    h.loadSendQueue.mockRejectedValue(new Error('db down'))
    expect(await sendSellerNoticeNow({} as any, ['lab-1'], sender)).toEqual({ sent: [], waiting: [] })
  })
})
