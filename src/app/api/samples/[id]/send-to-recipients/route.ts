import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveSampleId } from '@/lib/sample-utils'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { escapeHtml, isValidEmail } from '@/lib/html'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Per-request cap to avoid runaway fan-out if recipients is misconfigured.
const MAX_SENDS_PER_REQUEST = 50

/**
 * POST /api/samples/[id]/send-to-recipients
 * Sends a preliminary cupping report email to each recipient of an Other Sample.
 * Body: { recipient_ids?: string[] }   // when omitted, sends to ALL recipients with status='pending'
 *
 * Updates each row's sent_at and flips the sample's status to 'sent_to_clients'.
 * No certificate PDF is generated; the email body summarizes the green analysis
 * and cupping aggregate from quality_assessments.
 *
 * Authorization: caller must be Wolthers staff with a sample-management role,
 * or be bound to the sample's owning client/lab. See sample-access.ts.
 *
 * All DB-sourced fields are HTML-escaped before interpolation. Each recipient
 * address is validated; addresses passed in `contact_emails` that don't pass
 * a basic RFC 5322 shape check are dropped silently.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const resolved = await resolveSampleId(supabase as any, id)
    if (!resolved.id) {
      return NextResponse.json({ error: resolved.error || 'Sample not found' }, { status: 404 })
    }

    const access = await canUserManageSample(supabase as any, user.id, resolved.id)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedIds: string[] | undefined = Array.isArray(body?.recipient_ids) ? body.recipient_ids : undefined

    const { data: sample, error: sampleErr } = await (supabase as any)
      .from('samples')
      .select(`
        id, tracking_number, sample_category, sample_type, origin, micro_origin,
        quality_name, awb_number, courier_name, processing_method,
        quality_assessment:quality_assessments(green_bean_data, roast_data, clean_cup, uniform_cup, cupping_comments, grading_comments)
      `)
      .eq('id', resolved.id)
      .single()

    if (sampleErr || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }
    if (sample.sample_category !== 'other') {
      return NextResponse.json({ error: 'Only Other Samples can be sent to recipients' }, { status: 400 })
    }

    let recipientQuery = (supabase as any)
      .from('sample_recipients')
      .select('id, client_id, contact_emails, status, client:companies!sample_recipients_client_id_fkey(id, fantasy_name, name, email)')
      .eq('sample_id', resolved.id)

    if (requestedIds && requestedIds.length > 0) {
      recipientQuery = recipientQuery.in('id', requestedIds)
    }

    const { data: recipients, error: recipErr } = await recipientQuery

    if (recipErr || !recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients found for this sample' }, { status: 400 })
    }

    if (recipients.length > MAX_SENDS_PER_REQUEST) {
      return NextResponse.json({
        error: `Too many sends in one request (cap ${MAX_SENDS_PER_REQUEST})`,
      }, { status: 400 })
    }

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()
    const senderName = (senderProfile as any)?.full_name || 'Wolthers QC'
    const senderNameSafe = escapeHtml(senderName)

    const qa = Array.isArray(sample.quality_assessment)
      ? sample.quality_assessment[0]
      : sample.quality_assessment
    const cuppingAvg = qa?.green_bean_data?.cupping_score ?? qa?.cupping_score ?? null
    const moisture = qa?.green_bean_data?.moisture ?? null
    const defectsTotal = qa?.green_bean_data?.defects_total ?? null

    // Pre-compute escaped sample fields (same across all recipients)
    const trackingSafe = escapeHtml(sample.tracking_number)
    const sampleTypeSafe = sample.sample_type ? escapeHtml(String(sample.sample_type).toUpperCase()) : ''
    const originLine = sample.origin
      ? escapeHtml(sample.origin) + (sample.micro_origin ? ` — ${escapeHtml(sample.micro_origin)}` : '')
      : ''
    const qualitySafe = sample.quality_name ? escapeHtml(sample.quality_name) : ''
    const processSafe = sample.processing_method ? escapeHtml(sample.processing_method) : ''
    const awbLine = sample.awb_number
      ? escapeHtml(sample.awb_number) + (sample.courier_name ? ` (${escapeHtml(sample.courier_name)})` : '')
      : ''
    const cuppingSafe = cuppingAvg !== null ? escapeHtml(cuppingAvg) : ''
    const moistureSafe = moisture !== null ? escapeHtml(moisture) : ''
    const defectsSafe = defectsTotal !== null ? escapeHtml(defectsTotal) : ''
    const cuppingCommentsSafe = qa?.cupping_comments ? escapeHtml(qa.cupping_comments) : ''

    const results: Array<{ recipient_id: string; email: string | null; ok: boolean; error?: string }> = []

    for (const r of recipients as any[]) {
      const overrideEmails = (r.contact_emails || []).filter(isValidEmail) as string[]
      const fallbackEmail = isValidEmail(r.client?.email) ? r.client.email : null
      const toList = overrideEmails.length > 0 ? overrideEmails : (fallbackEmail ? [fallbackEmail] : [])

      if (toList.length === 0) {
        results.push({ recipient_id: r.id, email: null, ok: false, error: 'No valid email on file for this client' })
        continue
      }

      const recipientName = r.client?.fantasy_name || r.client?.name || 'Client'
      const recipientNameSafe = escapeHtml(recipientName)
      const subject = `Preliminary cupping report — sample ${sample.tracking_number}`
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #556b2f;">Preliminary cupping report</h2>
          <p>Hello ${recipientNameSafe},</p>
          <p>The Wolthers lab has completed a preliminary review of sample <strong>${trackingSafe}</strong>. Please review the summary below and let us know whether you would like to approve it.</p>
          <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
            ${sampleTypeSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Sample type</td><td>${sampleTypeSafe}</td></tr>` : ''}
            ${originLine ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Origin</td><td>${originLine}</td></tr>` : ''}
            ${qualitySafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Quality</td><td>${qualitySafe}</td></tr>` : ''}
            ${processSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Process</td><td>${processSafe}</td></tr>` : ''}
            ${awbLine ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">AWB</td><td>${awbLine}</td></tr>` : ''}
            ${cuppingSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Cupping score</td><td><strong>${cuppingSafe}</strong></td></tr>` : ''}
            ${moistureSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Moisture</td><td>${moistureSafe}%</td></tr>` : ''}
            ${defectsSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Defects (total)</td><td>${defectsSafe}</td></tr>` : ''}
            ${qa?.clean_cup !== undefined ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Clean cup</td><td>${qa.clean_cup ? 'Yes' : 'No'}</td></tr>` : ''}
            ${qa?.uniform_cup !== undefined ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Uniform cup</td><td>${qa.uniform_cup ? 'Yes' : 'No'}</td></tr>` : ''}
          </table>
          ${cuppingCommentsSafe ? `<p><em>${cuppingCommentsSafe}</em></p>` : ''}
          <p>To approve or reject this sample, please reply to this email or contact ${senderNameSafe} directly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #888; font-size: 12px;">
            Sent by ${senderNameSafe}<br />
            Wolthers Quality Control
          </p>
        </div>
      `

      try {
        const { error: emailError } = await resend.emails.send({
          from: 'Wolthers QC <qualitycontrol@wolthers.com>',
          to: toList,
          subject,
          html,
        })

        if (emailError) {
          results.push({ recipient_id: r.id, email: toList[0], ok: false, error: emailError.message })
          continue
        }

        await (supabase as any)
          .from('sample_recipients')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', r.id)

        results.push({ recipient_id: r.id, email: toList[0], ok: true })
      } catch (sendErr: any) {
        results.push({ recipient_id: r.id, email: toList[0], ok: false, error: sendErr?.message || String(sendErr) })
      }
    }

    // Flip sample status to sent_to_clients if at least one send succeeded.
    if (results.some(r => r.ok)) {
      await (supabase as any)
        .from('samples')
        .update({ status: 'sent_to_clients' })
        .eq('id', resolved.id)
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    console.error('POST /send-to-recipients exception:', err)
    return NextResponse.json({ error: 'Internal server error', details: err?.message || String(err) }, { status: 500 })
  }
}
