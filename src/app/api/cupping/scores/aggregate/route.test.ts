import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The validation screen's final scores are rounded to each attribute's
 * increment in the quality spec. That increment must come from the lot's spec
 * VERSION (pinned, else in force on its contract date), never the live client
 * quality, which a later spec change would rewrite.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
// The route builds its service-role client at import time, before a test seeds
// the fake, so delegate per call.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))
vi.mock('@/lib/sample-group', () => ({ resolveLabSourceId: async (_db: any, id: string) => id }))
const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)

import { GET } from './route'

/** Every chain resolves to the table's rows; single()/maybeSingle() to the first. */
function fakeDb(
  tables: Record<string, any[]>,
  opts: { selectError?: (table: string, columns: string) => any } = {},
) {
  const read: string[] = []
  const selects: Array<{ table: string; columns: string }> = []
  return {
    read,
    selects,
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
    from(table: string) {
      read.push(table)
      const rows = tables[table] ?? []
      let error: any = null
      const chain: any = {
        then(resolve: (v: any) => void) { resolve(error ? { data: null, error } : { data: rows, error: null }) },
        single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'none' } }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      }
      for (const op of ['eq', 'neq', 'in', 'is', 'or', 'contains', 'order', 'limit']) {
        chain[op] = () => chain
      }
      chain.select = (columns = '*') => {
        selects.push({ table, columns })
        error = opts.selectError?.(table, columns) ?? null
        return chain
      }
      return chain
    },
  }
}

const get = () => GET(new NextRequest('http://localhost/api/cupping/scores/aggregate?sample_id=lot-1'))

const versionSpec = (params: any, templateParams: any = { cupping_attributes: [] }) => ({
  id: 'cq-1', custom_name: 'Fine Cup', quality_code: 'FC', template_id: 'tpl-1',
  cups_per_sample: 5, discrepancy_threshold: null,
  custom_parameters: params,
  template: { id: 'tpl-1', name: 'T', name_en: null, description: null, parameters: templateParams },
  version: { id: 'ver-1', versionNo: 1, effectiveFrom: '2026-01-01', pinned: true },
})

const tables = () => ({
  profiles: [{ id: 'me', is_master_cupper: false, is_global_admin: true, qc_role: 'lab_admin' }],
  quality_assessments: [],
  cupping_sessions: [{ id: 'sess-1', cupper_ids: ['a', 'b'], master_cupper_id: null }],
  samples: [{ id: 'lot-1', quality_spec_id: 'cq-1' }],
  // The live row says 0.25; the version says 1. The version must win.
  client_qualities: [{
    custom_parameters: { cupping_attributes: [{ attribute: 'Body', scale: { type: 'numeric', increment: 0.25 } }] },
    template: null,
  }],
  cupping_scores: [
    { id: 's1', cupper_id: 'a', scores: { Body: 8.2 }, defects: {}, created_at: '2026-01-01', sample: { id: 'lot-1' } },
    { id: 's2', cupper_id: 'b', scores: { Body: 8.6 }, defects: {}, created_at: '2026-01-01', sample: { id: 'lot-1' } },
  ],
})

const body1 = { cupping_attributes: [{ attribute: 'Body', scale: { type: 'numeric', increment: 1 } }] }

