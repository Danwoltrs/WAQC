import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const CO = '11111111-1111-4111-8111-111111111111'
const T_OWN = '22222222-2222-4222-8222-222222222222'
const T_OTHER = '33333333-3333-4333-8333-333333333333'

const m = vi.hoisted(() => ({
  staff: true,
  country: 'Brazil' as string | null | undefined, // undefined = company invisible
  user: { id: 'u1' } as any,
  holders: {} as Record<string, string>, // titular id -> company id
  ops: [] as { table: string; op: string; payload?: any; filters: any[] }[],
}))

function builder(table: string) {
  const rec: any = { table, op: 'select', filters: [] as any[] }
  const chain: any = {
    select: () => chain,
    update: (p: any) => { rec.op = 'update'; rec.payload = p; return chain },
    insert: (p: any) => { rec.op = 'insert'; rec.payload = p; return chain },
    eq: (c: string, v: any) => { rec.filters.push(['eq', c, v]); return chain },
    neq: (c: string, v: any) => { rec.filters.push(['neq', c, v]); return chain },
    is: (c: string, v: any) => { rec.filters.push(['is', c, v]); return chain },
    in: (c: string, v: any) => { rec.filters.push(['in', c, v]); return chain },
    order: () => chain,
    maybeSingle: async () => {
      m.ops.push(rec)
      if (table === 'companies') {
        return { data: m.country === undefined ? null : { id: CO, country: m.country }, error: null }
      }
      if (table === 'company_titulares') {
        const id = rec.filters.find((f: any) => f[1] === 'id')?.[2]
        const co = rec.filters.find((f: any) => f[1] === 'company_id')?.[2]
        return { data: m.holders[id] === co ? { id } : null, error: null }
      }
      return { data: null, error: null }
    },
    single: async () => {
      m.ops.push(rec)
      return { data: { id: 'new', company_id: CO, ...rec.payload }, error: null }
    },
    then: (res: any) => { m.ops.push(rec); return res({ data: [], error: null }) },
  }
  return chain
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user }, error: m.user ? null : { message: 'x' } }) },
    from: builder,
  }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => m.staff }))

import { POST } from './route'

const post = (body: unknown) =>
  POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: CO }) })

beforeEach(() => {
  m.staff = true
  m.country = 'Brazil'
  m.user = { id: 'u1' }
  m.holders = { [T_OWN]: CO, [T_OTHER]: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }
  m.ops = []
})

describe('POST bank-accounts', () => {
  it('403 for a non-staff login, nothing written', async () => {
    m.staff = false
    expect((await post({ account_number: '1' })).status).toBe(403)
    expect(m.ops).toEqual([])
  })
  it('401 without a session', async () => {
    m.user = null
    expect((await post({ account_number: '1' })).status).toBe(401)
  })
  it('400 when neither account number nor PIX is given', async () => {
    expect((await post({ bank_name: 'Itau' })).status).toBe(400)
    expect(m.ops.some((o) => o.op === 'insert')).toBe(false)
  })
  it('400 when titular_id belongs to another company; nothing inserted', async () => {
    const res = await post({ account_number: '1', titular_id: T_OTHER })
    expect(res.status).toBe(400)
    expect(m.ops.some((o) => o.op === 'insert')).toBe(false)
  })
  it('201 for a holder of this company, inserted with the company id', async () => {
    const res = await post({ account_number: '1', titular_id: T_OWN })
    expect(res.status).toBe(201)
    const ins = m.ops.find((o) => o.op === 'insert')!
    expect(ins.table).toBe('company_bank_accounts')
    expect(ins.payload).toMatchObject({ company_id: CO, titular_id: T_OWN })
  })
  it('a primary account first clears the holder\'s current primary (company-own: titular_id null)', async () => {
    await post({ account_number: '1', is_primary: true })
    const clear = m.ops.find((o) => o.op === 'update')!
    expect(clear.payload).toEqual({ is_primary: false })
    expect(clear.filters).toContainEqual(['is', 'titular_id', null])
    expect(m.ops.indexOf(clear)).toBeLessThan(m.ops.findIndex((o) => o.op === 'insert'))
  })
  it('Brazil company keeps account type and PIX key', async () => {
    const res = await post({ account_number: '1', account_type: 'corrente', pix_key: 'a@b.co' })
    expect(res.status).toBe(201)
    expect(m.ops.find((o) => o.op === 'insert')!.payload).toMatchObject({ account_type: 'corrente', pix_key: 'a@b.co', pix_key_type: 'email' })
  })
  it('foreign company: a client-sent country is ignored; account type and PIX are cleared', async () => {
    m.country = 'Colombia'
    const res = await post({ account_number: '1', account_type: 'corrente', pix_key: 'a@b.co', country: 'Brazil' })
    expect(res.status).toBe(201)
    expect(m.ops.find((o) => o.op === 'insert')!.payload).toMatchObject({ account_type: null, pix_key: null, pix_key_type: null })
  })
  it('foreign company with only a PIX key: 400, nothing inserted', async () => {
    m.country = 'Colombia'
    expect((await post({ pix_key: 'a@b.co' })).status).toBe(400)
    expect(m.ops.some((o) => o.op === 'insert')).toBe(false)
  })
  it('404 when the company is not visible; nothing inserted', async () => {
    m.country = undefined
    expect((await post({ account_number: '1' })).status).toBe(404)
    expect(m.ops.some((o) => o.op === 'insert')).toBe(false)
  })
})
