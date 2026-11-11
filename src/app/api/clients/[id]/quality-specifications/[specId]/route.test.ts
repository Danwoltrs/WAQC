import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * The client page's spec PATCH records a version whenever it names a spec
 * field (the RPC dedupes), and a template change points the spec at a fresh
 * private copy of the chosen template.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { PATCH } from './route'

function seed() {
  return {
    client_qualities: [{ id: 'cq-1', client_id: 'co-1', template_id: 'tpl-1', origin: null, custom_parameters: { a: 1 } }],
    quality_templates: [
      { id: 'tpl-1', is_client_variant: true, template_parent_id: 'tpl-base', version: 2, parameters: {} },
      { id: 'tpl-2', is_client_variant: false, is_global: true, version: 4, parameters: { moisture_max: 12 } },
    ],
    template_versions: [],
    samples: [],
  }
}

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = { params: Promise.resolve({ id: 'co-1', specId: 'cq-1' }) }

describe('PATCH /api/clients/[id]/quality-specifications/[specId]', () => {
  it('records a version when the custom parameters are saved, changed or not', async () => {
    state.db = seededDb(seed())
    expect((await PATCH(req({ custom_parameters: { a: 2 } }), ctx)).status).toBe(200)
    expect((await PATCH(req({ custom_parameters: { a: 2 } }), ctx)).status).toBe(200)
    expect(state.db.rpcCalls.map((c: any) => c.args.p_client_quality_id)).toEqual(['cq-1', 'cq-1'])
  })

  it('points a template change at a fresh private copy and records a version', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ template_id: 'tpl-2' }), ctx)
    expect(res.status).toBe(200)
    const stored = state.db.rows.client_qualities[0].template_id
    expect(stored).not.toBe('tpl-2')
    expect(state.db.rows.quality_templates.find((t: any) => t.id === stored)).toMatchObject({
      is_client_variant: true, template_parent_id: 'tpl-2', version: 1,
    })
    expect(state.db.rpcCalls).toHaveLength(1)
  })

  it('records nothing for an origin-only edit', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ origin: 'Brazil' }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })
})
