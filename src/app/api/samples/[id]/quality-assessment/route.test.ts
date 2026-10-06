import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Grading FINALIZED on a lot whose cupping is already finalized decides the
 * lot and mints its certificate; a plain save never does (SAK-011933/26 was
 * certified on a screen-size-only save, 2026-10-05).
 *
 * "Cupping done" reads per protocol: a commodity score row, or for a specialty
 * lot (which has none) quality_assessments.cva_passed, written by cva/finalize
 * when its Certify step came back "pending, awaiting grading".
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))
vi.mock('@/lib/sample-group', () => ({
  resolveLabSourceId: async (_db: any, id: string) => id,
  groupSampleIds: async (_db: any, id: string) => [id],
}))
vi.mock('@/lib/certificate-storage', () => ({ invalidateCertificatePdf: async () => {} }))
vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: async () => {},
}))
const compliance = vi.hoisted(() => ({ evaluate: vi.fn() }))
vi.mock('@/lib/compliance', () => ({ evaluateQualityCompliance: compliance.evaluate }))
const mint = vi.hoisted(() => ({ applyDecisionToGroup: vi.fn(), mintGroupCertificates: vi.fn() }))
vi.mock('@/lib/cupping/certificate-mint', () => mint)
const staff = vi.hoisted(() => ({ isInternal: vi.fn() }))
vi.mock('@/lib/auth/sample-access', () => ({ isInternalStaff: staff.isInternal }))

import { POST } from './route'

type Row = Record<string, any>

/** In-memory PostgREST over seeded rows; records writes on `client.writes`. */
function fakeDb(tables: Record<string, Row[]>, me: string) {
  const writes: Array<{ table: string; op: string; values: any }> = []
  const client: any = {
    writes,
    auth: { getUser: async () => ({ data: { user: { id: me } }, error: null }) },
    from(table: string) {
      const calls: Array<[string, any[]]> = []
      const run = () => {
        let rows = [...(tables[table] ?? [])]
        for (const [op, args] of calls) {
          if (op === 'eq') rows = rows.filter((r) => r[args[0]] === args[1])
          if (op === 'neq') rows = rows.filter((r) => r[args[0]] !== args[1])
          if (op === 'in') rows = rows.filter((r) => (args[1] as any[]).includes(r[args[0]]))
          if (op === 'is') rows = rows.filter((r) => (r[args[0]] ?? null) === args[1])
          if (op === 'contains') rows = rows.filter((r) => (args[1] as any[]).every((v) => (r[args[0]] ?? []).includes(v)))
          // excludeCvaScores: `protocol.is.null,protocol.neq.cva`
          if (op === 'or' && String(args[0]).startsWith('protocol.is.null')) {
            rows = rows.filter((r) => r.protocol == null || r.protocol !== 'cva')
          }
          if (op === 'limit') rows = rows.slice(0, args[0])
        }
        return rows
      }
      let pendingUpdate: any = null
      // An update applies to the rows its filters select, once awaited.
      const flush = () => {
        if (!pendingUpdate) return
        for (const row of run()) Object.assign(row, pendingUpdate)
        pendingUpdate = null
      }
      const chain: any = {
        then(resolve: (v: any) => void) { flush(); resolve({ data: run(), error: null }) },
        single: async () => {
          flush()
          const row = run()[0] ?? null
          return { data: row, error: row ? null : { code: 'PGRST116', message: 'none' } }
        },
        maybeSingle: async () => { flush(); return { data: run()[0] ?? null, error: null } },
        update(values: any) { writes.push({ table, op: 'update', values }); pendingUpdate = values; return chain },
        insert(values: any) { writes.push({ table, op: 'insert', values }); return chain },
      }
      for (const op of ['select', 'eq', 'neq', 'in', 'is', 'or', 'contains', 'order', 'limit']) {
        chain[op] = (...args: any[]) => { calls.push([op, args]); return chain }
      }
      return chain
    },
  }
  return client
}

const post = (sampleId: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/samples/${sampleId}/quality-assessment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: sampleId }) },
  )

const lot = {
  id: 'lot-1', tracking_number: 'SAN-00940/26', workflow_stage: 'review', client_id: 'client-1',
  quality_spec_id: 'spec-1', locked: false, scanned_at: null, certificate_generated_at: null,
}
const grading = { screen_sizes: { '16': 40, '17': 60 }, defect_counts: {} }

function seed(assessment: Row) {
  return {
    samples: [lot],
    quality_assessments: [{ id: 'qa-1', sample_id: 'lot-1', green_bean_data: null, roast_data: null, created_at: '2026-09-16T10:00:00Z', ...assessment }],
    // The lot was cupped on the CVA journey only: no commodity card exists.
    cupping_scores: [{ id: 'cs-1', sample_id: 'lot-1', cupper_id: 'me', protocol: 'cva' }],
    cupping_sessions: [{ id: 'sess-1', session_type: 'cva', status: 'completed', sample_ids: ['lot-1'], cupper_ids: ['me'] }],
    certificates: [],
  }
}

