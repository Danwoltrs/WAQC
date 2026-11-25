import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * QC settings belong to a laboratory: the clients list shows the user's own
 * lab's row, and enrolling a company as a QC client from one lab never meets
 * another lab's settings row.
 */

const HQ = 'lab-hq'
const CO = 'lab-co'

const state = vi.hoisted(() => ({
  db: null as any,
  scope: { ownLabId: null as string | null, isGlobal: false, isHq: false },
}))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
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

/** A small in-memory Supabase stand-in: eq / ilike filters, writes recorded. */
function fakeDb(tables: Record<string, any[]>) {
  const calls: Call[] = []
  const from = (table: string) => {
    let rows = tables[table] ?? []
    let head = false
    const q: any = {
      select: (_s?: string, opts?: { head?: boolean }) => { head = !!opts?.head; return q },
      eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q },
      ilike: (col: string, v: string) => { rows = rows.filter((r) => String(r[col]).toLowerCase() === v.toLowerCase()); return q },
      order: () => q, range: () => q, limit: () => q, or: () => q, overlaps: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => (rows[0] ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } }),
      upsert: async (...args: any[]) => { calls.push({ table, op: 'upsert', args }); return { error: null } },
      insert: (...args: any[]) => { calls.push({ table, op: 'insert', args }); return { ...q, then: (r: any) => r({ error: null }), select: () => q } },
      update: (...args: any[]) => { calls.push({ table, op: 'update', args }); return { eq: async () => ({ error: null }) } },
      delete: () => ({ eq: async () => ({ error: null }) }),
      then: (resolve: any) =>
        resolve(head ? { count: rows.length, data: null, error: null } : { data: rows, error: null }),
    }
    return q
  }
  return { from, calls, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }
}

const company = (qc_settings: any[]) => ({
  id: 'co-ahold', name: 'Ahold Delhaize', fantasy_name: 'Ahold', email: null, phone: null, address: null,
  neighborhood: null, city: null, state: null, country: null, zip_code: null, vat_number: null,
  company_types: ['trader'], trading_roles: ['buyer'], is_qc_client: true, is_active: true,
  legacy_client_id: null, logo_url: null, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01',
  qc_settings,
})

const get = () => GET({ nextUrl: new URL('http://x/api/clients') } as any)
const post = (body: unknown) => POST({ json: async () => body } as any)

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

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
    state.db = fakeDb({
      companies: [company([{ laboratory_id: HQ }])],
      qc_client_settings: [{ company_id: 'co-ahold', laboratory_id: HQ }],
    })
    const res = await post(body)
    expect(res.status).toBe(409)
    expect(state.db.calls.filter((c: Call) => c.table === 'qc_client_settings')).toEqual([])
  })
})
