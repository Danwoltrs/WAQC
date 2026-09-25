/**
 * Month-by-month view of the year: one heat-map row per company (shipper,
 * seller, importer, roaster) and one totals row per month. PSS rows count
 * certificates, SS rows count bags — the same bases as the performance tables.
 * A certificate belongs to the UTC month it was issued in.
 */
import type { AnnualRow } from './annual-row'
import { countContainers } from './annual-glance'
import { pct } from './annual-math'

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
/** Rows a grid shows before folding the rest into "Others (n)" — keeps a monthly page one page. */
export const MONTHLY_GRID_CAP = 12

export type MonthlyBasis = 'count' | 'bags'

export interface MonthCell {
  approved: number
  rejected: number
  total: number
  /** Approved share of total, 0-100, rounded. */
  rate: number
}

export interface MonthlyGridRow {
  name: string
  /** Jan..Dec; null for a month without certificates. */
  cells: Array<MonthCell | null>
  year: MonthCell
}

export interface MonthlyGrid {
  basis: MonthlyBasis
  rows: MonthlyGridRow[]
  others: (MonthlyGridRow & { folded: number }) | null
}

export interface MonthTotal extends MonthCell {
  month: number
  label: string
  /** Approved containers that month (bags basis only). */
  containers: number | null
}

export function monthOf(r: Pick<AnnualRow, 'approval_date'>): number {
  return new Date(r.approval_date).getUTCMonth()
}

const emptyCell = (): MonthCell => ({ approved: 0, rejected: 0, total: 0, rate: 0 })
const emptyCells = (): Array<MonthCell | null> => [null, null, null, null, null, null, null, null, null, null, null, null]

function add(cell: MonthCell, r: AnnualRow, basis: MonthlyBasis): void {
  const v = basis === 'bags' ? (r.bags ?? 0) : 1
  if (r.is_rejected) cell.rejected += v
  else cell.approved += v
  cell.total += v
}

function finish(cell: MonthCell): MonthCell {
  cell.rate = pct(cell.approved, cell.total)
  return cell
}

export function buildMonthlyGrid(
  rows: AnnualRow[],
  keyOf: (r: AnnualRow) => string | null,
  basis: MonthlyBasis,
  cap: number = MONTHLY_GRID_CAP,
): MonthlyGrid {
  const byName = new Map<string, { cells: Array<MonthCell | null>; year: MonthCell }>()
  for (const r of rows) {
    const name = keyOf(r)?.trim()
    if (!name) continue
    const g = byName.get(name) ?? { cells: emptyCells(), year: emptyCell() }
    const m = monthOf(r)
    const cell = g.cells[m] ?? emptyCell()
    add(cell, r, basis)
    g.cells[m] = cell
    add(g.year, r, basis)
    byName.set(name, g)
  }

  const all: MonthlyGridRow[] = [...byName.entries()]
    .map(([name, g]) => ({ name, cells: g.cells.map(c => (c ? finish(c) : null)), year: finish(g.year) }))
    .sort((a, b) => b.year.total - a.year.total || a.name.localeCompare(b.name, 'en'))

  if (all.length <= cap) return { basis, rows: all, others: null }

  const rest = all.slice(cap)
  const cells = emptyCells()
  const year = emptyCell()
  for (const row of rest) {
    row.cells.forEach((c, i) => {
      if (!c) return
      const t = cells[i] ?? emptyCell()
      t.approved += c.approved
      t.rejected += c.rejected
      t.total += c.total
      cells[i] = t
    })
    year.approved += row.year.approved
    year.rejected += row.year.rejected
    year.total += row.year.total
  }
  return {
    basis,
    rows: all.slice(0, cap),
    others: {
      name: `Others (${rest.length})`,
      cells: cells.map(c => (c ? finish(c) : null)),
      year: finish(year),
      folded: rest.length,
    },
  }
}

export function buildMonthTotals(rows: AnnualRow[], basis: MonthlyBasis): MonthTotal[] {
  return MONTH_LABELS.map((label, month) => {
    const inMonth = rows.filter(r => monthOf(r) === month)
    const cell = emptyCell()
    for (const r of inMonth) add(cell, r, basis)
    finish(cell)
    return {
      ...cell,
      month,
      label,
      containers: basis === 'bags' ? countContainers(inMonth.filter(r => !r.is_rejected)) : null,
    }
  })
}
