import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPriorSends, toSendStatusRows, type PriorSendMessage } from './prior-sends'

const send = (over: Partial<PriorSendMessage>): PriorSendMessage => ({
  sent_by: 'user-anderson',
  sent_at: '2026-09-14T18:30:00Z',
  metadata: null,
  ...over,
})

describe('toSendStatusRows', () => {
  const names = new Map([['user-anderson', 'Anderson Nunes']])

  it('keeps approval sends for the listed samples, naming the sender', () => {
    const rows = toSendStatusRows(
      [
        send({ metadata: { source: 'batch_approval', sample_id: 's1', side: 'buyer' } }),
        send({
          sent_by: null,
          sent_at: '2026-09-13T12:00:00Z',
          metadata: { source: 'sample_approval', sample_id: 's2', side: 'seller' },
        }),
      ],
      new Set(['s1', 's2']),
      names,
    )
    expect(rows).toEqual([
      { sampleId: 's1', side: 'buyer', sentBy: 'Anderson Nunes', sentAt: '2026-09-14T18:30:00Z' },
      { sampleId: 's2', side: 'seller', sentBy: null, sentAt: '2026-09-13T12:00:00Z' },
    ])
  })

  it('ignores other kinds of email, other samples, and sends without a side', () => {
    const rows = toSendStatusRows(
      [
        send({ metadata: { source: 'biweekly_report', sample_id: 's1', side: 'buyer' } }),
        send({ metadata: { source: 'batch_approval', sample_id: 'not-listed', side: 'buyer' } }),
        send({ metadata: { source: 'batch_approval', sample_id: 's1' } }),
        send({ metadata: null }),
      ],
      new Set(['s1']),
      names,
    )
    expect(rows).toEqual([])
  })
})

type StoredMessage = PriorSendMessage & { status: string }

/**
 * Answers `email_messages` by sample id the way Postgres would, and records
 * every request. Filtering on any other column throws: finding a certificate's
 * sends through its contract is exactly what hid contract-less lots.
 */
function fakeAdmin(messages: StoredMessage[], profiles: Array<{ id: string; full_name: string | null }>) {
  const emailQueries: Array<{ eq: Array<[string, unknown]>; ids: string[] }> = []
  const db = {
    from(table: string) {
      const eq: Array<[string, unknown]> = []
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          eq.push([column, value])
          return q
        },
        in: (column: string, ids: string[]) => {
          if (table === 'profiles' && column === 'id') {
            return Promise.resolve({ data: profiles.filter((p) => ids.includes(p.id)), error: null })
          }
          if (table !== 'email_messages' || column !== 'metadata->>sample_id') {
            throw new Error(`unexpected filter ${table}.${column}`)
          }
          emailQueries.push({ eq: [...eq], ids })
          const data = messages.filter(
            (m) =>
              eq.every(([c, v]) => (m as unknown as Record<string, unknown>)[c] === v) &&
              ids.includes(String(m.metadata?.sample_id)),
          )
          return Promise.resolve({ data, error: null })
        },
      }
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, emailQueries }
}

describe('fetchPriorSends', () => {
  it('finds a send by the certificate’s own sample, so a lot with no sys contract shows as sent', async () => {
    const ids = Array.from({ length: 449 }, (_, i) => `s${i}`).concat('san-00921')
    const { db, emailQueries } = fakeAdmin(
      [
        {
          status: 'sent',
          sent_by: 'user-anderson',
          sent_at: '2026-09-14T18:30:00Z',
          metadata: { source: 'batch_approval', sample_id: 'san-00921', side: 'buyer' },
        },
        {
          status: 'failed',
          sent_by: 'user-anderson',
          sent_at: '2026-09-14T18:31:00Z',
          metadata: { source: 'batch_approval', sample_id: 'san-00921', side: 'seller' },
        },
      ],
      [{ id: 'user-anderson', full_name: 'Anderson Nunes' }],
    )

    expect(await fetchPriorSends(db, ids)).toEqual([
      { sampleId: 'san-00921', side: 'buyer', sentBy: 'Anderson Nunes', sentAt: '2026-09-14T18:30:00Z' },
    ])
    // A request URI carries ~24 KB at most (supabase-in-chunks.ts): 450 ids take three requests.
    expect(emailQueries.map((q) => q.ids.length)).toEqual([200, 200, 50])
    expect(emailQueries.every((q) => q.eq.some(([c, v]) => c === 'status' && v === 'sent'))).toBe(true)
  })

  it('asks nothing when there are no samples', async () => {
    const { db, emailQueries } = fakeAdmin([], [])
    expect(await fetchPriorSends(db, [])).toEqual([])
    expect(emailQueries).toEqual([])
  })
})
