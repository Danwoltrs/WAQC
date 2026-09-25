/**
 * The year at a glance: the cover's quantity figures (MT, bags, containers)
 * and the certificate/approval line under them.
 */
import { bulkContainerCount } from '@/lib/bag-quantity'
import type { AnnualRow } from './annual-row'
import { round1, pct } from './annual-math'

/**
 * Containers carried by these certificates: the distinct container numbers on
 * bagged rows, plus each bulk row's own container count (its stored count, else
 * an estimate from its MT — the same number "N containers in bulk" prints).
 * A bagged row without a container number adds nothing.
 */
export function countContainers(rows: AnnualRow[]): number {
  const seen = new Set<string>()
  let bulk = 0
  for (const r of rows) {
    if (r.bag_type === 'bulk') {
      bulk += bulkContainerCount({ container_count: r.container_count ?? null, bags_quantity_mt: r.mt ?? null })
      continue
    }
    const nr = r.container_nr?.trim().toUpperCase()
    if (nr) seen.add(nr)
  }
  return seen.size + bulk
}

export interface AnnualGlance {
  /** 'ss' = approved shipment certificates; 'pss' only when the client had no SS at all. */
  basis: 'ss' | 'pss'
  mt: number
  bags: number
  /** null on the 'pss' basis: a pre-shipment sample has no container. */
  containers: number | null
  certificates: { total: number; pss: number; ss: number }
  /** Share of CERTIFICATES approved, 0-100. */
  approvalRate: { overall: number; pss: number; ss: number }
  rejections: { total: number; pss: number; ss: number }
  /** Approved MT per month on the glance basis, Jan..Dec (UTC month of issue). */
  monthlyMt: number[]
}

export function computeGlance(pssRows: AnnualRow[], ssRows: AnnualRow[]): AnnualGlance {
  const basis: 'ss' | 'pss' = ssRows.length > 0 ? 'ss' : 'pss'
  const approved = (basis === 'ss' ? ssRows : pssRows).filter(r => !r.is_rejected)

  const monthly: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const r of approved) monthly[new Date(r.approval_date).getUTCMonth()] += r.mt ?? 0

  const pssRej = pssRows.filter(r => r.is_rejected).length
  const ssRej = ssRows.filter(r => r.is_rejected).length
  const total = pssRows.length + ssRows.length

  return {
    basis,
    // Summed in row order and rounded once — the same arithmetic as
    // aggregateBucket's totals, so the cover and the SS tables agree to the digit.
    mt: round1(approved.reduce((s, r) => s + (r.mt ?? 0), 0)),
    bags: approved.reduce((s, r) => s + (r.bags ?? 0), 0),
    containers: basis === 'ss' ? countContainers(approved) : null,
    certificates: { total, pss: pssRows.length, ss: ssRows.length },
    approvalRate: {
      overall: pct(total - pssRej - ssRej, total),
      pss: pct(pssRows.length - pssRej, pssRows.length),
      ss: pct(ssRows.length - ssRej, ssRows.length),
    },
    rejections: { total: pssRej + ssRej, pss: pssRej, ss: ssRej },
    monthlyMt: monthly.map(round1),
  }
}
