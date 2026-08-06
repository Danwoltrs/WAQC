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
import type { ApprovalDecision, ApprovalSide } from '@/lib/approval-notification/types'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

/** De-duplicate emails case-insensitively, preserving order. */
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
    .select('id, tracking_number, status, sample_type, contract_id, wolthers_contract_nr, buyer_contract_nr')
    .eq('id', id)
    .single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
  const s = sample as any
  if (s.status !== 'approved' && s.status !== 'rejected') {
    return NextResponse.json({ error: 'Sample is not approved/rejected' }, { status: 400 })
  }
  const ctx = await resolveSampleContract(supabase, s)
  if (!ctx) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  const decision = s.status as ApprovalDecision
  const tracking = s.tracking_number as string
  const contractId = ctx.contractId
  const contract = { buyer_id: ctx.buyerId, seller_id: ctx.sellerId }

  // Certificate bytes (shared across panels). A sample with commercial splits has
  // SEVERAL certificates — the mother plus one per `sample_contracts` row — and
  // every one of them must ride along; attaching only the mother left the
  // counterparty without the split certificates entirely.
  interface CertUnit {
    attachment: GraphSendAttachment
    /** The sys contract this certificate belongs to (the split's own, if any). */
    contractId: string
    /** waqc_ref keying this certificate's sys rows. */
    tracking: string
  }
  const certUnits: CertUnit[] = []
  if (body.includeCertificate !== false) {
    const { data: certRows } = await supabase
      .from('certificates')
      .select('id, pdf_url, certificate_number, sample_contract_id')
      .eq('sample_id', id)
      .eq('status', 'issued')
    const certs = (certRows ?? []) as any[]
    if (certs.length === 0) {
      return NextResponse.json({ error: 'No certificate for this sample' }, { status: 400 })
    }

    const subIds = [...new Set(certs.map((c) => c.sample_contract_id).filter(Boolean))] as string[]
    const subById = new Map<string, any>()
    if (subIds.length > 0) {
      const { data: subRows } = await supabase
        .from('sample_contracts')
        .select('id, tracking_number, buyer_contract_nr, wolthers_contract_nr, contract_id')
        .in('id', subIds)
      for (const r of (subRows ?? []) as any[]) subById.set(r.id, r)
    }
    // Mother first, then the splits in a stable order.
    certs.sort(
      (a, b) =>
        (a.sample_contract_id ? 1 : 0) - (b.sample_contract_id ? 1 : 0) ||
        String(a.certificate_number ?? '').localeCompare(String(b.certificate_number ?? '')),
    )

    for (const cert of certs) {
      const subId = (cert.sample_contract_id as string) ?? null
      const sub = subId ? subById.get(subId) : null
      if (subId && !sub) continue
      // All-or-nothing key choice: a split declaring neither key belongs to the
      // mother's contract (the FK wins in `contractLookup`, so mixing the two
      // would resolve the wrong contract).
      const unitCtx =
        sub && (sub.contract_id || sub.wolthers_contract_nr)
          ? await resolveSampleContract(supabase, {
              contract_id: sub.contract_id,
              wolthers_contract_nr: sub.wolthers_contract_nr,
            })
          : ctx
      if (!unitCtx) continue

      let pdf: Buffer | null = null
      if (cert.pdf_url) pdf = await getCachedCertificatePdf(supabase, cert.pdf_url)
      if (!pdf) {
        // The split id makes the renderer produce THAT split's certificate
        // (its own number and parties) instead of the mother's.
        pdf = await renderCertificatePdfBuffer(supabase, id, subId)
        if (!pdf) {
          // The mother failing is fatal; a single split failing is not — the
          // rest of the certificates should still go out.
          if (!subId) {
            return NextResponse.json({ error: 'Certificate could not be generated' }, { status: 500 })
          }
          console.error('[notify-approval] split certificate render failed:', subId)
          continue
        }
        uploadCertificatePdf(supabase, id, cert.id, pdf, subId ?? undefined).catch(() => {})
      }
      certUnits.push({
        attachment: {
          // Use the official certificate number (the buyer-facing number), not the
          // sample's internal lab tracking number, for the attachment filename.
          name: buildCertificateFilename(
            cert.certificate_number ?? sub?.tracking_number ?? tracking,
            // A split's filename carries ITS buyer reference; borrowing the
            // mother's would name the wrong contract.
            sub ? sub.buyer_contract_nr : s.buyer_contract_nr,
          ),
          contentType: 'application/pdf',
          bytes: new Uint8Array(pdf),
        },
        contractId: unitCtx.contractId,
        // The split's own tracking number keys its sys rows, "R-" stripped so the
        // claim ref is stable across approve/reject; the mother keeps its raw one.
        tracking: sub?.tracking_number ? String(sub.tracking_number).replace(/^R-/, '') : tracking,
      })
    }
    if (certUnits.length === 0) {
      return NextResponse.json({ error: 'Certificate could not be generated' }, { status: 500 })
    }
  }

  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const results: { side: ApprovalSide; ok: boolean; error?: string }[] = []

  for (const panel of panels) {
    const to = testTo ? [testTo] : panel.to
    // Locked: always copy head office on every real send.
    const cc = testTo ? undefined : dedupeEmails([...(panel.cc ?? []), HOUSE_CC])
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
        attachments: certUnits.length > 0 ? certUnits.map((u) => u.attachment) : undefined,
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

  // Annex EACH certificate to its own sys contract's Docs. NOT gated on send
  // success — the certificate exists regardless of whether an email went out,
  // and the Docs tab should always carry it.
  const pathByUnit = new Map<CertUnit, string>()
  for (const unit of certUnits) {
    try {
      const { data: dt } = await supabase
        .from('document_types')
        .select('id')
        .eq('name', 'Quality Certificate')
        .eq('scope', 'contract')
        .maybeSingle()
      const storagePath = `${unit.contractId}/quality-certificate-${unit.tracking.replace(/\//g, '_')}.pdf`
      await supabase.storage
        .from('logistics-documents')
        .upload(storagePath, Buffer.from(unit.attachment.bytes), { contentType: 'application/pdf', upsert: true })
      // Resend guard: the storage path is deterministic per contract+tracking,
      // so an existing documents row means this cert is already annexed (the
      // upsert above refreshed the file bytes).
      const { data: existingDoc } = await supabase
        .from('documents')
        .select('id')
        .eq('storage_path', storagePath)
        .is('archived_at', null)
        .maybeSingle()
      if (!existingDoc) {
        // source 'outbound' + status 'forwarded' is the sys convention for
        // system-generated docs sent to counterparties (see sys contracts/send);
        // 'confirmed' is NOT an allowed documents.status and the insert would
        // silently violate the CHECK constraint.
        const { error: docErr } = await supabase.from('documents').insert({
          contract_id: unit.contractId,
          document_type_id: (dt as any)?.id ?? null,
          // Certificate-number based (buildCertificateFilename) — lab tracking
          // numbers must never surface on sys.
          file_name: unit.attachment.name,
          storage_path: storagePath,
          mime_type: 'application/pdf',
          file_size: unit.attachment.bytes.byteLength,
          source: 'outbound',
          status: 'forwarded',
          created_by: user.id,
        })
        if (docErr) {
          console.error('[notify-approval] documents insert failed (non-fatal):', docErr)
        }
      }
      pathByUnit.set(unit, storagePath)
    } catch (e) {
      console.error('[notify-approval] annex failed (non-fatal):', e)
    }
  }

  // Mark the sys shipment_samples rows approved (insert if missing) — once per
  // certificate, since each split keys its own rows on its own contract. When no
  // email actually went out we still persist the certificate_url (syncOnly
  // keeps the decision-time approver/date stamped by the instant write-back).
  const writebackUnits: Array<{ contractId: string; tracking: string; certificateUrl: string | null }> =
    certUnits.length > 0
      ? certUnits.map((u) => ({ contractId: u.contractId, tracking: u.tracking, certificateUrl: pathByUnit.get(u) ?? null }))
      : [{ contractId, tracking, certificateUrl: null }]
  const anyPath = writebackUnits.some((u) => u.certificateUrl)
  if (anySent || anyPath) {
    for (const unit of writebackUnits) {
      await applyShipmentSampleApproval(supabase, {
        contractId: unit.contractId,
        waqcRef: unit.tracking,
        decision,
        userId: user.id,
        today: new Date().toISOString().slice(0, 10),
        certificateUrl: unit.certificateUrl,
        comments: body.comments ?? null,
        initials: senderName ? getInitials(senderName) : null,
        // Without the type, the write-back defaults to 'pss' and an SS send
        // claims/clobbers the contract's PSS row on sys.
        sampleType: (s.sample_type as string) ?? 'pss',
        syncOnly: !anySent,
      })
    }
  }

  return NextResponse.json({ ok: anySent, results })
}
