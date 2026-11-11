import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/** Restoring a client copy to an older version is a spec change: it is recorded. */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { POST } from './route'

function seed() {
  return {
    quality_templates: [
      { id: 'tpl-copy', is_client_variant: true, version: 4, parameters: { moisture_max: 12 } },
      { id: 'tpl-base', is_client_variant: false, version: 4, parameters: { moisture_max: 12 } },
    ],
    template_versions: [
      { id: 'tv-copy-3', template_id: 'tpl-copy', version_number: 3, parameters: { moisture_max: 12.5 } },
      { id: 'tv-base-3', template_id: 'tpl-base', version_number: 3, parameters: { moisture_max: 12.5 } },
    ],
    client_qualities: [{ id: 'cq-a', template_id: 'tpl-copy' }],
  }
}

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/quality-templates/[id]/restore', () => {
  it('records a version named after the restored version on a client copy', async () => {
    state.db = seededDb(seed())
    const res = await POST(req({ version_id: 'tv-copy-3' }), ctx('tpl-copy'))
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([
      {
        fn: 'record_client_quality_version',
        args: { p_client_quality_id: 'cq-a', p_source: 'wolthers', p_user: 'user-1', p_note: 'Restored version 3' },
      },
    ])
  })

  it('records nothing on a base template', async () => {
    state.db = seededDb(seed())
    const res = await POST(req({ version_id: 'tv-base-3' }), ctx('tpl-base'))
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })
})
