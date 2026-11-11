import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * GET /api/samples/[id]/spec: the spec the certificate editor shows for a lot,
 * at the version the lot was graded under, plus the version its contract date
 * points to today. Gated like /api/client-qualities/[id]: a signed-in user who
 * can read the sample and its client quality under RLS.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn(), specVersionStatus: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)

import { GET } from './route'

type Row = Record<string, any>

function fakeDb(tables: Record<string, Row[]>, user: { id: string } | null) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
      const chain: any = {
        select() { return chain },
        eq(col: string, value: unknown) { filters.push([col, value]); return chain },
        is(col: string, value: unknown) { filters.push([col, value]); return chain },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => {
          const [row] = rows()
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        },
      }
      return chain
    },
  }
}

const version = (n: number) => ({ id: `ver-${n}`, client_quality_id: 'cq-1', version_no: n, effective_from: '2026-01-01' })
const resolved = {
  id: 'cq-1', custom_name: 'Fine Cup', quality_code: 'FC', template_id: 'tpl-1',
  cups_per_sample: 5, discrepancy_threshold: null, custom_parameters: {},
  template: { id: 'tpl-1', name: 'Brazil Fine Cup', name_en: null, description: null, parameters: {}, methodology: 'commodity' },
  version: { id: 'ver-3', versionNo: 3, effectiveFrom: '2026-01-01', pinned: true },
}

const call = (id = 'lot-1') =>
  GET(new NextRequest(`http://localhost/api/samples/${id}/spec`), { params: Promise.resolve({ id }) })

const tables = () => ({
  samples: [{ id: 'lot-1', quality_spec_id: 'cq-1', tracking_number: 'SAN-00999/26' }],
  client_qualities: [{ id: 'cq-1' }],
})

describe('GET /api/samples/[id]/spec', () => {
  beforeEach(() => {
    spec.resolveSampleSpec.mockReset().mockResolvedValue(resolved)
    spec.specVersionStatus.mockReset().mockResolvedValue({ pinned: version(3), implied: version(2), mismatch: true })
  })

  it('returns 401 without a user', async () => {
    state.db = fakeDb(tables(), null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('returns the resolved spec and the version numbers on a mismatch', async () => {
    state.db = fakeDb(tables(), { id: 'u-1' })
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.client_quality).toEqual(resolved)
    expect(body.version).toEqual({ pinned: 3, implied: 2, mismatch: true })
    expect(spec.resolveSampleSpec).toHaveBeenCalledWith('lot-1')
    expect(spec.specVersionStatus).toHaveBeenCalledWith('lot-1')
    // A key, never a reference for people.
    expect(JSON.stringify(body)).not.toContain('SAN-')
  })

  it('reports nulls when nothing is pinned yet', async () => {
    spec.specVersionStatus.mockResolvedValue({ pinned: null, implied: version(2), mismatch: false })
    state.db = fakeDb(tables(), { id: 'u-1' })
    const body = await (await call()).json()
    expect(body.version).toEqual({ pinned: null, implied: 2, mismatch: false })
  })

  it('returns 404 when the user cannot read the sample', async () => {
    state.db = fakeDb({ samples: [], client_qualities: [{ id: 'cq-1' }] }, { id: 'u-1' })
    const res = await call()
    expect(res.status).toBe(404)
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('returns 404 when the user cannot read the client quality', async () => {
    state.db = fakeDb({ samples: tables().samples, client_qualities: [] }, { id: 'u-1' })
    const res = await call()
    expect(res.status).toBe(404)
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('answers a sample without a quality with nulls', async () => {
    state.db = fakeDb({ samples: [{ id: 'lot-1', quality_spec_id: null }], client_qualities: [] }, { id: 'u-1' })
    const body = await (await call()).json()
    expect(body).toEqual({ client_quality: null, version: { pinned: null, implied: null, mismatch: false } })
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('returns 500 when the spec read fails', async () => {
    spec.resolveSampleSpec.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.db = fakeDb(tables(), { id: 'u-1' })
    expect((await call()).status).toBe(500)
  })
})
