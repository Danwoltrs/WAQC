import {
  classifyRejection,
  reasonLabel,
  REJECTION_REASONS,
  type RejectionReasonKey,
} from '@/lib/reports/rejection-reasons'
import { violationDetails, reasonOfColumn, type OverviewColumn } from '@/lib/reports/rejection-overview'
import { DETAIL_OF, type RejectionDetail } from '@/lib/reports/performance-data'
import { wilsonLowerBound } from '@/lib/reports/supplier-ratings'
import { reportDay } from '@/lib/reports/periods'
import type { PortalCertFact } from './portal-facts'

export interface SellerRow {
  seller: string
  certificates: number
  rejected: number
  /** Rounded 0-100. */
  approvalRate: number
  /** Rounded 0-100; null when the seller has no certificate of that type. */
  pssRate: number | null
  ssRate: number | null
  /** SS metric tons, one decimal. */
  ssMt: number
  /** Under 10 certificates: too few to read a rate from. */
  fewLots: boolean
}

export interface NamedReason {
  reason: RejectionReasonKey
  name: string | null
  label: string
  count: number
  /** Newest first. */
  certificates: {
    id: string
    certificateNumber: string | null
    contractRef: string | null
    issuedAt: string
    measured: { label: string; value: string; limit: string | null }[]
  }[]
}

export interface SellerDetail {
  seller: string
  row: SellerRow
  topReasons: NamedReason[]
  /** Rejected certificates that failed more than one reason. */
  multiReason: number
  rejectedTotal: number
  monthly: { month: string; approvalRate: number | null; certificates: number }[]
}

const FEW_LOTS_BELOW = 10
const TOP_REASONS = 5
const NAMED_REASONS: ReadonlySet<RejectionReasonKey> = new Set(['primary', 'secondary', 'cup_fault', 'cup_taint'])
const SEVERITY = new Map(REJECTION_REASONS.map((r, i) => [r.key, i]))

const pct = (k: number, n: number): number => Math.round((k / n) * 100)
const rateOrNull = (k: number, n: number): number | null => (n > 0 ? pct(k, n) : null)

/** 'Cup fault' / 'Cup taint' read better than reasonLabel's 'Cup (fault)'. */
function labelOf(key: RejectionReasonKey): string {
  if (key === 'cup_fault') return 'Cup fault'
  if (key === 'cup_taint') return 'Cup taint'
  return reasonLabel(key)
}

function rowOf(seller: string, facts: PortalCertFact[]): SellerRow {
  const approvedOf = (xs: PortalCertFact[]) => xs.filter(f => !f.rejected).length
  const pss = facts.filter(f => f.type === 'pss')
  const ss = facts.filter(f => f.type === 'ss')
  const approved = approvedOf(facts)
  const ssMt = ss.reduce((sum, f) => sum + (f.mt ?? 0), 0)
  return {
    seller,
    certificates: facts.length,
    rejected: facts.length - approved,
    approvalRate: pct(approved, facts.length),
    pssRate: rateOrNull(approvedOf(pss), pss.length),
    ssRate: rateOrNull(approvedOf(ss), ss.length),
    ssMt: Math.round(ssMt * 10) / 10,
    fewLots: facts.length < FEW_LOTS_BELOW,
  }
}

const bySeller = (facts: PortalCertFact[]): Map<string, PortalCertFact[]> => {
  const m = new Map<string, PortalCertFact[]>()
  for (const f of facts) m.set(f.seller, [...(m.get(f.seller) ?? []), f])
  return m
}

/** Sellers ranked by the Wilson lower bound of their approval rate. */
export function buildSellerList(facts: PortalCertFact[]): SellerRow[] {
  const scored = [...bySeller(facts)].map(([seller, fs]) => {
    const row = rowOf(seller, fs)
    return { row, score: wilsonLowerBound(row.certificates - row.rejected, row.certificates) }
  })
  scored.sort((a, b) => b.score - a.score || b.row.certificates - a.row.certificates || a.row.seller.localeCompare(b.row.seller))
  return scored.map(s => s.row)
}

function nameLabel(reason: RejectionReasonKey, name: string | null): string {
  if (name) return `${labelOf(reason)}: ${name}`
  return NAMED_REASONS.has(reason) ? `${labelOf(reason)}: not named` : labelOf(reason)
}

function measuredOf(f: PortalCertFact, reason: RejectionReasonKey): NamedReason['certificates'][number]['measured'] {
  const out: NamedReason['certificates'][number]['measured'] = []
  for (const v of f.violations) {
    for (const d of violationDetails(v)) {
      if (reasonOfColumn(d.key as OverviewColumn) !== reason) continue
      out.push({
        label: d.key === 'total' ? 'Total defects' : labelOf(reasonOfColumn(d.key as OverviewColumn)),
        value: d.value,
        limit: d.limit ? d.limit.replace(/^(max|min)\s+/i, '') : null,
      })
    }
  }
  return out
}

export function buildSellerDetail(
  facts: PortalCertFact[],
  seller: string,
  detailByLabSample: Map<string, RejectionDetail>,
): SellerDetail | null {
  const mine = facts.filter(f => f.seller === seller)
  if (mine.length === 0) return null

  const groups = new Map<string, { reason: RejectionReasonKey; name: string | null; facts: PortalCertFact[] }>()
  let multiReason = 0
  const rejected = mine.filter(f => f.rejected)
  for (const f of rejected) {
    const { worst, reasons } = classifyRejection(f.violations)
    if (reasons.length > 1) multiReason++
    const detail = detailByLabSample.get(f.labSampleId)
    const name = (detail ? DETAIL_OF[worst]?.(detail)[0] : undefined) ?? null
    const key = `${worst}|${name ?? ''}`
    const g = groups.get(key) ?? { reason: worst, name, facts: [] }
    g.facts.push(f)
    groups.set(key, g)
  }

  const topReasons: NamedReason[] = [...groups.values()]
    .sort((a, b) =>
      b.facts.length - a.facts.length
      || SEVERITY.get(a.reason)! - SEVERITY.get(b.reason)!
      || (a.name ?? '').localeCompare(b.name ?? ''))
    .slice(0, TOP_REASONS)
    .map(g => ({
      reason: g.reason,
      name: g.name,
      label: nameLabel(g.reason, g.name),
      count: g.facts.length,
      certificates: [...g.facts]
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
        .map(f => ({
          id: f.id,
          certificateNumber: f.certificateNumber,
          contractRef: f.contractRef,
          issuedAt: f.issuedAt,
          measured: measuredOf(f, g.reason),
        })),
    }))

  const months = new Map<string, { n: number; ok: number }>()
  for (const f of mine) {
    const m = reportDay(f.issuedAt).slice(0, 7)
    const t = months.get(m) ?? { n: 0, ok: 0 }
    t.n++
    if (!f.rejected) t.ok++
    months.set(m, t)
  }
  const monthly = [...months]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, t]) => ({ month, approvalRate: rateOrNull(t.ok, t.n), certificates: t.n }))

  return { seller, row: rowOf(seller, mine), topReasons, multiReason, rejectedTotal: rejected.length, monthly }
}
