import { describe, it, expect, vi, beforeEach } from 'vitest'

// The contact row as the "database" holds it; reads see it, a conditional
// update only lands when its filter still matches.
let row: { id: string; company_id: string; is_active: boolean; routing_purposes: string[] | null }
let clashOnce = false
const updates: unknown[] = []

function adminDb() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }),
      }),
      update: (values: { routing_purposes: string[] }) => {
        const filters: Array<(r: typeof row) => boolean> = []
        const chain: any = {
          eq: () => chain,
          is: (_c: string, v: null) => { filters.push((r) => r.routing_purposes === v); return chain },
          filter: (_c: string, _op: string, lit: string) => {
            filters.push((r) => `{${(r.routing_purposes ?? []).join(',')}}` === lit)
            return chain
          },
          select: async () => {
            if (clashOnce) { clashOnce = false; row = { ...row, routing_purposes: [...(row.routing_purposes ?? []), 'price_report'] } }
            if (!filters.every((f) => f(row))) return { data: [], error: null }
            updates.push(values.routing_purposes)
            row = { ...row, routing_purposes: values.routing_purposes }
            return { data: [{ id: row.id, routing_purposes: row.routing_purposes }], error: null }
          },
        }
        return chain
      },
    }),
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => adminDb() }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'staff' } }, error: null }) } }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => true }))

import { PATCH } from './route'

const call = (body: unknown, company = 'co1') =>
  PATCH(
    new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }) as any,
    { params: Promise.resolve({ id: company, contactId: 'c1' }) },
  )

beforeEach(() => {
  row = { id: 'c1', company_id: 'co1', is_active: true, routing_purposes: ['sale_confirmations'] }
  clashOnce = false
  updates.length = 0
})

describe('PATCH contact purposes', () => {
  it('adds one Quality purpose and keeps the sys tags', async () => {
    const res = await call({ purpose: 'qc_certificates', on: true })
    expect(res.status).toBe(200)
    expect(row.routing_purposes).toEqual(['sale_confirmations', 'qc_certificates'])
  })

  it('refuses Trading and Logistics columns', async () => {
    const res = await call({ purpose: 'fixation_letters', on: true })
    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('refuses a contact of another company, or an inactive one', async () => {
    expect((await call({ purpose: 'eudr_files', on: true }, 'other')).status).toBe(404)
    row.is_active = false
    expect((await call({ purpose: 'eudr_files', on: true })).status).toBe(404)
    expect(updates).toHaveLength(0)
  })

  it('re-reads instead of overwriting a tag sys added in between', async () => {
    clashOnce = true
    const res = await call({ purpose: 'qc_certificates', on: true })
    expect(res.status).toBe(200)
    expect(row.routing_purposes).toEqual(['sale_confirmations', 'price_report', 'qc_certificates'])
  })

  it('handles a null array', async () => {
    row.routing_purposes = null
    await call({ purpose: 'sample_requests', on: true })
    expect(row.routing_purposes).toEqual(['sample_requests'])
  })
})