describe('GET /api/cupping/scores/aggregate: increments', () => {
  beforeEach(() => {
    spec.resolveSampleSpec.mockReset()
    spec.resolveSampleSpecs.mockReset().mockResolvedValue(new Map())
  })

  it("rounds by the increment in the lot's spec version, never the live client quality", async () => {
    spec.resolveSampleSpecs.mockResolvedValue(new Map([['lot-1', versionSpec(body1)]]))
    state.db = fakeDb(tables())
    const json = await (await get()).json()
    expect(json.aggregated.attributes.Body.increment).toBe(1)
    // mean 8.4 rounded to the nearest 1 is 8 (0.25 would give 8.5)
    expect(json.aggregated.attributes.Body.finalScore).toBe(8)
    expect(state.db.read).not.toContain('client_qualities')
  })

  it('resolves the lab unit once, without pinning', async () => {
    state.db = fakeDb(tables())
    await get()
    expect(spec.resolveSampleSpecs).toHaveBeenCalledTimes(1)
    const [ids, opts] = spec.resolveSampleSpecs.mock.calls[0]
    expect(ids).toEqual(['lot-1'])
    expect(opts?.pin).toBeFalsy()
  })

  // R19: a NULL custom_parameters stays null, so the template increments apply as before.
  it('a quality whose custom_parameters is null rounds by the template increments, as before', async () => {
    spec.resolveSampleSpecs.mockResolvedValue(new Map([['lot-1', versionSpec(null, body1)]]))
    state.db = fakeDb(tables())
    const json = await (await get()).json()
    expect(json.aggregated.attributes.Body.increment).toBe(1)
    expect(json.aggregated.attributes.Body.finalScore).toBe(8)
  })

  it('keeps the whole-object rule: an empty custom_parameters object (the column default) still wins over the template', async () => {
    spec.resolveSampleSpecs.mockResolvedValue(new Map([['lot-1', versionSpec({}, body1)]]))
    state.db = fakeDb(tables())
    const json = await (await get()).json()
    expect(json.aggregated.attributes.Body.increment).toBe(0.25)
  })

  it('keeps the whole-object fallback: custom_parameters present wins over the template, even without attributes', async () => {
    spec.resolveSampleSpecs.mockResolvedValue(new Map([['lot-1', versionSpec({ moisture: { max: 12 } }, body1)]]))
    state.db = fakeDb(tables())
    const json = await (await get()).json()
    expect(json.aggregated.attributes.Body.increment).toBe(0.25)
  })

  it('a lot without a quality rounds by the default 0.25', async () => {
    state.db = fakeDb(tables())
    const json = await (await get()).json()
    expect(json.aggregated.attributes.Body.increment).toBe(0.25)
    expect(json.aggregated.attributes.Body.finalScore).toBe(8.5)
  })

  it('answers 500 when the spec read fails, rather than rounding by the wrong increment', async () => {
    spec.resolveSampleSpecs.mockRejectedValue(new Error('boom'))
    state.db = fakeDb(tables())
    expect((await get()).status).toBe(500)
  })
})

describe('GET /api/cupping/scores/aggregate: sensory', () => {
  const choc = ['Nutty/Cocoa', 'Cocoa', 'Chocolate']

  beforeEach(() => {
    spec.resolveSampleSpec.mockReset()
    spec.resolveSampleSpecs.mockReset().mockResolvedValue(new Map())
  })

  const withSensory = () => {
    const t = tables()
    t.cupping_scores = [
      { ...t.cupping_scores[0], sensory: { picks: [choc, ['Not', 'A', 'Path']], profile_id: 'p1', profile_match: true } },
      { ...t.cupping_scores[1], sensory: null },
    ] as any
    return t
  }

  it('selects sensory and gives every row its parsed sensory (null when absent)', async () => {
    state.db = fakeDb(withSensory())
    const json = await (await get()).json()
    const sel = state.db.selects.find((x: any) => x.table === 'cupping_scores')
    expect(sel.columns).toMatch(/\bsensory\b/)
    expect(json.individual_scores[0].sensory).toEqual({ picks: [choc], profile_id: 'p1', profile_match: true })
    expect(json.individual_scores[1].sensory).toBeNull()
  })

  it('anonymised rows keep score_id and carry sensory, with cupper_id hidden', async () => {
    const t = withSensory()
    t.profiles = [{ id: 'me', is_master_cupper: false, is_global_admin: false, qc_role: 'cupper' }] as any
    state.db = fakeDb(t)
    const json = await (await get()).json()
    expect(json.can_see_all_scores).toBe(false)
    expect(json.individual_scores[0]).toMatchObject({ score_id: 's1', cupper_id: null, cupper_name: 'Cupper 1' })
    expect(json.individual_scores[0].sensory).toEqual({ picks: [choc], profile_id: 'p1', profile_match: true })
  })

  it("returns the lab unit's stored sensory_resolution", async () => {
    const t = tables()
    t.quality_assessments = [{
      sensory_resolution: { version: 1, notes: [choc], profile: null, resolved_by: 'v', resolved_at: '2026-11-14T00:00:00Z', source: 'validation' },
    }] as any
    state.db = fakeDb(t)
    const json = await (await get()).json()
    expect(json.sensory_resolution).toMatchObject({ version: 1, notes: [choc], source: 'validation' })
  })

  it('sensory_resolution is null when the lot has none', async () => {
    state.db = fakeDb(tables())
    const json = await (await get()).json()
    expect(json.sensory_resolution).toBeNull()
  })

  it('column not migrated yet: retries the scores read without sensory', async () => {
    state.db = fakeDb(tables(), {
      selectError: (table, columns) =>
        table === 'cupping_scores' && /\bsensory\b/.test(columns)
          ? { code: '42703', message: 'column cupping_scores.sensory does not exist' }
          : null,
    })
    const res = await get()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.individual_scores).toHaveLength(2)
    expect(json.individual_scores[0].sensory).toBeNull()
    expect(state.db.selects.filter((x: any) => x.table === 'cupping_scores')).toHaveLength(2)
  })
})
