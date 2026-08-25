import { describe, it, expect, vi } from 'vitest'
import { applyDecision } from './finalize-pipeline'

vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: vi.fn(async () => undefined),
}))

/** Records every update issued per table, and what it was filtered on. */
function fakeDb() {
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
        then(resolve: (v: { error: null }) => unknown) {
          if (pending) writes.push({ table, values: pending, id })
          return Promise.resolve({ error: null }).then(resolve)
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
})
