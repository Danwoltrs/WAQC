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
import { HOUSE_CC } from '@/lib/approval-notification/resolve-panels'
import {
  fetchQualitySampleSummaries,
  groupQualitySamples,
  buildQualitySummaryText,
  buildQualitySummaryHtml,
  type QualitySampleSummary,
} from '@/lib/approval-notification/quality-summary'
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

interface Valid {
  sampleId: string
  tracking: string
  decision: ApprovalDecision
  contractId: string
  buyerId: string | null
  sellerId: string | null
  attachment?: GraphSendAttachment // buyer units only
}

const dedupeEmails = (list: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of list.filter(Boolean)) {
    const k = e.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(e)
    }
  }
  return out
}

/** Cover note (editable, from the composer) + the quality table + sign-off. */
function composeQualityBody(
  coverNote: string,
  groups: ReturnType<typeof groupQualitySamples>,
  opts: { attached: boolean; signatureHtml: string | null; includeSig: boolean },
): { text: string; html: string } {
  const summaryText = buildQualitySummaryText(groups)
  const summaryHtml = buildQualitySummaryHtml(groups)
  const sig = opts.includeSig ? opts.signatureHtml : null
  const text = `${coverNote}\n\n${summaryText}${sig ? '' : '\n\nBest regards,\nWolthers & Associates'}`
  const coverHtml = composeBodyHtml(coverNote, null)
  const html =
    `${coverHtml}<br/>${summaryHtml}` +
    (sig ? `<br/>${sig}` : `<br/>${composeBodyHtml('Best regards,\nWolthers & Associates', null)}`)
  return { text, html }
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
  const isSeller = side === 'seller'

  const results: { sampleId: string; ok: boolean; error?: string }[] = []
  const valid: Valid[] = []

  // Validate access + resolve contract; buyers additionally need the cert PDF.
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

    let attachment: GraphSendAttachment | undefined
    if (!isSeller) {
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
      attachment = {
        name: buildCertificateFilename((cert as any).certificate_number ?? s.tracking_number, s.buyer_contract_nr),
        contentType: 'application/pdf',
        bytes: new Uint8Array(pdf),
      }
    }

    valid.push({
      sampleId,
      tracking: s.tracking_number as string,
      decision: s.status as ApprovalDecision,
      contractId: ctx.contractId,
      buyerId: ctx.buyerId,
      sellerId: ctx.sellerId,
      attachment,
    })
  }

  if (valid.length === 0) {
    return NextResponse.json({ ok: false, results, error: 'No deliverable samples in this unit' }, { status: 400 })
  }

  // Build the quality summary table (authoritative, from the database).
  const summaries = await fetchQualitySampleSummaries(supabase, valid.map((v) => v.sampleId))
  const summaryList = valid
    .map((v) => summaries.get(v.sampleId))
    .filter((s): s is QualitySampleSummary => !!s)
  const groups = groupQualitySamples(summaryList, isSeller ? 'qcClient' : 'seller')
  const { text: bodyText, html: bodyHtml } = composeQualityBody(body.bodyText, groups, {
    attached: !isSeller,
    signatureHtml,
    includeSig: body.includeSignature !== false,
  })

  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const sendTo = testTo ? [testTo] : to
  // Locked: always copy head office (and the QC mailbox) on every real send.
  const sendCc = testTo ? undefined : dedupeEmails([...cc, HOUSE_CC])
  const subject = testTo ? `[TEST] ${body.subject}` : body.subject

  try {
    await sendMail({
      mailbox: QC_MAILBOX,
      to: sendTo,
      cc: sendCc,
      subject,
      bodyText,
      bodyHtml,
      attachments: isSeller ? [] : valid.map((v) => v.attachment!).filter(Boolean),
      saveToSentItems: true,
      senderEmail,
      senderName,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'send failed'
    for (const v of valid) results.push({ sampleId: v.sampleId, ok: false, error })
    return NextResponse.json({ ok: false, results, error }, { status: 502 })
  }

  const today = new Date().toISOString().slice(0, 10)
  for (const v of valid) {
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
        body_text: bodyText,
        body_html: bodyHtml,
        contract_id: v.contractId,
        buyer_id: v.buyerId,
        seller_id: v.sellerId,
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        metadata: {
          source: 'batch_approval',
          sample_id: v.sampleId,
          decision: v.decision,
          side,
          company_id: body.companyId,
          sandbox: !!testTo,
          requested_to: to,
          requested_cc: cc,
        },
      })
      .then(undefined, (e: unknown) => console.error('[batch-send] log failed (non-fatal):', e))

    // Buyers: annex the cert to the contract documents and write the decision
    // back to shipment_samples. Sellers receive no certificate and the decision
    // was already written at approval time, so the seller send only logs.
    if (!isSeller && v.attachment) {
      let certificatePath: string | null = null
      try {
        const { data: dt } = await supabase
          .from('document_types')
          .select('id')
          .eq('name', 'Quality Certificate')
          .eq('scope', 'contract')
          .maybeSingle()
        const storagePath = `${v.contractId}/quality-certificate-${v.tracking.replace(/\//g, '_')}.pdf`
        await supabase.storage
          .from('logistics-documents')
          .upload(storagePath, Buffer.from(v.attachment.bytes), { contentType: 'application/pdf', upsert: true })
        await supabase.from('documents').insert({
          contract_id: v.contractId,
          document_type_id: (dt as any)?.id ?? null,
          file_name: `${v.tracking}.pdf`,
          storage_path: storagePath,
          mime_type: 'application/pdf',
          file_size: v.attachment.bytes.byteLength,
          source: 'manual',
          status: 'confirmed',
          created_by: user.id,
        })
        certificatePath = storagePath
      } catch (e) {
        console.error('[batch-send] annex failed (non-fatal):', e)
      }

      await applyShipmentSampleApproval(supabase, {
        contractId: v.contractId,
        waqcRef: v.tracking,
        decision: v.decision,
        userId: user.id,
        today,
        certificateUrl: certificatePath,
        initials: senderName ? getInitials(senderName) : null,
      })
    }

    results.push({ sampleId: v.sampleId, ok: true })
  }

  return NextResponse.json({ ok: true, results })
}
