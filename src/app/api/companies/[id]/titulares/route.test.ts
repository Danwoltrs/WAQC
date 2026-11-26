import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const CO = '11111111-1111-4111-8111-111111111111'
const OTHER_CO = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const TIT = '55555555-5555-4555-8555-555555555555'

const m = vi.hoisted(() => ({
  staff: true,
  holderCompany: '' as string,
  ops: [] as { op: string; payload?: any; filters: any[] }[],
}))

function builder() {
  const rec: any = { op: 'select', filters: [] as any[] }
  const chain: any = {
    select: () => chain,
    update: (p: any) => { rec.op = 'update'; rec.payload = p; return chain },
    insert: (p: any) => { rec.op = 'insert'; rec.payload = p; return chain },
    eq: (c: string, v: any) => { rec.filters.push([c, v]); return chain },
    order: () => chain,
    maybeSingle: async () => {
      m.ops.push(rec)
      const co = rec.filters.find((f: any) => f[0] === 'company_id')?.[1]
      return { data: co === m.holderCompany ? { id: TIT, company_id: co, person_type: 'F', name: 'Ana', ...rec.payload } : null, error: null }
    },
    single: async () => { m.ops.push(rec); return { data: { id: TIT, company_id: CO, ...rec.payload }, error: null } },
  }
  return chain
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: builder,
  }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => m.staff }))

import { POST } from './route'
import { PATCH } from './[titularId]/route'

beforeEach(() => { m.staff = true; m.holderCompany = CO; m.ops = [] })

const post = (body: unknown) =>
  POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: CO }) })
const patch = (id: string, body: unknown) =>
  PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id, titularId: TIT }) })

describe('titulares routes', () => {
  it('POST 403 for non-staff', async () => {
    m.staff = false
    expect((await post({ person_type: 'F', name: 'Ana' })).status).toBe(403)
    expect(m.ops).toEqual([])
  })
  it('POST 400 for an invalid CPF', async () => {
    expect((await post({ person_type: 'F', name: 'Ana', cpf_cnpj: '529.982.247-24' })).status).toBe(400)
  })
  it('POST 201 inserts with the company id and a formatted document', async () => {
    const res = await post({ person_type: 'F', name: 'Ana', cpf_cnpj: '52998224725' })
    expect(res.status).toBe(201)
    expect(m.ops[0].payload).toMatchObject({ company_id: CO, cpf_cnpj: '529.982.247-25' })
  })
  it('PATCH 404 when the holder belongs to another company than the route id', async () => {
    const res = await patch(OTHER_CO, { is_active: false })
    expect(res.status).toBe(404)
  })
  it('PATCH toggles is_active, scoped by id and company', async () => {
    const res = await patch(CO, { is_active: false })
    expect(res.status).toBe(200)
    expect(m.ops[0].filters).toContainEqual(['company_id', CO])
    expect(m.ops[0].payload).toMatchObject({ is_active: false })
  })
  it('PATCH 400 for { is_primary: true } (holders have no primary)', async () => {
    expect((await patch(CO, { is_primary: true })).status).toBe(400)
  })
})
