import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The scheduled digest: parameters, configuration, the cron gate, and one
 * end-to-end run of the cron handler against a recording fake database with
 * the mail sender mocked.
 */

const h = vi.hoisted(() => {
  const sendMail = vi.fn(async (_params: unknown) => undefined)
  const calls: Array<{ table: string; ops: Array<{ op: string; args: unknown[] }> }> = []
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const rows: Record<string, unknown[]> = {}
  function fakeDb() {
    return {
      from(table: string) {
        const ops: Array<{ op: string; args: unknown[] }> = []
        calls.push({ table, ops })
        const builder: any = new Proxy(
          {},
          {
            get(_t, prop: string) {
              if (prop === 'then') {
                // A real promise underneath, so `.then(undefined, onError)` works too.
                return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                  Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject)
              }
              if (prop === 'insert') {
                return (row: Record<string, unknown>) => {
                  inserts.push({ table, row })
                  return builder
                }
              }
              return (...args: unknown[]) => {
                ops.push({ op: prop, args })
                return builder
              }
            },
          },
        )
        return builder
      },
    }
  }
  return { sendMail, calls, inserts, rows, fakeDb }
})

vi.mock('@/lib/graph/send', () => ({
  sendMail: h.sendMail,
  GraphSendError: class GraphSendError extends Error {},
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.fakeDb() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => h.fakeDb() }))

import {
  cronAuthorized,
  handleLabActivityCron,
  labActivityConfig,
  parseLabActivityParams,
} from './lab-activity-routes'

