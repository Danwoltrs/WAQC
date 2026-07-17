/**
 * Shared HTTP handlers for the SS / PSS / SS+PSS report routes.
 *
 * Kept in lib/ because Next.js route files may only export HTTP verbs.
 * Each route file calls these with its ReportRouteConfig, so the six
 * period-report endpoints share one implementation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generatePerformanceReport } from '@/lib/reports/performance-generator'
import type { ReportBucketKey } from '@/lib/reports/performance-data'
import { sendMail, GraphSendError } from '@/lib/graph/send'
import { saveRecipients } from '@/lib/reports/recipients'
import { composeBodyHtml } from '@/lib/email/compose-html'
import { isValidEmail } from '@/lib/html'

export interface ReportRouteConfig {
  buckets: ReportBucketKey[]
  /** Filename prefix: 'SS' | 'PSS' | 'SS-PSS'. */
  filenameLabel: string
  /** report_recipients key: 'weekly_ss' | 'pss' | 'biweekly'. */
  reportType: string
  /** Human label for subjects/cover notes: 'SS Report' | 'PSS Report' | 'SS+PSS Report'. */
  subjectLabel: string
}

const DEFAULT_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX ?? 'qualitycontrol@wolthers.com'

function validateEmails(input: unknown, field: string): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, emails: [] }
  if (!Array.isArray(input)) return { ok: false, error: `${field} must be an array of email strings` }
  const emails: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') return { ok: false, error: `${field} entries must be strings` }
    const trimmed = v.trim()
    if (!trimmed) continue
    if (!isValidEmail(trimmed)) return { ok: false, error: `Invalid email in ${field}: ${trimmed}` }
    emails.push(trimmed)
  }
  return { ok: true, emails }
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

/** GET ?client_id&start_date&end_date → inline PDF stream. */
export async function handleReportGet(request: NextRequest, config: ReportRouteConfig): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const clientId = sp.get('client_id')
    const startDate = sp.get('start_date')
    const endDate = sp.get('end_date')

    if (!clientId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'client_id, start_date, end_date are required' },
        { status: 400 }
      )
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (start >= end) {
      return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
    }

    const report = await generatePerformanceReport(supabase, {
      clientId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      buckets: config.buckets,
      filenameLabel: config.filenameLabel,
    })

    if (!report) {
      return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(report.pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${report.filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error(`Error in GET report (${config.reportType}):`, error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Failed to generate report: ${message}` },
      { status: 500 },
    )
  }
}

/** POST { client_id, start_date, end_date, to, cc?, bcc?, subject?, body? } → Graph email. */
export async function handleReportSend(request: NextRequest, config: ReportRouteConfig): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { client_id, start_date, end_date, subject: subjectIn, body: bodyIn } = body

    if (!client_id || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'client_id, start_date, end_date are required' },
        { status: 400 }
      )
    }

    const start = new Date(start_date)
    const end = new Date(end_date)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    const toResult = validateEmails(body.to, 'to')
    if (!toResult.ok) return NextResponse.json({ error: toResult.error }, { status: 400 })
    if (toResult.emails.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required in "to"' }, { status: 400 })
    }
    const ccResult = validateEmails(body.cc, 'cc')
    if (!ccResult.ok) return NextResponse.json({ error: ccResult.error }, { status: 400 })
    const bccResult = validateEmails(body.bcc, 'bcc')
    if (!bccResult.ok) return NextResponse.json({ error: bccResult.error }, { status: 400 })

    // Sender profile → "on behalf of" + signature.
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name, email, email_signature_html')
      .eq('id', user.id)
      .single()

    const senderEmail = profile?.email || user.email || undefined
    const senderName = profile?.full_name || senderEmail || undefined
    const signatureHtml: string | null = profile?.email_signature_html ?? null

    const report = await generatePerformanceReport(supabase, {
      clientId: client_id,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      buckets: config.buckets,
      filenameLabel: config.filenameLabel,
    })
    if (!report) {
      return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })
    }

    const periodLabel = `${formatDateLabel(start.toISOString())} – ${formatDateLabel(new Date(end.getTime() - 86400000).toISOString())}`
    const subject = (typeof subjectIn === 'string' && subjectIn.trim().length > 0)
      ? subjectIn.trim()
      : `${report.data.client.name} · ${config.subjectLabel} · ${periodLabel}`
    const bodyText = (typeof bodyIn === 'string' && bodyIn.trim().length > 0)
      ? bodyIn
      : `Hello,\n\nPlease find attached the ${config.subjectLabel} for ${report.data.client.name} covering ${periodLabel}.\n\nBest regards,\n${senderName ?? 'Quality Control'}\nWolthers & Associates`

    // Always auto-CC the mailbox (LOCKED house rule); dedup case-insensitively.
    const userCcLower = new Set(ccResult.emails.map(e => e.toLowerCase()))
    const ccWithMailbox = userCcLower.has(DEFAULT_MAILBOX.toLowerCase())
      ? ccResult.emails
      : [...ccResult.emails, DEFAULT_MAILBOX]

    const bodyHtml = composeBodyHtml(bodyText, signatureHtml)

    try {
      await sendMail({
        mailbox: DEFAULT_MAILBOX,
        to: toResult.emails,
        cc: ccWithMailbox,
        bcc: bccResult.emails.length > 0 ? bccResult.emails : undefined,
        subject,
        bodyText,
        bodyHtml,
        senderEmail,
        senderName,
        attachments: [
          {
            name: report.filename,
            contentType: 'application/pdf',
            bytes: new Uint8Array(report.pdfBuffer),
          },
        ],
      })
    } catch (err) {
      if (err instanceof GraphSendError) {
        console.error('[reports.send] Graph send failed:', err.status, err.graphCode, err.details)
        return NextResponse.json(
          { error: 'Email send failed', details: err.message, graph_code: err.graphCode },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
        )
      }
      throw err
    }

    // Persist the chosen recipients (not the auto-CC mailbox). Non-fatal.
    await saveRecipients(supabase, {
      clientId: client_id,
      reportType: config.reportType,
      userId: user.id,
      to: toResult.emails,
      cc: ccResult.emails,
      bcc: bccResult.emails,
    })

    return NextResponse.json({
      success: true,
      sent_to: toResult.emails,
      cc: ccWithMailbox,
      bcc: bccResult.emails,
      filename: report.filename,
      mailbox: DEFAULT_MAILBOX,
      sender: senderEmail,
    })
  } catch (error) {
    console.error(`Error in POST report send (${config.reportType}):`, error)
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 })
  }
}
