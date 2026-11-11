import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * A new client quality reads a fresh private copy of the chosen template and
 * starts its version history with "First version". When that version cannot
 * be recorded, nothing of the create is left behind.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body }) as any
const seed = () => ({
  client_qualities: [] as any[],
  quality_templates: [{ id: 'tpl-1', description: 'FC', is_client_variant: false, is_global: true, version: 5, parameters: { m: 1 } }],
  template_versions: [] as any[],
})

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => errorSpy.mockRestore())

describe('POST /api/client-qualities', () => {
  it('stores the quality on a fresh private copy of a base template and records its first version', async () => {
    state.db = seededDb(seed())
    const res = await POST(req({ client_id: 'co-1', template_id: 'tpl-1' }))
    expect(res.status).toBe(201)
    const { client_quality } = await res.json()
    expect(client_quality.template_id).not.toBe('tpl-1')
    expect(state.db.rows.quality_templates.find((t: any) => t.id === client_quality.template_id)).toMatchObject({
      is_client_variant: true, is_global: false, template_parent_id: 'tpl-1', version: 1, parameters: { m: 1 },
    })
    expect(state.db.rows.template_versions).toEqual([
      expect.objectContaining({ template_id: client_quality.template_id, version_number: 1 }),
    ])
    expect(state.db.rpcCalls).toEqual([
      {
        fn: 'record_client_quality_version',
        args: { p_client_quality_id: client_quality.id, p_source: 'wolthers', p_user: 'user-1', p_note: 'First version' },
      },
    ])
  })

  it('records nothing and leaves no copy when the insert fails', async () => {
    state.db = seededDb(seed(), { fail: (t, op) => (t === 'client_qualities' && op === 'insert' ? { message: 'boom' } : null) })
    const res = await POST(req({ client_id: 'co-1', template_id: 'tpl-1' }))
    expect(res.status).toBe(500)
    expect(state.db.rpcCalls).toEqual([])
    expect(state.db.rows.quality_templates.map((t: any) => t.id)).toEqual(['tpl-1'])
  })

  it('removes the new quality and its copy when the first version cannot be recorded', async () => {
    state.db = seededDb(seed(), { rpc: () => ({ data: null, error: { message: 'down' } }) })
    const res = await POST(req({ client_id: 'co-1', template_id: 'tpl-1' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Could not create the quality, please try again.')
    expect(state.db.rows.client_qualities).toEqual([])
    expect(state.db.rows.quality_templates.map((t: any) => t.id)).toEqual(['tpl-1'])
    expect(state.db.rows.template_versions).toEqual([])
  })
})
