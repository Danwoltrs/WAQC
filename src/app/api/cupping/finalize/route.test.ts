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
  pinGroupSpec: vi.fn(),
  loadConfig: vi.fn(),
  updateErrors: {} as Record<string, any[]>,
  readError: null as null | ((table: string, columns: string) => any),
}))

vi.mock('@/lib/quality-spec/resolve', () => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/lot-spec', () => ({ pinGroupSpec: m.pinGroupSpec }))
vi.mock('@/lib/sensory/load-config', () => ({ loadSampleSensoryConfig: m.loadConfig }))

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
      let error: any = null
      let readErr: any = null
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') return (res: any) => res({ data: seed.rows, error })
            if (prop === 'select')
              return (columns = '*') => {
                readErr = m.readError?.(table, String(columns)) ?? null
                return chain
              }
            if (prop === 'single' || prop === 'maybeSingle')
              return async () => (readErr ? { data: null, error: readErr } : { data: seed.one, error: null })
            if (prop === 'update' || prop === 'insert')
              return (values: any) => {
                m.writes.push({ table, values })
                error = m.updateErrors[table]?.shift() ?? null
                return chain
              }
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
    m.pinGroupSpec.mockResolvedValue(null)
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
    m.pinGroupSpec.mockResolvedValue(versionWith({}))
    await POST(req())
    // The whole contract group is pinned, a sibling on another quality too (I2).
    expect(m.pinGroupSpec).toHaveBeenCalledWith('s1')
    expect(m.pinGroupSpec.mock.invocationCallOrder[0]).toBeLessThan(m.evaluate.mock.invocationCallOrder[0])
  })

  it("clean and uniform cup follow the version's cup_status_rules", async () => {
    // One taint: zero tolerance would fail the cup, the version allows one.
    m.pinGroupSpec.mockResolvedValue(versionWith({
      cup_status_rules: { clean_cup: { max_taints: 1, max_faults: 0 }, uniform_cup: { max_taints: 1, max_faults: 0 } },
    }))
    await POST(req())
    const qa = m.writes.find((w) => w.table === 'quality_assessments' && 'clean_cup_auto' in w.values)
    expect(qa?.values).toMatchObject({ clean_cup_auto: true, uniform_cup_auto: true })
  })

  it('without rules on the version, the SCA zero tolerance applies', async () => {
    m.pinGroupSpec.mockResolvedValue(versionWith({}))
    await POST(req())
    const qa = m.writes.find((w) => w.table === 'quality_assessments' && 'clean_cup_auto' in w.values)
    expect(qa?.values).toMatchObject({ clean_cup_auto: false, uniform_cup_auto: false })
  })

  it('asks the rules check about this sample', async () => {
    await POST(req({ manual_decision: 'approved' }))
    expect(m.hasRules).toHaveBeenCalledWith(expect.anything(), 'spec', 's1')
  })
})

