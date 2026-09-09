import { describe, it, expect } from 'vitest'
import { insertSyncIssue, listOpenSyncIssues, resolveSyncIssue } from './sys-sync-issues'

type Row = Record<string, unknown>

/** Awaitable Supabase stub over one seeded table with insert/update/select. */
function fakeDb(rows: Row[]) {
  return {
    inserted: rows,
    from(_table: string) {
      const preds: Array<(r: Row) => boolean> = []
      const matching = () => rows.filter((r) => preds.every((p) => p(r)))
      const chain: Record<string, unknown> = {}
      Object.assign(chain, {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (col: string, v: unknown) => { preds.push((r) => r[col] === v); return chain },
        is: (col: string, v: unknown) => { preds.push((r) => (r[col] ?? null) === v); return chain },
        insert: async (payload: Row) => { rows.push({ id: `i${rows.length + 1}`, resolved_at: null, ...payload }); return { data: null, error: null } },
        update: (patch: Row) => ({
          eq: (col: string, v: unknown) => ({
            is: (col2: string, v2: unknown) => ({
              select: async () => {
                const hit = rows.filter((r) => r[col] === v && (r[col2] ?? null) === v2)
                hit.forEach((r) => Object.assign(r, patch))
                return { data: hit, error: null }
              },
            }),
          }),
        }),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: matching(), error: null }).then(resolve, reject),
      })
      return chain
    },
  }
}

const issue = { sampleId: 's1', contractId: 'c1', waqcRef: 'SAN-00001/26', stage: 'decision' as const, reason: 'no_confident_target' }

describe('insertSyncIssue', () => {
  it('inserts an open issue row', async () => {
    const db = fakeDb([])
    await insertSyncIssue(db as never, issue)
    expect(db.inserted).toHaveLength(1)
    expect(db.inserted[0]).toMatchObject({ sample_id: 's1', contract_id: 'c1', waqc_ref: 'SAN-00001/26', stage: 'decision', reason: 'no_confident_target' })
  })
  it('does not duplicate an OPEN issue with the same sample/stage/reason', async () => {
    const db = fakeDb([{ id: 'i1', sample_id: 's1', stage: 'decision', reason: 'no_confident_target', resolved_at: null }])
    await insertSyncIssue(db as never, issue)
    expect(db.inserted).toHaveLength(1)
  })
  it('inserts again once the earlier issue is resolved', async () => {
    const db = fakeDb([{ id: 'i1', sample_id: 's1', stage: 'decision', reason: 'no_confident_target', resolved_at: '2026-09-01T00:00:00Z' }])
    await insertSyncIssue(db as never, issue)
    expect(db.inserted).toHaveLength(2)
  })
  it('never throws', async () => {
    const db = { from: () => { throw new Error('boom') } }
    await expect(insertSyncIssue(db as never, issue)).resolves.toBeUndefined()
  })
})

describe('listOpenSyncIssues / resolveSyncIssue', () => {
  it('lists only open issues, optionally for one sample', async () => {
    const db = fakeDb([
      { id: 'i1', sample_id: 's1', stage: 'mirror', reason: 'contract_unresolved', resolved_at: null },
      { id: 'i2', sample_id: 's2', stage: 'mirror', reason: 'contract_unresolved', resolved_at: null },
      { id: 'i3', sample_id: 's1', stage: 'decision', reason: 'x', resolved_at: '2026-09-01T00:00:00Z' },
    ])
    expect((await listOpenSyncIssues(db as never)).map((r) => r.id)).toEqual(['i1', 'i2'])
    expect((await listOpenSyncIssues(db as never, { sampleId: 's1' })).map((r) => r.id)).toEqual(['i1'])
  })
  it('resolve stamps resolved_at/by and reports whether a row was touched', async () => {
    const rows: Row[] = [{ id: 'i1', sample_id: 's1', stage: 'mirror', reason: 'r', resolved_at: null }]
    const db = fakeDb(rows)
    expect(await resolveSyncIssue(db as never, 'i1', 'u1')).toBe(true)
    expect(rows[0].resolved_by).toBe('u1')
    expect(rows[0].resolved_at).toBeTruthy()
    expect(await resolveSyncIssue(db as never, 'i1', 'u1')).toBe(false)
  })
})
