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
 * The approval rate a supplier can be trusted to hold: the lower bound of the
 * 95% Wilson score interval. It is the raw rate pulled down by how little
 * evidence there is — 3 of 3 approved scores 0.44, 191 of 208 scores 0.87 —
 * so a handful of certificates cannot outrank a long record.
 */
export function wilsonLowerBound(approved: number, total: number, z = 1.96): number {
  if (total <= 0) return 0
  const p = approved / total
  const z2 = z * z
  const centre = p + z2 / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)
  return (centre - margin) / (1 + z2 / total)
}

/**
 * Rank the counterparties selected by `pick` by approval rate WEIGHTED BY
 * VOLUME (wilsonLowerBound): Grano at 3 of 3 and StoneX at 1 of 1 used to
 * top OFI at 191 of 208. The table still prints the raw approval rate. Ties
 * break on volume (more certificates first), then name, so the order is
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

  const score = new Map<string, number>()
  for (const [name, v] of acc) score.set(name, wilsonLowerBound(v.approved, v.total))

  const out: SupplierRatingRow[] = [...acc.entries()].map(([name, v]) => ({
    rank: 0,
    name,
    total: v.total,
    pss: v.pss,
    ss: v.ss,
    approvalRate: v.total > 0 ? Math.round((v.approved / v.total) * 100) : 0,
  }))
  out.sort(
    (a, b) => score.get(b.name)! - score.get(a.name)! || b.total - a.total || a.name.localeCompare(b.name),
  )
  out.forEach((r, i) => {
    r.rank = i + 1
  })
  return out
}
