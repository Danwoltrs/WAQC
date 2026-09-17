/**
 * HTTP handlers for the lab activity digest. Kept in lib/ because a Next.js
 * route file may export nothing but its HTTP verbs.
 *
 *   GET  /api/reports/lab-activity            → the report as JSON (staff)
 *   POST /api/reports/lab-activity/send       → email it now (staff)
 *   GET  /api/cron/lab-activity-report        → the scheduled send (CRON_SECRET)
 *
 * Configuration (env):
 *   LAB_ACTIVITY_REPORT_TO         recipient, default trading@wolthers.com
 *   LAB_ACTIVITY_REPORT_CADENCE    'weekly' (default) | 'monthly' — the period the
 *                                  cron reports on; the vercel.json schedule must match
 *   LAB_ACTIVITY_REPORT_BREAKDOWN  'pss_approved_ss_rejected' (default) | 'full'
 *   CRON_SECRET                    Vercel sends it as `Authorization: Bearer …`
 */
import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { HOUSE_CC } from '@/lib/approval-notification/resolve-panels'
import { sendMail, GraphSendError } from '@/lib/graph/send'
import { isValidEmail } from '@/lib/html'
import {
  getLabActivityReport,
  isLabActivityBreakdown,
  isLabActivityCadence,
  parseIsoDate,
  previousPeriod,
  type LabActivityBreakdown,
  type LabActivityCadence,
  type LabActivityPeriod,
  type LabActivityReport,
} from './lab-activity-data'
import { buildLabActivityEmail } from './lab-activity-email'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'
export const DEFAULT_LAB_ACTIVITY_RECIPIENT = 'trading@wolthers.com'

export interface LabActivityConfig {
  to: string
  cadence: LabActivityCadence
  breakdown: LabActivityBreakdown
}

/** Env-driven settings, with the defaults the trading desk asked for. */
export function labActivityConfig(env: Record<string, string | undefined> = process.env): LabActivityConfig {
  const to = (env.LAB_ACTIVITY_REPORT_TO ?? '').trim()
  const cadence = env.LAB_ACTIVITY_REPORT_CADENCE
  const breakdown = env.LAB_ACTIVITY_REPORT_BREAKDOWN
  return {
    to: isValidEmail(to) ? to : DEFAULT_LAB_ACTIVITY_RECIPIENT,
    cadence: isLabActivityCadence(cadence) ? cadence : 'weekly',
    breakdown: isLabActivityBreakdown(breakdown) ? breakdown : 'pss_approved_ss_rejected',
  }
}

const admin = () =>
  createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

export type ParsedParams =
  | { ok: true; period: LabActivityPeriod; breakdown: LabActivityBreakdown }
  | { ok: false; error: string }

/**
 * start_date / end_date (YYYY-MM-DD, end EXCLUSIVE, at most 400 days) and an
 * optional breakdown. Missing dates fall back to the previous period of the
 * configured cadence.
 */
export function parseLabActivityParams(
  get: (key: string) => string | null | undefined,
  defaults: LabActivityConfig = labActivityConfig(),
): ParsedParams {
  const rawStart = get('start_date')
  const rawEnd = get('end_date')
  const rawBreakdown = get('breakdown')
  const breakdown = rawBreakdown ? (isLabActivityBreakdown(rawBreakdown) ? rawBreakdown : null) : defaults.breakdown
  if (!breakdown) return { ok: false, error: "breakdown must be 'pss_approved_ss_rejected' or 'full'" }

  if (!rawStart && !rawEnd) return { ok: true, period: previousPeriod(defaults.cadence), breakdown }
  const start = parseIsoDate(rawStart)
  const end = parseIsoDate(rawEnd)
  if (!start || !end) return { ok: false, error: 'start_date and end_date must be YYYY-MM-DD (end exclusive)' }
  if (start >= end) return { ok: false, error: 'start_date must be before end_date' }
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
  if (days > 400) return { ok: false, error: 'the period may span at most 400 days' }
  return { ok: true, period: { start, end }, breakdown }
}

