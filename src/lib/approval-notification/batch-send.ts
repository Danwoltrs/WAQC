import type { SupabaseClient } from '@supabase/supabase-js'
import {
  acceptFkRow,
  contractLookup,
  pickContract,
  type ContractContext,
  type SampleContractKeys,
} from './contract-resolver'
import {
  buildBatchApprovalSubject,
  buildBatchApprovalBody,
  type BatchUnitLine,
} from './batch-approval-template'
import { certUnitKey } from './quality-summary'
import type { QualitySummaryGroup } from './quality-summary-render'
import { literalDraftText } from '@/lib/email/draft-markup'
import type { Lang, SellerRequests, TickLocks } from '@/lib/seller-requests/types'
import { NO_NAME_GREETING } from './resolve-panels'
import { audienceOf, certificatePartyCompanies, isBeforePartyGoLive } from './certificate-parties'
import { ALL_PARTIES, type CertificateParty, type PanelPrefill } from './types'
import type { SendHistoryEntry } from './send-history'

export { certUnitKey }

/** Key of a panel in `panelsByCompany`: the company alone for HQ's contacts (owner NULL), company|lab for a confined lab's own. */
export const panelKey = (companyId: string, ownerLabId: string | null | undefined): string =>
  ownerLabId ? `${companyId}|${ownerLabId}` : companyId

