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

type Call = { table: string; op: string; args: any[]; filters: any[]; returned?: string[] }
type Opts = {
  /** `table.op` -> the error that write returns. */
  fail?: Record<string, { code?: string; message?: string }>
  /** `table.op` -> how many of those writes match no row (what RLS, or a concurrent change under a guard, does). */
  zeroRows?: Record<string, number>
  /** Row visibility for this client (an RLS stand-in); every row when absent. */
  visible?: (table: string, row: any, tables: Record<string, any[]>) => boolean
}

const unaccentLower = (v: unknown) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** PostgREST `or=(col.ilike.pat,...)`, ilike terms only. `x_search` is derived from `x`, as the generated columns are. */
function orMatches(expr: string) {
  const terms = expr.split(',').map((t) => {
    const [col, op, ...rest] = t.split('.')
    const pattern = rest.join('.')
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')
    return { col, op, re }
  })
  return (row: any) => terms.some(({ col, op, re }) => {
    if (op !== 'ilike') return true
    const value = col.endsWith('_search') && row[col] === undefined ? unaccentLower(row[col.slice(0, -'_search'.length)]) : row[col]
    return value != null && re.test(String(value))
  })
}

/**
 * A small in-memory Supabase stand-in. eq / neq / is / in filter rows, and so
 * do ilike terms inside `or`. Inserts are stored with an id; upsert honours
 * onConflict and ignoreDuplicates; update and delete apply to the rows their
 * filters match and resolve to them. Every read and write is recorded with
 * its filters. Two clients may share one `tables` object (the same database).
 */
function fakeDb(tables: Record<string, any[]>, opts: Opts = {}) {
  const calls: Call[] = []
  const zeroLeft = { ...(opts.zeroRows ?? {}) }
  let seq = 0
  const from = (table: string) => {
    const store = (tables[table] ??= [])
    let rows = opts.visible ? store.filter((r) => opts.visible!(table, r, tables)) : [...store]
    let head = false
    let written: any[] | null = null
    let mode: 'read' | 'update' | 'delete' = 'read'
    let patch: any = null
    let error: any = null
    let zero = false
    let call: Call | null = null
    const write = (op: string, args: any[]) => {
      call = { table, op, args, filters: [] }
      calls.push(call)
      error = opts.fail?.[`${table}.${op}`] ?? null
      const key = `${table}.${op}`
      zero = (zeroLeft[key] ?? 0) > 0
      if (zero) zeroLeft[key] -= 1
    }
    const filter = (kind: string, col: string, v: unknown, keep: (r: any) => boolean) => {
      call?.filters.push([kind, col, v])
      rows = rows.filter(keep)
      return q
    }
    const result = (): any[] | null => {
      if (error) return null
      if (zero) return []
      if (mode === 'update') { rows.forEach((r) => Object.assign(r, patch)); return rows }
      if (mode === 'delete') {
        for (const r of rows) store.splice(store.indexOf(r), 1)
        return rows
      }
      const out = written ?? rows
      if (call?.op === 'select') call.returned = out.map((r) => r.id)
      return out
    }
    const q: any = {
      select: (s?: string, o?: { head?: boolean }) => {
        head = !!o?.head
        // A read starts with select; after a write, select only shapes the result.
        if (!call) { call = { table, op: 'select', args: [s], filters: [] }; calls.push(call) }
        return q
      },
      // `alias.col` filters an embedded resource: with !inner the parent row stays only when one embedded row matches.
      eq: (c: string, v: unknown) => filter('eq', c, v, (r) => {
        const [alias, col] = c.split('.')
        return col === undefined ? r[c] === v : (Array.isArray(r[alias]) ? r[alias] : []).some((e: any) => e[col] === v)
      }),
      neq: (c: string, v: unknown) => filter('neq', c, v, (r) => r[c] !== v),
      is: (c: string, v: unknown) => filter('is', c, v, (r) => (r[c] ?? null) === v),
      in: (c: string, vs: unknown[]) => filter('in', c, vs, (r) => vs.includes(r[c])),
      ilike: (c: string, v: string) => filter('ilike', c, v, (r) => String(r[c]).toLowerCase() === v.toLowerCase()),
      or: (expr: string) => { call?.filters.push(['or', expr]); rows = rows.filter(orMatches(expr)); return q },
      order: () => q, range: () => q, limit: () => q, overlaps: () => q,
      maybeSingle: async () => {
        const d = result()
        return { data: d ? d[0] ?? null : null, error }
      },
      single: async () => {
        const d = result()
        if (!d) return { data: null, error }
        return d[0] ? { data: d[0], error: null } : { data: null, error: { code: 'PGRST116' } }
      },
      insert: (p: any) => {
        write('insert', [p])
        if (error) return q
        written = (Array.isArray(p) ? p : [p]).map((x: any) => ({ id: `${table}-${++seq}`, ...x }))
        store.push(...written)
        return q
      },
      upsert: (p: any, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        write('upsert', [p, o])
        if (error) return q
        const keys = String(o?.onConflict ?? 'id').split(',')
        written = []
        for (const x of Array.isArray(p) ? p : [p]) {
          const hit = store.find((r) => keys.every((k) => r[k] === x[k]))
          if (hit && o?.ignoreDuplicates) continue
          if (hit) { Object.assign(hit, x); written.push(hit); continue }
          const row = { id: `${table}-${++seq}`, ...x }
          store.push(row)
          written.push(row)
        }
        return q
      },
      update: (p: any) => { write('update', [p]); mode = 'update'; patch = p; return q },
      delete: () => { write('delete', []); mode = 'delete'; return q },
      then: (resolve: any, reject: any) => {
        const d = result()
        const out = d === null ? { data: null, error } : head ? { count: d.length, data: null, error: null } : { data: d, error: null }
        return Promise.resolve(out).then(resolve, reject)
      },
    }
    return q
  }
  return { from, calls, tables, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }
}

