// The real portal gate in front of a data route: a confined laboratory's staff
// never view a client's portal, which shows certificates of every laboratory.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  kind: 'staff' as string,
  profile: null as Record<string, unknown> | null,
  labType: 'hq' as string | null,
  fetchFacts: vi.fn(async () => [] as unknown[]),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/auth/access-kind', () => ({ accessKindForUser: async () => m.kind }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data:
            table === 'profiles' ? m.profile
            : table === 'laboratories' ? { type: m.labType }
            : table === 'user_profiles' ? { status: 'active' }
            : null,
          error: null,
        }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve(
            table === 'qc_portal_access'
              ? { data: [{ company_id: '11111111-1111-4111-8111-111111111111', views: ['qc_certificates'], capabilities: [] }], error: null }
              : { data: [], error: null },
          ).then(res),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/portal/portal-facts', async (orig) => ({ ...(await orig<any>()), fetchPortalCertFacts: m.fetchFacts }))

import { GET } from './route'
import { PORTAL_ACCESS_HQ_ONLY } from '@/lib/auth/lab-scope'

const CO = '11111111-1111-4111-8111-111111111111'
const get = () => GET(new Request(`http://x/api/portal/certificates?company=${CO}`) as any)

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k')
  m.kind = 'staff'
  m.profile = { laboratory_id: 'lab-hq', qc_role: 'lab_quality_manager', is_global_admin: false }
  m.labType = 'hq'
  m.fetchFacts.mockClear()
})

describe('GET /api/portal/certificates behind the real gate', () => {
  it("a confined lab's staff viewing as the client: 403, and no certificate is read", async () => {
    m.profile = { laboratory_id: 'lab-gt', qc_role: 'lab_quality_manager', is_global_admin: false }
    m.labType = 'lab'
    const res = await get()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(PORTAL_ACCESS_HQ_ONLY)
    expect(m.fetchFacts).not.toHaveBeenCalled()
  })

  it('HQ staff viewing as the client are unaffected', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.fetchFacts).toHaveBeenCalledTimes(1)
  })

  it('a portal user (client) with access to the company is unaffected', async () => {
    m.kind = 'external'
    m.profile = { laboratory_id: 'lab-gt', qc_role: 'client', is_global_admin: false }
    m.labType = 'lab'
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.fetchFacts).toHaveBeenCalledTimes(1)
  })
})
