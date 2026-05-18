/**
 * Per-client recipient persistence.
 *
 *  GET  /api/reports/recipients?client_id=...&report_type=weekly_ss
 *    → { to: string[], cc: string[], bcc: string[], last_sent_at, last_sent_by }
 *    → 404 returns { to: [], cc: [], bcc: [] } so the client can treat
 *      "never sent before" the same as "sent before with no addresses".
 *
 *  POST /api/reports/recipients
 *    body: { client_id, report_type, to, cc?, bcc? }
 *    → upserts the row, replacing whatever was stored.
 *    → POST is used internally by the send endpoint; exposed publicly too
 *      in case we want a "save without sending" affordance later.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const VALID_REPORT_TYPES = new Set(['weekly_ss', 'biweekly', 'monthly', 'annual'])

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const clientId = sp.get('client_id')
    const reportType = sp.get('report_type')

    if (!clientId || !reportType) {
      return NextResponse.json(
        { error: 'client_id and report_type are required' },
        { status: 400 }
      )
    }
    if (!VALID_REPORT_TYPES.has(reportType)) {
      return NextResponse.json({ error: 'Invalid report_type' }, { status: 400 })
    }

    const { data, error } = await (supabase as any)
      .from('report_recipients')
      .select('to_emails, cc_emails, bcc_emails, last_sent_at, last_sent_by')
      .eq('client_id', clientId)
      .eq('report_type', reportType)
      .maybeSingle()

    if (error) {
      console.error('[reports.recipients] GET failed:', error)
      return NextResponse.json({ error: 'Failed to load recipients' }, { status: 500 })
    }

    return NextResponse.json({
      to: (data?.to_emails as string[]) ?? [],
      cc: (data?.cc_emails as string[]) ?? [],
      bcc: (data?.bcc_emails as string[]) ?? [],
      last_sent_at: data?.last_sent_at ?? null,
      last_sent_by: data?.last_sent_by ?? null,
    })
  } catch (err) {
    console.error('Error in GET /api/reports/recipients:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { client_id, report_type, to, cc, bcc } = body

    if (!client_id || !report_type) {
      return NextResponse.json(
        { error: 'client_id and report_type are required' },
        { status: 400 }
      )
    }
    if (!VALID_REPORT_TYPES.has(report_type)) {
      return NextResponse.json({ error: 'Invalid report_type' }, { status: 400 })
    }
    if (!Array.isArray(to)) {
      return NextResponse.json({ error: 'to must be an array' }, { status: 400 })
    }

    await saveRecipients(supabase, {
      clientId: client_id,
      reportType: report_type,
      userId: user.id,
      to,
      cc: Array.isArray(cc) ? cc : [],
      bcc: Array.isArray(bcc) ? bcc : [],
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in POST /api/reports/recipients:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * Exported for re-use from the send endpoint so a successful send
 * automatically persists the recipient set without an extra round trip.
 *
 * Each call REPLACES the stored row (not append) — "saved recipients" means
 * "what we sent last time", not a cumulative log.
 */
export async function saveRecipients(
  supabase: any,
  params: {
    clientId: string
    reportType: string
    userId: string
    to: string[]
    cc: string[]
    bcc: string[]
  }
): Promise<void> {
  const dedupAndClean = (arr: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of arr) {
      if (typeof raw !== 'string') continue
      const trimmed = raw.trim().toLowerCase()
      if (!trimmed) continue
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      out.push(raw.trim())
    }
    return out
  }

  const { error } = await supabase
    .from('report_recipients')
    .upsert(
      {
        client_id: params.clientId,
        report_type: params.reportType,
        to_emails: dedupAndClean(params.to),
        cc_emails: dedupAndClean(params.cc),
        bcc_emails: dedupAndClean(params.bcc),
        last_sent_at: new Date().toISOString(),
        last_sent_by: params.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,report_type' }
    )
  if (error) {
    console.error('[reports.recipients] upsert failed:', error)
    // Non-fatal — the email was already sent, persistence is a nice-to-have.
  }
}
