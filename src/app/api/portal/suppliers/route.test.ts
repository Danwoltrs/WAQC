import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, gateNeed: null as any, fetchFacts: vi.fn(), fetchDetails: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_req: unknown, need: unknown) => { m.gateNeed = need; return m.gate },
}))
vi.mock('@/lib/portal/portal-facts', async (orig) => ({ ...(await orig<any>()), fetchPortalCertFacts: m.fetchFacts }))
vi.mock('@/lib/portal/rejection-details-fetch', () => ({ fetchRejectionDetails: m.fetchDetails }))

import { GET } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const admin = {}
const req = (q = '') => ({ url: `http://x/api/portal/suppliers?company=${CO}${q}` }) as any

const mk = (id: string, seller: string, rejected: boolean, lab: string, origin = 'Brazil') => ({
  id, certificateNumber: `SAG-${id}/26`, contractRef: '42089/26', trackingNumber: 'SAN-00231/26', labSampleId: lab,
  type: 'pss', origin, lab: 'Santos lab', seller, importer: 'I', roaster: 'R', quality: 'GC17',
  issuedAt: '2026-10-01T00:00:00Z', rejected, mt: 0, violations: rejected ? ['primary'] : [],
})

beforeEach(() => {
  m.fetchFacts.mockReset().mockResolvedValue([
    mk('1', 'Cooxupé', true, 'L1'), mk('2', 'Cooxupé', false, 'L2'), mk('3', 'Other', true, 'L3'),
  ])
  m.fetchDetails.mockReset().mockResolvedValue(new Map())
  m.gateNeed = null
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: [], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
})

describe('GET /api/portal/suppliers', () => {
  it('asks the gate for qc_supplier_review', async () => {
    await GET(req())
    expect(m.gateNeed).toEqual({ view: 'qc_supplier_review' })
  })

  it('returns the gate refusal unchanged', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'nope' }, { status: 403 }) }
    expect((await GET(req())).status).toBe(403)
  })

  it('without seller returns detail null and reads no assessments', async () => {
    const body = await (await GET(req())).json()
    expect(body.detail).toBeNull()
    expect(body.sellers).toHaveLength(2)
    expect(body.periods).toHaveLength(5)
    expect(m.fetchDetails).not.toHaveBeenCalled()
  })

  it('with seller reads details only for that seller\'s rejected lab samples', async () => {
    const body = await (await GET(req('&seller=Cooxup%C3%A9'))).json()
    expect(m.fetchDetails).toHaveBeenCalledWith(admin, ['L1'])
    expect(body.detail.seller).toBe('Cooxupé')
  })

  it('the seller param selects the detail and does not filter the list', async () => {
    const body = await (await GET(req('&seller=Cooxup%C3%A9'))).json()
    expect(body.sellers.map((s: any) => s.seller).sort()).toEqual(['Cooxupé', 'Other'])
  })

  it('other flow filters narrow the list', async () => {
    m.fetchFacts.mockResolvedValue([mk('1', 'A', false, 'L1', 'Brazil'), mk('2', 'B', false, 'L2', 'Peru')])
    const body = await (await GET(req('&origin=Peru'))).json()
    expect(body.sellers.map((s: any) => s.seller)).toEqual(['B'])
  })

  it('an unknown seller gives detail null', async () => {
    expect((await (await GET(req('&seller=Nobody'))).json()).detail).toBeNull()
  })

  it('never returns a SAN number', async () => {
    const text = JSON.stringify(await (await GET(req('&seller=Cooxup%C3%A9'))).json())
    expect(text).not.toContain('SAN-')
  })

  it('turns a failure into a 500 without leaking the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.fetchFacts.mockRejectedValue(new Error('secret_table'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not load suppliers' })
  })
})
