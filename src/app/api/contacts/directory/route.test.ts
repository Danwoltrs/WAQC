import { describe, it, expect, vi, beforeEach } from 'vitest'

let staff = true
const ownedCalls: unknown[][] = []
// Every filter call on the companies query (session client) and on the contact
// search (admin client), as [method, ...args].
let companyCalls: unknown[][] = []
let contactCalls: unknown[][] = []
let contactRows: Array<{ company_id: string }> = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const chain: any = new Proxy({}, {
      get: (_t, m: string) => {
        if (m === 'then') return (res: any) => res({ data: contactRows, error: null })
        return (...a: unknown[]) => { contactCalls.push([m, ...a]); return chain }
      },
    })
    return { from: () => chain }
  },
}))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => {
    const chain: any = new Proxy({}, {
      get: (_t, m: string) => {
        if (m === 'range') {
          return async (...a: unknown[]) => {
            companyCalls.push(['range', ...a])
            return { data: [{ id: 'co1', name: 'Acme', fantasy_name: null, trading_roles: ['buyer'] }], count: 1, error: null }
          }
        }
        return (...a: unknown[]) => { companyCalls.push([m, ...a]); return chain }
      },
    })
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

beforeEach(() => {
  staff = true; ownedCalls.length = 0
  companyCalls = []; contactCalls = []; contactRows = []
})

const has = (calls: unknown[][], ...call: unknown[]) =>
  calls.some((c) => c.length >= call.length && call.every((v, i) => JSON.stringify(c[i]) === JSON.stringify(v)))

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
    expect(body.truncated).toBe(false)
  })

  it('filters buyers and sellers on trading_roles', async () => {
    await call('?role=buyers')
    expect(has(companyCalls, 'contains', 'trading_roles', ['buyer'])).toBe(true)
    companyCalls = []
    await call('?role=sellers')
    expect(has(companyCalls, 'contains', 'trading_roles', ['seller'])).toBe(true)
    companyCalls = []
    await call()
    expect(companyCalls.some((c) => c[0] === 'contains')).toBe(false)
  })

  it('pages by offset, 50 companies at most', async () => {
    await call('?offset=100')
    expect(has(companyCalls, 'range', 100, 149)).toBe(true)
    companyCalls = []
    await call('?offset=0&limit=500')
    expect(has(companyCalls, 'range', 0, 49)).toBe(true)
  })

  it('sanitises the search term before it reaches the filters', async () => {
    await call('?q=' + encodeURIComponent('ac,me(x)%*'))
    const or = companyCalls.find((c) => c[0] === 'or')![1] as string
    expect(or).toBe('name.ilike.%ac me x%,fantasy_name.ilike.%ac me x%')
    expect(has(contactCalls, 'or', 'name.ilike.%ac me x%,email.ilike.%ac me x%')).toBe(true)
    expect(has(contactCalls, 'eq', 'owner_lab_id', 'lab-peru')).toBe(true)
  })

  it('strips a double quote too: an unbalanced " would break the or() filter', async () => {
    await call('?q=' + encodeURIComponent('o"brien'))
    const or = companyCalls.find((c) => c[0] === 'or')![1] as string
    expect(or).toBe('name.ilike.%o brien%,fantasy_name.ilike.%o brien%')
    expect(or).not.toContain('"')
    expect(has(contactCalls, 'or', 'name.ilike.%o brien%,email.ilike.%o brien%')).toBe(true)
  })

  it('de-duplicates matched company ids', async () => {
    contactRows = [{ company_id: 'k1' }, { company_id: 'k1' }, { company_id: 'k2' }]
    const body = await (await call('?q=ana')).json()
    const or = companyCalls.find((c) => c[0] === 'or')![1] as string
    expect(or).toContain('id.in.(k1,k2)')
    expect(body.truncated).toBe(false)
  })

  it('caps the matched ids at 300 and says it is truncated', async () => {
    contactRows = Array.from({ length: 400 }, (_, i) => ({ company_id: `k${i}` }))
    const body = await (await call('?q=ana')).json()
    const or = companyCalls.find((c) => c[0] === 'or')![1] as string
    const ids = /id\.in\.\(([^)]*)\)/.exec(or)![1].split(',')
    expect(ids).toHaveLength(300)
    expect(body.truncated).toBe(true)
  })
})
