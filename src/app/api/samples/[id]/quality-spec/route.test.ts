import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * GET /api/samples/[id]/quality-spec tells the cupping validation modal whether
 * the lot's spec has validation rules. It must ask the lot's spec VERSION
 * (pinned, else in force on its contract date), never the live template,
 * which a later spec change would rewrite. The response shape is unchanged.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)

import { GET } from './route'

function fakeDb(sample: Record<string, any> | null, user: { id: string } | null = { id: 'me' }) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(_table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () =>
          sample ? { data: sample, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      }
      return chain
    },
  }
}

const call = (id = 'lot-1') =>
  GET(new NextRequest(`http://localhost/api/samples/${id}/quality-spec`), { params: Promise.resolve({ id }) })

const resolved = (parameters: any) => ({
  id: 'cq-1', custom_name: 'Fine Cup', quality_code: 'FC', template_id: 'tpl-1',
  cups_per_sample: 5, discrepancy_threshold: null, custom_parameters: {},
  template: { id: 'tpl-1', name: 'T', name_en: null, description: null, parameters },
  version: { id: 'ver-2', versionNo: 2, effectiveFrom: '2026-01-01', pinned: true },
})

// A readable sample whose live template has no rules: the version decides.
const readable = { id: 'lot-1', quality_spec_id: 'cq-1', quality_spec: { id: 'cq-1' } }

describe('GET /api/samples/[id]/quality-spec', () => {
  beforeEach(() => {
    spec.resolveSampleSpecs.mockReset()
    spec.resolveSampleSpec.mockReset().mockResolvedValue(resolved({ cupping_attributes: [{ attribute: 'Body' }] }))
  })

  it("answers from the lot's spec version, in the same shape", async () => {
    state.db = fakeDb(readable)
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      has_validation_rules: true,
      quality_spec_name: 'Fine Cup',
      quality_spec_id: 'cq-1',
    })
    expect(spec.resolveSampleSpec).toHaveBeenCalledTimes(1)
    const [id, opts] = spec.resolveSampleSpec.mock.calls[0]
    expect(id).toBe('lot-1')
    expect(opts?.pin).toBeFalsy()
  })

  it('reports no rules when the version has none', async () => {
    spec.resolveSampleSpec.mockResolvedValue(resolved({ moisture: { max: 12 } }))
    state.db = fakeDb(readable)
    expect((await (await call()).json()).has_validation_rules).toBe(false)
  })

  it('reports no rules when the version has no template', async () => {
    spec.resolveSampleSpec.mockResolvedValue({ ...resolved({}), template: null })
    state.db = fakeDb(readable)
    expect(await (await call()).json()).toEqual({
      has_validation_rules: false,
      quality_spec_name: 'Fine Cup',
      quality_spec_id: 'cq-1',
    })
  })

  it('a sample without a quality reads nothing and reports no rules', async () => {
    state.db = fakeDb({ id: 'lot-1', quality_spec_id: null, quality_spec: null })
    expect(await (await call()).json()).toEqual({
      has_validation_rules: false,
      quality_spec_name: null,
      quality_spec_id: null,
    })
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('a quality the caller cannot read under RLS reads nothing, as before', async () => {
    state.db = fakeDb({ id: 'lot-1', quality_spec_id: 'cq-1', quality_spec: null })
    expect((await (await call()).json()).quality_spec_name).toBeNull()
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('404 when the sample is not readable, 401 without a user', async () => {
    state.db = fakeDb(null)
    expect((await call()).status).toBe(404)
    state.db = fakeDb(readable, null)
    expect((await call()).status).toBe(401)
  })

  it('500 when the spec read fails', async () => {
    spec.resolveSampleSpec.mockRejectedValue(new Error('boom'))
    state.db = fakeDb(readable)
    expect((await call()).status).toBe(500)
  })
})
