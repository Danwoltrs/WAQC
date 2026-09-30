/**
 * The period report's "Rejected certificates" page: every rejected
 * certificate with EVERY reason it failed, each cell the measured value
 * against the specification's limit ("12 max 8"), grouped by seller and, when
 * a seller used more than one shipper, by shipper.
 *
 * Reasons and their severity come from `rejection-reasons.ts`, so a row's worst
 * reason is the one the charts page counts it under. This module only adds the
 * numbers each violation sentence carries (see `compliance-criteria.ts` for
 * the wording) and the names the lab unit recorded (`rejection_detail`).
 *
 * Columns: the six defect columns always, in the order Wolthers reads them
 * (cup fault, cup taint, primary, secondary, total, quakers); then any other
 * reason that occurs. Total defects is its own column although it classifies
 * as a secondary-defect rejection.
 */
import {
  REJECTION_REASONS,
  STATUS_OVERRIDE_VIOLATION,
  classifyRejection,
  type RejectionReasonKey,
} from './rejection-reasons'
import { sortAppendixRows, type PerformanceRow } from './performance-data'

export interface ReasonValue {
  value: string
  /** "max 8", "min 60%"; null where the reason has no limit (cupper, override). */
  limit: string | null
  /** Named on the lab record but within the limit: a taint the spec allows. */
  recorded?: boolean
}

export type OverviewColumn = RejectionReasonKey | 'total'

/** The rejection reason a column belongs to: Total defects is a secondary story. */
export const reasonOfColumn = (c: OverviewColumn): RejectionReasonKey => (c === 'total' ? 'secondary' : c)

/** Always shown, in this order, whether or not anything failed them. */
export const DEFECT_COLUMNS: readonly OverviewColumn[] = ['cup_fault', 'cup_taint', 'primary', 'secondary', 'total', 'quakers']

export interface ViolationDetail extends ReasonValue {
  key: OverviewColumn
}

/** 40.0 → "40", 38.5 → "38.5". */
const num = (s: string) => String(Number(s))
const plural = (n: string, word: string) => `${n} ${word}${n === '1' ? '' : 's'}`
const bound = (dir: string) => (/below|minimum/i.test(dir) ? 'min' : 'max')

