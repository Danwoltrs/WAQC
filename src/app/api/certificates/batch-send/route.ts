import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { sendMail, type GraphSendAttachment } from '@/lib/graph/send'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { renderCertificatePdfBuffer } from '@/lib/certificate-render'
import { composeBodyHtml } from '@/lib/email/compose-html'
import { isValidEmail } from '@/lib/html'
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
  certUnitKey,
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

/** One certificate to send: the sample's mother certificate when
 *  `sampleContractId` is null, otherwise that commercial split's own. */
interface CertRef {
  sampleId: string
  sampleContractId?: string | null
}

interface Body {
  side: ApprovalSide
  companyId: string
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  /** Preferred: one entry per certificate (mother + each sub-contract). */
  certificates?: CertRef[]
  /** Legacy: sample ids only — treated as their mother certificates. */
  sampleIds?: string[]
  includeSignature?: boolean
}

interface Valid {
  sampleId: string
  /** Null for the mother certificate; the split's id for a sub-contract cert. */
  sampleContractId: string | null
  /** waqc_ref that keys this certificate's sys rows: the split's own tracking
   *  number for a sub-contract, else the sample's. */
  tracking: string
  decision: ApprovalDecision
  /** WAQC sample_type ('pss' | 'ss' | …). MUST reach the sys write-back:
   *  applyShipmentSampleApproval defaults to 'pss', so an SS send without it
   *  claims/clobbers the contract's PSS row on sys. */
  sampleType: string
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
  // Seller note shown to sellers only (the seller email has no attachments).
  // Audience selects the reference columns: buyers see Sample + Buyer ref;
  // sellers see Sample + Wolthers + Seller ref.
  const audience: 'buyer' | 'seller' = opts.attached ? 'buyer' : 'seller'
  const sumOpts = { sellerComment: !opts.attached, audience }
  const summaryText = buildQualitySummaryText(groups, sumOpts)
  const summaryHtml = buildQualitySummaryHtml(groups, sumOpts)
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
  const to = (body.to ?? []).map((e) => e?.trim()).filter(Boolean)
  const cc = (body.cc ?? []).map((e) => e?.trim()).filter(Boolean)
  // One entry per certificate. `sampleIds` (legacy) means mother certificates.
  const certRefs: CertRef[] = []
  const seenRefs = new Set<string>()
  const requested: CertRef[] =
    body.certificates ?? (body.sampleIds ?? []).map((sampleId) => ({ sampleId, sampleContractId: null }))
  for (const r of requested) {
    if (!r?.sampleId) continue
    const key = certUnitKey(r.sampleId, r.sampleContractId ?? null)
    if (seenRefs.has(key)) continue
    seenRefs.add(key)
    certRefs.push({ sampleId: r.sampleId, sampleContractId: r.sampleContractId ?? null })
  }
  if (!body.subject || !body.bodyText || to.length === 0 || certRefs.length === 0) {
    return NextResponse.json({ error: 'side, to, subject, bodyText and certificates are required' }, { status: 400 })
  }
  // Recipients come from the shared contacts table, which sys writes without
  // format validation — a paste artifact like "user@domain.nl)," makes Graph
  // reject the whole send with an opaque 400 ErrorInvalidRecipients. Name the
  // bad address so the sender can fix the contact instead of guessing.
  const invalidRecipients = [...to, ...cc].filter((e) => !isValidEmail(e))
  if (invalidRecipients.length > 0) {
    return NextResponse.json(
      { error: `Invalid recipient email address: ${invalidRecipients.join(', ')} — fix this contact and try again` },
      { status: 400 },
    )
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

  // Split rows for the sub-contract certificates in this unit. Each split is its
  // OWN commercial contract (own Wolthers number, buyer ref and tracking number),
  // so it resolves against that contract, not the mother's.
  const subIds = [...new Set(certRefs.map((r) => r.sampleContractId).filter((x): x is string => !!x))]
  const subById = new Map<string, any>()
  if (subIds.length > 0) {
    const { data: subRows } = await supabase
      .from('sample_contracts')
      .select('id, sample_id, tracking_number, buyer_contract_nr, wolthers_contract_nr, contract_id')
      .in('id', subIds)
    for (const r of (subRows ?? []) as any[]) subById.set(r.id, r)
  }

  // Validate access + resolve contract; buyers additionally need the cert PDF.
  const accessBySample = new Map<string, boolean>()
  const sampleCache = new Map<string, any>()
  for (const ref of certRefs) {
    const sampleId = ref.sampleId
    const subId = ref.sampleContractId ?? null
    if (!accessBySample.has(sampleId)) {
      const access = await canUserManageSample(server as any, user.id, sampleId)
      accessBySample.set(sampleId, access.allowed)
    }
    if (!accessBySample.get(sampleId)) {
      results.push({ sampleId, ok: false, error: 'forbidden' })
      continue
    }
    if (!sampleCache.has(sampleId)) {
      const { data: sample } = await supabase
        .from('samples')
        .select('id, tracking_number, status, sample_type, contract_id, wolthers_contract_nr, buyer_contract_nr')
        .eq('id', sampleId)
        .single()
      sampleCache.set(sampleId, sample ?? null)
    }
    const s = sampleCache.get(sampleId)
    if (!s) {
      results.push({ sampleId, ok: false, error: 'sample not found' })
      continue
    }
    if (s.status !== 'approved' && s.status !== 'rejected') {
      results.push({ sampleId, ok: false, error: 'not approved/rejected' })
      continue
    }

    const sub = subId ? subById.get(subId) : null
    // Access was checked against `sampleId`, so the split MUST belong to it —
    // otherwise a crafted body could attach another sample's certificate.
    if (subId && (!sub || sub.sample_id !== sampleId)) {
      results.push({ sampleId, ok: false, error: 'sub-contract not found' })
      continue
    }
    // All-or-nothing key choice: a split declaring neither key belongs to the
    // mother's contract (mixing them would resolve the wrong contract, since the
    // FK wins in `contractLookup`).
    const ctx = await resolveSampleContract(
      supabase,
      sub && (sub.contract_id || sub.wolthers_contract_nr)
        ? { contract_id: sub.contract_id, wolthers_contract_nr: sub.wolthers_contract_nr }
        : s,
    )
    if (!ctx) {
      results.push({ sampleId, ok: false, error: 'no contract' })
      continue
    }

    let attachment: GraphSendAttachment | undefined
    if (!isSeller) {
      let certQuery = supabase
        .from('certificates')
        .select('id, pdf_url, certificate_number')
        .eq('sample_id', sampleId)
      certQuery = subId ? certQuery.eq('sample_contract_id', subId) : certQuery.is('sample_contract_id', null)
      const { data: cert } = await certQuery.limit(1).maybeSingle()
      if (!cert) {
        results.push({ sampleId, ok: false, error: 'no certificate' })
        continue
      }
      let pdf: Buffer | null = null
      if ((cert as any).pdf_url) pdf = await getCachedCertificatePdf(supabase, (cert as any).pdf_url)
      if (!pdf) {
        // The split id makes the renderer produce THAT split's certificate
        // (its own number and parties) instead of the mother's.
        pdf = await renderCertificatePdfBuffer(supabase, sampleId, subId)
        if (pdf) uploadCertificatePdf(supabase, sampleId, (cert as any).id, pdf, subId ?? undefined).catch(() => {})
      }
      if (!pdf) {
        results.push({ sampleId, ok: false, error: 'certificate could not be generated' })
        continue
      }
      attachment = {
        name: buildCertificateFilename(
          (cert as any).certificate_number ?? sub?.tracking_number ?? s.tracking_number,
          // A split's filename carries ITS buyer reference; borrowing the
          // mother's would name the wrong contract.
          sub ? sub.buyer_contract_nr : s.buyer_contract_nr,
        ),
        contentType: 'application/pdf',
        bytes: new Uint8Array(pdf),
      }
    }

    valid.push({
      sampleId,
      sampleContractId: subId,
      // The split's own tracking number keys its sys rows, with the rejection
      // "R-" prefix stripped so the claim ref is stable across approve/reject.
      // The mother keeps its raw tracking number — both mirror the instant
      // decision write-back, so a resend claims the same rows it did.
      tracking: sub?.tracking_number
        ? String(sub.tracking_number).replace(/^R-/, '')
        : (s.tracking_number as string),
      decision: s.status as ApprovalDecision,
      sampleType: (s.sample_type as string) ?? 'pss',
      contractId: ctx.contractId,
      buyerId: ctx.buyerId,
      sellerId: ctx.sellerId,
      attachment,
    })
  }

  if (valid.length === 0) {
    return NextResponse.json({ ok: false, results, error: 'No deliverable samples in this unit' }, { status: 400 })
  }

  // Build the quality summary table (authoritative, from the database) — one row
  // per certificate actually going out, splits included.
  const summaries = await fetchQualitySampleSummaries(supabase, valid.map((v) => v.sampleId))
  const summaryList = valid
    .map((v) => summaries.get(certUnitKey(v.sampleId, v.sampleContractId)))
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
          // Which certificate this row covers (null = mother). The queue reads
          // it back so a sent mother never suppresses an unsent split.
          sample_contract_id: v.sampleContractId,
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
        // Resend guard: deterministic storage path per contract+tracking — an
        // existing documents row means the cert is already annexed (the upsert
        // above refreshed the file bytes).
        const { data: existingDoc } = await supabase
          .from('documents')
          .select('id')
          .eq('storage_path', storagePath)
          .is('archived_at', null)
          .maybeSingle()
        if (!existingDoc) {
          // source 'outbound' + status 'forwarded' is the sys convention for
          // system-generated docs sent to counterparties; 'confirmed' is NOT an
          // allowed documents.status (CHECK constraint) and used to make this
          // insert silently fail.
          const { error: docErr } = await supabase.from('documents').insert({
            contract_id: v.contractId,
            document_type_id: (dt as any)?.id ?? null,
            // Certificate-number based (buildCertificateFilename) — lab tracking
            // numbers must never surface on sys.
            file_name: v.attachment.name,
            storage_path: storagePath,
            mime_type: 'application/pdf',
            file_size: v.attachment.bytes.byteLength,
            source: 'outbound',
            status: 'forwarded',
            created_by: user.id,
          })
          if (docErr) {
            console.error('[batch-send] documents insert failed (non-fatal):', docErr)
          }
        }
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
        sampleType: v.sampleType,
      })
    }

    results.push({ sampleId: v.sampleId, ok: true })
  }

  return NextResponse.json({ ok: true, results })
}
