import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  contact: { company_id: 'c1', owner_lab_id: null } as any,
  scope: { ownLabId: 'co', isGlobal: false, isHq: false } as any,
  updates: 0,
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => true }))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({ ...(await orig<any>()), loadLabScope: async () => m.scope }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: m.contact, error: null }),
        update: () => { m.updates++; return chain },
        single: async () => ({ data: { id: 'k1', routing_purposes: [] }, error: null }),
      }
      return chain
    },
  }),
}))

import { PATCH, DELETE } from './route'

const patch = (company = 'c1') =>
  PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }), {
    params: Promise.resolve({ id: company, contactId: 'k1' }),
  })

beforeEach(() => {
  m.contact = { company_id: 'c1', owner_lab_id: null }
  m.scope = { ownLabId: 'co', isGlobal: false, isHq: false }
  m.updates = 0
})

describe('qc-contacts/[contactId]', () => {
  it('PATCH 404 for a contact another owner added (Santos row, Colombia caller)', async () => {
    expect((await patch()).status).toBe(404)
    expect(m.updates).toBe(0)
  })
  it('DELETE 404 for a foreign contact', async () => {
    const res = await DELETE(new NextRequest('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'c1', contactId: 'k1' }) })
    expect(res.status).toBe(404)
    expect(m.updates).toBe(0)
  })
  it('PATCH 404 when the contact belongs to another company', async () => {
    m.contact = { company_id: 'other', owner_lab_id: 'co' }
    expect((await patch()).status).toBe(404)
  })
  it('PATCH works on the lab\'s own contact', async () => {
    m.contact = { company_id: 'c1', owner_lab_id: 'co' }
    expect((await patch()).status).toBe(200)
    expect(m.updates).toBe(1)
  })
})
