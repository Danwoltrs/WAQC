import { sampleLabel, type SampleIdentifierTag, type SampleLabelSource } from '@/lib/sample-reference'

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
  /** How many cups in the set carried it. */
  cups?: number | null
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

/**
 * What names the sample in the editor's title. A shipment sample is known by
 * its ICO mark, and on a row of duplicates it is what differs, so an SS with
 * an ICO is titled by it. Anything else is titled as the samples list names
 * it: the certificate number once issued, else its own container, ICO or
 * sample number. Never the SAN- lab number, which is backend-only; a sample
 * with none of these is titled "Sample".
 */
export function sampleHeadline(
  sample: SampleLabelSource & { sample_type?: string | null },
): { tag: SampleIdentifierTag | null; value: string } {
  const ico = (sample.ico_number || '').trim()
  if ((sample.sample_type || '').toLowerCase() === 'ss' && ico) return { tag: 'ICO', value: ico }
  return sampleLabel(sample) ?? { tag: null, value: 'Sample' }
}

// ---------------------------------------------------------------------------
// Taints & faults
// ---------------------------------------------------------------------------
type CupDefectLists = { taints: TaintFaultDraft[]; faults: TaintFaultDraft[] }

/**
 * Every taint row in one shape, key order included. The save spots an edit by
 * comparing JSON, so a row seeded one way and handed back another would read
 * as a change and overwrite the validator's list with the same content.
 */
export function taintRow(name: string, intensity: number | null | undefined, cups: number | null | undefined): TaintFaultDraft {
  return { name, intensity: intensity ?? null, cups: cups ?? null }
}

/**
 * The taints and faults the editor starts from: what the certificate prints.
 * The PDF prints quality_assessments.resolved_defects whenever it holds a list
 * (an empty one means the validator cleared the cup) and only otherwise falls
 * back to the cupping cards, so the editor does the same.
 */
export function seedCupDefects(resolved: unknown, fromCards: CupDefectLists): CupDefectLists {
  const r = resolved as { taints?: unknown; faults?: unknown } | null
  if (!r || typeof r !== 'object' || !(Array.isArray(r.taints) || Array.isArray(r.faults))) {
    const same = (l: TaintFaultDraft[]) => l.map((d) => taintRow(d.name, d.intensity, d.cups))
    return { taints: same(fromCards.taints), faults: same(fromCards.faults) }
  }
  const read = (list: unknown): TaintFaultDraft[] =>
    (Array.isArray(list) ? list : []).flatMap((e): TaintFaultDraft[] => {
      // Older records store a bare name; newer ones an object.
      if (typeof e === 'string') return e.trim() ? [taintRow(e.trim(), null, null)] : []
      if (!e || typeof e !== 'object') return []
      const o = e as { name?: unknown; intensity?: unknown; cups_affected?: unknown }
      const name = typeof o.name === 'string' ? o.name.trim() : ''
      if (!name) return []
      return [taintRow(
        name,
        typeof o.intensity === 'number' ? o.intensity : null,
        typeof o.cups_affected === 'number' ? o.cups_affected : null,
      )]
    })
  return { taints: read(r.taints), faults: read(r.faults) }
}

export interface TaintFaultRules {
  max_taints?: number
  max_faults?: number
  max_combined?: number
  zero_tolerance?: boolean
}

/**
 * Which of the quality's taint/fault limits the edited list breaks, read the
 * way the compliance check reads them. Null when it breaks none. Editing never
 * re-decides the lot, so this is a warning for the editor, not a gate.
 */
export function taintLimitWarning(
  rules: TaintFaultRules | null | undefined,
  taints: TaintFaultDraft[],
  faults: TaintFaultDraft[],
): string | null {
  if (!rules) return null
  const t = taints.filter((d) => d.name.trim()).length
  const f = faults.filter((d) => d.name.trim()).length
  if (rules.zero_tolerance === true) return t + f > 0 ? 'This quality allows no taints or faults.' : null
  const broken: string[] = []
  if (typeof rules.max_taints === 'number' && t > rules.max_taints) {
    broken.push(`This quality allows at most ${rules.max_taints} taints; this lot now has ${t}.`)
  }
  if (typeof rules.max_faults === 'number' && f > rules.max_faults) {
    broken.push(`This quality allows at most ${rules.max_faults} faults; this lot now has ${f}.`)
  }
  if (typeof rules.max_combined === 'number' && t + f > rules.max_combined) {
    broken.push(`This quality allows at most ${rules.max_combined} taints and faults together; this lot now has ${t + f}.`)
  }
  return broken.length ? broken.join(' ') : null
}

/**
 * The taint/fault names a quality's cuppers pick from, to suggest in the
 * editor. A client quality's own list wins over its template's, as on the
 * cupping page. Any other name can still be typed.
 */
export function cupDefectNames(templateParams: unknown, customParams: unknown): string[] {
  type Entry = { name?: unknown; active?: unknown; display_order?: unknown } | string
  type Config = { defects?: Entry[]; taints?: Entry[]; faults?: Entry[] }
  const configOf = (p: unknown): Config | undefined =>
    (p as { taint_fault_configuration?: Config } | null | undefined)?.taint_fault_configuration
  const custom = configOf(customParams)
  const template = configOf(templateParams)
  const pick = (c: Config | undefined): Entry[] | null => {
    if (!c) return null
    if (Array.isArray(c.defects) && c.defects.length) return c.defects
    const legacy = [...(Array.isArray(c.taints) ? c.taints : []), ...(Array.isArray(c.faults) ? c.faults : [])]
    return legacy.length ? legacy : null
  }
  const entries = pick(custom) ?? pick(template) ?? []
  const order = (e: Entry) => (typeof e === 'object' && typeof e.display_order === 'number' ? e.display_order : 0)
  const names = [...entries]
    .filter((e) => typeof e === 'string' || e.active !== false)
    .sort((a, b) => order(a) - order(b))
    .map((e) => (typeof e === 'string' ? e : typeof e.name === 'string' ? e.name : '').trim())
    .filter(Boolean)
  return [...new Set(names)]
}

/** One taint or fault the way the certificate prints it: "Hard (riado) · 1 cup · int. 2". */
export function cupDefectLine(d: TaintFaultDraft): string {
  const parts = [d.name]
  if (d.cups != null && d.cups > 0) parts.push(`${d.cups} cup${d.cups === 1 ? '' : 's'}`)
  if (d.intensity != null) parts.push(`int. ${d.intensity}`)
  return parts.join(' · ')
}
