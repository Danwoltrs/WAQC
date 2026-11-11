import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { seededDb, type Row } from '@/lib/quality-spec/__fixtures__/seeded-db'

const m = vi.hoisted(() => ({ gate: null as any, need: null as any, send: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_r: unknown, need: unknown) => { m.need = need; return m.gate },
}))
vi.mock('@/lib/portal/spec-change-email', () => ({ sendSpecChangeEmail: m.send }))

import { DELETE } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const PEND = '44444444-4444-4444-8444-444444444444'
const STARTED = '55555555-5555-4555-8555-555555555555'
const OTHER = '66666666-6666-4666-8666-666666666666'

let db: ReturnType<typeof seededDb>
const version = (over: Row): Row => ({ source: 'client', applied_at: null, cancelled_at: null, cancelled_by: null, cancel_note: null, notified_at: null, ...over })

beforeEach(() => {
  db = seededDb({
    client_qualities: [
      { id: 'q1', client_id: CO, custom_name: 'GC17', is_active: true, template: null },
      { id: 'q2', client_id: 'other-company', custom_name: 'Not mine', is_active: true, template: null },
    ],
    client_quality_versions: [
      version({ id: PEND, client_quality_id: 'q1', version_no: 2, effective_from: '2099-01-01' }),
      version({ id: STARTED, client_quality_id: 'q1', version_no: 3, effective_from: '2000-01-02' }),
      version({ id: OTHER, client_quality_id: 'q2', version_no: 2, effective_from: '2099-01-01' }),
    ],
    user_profiles: [{ id: 'u1', full_name: 'Ana Client', email: 'ana@client.com' }],
  })
  m.gate = { ok: true, ctx: { admin: db, companyId: CO, userId: 'u1', keys: { views: ['qc_specs'], capabilities: ['qc_spec_edit'] }, isCompanyAdmin: false, isStaffViewAs: false } }
  m.send.mockReset().mockResolvedValue(true)
})

const req = { url: `http://x/api/portal/qualities/q1/versions/v?company=${CO}`, method: 'DELETE' } as any
const ctxFor = (id: string, versionId: string) => ({ params: { id, versionId } })
const row = (id: string) => db.rows.client_quality_versions.find((v) => v.id === id)!

describe('DELETE /api/portal/qualities/[id]/versions/[versionId]', () => {
  it('cancels a pending future change, names who cancelled, and emails the cancellation', async () => {
    const res = await DELETE(req, ctxFor('q1', PEND))
    expect(m.need).toEqual({ view: 'qc_specs', capability: 'qc_spec_edit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cancelled: true, notified: true })
    expect(row(PEND).cancelled_at).toBeTruthy()
    expect(row(PEND).cancelled_by).toBe('u1')
    expect(row(PEND).cancel_note).toBe('Cancelled by Ana Client')
    expect(m.send).toHaveBeenCalledWith(PEND, db)
    const update = db.writes.find((w) => w.op === 'update')!
    expect(update.filters.map((f) => f.col).sort()).toEqual(['applied_at', 'cancelled_at', 'client_quality_id', 'effective_from', 'id'])
  })

  it('409 when the change has already started', async () => {
    const res = await DELETE(req, ctxFor('q1', STARTED))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'This change has already started or was cancelled.' })
    expect(row(STARTED).cancelled_at).toBeNull()
    expect(m.send).not.toHaveBeenCalled()
  })

  it('409 when already cancelled or applied', async () => {
    row(PEND).cancelled_at = '2026-11-01T00:00:00Z'
    expect((await DELETE(req, ctxFor('q1', PEND))).status).toBe(409)
    row(PEND).cancelled_at = null
    row(PEND).applied_at = '2026-11-01T00:00:00Z'
    expect((await DELETE(req, ctxFor('q1', PEND))).status).toBe(409)
  })

  it("404 for another company's quality or a version of another quality", async () => {
    expect((await DELETE(req, ctxFor('q2', OTHER))).status).toBe(404)
    expect((await DELETE(req, ctxFor('q1', OTHER))).status).toBe(404)
    expect(row(OTHER).cancelled_at).toBeNull()
  })

  it('a failed cancellation email is logged only', async () => {
    m.send.mockResolvedValue(false)
    const res = await DELETE(req, ctxFor('q1', PEND))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cancelled: true, notified: false })
  })

  it('the staff view-as gets 403', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'The staff view of the portal is read-only' }, { status: 403 }) }
    expect((await DELETE(req, ctxFor('q1', PEND))).status).toBe(403)
    m.gate = { ...m.gate, ok: true, ctx: { admin: db, companyId: CO, userId: 'u1', keys: { views: [], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: true } }
    expect((await DELETE(req, ctxFor('q1', PEND))).status).toBe(403)
    expect(row(PEND).cancelled_at).toBeNull()
  })
})
