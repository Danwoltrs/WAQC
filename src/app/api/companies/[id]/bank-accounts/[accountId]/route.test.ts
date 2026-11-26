import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const CO = '11111111-1111-4111-8111-111111111111'
const OTHER_CO = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const ACC = '44444444-4444-4444-8444-444444444444'
const T_OTHER = '33333333-3333-4333-8333-333333333333'

const m = vi.hoisted(() => ({
  staff: true,
  accountCompany: '' as string,
  ops: [] as { table: string; op: string; payload?: any; filters: any[] }[],
}))

function builder(table: string) {
  const rec: any = { table, op: 'select', filters: [] as any[] }
  const chain: any = {
    select: () => chain,
    update: (p: any) => { rec.op = 'update'; rec.payload = p; return chain },
    eq: (c: string, v: any) => { rec.filters.push(['eq', c, v]); return chain },
    neq: (c: string, v: any) => { rec.filters.push(['neq', c, v]); return chain },
    is: (c: string, v: any) => { rec.filters.push(['is', c, v]); return chain },
    maybeSingle: async () => {
      m.ops.push(rec)
      if (table === 'company_bank_accounts') {
        const co = rec.filters.find((f: any) => f[1] === 'company_id')?.[2]
        return { data: co === m.accountCompany ? { id: ACC, titular_id: null, is_active: true } : null, error: null }
      }
      return { data: null, error: null } // titular lookup: not a holder of this company
    },
    single: async () => { m.ops.push(rec); return { data: { id: ACC, company_id: CO, ...rec.payload }, error: null } },
    then: (res: any) => { m.ops.push(rec); return res({ data: [], error: null }) },
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

import { PATCH } from './route'

const patch = (id: string, body: unknown) =>
  PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id, accountId: ACC }) })

beforeEach(() => { m.staff = true; m.accountCompany = CO; m.ops = [] })

describe('PATCH bank-accounts/[accountId]', () => {
  it('403 for non-staff', async () => {
    m.staff = false
    expect((await patch(CO, { is_active: false })).status).toBe(403)
  })
  it('404 when the account belongs to another company than the route id', async () => {
    const res = await patch(OTHER_CO, { is_active: false })
    expect(res.status).toBe(404)
    expect(m.ops.some((o) => o.op === 'update')).toBe(false)
  })
  it('deactivating also clears is_primary', async () => {
    const res = await patch(CO, { is_active: false })
    expect(res.status).toBe(200)
    const upd = m.ops.find((o) => o.op === 'update')!
    expect(upd.payload).toMatchObject({ is_active: false, is_primary: false })
    expect(upd.filters).toContainEqual(['eq', 'company_id', CO])
  })
  it('{ is_primary: true } clears the other primaries of the same holder, except itself', async () => {
    await patch(CO, { is_primary: true })
    const clear = m.ops.find((o) => o.op === 'update' && o.payload.is_primary === false)!
    expect(clear.filters).toContainEqual(['neq', 'id', ACC])
    expect(clear.filters).toContainEqual(['is', 'titular_id', null])
  })
  it('400 when the full edit names a holder of another company', async () => {
    const res = await patch(CO, { account_number: '1', titular_id: T_OTHER })
    expect(res.status).toBe(400)
    expect(m.ops.some((o) => o.op === 'update')).toBe(false)
  })
})
