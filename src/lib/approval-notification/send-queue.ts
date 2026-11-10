import type { SupabaseClient } from '@supabase/supabase-js'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { shownCertificateNumber } from '@/lib/sample-reference'
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
  type RequiredParties,
  type SendStatusRow,
} from '@/lib/approval-notification/batch-send'
import {
  audienceOf,
  certificatePartyCompanies,
  requiredParties,
  resolveCertificateParties,
  summarizeParties,
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
import {
  ALL_PARTIES,
  type ApprovalDecision,
  type CertificateParty,
  type PanelPrefill,
} from '@/lib/approval-notification/types'
import { isInternalEmail } from '@/lib/qc-contacts/tags'
import { labSourceId } from '@/lib/sample-group'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

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

export interface SendQueueOptions {
  wantDecisions: Set<ApprovalDecision>
  /** Explicit selection: these samples, whatever their date (importers and
   *  roasters included before go-live). Pairs already sent are still dropped
   *  unless `includeAlreadySent`. */
  explicitIds: string[]
  /** Which parties to build; all when omitted. */
  parties?: Set<CertificateParty>
  /** Explicit selection only: keep pairs already sent. */
  includeAlreadySent?: boolean
  /** Date range (clamped to four weeks) when no explicit selection. */
  from?: string | null
  to?: string | null
  /** "Send unsent" first step: which QC clients have something left. */
  clientsView: boolean
  chosenClients: Set<string> | null
  /** Send dropdown: answer only which parties the selection has (`{ parties }`),
   *  with no contact, recipient or sent-history lookups. */
  partiesView?: boolean
}

/**
 * The QC clients whose certificates go to every party (not only to them).
 * Fails closed: on a read error it logs and returns an empty set, so a PDF
 * stays with the client alone.
 */
export async function fetchShareWithAllClients(db: SupabaseClient<any>, clientIds: string[]): Promise<Set<string>> {
  if (clientIds.length === 0) return new Set()
  const { data, error } = await db
    .from('qc_client_settings')
    .select('company_id')
    .in('company_id', clientIds)
    .eq('certificates_to_all_parties', true)
  if (error) {
    console.error('[batch-queue] share-with-all read failed:', error)
    return new Set()
  }
  return new Set(((data ?? []) as Array<{ company_id: string }>).map((r) => r.company_id))
}

export interface SendQueueResult {
  status: number
  body: Record<string, unknown>
}

/**
 * The send queue: one unit per (company, party), a seller split further by QC
 * client, with recipients from contacts tagged qc_certificates, subject, cover
 * note and quality table. Shared by the composer's queue route and the
 * automatic seller email of an approval with comments, so both address and
 * word the email the same way.
 */
export async function loadSendQueue(supabase: SupabaseClient<any>, opts: SendQueueOptions): Promise<SendQueueResult> {
  const { wantDecisions, explicitIds, clientsView, chosenClients } = opts
  const explicitMode = explicitIds.length > 0
  // The Send dropdown answers for an explicit selection only: an empty one lists
  // nobody (it must not fall through to the date-range branch).
  if (opts.partiesView && !explicitMode) return { status: 200, body: { parties: [] } }

  // EVERY issued certificate in the range (or for the explicit set) — one per
  // sample, contract siblings included: they are samples, so nothing here can
  // drop them from the attachment list or the summary.
  let q = supabase
    .from('certificates')
    .select(
      `id, certificate_number, is_rejected, created_at, sample_id,
       sample:samples(id, deleted_at, tracking_number, container_nr, sample_type, wolthers_contract_nr, contract_id, status, lab_source_sample_id,
         client_id, importer_id, roaster_id, seller_id, exporter_id, buyer_contract_nr, seller_contract_nr)`,
    )
    .eq('status', 'issued')
  if (explicitMode) {
    q = q.in('sample_id', explicitIds)
  } else {
    // Four weeks at most, whatever was asked for: the range used to come from
    // the table's date filter, which is empty by default and swept up every
    // certificate ever issued.
    const range = clampSendRange(opts.from ?? null, opts.to ?? null, new Date().toISOString().slice(0, 10))
    q = q.gte('created_at', range.from).lte('created_at', `${range.to}T23:59:59`)
  }

  const { data: certData, error } = await q
  if (error) {
    console.error('[batch-queue] certificates fetch failed:', error)
    return { status: 500, body: { error: 'Failed to load certificates' } }
  }

  // A deleted sample's certificate is kept for the audit, never queued for sending.
  let certs = ((certData ?? []) as unknown as CertRow[]).filter((c) => c.sample && !(c.sample as { deleted_at?: string | null }).deleted_at)
  // Same decision filter the send applies, so no party is listed whose certificates the queue skips.
  if (opts.partiesView) certs = certs.filter((c) => wantDecisions.has(c.is_rejected ? 'rejected' : 'approved'))
  if (chosenClients) certs = filterByQcClients(certs, (c) => c.sample!.client_id, chosenClients)
  if (certs.length === 0) {
    return {
      status: 200,
      body: opts.partiesView
        ? { parties: [] }
        : clientsView ? { clients: [] } : { units: [], skipped: { noParties: 0, noRecipients: 0 }, savedContacts: {} },
    }
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
    if (parties.importerId) partyIds.add(parties.importerId)
    if (parties.roasterId) partyIds.add(parties.roasterId)
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

  // The Send dropdown only needs who is on the selection: no contacts, no
  // sent-history filter (the popover shows who could be sent to).
  if (opts.partiesView) {
    return {
      status: 200,
      body: { parties: summarizeParties([...partiesByKey.values()], (id) => companyNameById.get(id) ?? id) },
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
    return { status: 500, body: { error: 'Failed to load prior sends' } }
  }
  const createdAtByKey = new Map(certs.map((c) => [unitKeyOf(c), c.created_at ?? null]))
  const required = new Map<string, RequiredParties>()
  for (const [key, parties] of partiesByKey) {
    required.set(key, requiredParties(parties, createdAtByKey.get(key) ?? null))
  }
  const sendStatus = computeSendStatus(statusRows, required)

  // QC clients that share their certificates with every party. The client step
  // does not build emails, so it skips the read.
  const shareClients = clientsView
    ? new Set<string>()
    : await fetchShareWithAllClients(
        supabase,
        [...new Set(certs.map((c) => c.sample!.client_id).filter((id): id is string => !!id))],
      )

  // Assemble batch inputs.
  let noParties = 0
  const inputs: BatchSampleInput[] = []
  for (const c of certs) {
    const sample = c.sample!
    const parties = partiesByKey.get(unitKeyOf(c))!
    if (certificatePartyCompanies(parties).length === 0) {
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
      importerId: parties.importerId,
      roasterId: parties.roasterId,
      qcClientId: sample.client_id,
      shareWithAll: !!sample.client_id && shareClients.has(sample.client_id),
      buyerReference: parties.buyerReference,
      sellerReference: parties.sellerReference,
      date: c.created_at ?? null,
      line: {
        containerNr: sample.container_nr ?? null,
        // Never the internal SAN- lab number, not even a legacy certificate
        // issued under one: the line then shows container / ref only.
        certNumber: shownCertificateNumber(c.certificate_number),
        contractNumber: parties.contractNumber,
        decision,
        reason: reasonByLab.get(labSourceId(sample)) ?? null,
      },
    })
  }

  const units = buildBatchUnits(inputs, sendStatus, panelsByCompany, companyNameById, {
    parties: opts.parties,
    ...(explicitMode ? { includeAlreadySent: opts.includeAlreadySent, includePreGoLive: true } : {}),
  })

  if (clientsView) {
    const clientBySample = new Map(certs.map((c) => [c.sample!.id, c.sample!.client_id]))
    return { status: 200, body: { clients: summarizeQcClients(units, clientBySample, companyNameById) } }
  }

  // Attach the quality summary table to every unit. Every party gets the same
  // table (screen / defects / type / cup); a seller's is grouped by QC client,
  // everyone else's by seller. Each certificate carries its own `attach` (the
  // client always; other parties only when the client shares with everyone).
  // The unit body becomes an editable cover note; the table is rebuilt
  // authoritatively at send.
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
      // Attachment is decided per certificate (`sample.attach`); the cover note
      // says the PDFs are attached when any of them is.
      const attached = u.samples.some((s) => s.attach)
      const groups = groupQualitySamples(list, u.side === 'seller' ? 'qcClient' : 'seller')
      // Audience follows the party, never the attachment choice: it selects the
      // reference columns (buyer: Sample + Buyer ref; seller: Sample + Wolthers +
      // Seller ref) and whether the seller note is shown (sellers only).
      const audience = audienceOf(u.side)
      const sumOpts = { sellerComment: audience === 'seller', audience }
      u.body = buildQualityCoverNote(u.greeting, attached)
      u.subject = buildQualitySummarySubject(groups, audience)
      u.summaryText = buildQualitySummaryText(groups, sumOpts)
      u.summaryHtml = buildQualitySummaryHtml(groups, sumOpts)
    }
  }

  // Certificates in scope that produced no unit and aren't already fully sent →
  // no recipients.
  const covered = new Set<string>()
  for (const u of units) for (const s of u.samples) covered.add(certUnitKey(s.sampleId))
  let noRecipients = 0
  // With a party filter narrowing the send, a certificate left out is not a gap.
  const unfiltered = !opts.parties || opts.parties.size === ALL_PARTIES.length
  for (const inp of unfiltered ? inputs : []) {
    const key = certUnitKey(inp.sampleId)
    if (covered.has(key)) continue
    if (sendStatus.get(key)?.full) continue
    noRecipients++
  }

  return { status: 200, body: { units, skipped: { noParties, noRecipients }, savedContacts } }
}
