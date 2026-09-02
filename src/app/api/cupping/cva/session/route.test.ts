import { describe, it, expect, vi } from 'vitest'

/**
 * The journey used to mint a session per cupper, which is why a specialty lot's
 * cuppers could never be compared and why its two-cupper minimum collapsed to
 * one. It now binds the roster written at assignment.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
// Delegate per call: the route builds its service-role client at import time,
// before a test seeds the fake. Same pattern as samples/[id]/route.test.ts.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))

import { POST } from './route'

function fakeDb({ me, sessions }: { me: string; sessions: any[] }) {
  const inserted: any[] = []
  const client: any = {
    inserted,
    auth: { getUser: async () => ({ data: { user: { id: me } }, error: null }) },
    from(table: string) {
      let pending: any = null
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        overlaps: () => chain,
        order: () => chain,
        limit: async () => ({ data: table === 'cupping_sessions' ? sessions : [], error: null }),
        insert(values: any) { pending = values; return chain },
        single: async () => {
          if (pending) {
            const row = { id: 'new-session', ...pending }
            inserted.push(row)
            return { data: row, error: null }
          }
          return { data: { laboratory_id: 'lab-1' }, error: null }
        },
      }
      return chain
    },
  }
  return client
}

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/cupping/cva/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as any)

const roster = {
  id: 'roster-1', session_type: 'cva', status: 'setup',
  sample_ids: ['lot-1', 'lot-2'], cupper_ids: ['me', 'other'],
}

describe('POST /api/cupping/cva/session', () => {
  it('binds the roster that holds this lot', async () => {
    state.db = fakeDb({ me: 'me', sessions: [roster] })
    const body = await (await post({ sample_ids: ['lot-1'] })).json()
    expect(body.session_id).toBe('roster-1')
    expect(state.db.inserted).toHaveLength(0)
  })

  it('binds the roster even though it holds more lots than were asked for', async () => {
    state.db = fakeDb({ me: 'me', sessions: [roster] })
    const body = await (await post({ sample_ids: ['lot-2'] })).json()
    expect(body.session_id).toBe('roster-1')
  })

  it('does not put a cupper on a roster they were never assigned to', async () => {
    state.db = fakeDb({ me: 'stranger', sessions: [roster] })
    const body = await (await post({ sample_ids: ['lot-1'] })).json()
    expect(body.session_id).toBe('new-session')
  })

  it('mints a session when the lot has no roster', async () => {
    state.db = fakeDb({ me: 'me', sessions: [] })
    const body = await (await post({ sample_id: 'lot-9' })).json()
    expect(body.session_id).toBe('new-session')
    expect(state.db.inserted[0]).toMatchObject({ session_type: 'cva', status: 'setup', cupper_ids: ['me'] })
  })
})
