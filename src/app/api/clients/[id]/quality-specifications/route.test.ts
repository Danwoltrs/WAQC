import { describe, it, expect, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

/**
 * Assigning a spec on the client page stores it on a fresh private copy of
 * the chosen template and starts its version history.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/lab-scope')>()),
  loadLabScope: async () => ({ ownLabId: 'lab-hq', isGlobal: false, isHq: true }),
}))
vi.mock('@/lib/qc-settings/lab-row', async (orig) => ({
  ...(await orig<typeof import('@/lib/qc-settings/lab-row')>()),
  loadHqLabId: async () => 'lab-hq',
}))

import { GET, POST } from './route'

const req = (body: unknown) => ({ json: async () => body }) as any
const getReq = (qs = '') => ({ nextUrl: new URL(`http://x/api/clients/co-1/quality-specifications${qs}`) }) as any
const ctx = { params: Promise.resolve({ id: 'co-1' }) }
const seed = () => ({
  client_qualities: [] as any[],
  quality_templates: [{ id: 'tpl-1', is_client_variant: false, is_global: true, version: 3, parameters: {} }],
  template_versions: [] as any[],
})

describe('POST /api/clients/[id]/quality-specifications', () => {
  it('stores the spec on a private copy and records its first version', async () => {
    state.db = seededDb(seed())
    const res = await POST(req({ template_id: 'tpl-1', custom_name: 'FC' }), ctx)
    expect(res.status).toBe(201)
    const { specification } = await res.json()
    expect(specification.template_id).not.toBe('tpl-1')
    expect(state.db.rows.quality_templates.find((t: any) => t.id === specification.template_id)).toMatchObject({
      is_client_variant: true, template_parent_id: 'tpl-1', version: 1,
    })
    expect(state.db.rpcCalls).toEqual([
      {
        fn: 'record_client_quality_version',
        args: { p_client_quality_id: specification.id, p_source: 'wolthers', p_user: 'user-1', p_note: 'First version' },
      },
    ])
  })

  it('refuses a template the client already holds a copy of, for the same origin', async () => {
    const rows = seed()
    rows.quality_templates.push({ id: 'tpl-copy', is_client_variant: true, template_parent_id: 'tpl-1', version: 1, parameters: {} } as any)
    rows.client_qualities.push({ id: 'cq-0', client_id: 'co-1', laboratory_id: 'lab-hq', template_id: 'tpl-copy', origin: null, template: { template_parent_id: 'tpl-1' } })
    state.db = seededDb(rows)
    const res = await POST(req({ template_id: 'tpl-1' }), ctx)
    expect(res.status).toBe(409)
    expect(state.db.writes).toEqual([])
  })

  it('writes the spec in the user\'s settings laboratory, never the body\'s', async () => {
    state.db = seededDb(seed())
    const res = await POST(req({ template_id: 'tpl-1', laboratory_id: 'lab-co' }), ctx)
    expect(res.status).toBe(201)
    expect(state.db.rows.client_qualities[0]).toMatchObject({ laboratory_id: 'lab-hq' })
  })

  it('does not call another laboratory\'s spec of the same template a duplicate', async () => {
    const rows = seed()
    rows.client_qualities.push({ id: 'cq-co', client_id: 'co-1', laboratory_id: 'lab-co', template_id: 'tpl-1', origin: null, template: {} })
    state.db = seededDb(rows)
    expect((await POST(req({ template_id: 'tpl-1' }), ctx)).status).toBe(201)
  })
})

describe('GET /api/clients/[id]/quality-specifications', () => {
  const specs = () => ({
    client_qualities: [
      { id: 'cq-hq', client_id: 'co-1', laboratory_id: 'lab-hq', is_active: true },
      { id: 'cq-co', client_id: 'co-1', laboratory_id: 'lab-co', is_active: true },
    ],
  })

  it('reads the requested laboratory\'s specs', async () => {
    state.db = seededDb(specs())
    const body = await (await GET(getReq('?laboratory_id=lab-co'), ctx)).json()
    expect(body.specifications.map((x: any) => x.id)).toEqual(['cq-co'])
  })

  it('defaults to the user\'s settings laboratory (HQ) without the parameter', async () => {
    state.db = seededDb(specs())
    const body = await (await GET(getReq(), ctx)).json()
    expect(body.specifications.map((x: any) => x.id)).toEqual(['cq-hq'])
  })

  it('gives a laboratory with no specs none, never another laboratory\'s', async () => {
    state.db = seededDb(specs())
    const body = await (await GET(getReq('?laboratory_id=lab-pe'), ctx)).json()
    expect(body.specifications).toEqual([])
  })
})
