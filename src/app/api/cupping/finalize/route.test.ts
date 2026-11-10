import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  tolerance: vi.fn(),
  hasRules: vi.fn(),
  evaluate: vi.fn(),
  applyDecision: vi.fn(),
  mintCertificates: vi.fn(),
  closeSessionIfComplete: vi.fn(),
  tables: {} as Record<string, any>,
}))

vi.mock('@/lib/tolerance/auto-approve', () => ({ approveWithinTolerance: m.tolerance }))
vi.mock('@/lib/compliance', () => ({
  checkHasValidationRules: m.hasRules,
  evaluateQualityCompliance: m.evaluate,
}))
vi.mock('@/lib/cupping/finalize-pipeline', () => {
  class InvalidTrackingNumberError extends Error {
    details = ''
  }
  return {
    applyDecision: m.applyDecision,
    mintCertificates: m.mintCertificates,
    closeSessionIfComplete: m.closeSessionIfComplete,
    InvalidTrackingNumberError,
  }
})
vi.mock('@/lib/cupping-protocol-scope', () => ({ excludeCvaScores: (q: any) => q }))
vi.mock('@/lib/cupping/finalize-gate', () => ({
  assertCanFinalize: () => ({ ok: true, assignedCupperIds: ['c1'], isSingleCupperSession: true }),
}))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'u1' }, error: null }) }) }),
    }),
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const seed = m.tables[table] ?? { rows: [], one: null }
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') return (res: any) => res({ data: seed.rows, error: null })
            if (prop === 'single' || prop === 'maybeSingle') return async () => ({ data: seed.one, error: null })
            return () => chain
          },
        },
      )
      return chain
    },
  }),
}))

import { POST } from './route'

const req = (extra: Record<string, unknown> = {}) =>
  new NextRequest('http://localhost/api/cupping/finalize', {
    method: 'POST',
    body: JSON.stringify({ session_id: 'sess', sample_id: 's1', ...extra }),
  })

const approvedByTolerance = {
  kind: 'approved',
  groupIds: ['s1'],
  certificate: { id: 'c', certificate_number: 'SAK-1/26' },
  sellerEmail: { sent: [], waiting: [] },
}

describe('POST /api/cupping/finalize and the 5% rule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.tables = {
      cupping_sessions: { one: { id: 'sess', sample_ids: ['s1'] }, rows: [] },
      samples: {
        one: {
          id: 's1',
          tracking_number: 'SAN-00001/26',
          client_id: 'client',
          workflow_stage: 'review',
          status: 'pending',
          quality_spec_id: 'spec',
          sample_category: 'commodity',
        },
        rows: [],
      },
      quality_assessments: { one: { id: 'qa', green_bean_data: {}, grading_finalized_at: '2026-11-09' }, rows: [] },
      cupping_scores: { rows: [{ id: 'r1', cupper_id: 'c1', scores: { Aroma: 7 }, defects: [] }], one: null },
    }
    m.hasRules.mockResolvedValue(true)
    m.evaluate.mockResolvedValue({ approved: false, violations: ['Moisture'] })
    m.applyDecision.mockResolvedValue(undefined)
    m.mintCertificates.mockResolvedValue({ certificate: { id: 'rej', certificate_number: 'R-SAK-1/26' }, group: {} })
    m.closeSessionIfComplete.mockResolvedValue({ allFinalized: true })
  })

  it('approved: answers approved, no second decision or mint, session closed', async () => {
    m.tolerance.mockResolvedValue(approvedByTolerance)
    const body = await (await POST(req())).json()
    expect(body).toMatchObject({ decision: 'approved', violations: [] })
    expect(body.message).toBe('Sample approved with comments - Certificate SAK-1/26 generated')
    expect(m.applyDecision).not.toHaveBeenCalled()
    expect(m.mintCertificates).not.toHaveBeenCalled()
    expect(m.closeSessionIfComplete.mock.calls[0][1]).toMatchObject({ decision: 'approved', violations: [] })
  })

  it('failed: 500 with the reason, nothing rejected, session left open', async () => {
    m.tolerance.mockResolvedValue({ kind: 'failed', error: 'stays in Review' })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('stays in Review')
    expect(m.applyDecision).not.toHaveBeenCalled()
    expect(m.closeSessionIfComplete).not.toHaveBeenCalled()
  })

  it('not applicable rejects as before', async () => {
    m.tolerance.mockResolvedValue({ kind: 'not_applicable' })
    await POST(req())
    expect(m.applyDecision.mock.calls[0][1]).toMatchObject({ decision: 'rejected' })
    expect(m.mintCertificates).toHaveBeenCalled()
  })

  it('a passing lot never tries the 5% rule', async () => {
    m.evaluate.mockResolvedValue({ approved: true, violations: [] })
    await POST(req())
    expect(m.tolerance).not.toHaveBeenCalled()
  })

  it('a manual rejection on a spec with no rules never tries the 5% rule', async () => {
    m.hasRules.mockResolvedValue(false)
    await POST(req({ manual_decision: 'rejected' }))
    expect(m.tolerance).not.toHaveBeenCalled()
    expect(m.applyDecision.mock.calls[0][1]).toMatchObject({ decision: 'rejected' })
  })
})
