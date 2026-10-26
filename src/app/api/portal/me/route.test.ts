// src/app/api/portal/me/route.test.ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } }) }))
vi.mock('@/lib/auth/access-kind', () => ({ accessKindForUser: async () => 'staff' }))
const profileRow = { current: null as any }
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  portalServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow.current, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/portal/invite-service', () => ({ loadCompanyIdentity: async () => ({ name: 'Fantasy Roasters', logoUrl: 'https://x/logo.png' }) }))

import { GET } from './route'

describe('GET /api/portal/me', () => {
  it('tells a staff caller without ?company what to do, keeping the 400', async () => {
    const res = await GET({ nextUrl: new URL('http://x/api/portal/me') } as any)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Open a client page and choose “View as client”.')
  })

  const CO = '11111111-1111-4111-8111-111111111111'
  const viewAs = () => GET({ nextUrl: new URL(`http://x/api/portal/me?company=${CO}`) } as any)

  it('a portal manager views the company as its admin would, so the Team page shows', async () => {
    profileRow.current = { full_name: 'Ana', email: 'ana@wolthers.com', qc_role: 'lab_quality_manager', is_global_admin: false }
    const body = await (await viewAs()).json()
    expect(body.viewAs).toBe(true)
    expect(body.companies).toEqual([expect.objectContaining({ id: CO, name: 'Fantasy Roasters', logoUrl: 'https://x/logo.png', isCompanyAdmin: true })])
  })

  it('a global admin flag alone is enough', async () => {
    profileRow.current = { full_name: 'D', email: 'd@wolthers.com', qc_role: 'lab_personnel', is_global_admin: true }
    expect((await (await viewAs()).json()).companies[0].isCompanyAdmin).toBe(true)
  })

  it('other staff view it read-only, without the Team page', async () => {
    profileRow.current = { full_name: 'Lab', email: 'lab@wolthers.com', qc_role: 'lab_personnel', is_global_admin: false }
    const body = await (await viewAs()).json()
    expect(body.viewAs).toBe(true)
    expect(body.companies[0].isCompanyAdmin).toBe(false)
  })

  it('a staff profile that cannot be read never opens the Team page', async () => {
    profileRow.current = null
    expect((await (await viewAs()).json()).companies[0].isCompanyAdmin).toBe(false)
  })
})
