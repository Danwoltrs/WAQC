import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { sendMail, type GraphSendAttachment } from '@/lib/graph/send'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { renderCertificatePdfBuffer } from '@/lib/certificate-render'
import { composeBodyHtml } from '@/lib/email/compose-html'
import { buildCertificateFilename } from '@/lib/certificate-filename'
import { applyShipmentSampleApproval } from '@/lib/approval-notification/shipment-sample-writeback'
import { resolveSampleContract } from '@/lib/approval-notification/contract-resolver'
import { getInitials } from '@/lib/approval-notification/batch-send'
import type { ApprovalDecision, ApprovalSide } from '@/lib/approval-notification/types'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

interface Body {
  side: ApprovalSide
  companyId: string
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  sampleIds: string[]
  includeSignature?: boolean
}

interface Prepared {
  sampleId: string
  tracking: string
  decision: ApprovalDecision
  contractId: string
  buyerId: string | null
  sellerId: string | null
  attachment: GraphSendAttachment
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body
  const side = body.side
  const to = (body.to ?? []).filter(Boolean)
  const cc = (body.cc ?? []).filter(Boolean)
  const sampleIds = [...new Set((body.sampleIds ?? []).filter(Boolean))]
  if (!body.subject || !body.bodyText || to.length === 0 || sampleIds.length === 0) {
    return NextResponse.json({ error: 'side, to, subject, bodyText and sampleIds are required' }, { status: 400 })
  }

  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = admin()
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name, email, email_signature_html')
    .eq('id', user.id)
    .single()
  const senderEmail = profile?.email || user.email || undefined
  const senderName = profile?.full_name || senderEmail || undefined
  const signatureHtml: string | null = profile?.email_signature_html ?? null

  const results: { sampleId: string; ok: boolean; error?: string }[] = []
  const prepared: Prepared[] = []

  // Resolve + render each sample's certificate; skip (with a reason) any that fail.
  for (const sampleId of sampleIds) {
    const access = await canUserManageSample(server as any, user.id, sampleId)
    if (!access.allowed) {
      results.push({ sampleId, ok: false, error: 'forbidden' })
      continue
    }
    const { data: sample } = await supabase
      .from('samples')
      .select('id, tracking_number, status, contract_id, wolthers_contract_nr, buyer_contract_nr')
      .eq('id', sampleId)
      .single()
    const s = sample as any
    if (!s) {
      results.push({ sampleId, ok: false, error: 'sample not found' })
      continue
    }
    if (s.status !== 'approved' && s.status !== 'rejected') {
      results.push({ sampleId, ok: false, error: 'not approved/rejected' })
      continue
    }
    const ctx = await resolveSampleContract(supabase, s)
    if (!ctx) {
      results.push({ sampleId, ok: false, error: 'no contract' })
      continue
    }
    const { data: cert } = await supabase
      .from('certificates')
      .select('id, pdf_url, certificate_number')
      .eq('sample_id', sampleId)
      .is('sample_contract_id', null)
      .limit(1)
      .maybeSingle()
    if (!cert) {
      results.push({ sampleId, ok: false, error: 'no certificate' })
      continue
    }
    let pdf: Buffer | null = null
    if ((cert as any).pdf_url) pdf = await getCachedCertificatePdf(supabase, (cert as any).pdf_url)
    if (!pdf) {
      pdf = await renderCertificatePdfBuffer(supabase, sampleId)
      if (pdf) uploadCertificatePdf(supabase, sampleId, (cert as any).id, pdf).catch(() => {})
    }
    if (!pdf) {
      results.push({ sampleId, ok: false, error: 'certificate could not be generated' })
      continue
    }
    prepared.push({
      sampleId,
      tracking: s.tracking_number as string,
      decision: s.status as ApprovalDecision,
      contractId: ctx.contractId,
      buyerId: ctx.buyerId,
      sellerId: ctx.sellerId,
      attachment: {
        name: buildCertificateFilename((cert as any).certificate_number ?? s.tracking_number, s.buyer_contract_nr),
        contentType: 'application/pdf',
        bytes: new Uint8Array(pdf),
      },
    })
  }

  if (prepared.length === 0) {
    return NextResponse.json({ ok: false, results, error: 'No deliverable certificates in this unit' }, { status: 400 })
  }

  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const sendTo = testTo ? [testTo] : to
  const sendCc = testTo ? undefined : cc
  const subject = testTo ? `[TEST] ${body.subject}` : body.subject
  const bodyHtml = composeBodyHtml(body.bodyText, body.includeSignature === false ? null : signatureHtml)

  try {
    await sendMail({
      mailbox: QC_MAILBOX,
      to: sendTo,
      cc: sendCc,
      subject,
      bodyText: body.bodyText,
      bodyHtml,
      attachments: prepared.map((p) => p.attachment),
      saveToSentItems: true,
      senderEmail,
      senderName,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'send failed'
    for (const p of prepared) results.push({ sampleId: p.sampleId, ok: false, error })
    return NextResponse.json({ ok: false, results, error }, { status: 502 })
  }

  const today = new Date().toISOString().slice(0, 10)
  // Per-sample side effects: audit log, contract-doc annex, shipment_samples write-back.
  for (const p of prepared) {
    await (supabase as any)
      .from('email_messages')
      .insert({
        direction: 'outbound',
        status: 'sent',
        mailbox: QC_MAILBOX,
        from_email: QC_MAILBOX,
        sender_email: senderEmail ?? null,
        to_recipients: sendTo.map((e) => ({ email: e })),
        cc_recipients: (sendCc ?? []).map((e) => ({ email: e })),
        subject,
        body_text: body.bodyText,
        body_html: bodyHtml,
        contract_id: p.contractId,
        buyer_id: p.buyerId,
        seller_id: p.sellerId,
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        metadata: {
          source: 'batch_approval',
          sample_id: p.sampleId,
          decision: p.decision,
          side,
          company_id: body.companyId,
          sandbox: !!testTo,
          requested_to: to,
          requested_cc: cc,
        },
      })
      .then(undefined, (e: unknown) => console.error('[batch-send] log failed (non-fatal):', e))

    let certificatePath: string | null = null
    try {
      const { data: dt } = await supabase
        .from('document_types')
        .select('id')
        .eq('name', 'Quality Certificate')
        .eq('scope', 'contract')
        .maybeSingle()
      const storagePath = `${p.contractId}/quality-certificate-${p.tracking.replace(/\//g, '_')}.pdf`
      await supabase.storage
        .from('logistics-documents')
        .upload(storagePath, Buffer.from(p.attachment.bytes), { contentType: 'application/pdf', upsert: true })
      await supabase.from('documents').insert({
        contract_id: p.contractId,
        document_type_id: (dt as any)?.id ?? null,
        file_name: `${p.tracking}.pdf`,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        file_size: p.attachment.bytes.byteLength,
        source: 'manual',
        status: 'confirmed',
        created_by: user.id,
      })
      certificatePath = storagePath
    } catch (e) {
      console.error('[batch-send] annex failed (non-fatal):', e)
    }

    await applyShipmentSampleApproval(supabase, {
      contractId: p.contractId,
      waqcRef: p.tracking,
      decision: p.decision,
      userId: user.id,
      today,
      certificateUrl: certificatePath,
      initials: senderName ? getInitials(senderName) : null,
    })

    results.push({ sampleId: p.sampleId, ok: true })
  }

  return NextResponse.json({ ok: true, results })
}