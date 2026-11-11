import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * The client quality PATCH records a spec version whenever it names a field
 * the version carries (template, cups, discrepancy threshold, custom
 * parameters); the RPC dedupes a save that changed nothing. Names, notes and
 * fees are not part of the spec. A template change points the quality at a
 * fresh private copy of the chosen template, never at the template itself.
 */

const state = vi.hoisted(() => ({ db: null as any, send: vi.fn(async () => true) }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))
vi.mock('@/lib/portal/spec-change-email', () => ({ sendSpecChangeEmail: state.send }))

import { PATCH } from './route'

function seed() {
  return {
    client_qualities: [{
      id: 'cq-1', client_id: 'co-1', quality_code: 'FC', template_id: 'tpl-1', cups_per_sample: 5,
      discrepancy_threshold: null, custom_parameters: { a: 1 }, notes: null, custom_name: 'FC', fee_price: null,
    }],
    quality_templates: [
      { id: 'tpl-1', is_client_variant: true, template_parent_id: 'tpl-base', version: 2, parameters: {} },
      { id: 'tpl-base', is_client_variant: false, is_global: true, version: 9, parameters: { moisture_max: 12 } },
    ],
    template_versions: [],
  }
}

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = { params: Promise.resolve({ id: 'cq-1' }) }
const RECORD = { fn: 'record_client_quality_version', args: { p_client_quality_id: 'cq-1', p_source: 'wolthers', p_user: 'user-1', p_note: null } }

describe('PATCH /api/client-qualities/[id]', () => {
  for (const [field, value] of [
    ['cups_per_sample', 3],
    ['discrepancy_threshold', 1.5],
    ['custom_parameters', { a: 2 }],
  ] as const) {
    it(`records a version when ${field} is saved`, async () => {
      state.db = seededDb(seed())
      const res = await PATCH(req({ [field]: value }), ctx)
      expect(res.status).toBe(200)
      expect(state.db.rpcCalls).toEqual([RECORD])
    })
  }

  it('records nothing for notes, name and fees', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ notes: 'n', custom_name: 'FC 2', fee_price: 10, fee_currency: 'USD', fee_unit: 'lb' }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })

  it('a re-save with the same body calls the RPC again (the RPC dedupes)', async () => {
    state.db = seededDb(seed())
    const body = { cups_per_sample: 5, custom_parameters: { a: 1 }, notes: 'n' }
    expect((await PATCH(req(body), ctx)).status).toBe(200)
    expect((await PATCH(req(body), ctx)).status).toBe(200)
    expect(state.db.rpcCalls).toEqual([RECORD, RECORD])
  })

  it('points a change to a base template at a fresh private copy of it, and records a version', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ template_id: 'tpl-base' }), ctx)
    expect(res.status).toBe(200)
    const stored = state.db.rows.client_qualities[0].template_id
    expect(stored).not.toBe('tpl-base')
    expect(state.db.rows.quality_templates.find((t: any) => t.id === stored)).toMatchObject({
      is_client_variant: true, is_global: false, template_parent_id: 'tpl-base', version: 1,
    })
    expect(state.db.rpcCalls).toEqual([RECORD])
  })

  it('keeps its own copy when the template it already has is sent again', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ template_id: 'tpl-1' }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rows.client_qualities[0].template_id).toBe('tpl-1')
    expect(state.db.writes.some((w: any) => w.table === 'quality_templates' && w.op === 'insert')).toBe(false)
  })

  it('records no version for a quality with no template, and still succeeds', async () => {
    const rows = seed()
    rows.client_qualities[0].template_id = null as any
    state.db = seededDb(rows)
    const res = await PATCH(req({ cups_per_sample: 3 }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })

  it("tells staff about the client's scheduled change the save cancelled, and emails it (R33)", async () => {
    const rows: any = seed()
    rows.client_quality_versions = [
      { id: 'c3', client_quality_id: 'cq-1', version_no: 3, effective_from: '2099-03-01', source: 'client', applied_at: null, cancelled_at: null },
    ]
    state.send.mockClear()
    state.db = seededDb(rows, { rpc: (_fn: string, args: any) => {
      for (const r of rows.client_quality_versions) {
        if (r.client_quality_id === args.p_client_quality_id && !r.applied_at && !r.cancelled_at && r.effective_from > '2026-11-11') {
          Object.assign(r, { cancelled_at: new Date().toISOString(), cancelled_by: args.p_user, cancel_note: 'Cancelled when Wolthers changed this specification' })
        }
      }
      return { data: 'w-new', error: null }
    } })
    const res = await PATCH(req({ cups_per_sample: 3 }), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).cancelledClientChanges).toEqual([{ versionNo: 3, effectiveFrom: '2099-03-01' }])
    expect(state.send).toHaveBeenCalledWith('c3', state.db)
  })

  it('reports no cancelled client change when there was none', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ cups_per_sample: 3 }), ctx)
    expect((await res.json()).cancelledClientChanges).toEqual([])
  })
})
