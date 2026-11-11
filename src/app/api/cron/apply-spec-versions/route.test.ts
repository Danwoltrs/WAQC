import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seededDb } from '@/lib/quality-spec/__fixtures__/seeded-db'

const m = vi.hoisted(() => ({ send: vi.fn(), admin: null as any }))
vi.mock('@/lib/portal/spec-change-email', () => ({ sendSpecChangeEmail: m.send }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), portalServiceClient: () => m.admin }))

import { GET, dynamic } from './route'

const req = (auth?: string) => ({ headers: new Headers(auth ? { authorization: auth } : {}) }) as any

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 's3cret')
  m.send.mockReset().mockResolvedValue(true)
  m.admin = seededDb(
    {
      client_quality_versions: [
        { id: 'due', client_quality_id: 'q1', source: 'client', version_no: 2, effective_from: '2000-01-02', applied_at: null, notified_at: null, cancelled_at: null },
      ],
    },
    { rpc: () => ({ data: null, error: null }) },
  )
})

describe('GET /api/cron/apply-spec-versions', () => {
  it('is dynamic', () => {
    expect(dynamic).toBe('force-dynamic')
  })
  it('401 without Authorization: Bearer $CRON_SECRET', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect(m.admin.rpcCalls).toHaveLength(0)
    expect(m.send).not.toHaveBeenCalled()
  })
  it('applies due versions and sends pending emails with the secret', async () => {
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ applied: 1, notified: 1 })
    expect(m.admin.rpcCalls).toEqual([{ fn: 'apply_client_quality_version', args: { p_version_id: 'due' } }])
  })
})