/** companies_lab_scope_select for a confined lab: a company only with a company_labs row for the lab. */
const confinedRls = (lab: string) => (table: string, row: any, t: Record<string, any[]>) =>
  table !== 'companies' || (t.company_labs ?? []).some((l) => l.company_id === row.id && l.laboratory_id === lab)

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

describe('GET /api/clients: a confined laboratory lists only the clients it set up', () => {
  const list = async (qs = '') => {
    const res = await GET({ nextUrl: new URL(`http://x/api/clients${qs}`) } as any)
    return (await res.json()).clients as Array<{ id: string }>
  }
  const rows = () => [
    { ...company([{ laboratory_id: HQ }]), id: 'co-hq-only' },
    { ...company([{ laboratory_id: HQ }, { laboratory_id: CO }]), id: 'co-both' },
  ]
  const innerSelects = (db: any) => db.calls.filter((c: Call) => c.table === 'companies' && /!inner/.test(String(c.args[0])))
  const labFilters = (db: any) => db.calls.flatMap((c: Call) => c.filters).filter((f: any[]) => f[1] === 'qc_settings.laboratory_id')

  it('makes the settings embed inner and filters it to the own laboratory, on the list and on the count', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: rows() })
    expect((await list()).map((c) => c.id)).toEqual(['co-both'])
    expect(innerSelects(state.db)).toHaveLength(2)
    expect(labFilters(state.db)).toEqual([['eq', 'qc_settings.laboratory_id', CO], ['eq', 'qc_settings.laboratory_id', CO]])
    for (const c of innerSelects(state.db)) {
      expect(String(c.args[0])).toContain('qc_client_settings!qc_client_settings_company_id_fkey!inner(')
    }
  })

  it('keeps the inner join and the filter on the retry without the final-word columns', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: rows() })
    const sel = state.db.from
    let first = true
    state.db.from = (t: string) => {
      const q = sel(t)
      if (t !== 'companies') return q
      const orig = q.select
      q.select = (s?: string, o?: any) => {
        const r = orig(s, o)
        if (first && !o?.head) { first = false; q.then = (res: any) => Promise.resolve({ data: null, error: { code: '42703' } }).then(res) }
        return r
      }
      return q
    }
    await list()
    const selects = innerSelects(state.db).map((c: Call) => String(c.args[0]))
    expect(selects.length).toBeGreaterThanOrEqual(2)
    expect(selects.every((s: string) => s.includes('!inner('))).toBe(true)
    expect(labFilters(state.db).length).toBeGreaterThanOrEqual(2)
  })

  it('does not touch is_qc_client=all or =false', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: rows() })
    await list('?is_qc_client=all')
    await list('?is_qc_client=false')
    expect(innerSelects(state.db)).toEqual([])
    expect(labFilters(state.db)).toEqual([])
  })

  it('leaves an HQ user, a global admin and a user with no laboratory unfiltered', async () => {
    for (const scope of [
      { ownLabId: HQ, isGlobal: false, isHq: true },
      { ownLabId: CO, isGlobal: true, isHq: false },
      { ownLabId: null, isGlobal: false, isHq: false },
    ]) {
      state.scope = scope
      state.db = fakeDb({ companies: rows() })
      expect(await list()).toHaveLength(2)
      expect(innerSelects(state.db)).toEqual([])
      expect(labFilters(state.db)).toEqual([])
    }
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
    const settings = writes(state.db, 'qc_client_settings')
    expect(settings).toHaveLength(1)
    expect(settings[0].op).toBe('insert')
    expect(settings[0].args[0]).toMatchObject({ company_id: 'co-ahold', laboratory_id: CO })
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
    expect(writes(state.db, 'qc_client_settings')).toEqual([])
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

  it('a confined lab that matches a company it cannot see links it: company_labs created_company false, no companies insert', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    // One database: the service role sees everything, Colombia's session only what company_labs gives it.
    const shared = { companies: [ahold({ name: 'AHOLD DELHAIZE B.V.', is_qc_client: false })] }
    state.service = fakeDb(shared)
    state.db = fakeDb(shared, { visible: confinedRls(CO) })
    expect(confinedRls(CO)('companies', shared.companies[0], shared)).toBe(false)
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
      bank_accounts: [{ account_number: '1', account_type: 'corrente', pix_key: 'a@b.co' }],
    })
    expect(res.status).toBe(200)
    const accounts = writes(state.db, 'company_bank_accounts').filter((c: Call) => c.op === 'insert')
    expect(accounts).toHaveLength(1)
    expect(accounts[0].args[0]).toMatchObject({ account_number: '1', account_type: null, pix_key: null, pix_key_type: null })
    expect(Object.keys(await res.json()).sort()).toEqual(['client', 'message', 'upgraded'])
  })

  it('an account that fails the linked record country is refused before anything is written', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold({ country: 'Colombia' })] })
    state.db = fakeDb({ companies: [ahold({ country: 'Colombia' })], qc_client_settings: [] })
    // Valid for Brazil (the body's country), not for the matched Colombian record: PIX only.
    const res = await post({
      name: 'Ahold Delhaize', company: 'Ahold', country: 'Brazil',
      bank_accounts: [{ account_number: '1' }, { pix_key: 'only@pix.co' }],
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Bank account 2: Enter the account number')
    expect(writes(state.service, 'company_labs')).toEqual([])
    expect(state.service.calls.filter((c: Call) => c.op !== 'select')).toEqual([])
    expect(state.db.calls).toEqual([])
  })

  it('400 for an invalid holder CPF, company CNPJ or company field, before anything is read or written', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: [] })
    const badHolder = await post({ name: 'X Co', company: 'X', titulares: [{ person_type: 'F', name: 'Joao', cpf_cnpj: '111' }] })
    expect(badHolder.status).toBe(400)
    const badDoc = await post({ name: 'X Co', company: 'X', document_cnpj: '11.222.333/0001-00' })
    expect(badDoc.status).toBe(400)
    expect((await badDoc.json()).fieldErrors).toMatchObject({ document_cnpj: 'Invalid CNPJ: check the numbers' })
    const badField = await post({ name: 'X Co', company: 'X', email: 42 })
    expect(badField.status).toBe(400)
    expect((await badField.json()).fieldErrors).toEqual({ email: 'Must be text' })
    const badHolderAccounts = await post({ name: 'X Co', company: 'X', titulares: [{ person_type: 'J', name: 'H', bank_accounts: {} }] })
    expect(badHolderAccounts.status).toBe(400)
    expect(state.service.calls).toEqual([])
    expect(state.db.calls).toEqual([])
  })
})

