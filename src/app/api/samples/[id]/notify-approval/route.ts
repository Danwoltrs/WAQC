import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { sendMail, type GraphSendAttachment } from '@/lib/graph/send'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { renderCertificatePdfBuffer } from '@/lib/certificate-render'
import {
  approvalBodyToHtml,
  type ApprovalDecision,
} from '@/lib/approval-notification/template'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

interface Body {
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  includeCertificate?: boolean
}

/**
 * POST /api/samples/[id]/notify-approval
 * Sends the approval/rejection email (WAQC Graph, on behalf of the lab user),
 * annexes the certificate to the sys contract Docs tab, and logs the message.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await req.json()) as Body
  if (!body?.to?.length || !body.subject || !body.bodyText) {
    return NextResponse.json(
      { error: 'to, subject, bodyText required' },
      { status: 400 },
    )
  }

  // Logged-in user → sender identity
  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Authorization: only staff/QC users permitted to manage this sample may
  // send from the institutional mailbox and write to the contract. Gate on the
  // RLS-bound SSR client before any service-role action.
  const access = await canUserManageSample(server as any, user.id, id)
  if (!access.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = admin()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()
  const senderEmail = (profile as any)?.email || user.email || undefined
  const senderName = (profile as any)?.full_name || senderEmail || undefined

  // Sample + guards
  const { data: sample } = await supabase
    .from('samples')
    .select('id, tracking_number, status, contract_id')
    .eq('id', id)
    .single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
  const status = (sample as any).status as string
  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json(
      { error: 'Sample is not approved/rejected' },
      { status: 400 },
    )
  }
  const contractId = (sample as any).contract_id as string | null
  if (!contractId) {
    return NextResponse.json(
      { error: 'Sample is not contract-linked' },
      { status: 400 },
    )
  }
  const decision = status as ApprovalDecision
  const tracking = (sample as any).tracking_number as string

  const { data: contract } = await supabase
    .from('contracts')
    .select('buyer_id, seller_id')
    .eq('id', contractId)
    .single()

  // Certificate PDF bytes (cached → render fallback)
  const attachments: GraphSendAttachment[] = []
  if (body.includeCertificate !== false) {
    const { data: cert } = await supabase
      .from('certificates')
      .select('id, pdf_url')
      .eq('sample_id', id)
      .is('sample_contract_id', null)
      .limit(1)
      .maybeSingle()
    if (!cert) {
      return NextResponse.json(
        { error: 'No certificate for this sample' },
        { status: 400 },
      )
    }
    let pdf: Buffer | null = null
    if ((cert as any).pdf_url) {
      pdf = await getCachedCertificatePdf(supabase, (cert as any).pdf_url)
    }
    if (!pdf) {
      pdf = await renderCertificatePdfBuffer(supabase, id)
      if (!pdf) {
        return NextResponse.json(
          { error: 'Certificate could not be generated' },
          { status: 500 },
        )
      }
      uploadCertificatePdf(supabase, id, (cert as any).id, pdf).catch(() => {})
    }
    attachments.push({
      name: `${tracking}.pdf`,
      contentType: 'application/pdf',
      bytes: new Uint8Array(pdf),
    })
  }

  // Sandbox interception
  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const to = testTo ? [testTo] : body.to
  const cc = testTo ? undefined : body.cc
  const subject = testTo ? `[TEST] ${body.subject}` : body.subject

  // Send
  try {
    await sendMail({
      mailbox: QC_MAILBOX,
      to,
      cc,
      subject,
      bodyText: body.bodyText,
      bodyHtml: approvalBodyToHtml(body.bodyText),
      attachments,
      saveToSentItems: true,
      senderEmail,
      senderName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'send failed'
    return NextResponse.json({ error: `Email send failed: ${msg}` }, { status: 502 })
  }

  // Post-send: annex cert to sys contract Docs + log message. Non-fatal.
  if (attachments[0]) {
    try {
      const { data: dt } = await supabase
        .from('document_types')
        .select('id')
        .eq('name', 'Quality Certificate')
        .eq('scope', 'contract')
        .maybeSingle()
      const storagePath = `${contractId}/quality-certificate-${tracking.replace(
        /\//g,
        '_',
      )}.pdf`
      await supabase.storage
        .from('logistics-documents')
        .upload(storagePath, Buffer.from(attachments[0].bytes), {
          contentType: 'application/pdf',
          upsert: true,
        })
      await supabase.from('documents').insert({
        contract_id: contractId,
        document_type_id: (dt as any)?.id ?? null,
        file_name: `${tracking}.pdf`,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        file_size: attachments[0].bytes.byteLength,
        source: 'manual',
        status: 'confirmed',
        created_by: user.id,
      })
    } catch (e) {
      console.error('[notify-approval] annex failed (non-fatal):', e)
    }
  }

  try {
    await supabase.from('email_messages').insert({
      direction: 'outbound',
      status: 'sent',
      mailbox: QC_MAILBOX,
      from_email: QC_MAILBOX,
      sender_email: senderEmail ?? null,
      // Log what was ACTUALLY sent (post-sandbox interception), not what was
      // requested. Requested values are kept in metadata for traceability.
      to_recipients: to.map((e) => ({ email: e })),
      cc_recipients: (cc ?? []).map((e) => ({ email: e })),
      subject,
      body_text: body.bodyText,
      body_html: approvalBodyToHtml(body.bodyText),
      contract_id: contractId,
      buyer_id: (contract as any)?.buyer_id ?? null,
      seller_id: (contract as any)?.seller_id ?? null,
      sent_at: new Date().toISOString(),
      sent_by: user.id,
      metadata: {
        source: 'sample_approval',
        sample_id: id,
        decision,
        sandbox: !!testTo,
        requested_to: body.to,
        requested_cc: body.cc ?? [],
        requested_subject: body.subject,
      },
    })
  } catch (e) {
    console.error('[notify-approval] email_messages log failed (non-fatal):', e)
  }

  return NextResponse.json({ ok: true })
}
