import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const CO = '11111111-1111-4111-8111-111111111111'
const m = vi.hoisted(() => ({
  scope: { ownLabId: 'lab1', isGlobal: false, isHq: false } as any,
  created: false,
  updates: [] as any[],
}))

function builder(table: string) {
  const rec: any = { table }
  const chain: any = {
    select: () => chain,
    update: (p: any) => { m.updates.push(p); rec.update = true; return chain },
    eq: () => chain,
    limit: async () => ({ data: m.created ? [{ created_company: true }] : [], error: null }),
    maybeSingle: async () => ({ data: { id: CO, name: 'Fazenda', country: 'Brazil', ...(m.updates.at(-1) ?? {}) }, error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: builder,
  }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => true }))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({ ...(await orig<any>()), loadLabScope: async () => m.scope }))

import { GET, PATCH } from './route'

beforeEach(() => {
  m.scope = { ownLabId: 'lab1', isGlobal: false, isHq: false }
  m.created = false
  m.updates = []
})
const ctx = { params: Promise.resolve({ id: CO }) }
const patch = (body: unknown) => PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }), ctx)

describe('company route', () => {
  it('GET: a linked company the lab did not create is read-only', async () => {
    const res = await GET(new NextRequest('http://x'), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).canEditCompany).toBe(false)
  })
  it('GET: created_company true is editable', async () => {
    m.created = true
    expect((await (await GET(new NextRequest('http://x'), ctx)).json()).canEditCompany).toBe(true)
  })
  it('GET: HQ (reads every lab) is editable', async () => {
    m.scope = { ownLabId: 'hq', isGlobal: false, isHq: true }
    expect((await (await GET(new NextRequest('http://x'), ctx)).json()).canEditCompany).toBe(true)
  })
  it('PATCH 403 when the caller cannot edit, and nothing is written', async () => {
    expect((await patch({ name: 'X' })).status).toBe(403)
    expect(m.updates).toEqual([])
  })
  it('PATCH writes a formatted, validated CNPJ for an editor', async () => {
    m.created = true
    const res = await patch({ person_type: 'J', document_cnpj: '11222333000181', document_ie: '' })
    expect(res.status).toBe(200)
    expect(m.updates[0]).toMatchObject({ document_cnpj: '11.222.333/0001-81', document_ie: null })
  })
  it('PATCH 400 for an invalid CNPJ', async () => {
    m.created = true
    expect((await patch({ person_type: 'J', document_cnpj: '11222333000182' })).status).toBe(400)
  })
  it('PATCH writes street / street_number / neighbourhood; the legacy address column is refused', async () => {
    m.created = true
    const res = await patch({ street: 'Rua A', street_number: '10', neighbourhood: 'Centro' })
    expect(res.status).toBe(200)
    expect(m.updates[0]).toEqual({ street: 'Rua A', street_number: '10', neighbourhood: 'Centro' })
    m.updates = []
    expect((await patch({ address: 'Rua A, 10' })).status).toBe(400)
    expect(m.updates).toEqual([])
  })
})
