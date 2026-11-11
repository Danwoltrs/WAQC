import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * The client quality PATCH records a spec version only when a field the
 * version carries (template, cups, discrepancy threshold, custom parameters)
 * actually changes. Names, notes and fees are not part of the spec.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))

import { PATCH } from './route'

function seed() {
  return {
    client_qualities: [{
      id: 'cq-1', client_id: 'co-1', quality_code: 'FC', template_id: 'tpl-1', cups_per_sample: 5,
      discrepancy_threshold: null, custom_parameters: { a: 1 }, notes: null, custom_name: 'FC', fee_price: null,
    }],
  }
}

const req = (body: unknown) => ({ json: async () => body }) as any
const ctx = { params: Promise.resolve({ id: 'cq-1' }) }

describe('PATCH /api/client-qualities/[id]', () => {
  for (const [field, value] of [
    ['template_id', 'tpl-2'],
    ['cups_per_sample', 3],
    ['discrepancy_threshold', 1.5],
    ['custom_parameters', { a: 2 }],
  ] as const) {
    it(`records a version when ${field} changes`, async () => {
      state.db = seededDb(seed())
      const res = await PATCH(req({ [field]: value }), ctx)
      expect(res.status).toBe(200)
      expect(state.db.rpcCalls).toEqual([
        { fn: 'record_client_quality_version', args: { p_client_quality_id: 'cq-1', p_source: 'wolthers', p_user: 'user-1', p_note: null } },
      ])
    })
  }

  it('records nothing for notes, name and fees', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ notes: 'n', custom_name: 'FC 2', fee_price: 10, fee_currency: 'USD', fee_unit: 'lb' }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })

  it('records nothing when the spec fields come back unchanged', async () => {
    state.db = seededDb(seed())
    const res = await PATCH(req({ template_id: 'tpl-1', cups_per_sample: 5, custom_parameters: { a: 1 }, notes: 'n' }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toEqual([])
  })
})