/** The reason(s) one violation sentence stands for, with what it measured. */
export function violationDetails(v: string): ViolationDetail[] {
  const s = typeof v === 'string' ? v.trim() : ''
  let m: RegExpMatchArray | null

  if ((m = s.match(/^Zero tolerance:\s*(\d+)\s*taint\(s\)\s*and\s*(\d+)\s*fault/i))) {
    const out: ViolationDetail[] = []
    if (Number(m[2]) > 0) out.push({ key: 'cup_fault', value: plural(m[2], 'fault'), limit: 'max 0' })
    if (Number(m[1]) > 0) out.push({ key: 'cup_taint', value: plural(m[1], 'taint'), limit: 'max 0' })
    return out.length > 0 ? out : [{ key: 'cup_fault', value: plural(m[2], 'fault'), limit: 'max 0' }]
  }
  if ((m = s.match(/^(Fault|Taint)\s+"(.+)":\s*Intensity\s+([\d.]+)\s+exceeds maximum\s*\(([\d.]+)\)/i))) {
    return [{ key: m[1].toLowerCase() === 'fault' ? 'cup_fault' : 'cup_taint', value: `${m[2]} ${m[3]}`, limit: `max ${m[4]}` }]
  }
  if ((m = s.match(/^Cupping (faults|taints|defects combined):\s*(\d+)\s+exceeds limit\s*\(([\d.]+)\)/i))) {
    const kind = m[1].toLowerCase()
    if (kind === 'taints') return [{ key: 'cup_taint', value: plural(m[2], 'taint'), limit: `max ${m[3]}` }]
    if (kind === 'faults') return [{ key: 'cup_fault', value: plural(m[2], 'fault'), limit: `max ${m[3]}` }]
    return [{ key: 'cup_fault', value: `${m[2]} combined`, limit: `max ${m[3]}` }]
  }
  // Defect equivalents are weighted, so fractional: "Secondary defects: 24.4 …".
  if ((m = s.match(/^(Primary|Secondary|Total) defects:\s*([\d.]+)\s+exceeds limit\s*\(([\d.]+)\)/i))) {
    return [{ key: m[1].toLowerCase() as 'primary' | 'secondary' | 'total', value: num(m[2]), limit: `max ${num(m[3])}` }]
  }
  if ((m = s.match(/^Quakers:\s*([\d.]+)\s+exceeds maximum\s*\(([\d.]+)\)/i))) {
    return [{ key: 'quakers', value: num(m[1]), limit: `max ${num(m[2])}` }]
  }
  // Certificates issued before the compliance fix read "Screen Screen 16: …".
  if ((m = s.match(/^Screen\s+(?:Screen\s+)?([A-Za-z0-9]+):\s*([\d.]+)%\s+(is below minimum|exceeds maximum)\s*\(([\d.]+)%\)/i))) {
    return [{ key: 'screen', value: `${m[1]}: ${num(m[2])}%`, limit: `${bound(m[3])} ${num(m[4])}%` }]
  }
  if ((m = s.match(/^Moisture:\s*([\d.]+)%\s+(is below minimum|exceeds maximum)\s*\(([\d.]+)%\)/i))) {
    return [{ key: 'moisture', value: `${num(m[1])}%`, limit: `${bound(m[2])} ${num(m[3])}%` }]
  }
  if ((m = s.match(/^CVA score\s+([\d.]+)\s+is below the\s+([\d.]+)\s+pass mark/i))) {
    return [{ key: 'cup_score', value: `CVA ${m[1]}`, limit: `min ${m[2]}` }]
  }
  if ((m = s.match(/^([A-Za-z][A-Za-z ]*?):\s+([\d.]+)\s+is\s+(below minimum|above maximum)\s*\(([\d.]+)\)/i))) {
    return [{ key: 'cup_score', value: `${m[1]} ${m[2]}`, limit: `${bound(m[3])} ${m[4]}` }]
  }
  if (/^Manual rejection by cupper/i.test(s)) return [{ key: 'cupper', value: 'Rejected', limit: null }]
  if (s === STATUS_OVERRIDE_VIOLATION) return [{ key: 'override', value: 'Overridden', limit: null }]
  return [{ key: 'other', value: s || 'Not recorded', limit: null }]
}

export interface OverviewRow {
  row: PerformanceRow
  /** Only the columns this certificate has something in; several failures of one reason share a cell. */
  cells: Partial<Record<OverviewColumn, ReasonValue[]>>
  worst: RejectionReasonKey
}

export interface OverviewShipper {
  shipper: string
  rows: OverviewRow[]
}

export interface OverviewSeller {
  seller: string
  certificates: number
  /** Metric tons, 1 decimal. */
  mt: number
  /** False when every certificate came from one shipper: no shipper heading. */
  showShippers: boolean
  shippers: OverviewShipper[]
}

export interface RejectionOverview {
  /** The six defect columns, then any other reason that occurs, worst first. */
  columns: OverviewColumn[]
  sellers: OverviewSeller[]
  /** Certificates failing each column; a certificate counts under every one it failed. */
  failing: Partial<Record<OverviewColumn, number>>
  total: number
  mt: number
}

const violationsOf = (r: PerformanceRow): string[] =>
  ((r as { _violations?: string[] })._violations) ?? []

/** "1 fault", "2 taints", "3 combined": a count that names nothing. */
const isBareCount = (v: ReasonValue) => /^\d+ (faults?|taints?|combined)$/.test(v.value)

/**
 * Name the cup faults / taints the cuppers settled on. A failing cell that
 * only counts them ("1 fault") takes the names instead; a taint within the
 * limit still shows, marked as recorded.
 */
