import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import {
  resolvePanel,
  QC_CERTIFICATES_PURPOSE,
  type ContactRow,
} from '@/lib/approval-notification/resolve-panels'
import {
  resolveSampleContractsBatch,
  computeSendStatus,
  buildBatchUnits,
  getInitials,
  type BatchSampleInput,
  type SendStatusRow,
} from '@/lib/approval-notification/batch-send'
import {
  resolveCertificateParties,
  type CertificateParties,
  type SampleCounterparties,
} from '@/lib/approval-notification/certificate-parties'
import { fetchPriorSends } from '@/lib/approval-notification/prior-sends'
import { clampSendRange } from '@/lib/approval-notification/send-window'
import { filterByQcClients, summarizeQcClients } from '@/lib/approval-notification/qc-client-filter'
import {
  fetchQualitySampleSummaries,
  groupQualitySamples,
  buildQualitySummaryText,
  buildQualitySummaryHtml,
  buildQualityCoverNote,
  buildQualitySummarySubject,
  certUnitKey,
} from '@/lib/approval-notification/quality-summary'
import type { ApprovalDecision, ApprovalSide, PanelPrefill } from '@/lib/approval-notification/types'
import { isInternalEmail } from '@/lib/qc-contacts/tags'
import { labSourceId } from '@/lib/sample-group'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/** One certificate and the sample it belongs to. A contract sibling is a
 *  sample of its own (sample-group.ts): its own refs and sys contract, with
 *  the lab data on `lab_source_sample_id`. */
interface CertRow {
  id: string
  certificate_number: string | null
  is_rejected: boolean | null
  created_at: string | null
  sample_id: string | null
  sample: (SampleCounterparties & {
    id: string
    tracking_number: string | null
    container_nr: string | null
    sample_type: string | null
    contract_id: string | null
    status: string | null
    lab_source_sample_id: string | null
  }) | null
}

/** Per company, its saved QC-certificate contacts keyed by lower-cased email —
 *  the composer shows them by name and offers to save any other address. */
type SavedContacts = Record<string, Record<string, { name: string | null; isGroup: boolean; contactId: string }>>

