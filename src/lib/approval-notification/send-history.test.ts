import { describe, it, expect } from 'vitest'
import { toSendHistory, historyForUnit, type SendHistoryMessage } from './send-history'

const names = new Map([['u1', 'Anderson Nunes'], ['u2', 'Matheus Lima']])

const msg = (over: Partial<SendHistoryMessage> & { meta?: Record<string, unknown> }): SendHistoryMessage => ({
  sent_by: 'u1',
  sent_at: '2026-11-12T14:30:00+00:00',
  to_recipients: [{ email: 'qc@ldc.com' }],
  cc_recipients: [{ email: 'wolthers@wolthers.com' }],
  metadata: { source: 'batch_approval', sample_id: 's1', side: 'seller', company_id: 'ldc', ...(over.meta ?? {}) },
  ...over,
})

describe('toSendHistory', () => {
  it('folds the per-certificate rows of one email into one entry', () => {
    const history = toSendHistory(
      [msg({}), msg({ meta: { sample_id: 's2' } })],
      new Set(['s1', 's2']),
      names,
    )
    expect(history).toEqual([
      {
        party: 'seller',
        companyId: 'ldc',
        sentBy: 'Anderson Nunes',
        sentAt: '2026-11-12T14:30:00+00:00',
        to: ['qc@ldc.com'],
        cc: ['wolthers@wolthers.com'],
        sandbox: false,
        sampleIds: ['s1', 's2'],
      },
    ])
  })

  it('keeps two sends to the same party apart, newest first', () => {
    const history = toSendHistory(
      [msg({}), msg({ sent_at: '2026-11-14T09:00:00+00:00', sent_by: 'u2' })],
      new Set(['s1']),
      names,
    )
    expect(history.map((h) => [h.sentAt, h.sentBy])).toEqual([
      ['2026-11-14T09:00:00+00:00', 'Matheus Lima'],
      ['2026-11-12T14:30:00+00:00', 'Anderson Nunes'],
    ])
  })

  it('shows the addresses that were asked for on a test send, and marks it', () => {
    const [entry] = toSendHistory(
      [msg({
        to_recipients: [{ email: 'sandbox@wolthers.com' }],
        cc_recipients: [],
        meta: { sandbox: true, requested_to: ['qc@ldc.com'], requested_cc: ['boss@ldc.com'] },
      })],
      new Set(['s1']),
      names,
    )
    expect(entry.sandbox).toBe(true)
    expect(entry.to).toEqual(['qc@ldc.com'])
    expect(entry.cc).toEqual(['boss@ldc.com'])
  })

  it('ignores other mail, other samples and unknown parties', () => {
    const history = toSendHistory(
      [
        msg({ meta: { source: 'lab_activity_report' } }),
        msg({ meta: { sample_id: 'other' } }),
        msg({ meta: { side: 'nobody' } }),
      ],
      new Set(['s1']),
      names,
    )
    expect(history).toEqual([])
  })

  it('reads a send logged without a company or a sender', () => {
    const [entry] = toSendHistory(
      [msg({ sent_by: null, meta: { source: 'sample_approval', company_id: undefined } })],
      new Set(['s1']),
      names,
    )
    expect(entry.companyId).toBeNull()
    expect(entry.sentBy).toBeNull()
  })
})

describe('historyForUnit', () => {
  const history = toSendHistory(
    [
      msg({}),
      msg({ meta: { side: 'buyer', company_id: 'dunkin' } }),
      msg({ meta: { sample_id: 's9' } }),
      msg({ sent_at: '2026-11-01T10:00:00+00:00', meta: { source: 'sample_approval', company_id: undefined } }),
    ],
    new Set(['s1', 's9']),
    names,
  )

  it("keeps the sends to this email's party and company that cover one of its certificates", () => {
    const mine = historyForUnit(history, { side: 'seller', companyId: 'ldc', sampleIds: ['s1'] })
    expect(mine.map((h) => h.sentAt)).toEqual(['2026-11-12T14:30:00+00:00', '2026-11-01T10:00:00+00:00'])
    expect(mine[0].sampleIds).toEqual(['s1'])
  })

  it('leaves out another company holding the same role', () => {
    expect(historyForUnit(history, { side: 'seller', companyId: 'other-seller', sampleIds: ['s1'] }).map((h) => h.companyId))
      .toEqual([null])
  })
})
