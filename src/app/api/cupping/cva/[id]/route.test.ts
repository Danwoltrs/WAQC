import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * GET /api/cupping/cva/[id] hands the specialty journey each lot's pass mark
 * (cva_min_score) and whether descriptors are required. Both travel with the
 * quality at the lot's spec VERSION (pinned, else in force on its contract
 * date), never the live template, which a later spec change would rewrite.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
// The route builds its service-role client at import time, before a test seeds
// the fake, so delegate per call.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))
const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)

import { GET } from './route'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'

/** Every chain resolves to the table's rows; single() to the first. */
function fakeDb(tables: Record<string, any[]>) {
  const read: string[] = []
  return {
    read,
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
    from(table: string) {
      read.push(table)
      const rows = tables[table] ?? []
      const chain: any = {
        then(resolve: (v: any) => void) { resolve({ data: rows, error: null }) },
        single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'none' } }),
      }
      for (const op of ['select', 'eq', 'in', 'or', 'contains', 'order', 'limit']) chain[op] = () => chain
      return chain
    },
  }
}

const get = () =>
  GET(new NextRequest(`http://localhost/api/cupping/cva/${SESSION_ID}`), { params: Promise.resolve({ id: SESSION_ID }) })

const resolved = (template: Record<string, any> | null) => ({
  id: 'cq-1', custom_name: 'Specialty', quality_code: null, template_id: 'tpl-1',
  cups_per_sample: 5, discrepancy_threshold: null, custom_parameters: {},
  template: template && { id: 'tpl-1', name: 'CVA', name_en: null, description: null, parameters: {}, methodology: 'cva', ...template },
  version: { id: 'ver-1', versionNo: 1, effectiveFrom: '2026-01-01', pinned: true },
})

const tables = () => ({
  cupping_sessions: [{ id: SESSION_ID, sample_ids: ['lot-1', 'lot-2', 'lot-3'], cupper_ids: ['me'], session_type: 'cva', status: 'active' }],
  profiles: [{ id: 'me', is_master_cupper: true, qc_role: 'cupper' }],
  samples: [
    { id: 'lot-1', exporter_sample_number: 'EXP-1', quality_spec_id: 'cq-1', status: 'pending', lab_source_sample_id: null },
    { id: 'lot-2', exporter_sample_number: 'EXP-2', quality_spec_id: 'cq-1', status: 'pending', lab_source_sample_id: null },
    { id: 'lot-3', exporter_sample_number: 'EXP-3', quality_spec_id: null, status: 'pending', lab_source_sample_id: null },
  ],
  quality_assessments: [],
  cupping_scores: [],
  // The live rows say 70 and no descriptors: the version must win.
  client_qualities: [{ id: 'cq-1', template_id: 'tpl-1' }],
  quality_templates: [{ id: 'tpl-1', cva_min_score: 70, requires_descriptors: false }],
})

describe('GET /api/cupping/cva/[id]: pass marks', () => {
  beforeEach(() => {
    spec.resolveSampleSpec.mockReset()
    spec.resolveSampleSpecs.mockReset().mockResolvedValue(new Map([
      ['lot-1', resolved({ cva_min_score: 84, requires_descriptors: true })],
      // A sibling lot on the same quality pinned to an older version.
      ['lot-2', resolved({ cva_min_score: '80', requires_descriptors: false })],
    ]))
  })

  it("reads each lot's pass mark and descriptor rule from its spec version", async () => {
    state.db = fakeDb(tables())
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    const byId = new Map(body.samples.map((s: any) => [s.id, s]))
    expect(byId.get('lot-1')).toMatchObject({ min_score: 84, requires_descriptors: true })
    expect(byId.get('lot-2')).toMatchObject({ min_score: 80, requires_descriptors: false })
    expect(byId.get('lot-3')).toMatchObject({ min_score: null, requires_descriptors: false })
    expect(state.db.read).not.toContain('client_qualities')
    expect(state.db.read).not.toContain('quality_templates')
  })

  it('resolves the whole session in one call, without pinning', async () => {
    state.db = fakeDb(tables())
    await get()
    expect(spec.resolveSampleSpecs).toHaveBeenCalledTimes(1)
    const [ids, opts] = spec.resolveSampleSpecs.mock.calls[0]
    expect([...ids].sort()).toEqual(['lot-1', 'lot-2', 'lot-3'])
    expect(opts?.pin).toBeFalsy()
  })

  it('a quality without a template has no pass mark, as before', async () => {
    spec.resolveSampleSpecs.mockResolvedValue(new Map([['lot-1', resolved(null)]]))
    state.db = fakeDb(tables())
    const body = await (await get()).json()
    expect(body.samples.find((s: any) => s.id === 'lot-1')).toMatchObject({ min_score: null, requires_descriptors: false })
  })

  it('answers 500 when the spec read fails', async () => {
    spec.resolveSampleSpecs.mockRejectedValue(new Error('boom'))
    state.db = fakeDb(tables())
    expect((await get()).status).toBe(500)
  })

  it('never ships the lab number', async () => {
    const t = tables()
    t.samples = t.samples.map((s) => ({ ...s, tracking_number: 'SAN-00001/26' }))
    state.db = fakeDb(t)
    expect(JSON.stringify(await (await get()).json())).not.toContain('SAN-')
  })
})
