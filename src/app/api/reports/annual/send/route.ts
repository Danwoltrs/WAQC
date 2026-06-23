/**
 * POST /api/reports/annual/send
 *
 * Generates the Annual Performance PDF and emails it via Microsoft Graph
 * from MICROSOFT_GRAPH_MAILBOX (default qualitycontrol@wolthers.com) on
 * behalf of the logged-in user. Outlook will show:
 *   "<Profile full_name> <user.email> on behalf of Quality Control <qualitycontrol@wolthers.com>"
 *
 * Body:
 *   client_id (uuid, required)
 *   year (integer, required)
 *   to (string[], required, ≥1 valid address)
 *   cc, bcc (string[], optional)
 *   subject (string, optional — defaults to "<Client> · Annual Performance Review · <year>")
 *   body (string, optional — defaults to a short cover line)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generateAnnualReport } from '@/lib/reports/annual-generator'
import { sendMail, GraphSendError } from '@/lib/graph/send'
import { saveRecipients } from '@/lib/reports/recipients'
import { composeBodyHtml } from '@/lib/email/compose-html'

const DEFAULT_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX ?? 'qualitycontrol@wolthers.com'
const REPORT_TYPE = 'annual'

// Permissive but cheap email check — Graph rejects malformed addresses with a
// clearer error, this just blocks obvious typos before paying for the round
// trip and the PDF render.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmails(input: unknown, field: string): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, emails: [] }
  if (!Array.isArray(input)) return { ok: false, error: `${field} must be an array of email strings` }
  const emails: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') return { ok: false, error: `${field} entries must be strings` }
    const trimmed = v.trim()
    if (!trimmed) continue
    if (!EMAIL_RE.test(trimmed)) return { ok: false, error: `Invalid email in ${field}: ${trimmed}` }
    emails.push(trimmed)
  }
  return { ok: true, emails }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { client_id, year: yearIn, subject: subjectIn, body: bodyIn } = body

    if (!client_id || yearIn === undefined) {
      return NextResponse.json(
        { error: 'client_id and year are required' },
        { status: 400 }
      )
    }

    const year = Number(yearIn)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
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

    // Fetch the user's profile so we can use their name + email as the
    // "on behalf of" sender and append their HTML signature. Falls back
    // to the auth email if profile is missing for some reason.
    // Cast through any until generated DB types pick up the new signature columns.
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name, email, email_signature_html')
      .eq('id', user.id)
      .single()

    const senderEmail = profile?.email || user.email || undefined
    const senderName = profile?.full_name || senderEmail || undefined
    const signatureHtml: string | null = profile?.email_signature_html ?? null

    // Generate the PDF (same code path as the download endpoint).
    const report = await generateAnnualReport(supabase, { clientId: client_id, year })
    if (!report) {
      return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })
    }

    const periodLabel = String(year)
    const subject = (typeof subjectIn === 'string' && subjectIn.trim().length > 0)
      ? subjectIn.trim()
      : `${report.data.client.name} · Annual Performance Review · ${periodLabel}`
    const bodyText = (typeof bodyIn === 'string' && bodyIn.trim().length > 0)
      ? bodyIn
      : `Hello,\n\nPlease find attached the Annual Quality Performance Review for ${report.data.client.name} covering ${periodLabel}.\n\nBest regards,\n${senderName ?? 'Quality Control'}\nWolthers & Associates`

    // Always auto-CC the mailbox so anyone monitoring qualitycontrol@'s inbox
    // sees outgoing reports + recipient replies thread back into that mailbox.
    // Dedup case-insensitively in case the user already added it manually.
    const userCcLower = new Set(ccResult.emails.map(e => e.toLowerCase()))
    const ccWithMailbox = userCcLower.has(DEFAULT_MAILBOX.toLowerCase())
      ? ccResult.emails
      : [...ccResult.emails, DEFAULT_MAILBOX]

    // Compose the HTML body: cover note + the user's signature. composeBodyHtml
    // strips the trailing "Best regards, …" from the cover note when a
    // signature is present so the recipient doesn't see the closing twice.
    // Falls back gracefully when the user hasn't saved a signature yet.
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
          {
            error: 'Email send failed',
            details: err.message,
            graph_code: err.graphCode,
          },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
        )
      }
      throw err
    }

    // Persist the recipient set the user chose — NOT the auto-CC mailbox,
    // so it doesn't appear as a "saved" entry the user might try to remove.
    // Non-fatal: if this fails, the email was still sent.
    await saveRecipients(supabase, {
      clientId: client_id,
      reportType: REPORT_TYPE,
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
    console.error('Error in POST /api/reports/annual/send:', error)
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 })
  }
}