function nameCup(cells: OverviewRow['cells'], col: 'cup_fault' | 'cup_taint', names: string[]) {
  if (names.length === 0) return
  const cell = cells[col]
  if (!cell) cells[col] = [{ value: names.join(', '), limit: null, recorded: true }]
  else if (cell.every(isBareCount)) cells[col] = [{ value: names.join(', '), limit: cell[0].limit }]
}

function overviewRow(r: PerformanceRow): OverviewRow {
  const { reasons, worst } = classifyRejection(violationsOf(r))
  const keep = new Set(reasons)
  const cells: OverviewRow['cells'] = {}
  for (const v of violationsOf(r)) {
    for (const { key, value, limit } of violationDetails(v)) {
      if (!keep.has(reasonOfColumn(key))) continue
      ;(cells[key] ??= []).push({ value, limit })
    }
  }
  const detail = r.rejection_detail
  if (detail) {
    if (cells.primary && detail.primaryDefects.length > 0) {
      const names = detail.primaryDefects.join(', ')
      cells.primary = cells.primary.map(v => ({ ...v, value: `${v.value} (${names})` }))
    }
    nameCup(cells, 'cup_fault', detail.faults)
    nameCup(cells, 'cup_taint', detail.taints)
  }
  // A reason with no sentence at all still gets its "Not recorded" cell.
  const filled = new Set((Object.keys(cells) as OverviewColumn[]).map(reasonOfColumn))
  for (const k of reasons) if (!filled.has(k)) cells[k] = [{ value: 'Not recorded', limit: null }]
  return { row: r, cells, worst }
}

const mtOf = (rows: OverviewRow[]) => Math.round(rows.reduce((s, o) => s + (o.row.mt ?? 0), 0) * 10) / 10
const byCountThenName = <T extends { n: number; name: string }>(a: T, b: T) =>
  b.n - a.n || a.name.localeCompare(b.name)
const failed = (cell: ReasonValue[] | undefined) => !!cell?.some(v => !v.recorded)

/** Null when the period has no rejections (the page is left out). */
export function buildRejectionOverview(rows: PerformanceRow[]): RejectionOverview | null {
  const rejected = sortAppendixRows(rows.filter(r => r.is_rejected)).map(overviewRow)
  if (rejected.length === 0) return null

  // Seller falls back to the shipper, like the Seller chart (bySeller).
  const sellerOf = (o: OverviewRow) => o.row.seller_name?.trim() || o.row.exporter_name?.trim() || 'Not recorded'
  const shipperOf = (o: OverviewRow) => o.row.exporter_name?.trim() || 'Not recorded'

  const bySeller = new Map<string, OverviewRow[]>()
  for (const o of rejected) bySeller.set(sellerOf(o), [...(bySeller.get(sellerOf(o)) ?? []), o])

  const sellers: OverviewSeller[] = [...bySeller.entries()]
    .map(([name, list]) => ({ name, n: list.length, list }))
    .sort(byCountThenName)
    .map(({ name, list }) => {
      const byShipper = new Map<string, OverviewRow[]>()
      for (const o of list) byShipper.set(shipperOf(o), [...(byShipper.get(shipperOf(o)) ?? []), o])
      const shippers = [...byShipper.entries()]
        .map(([s, rs]) => ({ name: s, n: rs.length, rs }))
        .sort(byCountThenName)
        .map(({ name: shipper, rs }) => ({ shipper, rows: rs }))
      return { seller: name, certificates: list.length, mt: mtOf(list), showShippers: shippers.length > 1, shippers }
    })

  const failing: RejectionOverview['failing'] = {}
  for (const o of rejected) {
    for (const [k, cell] of Object.entries(o.cells) as Array<[OverviewColumn, ReasonValue[]]>) {
      if (failed(cell)) failing[k] = (failing[k] ?? 0) + 1
    }
  }

  const others = REJECTION_REASONS.map(r => r.key as OverviewColumn).filter(k => !DEFECT_COLUMNS.includes(k) && failing[k])
  return {
    columns: [...DEFECT_COLUMNS, ...others],
    sellers,
    failing,
    total: rejected.length,
    mt: mtOf(rejected),
  }
}
