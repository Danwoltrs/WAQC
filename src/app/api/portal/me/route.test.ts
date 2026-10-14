// src/app/api/portal/me/route.test.ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } }) }))
vi.mock('@/lib/auth/access-kind', () => ({ accessKindForUser: async () => 'staff' }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), portalServiceClient: () => ({}) }))

import { GET } from './route'

describe('GET /api/portal/me', () => {
  it('tells a staff caller without ?company what to do, keeping the 400', async () => {
    const res = await GET({ nextUrl: new URL('http://x/api/portal/me') } as any)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Open a client page and choose “View as client”.')
  })
})