describe('POST /api/clients: the linked company is flagged, reactivated and tagged (A, R1, R2)', () => {
  const ahold = (over: Record<string, unknown> = {}) => ({ ...company([]), ...over })

  it('a confined link of an inactive, untagged, non-QC company ends active, tagged and is_qc_client, in one service-role write', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    const row = ahold({ is_qc_client: false, is_active: false, company_types: [], trading_roles: [] })
    const shared: Record<string, any[]> = { companies: [row], qc_client_settings: [] }
    state.service = fakeDb(shared)
    state.db = fakeDb(shared, { visible: confinedRls(CO) })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', client_types: ['exporter'] })
    expect(res.status).toBe(200)

    const flip = writes(state.service, 'companies')
    expect(flip).toHaveLength(1)
    expect(flip[0]).toMatchObject({
      op: 'update',
      args: [{ is_qc_client: true, is_active: true, company_types: ['exporter'], trading_roles: ['seller'] }],
      filters: [['eq', 'id', 'co-ahold'], ['eq', 'updated_at', '2026-01-01']],
    })
    expect(row).toMatchObject({ is_qc_client: true, is_active: true, company_types: ['exporter'], trading_roles: ['seller'] })
    // The lab only linked it: its session never updates the shared row.
    expect(writes(state.db, 'companies')).toEqual([])
    expect((await res.json()).message).toBe(
      'Existing company enrolled as a QC client of this laboratory, reactivated and given the new role tags',
    )
  })

  it('an allowed tag is merged: appended after what the company has, which stays as it is', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    const row = ahold({ company_types: ['trader'], trading_roles: ['buyer'] })
    const shared: Record<string, any[]> = { companies: [row], qc_client_settings: [] }
    state.service = fakeDb(shared)
    state.db = fakeDb(shared, { visible: confinedRls(CO) })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', client_types: ['roaster'] })
    expect(res.status).toBe(200)
    expect(writes(state.service, 'companies')[0].args[0]).toEqual({ company_types: ['trader', 'roaster'] })
    expect(row).toMatchObject({ company_types: ['trader', 'roaster'], trading_roles: ['buyer'] })
  })

  it('a role QC may not set that the company already carries is kept untouched by the merge', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    // Out of order and with roles no QC body may send: all of it stays, in place.
    const row = ahold({ company_types: ['multinational', 'trader'], trading_roles: ['co_broker', 'internal_market', 'buyer'] })
    const shared: Record<string, any[]> = { companies: [row], qc_client_settings: [] }
    state.service = fakeDb(shared)
    state.db = fakeDb(shared, { visible: confinedRls(CO) })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', client_types: ['exporter'] })
    expect(res.status).toBe(200)
    expect(writes(state.service, 'companies')[0].args[0]).toEqual({
      company_types: ['multinational', 'trader', 'exporter'],
      trading_roles: ['co_broker', 'internal_market', 'buyer', 'seller'],
    })
  })

  it('a stored role value that is not a list is never rewritten', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    const row = ahold({ company_types: ['trader'], trading_roles: { legacy: 'buyer' } })
    const shared: Record<string, any[]> = { companies: [row], qc_client_settings: [] }
    state.service = fakeDb(shared)
    state.db = fakeDb(shared, { visible: confinedRls(CO) })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', client_types: ['exporter'] })
    expect(res.status).toBe(200)
    expect(writes(state.service, 'companies')[0].args[0]).toEqual({ company_types: ['trader', 'exporter'] })
    expect(row.trading_roles).toEqual({ legacy: 'buyer' })
  })

  it('already set (a concurrent request got there first) is success, with no write', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    // The session read before the step still saw it unflagged and inactive; the fresh read sees it done.
    state.service = fakeDb({ companies: [ahold({ is_qc_client: true, is_active: true, company_types: ['exporter'], trading_roles: ['seller'] })] })
    state.db = fakeDb({ companies: [ahold({ is_qc_client: false, is_active: false })], qc_client_settings: [] })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', client_types: ['exporter'] })
    expect(res.status).toBe(200)
    expect(writes(state.service, 'companies')).toEqual([])
    // Nothing taken back.
    expect(writes(state.service, 'company_labs').map((c: Call) => c.op)).toEqual(['upsert'])
    expect(writes(state.service, 'qc_client_settings')).toEqual([])
  })

  it('a change between the read and the guarded write is read again, not overwritten and not a failure', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold({ is_qc_client: false })] }, { zeroRows: { 'companies.update': 1 } })
    state.db = fakeDb({ companies: [ahold({ is_qc_client: false })], qc_client_settings: [] })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold' })
    expect(res.status).toBe(200)
    expect(writes(state.service, 'companies').map((c: Call) => c.op)).toEqual(['update', 'update'])
    expect(writes(state.service, 'company_labs').map((c: Call) => c.op)).toEqual(['upsert'])
  })

  it('the message says only what happened', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold()] })
    state.db = fakeDb({ companies: [ahold()] })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', is_qc_client: false })
    expect(res.status).toBe(200)
    expect(writes(state.service, 'companies')).toEqual([])
    expect((await res.json()).message).toBe('Existing company found: nothing on it needed changing')
  })

  it('a session update that matches no row is a failure, and the step after it never runs', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    // This lab's settings row from before, on a company not flagged yet: updated, and RLS hides it.
    state.service = fakeDb({ companies: [ahold({ is_qc_client: false })] })
    state.db = fakeDb(
      { companies: [ahold({ is_qc_client: false })], qc_client_settings: [{ company_id: 'co-ahold', laboratory_id: HQ }] },
      { zeroRows: { 'qc_client_settings.update': 1 } },
    )
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', pricing_model: 'per_sample' })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Failed to attach QC settings to existing company')
    // The row existed before: never deleted. The flag step is last, so it never ran.
    expect(writes(state.service, 'qc_client_settings')).toEqual([])
    expect(writes(state.service, 'companies')).toEqual([])
  })
})

