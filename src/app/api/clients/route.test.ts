import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * QC settings belong to a laboratory: the clients list shows the user's own
 * lab's row, and enrolling a company as a QC client from one lab never meets
 * another lab's settings row.
 *
 * Adding a company that already exists links it instead of duplicating it:
 * candidates are found with the service role (a confined lab cannot see them),
 * a confined lab gets a company_labs row, and everything the caller gets back
 * is read with their own session.
 */

const HQ = 'lab-hq'
const CO = 'lab-co'

const state = vi.hoisted(() => ({
  db: null as any,
  service: null as any,
  staff: true,
  scope: { ownLabId: null as string | null, isGlobal: false, isHq: false },
}))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.service }))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => state.staff }))
vi.mock('@/lib/auth/lab-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/lab-scope')>()),
  loadLabScope: async () => state.scope,
}))
vi.mock('@/lib/qc-settings/lab-row', async (orig) => ({
  ...(await orig<typeof import('@/lib/qc-settings/lab-row')>()),
  loadHqLabId: async () => 'lab-hq',
}))
vi.mock('@/lib/notifications', () => ({ activities: { clientCreated: vi.fn() } }))

import { GET, POST } from './route'

type Call = { table: string; op: string; args: any[] }

/** A small in-memory Supabase stand-in: eq / in / is filters, `or` ignored, inserts stored, writes recorded. */
function fakeDb(tables: Record<string, any[]>) {
  const calls: Call[] = []
  let seq = 0
  const from = (table: string) => {
    const store = (tables[table] ??= [])
    let rows = [...store]
    let head = false
    let written: any[] | null = null
    const q: any = {
      select: (_s?: string, opts?: { head?: boolean }) => { head = !!opts?.head; return q },
      eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q },
      neq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] !== v); return q },
      is: (col: string, v: unknown) => { rows = rows.filter((r) => (r[col] ?? null) === v); return q },
      in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return q },
      ilike: (col: string, v: string) => { rows = rows.filter((r) => String(r[col]).toLowerCase() === v.toLowerCase()); return q },
      order: () => q, range: () => q, limit: () => q, or: () => q, overlaps: () => q,
      maybeSingle: async () => ({ data: (written ?? rows)[0] ?? null, error: null }),
      single: async () => {
        const r = (written ?? rows)[0]
        return r ? { data: r, error: null } : { data: null, error: { code: 'PGRST116' } }
      },
      upsert: async (...args: any[]) => { calls.push({ table, op: 'upsert', args }); return { error: null } },
      insert: (...args: any[]) => {
        calls.push({ table, op: 'insert', args })
        written = (Array.isArray(args[0]) ? args[0] : [args[0]]).map((p: any) => ({ id: `${table}-${++seq}`, ...p }))
        store.push(...written)
        return q
      },
      update: (...args: any[]) => { calls.push({ table, op: 'update', args }); written = []; return q },
      delete: () => { calls.push({ table, op: 'delete', args: [] }); written = []; return q },
      then: (resolve: any, reject: any) =>
        Promise.resolve(head ? { count: rows.length, data: null, error: null } : { data: written ?? rows, error: null }).then(resolve, reject),
    }
    return q
  }
  return { from, calls, tables, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }
}

const writes = (db: any, table: string) =>
  db.calls.filter((c: Call) => c.table === table && (c.op === 'insert' || c.op === 'upsert' || c.op === 'update' || c.op === 'delete'))

const company = (qc_settings: any[]) => ({
  id: 'co-ahold', name: 'Ahold Delhaize', fantasy_name: 'Ahold', email: null, phone: null, address: null,
  neighborhood: null, city: null, state: null, country: null, zip_code: null, vat_number: null,
  company_types: ['trader'], trading_roles: ['buyer'], is_qc_client: true, is_active: true,
  legacy_client_id: null, logo_url: null, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01',
  qc_settings,
})

