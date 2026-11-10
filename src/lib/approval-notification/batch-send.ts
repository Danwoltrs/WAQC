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
import { NO_NAME_GREETING } from './resolve-panels'
import { ALL_PARTIES, type ApprovalSide, type CertificateParty, type PanelPrefill } from './types'

export { certUnitKey }

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
 *  callers that only know buyer and seller keep working. */
export interface RequiredParties {
  buyer: boolean
  seller: boolean
  importer?: boolean
  roaster?: boolean
}

export interface SampleSendStatus {
  buyerSent: SideSend | null
  sellerSent: SideSend | null
  importerSent: SideSend | null
  roasterSent: SideSend | null
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
  // Per-side references; the unit picks the one matching its side.
  buyerReference: string | null
  sellerReference: string | null
  // Certificate issue date (ISO) for the email's range summary.
  date: string | null
  line: Omit<BatchUnitLine, 'reference' | 'date'>
}

export interface BatchUnitSample extends BatchUnitLine {
  /** One line per certificate = per sample. A lab unit and its contract
   *  siblings travel in the same unit and are each attached. */
  sampleId: string
}

export interface BatchUnit {
  side: ApprovalSide
  companyId: string
  companyName: string
  greeting: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  samples: BatchUnitSample[]
  // Quality summary table (set in the queue for both sides). `body` becomes the
  // editable cover note; this table is rendered read-only and rebuilt at send.
  summaryText?: string
  summaryHtml?: string
  // Whether the certificate PDFs ride along. Defaults to true for buyers and
  // false for sellers — the seller didn't hire the QC service — but the composer
  // exposes it as a per-send checkbox, so either side can be overridden.
  attachCertificates?: boolean
  // True when this (company, side) has no resolvable TO recipient. The unit is
  // still emitted so the composer surfaces it as a capture step; Send stays
  // blocked until the sender adds at least one recipient.
  needsRecipients: boolean
}

/**
 * Pure: build the ordered send queue. One unit per (company, side); a
 * (certificate, side) pair already sent (per `sendStatus`) is dropped — a lab
 * unit and each of its contract siblings are separate samples tracked
 * separately, so a sent lab unit never suppresses an unsent sibling. Companies
 * with no resolvable TO recipient are still emitted, flagged `needsRecipients`,
 * so the composer can capture one. Order: all buyer units (by company name),
 * then all seller units (by company name).
 */
export function buildBatchUnits(
  samples: BatchSampleInput[],
  sendStatus: Map<string, SampleSendStatus>,
  panelsByCompany: Map<string, PanelPrefill>,
  companyNameById: Map<string, string>,
  opts?: { onlySide?: ApprovalSide; includeAlreadySent?: boolean },
): BatchUnit[] {
  const sides: ApprovalSide[] = opts?.onlySide ? [opts.onlySide] : ['buyer', 'seller']
  const units: BatchUnit[] = []

  for (const side of sides) {
    const bucket = new Map<string, BatchUnitSample[]>()
    for (const s of samples) {
      const companyId = side === 'buyer' ? s.buyerId : s.sellerId
      if (!companyId) continue
      const status = sendStatus.get(certUnitKey(s.sampleId))
      const alreadySent = side === 'buyer' ? status?.buyerSent : status?.sellerSent
      if (alreadySent && !opts?.includeAlreadySent) continue
      const reference = side === 'buyer' ? s.buyerReference : s.sellerReference
      const list = bucket.get(companyId) ?? []
      list.push({ sampleId: s.sampleId, ...s.line, reference, date: s.date })
      bucket.set(companyId, list)
    }

    const sideUnits: BatchUnit[] = []
    for (const [companyId, sampleLines] of bucket) {
      const panel = panelsByCompany.get(companyId)
      const companyName = companyNameById.get(companyId) ?? companyId
      const to = panel ? panel.to.map((c) => c.email) : []
      const cc = panel ? panel.cc.map((c) => c.email) : []
      // No named contact → "Dear all," (never "Dear <company> team,").
      const greeting = panel?.greeting ?? NO_NAME_GREETING
      const tmpl = { greeting, side, lines: sampleLines }
      sideUnits.push({
        side,
        companyId,
        companyName,
        greeting,
        to,
        cc,
        subject: buildBatchApprovalSubject(tmpl),
        body: buildBatchApprovalBody(tmpl),
        samples: sampleLines,
        needsRecipients: to.length === 0,
      })
    }
    sideUnits.sort((a, b) => a.companyName.localeCompare(b.companyName))
    units.push(...sideUnits)
  }

  return units
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