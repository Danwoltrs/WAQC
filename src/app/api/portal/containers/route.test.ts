import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, gateNeed: null as any, fetch: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_req: unknown, need: unknown) => { m.gateNeed = need; return m.gate },
}))
vi.mock('@/lib/portal/portal-containers', async (orig) => ({ ...(await orig<any>()), fetchPortalContainers: m.fetch }))

import { GET } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const admin = {}
const req = (q = '') => ({ url: `http://x/api/portal/containers?company=${CO}${q}` }) as any
const row = (nr: string, vessel = 'MSC A') => ({
  containerNr: nr, seal: null, certificates: [], contractRefs: ['K1'], quality: null, seller: null, vessel, voyage: null,
  bl: null, etd: null, etdActual: false, eta: null, etaActual: false, milestone: null,
})

beforeEach(() => {
  m.fetch.mockReset().mockResolvedValue([row('MSNU 1'), row('TGHU 2', 'Maersk')])
  m.gateNeed = null
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: ['qc_containers'], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
})

describe('GET /api/portal/containers', () => {
  it('asks the gate for qc_containers', async () => {
    await GET(req())
    expect(m.gateNeed).toEqual({ view: 'qc_containers' })
  })
  it('returns the gate refusal unchanged', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'nope' }, { status: 403 }) }
    expect((await GET(req())).status).toBe(403)
    expect(m.fetch).not.toHaveBeenCalled()
  })
  it('fetches for the gate company and filters by q', async () => {
    const body = await (await GET(req('&q=maersk'))).json()
    expect(m.fetch).toHaveBeenCalledWith(admin, CO)
    expect(body.containers.map((r: any) => r.containerNr)).toEqual(['TGHU 2'])
  })
  it('turns a failure into a 500 without leaking the error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.fetch.mockRejectedValue(new Error('relation "secret" does not exist'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not load containers' })
    spy.mockRestore()
  })
})