const get = () => GET({ nextUrl: new URL('http://x/api/clients') } as any)
const post = (body: unknown) => POST({ json: async () => body } as any)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.staff = true
  state.service = fakeDb({})
})

describe('GET /api/clients', () => {
  it('lists each client once, with the settings of the HQ user laboratory', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    const row = company([
      { laboratory_id: CO, currency: 'COP' },
      { laboratory_id: HQ, currency: 'EUR' },
    ])
    state.db = fakeDb({ companies: [row] })
    const res = await get()
    const { clients } = await res.json()
    expect(clients).toHaveLength(1)
    expect(clients[0]).toMatchObject({ id: 'co-ahold', currency: 'EUR' })
  })
})

describe('POST /api/clients', () => {
  const body = { name: 'Ahold Delhaize', company: 'Ahold', pricing_model: 'per_sample' }

  it('lets a Colombia user enrol a company that only has an HQ settings row', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [company([])] })
    state.db = fakeDb({
      companies: [company([{ laboratory_id: HQ, currency: 'EUR' }])],
      qc_client_settings: [{ company_id: 'co-ahold', laboratory_id: HQ }],
    })
    const res = await post(body)
    expect(res.status).toBe(200)
    const upsert = state.db.calls.find((c: Call) => c.table === 'qc_client_settings' && c.op === 'upsert')
    expect(upsert.args[0]).toMatchObject({ company_id: 'co-ahold', laboratory_id: CO })
    expect(upsert.args[1]).toEqual({ onConflict: 'company_id,laboratory_id' })
    // Santos's row is not touched, and Colombia's client shows Colombia's defaults, not HQ's EUR.
    expect((await res.json()).client.currency).toBe('USD')
  })

  it('answers 409 when the HQ user laboratory already has settings for that company', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.service = fakeDb({ companies: [company([])] })
    state.db = fakeDb({
      companies: [company([{ laboratory_id: HQ }])],
      qc_client_settings: [{ company_id: 'co-ahold', laboratory_id: HQ }],
    })
    const res = await post(body)
    expect(res.status).toBe(409)
    expect(state.db.calls.filter((c: Call) => c.table === 'qc_client_settings')).toEqual([])
  })
})

