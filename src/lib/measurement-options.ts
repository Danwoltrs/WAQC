/**
 * The lists a grader picks from when recording how a lot was measured: the
 * humidity method (with whether it is an ISO method) and the density type.
 * The lab keeps both lists itself (table qc_measurement_options).
 *
 * A lot stores the NAME it was measured with, in green_bean_data
 * (`moisture_method`, `moisture_method_iso`, `density_type`), so a certificate
 * already issued never changes when an entry is renamed or retired.
 */

export type MeasurementKind = 'humidity_method' | 'density_type'

export const MEASUREMENT_KINDS: readonly MeasurementKind[] = ['humidity_method', 'density_type']

export interface MeasurementOption {
  id: string
  kind: MeasurementKind
  name: string
  is_iso: boolean
  /** The quality parameter value (`moisture_standard`) this entry stands for, if any. */
  spec_key: string | null
  is_active: boolean
  sort_order: number
}

export const KIND_COPY: Record<MeasurementKind, { field: string; list: string; add: string }> = {
  humidity_method: { field: 'Humidity method', list: 'Humidity methods', add: 'Add a method' },
  density_type: { field: 'Density type', list: 'Density types', add: 'Add a type' },
}

export const MAX_OPTION_NAME = 80

/** Trimmed, single-spaced; null when nothing usable is left. */
export function cleanOptionName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(/\s+/g, ' ').trim()
  return name.length > 0 && name.length <= MAX_OPTION_NAME ? name : null
}

export function isMeasurementKind(value: unknown): value is MeasurementKind {
  return typeof value === 'string' && (MEASUREMENT_KINDS as readonly string[]).includes(value)
}

/** "ISO 6673 (ISO)" for an ISO method; the bare name otherwise. A name that already says ISO is left alone. */
export function optionLabel(option: Pick<MeasurementOption, 'name' | 'is_iso' | 'kind'>): string {
  if (option.kind !== 'humidity_method') return option.name
  if (/\biso\b/i.test(option.name)) return option.name
  return option.is_iso ? `${option.name} (ISO)` : `${option.name} (not ISO)`
}

/**
 * The choices for one lot: the active entries in list order, plus the name
 * saved on the lot when it is no longer (or never was) on the list, so the
 * field opens showing exactly what is saved.
 */
export function optionsForLot(
  options: MeasurementOption[],
  kind: MeasurementKind,
  saved?: string | null,
  savedIso?: boolean | null,
): Array<Pick<MeasurementOption, 'name' | 'is_iso' | 'kind'> & { retired?: true }> {
  const active = options
    .filter((o) => o.kind === kind && o.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((o) => ({ name: o.name, is_iso: o.is_iso, kind: o.kind }))
  const name = cleanOptionName(saved)
  if (name && !active.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
    return [...active, { name, is_iso: savedIso === true, kind, retired: true as const }]
  }
  return active
}

/** The method a lot starts from: the entry standing for its quality's `moisture_standard`. */
export function methodFromSpec(
  options: MeasurementOption[],
  parameters: Record<string, any> | null | undefined,
): MeasurementOption | null {
  const key = typeof parameters?.moisture_standard === 'string' ? parameters.moisture_standard : null
  if (!key) return null
  return options.find((o) => o.kind === 'humidity_method' && o.is_active && o.spec_key === key) ?? null
}

/** Is the named method an ISO one? The list decides; a name off the list keeps what was saved with the lot. */
export function isIsoMethod(options: MeasurementOption[], name: string | null | undefined, savedIso?: boolean | null): boolean {
  const clean = cleanOptionName(name)
  if (!clean) return false
  const found = options.find((o) => o.kind === 'humidity_method' && o.name.toLowerCase() === clean.toLowerCase())
  return found ? found.is_iso : savedIso === true
}

/**
 * What the lists hold before anyone adds to them: the two humidity standards
 * every quality already names. Served as-is when the table cannot be read, so
 * the field works either way.
 */
export const DEFAULT_MEASUREMENT_OPTIONS: MeasurementOption[] = [
  { id: 'default-coffee-industry', kind: 'humidity_method', name: 'Coffee industry', is_iso: false, spec_key: 'coffee_industry', is_active: true, sort_order: 10 },
  { id: 'default-iso-6673', kind: 'humidity_method', name: 'ISO 6673', is_iso: true, spec_key: 'iso_6673', is_active: true, sort_order: 20 },
]
