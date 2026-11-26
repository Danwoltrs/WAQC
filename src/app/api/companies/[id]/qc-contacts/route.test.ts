import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  scope: { ownLabId: 'co', isGlobal: false, isHq: false } as any,
  linked: false,
  inserts: [] as any[],
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => true }))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({ ...(await orig<any>()), loadLabScope: async () => m.scope }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        is: () => chain,
        limit: () => chain,
        insert: (v: any) => { m.inserts.push(v); return chain },
        single: async () => ({ data: { id: 'new', ...m.inserts[0] }, error: null }),
        then: (res: any) => res({ data: table === 'company_labs' ? (m.linked ? [{ company_id: 'c1' }] : []) : [], error: null }),
      }
      return chain
    },
  }),
}))

import { POST } from './route'

const post = () =>
  POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ email: 'a@b.co' }) }), {
    params: Promise.resolve({ id: 'c1' }),
  })

beforeEach(() => {
  m.scope = { ownLabId: 'co', isGlobal: false, isHq: false }
  m.linked = false
  m.inserts = []
})

describe('POST qc-contacts: the company must be one the lab is linked to', () => {
  it('404 for a confined lab that has no company_labs link; nothing is inserted', async () => {
    const res = await post()
    expect(res.status).toBe(404)
    expect(m.inserts).toEqual([])
  })
  it('a linked confined lab adds its own contact (owner = its lab)', async () => {
    m.linked = true
    const res = await post()
    expect(res.status).toBe(200)
    expect(m.inserts[0]).toMatchObject({ owner_lab_id: 'co', company_id: 'c1' })
  })
  it('HQ needs no link and adds a NULL-owner contact', async () => {
    m.scope = { ownLabId: 'hq', isGlobal: false, isHq: true }
    const res = await post()
    expect(res.status).toBe(200)
    expect(m.inserts[0].owner_lab_id).toBeNull()
  })
})
