import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/** A new client quality starts its version history with "First version". */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body }) as any

describe('POST /api/client-qualities', () => {
  it('records the first version of the new client quality', async () => {
    state.db = seededDb({ client_qualities: [], quality_templates: [{ id: 'tpl-1', description: 'FC' }] })
    const res = await POST(req({ client_id: 'co-1', template_id: 'tpl-1' }))
    expect(res.status).toBe(201)
    const { client_quality } = await res.json()
    expect(state.db.rpcCalls).toEqual([
      {
        fn: 'record_client_quality_version',
        args: { p_client_quality_id: client_quality.id, p_source: 'wolthers', p_user: 'user-1', p_note: 'First version' },
      },
    ])
  })

  it('records nothing when the insert fails', async () => {
    state.db = seededDb(
      { client_qualities: [], quality_templates: [{ id: 'tpl-1', description: 'FC' }] },
      { fail: (t, op) => (t === 'client_qualities' && op === 'insert' ? { message: 'boom' } : null) },
    )
    const res = await POST(req({ client_id: 'co-1', template_id: 'tpl-1' }))
    expect(res.status).toBe(500)
    expect(state.db.rpcCalls).toEqual([])
  })
})
