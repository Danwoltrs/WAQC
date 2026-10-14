import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ gate: null as any, build: vi.fn(), voidedFilter: false }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), requireQcPortal: async () => m.gate }))
vi.mock('@/lib/certificate-pdf', () => ({ buildCertificatePdfResponse: (...a: any[]) => m.build(...a) }))

import { GET } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CERT = '33333333-3333-4333-8333-333333333333'

let tables: Record<string, { data: any; error: any }>
const admin = {
  from(table: string) {
    const chain: any = {
      select() { return chain }, eq() { return chain },
      is(col: string, val: any) { m.voidedFilter = m.voidedFilter || (table === 'certificates' && col === 'voided_at' && val === null); return chain },
      maybeSingle() { return Promise.resolve(tables[table]) },
    }
    return chain
  },
}

const call = (id = CERT) => GET({ url: `http://x/?company=${CO}` } as any, { params: Promise.resolve({ id }) })

beforeEach(() => {
  m.build.mockReset().mockResolvedValue(new Response('pdf'))
  ;m.voidedFilter = false
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: ['qc_certificates'], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
  tables = {
    certificates: { data: { id: CERT, certificate_number: 'SAG-011895/26', sample_id: 's1' }, error: null },
    samples: { data: { id: 's1', client_id: CO, end_client_id: null, deleted_at: null }, error: null },
  }
})

describe('GET /api/portal/certificates/[id]/pdf', () => {
  it('serves the PDF through the builder with the sample id', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(m.build.mock.calls[0][2]).toMatchObject({ sampleId: 's1' })
    expect(m.voidedFilter).toBe(true)
  })
  it('404s for another company\'s sample', async () => {
    tables.samples.data.client_id = OTHER
    expect((await call()).status).toBe(404)
    expect(m.build).not.toHaveBeenCalled()
  })
  it('404s for a deleted sample', async () => {
    tables.samples.data.deleted_at = '2026-01-01'
    expect((await call()).status).toBe(404)
  })
  it('404s for a voided (not found) certificate', async () => {
    tables.certificates.data = null
    expect((await call()).status).toBe(404)
  })
  it('404s for a non-UUID id', async () => {
    expect((await call('nope')).status).toBe(404)
  })
  it('500s on a read error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    tables.samples = { data: null, error: { code: 'XX' } }
    expect((await call()).status).toBe(500)
  })
})
