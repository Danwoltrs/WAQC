import { describe, it, expect, vi, beforeEach } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn(async (_msg: any) => ({ error: null })) }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

import { sendAwbArrivalEmail } from './awb-arrival'

const base = {
  awbNumber: '872243057708',
  courierName: 'FedEx',
  buyerName: 'Blaser',
  buyerEmail: 'buyer@example.com',
  sampleSubType: 'pss',
  origin: 'Brazil',
  qualityName: 'SAX 17/18',
}

describe('sendAwbArrivalEmail', () => {
  beforeEach(() => send.mockClear())

  it('names the sample by its own reference in subject and body', async () => {
    await sendAwbArrivalEmail({ ...base, sampleReference: '144/26' })
    const msg = send.mock.calls[0][0]
    expect(msg.subject).toBe('AWB 872243057708 received for sample 144/26')
    expect(msg.html).toContain('Sample reference')
    expect(msg.html).toContain('144/26')
  })

  it('drops the reference from subject and body when the lot has none, and never shows a lab number', async () => {
    await sendAwbArrivalEmail({ ...base, sampleReference: null })
    const msg = send.mock.calls[0][0]
    expect(msg.subject).toBe('AWB 872243057708 received')
    expect(msg.html).not.toContain('Sample reference')
    expect(msg.html).not.toContain('Tracking number')
    expect(`${msg.subject} ${msg.html}`).not.toMatch(/SAN-/)
  })
})