describe('POST /api/clients: only the roles the QC form can send (G1)', () => {
  const ahold = (over: Record<string, unknown> = {}) => ({ ...company([]), ...over })

  it.each([
    ['trading_roles', ['co_broker']],
    ['trading_roles', ['freight_forwarder']],
    ['trading_roles', ['internal_market']],
    ['trading_roles', ['seller', 'qc_client']],
    ['company_types', ['multinational']],
    ['client_types', ['service_provider']],
    ['client_types', ['co_broker']],
    ['trading_roles', 'co_broker'],
  ])('%s %j: 400 Unknown company role, before any service-role call or write', async (key, value) => {
    for (const scope of [
      { ownLabId: CO, isGlobal: false, isHq: false },
      { ownLabId: HQ, isGlobal: false, isHq: true },
    ]) {
      state.scope = scope
      state.service = fakeDb({ companies: [ahold()] })
      state.db = fakeDb({ companies: [ahold()] })
      // A role problem wins even when the body has another one.
      const res = await post({ name: 'Ahold Delhaize', company: 'Ahold', email: 42, [key]: value })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Unknown company role', fieldErrors: { [key]: 'Unknown company role' } })
      expect(state.service.calls).toEqual([])
      expect(state.db.calls).toEqual([])
    }
  })

  it('the tags the form sends pass, given directly or as client types', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.db = fakeDb({ companies: [] })
    const res = await post({
      name: 'Fazenda Boa Vista', company: 'Boa Vista', is_qc_client: false,
      client_types: ['producer', 'cooperative', 'exporter', 'importer_buyer', 'roaster', 'final_buyer', 'end_client'],
    })
    expect(res.status).toBe(201)
    const direct = await post({
      name: 'Fazenda Boa Nova', company: 'Boa Nova', is_qc_client: false, company_types: ['farm'], trading_roles: ['seller'],
    })
    expect(direct.status).toBe(201)
  })
})

