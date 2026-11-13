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
const req = { url: `http://x/api/portal/qualities/q1?company=${CO}` } as any
const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) })
const gateOk = (over: Record<string, unknown> = {}) => ({
  ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: [], capabilities: ['qc_spec_edit'] }, isCompanyAdmin: false, isStaffViewAs: false, ...over },
})

beforeEach(() => {
  m.facts.mockReset().mockResolvedValue([])
  m.tables = {
    client_qualities: [
      { id: 'q1', client_id: CO, custom_name: 'GC17', origin: 'Brazil', is_active: true, template: null, fee_price: 9.5, tracking_number: 'SAN-01234/26' },
      { id: 'q2', client_id: 'other', custom_name: 'Not mine', origin: 'Peru', is_active: true, template: null },
    ],
    client_quality_versions: [{
      id: 'v1', client_quality_id: 'q1', version_no: 1, effective_from: '2026-01-01', source: 'wolthers', note: null, tracking_number: 'SAN-01234/26',
      created_by: null, created_at: '2026-01-01T00:00:00Z', applied_at: '2026-01-01T00:00:00Z', notified_at: null, cancelled_at: null,
      cancelled_by: null, cancel_note: null,
      spec: { template: { parameters: { moisture: 12 }, methodology: 'SCA' }, custom_parameters: null, cups_per_sample: null, discrepancy_threshold: null },
    }],
  }
  m.gate = gateOk()
})

describe('GET /api/portal/qualities/[id]', () => {
  it('flags a migration v1 in force as the original specification', async () => {
    Object.assign(m.tables.client_quality_versions[0], { source: 'migration', effective_from: '2000-01-01' })
    const body = await (await GET(req, ctxFor('q1'))).json()
    expect(body.inForce).toMatchObject({ versionNo: 1, original: true })
    expect(body.versions[0]).toMatchObject({ versionNo: 1, original: true })
  })

  it('asks for qc_specs and returns the in-force version and methodology', async () => {
    const res = await GET(req, ctxFor('q1'))
    expect(m.need).toEqual({ view: 'qc_specs' })
    const body = await res.json()
    expect(body.inForce).toMatchObject({ versionNo: 1, parameters: { moisture: 12 }, original: false })
    expect(body.quality).toMatchObject({ name: 'GC17', methodology: 'SCA' })
    expect(body.canEdit).toBe(true)
  })
  it('404 for a quality of another company', async () => {
    expect((await GET(req, ctxFor('q2'))).status).toBe(404)
  })
  it('403 without qc_specs', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'no' }, { status: 403 }) }
    expect((await GET(req, ctxFor('q1'))).status).toBe(403)
  })
  it('canEdit is false in the staff view-as', async () => {
    m.gate = gateOk({ isStaffViewAs: true })
    expect((await (await GET(req, ctxFor('q1'))).json()).canEdit).toBe(false)
  })
  it('a quality without versions still answers 200 with null sections and no edit', async () => {
    m.tables.client_quality_versions = []
    const res = await GET(req, ctxFor('q1'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.inForce).toBeNull()
    expect(Object.values(body.sections).every((s) => s === null)).toBe(true)
    expect(body.canEdit).toBe(false)
  })
  it('never carries fee_ keys or SAN numbers', async () => {
    const text = JSON.stringify(await (await GET(req, ctxFor('q1'))).json())
    expect(text).not.toContain('fee_')
    expect(text).not.toMatch(/SAN-/)
  })
})
