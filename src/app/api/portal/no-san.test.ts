// Whole-portal check: SAN values are seeded at the lowest level (the Supabase client the gate hands
// every route) and the real fetchers and models run. Nothing here mocks the SAN guard itself.
// Every portal GET route is driven through its real fetch chain; none is mocked at its top-level fetcher.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CO = '11111111-1111-4111-8111-111111111111'
const SAN = 'SAN-00231/26'

const m = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }))

/** Chainable, thenable query: every filter is a no-op, the table's rows come back on await. */
function chain(table: string): any {
  const rows = () => m.tables[table] ?? []
  const q: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej)
      if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: rows()[0] ?? null, error: null })
      return () => q
    },
  })
  return q
}
const admin = { from: (table: string) => chain(table) }

vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async () => ({
    ok: true,
    ctx: { admin, companyId: CO, userId: 'u', keys: { views: [], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false },
  }),
  portalServiceClient: () => admin,
}))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } }) }))
vi.mock('@/lib/auth/access-kind', () => ({ accessKindForUser: async () => 'staff' }))
vi.mock('@/lib/portal/invite-service', () => ({ loadCompanyIdentity: async () => ({ name: 'Fantasy Roasters', logoUrl: null }) }))

import { GET as overview } from './overview/route'
import { GET as certificates } from './certificates/route'
import { GET as suppliers } from './suppliers/route'
import { GET as containers } from './containers/route'
import { GET as me } from './me/route'

const co = (name: string) => ({ name, fantasy_name: name })
const sample = (id: string, extra: Record<string, unknown> = {}) => ({
  id, deleted_at: null, lab_source_sample_id: id, sample_type: 'pss', client_id: CO, end_client_id: null,
  origin: 'Brazil', quality_name: 'GC17', crop_year: '26/27', container_nr: 'MSKU1234567', wolthers_contract_nr: '42089/26',
  importer_is_qc_client: false, bag_count: 320, bag_weight_kg: 60, bag_type: 'bag', equivalent_60kg_bags: 320, bags_quantity_mt: 19.2,
  tracking_number: SAN, contract_id: 'k1',
  laboratory: { name: 'Santos' }, seller: co('Seller One'), exporter: co('Exporter'), importer: co('Importer'), roaster: co('Roaster'),
  ...extra,
})
const cert = (id: string, number: string, rejected: boolean, s: any) => ({
  id, certificate_number: number, tracking_number: SAN, sample_id: s.id, created_at: new Date().toISOString(),
  is_rejected: rejected, compliance_violations: rejected ? ['Primary defects'] : [], override_comment: null, sample: s,
})

beforeEach(() => {
  const s1 = sample('s1')
  const s2 = sample('s2')
  const s3 = sample('s3')
  m.tables = {
    certificates: [
      cert('c1', 'SAG-011895/26', false, s1),
      cert('c2', SAN, true, s2), // SAN-valued certificate number
      cert('c3', 'SAG-011896/26', true, s3),
    ],
    samples: [s1, s2, s3],
    shipments: [{
      id: 'sh1', contract_id: 'k1', vessel_name: 'MSC Test', voyage_number: 'V1', bl_number: 'BL1', etd: '2026-10-01', etd_actual: null,
      eta: '2026-11-01', eta_actual: null, transport_milestone: 'loaded_on_vessel',
      shipment_containers: [{ container: { container_number: 'MSKU1234567', seal_number: 'S1' } }],
    }],
    quality_assessments: [
      { sample_id: 's2', green_bean_data: { primary_defects: 12 }, resolved_defects: null, created_at: '2026-10-02T00:00:00Z' },
      { sample_id: 's3', green_bean_data: { primary_defects: 9 }, resolved_defects: null, created_at: '2026-10-02T00:00:00Z' },
    ],
    companies: [co('Fantasy Roasters')],
    profiles: [{ full_name: 'Ana', email: 'ana@wolthers.com', qc_role: 'lab_personnel', is_global_admin: false, tracking_number: SAN }],
  }
})

const nreq = (path: string) => {
  const url = new URL(`http://x/api/portal/${path}`)
  return { url: url.toString(), nextUrl: url } as any
}

describe('no SAN number leaves any portal GET route', () => {
  const routes: [string, (r: any) => Promise<Response>, string][] = [
    ['overview', overview, `overview?company=${CO}`],
    ['certificates', certificates, `certificates?company=${CO}`],
    ['suppliers (seller detail)', suppliers, `suppliers?company=${CO}&seller=Seller%20One`],
    ['containers', containers, `containers?company=${CO}`],
    ['me', me, `me?company=${CO}`],
  ]
  for (const [name, handler, path] of routes) {
    it(name, async () => {
      const res = await handler(nreq(path))
      expect(res.status).toBe(200)
      const text = JSON.stringify(await res.json())
      expect(text.length).toBeGreaterThan(20)
      expect(text).not.toMatch(/SAN-\d/)
    })
  }

  it('the routes carried real rows, so the check is not vacuous', async () => {
    const body = await (await certificates(nreq(`certificates?company=${CO}`))).json()
    expect(body.certificates.length).toBeGreaterThan(0)
    const sup = await (await suppliers(nreq(`suppliers?company=${CO}&seller=Seller%20One`))).json()
    expect(sup.detail).not.toBeNull()
    const cont = await (await containers(nreq(`containers?company=${CO}`))).json()
    expect(cont.containers).toHaveLength(1)
  })
})