/** "Anderson Nunes" -> "AN"; empty -> em-dash. Mirrors quality/templates page. */
export function getInitials(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

// ---- Send status (Sent column + unsent-queue filtering) --------------------

export interface SideSend {
  by: string | null // sender display name (full_name); UI derives initials
  at: string | null // ISO timestamp
}

/** Which parties a certificate is owed to. Importer and roaster are optional so
 *  callers that only know buyer and seller keep working. The shipper is never
 *  owed one: it is sent a certificate only when chosen. */
export interface RequiredParties {
  buyer: boolean
  seller: boolean
  importer?: boolean
  roaster?: boolean
  shipper?: false
}

export interface SampleSendStatus {
  buyerSent: SideSend | null
  sellerSent: SideSend | null
  importerSent: SideSend | null
  roasterSent: SideSend | null
  shipperSent: SideSend | null
  full: boolean // every required party has been emailed
}

export interface SendStatusRow {
  /** The sample whose certificate the send covered (`email_messages.metadata.
   *  sample_id`). A contract sibling is its own sample, so a send logged for
   *  the lab unit says nothing about the sibling's certificate. */
  sampleId: string
  side: CertificateParty
  sentBy: string | null
  sentAt: string | null
}

const SENT_FIELD: Record<CertificateParty, keyof Omit<SampleSendStatus, 'full'>> = {
  buyer: 'buyerSent',
  seller: 'sellerSent',
  importer: 'importerSent',
  roaster: 'roasterSent',
  shipper: 'shipperSent',
}

/** The send recorded for one party, or null when none (or no status at all). */
export function sentFor(status: SampleSendStatus | undefined, party: CertificateParty): SideSend | null {
  return status ? status[SENT_FIELD[party]] : null
}

/**
 * Pure: fold prior outbound emails into per-CERTIFICATE, per-party send status,
 * keyed by `certUnitKey` (= the sample id). `required` says which parties are
 * owed the certificate; it is `full` only when every required party has at
 * least one send.
 */
export function computeSendStatus(
  rows: SendStatusRow[],
  required: Map<string, RequiredParties>,
): Map<string, SampleSendStatus> {
  const empty = (): SampleSendStatus => ({
    buyerSent: null,
    sellerSent: null,
    importerSent: null,
    roasterSent: null,
    shipperSent: null,
    full: false,
  })
  const latest = new Map<string, SampleSendStatus>()
  for (const r of rows) {
    const id = certUnitKey(r.sampleId)
    let slot = latest.get(id)
    if (!slot) {
      slot = empty()
      latest.set(id, slot)
    }
    const field = SENT_FIELD[r.side]
    const current = slot[field]
    // Keep the most recent send for that party.
    if (!current || String(r.sentAt ?? '').localeCompare(String(current.at ?? '')) > 0) {
      slot[field] = { by: r.sentBy, at: r.sentAt }
    }
  }

  const out = new Map<string, SampleSendStatus>()
  const ids = new Set<string>([...latest.keys(), ...required.keys()])
  for (const id of ids) {
    const slot = latest.get(id) ?? empty()
    const req = required.get(id)
    const owed = ALL_PARTIES.filter((party) => !!req?.[party])
    const full = owed.length > 0 && owed.every((party) => !!slot[SENT_FIELD[party]])
    out.set(id, { ...slot, full })
  }
  return out
}

// ---- Unit assembly ---------------------------------------------------------

export interface BatchSampleInput {
  /** The certificate's own sample — a lab unit or a contract sibling. */
  sampleId: string
  buyerId: string | null
  sellerId: string | null
  importerId?: string | null
  roasterId?: string | null
  /** The sample's exporter where it is not the seller; emailed only when chosen. */
  shipperId?: string | null
  /** The laboratory whose contacts this sample's emails go to: null for HQ (Santos), else the lab id. */
  ownerLabId?: string | null
  /** `samples.client_id`: the QC client. A seller's and a shipper's emails split on it. */
  qcClientId?: string | null
  /** `samples.sample_type` ('pss' | 'ss' | …): the seller-request ticks are PSS only. */
  sampleType?: string | null
  /** The QC client shares its certificates with every party. */
  shareWithAll?: boolean
  // Per-side references; the unit picks the one matching its side.
  buyerReference: string | null
  sellerReference: string | null
  // Certificate issue date (ISO) for the email's range summary.
  date: string | null
  line: Omit<BatchUnitLine, 'reference' | 'date'>
}

/** The seller-request ticks of one approved PSS, for the composer's Requests
 *  card: the stored-or-starting values, the locks, and who the buyer is. */
export interface BatchSellerRequest {
  requests: SellerRequests
  locks: TickLocks
  clientId: string | null
  clientName: string | null
  importerId: string | null
  roasterId: string | null
}

export interface BatchUnitSample extends BatchUnitLine {
  /** One line per certificate = per sample. A lab unit and its contract
   *  siblings travel in the same unit and are each attached. */
  sampleId: string
  /** Whether this certificate's PDF rides along by default: always for the
   *  client, for other parties only when the QC client shares with everyone. */
  attach: boolean
  sampleType: string | null
  /** Seller units only, on an approved PSS whose ticks could be read. */
  sellerRequest?: BatchSellerRequest | null
}

export interface BatchUnit {
  side: CertificateParty
  companyId: string
  companyName: string
  /** Seller units only: the QC client the email covers (null: lots with none,
   *  and every other party). */
  qcClientId: string | null
  qcClientName: string | null
  /** The email's language, from the recipient company (`sellerLanguage`). */
  language: Lang
  greeting: string
  to: string[]
  cc: string[]
  subject: string
  /** The cover note as draft markup (`**bold**`, `{red}`…). */
  body: string
  samples: BatchUnitSample[]
  /** Earlier sends of these certificates to this party and company, newest
   *  first (set in the queue), so a resend is made knowingly. */
  history?: SendHistoryEntry[]
  // Quality summary table (set in the queue for both sides). `body` becomes the
  // editable cover note; this table is rendered read-only and rebuilt at send.
  summaryText?: string
  summaryHtml?: string
  /** The table's rows, so the composer can re-render the preview on a tick or
   *  language change (quality-summary-render.ts). */
  summaryGroups?: QualitySummaryGroup[]
  // The composer's override only; the queue leaves it unset and each sample
  // carries its own `attach` default.
  attachCertificates?: boolean
  // True when this (company, side) has no resolvable TO recipient. The unit is
  // still emitted so the composer surfaces it as a capture step; Send stays
  // blocked until the sender adds at least one recipient.
  needsRecipients: boolean
}

export interface BuildUnitsOptions {
  /** Which parties to build; all when omitted. */
  parties?: ReadonlySet<CertificateParty>
  includeAlreadySent?: boolean
  /** Include importers and roasters on certificates issued before go-live. */
  includePreGoLive?: boolean
  /** Each recipient company's language; English when omitted. */
  languageOf?: (companyId: string) => Lang
}

/** A seller's emails by QC client name, lots with no client first; equal names (both null included) tie. */
export function compareQcClientName(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a.localeCompare(b)
}

/**
 * Pure: build the ordered send queue. One unit per (company, party); a seller is
 * further split by QC client, so each client's lots get their own email. A
 * (certificate, party) pair already sent (per `sendStatus`) is dropped — a lab
 * unit and each of its contract siblings are separate samples tracked
 * separately. Companies with no resolvable TO recipient are still emitted,
 * flagged `needsRecipients`, so the composer can capture one. Order: clients,
 * importers, roasters, then sellers; by company name within a party.
 */
export function buildBatchUnits(
  samples: BatchSampleInput[],
  sendStatus: Map<string, SampleSendStatus>,
  panelsByCompany: Map<string, PanelPrefill>,
  companyNameById: Map<string, string>,
  opts?: BuildUnitsOptions,
): BatchUnit[] {
  const units: BatchUnit[] = []

  for (const party of ALL_PARTIES) {
    if (opts?.parties && !opts.parties.has(party)) continue
    // Nobody owes the shipper a certificate: it is built only when named.
    if (party === 'shipper' && !opts?.parties?.has('shipper')) continue
    const sellerSide = party === 'seller' || party === 'shipper'
    const bucket = new Map<string, { companyId: string; qcClientId: string | null; ownerLabId: string | null; lines: BatchUnitSample[] }>()
    for (const s of samples) {
      const entry = certificatePartyCompanies({
        contractId: null,
        buyerId: s.buyerId,
        sellerId: s.sellerId,
        importerId: s.importerId ?? null,
        roasterId: s.roasterId ?? null,
        shipperId: s.shipperId ?? null,
        buyerReference: null,
        sellerReference: null,
        contractNumber: null,
      }).find((e) => e.party === party)
      if (!entry) continue
      if ((party === 'importer' || party === 'roaster') && !opts?.includePreGoLive && isBeforePartyGoLive(s.date)) continue
      if (sentFor(sendStatus.get(certUnitKey(s.sampleId)), party) && !opts?.includeAlreadySent) continue
      const qcClientId = sellerSide ? (s.qcClientId ?? null) : null
      const ownerLabId = s.ownerLabId ?? null
      const key = `${entry.companyId}|${qcClientId ?? ''}|${ownerLabId ?? ''}`
      const reference = sellerSide ? s.sellerReference : s.buyerReference
      const slot = bucket.get(key) ?? { companyId: entry.companyId, qcClientId, ownerLabId, lines: [] }
      slot.lines.push({
        sampleId: s.sampleId,
        ...s.line,
        reference,
        date: s.date,
        attach: party === 'buyer' || !!s.shareWithAll,
        sampleType: s.sampleType ?? null,
      })
      bucket.set(key, slot)
    }

    const partyUnits: BatchUnit[] = []
    for (const { companyId, qcClientId, ownerLabId, lines } of bucket.values()) {
      const panel = panelsByCompany.get(panelKey(companyId, ownerLabId))
      const companyName = companyNameById.get(companyId) ?? companyId
      const to = panel ? panel.to.map((c) => c.email) : []
      const cc = panel ? panel.cc.map((c) => c.email) : []
      // No named contact → "Dear all," (never "Dear <company> team,").
      const greeting = panel?.greeting ?? NO_NAME_GREETING
      const tmpl = { greeting, side: audienceOf(party), lines }
      partyUnits.push({
        side: party,
        companyId,
        companyName,
        qcClientId,
        qcClientName: qcClientId ? (companyNameById.get(qcClientId) ?? qcClientId) : null,
        language: opts?.languageOf?.(companyId) ?? 'en',
        greeting,
        to,
        cc,
        subject: buildBatchApprovalSubject(tmpl),
        // The body travels as draft markup: a reason typed with `**` stays text.
        body: literalDraftText(buildBatchApprovalBody(tmpl)),
        samples: lines,
        needsRecipients: to.length === 0,
      })
    }
    partyUnits.sort(
      (a, b) => a.companyName.localeCompare(b.companyName) || compareQcClientName(a.qcClientName, b.qcClientName),
    )
    units.push(...partyUnits)
  }

  return units
}

// ---- Composer helpers -------------------------------------------------------

const PARTY_LABEL: Record<CertificateParty, string> = {
  buyer: 'Client',
  importer: 'Importer',
  roaster: 'Roaster',
  seller: 'Seller',
  shipper: 'Shipper',
}

const PARTY_PLURAL: Record<CertificateParty, string> = {
  buyer: 'CLIENTS',
  importer: 'IMPORTERS',
  roaster: 'ROASTERS',
  seller: 'SELLERS',
  shipper: 'SHIPPERS',
}

/** "Client", "Importer", "Roaster" or "Seller". */
export function partyLabel(party: CertificateParty): string {
  return PARTY_LABEL[party]
}

/** The certificates whose PDF rides along: the composer's override wins (true =
 *  all, false = none); unset, each certificate's own `attach` decides. */
export function attachedSampleIds(unit: BatchUnit): string[] {
  if (unit.attachCertificates === true) return unit.samples.map((s) => s.sampleId)
  if (unit.attachCertificates === false) return []
  return unit.samples.filter((s) => s.attach).map((s) => s.sampleId)
}

/** "Importer 2 of 3" within its party, and the divider shown when the party
 *  changes from the previous email. */
export function composerPosition(
  units: BatchUnit[],
  index: number,
): { label: string; divider: string | null } {
  const side = units[index].side
  const inParty = units.filter((u) => u.side === side).length
  const position = units.slice(0, index + 1).filter((u) => u.side === side).length
  const changed = index > 0 && units[index - 1].side !== side
  return {
    label: `${PARTY_LABEL[side]} ${position} of ${inParty}`,
    divider: changed ? `Now sending to ${PARTY_PLURAL[side]}` : null,
  }
}

// ---- Batch contract resolution (I/O) ---------------------------------------

interface ContractRow {
  id: string
  contract_number: string | null
  buyer_id: string | null
  seller_id: string | null
  buyer_reference: string | null
  seller_reference: string | null
  status: string | null
  updated_at: string | null
}

const toContext = (row: ContractRow): ContractContext => ({
  contractId: row.id,
  buyerId: row.buyer_id ?? null,
  sellerId: row.seller_id ?? null,
  buyerReference: row.buyer_reference ?? null,
  sellerReference: row.seller_reference ?? null,
  contractNumber: row.contract_number ?? null,
})

const SELECT = 'id, contract_number, buyer_id, seller_id, buyer_reference, seller_reference, status, updated_at'

/**
 * Resolve contract context for many samples with two IN-queries (by id, by
 * number) instead of one round-trip per sample. Number collisions are resolved
 * with the same `pickContract` precedence as the single-sample resolver.
 */
export async function resolveSampleContractsBatch<T extends SampleContractKeys & { id: string }>(
  admin: SupabaseClient,
  samples: T[],
): Promise<Map<string, ContractContext>> {
  const ids = new Set<string>()
  const numbers = new Set<string>()
  for (const s of samples) {
    const lookup = contractLookup(s)
    if (!lookup) continue
    if (lookup.column === 'id') ids.add(lookup.value)
    else numbers.add(lookup.value)
  }

  const byId = new Map<string, ContractRow>()
  const byNumber = new Map<string, ContractRow[]>()

  if (ids.size > 0) {
    const { data } = await admin.from('contracts').select(SELECT).in('id', [...ids])
    for (const r of (data ?? []) as ContractRow[]) byId.set(r.id, r)
  }
  if (numbers.size > 0) {
    const { data } = await admin.from('contracts').select(SELECT).in('contract_number', [...numbers])
    for (const r of (data ?? []) as ContractRow[]) {
      if (!r.contract_number) continue
      const list = byNumber.get(r.contract_number) ?? []
      list.push(r)
      byNumber.set(r.contract_number, list)
    }
  }

  const out = new Map<string, ContractContext>()
  for (const s of samples) {
    const lookup = contractLookup(s)
    if (!lookup) continue
    if (lookup.column === 'id') {
      // Same mislink guard as the single-sample resolver: a FK whose contract
      // number contradicts the sample's own number resolves nothing.
      const row = acceptFkRow(byId.get(lookup.value), s)
      if (row) out.set(s.id, toContext(row))
    } else {
      const row = pickContract(byNumber.get(lookup.value) ?? [])
      if (row) out.set(s.id, toContext(row))
    }
  }
  return out
}