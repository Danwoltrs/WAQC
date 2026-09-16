import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Grading saved on a lot whose cupping is already finalized decides the lot
 * and mints its certificate. That held for commodity lots only: the check for
 * "cupping done" looked for a commodity score row, and a specialty lot has
 * none. Its cup verdict lives on quality_assessments.cva_passed, written by
 * cva/finalize when its Certify step came back "pending, awaiting grading".
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
      const chain: any = {
        then(resolve: (v: any) => void) { resolve({ data: run(), error: null }) },
        single: async () => {
          const row = run()[0] ?? null
          return { data: row, error: row ? null : { code: 'PGRST116', message: 'none' } }
        },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        update(values: any) { writes.push({ table, op: 'update', values }); return chain },
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
  compliance.evaluate.mockReset().mockResolvedValue({ approved: true, violations: [] })
  mint.applyDecisionToGroup.mockReset().mockResolvedValue({ error: null })
  mint.mintGroupCertificates.mockReset().mockResolvedValue({
    certificates: { 'lot-1': { id: 'cert-1', certificate_number: 'SPEC-000001/26' } },
    minted: ['lot-1'], failed: [],
  })
})

describe('POST /api/samples/[id]/quality-assessment on a specialty lot', () => {
  it('grading saved on a lot whose cup was approved at Certify decides it and mints the certificate', async () => {
    state.db = fakeDb(seed({ cva_passed: true }), 'me')
    const body = await (await post('lot-1', { green_bean_data: grading })).json()
    expect(body.certificate?.certificate_number).toBe('SPEC-000001/26')
    expect(mint.applyDecisionToGroup).toHaveBeenCalledWith(expect.anything(), 'lot-1', expect.objectContaining({ status: 'approved', workflow_stage: 'certified' }))
  })

  it('out-of-spec grading rejects the cup-approved lot', async () => {
    compliance.evaluate.mockResolvedValue({ approved: false, violations: ['Screen 16: 40% (min 50%)'] })
    state.db = fakeDb(seed({ cva_passed: true }), 'me')
    const body = await (await post('lot-1', { green_bean_data: grading })).json()
    expect(body.certificate?.decision).toBe('rejected')
    expect(mint.mintGroupCertificates).toHaveBeenCalledWith(expect.anything(), 'lot-1', expect.objectContaining({ isRejected: true, violations: ['Screen 16: 40% (min 50%)'] }))
  })

  it('does nothing beyond saving when the cup was never judged', async () => {
    state.db = fakeDb(seed({ cva_passed: null }), 'me')
    const body = await (await post('lot-1', { green_bean_data: grading })).json()
    expect(body.success).toBe(true)
    expect(body.certificate).toBeUndefined()
    expect(mint.applyDecisionToGroup).not.toHaveBeenCalled()
  })
})
