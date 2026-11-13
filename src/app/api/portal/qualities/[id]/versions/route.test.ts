import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { seededDb, type Row } from '@/lib/quality-spec/__fixtures__/seeded-db'
import { specToday } from '@/lib/quality-spec/pick-version'

const m = vi.hoisted(() => ({ gate: null as any, need: null as any, send: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_r: unknown, need: unknown) => { m.need = need; return m.gate },
}))
vi.mock('@/lib/portal/spec-change-email', () => ({ sendSpecChangeEmail: m.send }))

import { POST } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const V1 = '22222222-2222-4222-8222-222222222222'
const NEW = '33333333-3333-4333-8333-333333333333'

let rows: Record<string, Row[]>
let rpcResult: { data: unknown; error: unknown } | null
let db: ReturnType<typeof seededDb>

function setup() {
  rows = {
    client_qualities: [
      { id: 'q1', client_id: CO, custom_name: 'GC17', origin: 'Brazil', is_active: true, template: null },
      { id: 'q2', client_id: 'other-company', custom_name: 'Not mine', origin: 'Peru', is_active: true, template: null },
    ],
    client_quality_versions: [
      { id: V1, client_quality_id: 'q1', version_no: 1, effective_from: '2000-01-01', source: 'migration', applied_at: '2026-01-01T00:00:00Z', cancelled_at: null, spec: { template: { parameters: { max_quakers: 8 } } } },
    ],
  }
  rpcResult = null
  db = seededDb(rows, {
    rpc: (_fn, args) => {
      if (rpcResult) return rpcResult
      rows.client_quality_versions.push({
        id: NEW, client_quality_id: args.p_client_quality_id, version_no: 2, effective_from: args.p_effective_from,
        source: 'client', applied_at: null, cancelled_at: null, spec: { template: { parameters: args.p_parameters } },
      })
      return { data: NEW, error: null }
    },
  })
}

const gateOk = (over: Record<string, unknown> = {}) => ({
  ok: true,
  ctx: { admin: db, companyId: CO, userId: 'u1', keys: { views: ['qc_specs'], capabilities: ['qc_spec_edit'] }, isCompanyAdmin: false, isStaffViewAs: false, ...over },
})
const req = (body: unknown) =>
  ({ url: `http://x/api/portal/qualities/q1/versions?company=${CO}`, method: 'POST', json: async () => body }) as any
const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) })
const valid = (over: Row = {}) => ({ baseVersionId: V1, parameters: { max_quakers: 5 }, effectiveFrom: 'now', note: 'Tighter', ...over })

beforeEach(() => {
  setup()
  m.gate = gateOk()
  m.send.mockReset().mockResolvedValue(true)
})

