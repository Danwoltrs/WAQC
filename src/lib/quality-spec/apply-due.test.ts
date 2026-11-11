import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seededDb, type Row } from './__fixtures__/seeded-db'

const m = vi.hoisted(() => ({ send: vi.fn(), gateAdmin: null as any }))
vi.mock('@/lib/portal/spec-change-email', () => ({ sendSpecChangeEmail: m.send }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), portalServiceClient: () => m.gateAdmin }))

import { applyDueVersions, handleApplySpecVersionsCron } from './apply-due'

const TODAY = '2026-11-11'
const v = (over: Row): Row => ({
  client_quality_id: 'q1', source: 'client', version_no: 2, applied_at: null, notified_at: null, cancelled_at: null, ...over,
})

function rows(): Record<string, Row[]> {
  return {
    client_quality_versions: [
      v({ id: 'due', effective_from: '2026-11-11' }),
      v({ id: 'overdue', client_quality_id: 'q2', effective_from: '2026-11-01', notified_at: '2026-10-01T00:00:00Z' }),
      v({ id: 'future', client_quality_id: 'q3', effective_from: '2026-12-01' }),
      v({ id: 'cancelled', client_quality_id: 'q4', effective_from: '2026-11-01', cancelled_at: '2026-10-30T00:00:00Z' }),
      v({ id: 'applied', client_quality_id: 'q5', effective_from: '2026-11-01', applied_at: '2026-11-01T09:00:00Z', notified_at: '2026-10-01T00:00:00Z' }),
      v({ id: 'today-failed-email', client_quality_id: 'q6', effective_from: '2026-11-11', applied_at: '2026-11-11T13:00:00Z' }),
      v({ id: 'migration', client_quality_id: 'q7', source: 'migration', effective_from: '2000-01-01', applied_at: '2026-01-01T00:00:00Z' }),
      v({ id: 'wolthers', client_quality_id: 'q8', source: 'wolthers', effective_from: '2026-11-10', applied_at: '2026-11-10T00:00:00Z' }),
    ],
  }
}

beforeEach(() => {
  m.send.mockReset().mockResolvedValue(true)
})

describe('applyDueVersions', () => {
  it('applies due versions that are neither applied nor cancelled', async () => {
    const db = seededDb(rows(), { rpc: () => ({ data: null, error: null }) })
    const res = await applyDueVersions(db as any, TODAY)
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(['apply_client_quality_version', 'apply_client_quality_version'])
    expect(db.rpcCalls.map((c) => c.args.p_version_id).sort()).toEqual(['due', 'overdue'])
    expect(res.applied).toBe(2)
  })

  it('sends every client version not yet notified and not cancelled, including today’s failed email', async () => {
    const db = seededDb(rows(), { rpc: () => ({ data: null, error: null }) })
    const res = await applyDueVersions(db as any, TODAY)
    const sent = m.send.mock.calls.map((c) => c[0]).sort()
    expect(sent).toEqual(['due', 'future', 'today-failed-email'])
    expect(m.send.mock.calls[0][1]).toBe(db)
    expect(res).toEqual({ applied: 2, notified: 3 })
  })

  it('one failed apply is logged and does not stop the rest', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = seededDb(rows(), {
      rpc: (_fn, args) => (args.p_version_id === 'overdue' ? { data: null, error: { message: 'not_a_private_copy' } } : { data: null, error: null }),
    })
    const res = await applyDueVersions(db as any, TODAY)
    expect(db.rpcCalls).toHaveLength(2)
    expect(res.applied).toBe(1)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('counts only emails that went out', async () => {
    m.send.mockImplementation(async (id: string) => id !== 'future')
    const db = seededDb(rows(), { rpc: () => ({ data: null, error: null }) })
    expect((await applyDueVersions(db as any, TODAY)).notified).toBe(2)
  })
})

describe('GET /api/cron/apply-spec-versions handler', () => {
  const req = (auth?: string) => ({ headers: new Headers(auth ? { authorization: auth } : {}) }) as any

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    m.gateAdmin = seededDb(rows(), { rpc: () => ({ data: null, error: null }) })
  })

  it('401 without the bearer secret', async () => {
    expect((await handleApplySpecVersionsCron(req())).status).toBe(401)
    expect((await handleApplySpecVersionsCron(req('Bearer wrong'))).status).toBe(401)
    expect(m.gateAdmin.rpcCalls).toHaveLength(0)
  })

  it('500 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await handleApplySpecVersionsCron(req('Bearer '))).status).toBe(500)
  })

  it('runs with the secret and returns the counts', async () => {
    const res = await handleApplySpecVersionsCron(req('Bearer s3cret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ applied: expect.any(Number), notified: expect.any(Number) })
    expect(typeof body.today).toBe('string')
  })
})
