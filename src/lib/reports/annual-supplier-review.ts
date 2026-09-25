/**
 * Supplier review for the year: the in-app Metrics → Supplier Review
 * leaderboard (approval rate, then volume, then name) for one client, by
 * shipper and by seller, with the MT each supplier shipped and the reason its
 * lots were most often rejected.
 */
import { buildSupplierRatings } from './supplier-ratings'
import { collapseDefectFamily, type PerformanceRow } from './performance-data'
import { round1 } from './annual-math'
import { categorizeViolation } from '@/lib/report-data'
import type { AnnualRow } from './annual-row'

export interface SupplierReviewRow {
  rank: number
  name: string
  certificates: number
  pss: number
  ss: number
  /** Share of certificates approved, 0-100. */
  approvalRate: number
  /** Approved SS MT, 1 decimal; null when the supplier had no SS certificate. PSS MT is never added: it is the same coffee. */
  mtShipped: number | null
  /** Most frequent rejection category over its rejected certificates; null when none were rejected. */
  mainIssue: string | null
}

export interface SupplierReview {
  shippers: SupplierReviewRow[]
  sellers: SupplierReviewRow[]
}

export const shipperOf = (r: PerformanceRow): string | null => r.exporter_name?.trim() || null
/** Seller falls back to the shipper, as in every other view (bySeller, the Sankey). */
export const sellerOf = (r: PerformanceRow): string | null =>
  r.seller_name?.trim() || r.exporter_name?.trim() || null

function reasonsOf(r: AnnualRow): Set<string> {
  const violations = (r as AnnualRow & { _violations?: string[] })._violations ?? []
  const cats = new Set(violations.map(categorizeViolation))
  collapseDefectFamily(cats)
  return cats
}

export function buildSupplierReview(
  pssRows: AnnualRow[],
  ssRows: AnnualRow[],
  reasonOrder: string[],
): SupplierReview {
  const orderOf = (category: string) => {
    const i = reasonOrder.indexOf(category)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }

  const build = (pick: (r: PerformanceRow) => string | null): SupplierReviewRow[] =>
    buildSupplierRatings(pssRows, ssRows, pick).map(rating => {
      const mine = (rows: AnnualRow[]) => rows.filter(r => pick(r) === rating.name)
      const ss = mine(ssRows)
      const counts = new Map<string, number>()
      for (const r of [...mine(pssRows), ...ss]) {
        if (!r.is_rejected) continue
        for (const c of reasonsOf(r)) counts.set(c, (counts.get(c) ?? 0) + 1)
      }
      const mainIssue =
        [...counts.entries()].sort(
          (a, b) => b[1] - a[1] || orderOf(a[0]) - orderOf(b[0]) || a[0].localeCompare(b[0], 'en'),
        )[0]?.[0] ?? null
      return {
        rank: rating.rank,
        name: rating.name,
        certificates: rating.total,
        pss: rating.pss,
        ss: rating.ss,
        approvalRate: rating.approvalRate,
        mtShipped:
          ss.length > 0 ? round1(ss.filter(r => !r.is_rejected).reduce((s, r) => s + (r.mt ?? 0), 0)) : null,
        mainIssue,
      }
    })

  return { shippers: build(shipperOf), sellers: build(sellerOf) }
}
