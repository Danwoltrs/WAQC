// src/app/api/portal/samples/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, orCalls: [] as string[] }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), requireQcPortal: async () => m.gate }))

import { GET } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const rows: any[] = [{
  id: 's1', client_id: '11111111-1111-4111-8111-111111111111', end_client_id: null, tracking_number: 'SAN-00231/26', origin: 'Brazil', quality_name: 'GC17', sample_type: 'pss', workflow_stage: 'certified',
  status: 'approved', wolthers_contract_nr: '42089/26', buyer_contract_nr: null, container_nr: null, ico_number: null,
  exporter_sample_number: null, certificates: [{ id: 'cert-1', certificate_number: 'SAG-011895/26' }],
}]
const admin = {
  from() {
    const chain: any = {
      select() { return chain }, is() { return chain }, order() { return chain }, limit() { return chain },
      or(expr: string) { m.orCalls.push(expr); return chain },
      then(ok: any, bad: any) { return Promise.resolve({ data: rows, error: null }).then(ok, bad) },
    }
    return chain
  },
}
const req = (q = '') => ({ url: `http://x/api/portal/samples?company=${CO}${q}`, nextUrl: new URL(`http://x/api/portal/samples?company=${CO}${q}`) }) as any

beforeEach(() => {
  m.orCalls = []
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
})

describe('GET /api/portal/samples', () => {
  it('scopes to the gate company and never returns a SAN number', async () => {
    const res = await GET(req())
    const text = JSON.stringify(await res.json())
    expect(m.orCalls[0]).toBe(`client_id.eq.${CO},end_client_id.eq.${CO}`)
    expect(text).toContain('SAG-011895/26')
    expect(text).not.toContain('SAN-')
  })

  it('offers the certificate PDF link only with qc_certificates', async () => {
    expect((await (await GET(req())).json()).samples[0].certificateUrl).toBeNull()
    m.gate.ctx.keys = { views: ['qc_samples', 'qc_certificates'], capabilities: [] }
    expect((await (await GET(req())).json()).samples[0].certificateUrl).toContain('/api/portal/certificates/')
  })

  it('adds the search filter as a second condition', async () => {
    await GET(req('&q=42089'))
    expect(m.orCalls[1]).toContain('wolthers_contract_nr.ilike.*42089*')
  })

  it('drops a row that belongs to another company', async () => {
    rows.push({ ...rows[0], id: 's9', client_id: '22222222-2222-4222-8222-222222222222', end_client_id: null })
    try {
      const body = await (await GET(req())).json()
      expect(body.samples.map((s: any) => s.id)).toEqual(['s1'])
    } finally { rows.pop() }
  })

  it('returns the gate refusal unchanged', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'nope' }, { status: 403 }) }
    expect((await GET(req())).status).toBe(403)
  })
})
