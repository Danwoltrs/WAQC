import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * Assigning a spec on the client page stores it on a fresh private copy of
 * the chosen template and starts its version history.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = { params: Promise.resolve({ id: 'co-1' }) }
const seed = () => ({
  client_qualities: [] as any[],
  quality_templates: [{ id: 'tpl-1', is_client_variant: false, is_global: true, version: 3, parameters: {} }],
  template_versions: [] as any[],
})

describe('POST /api/clients/[id]/quality-specifications', () => {
  it('stores the spec on a private copy and records its first version', async () => {
    state.db = seededDb(seed())
    const res = await POST(req({ template_id: 'tpl-1', custom_name: 'FC' }), ctx)
    expect(res.status).toBe(201)
    const { specification } = await res.json()
    expect(specification.template_id).not.toBe('tpl-1')
    expect(state.db.rows.quality_templates.find((t: any) => t.id === specification.template_id)).toMatchObject({
      is_client_variant: true, template_parent_id: 'tpl-1', version: 1,
    })
    expect(state.db.rpcCalls).toEqual([
      {
        fn: 'record_client_quality_version',
        args: { p_client_quality_id: specification.id, p_source: 'wolthers', p_user: 'user-1', p_note: 'First version' },
      },
    ])
  })

  it('refuses a template the client already holds a copy of, for the same origin', async () => {
    const rows = seed()
    rows.quality_templates.push({ id: 'tpl-copy', is_client_variant: true, template_parent_id: 'tpl-1', version: 1, parameters: {} } as any)
    rows.client_qualities.push({ id: 'cq-0', client_id: 'co-1', template_id: 'tpl-copy', origin: null, template: { template_parent_id: 'tpl-1' } })
    state.db = seededDb(rows)
    const res = await POST(req({ template_id: 'tpl-1' }), ctx)
    expect(res.status).toBe(409)
    expect(state.db.writes).toEqual([])
  })
})