beforeEach(() => {
  staff.isInternal.mockReset().mockResolvedValue(true)
  compliance.evaluate.mockReset().mockResolvedValue({ approved: true, violations: [] })
  mint.applyDecisionToGroup.mockReset().mockResolvedValue({ error: null })
  mint.mintGroupCertificates.mockReset().mockResolvedValue({
    certificates: { 'lot-1': { id: 'cert-1', certificate_number: 'SPEC-000001/26' } },
    minted: ['lot-1'], failed: [],
  })
})

describe('POST /api/samples/[id]/quality-assessment on a specialty lot', () => {
  it('grading finalized on a lot whose cup was approved at Certify decides it and mints the certificate', async () => {
    state.db = fakeDb(seed({ cva_passed: true }), 'me')
    const body = await (await post('lot-1', { green_bean_data: grading, finalize_grading: true })).json()
    expect(body.certificate?.certificate_number).toBe('SPEC-000001/26')
    expect(mint.applyDecisionToGroup).toHaveBeenCalledWith(expect.anything(), 'lot-1', expect.objectContaining({ status: 'approved', workflow_stage: 'certified' }))
  })

  it('out-of-spec grading rejects the cup-approved lot', async () => {
    compliance.evaluate.mockResolvedValue({ approved: false, violations: ['Screen 16: 40% (min 50%)'] })
    state.db = fakeDb(seed({ cva_passed: true }), 'me')
    const body = await (await post('lot-1', { green_bean_data: grading, finalize_grading: true })).json()
    expect(body.certificate?.decision).toBe('rejected')
    expect(mint.mintGroupCertificates).toHaveBeenCalledWith(expect.anything(), 'lot-1', expect.objectContaining({ isRejected: true, violations: ['Screen 16: 40% (min 50%)'] }))
  })

  it('does nothing beyond saving when the cup was never judged', async () => {
    state.db = fakeDb(seed({ cva_passed: null }), 'me')
    const body = await (await post('lot-1', { green_bean_data: grading, finalize_grading: true })).json()
    expect(body.success).toBe(true)
    expect(body.certificate).toBeUndefined()
    expect(mint.applyDecisionToGroup).not.toHaveBeenCalled()
  })
})

describe('POST /api/samples/[id]/quality-assessment: save is not finalize', () => {
  const commodity = () => ({
    ...seed({}),
    cupping_scores: [{ id: 'cs-1', sample_id: 'lot-1', cupper_id: 'me', protocol: null }],
    cupping_sessions: [{ id: 'sess-1', session_type: 'regular', status: 'completed', sample_ids: ['lot-1'], cupper_ids: ['me'] }],
  })

  it('a save on a lot whose cupping is finalized only saves (SAK-011933/26: screen sizes alone, certified)', async () => {
    state.db = fakeDb(commodity(), 'me')
    const body = await (await post('lot-1', { green_bean_data: { screen_sizes: { '16': 45, '15': 37 } } })).json()
    expect(body.success).toBe(true)
    expect(body.certificate).toBeUndefined()
    expect(body.grading_finalized).toBeUndefined()
    expect(mint.applyDecisionToGroup).not.toHaveBeenCalled()
    expect(mint.mintGroupCertificates).not.toHaveBeenCalled()
    expect(state.db.writes.some((w: any) => 'grading_finalized_at' in w.values)).toBe(false)
  })

  it('finalize stamps who and when, then certifies', async () => {
    state.db = fakeDb(commodity(), 'me')
    const body = await (await post('lot-1', { green_bean_data: grading, finalize_grading: true })).json()
    const stamp = state.db.writes.find((w: any) => 'grading_finalized_at' in w.values)
    expect(stamp?.values.grading_finalized_by).toBe('me')
    expect(body.certificate?.certificate_number).toBe('SPEC-000001/26')
  })

  it('finalize with the cupping still open stamps the grading and waits for the cupping', async () => {
    const tables = commodity()
    tables.samples = [{ ...lot, workflow_stage: 'analysis' }]
    state.db = fakeDb(tables, 'me')
    const body = await (await post('lot-1', { green_bean_data: grading, finalize_grading: true })).json()
    expect(body.grading_finalized).toBe(true)
    expect(body.cupping_pending).toBe(true)
    expect(body.certificate).toBeUndefined()
    expect(mint.applyDecisionToGroup).not.toHaveBeenCalled()
  })

  it('a portal user cannot finalize', async () => {
    staff.isInternal.mockResolvedValue(false)
    state.db = fakeDb(commodity(), 'me')
    const res = await post('lot-1', { green_bean_data: grading, finalize_grading: true })
    expect(res.status).toBe(403)
    expect(state.db.writes).toEqual([])
  })

  it('nothing graded, nothing to finalize', async () => {
    state.db = fakeDb(commodity(), 'me')
    const res = await post('lot-1', { finalize_grading: true })
    expect(res.status).toBe(400)
    expect(mint.applyDecisionToGroup).not.toHaveBeenCalled()
  })
})
