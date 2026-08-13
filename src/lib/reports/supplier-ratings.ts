/**
 * Year-to-date supplier rating for the performance reports — the report-side
 * equivalent of the supplier-review leaderboard, restricted to one QC client.
 *
 * Pure: callers hand over the already-fetched PSS and SS rows for the window and
 * a picker that selects which party to rate (shipper or seller).
 */
import type { PerformanceRow } from './performance-data'

export interface SupplierRatingRow {
  rank: number
  name: string
  total: number        // certificates evaluated in the window
  pss: number
  ss: number
  approvalRate: number // 0-100, rounded
}

/**
 * Rank the counterparties selected by `pick`, best approval rate first.
 * Ties break on volume (more certificates first), then name, so the order is
 * deterministic across runs.
 */
export function buildSupplierRatings(
  pssRows: PerformanceRow[],
  ssRows: PerformanceRow[],
  pick: (r: PerformanceRow) => string | null,
): SupplierRatingRow[] {
  const acc = new Map<string, { total: number; approved: number; pss: number; ss: number }>()

  const add = (rows: PerformanceRow[], bucket: 'pss' | 'ss') => {
    for (const r of rows) {
      const name = pick(r)?.trim()
      if (!name) continue
      const cur = acc.get(name) ?? { total: 0, approved: 0, pss: 0, ss: 0 }
      cur.total += 1
      if (!r.is_rejected) cur.approved += 1
      if (bucket === 'pss') cur.pss += 1
      else cur.ss += 1
      acc.set(name, cur)
    }
  }
  add(pssRows, 'pss')
  add(ssRows, 'ss')

  const out: SupplierRatingRow[] = [...acc.entries()].map(([name, v]) => ({
    rank: 0,
    name,
    total: v.total,
    pss: v.pss,
    ss: v.ss,
    approvalRate: v.total > 0 ? Math.round((v.approved / v.total) * 100) : 0,
  }))
  out.sort(
    (a, b) => b.approvalRate - a.approvalRate || b.total - a.total || a.name.localeCompare(b.name),
  )
  out.forEach((r, i) => {
    r.rank = i + 1
  })
  return out
}
