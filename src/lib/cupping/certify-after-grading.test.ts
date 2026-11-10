import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  tolerance: vi.fn(),
  hasRules: vi.fn(),
  evaluate: vi.fn(),
  applyDecisionToGroup: vi.fn(),
  mintGroupCertificates: vi.fn(),
  closeSessionsOnceDecided: vi.fn(),
  tables: {} as Record<string, any>,
}))

vi.mock('@/lib/tolerance/auto-approve', () => ({ approveWithinTolerance: m.tolerance }))
vi.mock('@/lib/compliance', () => ({
  checkHasValidationRules: m.hasRules,
  evaluateQualityCompliance: m.evaluate,
}))
vi.mock('@/lib/cupping/certificate-mint', () => ({
  applyDecisionToGroup: m.applyDecisionToGroup,
  mintGroupCertificates: m.mintGroupCertificates,
}))
vi.mock('@/lib/cupping/finalize-pipeline', () => ({ closeSessionsOnceDecided: m.closeSessionsOnceDecided }))
vi.mock('@/lib/cupping-protocol-scope', () => ({
  excludeCvaScores: (q: any) => q,
  excludeCvaSessions: (q: any) => q,
}))
vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: async () => {},
}))

import { certifyAfterGrading } from './certify-after-grading'

/** A chain whose every filter returns itself and which resolves to the table's seeded value. */
function db() {
  return {
    from(table: string) {
      const seed = m.tables[table] ?? { rows: [], one: null }
      let scoped = false
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'in') return () => ((scoped = true), chain)
            if (prop === 'then') {
              return (res: any) => res({ data: scoped && seed.scopedRows ? seed.scopedRows : seed.rows, error: scoped ? seed.scopedError ?? null : null })
            }
            if (prop === 'single' || prop === 'maybeSingle') return async () => ({ data: seed.one, error: seed.oneError ?? null })
            return () => chain
          },
        },
      )
      return chain
    },
  }
}

const sample = {
  tracking_number: 'SAN-00001/26',
  quality_spec_id: 'spec',
  client_id: 'client',
  sample_category: 'commodity',
  workflow_stage: 'review',
}
const args = { sampleId: 's1', labId: 'lab', sample, userId: 'u1' }

function seed({ commodity = true, cva = null as boolean | null } = {}) {
  m.tables = {
    quality_assessments: { one: { cva_passed: cva, grading_finalized_at: '2026-11-09' }, rows: [] },
    cupping_scores: { rows: commodity ? [{ id: 'x' }] : [], one: null },
    certificates: { one: null, rows: [] },
    cupping_sessions: { one: { cupper_ids: ['c1'] }, rows: [] },
    samples: { one: { client_id: 'lab-client' }, rows: [] },
  }
}

