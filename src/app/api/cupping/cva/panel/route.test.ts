import { describe, it, expect, vi } from 'vitest'

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

function fakeDb({ me, rows, session, profiles }: any) {
  const client: any = {
    auth: { getUser: async () => ({ data: { user: { id: me } }, error: null }) },
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        single: async () => ({
          data: table === 'cupping_sessions' ? session : null,
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
})
