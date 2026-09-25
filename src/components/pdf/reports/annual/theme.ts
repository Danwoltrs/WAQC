/**
 * Annual report design tokens. A clinical laboratory document: charcoal and
 * greys carry everything; colour appears only where it means something — a
 * problem rate (red) or a rank medal. Inter 400/600/700 only, never italic.
 */
import { MONTH_LABELS } from '@/lib/reports/annual-monthly'
import { pct as _pct } from '@/lib/reports/annual-math'

export const CHARCOAL = '#2F3337'
export const MUTED = '#6B6E72'
export const HAIR = '#E3E4E5'
export const FILL = '#F3F3F2'
export const WATCH_FILL = '#E6E7E8'
export const WATCH_BAR = '#A3A6AA'
export const RED = '#EF4444'
export const RED_FILL = '#FEEFEF'
export const GOLD = '#D4AF37'
export const SILVER = '#A8A8A8'
export const BRONZE = '#B07946'
export const WHITE = '#FFFFFF'

export const TYPE = {
  coverTitle: 20,
  coverGlance: 26,
  section: 12,
  kpi: 16,
  body: 9,
  table: 8,
  tableHead: 6.5,
  label: 6.5,
  small: 7,
} as const

export const PAGE_MARGIN = 36
/** A4 landscape width minus both margins. */
export const CONTENT_WIDTH = 841.89 - 2 * PAGE_MARGIN

/** Month grid geometry shared by the monthly chart, the totals table and the heat maps. */
export const MONTH_GRID = { name: 150, month: 42, year: 78 } as const
export const MONTH_GRID_WIDTH = MONTH_GRID.name + 12 * MONTH_GRID.month + MONTH_GRID.year
export const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const

export type RateBand = 'ok' | 'watch' | 'problem' | 'none'

export function rateBand(rate: number | null | undefined): RateBand {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return 'none'
  if (rate >= 90) return 'ok'
  if (rate >= 70) return 'watch'
  return 'problem'
}

export interface BandColors {
  text: string
  bar: string
  /** Heat-map cell fill; null = no fill (the norm needs no highlight). */
  cellFill: string | null
}

export function bandColors(band: RateBand): BandColors {
  switch (band) {
    case 'ok': return { text: CHARCOAL, bar: CHARCOAL, cellFill: null }
    case 'watch': return { text: CHARCOAL, bar: WATCH_BAR, cellFill: WATCH_FILL }
    case 'problem': return { text: RED, bar: RED, cellFill: RED_FILL }
    default: return { text: MUTED, bar: HAIR, cellFill: null }
  }
}

export { _pct as pct }
export const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US')
/** One decimal, thousands separated: tonnes and per-lot averages. */
export const fmt1 = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const fmtMt = fmt1
export const fmtPct = (n: number): string => `${Math.round(n)}%`

/** Shorten a label to at most `max` characters with an ellipsis, so a long legal name cannot grow a row. */
export function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

/** "25 Sep 2026" from an ISO timestamp (UTC). */
export function formatIssued(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