describe('POST /api/clients: tax ids in any format (I1)', () => {
  const ahold = (over: Record<string, unknown> = {}) => ({ ...company([]), ...over })
  // The candidate reads (in / or), not the settle step's read by id.
  const candidateReads = () =>
    state.service.calls.filter((c: Call) => c.table === 'companies' && c.op === 'select' && ['in', 'or'].includes(c.filters[0]?.[0]))
  const companyReads = () => candidateReads().map((c: Call) => c.filters)

  it('sends the tax-id variants, the tax-id digits spread, and both name reads', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.db = fakeDb({ companies: [] })
    await post({ name: 'Ahold Delhaize', company: 'Ahold', document_cnpj: '11222333000181', is_qc_client: false })
    expect(companyReads()).toEqual([
      [['in', 'document_cnpj', ['11.222.333/0001-81', '11222333000181']]],
      [['in', 'vat_number', ['11.222.333/0001-81', '11222333000181']]],
      [['or', 'vat_number.ilike.%1%1%2%2%2%3%3%3%0%0%0%1%8%1%']],
      [['or', 'name_search.ilike.%delhaize%,fantasy_name_search.ilike.%delhaize%']],
      [['or', 'name_search.ilike.%ahold%delhaize%,fantasy_name_search.ilike.%ahold%delhaize%']],
    ])
  })

  it('a tax id that is not a CPF or CNPJ length is also looked for in document_cnpj', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.db = fakeDb({ companies: [] })
    await post({ name: 'Cafe de Colombia', company: 'X', country: 'Colombia', vat_number: '900123456-7', is_qc_client: false })
    expect(companyReads()).toContainEqual([
      ['or', 'vat_number.ilike.%9%0%0%1%2%3%4%5%6%7%,document_cnpj.ilike.%9%0%0%1%2%3%4%5%6%7%'],
    ])
  })

  it.each([
    ['a bare NIT against a punctuated one', '9001234567', '900.123.456-7', 'Colombia'],
    ['a NIT with only its check digit split off', '900123456-7', '900.123.456-7', 'Colombia'],
    ['bare digits against a DK number', '12345678', 'DK12345678', 'Denmark'],
    ['a spaced DK number against a bare DK one', 'DK 12345678', 'DK12345678', 'Denmark'],
  ])('links %s, found by the spread digits alone', async (_label, typed, stored, country) => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    const row = ahold({ id: 'co-tax', name: 'Cafe del Norte SAS', fantasy_name: null, country, vat_number: stored })
    const shared: Record<string, any[]> = { companies: [row] }
    state.service = fakeDb(shared)
    state.db = fakeDb(shared, { visible: confinedRls(CO) })
    // A name nothing shares, so only the tax read can find it.
    const res = await post({ name: 'Totally Other Name', company: 'X', country, vat_number: typed, is_qc_client: false })
    expect(res.status).toBe(200)
    expect((await res.json()).client.id).toBe('co-tax')
    expect(writes(state.db, 'companies')).toEqual([])
    const found = candidateReads().filter((c: Call) => c.returned?.includes('co-tax'))
    expect(found).toHaveLength(1)
    expect(found[0].filters[0][0]).toBe('or')
    expect(found[0].filters[0][1]).toMatch(/^vat_number\.ilike\.%/)
  })

  it('a compound "NL… / EORI: NL…" value is fetched by the spread read but never linked by accident', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.service = fakeDb({
      companies: [ahold({ id: 'co-nl', name: 'Dutch Roasters BV', fantasy_name: null, vat_number: 'NL123456789B01 / EORI: NL123456789' })],
    })
    state.db = fakeDb({ companies: [] })
    const res = await post({ name: 'Another Dutch Company', company: 'X', country: 'Netherlands', vat_number: 'NL123456789B01', is_qc_client: false })
    expect(res.status).toBe(201)
    expect(JSON.stringify(await res.json())).not.toContain('co-nl')
    // It was a candidate (the spread digits are in it), and decideCompanyMatch still said no.
    expect(candidateReads().some((c: Call) => c.returned?.includes('co-nl'))).toBe(true)
  })
})