const dedupe = (emails: string[]) => {
  const seen = new Set<string>()
  return emails.filter((e) => {
    const k = e.trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface SendResult {
  subject: string
  to: string[]
  cc: string[]
  sandbox: boolean
  report: LabActivityReport
}

/**
 * Build, email and log the digest. The house CC is appended server-side, as
 * on every QC email. `MICROSOFT_GRAPH_TEST_RECIPIENT` redirects the whole
 * send, as elsewhere.
 */
export async function sendLabActivityReport(
  db: SupabaseClient<any>,
  args: {
    period: LabActivityPeriod
    breakdown: LabActivityBreakdown
    to: string
    cadence?: LabActivityCadence | null
    sentBy?: string | null
    trigger: 'cron' | 'manual'
  },
): Promise<SendResult> {
  const report = await getLabActivityReport(db, { period: args.period, breakdown: args.breakdown })
  const email = buildLabActivityEmail(report, { cadence: args.cadence ?? null })

  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const to = testTo ? [testTo] : [args.to]
  const cc = testTo ? [] : dedupe([HOUSE_CC])
  const subject = testTo ? `[TEST] ${email.subject}` : email.subject

  await sendMail({
    mailbox: QC_MAILBOX,
    to,
    cc: cc.length ? cc : undefined,
    subject,
    bodyText: email.text,
    bodyHtml: email.html,
    saveToSentItems: true,
  })

  await db
    .from('email_messages')
    .insert({
      direction: 'outbound',
      status: 'sent',
      mailbox: QC_MAILBOX,
      from_email: QC_MAILBOX,
      to_recipients: to.map((e) => ({ email: e })),
      cc_recipients: cc.map((e) => ({ email: e })),
      subject,
      body_text: email.text,
      body_html: email.html,
      sent_at: new Date().toISOString(),
      sent_by: args.sentBy ?? null,
      metadata: {
        source: 'lab_activity_report',
        trigger: args.trigger,
        period: args.period,
        breakdown: args.breakdown,
        cadence: args.cadence ?? null,
        deleted_count: report.deleted.length,
        sandbox: !!testTo,
        requested_to: [args.to],
      },
    })
    .then(undefined, (e: unknown) => console.error('[lab-activity] email log failed (non-fatal):', e))

  return { subject, to, cc, sandbox: !!testTo, report }
}

async function requireStaff(): Promise<{ userId: string } | { error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await isInternalStaff(supabase as any, user.id))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

/** GET ?start_date&end_date&breakdown → { report, recipient, config }. */
export async function handleLabActivityGet(request: NextRequest): Promise<NextResponse> {
  try {
    const gate = await requireStaff()
    if ('error' in gate) return gate.error
    const config = labActivityConfig()
    const parsed = parseLabActivityParams((k) => request.nextUrl.searchParams.get(k), config)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const report = await getLabActivityReport(admin(), { period: parsed.period, breakdown: parsed.breakdown })
    return NextResponse.json({ report, recipient: config.to, cadence: config.cadence })
  } catch (error) {
    console.error('[lab-activity] GET failed:', error)
    return NextResponse.json({ error: 'Failed to build the lab activity report' }, { status: 500 })
  }
}

/** POST { start_date, end_date, breakdown?, to? } → send now. */
export async function handleLabActivitySend(request: NextRequest): Promise<NextResponse> {
  try {
    const gate = await requireStaff()
    if ('error' in gate) return gate.error
    const config = labActivityConfig()
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const parsed = parseLabActivityParams((k) => (typeof body[k] === 'string' ? (body[k] as string) : null), config)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    // A different recipient is allowed only inside the house: the digest names
    // people and deletions, so it never leaves @wolthers.com on a manual send.
    const rawTo = typeof body.to === 'string' ? body.to.trim() : ''
    let to = config.to
    if (rawTo) {
      if (!isValidEmail(rawTo) || !/@wolthers\.com$/i.test(rawTo)) {
        return NextResponse.json({ error: 'The recipient must be a wolthers.com address' }, { status: 400 })
      }
      to = rawTo
    }
    const result = await sendLabActivityReport(admin(), {
      period: parsed.period,
      breakdown: parsed.breakdown,
      to,
      cadence: null,
      sentBy: gate.userId,
      trigger: 'manual',
    })
    return NextResponse.json({ success: true, subject: result.subject, sent_to: result.to, cc: result.cc, sandbox: result.sandbox })
  } catch (error) {
    if (error instanceof GraphSendError) {
      console.error('[lab-activity] Graph send failed:', error.status, error.graphCode, error.details)
      return NextResponse.json({ error: 'Email send failed', details: error.message }, { status: 502 })
    }
    console.error('[lab-activity] send failed:', error)
    return NextResponse.json({ error: 'Failed to send the lab activity report' }, { status: 500 })
  }
}

/** Constant-time check of the cron bearer token; false when unconfigured. */
export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(authorization ?? '')
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/**
 * The scheduled send. Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
 * Reports on the previous complete period of the configured cadence.
 */
export async function handleLabActivityCron(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    console.error('[lab-activity] CRON_SECRET is not configured; refusing to run')
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const config = labActivityConfig()
    const period = previousPeriod(config.cadence)
    const result = await sendLabActivityReport(admin(), {
      period,
      breakdown: config.breakdown,
      to: config.to,
      cadence: config.cadence,
      sentBy: null,
      trigger: 'cron',
    })
    console.log(`[lab-activity] cron sent "${result.subject}" to ${result.to.join(', ')} (${result.report.deleted.length} deleted)`)
    return NextResponse.json({
      success: true,
      subject: result.subject,
      sent_to: result.to,
      cc: result.cc,
      period,
      cadence: config.cadence,
      breakdown: config.breakdown,
      labs: result.report.labs.length,
      deleted: result.report.deleted.length,
      sandbox: result.sandbox,
    })
  } catch (error) {
    console.error('[lab-activity] cron failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Scheduled send failed', details: message }, { status: 500 })
  }
}
