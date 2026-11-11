/**
 * What changed between two `template.parameters` objects, in words a person
 * reads: the spec-change email and the portal's change dialog both use it.
 * Pure (no supabase, no next): the dialog imports it in the browser.
 */
import { format, parseISO } from 'date-fns'

export interface SpecChange {
  section: string
  path: string
  before: string
  after: string
}

// The spec editor's section titles (spec-editor-body.tsx SECTION_TITLES), by top-level key.
const PHYSICAL = 'Moisture, density & quakers'
const SECTION_OF_KEY: Record<string, string> = {
  origin: 'Basic information',
  sample_size_grams: 'Basic information',
  screen_size_requirements: 'Screen sizes',
  green_aspect_configuration: 'Green aspect',
  roast_aspect_configuration: 'Roast aspect',
  defect_configuration: 'Defects',
  moisture_min: PHYSICAL,
  moisture_max: PHYSICAL,
  moisture_standard: PHYSICAL,
  density_min: PHYSICAL,
  density_max: PHYSICAL,
  max_quakers: PHYSICAL,
  roast_sample_size_grams: PHYSICAL,
  cupping_attributes: 'Cupping attributes',
  taint_fault_configuration: 'Taints & faults',
  cup_status_rules: 'Clean / uniform cups',
}

export function sectionOfKey(key: string): string {
  return SECTION_OF_KEY[key] ?? 'Other'
}

const NONE = '(none)'
const MAX_VALUE = 200

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** JSON with sorted object keys, so key order never counts as a change. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (isPlainObject(v)) {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

function render(v: unknown): string {
  if (v === undefined || v === null) return NONE
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text
}

/** An array element's stable identity, when it has one. */
const keyOf = (el: any): string | null =>
  isPlainObject(el) ? (el.id ?? el.attribute ?? el.name ?? el.screen_size ?? null) : null
/** How a path names an element. */
const labelOf = (el: any, fallback: string): string =>
  isPlainObject(el) ? String(el.attribute ?? el.name ?? el.screen_size ?? el.label ?? fallback) : fallback

function keyedArrays(a: any[], b: any[]): boolean {
  const all = [...a, ...b]
  if (all.length === 0 || all.some((el) => keyOf(el) == null)) return false
  const unique = (list: any[]) => new Set(list.map((el) => String(keyOf(el)))).size === list.length
  return unique(a) && unique(b)
}

function walk(section: string, path: string, before: unknown, after: unknown, out: SpecChange[]): void {
  if (stable(before) === stable(after)) return
  if ((before === undefined || before === null) && (after === undefined || after === null)) return

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    for (const k of keys) walk(section, `${path}.${k}`, before[k], after[k], out)
    return
  }

  if (Array.isArray(before) && Array.isArray(after) && (before.some(isPlainObject) || after.some(isPlainObject))) {
    if (keyedArrays(before, after)) {
      const beforeBy = new Map(before.map((el) => [String(keyOf(el)), el]))
      const afterBy = new Map(after.map((el) => [String(keyOf(el)), el]))
      const keys = [...beforeBy.keys(), ...[...afterBy.keys()].filter((k) => !beforeBy.has(k))]
      for (const k of keys) {
        const b = beforeBy.get(k)
        const a = afterBy.get(k)
        walk(section, `${path}[${labelOf(b ?? a, k)}]`, b, a, out)
      }
      return
    }
    const n = Math.max(before.length, after.length)
    for (let i = 0; i < n; i++) walk(section, `${path}[${labelOf(before[i] ?? after[i], String(i))}]`, before[i], after[i], out)
    return
  }

  out.push({ section, path, before: render(before), after: render(after) })
}

/** Every leaf that differs, with its section title, dotted path and both values as text. */
export function diffSpecParameters(before: Record<string, any>, after: Record<string, any>): SpecChange[] {
  const b = isPlainObject(before) ? before : {}
  const a = isPlainObject(after) ? after : {}
  const out: SpecChange[] = []
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()
  for (const k of keys) walk(sectionOfKey(k), k, b[k], a[k], out)
  return out
}

const attributeNames = (p: Record<string, any>): string[] => {
  const list = isPlainObject(p) && Array.isArray(p.cupping_attributes) ? p.cupping_attributes : []
  return list
    .map((x: any) => (isPlainObject(x) ? x.attribute ?? x.name : null))
    .filter((n: unknown): n is string => typeof n === 'string' && n.trim() !== '')
}

/**
 * Cupping attribute names that are gone after the change. Names are keys
 * (scores are stored by name), so a rename drops the old name's history.
 */
export function removedCuppingAttributes(before: Record<string, any>, after: Record<string, any>): string[] {
  const kept = new Set(attributeNames(after))
  return [...new Set(attributeNames(before))].filter((n) => !kept.has(n))
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A real YYYY-MM-DD date (2026-02-30 is not). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** '2026-12-01' → '1 December 2026'. A calendar date: no timezone shift. */
export function formatSpecDate(ymd: string): string {
  return format(parseISO(ymd), 'd MMMM yyyy')
}