describe('certifyAfterGrading and the 5% rule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seed()
    m.hasRules.mockResolvedValue(true)
    m.evaluate.mockResolvedValue({ approved: false, violations: ['Moisture'] })
    m.applyDecisionToGroup.mockResolvedValue({ error: null })
    m.mintGroupCertificates.mockResolvedValue({
      failed: [],
      certificates: { s1: { id: 'rej', certificate_number: 'R-SAK-1/26' } },
    })
  })

  const approved = () => ({
    kind: 'approved',
    groupIds: ['lab', 's1'],
    certificate: { id: 'c', certificate_number: 'SAK-1/26' },
    certificates: {
      lab: { id: 'c', certificate_number: 'SAK-1/26' },
      s1: { id: 'sib', certificate_number: 'SAK-2/26' },
    },
    sellerEmail: { sent: [], waiting: [] },
  })

  it('a sibling failing rules tries the 5% rule with the lab unit\'s client and returns its own certificate', async () => {
    m.tolerance.mockResolvedValue(approved())
    expect(await certifyAfterGrading(db(), args)).toMatchObject({
      decision: 'approved',
      violations: [],
      id: 'sib',
      certificate_number: 'SAK-2/26',
    })
    expect(m.tolerance.mock.calls[0][1]).toMatchObject({
      labId: 'lab',
      clientId: 'lab-client',
      sampleCategory: 'commodity',
      currentWorkflowStage: 'review',
      assignedCupperIds: ['c1'],
    })
    expect(m.applyDecisionToGroup).not.toHaveBeenCalled()
    expect(m.closeSessionsOnceDecided).toHaveBeenCalled()
  })

  it('the lab unit itself gets the outcome\'s certificate and its own client', async () => {
    m.tolerance.mockResolvedValue(approved())
    m.tables.samples = { one: { client_id: 'should-not-be-read' }, rows: [] }
    expect(await certifyAfterGrading(db(), { ...args, sampleId: 'lab' })).toMatchObject({ id: 'c', certificate_number: 'SAK-1/26' })
    expect(m.tolerance.mock.calls[0][1]).toMatchObject({ clientId: 'client' })
  })

  it('a sibling whose own certificate is missing falls back to the lab unit\'s, as the ordinary path does', async () => {
    m.tolerance.mockResolvedValue({ ...approved(), certificates: { lab: { id: 'c', certificate_number: 'SAK-1/26' } } })
    expect(await certifyAfterGrading(db(), args)).toMatchObject({ id: 'c' })
  })

  it('the lab unit cannot be read: undecided, the 5% rule is not tried', async () => {
    m.tables.samples = { one: null, oneError: { message: 'boom' }, rows: [] }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await certifyAfterGrading(db(), args)).toBeNull()
    expect(logged).toHaveBeenCalledWith('[CertifyAfterGrading] Reading the lab unit failed:', { message: 'boom' })
    logged.mockRestore()
    expect(m.tolerance).not.toHaveBeenCalled()
    expect(m.applyDecisionToGroup).not.toHaveBeenCalled()
  })

  it('not applicable rejects as before', async () => {
    m.tolerance.mockResolvedValue({ kind: 'not_applicable' })
    expect(await certifyAfterGrading(db(), args)).toMatchObject({ decision: 'rejected' })
  })

  it('failed leaves the lot undecided: null, no rejection written', async () => {
    m.tolerance.mockResolvedValue({ kind: 'failed', error: 'x' })
    expect(await certifyAfterGrading(db(), args)).toBeNull()
    expect(m.applyDecisionToGroup).not.toHaveBeenCalled()
  })

  it('a specialty lot (no commodity scores, cva_passed true) never tries the 5% rule', async () => {
    seed({ commodity: false, cva: true })
    await certifyAfterGrading(db(), args)
    expect(m.tolerance).not.toHaveBeenCalled()
  })

  it('a manual decision on a spec with no rules never tries the 5% rule', async () => {
    m.hasRules.mockResolvedValue(false)
    await certifyAfterGrading(db(), { ...args, manualDecision: 'rejected' })
    expect(m.tolerance).not.toHaveBeenCalled()
  })

  it('scores exist but none from an assigned cupper: no 5% rule, rejects as before', async () => {
    m.tables.cupping_scores = { rows: [{ id: 'x' }], scopedRows: [], one: null }
    expect(await certifyAfterGrading(db(), args)).toMatchObject({ decision: 'rejected' })
    expect(m.tolerance).not.toHaveBeenCalled()
  })

  it('a failed read of the assigned cuppers scores leaves the lot undecided', async () => {
    m.tables.cupping_scores = { rows: [{ id: 'x' }], scopedRows: null, scopedError: { message: 'boom' }, one: null }
    expect(await certifyAfterGrading(db(), args)).toBeNull()
    expect(m.tolerance).not.toHaveBeenCalled()
    expect(m.applyDecisionToGroup).not.toHaveBeenCalled()
  })

  it('a lot that passes its rules never tries the 5% rule', async () => {
    m.evaluate.mockResolvedValue({ approved: true, violations: [] })
    await certifyAfterGrading(db(), args)
    expect(m.tolerance).not.toHaveBeenCalled()
  })
})
