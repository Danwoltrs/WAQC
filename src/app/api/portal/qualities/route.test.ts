import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, need: null as any, tables: {} as Record<string, any[]>, facts: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_r: unknown, need: unknown) => { m.need = need; return m.gate },
}))
vi.mock('@/lib/portal/portal-facts', async (orig) => ({ ...(await orig<any>()), fetchPortalCertFacts: m.facts }))

import { GET } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
function chain(table: string): any {
  const q: any = new Proxy({}, {
    get(_t, p) {
      if (p === 'then') return (res: any, rej: any) => Promise.resolve({ data: m.tables[table] ?? [], error: null }).then(res, rej)
      return () => q
    },
  })
  return q
}
const admin = { from: (t: string) => chain(t) }
const req = { url: `http://x/api/portal/qualities?company=${CO}` } as any

beforeEach(() => {
  m.facts.mockReset().mockResolvedValue([])
  m.tables = {
    client_qualities: [
      { id: 'q1', client_id: CO, custom_name: null, origin: 'Brazil', is_active: true, template_id: 't', template: { name: 'GC17', name_en: 'Santos 17/18' } },
      { id: 'q2', client_id: 'other', custom_name: 'Not mine', origin: 'Peru', is_active: true, template: null },
    ],
    client_quality_versions: [],
  }
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: [], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
})

describe('GET /api/portal/qualities', () => {
  it('asks for qc_specs, returns only own qualities named from the template', async () => {
    const res = await GET(req)
    expect(m.need).toEqual({ view: 'qc_specs' })
    const body = await res.json()
    expect(body.qualities.map((q: any) => q.name)).toEqual(['Santos 17/18'])
    expect(body.origins).toHaveLength(1)
  })
  it('returns the gate refusal', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'no' }, { status: 403 }) }
    expect((await GET(req)).status).toBe(403)
  })
})
