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
const req = (q = '') => ({ url: `http://x/api/portal/certificates?company=${CO}${q}` }) as any

const base = {
  id: 'c1', certificateNumber: 'SAG-011895/26', contractRef: '42089/26', issuedAt: '2026-10-01T00:00:00Z',
  type: 'pss', rejected: false, violations: [], origin: 'Brazil', lab: 'Santos lab', seller: 'Seller A',
  importer: 'Importer', roaster: 'Roaster', quality: 'GC17', crop: '25/26', containerNr: 'MSNU 123', mt: 0, labSampleId: 's1',
}
const facts = [
  base,
  { ...base, id: 'c2', certificateNumber: 'BR-0375/26', contractRef: '50001/26', origin: 'Colombia', containerNr: 'HASU 9', type: 'ss', rejected: true },
  { ...base, id: 'c3', certificateNumber: null, contractRef: '60002/26', containerNr: null },
]

beforeEach(() => {
  m.fetchFacts.mockReset().mockResolvedValue(facts)
  m.gateNeed = null
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: ['qc_certificates'], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
})

const ids = async (q = '') => (await (await GET(req(q))).json()).certificates.map((c: any) => c.id)

describe('GET /api/portal/certificates', () => {
  it('asks the gate for qc_certificates and returns its refusal unchanged', async () => {
    await GET(req())
    expect(m.gateNeed).toEqual({ view: 'qc_certificates' })
    m.gate = { ok: false, response: NextResponse.json({ error: 'nope' }, { status: 403 }) }
    expect((await GET(req())).status).toBe(403)
  })

  it('fetches facts with scope client_or_end and the period', async () => {
    await GET(req('&period=crop-2025'))
    expect(m.fetchFacts).toHaveBeenCalledWith(admin, { companyId: CO, scope: 'client_or_end', period: parsePortalPeriod('crop-2025') })
  })

  it('returns period, periods and mapped rows', async () => {
    const body = await (await GET(req('&period=crop-2025'))).json()
    expect(body.period.label).toBe('Crop 25/26')
    expect(body.periods).toHaveLength(5)
    expect(body.certificates[0]).toEqual({
      id: 'c1', certificateNumber: 'SAG-011895/26', contract: '42089/26', origin: 'Brazil', quality: 'GC17',
      seller: 'Seller A', type: 'PSS', crop: '25/26', status: 'approved', issuedDate: '2026-10-01T00:00:00Z',
      downloadUrl: `/api/portal/certificates/c1/pdf?company=${CO}`,
    })
    expect(body.certificates[1]).toMatchObject({ type: 'SS', status: 'rejected' })
  })

  it('narrows by the flow filters', async () => {
    expect(await ids('&origin=Colombia')).toEqual(['c2'])
    expect(await ids('&origin=Brazil&seller=Seller A')).toEqual(['c1', 'c3'])
  })

  it('searches contract, certificate number and container, case-insensitively', async () => {
    expect(await ids('&q=42089')).toEqual(['c1'])
    expect(await ids('&q=br-0375')).toEqual(['c2'])
    expect(await ids('&q=msnu')).toEqual(['c1'])
  })

  it('shows a SAN-valued certificate number as null and never returns SAN-', async () => {
    m.fetchFacts.mockResolvedValue([{ ...base, certificateNumber: null, trackingNumber: 'SAN-00231/26' }])
    const text = JSON.stringify(await (await GET(req())).json())
    expect(text).toContain('"certificateNumber":null')
    expect(text).not.toContain('SAN-')
  })

  it('turns a failed fetch into a 500 without leaking the error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.fetchFacts.mockRejectedValue(new Error('relation "secret_table" does not exist'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not load certificates' })
    expect(spy).toHaveBeenCalledWith('[portal/certificates]', expect.any(Error))
    spy.mockRestore()
  })
})