describe('POST /api/portal/qualities/[id]/versions', () => {
  it('asks for qc_specs and qc_spec_edit', async () => {
    await POST(req(valid()), ctxFor('q1'))
    expect(m.need).toEqual({ view: 'qc_specs', capability: 'qc_spec_edit' })
  })

  it("effectiveFrom 'now' inserts with today's Sao Paulo date and answers 201", async () => {
    const res = await POST(req(valid()), ctxFor('q1'))
    expect(res.status).toBe(201)
    expect(db.rpcCalls).toEqual([{
      fn: 'insert_client_quality_version',
      args: { p_client_quality_id: 'q1', p_base_version_id: V1, p_parameters: { max_quakers: 5 }, p_effective_from: specToday(), p_user: 'u1', p_note: 'Tighter' },
    }])
    expect(await res.json()).toEqual({ versionId: NEW, versionNo: 2, effectiveFrom: specToday(), notified: true })
    expect(m.send).toHaveBeenCalledWith(NEW, db)
  })

  it('a dated change passes the date through', async () => {
    await POST(req(valid({ effectiveFrom: '2099-03-01', note: undefined })), ctxFor('q1'))
    expect(db.rpcCalls[0].args).toMatchObject({ p_effective_from: '2099-03-01', p_note: null })
  })

  it('a failed email never fails the request', async () => {
    m.send.mockResolvedValue(false)
    const res = await POST(req(valid()), ctxFor('q1'))
    expect(res.status).toBe(201)
    expect((await res.json()).notified).toBe(false)
  })

  it("first applies this quality's due but unapplied version, so the midnight-06:00 window takes a new change", async () => {
    const today = specToday()
    rows.client_quality_versions.push(
      { id: 'due', client_quality_id: 'q1', version_no: 2, effective_from: today, source: 'client', applied_at: null, cancelled_at: null },
      { id: 'due-other', client_quality_id: 'q2', version_no: 2, effective_from: today, source: 'client', applied_at: null, cancelled_at: null },
      { id: 'later', client_quality_id: 'q1', version_no: 9, effective_from: '2099-01-01', source: 'client', applied_at: null, cancelled_at: '2026-01-01T00:00:00Z' },
    )
    db = seededDb(rows, {
      rpc: (fn, args) => {
        if (fn === 'apply_client_quality_version') {
          Object.assign(rows.client_quality_versions.find((v) => v.id === args.p_version_id)!, { applied_at: new Date().toISOString() })
          return { data: null, error: null }
        }
        return { data: NEW, error: null }
      },
    })
    m.gate = gateOk()
    const res = await POST(req(valid()), ctxFor('q1'))
    expect(res.status).toBe(201)
    expect(db.rpcCalls.map((c) => [c.fn, c.args.p_version_id ?? c.args.p_client_quality_id])).toEqual([
      ['apply_client_quality_version', 'due'],
      ['insert_client_quality_version', 'q1'],
    ])
  })

  it('a failed apply is logged and the insert still decides', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    rows.client_quality_versions.push({ id: 'due', client_quality_id: 'q1', version_no: 2, effective_from: specToday(), source: 'client', applied_at: null, cancelled_at: null })
    db = seededDb(rows, {
      rpc: (fn) => (fn === 'apply_client_quality_version'
        ? { data: null, error: { message: 'not_a_private_copy' } }
        : { data: null, error: { message: 'pending_change' } }),
    })
    m.gate = gateOk()
    const res = await POST(req(valid()), ctxFor('q1'))
    expect(res.status).toBe(409)
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(['apply_client_quality_version', 'insert_client_quality_version'])
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('pending_change is 409 naming the scheduled date', async () => {
    rows.client_quality_versions.push({ id: 'pend', client_quality_id: 'q1', version_no: 2, effective_from: '2026-12-01', source: 'client', applied_at: null, cancelled_at: null })
    rpcResult = { data: null, error: { code: 'P0001', message: 'pending_change' } }
    const res = await POST(req(valid()), ctxFor('q1'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'A change is already scheduled for 1 December 2026. Cancel it before making another.' })
    expect(m.send).not.toHaveBeenCalled()
  })

  it('stale_base is 409', async () => {
    rpcResult = { data: null, error: { code: 'P0001', message: 'stale_base' } }
    const res = await POST(req(valid()), ctxFor('q1'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'This specification was changed by someone else. Reload to see the latest version.' })
  })

  it('past_date and invalid_parameters are 400, not_found 404, anything else 500', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const [message, status] of [['past_date', 400], ['invalid_parameters', 400], ['not_found', 404], ['boom', 500]] as const) {
      setup(); m.gate = gateOk()
      rpcResult = { data: null, error: { code: 'P0001', message } }
      expect((await POST(req(valid()), ctxFor('q1'))).status).toBe(status)
    }
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('400 for a bad date, non-object parameters, a bad base id or a body that is not JSON', async () => {
    for (const body of [
      valid({ effectiveFrom: '2026-02-30' }),
      valid({ effectiveFrom: 'tomorrow' }),
      valid({ parameters: [1, 2] }),
      valid({ parameters: null }),
      valid({ parameters: 'x' }),
      valid({ baseVersionId: 'v1' }),
      valid({ note: 5 }),
    ]) {
      expect((await POST(req(body), ctxFor('q1'))).status).toBe(400)
    }
    const notJson = { url: `http://x/api/portal/qualities/q1/versions?company=${CO}`, method: 'POST', json: async () => { throw new SyntaxError('bad') } } as any
    expect((await POST(notJson, ctxFor('q1'))).status).toBe(400)
    expect(db.rpcCalls).toHaveLength(0)
  })

  it("404 for another company's quality", async () => {
    expect((await POST(req(valid()), ctxFor('q2'))).status).toBe(404)
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('the staff view-as gets 403', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'The staff view of the portal is read-only' }, { status: 403 }) }
    expect((await POST(req(valid()), ctxFor('q1'))).status).toBe(403)
    m.gate = gateOk({ isStaffViewAs: true })
    expect((await POST(req(valid()), ctxFor('q1'))).status).toBe(403)
    expect(db.rpcCalls).toHaveLength(0)
  })
})
