import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * Every client quality now reads its own private copy, so a base template's
 * Clients list also shows the clients whose copy was made from it, marked as
 * copies.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET } from './route'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/quality-templates/[id]/clients', () => {
  it('lists direct users and the clients of copies made from the template', async () => {
    state.db = seededDb({
      quality_templates: [
        { id: 'tpl-base', template_parent_id: null },
        { id: 'tpl-copy-a', template_parent_id: 'tpl-base' },
        { id: 'tpl-copy-b', template_parent_id: 'tpl-base' },
        { id: 'tpl-unrelated', template_parent_id: 'tpl-other' },
      ],
      client_qualities: [
        { id: 'cq-1', client_id: 'co-direct', template_id: 'tpl-base', clients: { id: 'co-direct', name: 'Direct' } },
        { id: 'cq-2', client_id: 'co-a', template_id: 'tpl-copy-a', clients: { id: 'co-a', name: 'A' } },
        { id: 'cq-3', client_id: 'co-a', template_id: 'tpl-copy-b', clients: { id: 'co-a', name: 'A' } },
        { id: 'cq-4', client_id: 'co-z', template_id: 'tpl-unrelated', clients: { id: 'co-z', name: 'Z' } },
      ],
    })
    const res = await GET({} as any, ctx('tpl-base'))
    expect(res.status).toBe(200)
    expect((await res.json()).clients).toEqual([
      { id: 'co-direct', name: 'Direct', copy: false },
      { id: 'co-a', name: 'A', copy: true },
    ])
  })

  it('returns no copies for a template nothing was copied from', async () => {
    state.db = seededDb({
      quality_templates: [{ id: 'tpl-copy-a', template_parent_id: 'tpl-base' }],
      client_qualities: [{ id: 'cq-2', client_id: 'co-a', template_id: 'tpl-copy-a', clients: { id: 'co-a', name: 'A' } }],
    })
    const res = await GET({} as any, ctx('tpl-copy-a'))
    expect((await res.json()).clients).toEqual([{ id: 'co-a', name: 'A', copy: false }])
  })
})