const ENV_KEYS = ['CRON_SECRET', 'LAB_ACTIVITY_REPORT_TO', 'LAB_ACTIVITY_REPORT_CADENCE', 'LAB_ACTIVITY_REPORT_BREAKDOWN', 'MICROSOFT_GRAPH_TEST_RECIPIENT', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  h.sendMail.mockClear()
  h.calls.length = 0
  h.inserts.length = 0
  for (const k of Object.keys(h.rows)) delete h.rows[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('labActivityConfig', () => {
  it('defaults to the trading desk, weekly, PSS approved / SS rejected', () => {
    expect(labActivityConfig({})).toEqual({ to: 'trading@wolthers.com', cadence: 'weekly', breakdown: 'pss_approved_ss_rejected' })
  })
  it('reads valid overrides and ignores invalid ones', () => {
    expect(labActivityConfig({ LAB_ACTIVITY_REPORT_TO: 'desk@wolthers.com', LAB_ACTIVITY_REPORT_CADENCE: 'monthly', LAB_ACTIVITY_REPORT_BREAKDOWN: 'full' }))
      .toEqual({ to: 'desk@wolthers.com', cadence: 'monthly', breakdown: 'full' })
    expect(labActivityConfig({ LAB_ACTIVITY_REPORT_TO: 'not an email', LAB_ACTIVITY_REPORT_CADENCE: 'daily', LAB_ACTIVITY_REPORT_BREAKDOWN: 'everything' }))
      .toEqual({ to: 'trading@wolthers.com', cadence: 'weekly', breakdown: 'pss_approved_ss_rejected' })
  })
})

describe('parseLabActivityParams', () => {
  const defaults = { to: 'trading@wolthers.com', cadence: 'weekly' as const, breakdown: 'pss_approved_ss_rejected' as const }
  const get = (params: Record<string, string>) => (k: string) => params[k] ?? null

  it('takes an explicit period and breakdown', () => {
    expect(parseLabActivityParams(get({ start_date: '2026-09-01', end_date: '2026-09-08', breakdown: 'full' }), defaults))
      .toEqual({ ok: true, period: { start: '2026-09-01', end: '2026-09-08' }, breakdown: 'full' })
  })
  it('falls back to the previous period of the configured cadence when no dates are given', () => {
    const r = parseLabActivityParams(get({}), { ...defaults, cadence: 'monthly' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.period.start.endsWith('-01')).toBe(true)
      expect(r.breakdown).toBe('pss_approved_ss_rejected')
    }
  })
  it('rejects a bad date, a reversed range, an unknown breakdown and a period over 400 days', () => {
    expect(parseLabActivityParams(get({ start_date: '2026-09-31', end_date: '2026-10-01' }), defaults)).toMatchObject({ ok: false })
    expect(parseLabActivityParams(get({ start_date: '2026-09-08', end_date: '2026-09-01' }), defaults)).toMatchObject({ ok: false })
    expect(parseLabActivityParams(get({ breakdown: 'weird' }), defaults)).toMatchObject({ ok: false })
    expect(parseLabActivityParams(get({ start_date: '2025-01-01', end_date: '2026-09-01' }), defaults)).toMatchObject({ ok: false })
  })
})

describe('cronAuthorized', () => {
  it('accepts only the exact bearer token, and nothing when no secret is configured', () => {
    expect(cronAuthorized('Bearer s3cret', 's3cret')).toBe(true)
    expect(cronAuthorized('Bearer s3cre', 's3cret')).toBe(false)
    expect(cronAuthorized('Bearer s3cretx', 's3cret')).toBe(false)
    expect(cronAuthorized(null, 's3cret')).toBe(false)
    expect(cronAuthorized('Bearer ', undefined)).toBe(false)
  })
})

const request = (headers: Record<string, string> = {}) =>
  ({ headers: new Headers(headers), nextUrl: new URL('http://localhost/api/cron/lab-activity-report') }) as any

describe('handleLabActivityCron', () => {
  it('refuses to run without a configured secret, and without the right one', async () => {
    expect((await handleLabActivityCron(request({ authorization: 'Bearer x' }))).status).toBe(500)
    process.env.CRON_SECRET = 'top'
    expect((await handleLabActivityCron(request())).status).toBe(401)
    expect((await handleLabActivityCron(request({ authorization: 'Bearer nope' }))).status).toBe(401)
    expect(h.sendMail).not.toHaveBeenCalled()
  })

  it('builds the previous period, emails the desk with the house CC, and logs the send', async () => {
    process.env.CRON_SECRET = 'top'
    h.rows.laboratories = [{ id: 'lab-1', name: 'Santos HQ', country: 'Brazil', is_active: true }]
    h.rows.certificates = [
      { id: 'c1', created_at: '2026-09-08T10:00:00Z', is_rejected: false, sample: { id: 's1', laboratory_id: 'lab-1', sample_type: 'pss' } },
    ]
    h.rows.samples = []

    const res = await handleLabActivityCron(request({ authorization: 'Bearer top' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, sent_to: ['trading@wolthers.com'], cc: ['wolthers@wolthers.com'], cadence: 'weekly', breakdown: 'pss_approved_ss_rejected', labs: 1, deleted: 0 })
    expect(body.subject).toMatch(/^QC lab activity · .* · weekly$/)

    expect(h.sendMail).toHaveBeenCalledTimes(1)
    const mail = h.sendMail.mock.calls[0][0] as any
    expect(mail).toMatchObject({ to: ['trading@wolthers.com'], cc: ['wolthers@wolthers.com'], mailbox: 'qualitycontrol@wolthers.com' })
    expect(mail.bodyHtml).toContain('Santos HQ')
    expect(mail.bodyText).toContain('Santos HQ: PSS approved 1, SS rejected 0, Samples deleted 0')

    const log = h.inserts.find((i) => i.table === 'email_messages')
    expect(log?.row).toMatchObject({
      direction: 'outbound', status: 'sent', sent_by: null,
      metadata: expect.objectContaining({ source: 'lab_activity_report', trigger: 'cron', cadence: 'weekly' }),
    })
  })

  it('redirects the whole send to the sandbox recipient when one is configured', async () => {
    process.env.CRON_SECRET = 'top'
    process.env.MICROSOFT_GRAPH_TEST_RECIPIENT = 'me@example.com'
    const res = await handleLabActivityCron(request({ authorization: 'Bearer top' }))
    expect((await res.json())).toMatchObject({ sent_to: ['me@example.com'], cc: [], sandbox: true })
    const mail = h.sendMail.mock.calls[0][0] as any
    expect(mail.subject.startsWith('[TEST] ')).toBe(true)
    expect(mail.cc).toBeUndefined()
  })
})
