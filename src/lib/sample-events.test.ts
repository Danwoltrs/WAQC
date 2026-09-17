import { describe, it, expect, vi } from 'vitest'
import { logCertificateDownload, logSampleEvents, toSampleEventRows } from './sample-events'

function fakeDb(result: { error: { message: string } | null } | Error) {
  const inserts: unknown[] = []
  const db: any = {
    inserts,
    from: (table: string) => ({
      insert: async (rows: unknown) => {
        if (result instanceof Error) throw result
        inserts.push({ table, rows })
        return result
      },
    }),
  }
  return db
}

describe('toSampleEventRows', () => {
  it('fills every optional so a row never carries undefined', () => {
    expect(toSampleEventRows([{ sample_id: 's1', event_type: 'sample_deleted' }])).toEqual([
      { sample_id: 's1', event_type: 'sample_deleted', certificate_id: null, actor_user_id: null, metadata: {} },
    ])
  })
  it('keeps an explicit time and metadata', () => {
    expect(toSampleEventRows([{
      sample_id: 's1', event_type: 'certificate_issued', certificate_id: 'c1', actor_user_id: 'u1',
      occurred_at: '2026-09-17T10:00:00Z', metadata: { certificate_number: 'BR-1/26' },
    }])[0]).toMatchObject({ certificate_id: 'c1', actor_user_id: 'u1', occurred_at: '2026-09-17T10:00:00Z', metadata: { certificate_number: 'BR-1/26' } })
  })
})

describe('logSampleEvents', () => {
  it('inserts into sample_events', async () => {
    const db = fakeDb({ error: null })
    const res = await logSampleEvents(db, [{ sample_id: 's1', event_type: 'sample_deleted', actor_user_id: 'u1' }])
    expect(res).toEqual({ ok: true })
    expect(db.inserts).toEqual([{ table: 'sample_events', rows: [expect.objectContaining({ sample_id: 's1', event_type: 'sample_deleted', actor_user_id: 'u1' })] }])
  })

  it('does nothing for an empty batch', async () => {
    const db = fakeDb({ error: null })
    expect(await logSampleEvents(db, [])).toEqual({ ok: true })
    expect(db.inserts).toEqual([])
  })

  it('never throws: a database error is reported, not raised', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await logSampleEvents(fakeDb({ error: { message: 'relation missing' } }), [{ sample_id: 's1', event_type: 'sample_deleted' }]))
      .toEqual({ ok: false, error: 'relation missing' })
    expect(await logSampleEvents(fakeDb(new Error('boom')), [{ sample_id: 's1', event_type: 'sample_deleted' }]))
      .toEqual({ ok: false, error: 'boom' })
    warn.mockRestore()
  })
})

describe('logCertificateDownload', () => {
  it('records the channel and whether the cached PDF was served', async () => {
    const db = fakeDb({ error: null })
    await logCertificateDownload(db, { sampleId: 's1', certificateId: 'c1', channel: 'public', cached: true })
    expect(db.inserts[0]).toEqual({
      table: 'sample_events',
      rows: [{ sample_id: 's1', certificate_id: 'c1', actor_user_id: null, event_type: 'certificate_downloaded', metadata: { channel: 'public', cached: true } }],
    })
  })
})
