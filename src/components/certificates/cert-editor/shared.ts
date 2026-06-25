/**
 * Shared types, constants and pure helpers for the certificate edit overlay.
 *
 * The overlay rebuilds the cert-editing experience as a fullscreen 2x2 quadrant
 * dashboard with per-quadrant edit panels. All editable values live in a single
 * lifted `CertDraft`; the topbar Save commits the whole draft to the database in
 * one pass (fixing the old dual-save trap where defect edits were silently lost).
 */

// ---------------------------------------------------------------------------
// Chart palette (project convention: hardcoded hex, readable on light + dark).
// ---------------------------------------------------------------------------
export const CHART_COLORS = ['#556b2f', '#a9a454', '#b07946', '#445763', '#efe4d4', '#151618']
export const VALID_GREEN = '#22c55e'
export const INVALID_RED = '#ef4444'
/** Defect bars: secondary defects in olive, primary defects in red (out-of-spec weight). */
export const DEFECT_PRIMARY_COLOR = INVALID_RED
export const DEFECT_SECONDARY_COLOR = '#a9a454'
/** Screen distribution bars. */
export const SCREEN_COLOR = '#556b2f'
export const SCREEN_DOMINANT_COLOR = '#445763'
/** Cupping attribute bars. */
export const CUPPING_COLOR = '#556b2f'

/** Fixed sieve order used everywhere screen sizes are rendered. */
export const SCREEN_ORDER = ['20', '19', '18', '17', '16', '15', '14', '13', '12', '11', '10', 'Pan'] as const

/**
 * Names that classify a defect as PRIMARY (full-defect weight). Matches the
 * existing server/grading convention so the bar colours and totals agree with
 * the rest of the app. Everything else is treated as secondary.
 */
const PRIMARY_DEFECT_NAMES = [
  'full black', 'full sour', 'pod/cherry', 'pod', 'cherry',
  'large husk', 'large stone', 'stone/stick', 'stone', 'stick',
  'foreign material', 'foreign matter', 'foreign',
]

export function isPrimaryDefect(name: string): boolean {
  const n = (name || '').toLowerCase()
  return PRIMARY_DEFECT_NAMES.some((p) => n.includes(p))
}

// ---------------------------------------------------------------------------
// Editable shapes
// ---------------------------------------------------------------------------
export interface DefectDraft {
  name: string
  count: number
}

export interface TaintFaultDraft {
  name: string
  intensity?: number | null
}

/** The single source of truth for everything the overlay can edit. */
export interface CertDraft {
  /** Commercial / logistics fields — committed via PATCH /api/samples/[id]. */
  sample: Record<string, any>
  /** Quality fields — committed via POST /api/samples/[id]/quality-assessment. */
  defects: DefectDraft[]
  screens: Record<string, number>
  moisture: number | null
  density: number | null
  greenAspect: string | null
  roastAspect: string | null
  quakers: number | null
  taints: TaintFaultDraft[]
  faults: TaintFaultDraft[]
  cupping: Record<string, number>
  cupProfile: string | null
  cleanCup: boolean | null
  uniformCup: boolean | null
  cuppingComments: string | null
  gradingComments: string | null
}

// ---------------------------------------------------------------------------
// Derived summaries (pure)
// ---------------------------------------------------------------------------
export interface DefectTotals {
  total: number
  primary: number
  secondary: number
}

export function computeDefectTotals(defects: DefectDraft[]): DefectTotals {
  let primary = 0
  let secondary = 0
  for (const d of defects) {
    const c = Number.isFinite(d.count) ? d.count : 0
    if (isPrimaryDefect(d.name)) primary += c
    else secondary += c
  }
  return { total: primary + secondary, primary, secondary }
}

/**
 * Display order for defect bars/lists: primary defects first, then secondary,
 * each group ordered by count descending. Pure — never mutates the input.
 */
export function sortDefectsForDisplay(defects: DefectDraft[]): DefectDraft[] {
  return [...defects].sort((a, b) => {
    const ap = isPrimaryDefect(a.name) ? 0 : 1
    const bp = isPrimaryDefect(b.name) ? 0 : 1
    if (ap !== bp) return ap - bp
    const ac = Number.isFinite(a.count) ? a.count : 0
    const bc = Number.isFinite(b.count) ? b.count : 0
    return bc - ac
  })
}

/** Sum of screen grams (used to compute per-sieve percentages). */
export function screenTotal(screens: Record<string, number>): number {
  return Object.values(screens).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}

/** The sieve key(s) with the highest grams — highlighted as dominant. */
export function dominantScreens(screens: Record<string, number>): string[] {
  let max = 0
  for (const v of Object.values(screens)) if (Number.isFinite(v) && v > max) max = v
  if (max <= 0) return []
  return SCREEN_ORDER.filter((k) => (screens[k] ?? 0) === max)
}

/** SCA-style overall = sum of attribute final scores (matches certificate-data). */
export function cuppingOverall(cupping: Record<string, number>): number {
  const sum = Object.values(cupping).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
  return Math.round(sum * 100) / 100
}

/** Parse a number-ish input value, returning null for blank. */
export function toNumOrNull(v: string): number | null {
  if (v == null || v.trim() === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/** Title-case the sample/cert type chip. CVA wins over the raw sample_type. */
export function certTypeLabel(sampleType: string | null | undefined, isCVA: boolean): string {
  if (isCVA) return 'CVA'
  const t = (sampleType || '').trim()
  if (!t) return 'Sample'
  if (t.toLowerCase() === 'pss') return 'PSS'
  if (t.toLowerCase() === 'ss') return 'SS'
  return t.charAt(0).toUpperCase() + t.slice(1)
}
