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
  writes: [] as Array<{ table: string; values: any }>,
  resolveSampleSpec: vi.fn(),
}))

vi.mock('@/lib/quality-spec/resolve', () => ({ resolveSampleSpec: m.resolveSampleSpec, resolveSampleSpecs: vi.fn() }))

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
            if (prop === 'update') return (values: any) => (m.writes.push({ table, values }), chain)
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
    m.writes = []
    m.resolveSampleSpec.mockResolvedValue(null)
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

describe('POST /api/cupping/finalize and the spec version', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.writes = []
    m.tables = {
      cupping_sessions: { one: { id: 'sess', sample_ids: ['s1'] }, rows: [] },
      samples: {
        one: { id: 's1', client_id: 'client', workflow_stage: 'review', status: 'pending', quality_spec_id: 'spec', sample_category: 'commodity' },
        rows: [],
      },
      quality_assessments: { one: { id: 'qa', green_bean_data: {}, grading_finalized_at: '2026-11-09', clean_cup: null, uniform_cup: null }, rows: [] },
      cupping_scores: { rows: [{ id: 'r1', cupper_id: 'c1', scores: { Aroma: 7 }, defects: { taints: [{ name: 'Ferment', cups_affected: 1, intensity: 2 }], faults: [] } }], one: null },
    }
    m.hasRules.mockResolvedValue(true)
    m.evaluate.mockResolvedValue({ approved: true, violations: [] })
    m.applyDecision.mockResolvedValue(undefined)
    m.mintCertificates.mockResolvedValue({ certificate: { id: 'c', certificate_number: 'SAK-1/26' }, group: {} })
    m.closeSessionIfComplete.mockResolvedValue({ allFinalized: true })
  })

  const versionWith = (parameters: Record<string, unknown>) => ({
    id: 'spec', custom_name: null, quality_code: null, template_id: 'tpl', cups_per_sample: null,
    discrepancy_threshold: null, custom_parameters: {},
    template: { id: 'tpl', name: 'T', name_en: null, description: null, parameters },
    version: { id: 'v1', versionNo: 1, effectiveFrom: '2026-01-01', pinned: true },
  })

  it('pins the lot before the gate judges it', async () => {
    m.resolveSampleSpec.mockResolvedValue(versionWith({}))
    await POST(req())
    expect(m.resolveSampleSpec).toHaveBeenCalledWith('s1', { pin: true })
    expect(m.resolveSampleSpec.mock.invocationCallOrder[0]).toBeLessThan(m.evaluate.mock.invocationCallOrder[0])
  })

  it("clean and uniform cup follow the version's cup_status_rules", async () => {
    // One taint: zero tolerance would fail the cup, the version allows one.
    m.resolveSampleSpec.mockResolvedValue(versionWith({
      cup_status_rules: { clean_cup: { max_taints: 1, max_faults: 0 }, uniform_cup: { max_taints: 1, max_faults: 0 } },
    }))
    await POST(req())
    const qa = m.writes.find((w) => w.table === 'quality_assessments' && 'clean_cup_auto' in w.values)
    expect(qa?.values).toMatchObject({ clean_cup_auto: true, uniform_cup_auto: true })
  })

  it('without rules on the version, the SCA zero tolerance applies', async () => {
    m.resolveSampleSpec.mockResolvedValue(versionWith({}))
    await POST(req())
    const qa = m.writes.find((w) => w.table === 'quality_assessments' && 'clean_cup_auto' in w.values)
    expect(qa?.values).toMatchObject({ clean_cup_auto: false, uniform_cup_auto: false })
  })

  it('asks the rules check about this sample', async () => {
    await POST(req({ manual_decision: 'approved' }))
    expect(m.hasRules).toHaveBeenCalledWith(expect.anything(), 'spec', 's1')
  })
})
