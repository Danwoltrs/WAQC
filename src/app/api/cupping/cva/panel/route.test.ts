import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The blind rule is the point of this route: a cupper who has not finished
 * their own eight sections must not learn what anybody else scored. It is
 * enforced here, server-side, because a component-level gate is not a gate.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
// The route builds its admin client (service role) at import time, before a
// test seeds the fake, so delegate per call — capturing state.db here would
// freeze it at null and every query would throw. Same pattern as
// src/app/api/samples/[id]/route.test.ts.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))
vi.mock('@/lib/sample-group', () => ({ resolveLabSourceId: async (_db: any, id: string) => id }))
const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)

import { GET } from './route'

const complete = {
  sections: {
    fragrance: { impression: 7 }, aroma: { impression: 7 }, flavor: { impression: 7 },
    aftertaste: { impression: 7 }, acidity: { impression: 7 }, sweetness: { impression: 7 },
    mouthfeel: { impression: 7 }, overall: { impression: 7 },
  },
  cups: { non_uniform: [], defective: [] },
}
const partial = { sections: { fragrance: { impression: 7 } }, cups: { non_uniform: [], defective: [] } }

function fakeDb({ me, rows, session, profiles, sample, liveQuality }: any) {
  const client: any = {
    read: [] as string[],
    auth: { getUser: async () => ({ data: { user: { id: me } }, error: null }) },
    from(table: string) {
      client.read.push(table)
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        single: async () => ({
          data: table === 'cupping_sessions' ? session
            : table === 'samples' ? sample ?? null
            : table === 'client_qualities' ? liveQuality ?? null
            : null,
          error: null,
        }),
        then: undefined,
      }
      if (table === 'cupping_scores') return Object.assign(chain, { order: async () => ({ data: rows, error: null }) })
      if (table === 'profiles') return Object.assign(chain, { in: async () => ({ data: profiles, error: null }) })
      return chain
    },
  }
  return client
}

const get = () =>
  GET(new Request('http://localhost/api/cupping/cva/panel?session_id=sess-1&sample_id=lot-1') as any)

const session = {
  id: 'sess-1', session_type: 'cva', status: 'setup',
  sample_ids: ['lot-1'], cupper_ids: ['me', 'other'], guest_cuppers: [{ id: 'g1', name: 'Ana Guest' }],
  master_cupper_id: null,
}
const profiles = [
  { id: 'me', full_name: 'Me Myself', is_master_cupper: false },
  { id: 'other', full_name: 'A. Silva', is_master_cupper: true },
]

describe('GET /api/cupping/cva/panel', () => {
  beforeEach(() => {
    spec.resolveSampleSpecs.mockReset()
    spec.resolveSampleSpec.mockReset().mockResolvedValue(null)
  })

  it('withholds every other cupper while my own assessment is incomplete', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [
        { cupper_id: 'me', cva_score: 70, scores: partial },
        { cupper_id: 'other', cva_score: 84, scores: complete },
      ],
    })
    const body = await (await get()).json()
    expect(body.blind).toBe(true)
    expect(body.cuppers.map((c: any) => c.cupper_id)).toEqual(['me'])
    expect(body.mean).toBeNull()
  })

  it('reveals the whole panel once my eight sections are done', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [
        { cupper_id: 'me', cva_score: 86.25, scores: complete },
        { cupper_id: 'other', cva_score: 84, scores: complete },
      ],
    })
    const body = await (await get()).json()
    expect(body.blind).toBe(false)
    expect(body.cuppers.map((c: any) => c.cupper_id).sort()).toEqual(['me', 'other'])
    expect(body.spread).toBe(2.25)
  })

  it('marks the assigned master cupper as authoritative when the session names none', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [
        { cupper_id: 'me', cva_score: 86.25, scores: complete },
        { cupper_id: 'other', cva_score: 84, scores: complete },
      ],
    })
    const body = await (await get()).json()
    expect(body.authoritative_cupper_id).toBe('other')
    expect(body.cuppers.find((c: any) => c.cupper_id === 'other').is_master).toBe(true)
  })

  it('lists guests so the paper cards get reconciled, and never scores them', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [{ cupper_id: 'me', cva_score: 86.25, scores: complete }],
    })
    const body = await (await get()).json()
    expect(body.guests).toEqual([{ id: 'g1', name: 'Ana Guest' }])
  })

  it('refuses a sample the session does not hold', async () => {
    state.db = fakeDb({
      me: 'me', session: { ...session, sample_ids: ['someone-else'] }, profiles,
      rows: [{ cupper_id: 'me', cva_score: 86.25, scores: complete }],
    })
    expect((await get()).status).toBe(400)
  })

  // The spread threshold travels with the quality, at the lot's spec VERSION
  // (pinned, else in force on its contract date), never the live template.
  describe('threshold', () => {
    const revealed = {
      me: 'me', session, profiles,
      rows: [
        { cupper_id: 'me', cva_score: 86.25, scores: complete },
        { cupper_id: 'other', cva_score: 84, scores: complete },
      ],
      sample: { quality_spec_id: 'cq-1' },
      liveQuality: { template: { cva_score_spread_max: 9 } },
    }
    const resolved = (spread: any) => ({
      id: 'cq-1', custom_name: 'Specialty', quality_code: null, template_id: 'tpl-1',
      cups_per_sample: 5, discrepancy_threshold: null, custom_parameters: {},
      template: { id: 'tpl-1', name: 'CVA', name_en: null, description: null, parameters: {}, methodology: 'cva', cva_score_spread_max: spread },
      version: { id: 'ver-1', versionNo: 1, effectiveFrom: '2026-01-01', pinned: true },
    })

    it("comes from the lot's spec version, never the live template", async () => {
      spec.resolveSampleSpec.mockResolvedValue(resolved(1.5))
      state.db = fakeDb(revealed)
      const body = await (await get()).json()
      expect(body.threshold).toBe(1.5)
      expect(body.flagged).toBe(true)
      expect(state.db.read).not.toContain('client_qualities')
      const [id, opts] = spec.resolveSampleSpec.mock.calls[0]
      expect(id).toBe('lot-1')
      expect(opts?.pin).toBeFalsy()
    })

    it('falls back to the default when the version sets none, or the lot has no quality', async () => {
      spec.resolveSampleSpec.mockResolvedValue(resolved(null))
      state.db = fakeDb(revealed)
      expect((await (await get()).json()).threshold).toBe(3)
      spec.resolveSampleSpec.mockResolvedValue(null)
      state.db = fakeDb(revealed)
      expect((await (await get()).json()).threshold).toBe(3)
    })

    it('answers 500 when the spec read fails', async () => {
      spec.resolveSampleSpec.mockRejectedValue(new Error('boom'))
      state.db = fakeDb(revealed)
      expect((await get()).status).toBe(500)
    })
  })
})
