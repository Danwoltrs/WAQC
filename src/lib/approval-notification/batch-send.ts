import type { SupabaseClient } from '@supabase/supabase-js'
import {
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
import type { ApprovalSide, PanelPrefill } from './types'

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

export interface SampleSendStatus {
  buyerSent: SideSend | null
  sellerSent: SideSend | null
  full: boolean // every required side has been emailed
}

export interface SendStatusRow {
  sampleId: string
  side: ApprovalSide
  sentBy: string | null
  sentAt: string | null
}

/**
 * Pure: fold prior outbound emails into per-sample, per-side send status.
 * `required` says which sides actually have a counterparty company; a sample is
 * `full` only when every required side has at least one send.
 */
export function computeSendStatus(
  rows: SendStatusRow[],
  required: Map<string, { buyer: boolean; seller: boolean }>,
): Map<string, SampleSendStatus> {
  const latest = new Map<string, { buyer: SideSend | null; seller: SideSend | null }>()
  const ensure = (id: string) => {
    let v = latest.get(id)
    if (!v) {
      v = { buyer: null, seller: null }
      latest.set(id, v)
    }
    return v
  }
  for (const r of rows) {
    const slot = ensure(r.sampleId)
    const current = r.side === 'buyer' ? slot.buyer : slot.seller
    // Keep the most recent send for that side.
    if (!current || String(r.sentAt ?? '').localeCompare(String(current.at ?? '')) > 0) {
      const next: SideSend = { by: r.sentBy, at: r.sentAt }
      if (r.side === 'buyer') slot.buyer = next
      else slot.seller = next
    }
  }

  const out = new Map<string, SampleSendStatus>()
  const ids = new Set<string>([...latest.keys(), ...required.keys()])
  for (const id of ids) {
    const slot = latest.get(id) ?? { buyer: null, seller: null }
    const req = required.get(id) ?? { buyer: false, seller: false }
    const buyerOk = req.buyer ? !!slot.buyer : true
    const sellerOk = req.seller ? !!slot.seller : true
    const full = (req.buyer || req.seller) && buyerOk && sellerOk
    out.set(id, { buyerSent: slot.buyer, sellerSent: slot.seller, full })
  }
  return out
}

// ---- Unit assembly ---------------------------------------------------------

export interface BatchSampleInput {
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
}

/**
 * Pure: build the ordered send queue. One unit per (company, side); a
 * (sample, side) pair already sent (per `sendStatus`) is dropped. Companies with
 * no resolvable TO recipient are skipped. Order: all buyer units (by company
 * name), then all seller units (by company name).
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
      const status = sendStatus.get(s.sampleId)
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
      if (!panel || panel.to.length === 0) continue
      const companyName = companyNameById.get(companyId) ?? companyId
      const tmpl = { greeting: panel.greeting, side, lines: sampleLines }
      sideUnits.push({
        side,
        companyId,
        companyName,
        greeting: panel.greeting,
        to: panel.to.map((c) => c.email),
        cc: panel.cc.map((c) => c.email),
        subject: buildBatchApprovalSubject(tmpl),
        body: buildBatchApprovalBody(tmpl),
        samples: sampleLines,
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
      const row = byId.get(lookup.value)
      if (row) out.set(s.id, toContext(row))
    } else {
      const row = pickContract(byNumber.get(lookup.value) ?? [])
      if (row) out.set(s.id, toContext(row))
    }
  }
  return out
}