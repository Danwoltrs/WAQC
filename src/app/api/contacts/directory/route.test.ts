import { describe, it, expect, vi, beforeEach } from 'vitest'

let staff = true
const ownedCalls: unknown[][] = []

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => {
    const chain: any = {
      select: () => chain, eq: () => chain, contains: () => chain, or: () => chain, order: () => chain,
      range: async () => ({
        data: [{ id: 'co1', name: 'Acme', fantasy_name: null, trading_roles: ['buyer'] }], count: 1, error: null,
      }),
    }
    return { auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) }, from: () => chain }
  },
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => staff }))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({
  ...(await orig<any>()),
  loadLabScope: async () => ({ ownLabId: 'lab-peru', isGlobal: false, isHq: false }),
}))
vi.mock('@/lib/qc-contacts/owned-rows', () => ({
  fetchOwnedContacts: async (...args: unknown[]) => {
    ownedCalls.push(args)
    return [
      { company_id: 'co1', id: 'b', name: 'Bea', email: 'b@x.com', is_primary: false },
      { company_id: 'co1', id: 'a', name: 'Ana', email: 'a@x.com', is_primary: false },
    ]
  },
}))

import { NextRequest } from 'next/server'
import { GET } from './route'

const call = (qs = '') => GET(new NextRequest(`http://x/api/contacts/directory${qs}`))

beforeEach(() => { staff = true; ownedCalls.length = 0 })

describe('GET /api/contacts/directory', () => {
  it('refuses non-staff', async () => {
    staff = false
    expect((await call()).status).toBe(403)
  })

  it('reads contacts through the lab owner and sorts them', async () => {
    const res = await call('?role=buyers')
    const body = await res.json()
    expect(ownedCalls[0][2]).toBe('lab-peru')
    expect(body.companies[0].contacts.map((c: any) => c.id)).toEqual(['a', 'b'])
    expect(body.hasMore).toBe(false)
  })
})
