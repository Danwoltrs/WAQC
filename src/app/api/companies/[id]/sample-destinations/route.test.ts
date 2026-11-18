import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  staff: true,
  onFile: [] as any[],
  inserts: [] as any[],
  failFirst: false,
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => m.staff }))
vi.mock('@/lib/supabase-service', () => ({
  serviceRoleClient: () => ({
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { id: 'c1', name: 'Blaser Trading', fantasy_name: 'Blaser' }, error: null }),
        insert: (v: any) => {
          m.inserts.push(v)
          const fail = m.failFirst && m.inserts.length === 1
          return {
            select: () => ({
              single: async () =>
                fail ? { data: null, error: { code: '23503', message: 'fk' } } : { data: { id: 'new', kind: 'sample', ...v }, error: null },
            }),
          }
        },
        then: (res: any) => res({ data: table === 'company_addresses' ? m.onFile : [], error: null }),
      }
      return chain
    },
  }),
}))

import { POST } from './route'

const call = (body: unknown) =>
  POST(new NextRequest('http://x/api/companies/c1/sample-destinations', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'c1' }),
  })

beforeEach(() => { m.staff = true; m.onFile = []; m.inserts = []; m.failFirst = false })

describe('POST sample-destinations', () => {
  it('403 for non-staff', async () => {
    m.staff = false
    expect((await call({ label: 'x', lines: 'y' })).status).toBe(403)
  })
  it('400 for an invalid body', async () => {
    expect((await call({ lines: 'y' })).status).toBe(400)
  })
  it('duplicate answers without inserting', async () => {
    m.onFile = [{ id: 'a', company_id: 'c1', kind: 'sample', lines: 'Foo 1\nBern', is_active: true }]
    const res = await call({ label: 'x', lines: 'foo 1\nbern' })
    expect((await res.json()).duplicate).toBe(true)
    expect(m.inserts).toHaveLength(0)
  })
  it('inserts with the user id', async () => {
    const res = await call({ label: 'x', lines: 'New 1' })
    expect((await res.json()).duplicate).toBe(false)
    expect(m.inserts[0]).toMatchObject({ company_id: 'c1', kind: 'sample', created_by: 'u1', updated_by: 'u1' })
  })
  it('retries with null authors on 23503', async () => {
    m.failFirst = true
    const res = await call({ label: 'x', lines: 'New 1' })
    expect(res.status).toBe(200)
    expect(m.inserts).toHaveLength(2)
    expect(m.inserts[1]).toMatchObject({ created_by: null, updated_by: null })
  })
})