describe('POST /api/clients: match or link', () => {
  const ahold = (over: Record<string, unknown> = {}) => ({ ...company([]), ...over })
  const companiesInserts = () => [
    ...writes(state.db, 'companies').filter((c: Call) => c.op === 'insert'),
    ...writes(state.service, 'companies'),
  ]

  it('403 for a login that is not QC staff; nothing read with the service role, nothing written', async () => {
    state.staff = false
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold()] })
    state.db = fakeDb({ companies: [ahold()] })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold' })
    expect(res.status).toBe(403)
    expect(state.service.calls).toEqual([])
    expect(state.db.calls).toEqual([])
  })

  it('a confined lab that matches an existing company links it: company_labs created_company false, no companies insert', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold({ name: 'AHOLD DELHAIZE B.V.', is_qc_client: false })] })
    state.db = fakeDb({ companies: [ahold({ is_qc_client: false })] })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', is_qc_client: false })
    expect(res.status).toBe(200)
    const link = writes(state.service, 'company_labs')
    expect(link).toHaveLength(1)
    expect(link[0].args[0]).toEqual({ company_id: 'co-ahold', laboratory_id: CO, created_company: false, created_by: 'user-1' })
    expect(companiesInserts()).toEqual([])
    // company_labs is written with the service role only; the session client never touches it.
    expect(writes(state.db, 'company_labs')).toEqual([])
    expect((await res.json()).client.id).toBe('co-ahold')
  })

  it('HQ that matches an existing company gets it, with no company_labs row and no duplicate', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.service = fakeDb({ companies: [ahold()] })
    state.db = fakeDb({ companies: [ahold()], qc_client_settings: [] })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold' })
    expect(res.status).toBe(200)
    expect(writes(state.service, 'company_labs')).toEqual([])
    expect(companiesInserts()).toEqual([])
  })

  it('a confined create inserts the company with its documents, then company_labs created_company true', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold()] })
    state.db = fakeDb({ companies: [] })
    const res = await post({
      name: 'Fazenda Boa Vista Ltda', company: 'Boa Vista', fantasy_name: 'Boa Vista', country: 'Brazil',
      person_type: 'J', document_cnpj: '11222333000181', document_ie: '123.456', is_qc_client: false,
    })
    expect(res.status).toBe(201)
    const ins = writes(state.db, 'companies').filter((c: Call) => c.op === 'insert')
    expect(ins).toHaveLength(1)
    expect(ins[0].args[0]).toMatchObject({
      name: 'Fazenda Boa Vista Ltda', person_type: 'J', document_cnpj: '11.222.333/0001-81', document_ie: '123.456',
    })
    const link = writes(state.service, 'company_labs')
    expect(link).toHaveLength(1)
    expect(link[0].args[0]).toMatchObject({ laboratory_id: CO, created_company: true, created_by: 'user-1' })
    expect(link[0].args[0].company_id).toBe((await res.json()).client.id)
  })

  it('an email alone never links: a company with the same email but another name is not the match', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.service = fakeDb({ companies: [ahold({ id: 'co-other', name: 'Other Coffee', fantasy_name: null, email: 'buyer@x.com' })] })
    state.db = fakeDb({ companies: [ahold({ id: 'co-other', name: 'Other Coffee', fantasy_name: null, email: 'buyer@x.com' })] })
    const res = await post({ name: 'Brand New Coffee', company: 'Brand New', email: 'buyer@x.com', is_qc_client: false })
    expect(res.status).toBe(201)
    expect(writes(state.db, 'companies').filter((c: Call) => c.op === 'insert')).toHaveLength(1)
  })

  it('several name matches or a conflicting tax id create, and the response says nothing about the candidates', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({
      companies: [
        ahold({ id: 'cand-1', name: 'Ahold Delhaize', notes: 'service-only' }),
        ahold({ id: 'cand-2', name: 'AHOLD DELHAIZE B.V.', notes: 'service-only' }),
      ],
    })
    state.db = fakeDb({ companies: [] })
    const twice = await post({ name: 'Ahold Delhaize', company: 'Ahold', is_qc_client: false })
    expect(twice.status).toBe(201)
    const a = await twice.json()
    expect(Object.keys(a)).toEqual(['client'])
    expect(JSON.stringify(a)).not.toMatch(/cand-1|cand-2|service-only/)

    state.service = fakeDb({ companies: [ahold({ id: 'cand-3', document_cnpj: '12.345.678/0001-90', notes: 'service-only' })] })
    state.db = fakeDb({ companies: [] })
    const conflict = await post({ name: 'Ahold Delhaize', company: 'Ahold', document_cnpj: '11.222.333/0001-81', is_qc_client: false })
    expect(conflict.status).toBe(201)
    const b = await conflict.json()
    expect(Object.keys(b)).toEqual(['client'])
    expect(JSON.stringify(b)).not.toMatch(/cand-3|service-only/)
  })

  it('a tax id match links even under another name', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold({ document_cnpj: '11.222.333/0001-81' })] })
    state.db = fakeDb({ companies: [ahold({ document_cnpj: '11.222.333/0001-81' })] })
    const res = await post({ name: 'Totally Different Name', company: 'X', document_cnpj: '11222333000181', is_qc_client: false })
    expect(res.status).toBe(200)
    expect(companiesInserts()).toEqual([])
    expect(writes(state.service, 'company_labs')[0].args[0]).toMatchObject({ company_id: 'co-ahold', created_company: false })
  })

  it('holders and bank accounts are saved with the session client, stamped with the lab, after the link exists', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: [] })
    const res = await post({
      name: 'Fazenda Boa Vista', company: 'Boa Vista', country: 'Brazil', is_qc_client: false,
      bank_accounts: [{ bank_name: 'Itau', account_number: '123', is_primary: true, titular_id: '11111111-1111-4111-8111-111111111111' }],
      titulares: [{
        person_type: 'F', name: 'Joao Silva', cpf_cnpj: '52998224725',
        bank_accounts: [{ pix_key: 'joao@x.com' }],
      }],
    })
    expect(res.status).toBe(201)
    const companyId = (await res.json()).client.id
    const holders = writes(state.db, 'company_titulares')
    expect(holders).toHaveLength(1)
    expect(holders[0].args[0]).toMatchObject({
      company_id: companyId, name: 'Joao Silva', cpf_cnpj: '529.982.247-25', owner_lab_id: CO, created_by: 'user-1',
    })
    const accounts = writes(state.db, 'company_bank_accounts').filter((c: Call) => c.op === 'insert')
    expect(accounts).toHaveLength(2)
    // The company's own account: a titular_id sent in the body is ignored.
    expect(accounts[0].args[0]).toMatchObject({ company_id: companyId, titular_id: null, account_number: '123', owner_lab_id: CO })
    expect(accounts[1].args[0]).toMatchObject({
      company_id: companyId, titular_id: state.db.tables.company_titulares[0].id, pix_key: 'joao@x.com', pix_key_type: 'email', owner_lab_id: CO,
    })
    expect(writes(state.service, 'company_titulares')).toEqual([])
    expect(writes(state.service, 'company_bank_accounts')).toEqual([])
    // Order: the link first (the holder policy requires it), then the holder.
    expect(writes(state.service, 'company_labs')).toHaveLength(1)
  })

  it('HQ holders carry owner_lab_id null', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.db = fakeDb({ companies: [] })
    const res = await post({
      name: 'Fazenda Boa Vista', company: 'Boa Vista', is_qc_client: false,
      titulares: [{ person_type: 'J', name: 'Boa Vista Agro' }],
    })
    expect(res.status).toBe(201)
    expect(writes(state.db, 'company_titulares')[0].args[0]).toMatchObject({ owner_lab_id: null })
  })

  it('on a link the bank-account rules follow the existing record country, not the body', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold({ country: 'Colombia' })] })
    state.db = fakeDb({ companies: [ahold({ country: 'Colombia' })], qc_client_settings: [] })
    const res = await post({
      name: 'Ahold Delhaize', company: 'Ahold', country: 'Brazil', is_qc_client: false,
      bank_accounts: [
        { account_number: '1', account_type: 'corrente', pix_key: 'a@b.co' },
        { pix_key: 'only@pix.co' },
      ],
    })
    expect(res.status).toBe(200)
    const accounts = writes(state.db, 'company_bank_accounts').filter((c: Call) => c.op === 'insert')
    expect(accounts).toHaveLength(1)
    expect(accounts[0].args[0]).toMatchObject({ account_number: '1', account_type: null, pix_key: null, pix_key_type: null })
    expect((await res.json()).register_errors).toEqual(['Bank account 2: Enter the account number'])
  })

  it('400 for an invalid holder CPF or company CNPJ, before anything is read or written', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: [] })
    const badHolder = await post({ name: 'X Co', company: 'X', titulares: [{ person_type: 'F', name: 'Joao', cpf_cnpj: '111' }] })
    expect(badHolder.status).toBe(400)
    const badDoc = await post({ name: 'X Co', company: 'X', document_cnpj: '11.222.333/0001-00' })
    expect(badDoc.status).toBe(400)
    expect((await badDoc.json()).fieldErrors).toMatchObject({ document_cnpj: 'Invalid CNPJ: check the numbers' })
    expect(state.service.calls).toEqual([])
    expect(state.db.calls.filter((c: Call) => c.op !== 'select')).toEqual([])
  })
})
