import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/** The client page's spec PATCH records a version when the spec itself changes. */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { PATCH } from './route'

function seed() {
  return {
    client_qualities: [{ id: 'cq-1', client_id: 'co-1', template_id: 'tpl-1', origin: null, custom_parameters: { a: 1 } }],
    quality_templates: [{ id: 'tpl-1' }, { id: 'tpl-2' }],
    samples: [],
  }
}

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = { params: Promise.resolve({ id: 'co-1', specId: 'cq-1' }) }

describe('PATCH /api/clients/[id]/quality-specifications/[specId]', () => {
  it('records a version when the custom parameters change', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ custom_parameters: { a: 2 } }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls.map((c: any) => c.args.p_client_quality_id)).toEqual(['cq-1'])
  })

  it('records a version when the template changes', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ template_id: 'tpl-2' }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toHaveLength(1)
  })

  it('records nothing for an origin-only edit or unchanged parameters', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ origin: 'Brazil', custom_parameters: { a: 1 } }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })
})