describe('POST /api/clients: a failure after a confined link takes the link back (D)', () => {
  const ahold = (over: Record<string, unknown> = {}) => ({ ...company([]), ...over })

  it('settings row fails: the company_labs row this request created is deleted, the error returned', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold()] })
    state.db = fakeDb({ companies: [ahold()], qc_client_settings: [] }, { fail: { 'qc_client_settings.insert': { code: '23514', message: 'bad settings' } } })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold' })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Failed to attach QC settings to existing company')
    const [link, unlink] = writes(state.service, 'company_labs')
    expect(link.op).toBe('upsert')
    // Deleted by the id of the row this request inserted (the fake's first id).
    expect(unlink).toMatchObject({ op: 'delete', filters: [['eq', 'id', 'company_labs-1']] })
    expect(state.service.tables.company_labs).toEqual([])
    expect(writes(state.db, 'companies')).toEqual([])
  })

  it('a holder fails after an account was saved: the account and the link are deleted, nothing else', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold({ is_qc_client: false })], company_bank_accounts: [], company_titulares: [] })
    state.db = fakeDb(
      { companies: [ahold({ is_qc_client: false })], qc_client_settings: [] },
      { fail: { 'company_titulares.insert': { code: '42501', message: 'rls' } } },
    )
    const res = await post({
      name: 'Ahold Delhaize', company: 'Ahold', is_qc_client: false,
      bank_accounts: [{ account_number: '1' }],
      titulares: [{ person_type: 'J', name: 'Holder' }],
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Holder 1: Not allowed')
    const accountId = state.db.tables.company_bank_accounts[0].id
    const undoAccounts = writes(state.service, 'company_bank_accounts')
    expect(undoAccounts).toHaveLength(1)
    expect(undoAccounts[0]).toMatchObject({ op: 'delete', filters: [['in', 'id', [accountId]]] })
    expect(writes(state.service, 'company_titulares')).toEqual([])
    expect(writes(state.service, 'company_labs').map((c: Call) => c.op)).toEqual(['upsert', 'delete'])
    // Never flagged: the flip is the last step.
    expect(writes(state.service, 'companies')).toEqual([])
  })

  it('a company_labs row that existed before the request is never deleted', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    const before = { id: 'link-old', company_id: 'co-ahold', laboratory_id: CO, created_company: false }
    state.service = fakeDb({ companies: [ahold()], company_labs: [{ ...before }] })
    state.db = fakeDb(
      { companies: [ahold()], company_labs: [{ ...before }], qc_client_settings: [] },
      { fail: { 'qc_client_settings.insert': { code: 'XX000', message: 'boom' } } },
    )
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold' })
    expect(res.status).toBe(500)
    expect(writes(state.service, 'company_labs').map((c: Call) => c.op)).toEqual(['upsert'])
    expect(state.service.tables.company_labs).toEqual([before])
  })

  it('a confined create whose holder fails keeps the company and says so, with the company as the session reads it', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: [] }, { fail: { 'company_titulares.insert': { code: '42501', message: 'rls' } } })
    const res = await post({
      name: 'Fazenda Boa Vista', company: 'Boa Vista', is_qc_client: false,
      titulares: [{ person_type: 'J', name: 'Holder' }],
    })
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('The company was saved, but not all of its holders and bank accounts were (Holder 1: Not allowed). Finish it from the company panel.')
    expect(json.client.id).toBe(state.db.tables.companies[0].id)
    expect(writes(state.db, 'companies').map((c: Call) => c.op)).toEqual(['insert'])
    expect(writes(state.service, 'company_labs').map((c: Call) => c.op)).toEqual(['upsert'])
  })

  it('a 409 on the link path (the lab already has this client) also takes back the link it inserted', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.service = fakeDb({ companies: [ahold()], company_labs: [] })
    state.db = fakeDb({ companies: [ahold()], qc_client_settings: [{ company_id: 'co-ahold', laboratory_id: CO }] })
    const res = await post({ name: 'Ahold Delhaize', company: 'Ahold' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Duplicate client detected')
    expect(writes(state.service, 'company_labs').map((c: Call) => c.op)).toEqual(['upsert', 'delete'])
    expect(state.service.tables.company_labs).toEqual([])
    expect(writes(state.db, 'qc_client_settings')).toEqual([])
  })

  it('a confined create whose settings row fails says to add the client again (the panel is out of reach)', async () => {
    state.scope = { ownLabId: CO, isGlobal: false, isHq: false }
    state.db = fakeDb({ companies: [] }, { fail: { 'qc_client_settings.insert': { code: 'XX000', message: 'boom' } } })
    const res = await post({ name: 'Fazenda Boa Vista', company: 'Boa Vista' })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('The company was saved, but its QC settings were not. Add the client again: that picks up the saved company.')
    expect(json.error).not.toContain('company panel')
    // The company stays: a confined lab never deletes one.
    expect(writes(state.db, 'companies').map((c: Call) => c.op)).toEqual(['insert'])
  })

  it('HQ create whose settings row fails is rolled back as before', async () => {
    state.scope = { ownLabId: HQ, isGlobal: false, isHq: true }
    state.db = fakeDb({ companies: [] }, { fail: { 'qc_client_settings.insert': { code: 'XX000', message: 'boom' } } })
    const res = await post({ name: 'Fazenda Boa Vista', company: 'Boa Vista' })
    expect(res.status).toBe(500)
    expect((await res.json()).client).toBeUndefined()
    expect(writes(state.db, 'companies').map((c: Call) => c.op)).toEqual(['insert', 'delete'])
    expect(state.db.tables.companies).toEqual([])
  })
})
