// Route-test pattern for portal routes: mock the gate and the facts fetcher, call GET, assert on the response.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, gateNeed: null as any, fetchFacts: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_req: unknown, need: unknown) => { m.gateNeed = need; return m.gate },
}))
vi.mock('@/lib/portal/portal-facts', async (orig) => ({ ...(await orig<any>()), fetchPortalCertFacts: m.fetchFacts }))

import { GET } from './route'
import { parsePortalPeriod } from '@/lib/portal/portal-period'

const CO = '11111111-1111-4111-8111-111111111111'
const admin = {}
const req = (q = '') => ({ url: `http://x/api/portal/overview?company=${CO}${q}` }) as any

const fact = {
  id: 'c1', certificateNumber: 'SAG-011895/26', contractRef: '42089/26', trackingNumber: 'SAN-00231/26',
  type: 'pss', origin: 'Brazil', lab: 'Santos lab', seller: 'Seller', importer: 'Importer', roaster: 'Roaster',
  quality: 'GC17', issuedAt: '2026-10-01T00:00:00Z', rejected: false, mt: 0,
}

beforeEach(() => {
  m.fetchFacts.mockReset().mockResolvedValue([fact])
  m.gateNeed = null
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: ['qc_dashboard'], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
})

describe('GET /api/portal/overview', () => {
  it('asks the gate for the qc_dashboard view', async () => {
    await GET(req())
    expect(m.gateNeed).toEqual({ view: 'qc_dashboard' })
  })

  it('returns the gate refusal unchanged', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'nope' }, { status: 403 }) }
    expect((await GET(req())).status).toBe(403)
    expect(m.fetchFacts).not.toHaveBeenCalled()
  })

  it('fetches facts for the gate company, client scope and the requested period', async () => {
    await GET(req('&period=crop-2025'))
    expect(m.fetchFacts).toHaveBeenCalledWith(admin, { companyId: CO, scope: 'client', period: parsePortalPeriod('crop-2025') })
  })

  it('returns the period, five period options, path rows and latest certificates', async () => {
    const body = await (await GET(req('&period=crop-2025'))).json()
    expect(body.period.label).toBe('Crop 25/26')
    expect(body.periods).toHaveLength(5)
    expect(body.paths).toHaveLength(1)
    expect(body.latest).toHaveLength(1)
  })

  it('never returns a SAN number', async () => {
    const text = JSON.stringify(await (await GET(req())).json())
    expect(text).toContain('SAG-011895/26')
    expect(text).not.toContain('SAN-')
  })

  it('turns a failed fetch into a 500 without leaking the error', async () => {
    m.fetchFacts.mockRejectedValue(new Error('relation "secret_table" does not exist'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not load overview' })
  })
})
