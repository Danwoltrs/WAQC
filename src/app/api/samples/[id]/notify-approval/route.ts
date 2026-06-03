import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { sendMail, type GraphSendAttachment } from '@/lib/graph/send'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { renderCertificatePdfBuffer } from '@/lib/certificate-render'
import { composeBodyHtml } from '@/lib/email/compose-html'
import { applyShipmentSampleApproval } from '@/lib/approval-notification/shipment-sample-writeback'
import type { ApprovalDecision, ApprovalSide } from '@/lib/approval-notification/types'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

interface PanelInput {
  side: ApprovalSide
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
}
interface Body {
  panels: PanelInput[]
  includeCertificate?: boolean
  includeSignature?: boolean
  comments?: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await req.json()) as Body
  const panels = (body.panels ?? []).filter((p) => p.to?.length && p.subject && p.bodyText)
  const includeSignature = body.includeSignature !== false
  if (panels.length === 0) {
    return NextResponse.json({ error: 'At least one panel with to/subject/body is required' }, { status: 400 })
  }

  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await canUserManageSample(server as any, user.id, id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = admin()
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name, email, email_signature_html')
    .eq('id', user.id)
    .single()
  const senderEmail = profile?.email || user.email || undefined
  const senderName = profile?.full_name || senderEmail || undefined
  const signatureHtml: string | null = profile?.email_signature_html ?? null

  const { data: sample } = await supabase
    .from('samples')
    .select('id, tracking_number, status, contract_id')
    .eq('id', id)
    .single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
  const s = sample as any
  if (s.status !== 'approved' && s.status !== 'rejected') {
    return NextResponse.json({ error: 'Sample is not approved/rejected' }, { status: 400 })
  }
  if (!s.contract_id) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  const decision = s.status as ApprovalDecision
  const tracking = s.tracking_number as string
  const contractId = s.contract_id as string

  const { data: contract } = await supabase
    .from('contracts')
    .select('buyer_id, seller_id')
    .eq('id', contractId)
    .single()

  // Certificate bytes (shared across panels)
  let attachment: GraphSendAttachment | null = null
  if (body.includeCertificate !== false) {
    const { data: cert } = await supabase
      .from('certificates')
      .select('id, pdf_url')
      .eq('sample_id', id)
      .is('sample_contract_id', null)
      .limit(1)
      .maybeSingle()
    if (!cert) return NextResponse.json({ error: 'No certificate for this sample' }, { status: 400 })
    let pdf: Buffer | null = null
    if ((cert as any).pdf_url) pdf = await getCachedCertificatePdf(supabase, (cert as any).pdf_url)
    if (!pdf) {
      pdf = await renderCertificatePdfBuffer(supabase, id)
      if (!pdf) return NextResponse.json({ error: 'Certificate could not be generated' }, { status: 500 })
      uploadCertificatePdf(supabase, id, (cert as any).id, pdf).catch(() => {})
    }
    attachment = { name: `${tracking}.pdf`, contentType: 'application/pdf', bytes: new Uint8Array(pdf) }
  }

  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const results: { side: ApprovalSide; ok: boolean; error?: string }[] = []

  for (const panel of panels) {
    const to = testTo ? [testTo] : panel.to
    const cc = testTo ? undefined : panel.cc
    const subject = testTo ? `[TEST] ${panel.subject}` : panel.subject
    const bodyHtml = composeBodyHtml(panel.bodyText, includeSignature ? signatureHtml : null)
    try {
      await sendMail({
        mailbox: QC_MAILBOX,
        to,
        cc,
        subject,
        bodyText: panel.bodyText,
        bodyHtml,
        attachments: attachment ? [attachment] : undefined,
        saveToSentItems: true,
        senderEmail,
        senderName,
      })
      results.push({ side: panel.side, ok: true })

      await supabase.from('email_messages').insert({
        direction: 'outbound',
        status: 'sent',
        mailbox: QC_MAILBOX,
        from_email: QC_MAILBOX,
        sender_email: senderEmail ?? null,
        to_recipients: to.map((e) => ({ email: e })),
        cc_recipients: (cc ?? []).map((e) => ({ email: e })),
        subject,
        body_text: panel.bodyText,
        body_html: bodyHtml,
        contract_id: contractId,
        buyer_id: (contract as any)?.buyer_id ?? null,
        seller_id: (contract as any)?.seller_id ?? null,
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        metadata: {
          source: 'sample_approval',
          sample_id: id,
          decision,
          side: panel.side,
          sandbox: !!testTo,
          requested_to: panel.to,
          requested_cc: panel.cc ?? [],
        },
      }).then(undefined, (e) => console.error('[notify-approval] log failed (non-fatal):', e))
    } catch (err) {
      results.push({ side: panel.side, ok: false, error: err instanceof Error ? err.message : 'send failed' })
    }
  }

  const anySent = results.some((r) => r.ok)

  // Annex the certificate to the sys contract Docs once.
  let certificatePath: string | null = null
  if (anySent && attachment) {
    try {
      const { data: dt } = await supabase
        .from('document_types')
        .select('id')
        .eq('name', 'Quality Certificate')
        .eq('scope', 'contract')
        .maybeSingle()
      const storagePath = `${contractId}/quality-certificate-${tracking.replace(/\//g, '_')}.pdf`
      await supabase.storage
        .from('logistics-documents')
        .upload(storagePath, Buffer.from(attachment.bytes), { contentType: 'application/pdf', upsert: true })
      await supabase.from('documents').insert({
        contract_id: contractId,
        document_type_id: (dt as any)?.id ?? null,
        file_name: `${tracking}.pdf`,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        file_size: attachment.bytes.byteLength,
        source: 'manual',
        status: 'confirmed',
        created_by: user.id,
      })
      certificatePath = storagePath
    } catch (e) {
      console.error('[notify-approval] annex failed (non-fatal):', e)
    }
  }

  // Mark the sys shipment_samples row approved (insert if missing).
  if (anySent) {
    await applyShipmentSampleApproval(supabase, {
      contractId,
      waqcRef: tracking,
      decision,
      userId: user.id,
      today: new Date().toISOString().slice(0, 10),
      certificateUrl: certificatePath,
      comments: body.comments ?? null,
    })
  }

  return NextResponse.json({ ok: anySent, results })
}