export async function GET(req: NextRequest) {
  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(server as any, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const decisionsParam = sp.get('decisions')
  const wantDecisions = new Set<ApprovalDecision>(
    (decisionsParam ? decisionsParam.split(',') : ['approved', 'rejected'])
      .map((d) => d.trim())
      .filter((d): d is ApprovalDecision => d === 'approved' || d === 'rejected'),
  )
  // Explicit-selection mode: send a chosen set of samples to one side (buyer or
  // seller) regardless of date or prior-send status — used by the certificates
  // page "Send to buyer / Send to seller" buttons.
  const explicitIds = (sp.get('sampleIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const sideParam = sp.get('side')
  const onlySide: ApprovalSide | undefined =
    sideParam === 'buyer' || sideParam === 'seller' ? sideParam : undefined
  const explicitMode = explicitIds.length > 0
  // "Send unsent" asks first which QC clients have something left to send
  // (`view=clients`), then builds the queue for the ones kept (`clientIds`).
  const clientsView = sp.get('view') === 'clients'
  const clientParam = sp.get('clientIds')
  const chosenClients =
    clientParam === null ? null : new Set(clientParam.split(',').map((s) => s.trim()).filter(Boolean))

  const supabase = admin()

  // EVERY issued certificate in the range (or for the explicit set) — one per
  // sample, contract siblings included: they are samples, so nothing here can
  // drop them from the attachment list or the summary.
  let q = supabase
    .from('certificates')
    .select(
      `id, certificate_number, is_rejected, created_at, sample_id,
       sample:samples(id, deleted_at, tracking_number, container_nr, sample_type, wolthers_contract_nr, contract_id, status, lab_source_sample_id,
         client_id, importer_id, seller_id, exporter_id, buyer_contract_nr, seller_contract_nr)`,
    )
    .eq('status', 'issued')
  if (explicitMode) {
    q = q.in('sample_id', explicitIds)
  } else {
    // Four weeks at most, whatever was asked for: the range used to come from
    // the table's date filter, which is empty by default and swept up every
    // certificate ever issued.
    const range = clampSendRange(sp.get('from'), sp.get('to'), new Date().toISOString().slice(0, 10))
    q = q.gte('created_at', range.from).lte('created_at', `${range.to}T23:59:59`)
  }

  const { data: certData, error } = await q
  if (error) {
    console.error('[batch-queue] certificates fetch failed:', error)
    return NextResponse.json({ error: 'Failed to load certificates' }, { status: 500 })
  }

  // A deleted sample's certificate is kept for the audit, never queued for sending.
  let certs = ((certData ?? []) as unknown as CertRow[]).filter((c) => c.sample && !(c.sample as { deleted_at?: string | null }).deleted_at)
  if (chosenClients) certs = filterByQcClients(certs, (c) => c.sample!.client_id, chosenClients)
  if (certs.length === 0) {
    return NextResponse.json(
      clientsView ? { clients: [] } : { units: [], skipped: { noParties: 0, noRecipients: 0 }, savedContacts: {} },
    )
  }

  // One entry per certificate, keyed by `certUnitKey` (= its sample id). Each
  // resolves against its OWN sample's contract — a sibling carries its own
  // Wolthers number and sys link, never the lab unit's. A sample that links no
  // contract still names its QC client and seller (certificate-parties.ts).
  const unitKeyOf = (c: CertRow) => certUnitKey(c.sample!.id)
  const contexts = await resolveSampleContractsBatch(
    supabase,
    certs.map((c) => ({
      id: unitKeyOf(c),
      contract_id: c.sample!.contract_id,
      wolthers_contract_nr: c.sample!.wolthers_contract_nr,
    })),
  )
  const partiesByKey = new Map<string, CertificateParties>()
  for (const c of certs) {
    partiesByKey.set(unitKeyOf(c), resolveCertificateParties(c.sample!, contexts.get(unitKeyOf(c)) ?? null))
  }

  // Company names for every party and QC client; contacts for the parties.
  const partyIds = new Set<string>()
  for (const parties of partiesByKey.values()) {
    if (parties.buyerId) partyIds.add(parties.buyerId)
    if (parties.sellerId) partyIds.add(parties.sellerId)
  }
  const namedIds = new Set(partyIds)
  for (const c of certs) if (c.sample!.client_id) namedIds.add(c.sample!.client_id)
  const companyNameById = new Map<string, string>()
  if (namedIds.size > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, fantasy_name')
      .in('id', [...namedIds])
    for (const c of (companies ?? []) as any[]) {
      companyNameById.set(c.id, companyDisplayName(c) || c.id)
    }
  }

  // The client step only needs to know which certificates would go out, so it
  // skips recipients, reasons and the quality table.
  const panelsByCompany = new Map<string, PanelPrefill>()
  const savedContacts: SavedContacts = {}
  if (!clientsView && partyIds.size > 0) {
    const { data: contactRows } = await supabase
      .from('contacts')
      .select('id, company_id, email, name, nickname, role, is_primary, is_group, routing_purposes')
      .in('company_id', [...partyIds])
      .eq('is_active', true)
      .not('email', 'is', null)
    const raw = (contactRows ?? []) as any[]
    const rows: ContactRow[] = raw.map((r) => ({
      company_id: r.company_id,
      email: r.email,
      name: r.name,
      nickname: r.nickname ?? null,
      role: r.role,
      is_primary: r.is_primary,
      is_group_mailbox: r.is_group ?? null,
      routing_purposes: r.routing_purposes ?? null,
    }))
    for (const companyId of partyIds) {
      panelsByCompany.set(
        companyId,
        resolvePanel(rows, companyId, companyNameById.get(companyId) ?? null, QC_MAILBOX),
      )
    }
    for (const r of raw) {
      const email = String(r.email ?? '').trim()
      if (!email || isInternalEmail(email)) continue
      if (!Array.isArray(r.routing_purposes) || !r.routing_purposes.includes(QC_CERTIFICATES_PURPOSE)) continue
      const forCompany = savedContacts[r.company_id] ?? {}
      forCompany[email.toLowerCase()] = { name: r.name ?? null, isGroup: !!r.is_group, contactId: r.id }
      savedContacts[r.company_id] = forCompany
    }
  }

  // Most-recent rejection reasons (only surfaced for rejected lines). Lab data
  // lives on the LAB UNIT, so a sibling reads its group's assessment.
  const reasonByLab = new Map<string, string | null>()
  if (!clientsView) {
    const labIds = [...new Set(certs.map((c) => labSourceId(c.sample!)))]
    const { data: qaRows } = await supabase
      .from('quality_assessments')
      .select('sample_id, cupping_comments, grading_comments, created_at')
      .in('sample_id', labIds)
      .order('created_at', { ascending: false })
    for (const r of (qaRows ?? []) as any[]) {
      if (reasonByLab.has(r.sample_id)) continue // first = most recent
      const reason = [r.cupping_comments, r.grading_comments].filter((x) => x && String(x).trim()).join('\n') || null
      reasonByLab.set(r.sample_id, reason)
    }
  }

  // Prior sends (single-sample or batch) → drop already-sent (certificate, side)
  // pairs, matched on `metadata.sample_id`. A sibling's history was re-keyed to
  // its own sample id by the one-sample-per-contract migration, so a lab unit's
  // send never hides an unsent sibling and vice versa.
  const sampleIds = [...new Set(certs.map((c) => c.sample!.id))]
  let statusRows: SendStatusRow[]
  try {
    statusRows = await fetchPriorSends(supabase, sampleIds)
  } catch (e) {
    // Without the send history every certificate would look unsent and go out twice.
    console.error('[batch-queue] prior sends fetch failed:', e)
    return NextResponse.json({ error: 'Failed to load prior sends' }, { status: 500 })
  }
  const required = new Map<string, { buyer: boolean; seller: boolean }>()
  for (const [key, parties] of partiesByKey) {
    required.set(key, { buyer: !!parties.buyerId, seller: !!parties.sellerId })
  }
  const sendStatus = computeSendStatus(statusRows, required)

  // Assemble batch inputs.
  let noParties = 0
  const inputs: BatchSampleInput[] = []
  for (const c of certs) {
    const sample = c.sample!
    const parties = partiesByKey.get(unitKeyOf(c))!
    if (!parties.buyerId && !parties.sellerId) {
      noParties++
      continue
    }
    const decision: ApprovalDecision = c.is_rejected ? 'rejected' : 'approved'
    if (!wantDecisions.has(decision)) continue
    // Every line shows its own sample's container / Wolthers number.
    inputs.push({
      sampleId: sample.id,
      buyerId: parties.buyerId,
      sellerId: parties.sellerId,
      buyerReference: parties.buyerReference,
      sellerReference: parties.sellerReference,
      date: c.created_at ?? null,
      line: {
        containerNr: sample.container_nr ?? null,
        certNumber: c.certificate_number ?? sample.tracking_number ?? null,
        contractNumber: parties.contractNumber,
        decision,
        reason: reasonByLab.get(labSourceId(sample)) ?? null,
      },
    })
  }

  const units = buildBatchUnits(inputs, sendStatus, panelsByCompany, companyNameById, {
    onlySide,
    includeAlreadySent: explicitMode,
  })

  if (clientsView) {
    const clientBySample = new Map(certs.map((c) => [c.sample!.id, c.sample!.client_id]))
    return NextResponse.json({ clients: summarizeQcClients(units, clientBySample, companyNameById) })
  }

  // Attach the quality summary table to every unit. Both sides get the same
  // table (screen / defects / type / cup); buyers keep certs attached and group
  // by seller, sellers attach nothing and group by QC client. The unit body
  // becomes an editable cover note; the table is rebuilt authoritatively at send.
  if (units.length > 0) {
    const allSampleIds = [...new Set(units.flatMap((u) => u.samples.map((s) => s.sampleId)))]
    const summaries = await fetchQualitySampleSummaries(supabase, allSampleIds)
    for (const u of units) {
      const list = u.samples
        .map((s) => summaries.get(certUnitKey(s.sampleId)))
        .filter((s): s is NonNullable<typeof s> => !!s)
      if (list.length === 0) continue
      // Tolerance fields (toleranceItems / toleranceComments /
      // requestAdditionalSample) are already on `list` for every unit —
      // fetchQualitySampleSummaries is the single enrichment site now. The
      // buyer/seller split is enforced entirely by the render guard
      // (`opts.sellerComment` in buildQualitySummaryHtml), not by withholding
      // the fields here.
      // Default attachment policy — buyers get the PDFs, sellers don't. The
      // composer turns this into a checkbox the sender can flip either way.
      const attached = u.side === 'buyer'
      const groups = groupQualitySamples(list, u.side === 'seller' ? 'qcClient' : 'seller')
      // Audience follows the SIDE, never the attachment choice: it selects the
      // reference columns (buyer: Sample + Buyer ref; seller: Sample + Wolthers +
      // Seller ref) and whether the seller note is shown (sellers only).
      const audience: 'buyer' | 'seller' = u.side
      const sumOpts = { sellerComment: audience === 'seller', audience }
      u.body = buildQualityCoverNote(u.greeting, attached)
      u.subject = buildQualitySummarySubject(groups, u.side)
      u.summaryText = buildQualitySummaryText(groups, sumOpts)
      u.summaryHtml = buildQualitySummaryHtml(groups, sumOpts)
      u.attachCertificates = attached
    }
  }

  // Certificates in scope that produced no unit and aren't already fully sent →
  // no recipients.
  const covered = new Set<string>()
  for (const u of units) for (const s of u.samples) covered.add(certUnitKey(s.sampleId))
  let noRecipients = 0
  for (const inp of inputs) {
    const key = certUnitKey(inp.sampleId)
    if (covered.has(key)) continue
    if (sendStatus.get(key)?.full) continue
    noRecipients++
  }

  return NextResponse.json({
    units,
    skipped: { noParties, noRecipients },
    savedContacts,
    // Convenience for any caller that wants initials without re-deriving.
    senderInitials: getInitials(user.user_metadata?.full_name as string | undefined),
  })
}