describe('POST /api/cupping/finalize and the sensory resolution', () => {
  const choc = ['Nutty/Cocoa', 'Cocoa', 'Chocolate']
  const car = ['Sweet', 'Brown Sugar', 'Caramelized']
  const dbProfile = {
    id: 'p1', name: 'Cerrado', origin: 'Brazil', region: 'Cerrado Mineiro',
    notes: [choc, car], description: 'Chocolate and caramel.', is_active: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    m.writes = []
    m.updateErrors = {}
    m.readError = null
    m.tables = {
      cupping_sessions: { one: { id: 'sess', sample_ids: ['s1'] }, rows: [] },
      samples: {
        one: { id: 's1', client_id: 'client', workflow_stage: 'review', status: 'pending', quality_spec_id: 'spec', sample_category: 'commodity' },
        rows: [],
      },
      quality_assessments: { one: { id: 'qa', green_bean_data: {}, grading_finalized_at: '2026-11-09', clean_cup: null, uniform_cup: null }, rows: [] },
      cupping_scores: { rows: [{ id: 'r1', cupper_id: 'c1', scores: { Aroma: 7 }, defects: [] }], one: null },
    }
    m.pinGroupSpec.mockResolvedValue(null)
    m.hasRules.mockResolvedValue(true)
    m.evaluate.mockResolvedValue({ approved: true, violations: [] })
    m.applyDecision.mockResolvedValue(undefined)
    m.mintCertificates.mockResolvedValue({ certificate: { id: 'c', certificate_number: 'SAK-1/26' }, group: {} })
    m.closeSessionIfComplete.mockResolvedValue({ allFinalized: true })
    m.loadConfig.mockResolvedValue({ notesEnabled: false, profile: null, profileConfigured: false })
  })

  const preGate = () => m.writes.find((w) => w.table === 'quality_assessments' && 'score_resolution' in w.values)
  const sensoryWrites = () => m.writes.filter((w) => w.table === 'quality_assessments' && 'sensory_resolution' in w.values)

  it('without the field, the config is never read and nothing sensory is written', async () => {
    await POST(req())
    expect(m.loadConfig).not.toHaveBeenCalled()
    expect(sensoryWrites()).toHaveLength(0)
  })

  it('both settings off: ignores a sent field and writes no sensory_resolution', async () => {
    const res = await POST(req({ sensory_resolution: { notes: [choc], match: true } }))
    expect(res.status).toBe(200)
    expect(m.loadConfig).toHaveBeenCalledWith(expect.anything(), 's1')
    expect(sensoryWrites()).toHaveLength(0)
    expect(preGate()).toBeTruthy()
  })

  it('a profile and no answer: 400 before anything is written', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: dbProfile, profileConfigured: true })
    const res = await POST(req({ sensory_resolution: { notes: [choc], match: null } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Answer the regional profile: Yes or No')
    expect(m.writes).toHaveLength(0)
    expect(m.pinGroupSpec).not.toHaveBeenCalled()
    expect(m.evaluate).not.toHaveBeenCalled()
    expect(m.applyDecision).not.toHaveBeenCalled()
  })

  it('freezes the DB profile snapshot with the scores, stamped by the validator', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: dbProfile, profileConfigured: true })
    await POST(req({
      sensory_resolution: {
        notes: [choc, ['Not', 'On', 'Wheel']],
        match: true,
        // Anything client-sent about the profile is ignored.
        profile: { id: 'p1', name: 'Hacked', notes: [], description: 'x' },
      },
    }))
    const w = preGate()
    expect(w).toBeTruthy()
    const sr = w!.values.sensory_resolution
    expect(sr).toMatchObject({ version: 1, notes: [choc], source: 'validation', resolved_by: 'u1' })
    expect(typeof sr.resolved_at).toBe('string')
    expect(sr.profile).toEqual({
      id: 'p1', name: 'Cerrado', region: 'Cerrado Mineiro', notes: [choc, car], description: 'Chocolate and caramel.', match: true,
    })
  })

  it('notes off: the frozen notes are empty even when some were sent', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: false, profile: dbProfile, profileConfigured: true })
    await POST(req({ sensory_resolution: { notes: [choc], match: false } }))
    const sr = preGate()!.values.sensory_resolution
    expect(sr.notes).toEqual([])
    expect(sr.profile.match).toBe(false)
  })

  it('no profile configured: profile is null and a sent answer is dropped', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: null, profileConfigured: false })
    const res = await POST(req({ sensory_resolution: { notes: [choc], match: true } }))
    expect(res.status).toBe(200)
    const sr = preGate()!.values.sensory_resolution
    expect(sr.profile).toBeNull()
    expect(sr.notes).toEqual([choc])
  })

  it('a sensory-only write still happens when there are no commodity cards, without stamping a score_resolution', async () => {
    m.tables.cupping_scores = { rows: [], one: null }
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: null, profileConfigured: false })
    await POST(req({ sensory_resolution: { notes: [choc], match: null } }))
    const w = sensoryWrites()[0]
    expect(w).toBeTruthy()
    expect('score_resolution' in w.values).toBe(false)
  })

  it('column not migrated yet (PGRST204): retries once without sensory_resolution and finalizes', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: null, profileConfigured: false })
    m.updateErrors = {
      quality_assessments: [{ code: 'PGRST204', message: "Could not find the 'sensory_resolution' column of 'quality_assessments' in the schema cache" }],
    }
    const res = await POST(req({ sensory_resolution: { notes: [choc], match: null } }))
    expect(res.status).toBe(200)
    const resolutionWrites = m.writes.filter((w) => w.table === 'quality_assessments' && 'score_resolution' in w.values)
    expect(resolutionWrites).toHaveLength(2)
    expect('sensory_resolution' in resolutionWrites[1].values).toBe(false)
    expect(m.applyDecision).toHaveBeenCalled()
  })

  it('column not migrated yet (42703): same retry', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: null, profileConfigured: false })
    m.updateErrors = { quality_assessments: [{ code: '42703', message: 'column "sensory_resolution" does not exist' }] }
    const res = await POST(req({ sensory_resolution: { notes: [choc], match: null } }))
    expect(res.status).toBe(200)
  })

  it('another write error still refuses the finalize', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: null, profileConfigured: false })
    m.updateErrors = { quality_assessments: [{ code: '23505', message: 'boom' }] }
    const res = await POST(req({ sensory_resolution: { notes: [choc], match: null } }))
    expect(res.status).toBe(500)
  })

  it('sensory never reaches the compliance gate', async () => {
    m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: dbProfile, profileConfigured: true })
    await POST(req({ sensory_resolution: { notes: [choc], match: false } }))
    expect(m.evaluate).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(m.evaluate.mock.calls[0])).not.toContain('sensory')
    expect(JSON.stringify(m.applyDecision.mock.calls[0])).not.toContain('sensory')
  })

  describe('a frozen result the lot no longer asks for', () => {
    const stored = { version: 1, notes: [choc], profile: null, resolved_by: 'v', resolved_at: '2026-11-14T00:00:00Z', source: 'validation' }
    const withStored = () => {
      m.tables.quality_assessments.one = { ...m.tables.quality_assessments.one, sensory_resolution: stored }
    }

    it('settings off, nothing sent, a stored value: clears it in the pre-gate write', async () => {
      withStored()
      const res = await POST(req())
      expect(res.status).toBe(200)
      expect(m.loadConfig).toHaveBeenCalledWith(expect.anything(), 's1')
      const w = sensoryWrites()
      expect(w).toHaveLength(1)
      expect(w[0].values.sensory_resolution).toBeNull()
      expect('score_resolution' in w[0].values).toBe(true)
    })

    it('settings off and a field sent, a stored value: cleared, not rewritten', async () => {
      withStored()
      await POST(req({ sensory_resolution: { notes: [choc], match: true } }))
      expect(sensoryWrites()[0].values.sensory_resolution).toBeNull()
    })

    it('a clear with no commodity cards does not stamp a score_resolution', async () => {
      withStored()
      m.tables.cupping_scores = { rows: [], one: null }
      await POST(req())
      const w = sensoryWrites()
      expect(w).toHaveLength(1)
      expect(w[0].values).toEqual({ sensory_resolution: null })
    })

    it('settings off, no stored value: no sensory_resolution key is written', async () => {
      await POST(req({ sensory_resolution: { notes: [choc], match: true } }))
      expect(sensoryWrites()).toHaveLength(0)
    })

    it('settings still on and no field sent: the stored value is left alone', async () => {
      withStored()
      m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: null, profileConfigured: false })
      await POST(req())
      expect(sensoryWrites()).toHaveLength(0)
    })

    it('the stored-value read hits a missing column: nothing to clear, the finalize succeeds', async () => {
      withStored()
      m.readError = (table, columns) =>
        table === 'quality_assessments' && columns.includes('sensory_resolution')
          ? { code: '42703', message: 'column quality_assessments.sensory_resolution does not exist' }
          : null
      const res = await POST(req())
      expect(res.status).toBe(200)
      expect(m.loadConfig).not.toHaveBeenCalled()
      expect(sensoryWrites()).toHaveLength(0)
      expect(m.applyDecision).toHaveBeenCalled()
    })

    it('a profile is set but its row could not be read, nothing sent: the stored value is left alone', async () => {
      withStored()
      m.loadConfig.mockResolvedValue({ notesEnabled: false, profile: null, profileConfigured: true })
      const res = await POST(req())
      expect(res.status).toBe(200)
      expect(sensoryWrites()).toHaveLength(0)
    })

    it('a profile is set but its row could not be read, a field sent: 503 before any write', async () => {
      withStored()
      m.loadConfig.mockResolvedValue({ notesEnabled: true, profile: null, profileConfigured: true })
      const res = await POST(req({ sensory_resolution: { notes: [choc], match: true } }))
      expect(res.status).toBe(503)
      expect((await res.json()).error).toBe('Could not load the regional profile. Try again.')
      expect(m.writes).toHaveLength(0)
      expect(m.pinGroupSpec).not.toHaveBeenCalled()
      expect(m.applyDecision).not.toHaveBeenCalled()
    })

    it('the config loader throws: neither freeze nor clear, the finalize otherwise unchanged', async () => {
      withStored()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      m.loadConfig.mockRejectedValue(new Error('spec read failed'))
      const res = await POST(req({ sensory_resolution: { notes: [choc], match: true } }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ success: true, decision: 'approved' })
      expect(sensoryWrites()).toHaveLength(0)
      expect(preGate()).toBeTruthy()
      expect(m.applyDecision.mock.calls[0][1]).toMatchObject({ decision: 'approved' })
      expect(m.mintCertificates).toHaveBeenCalled()
      warn.mockRestore()
    })
  })
})
