import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * Editing a client's private template copy in Quality Templates changes that
 * client's spec, so it records a spec version for every client quality on the
 * copy. A base template reaches no client any more and records nothing.
 */

const state = vi.hoisted(() => ({ db: null as any, send: vi.fn(async () => true) }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))
vi.mock('@/lib/portal/spec-change-email', () => ({ sendSpecChangeEmail: state.send }))

import { PATCH } from './route'

function seed() {
  return {
    quality_templates: [
      { id: 'tpl-copy', is_client_variant: true, version: 2, parameters: { moisture_max: 12.5 } },
      { id: 'tpl-base', is_client_variant: false, version: 7, parameters: { moisture_max: 12.5 } },
    ],
    client_qualities: [
      { id: 'cq-a', template_id: 'tpl-copy' },
      { id: 'cq-b', template_id: 'tpl-copy' },
      { id: 'cq-other', template_id: 'tpl-base' },
    ],
    template_versions: [],
  }
}

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => errorSpy.mockRestore())

describe('PATCH /api/quality-templates/[id]', () => {
  it('records a version for every client quality on a client copy', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ parameters: { moisture_max: 12 } }), ctx('tpl-copy'))
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([
      { fn: 'record_client_quality_version', args: { p_client_quality_id: 'cq-a', p_source: 'wolthers', p_user: 'user-1', p_note: null } },
      { fn: 'record_client_quality_version', args: { p_client_quality_id: 'cq-b', p_source: 'wolthers', p_user: 'user-1', p_note: null } },
    ])
  })

  it('records nothing for a base template', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ parameters: { moisture_max: 12 } }), ctx('tpl-base'))
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })

  it('says to save again when the version could not be recorded, after the template was saved', async () => {
    state.db = seededDb(seed(), { rpc: () => ({ data: null, error: { message: 'no_template' } }) })
    const res = await PATCH(req({ parameters: { moisture_max: 12 } }), ctx('tpl-copy'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Saved, but the spec version could not be recorded. Please save again.')
    expect(state.db.writes.some((w: any) => w.table === 'quality_templates' && w.op === 'update')).toBe(true)
  })

  it('records nothing when the update fails', async () => {
    state.db = seededDb(seed(), { fail: (t, op) => (t === 'quality_templates' && op === 'update' ? { message: 'boom' } : null) })
    const res = await PATCH(req({ parameters: { moisture_max: 12 } }), ctx('tpl-copy'))
    expect(res.status).toBe(500)
    expect(state.db.rpcCalls).toEqual([])
  })

  it("returns the client changes a copy edit cancelled, per quality (R33)", async () => {
    const rows: any = seed()
    rows.client_quality_versions = [
      { id: 'c-a', client_quality_id: 'cq-a', version_no: 4, effective_from: '2099-01-15', source: 'client', applied_at: null, cancelled_at: null },
    ]
    state.db = seededDb(rows, { rpc: (_fn: string, args: any) => {
      for (const r of rows.client_quality_versions) {
        if (r.client_quality_id === args.p_client_quality_id && !r.applied_at && !r.cancelled_at && r.effective_from > '2026-11-11') {
          Object.assign(r, { cancelled_at: new Date().toISOString(), cancelled_by: args.p_user, cancel_note: 'Cancelled when Wolthers changed this specification' })
        }
      }
      return { data: 'w-new', error: null }
    } })
    const res = await PATCH(req({ parameters: { moisture_max: 12 } }), ctx('tpl-copy'))
    expect(res.status).toBe(200)
    expect((await res.json()).cancelledClientChanges).toEqual([{ versionNo: 4, effectiveFrom: '2099-01-15' }])
    expect(state.send).toHaveBeenCalledWith('c-a', state.db)
  })
})
