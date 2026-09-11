import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The route is mocked down to its collaborators so the ORDER and the ARGUMENTS
 * of the certification sequence can be asserted. That sequence is the whole
 * point: an earlier version wrote `status: 'approved'` and the
 * `approved_with_comments` flag straight onto the group and stopped there, so
 * `workflow_stage` never reached 'certified' — and every buyer surface (the
 * public QR page, the public JSON endpoint, the buyer PDF, the portal) gates on
 * exactly that, while sys.wolthers.com never learned the lot had been decided.
 * The whole buyer-facing half of the feature was unreachable and no test could
 * see it, because the only thing covered here was `buildDecision`.
 */
// vi.mock factories are hoisted above every import, so everything they close
// over has to be hoisted with them.
const h = vi.hoisted(() => {
  // Parameters are declared so `.mock.calls[0][1]` is typed — the argument
  // object is what these assertions are actually about.
  const applyDecision = vi.fn(async (_db: unknown, _input: Record<string, unknown>) => {})
  const mintCertificates = vi.fn(async (_db: unknown, _input: Record<string, unknown>) => ({
    certificate: null,
    group: null,
  }))
  class InvalidTrackingNumberError extends Error {
    readonly status = 400
    readonly details = 'bad tracking number'
  }
  const sampleRow = {
    id: 'lab-1',
    quality_spec_id: 'spec-1',
    workflow_stage: 'analysis',
    tracking_number: 'BR-000001/26',
    client_id: 'client-1',
    sample_category: null,
  }
  // Every write the route makes, in the order it makes it.
  const writes: Array<{ table: string; op: string; payload?: unknown }> = []
  const fakeDb = () => ({
    from(table: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.in = () => Promise.resolve({ error: null })
      q.single = async () =>
        table === 'samples'
          ? { data: sampleRow, error: null }
          : { data: { id: 'decision-1' }, error: null }
      q.insert = (payload: unknown) => { writes.push({ table, op: 'insert', payload }); return q }
      q.update = (payload: unknown) => { writes.push({ table, op: 'update', payload }); return q }
      q.delete = () => { writes.push({ table, op: 'delete' }); return q }
      return q
    },
  })
  return { applyDecision, mintCertificates, InvalidTrackingNumberError, writes, fakeDb }
})

const { applyDecision, mintCertificates, InvalidTrackingNumberError, writes } = h

vi.mock('@/lib/cupping/finalize-pipeline', () => ({
  applyDecision: h.applyDecision,
  mintCertificates: h.mintCertificates,
  InvalidTrackingNumberError: h.InvalidTrackingNumberError,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.fakeDb() }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => true }))
vi.mock('@/lib/compliance', () => ({ evaluateSampleCompliance: async () => [] }))
vi.mock('@/lib/tolerance/evaluate', () => ({
  evaluateTolerance: () => ({ offered: true, items: [], blockedBy: [] }),
}))
vi.mock('@/lib/tolerance/sample-limits', () => ({
  computeIssuedValuesForSample: async () => ({
    ok: true,
    issued: { screen_percentages: { '18': 30 }, defects: null },
  }),
}))
vi.mock('@/lib/sample-group', () => ({
  resolveLabSourceId: async () => 'lab-1',
  groupSampleIds: async () => ['lab-1', 'sib-1'],
}))

import { buildDecision, POST } from './route'

const request = () => ({ json: async () => ({ comments: ['Melhorar peneira 18.'] }) }) as never
const params = Promise.resolve({ id: 'sib-1' })

describe('POST /api/samples/[id]/approve-with-comments — it really certifies the lot', () => {
  beforeEach(() => {
    writes.length = 0
    applyDecision.mockClear()
    mintCertificates.mockClear()
    mintCertificates.mockImplementation(async () => ({ certificate: null, group: null }))
  })

  it('runs the shared certification pipeline, then mints, then flags', async () => {
    const res = await POST(request(), { params })
    expect(res.status).toBe(200)

    // Decided through the shared pipeline — which walks the stage to 'review'
    // one legal step at a time (the DB trigger forbids analysis -> certified),
    // applies status + stage group-wide and writes back to sys. A sample still
    // at 'analysis', the normal state when grading is saved, is handled rather
    // than 500ing.
    expect(applyDecision).toHaveBeenCalledTimes(1)
    expect(applyDecision.mock.calls[0][1]).toMatchObject({
      sampleId: 'lab-1',
      decision: 'approved',
      currentWorkflowStage: 'analysis',
      actorUserId: 'user-1',
    })

    // One certificate per group member, issued not rejected, and carrying NO
    // violations — the issued values passed the same gate that judged the raw
    // ones.
    expect(mintCertificates).toHaveBeenCalledTimes(1)
    expect(mintCertificates.mock.calls[0][1]).toMatchObject({
      decision: 'approved',
      isRejected: false,
      violations: [],
      trackingNumber: 'BR-000001/26',
      sample: { id: 'lab-1', client_id: 'client-1' },
    })

    // The flag is written LAST and on its own: it is the live switch both
    // tolerance readers check, so it must not turn on before the lot is
    // genuinely approved and certified.
    const ops = writes.map((w) => `${w.table}.${w.op}`)
    expect(ops).toEqual(['sample_tolerance_approvals.insert', 'samples.update'])
    expect(writes[1].payload).toEqual({ approved_with_comments: true })
  })

  it('rolls the decision row back and reports the stage when the lot cannot be certified', async () => {
    // A lot at a terminal stage the walk cannot leave ('rejected' -> certified
    // is not a legal transition). Answered with an explicit 409 the grading
    // page shows in its toast, never a silent 500.
    applyDecision.mockImplementationOnce(async () => { throw new Error('Failed to transition') })

    const res = await POST(request(), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('analysis')
    expect(mintCertificates).not.toHaveBeenCalled()
    // Rolled back, and the flag was never set.
    expect(writes.map((w) => `${w.table}.${w.op}`)).toEqual([
      'sample_tolerance_approvals.insert',
      'sample_tolerance_approvals.delete',
    ])
  })

  it('never flags the group when the certificate cannot be minted', async () => {
    mintCertificates.mockImplementationOnce(async () => { throw new InvalidTrackingNumberError('bad') })

    const res = await POST(request(), { params })
    expect(res.status).toBe(400)
    expect(writes.some((w) => w.op === 'update')).toBe(false)
    expect(writes.some((w) => w.table === 'sample_tolerance_approvals' && w.op === 'delete')).toBe(true)
  })
})

describe('buildDecision — the audit row', () => {
  const items = [
    { key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution' as const,
      direction: 'min' as const, actual: 27.2, limit: 30, gap: 2.8, tolerance: 5 },
  ]

  it('records every metric with its gap and tolerance', () => {
    const d = buildDecision({
      items,
      issued: { screen_percentages: { '18': 30 }, defects: null },
      comments: ['Melhorar peneira 18 para no minimo 30%.'],
      requestAdditionalSample: true,
      userId: 'user-1',
    })
    expect(d.metrics).toHaveLength(1)
    expect(d.metrics[0]).toMatchObject({ key: 'screen_18_min', gap: 2.8, tolerance: 5 })
    expect(d.issued_values.screen_percentages).toEqual({ '18': 30 })
    expect(d.request_additional_sample).toBe(true)
    expect(d.decided_by).toBe('user-1')
  })

  it('drops blank comment lines', () => {
    const d = buildDecision({
      items, issued: { screen_percentages: null, defects: null },
      comments: ['  ', 'Reduzir fundo.'], requestAdditionalSample: false, userId: 'u',
    })
    expect(d.comments).toEqual(['Reduzir fundo.'])
  })
})
