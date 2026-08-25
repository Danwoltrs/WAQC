import { describe, it, expect, vi } from 'vitest'
import { applyDecision } from './finalize-pipeline'

vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: vi.fn(async () => undefined),
}))

/**
 * Records every update issued per table, and what it was filtered on.
 *
 * Two optional predicates simulate the two distinct ways a real Supabase call
 * can fail, matching how supabase-js actually behaves:
 *  - `failUpdateWhen` resolves with a Postgres-shaped `{ error }` (the normal
 *    shape for a DB-level failure — RLS denial, constraint violation, missing
 *    column). The promise never rejects; the caller must check `error` itself.
 *  - `throwOnUpdateWhen` rejects the awaited call outright, simulating a
 *    thrown/network-level failure rather than a resolved error.
 */
function fakeDb(opts: {
  failUpdateWhen?: (table: string, values: Record<string, unknown>) => boolean
  throwOnUpdateWhen?: (table: string, values: Record<string, unknown>) => boolean
} = {}) {
  const writes: Array<{ table: string; values: Record<string, unknown>; id?: string }> = []
  const client = {
    writes,
    from(table: string) {
      let pending: Record<string, unknown> | null = null
      let id: string | undefined
      const chain: any = {
        update(values: Record<string, unknown>) { pending = values; return chain },
        eq(_col: string, value: string) { id = value; return chain },
        select() { return chain },
        single: async () => ({ data: null, error: null }),
        then(onFulfilled: (v: { error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
          if (pending) writes.push({ table, values: pending, id })
          if (pending && opts.throwOnUpdateWhen?.(table, pending)) {
            return Promise.reject(new Error('simulated write failure')).then(onFulfilled, onRejected)
          }
          const failed = Boolean(pending && opts.failUpdateWhen?.(table, pending))
          const error = failed ? { message: 'db exploded' } : null
          return Promise.resolve({ error }).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  }
  return client
}

const base = {
  sampleId: 'smp-1',
  currentWorkflowStage: 'analysis',
  actorUserId: 'user-1',
  sellerComment: null,
}

describe('applyDecision', () => {
  it('walks an analysis-stage sample through review before certifying it', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'approved' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review', 'certified'])
  })

  it('marks a rejected sample rejected, not certified', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'rejected' })
    const last = db.writes.filter(w => w.table === 'samples').pop()
    expect(last!.values).toMatchObject({ workflow_stage: 'rejected', status: 'rejected' })
  })

  it('parks a pending sample in review and never certifies it', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'pending' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review'])
  })

  it('does not re-enter review for a sample already there', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, currentWorkflowStage: 'review', decision: 'approved' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['certified'])
  })

  it('persists a seller comment only on approval', async () => {
    const approved = fakeDb()
    await applyDecision(approved as any, { ...base, decision: 'approved', sellerComment: 'lovely cup' })
    expect(approved.writes.some(w => w.values.seller_comment === 'lovely cup')).toBe(true)

    const rejected = fakeDb()
    await applyDecision(rejected as any, { ...base, decision: 'rejected', sellerComment: 'lovely cup' })
    expect(rejected.writes.some(w => 'seller_comment' in w.values)).toBe(false)
  })

  it('pushes the decision to sys once the sample is resolved', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'approved' })
    expect(writeDecisionToShipmentSamples).toHaveBeenCalled()
  })

  it('does not push a pending decision to sys', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    vi.mocked(writeDecisionToShipmentSamples).mockClear()
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'pending' })
    expect(writeDecisionToShipmentSamples).not.toHaveBeenCalled()
  })

  it('rejects, without minting a decision, when the review-transition write fails', async () => {
    const db = fakeDb({ failUpdateWhen: (table, values) => table === 'samples' && values.workflow_stage === 'review' })
    await expect(applyDecision(db as any, { ...base, decision: 'approved' })).rejects.toThrow(/review stage/i)
    // Never reached the certify/reject write — the sample is left exactly where it failed.
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review'])
  })

  it('rejects when the final certify/reject write fails', async () => {
    const db = fakeDb({
      failUpdateWhen: (table, values) => table === 'samples' && values.workflow_stage === 'certified',
    })
    await expect(
      applyDecision(db as any, { ...base, currentWorkflowStage: 'review', decision: 'approved' }),
    ).rejects.toThrow(/update sample status/i)
  })

  it('does not reject when the seller-comment write fails, and still reaches sys', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    vi.mocked(writeDecisionToShipmentSamples).mockClear()
    const db = fakeDb({ throwOnUpdateWhen: (table, values) => table === 'samples' && 'seller_comment' in values })
    await expect(
      applyDecision(db as any, {
        ...base,
        currentWorkflowStage: 'review',
        decision: 'approved',
        sellerComment: 'lovely cup',
      }),
    ).resolves.toBeUndefined()
    expect(writeDecisionToShipmentSamples).toHaveBeenCalled()
  })
})
