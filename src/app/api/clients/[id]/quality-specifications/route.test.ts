import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/** Assigning a spec on the client page starts its version history. */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = { params: Promise.resolve({ id: 'co-1' }) }

describe('POST /api/clients/[id]/quality-specifications', () => {
  it('records the first version of the new specification', async () => {
    state.db = seededDb({ client_qualities: [], quality_templates: [{ id: 'tpl-1' }] })
    const res = await POST(req({ template_id: 'tpl-1', custom_name: 'FC' }), ctx)
    expect(res.status).toBe(201)
    const { specification } = await res.json()
    expect(state.db.rpcCalls).toEqual([
      {
        fn: 'record_client_quality_version',
        args: { p_client_quality_id: specification.id, p_source: 'wolthers', p_user: 'user-1', p_note: 'First version' },
      },
    ])
  })
})
