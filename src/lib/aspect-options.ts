import { GREEN_ASPECT_TEMPLATES, ROAST_ASPECT_TEMPLATES } from '@/types/aspect-configuration'

export type AspectKind = 'green' | 'roast'

export interface AspectOption {
  label: string
  /** Rank on the quality's scale (higher is better). NaN for an unlisted saved value. */
  value: number
  /** A saved value that is on no list; offered so the field shows what is saved. */
  unlisted?: true
}

const CONFIG_KEY: Record<AspectKind, string> = {
  green: 'green_aspect_configuration',
  roast: 'roast_aspect_configuration',
}

const norm = (s: string) => s.trim().toLowerCase()

/** The house list for an aspect, used where a lot has no quality that configures one. */
export function standardAspectOptions(kind: AspectKind): AspectOption[] {
  const template = (kind === 'green' ? GREEN_ASPECT_TEMPLATES : ROAST_ASPECT_TEMPLATES)[0]
  return template.configuration.wordings.map((w) => ({ label: w.label, value: w.value }))
}

/** The levels a quality configures for one aspect; [] when it configures none. */
function specAspectOptions(parameters: Record<string, any> | null | undefined, kind: AspectKind): AspectOption[] {
  const wordings = parameters?.[CONFIG_KEY[kind]]?.wordings
  if (!Array.isArray(wordings)) return []
  return wordings
    .map((w: any) => ({
      label: typeof w === 'string' ? w : (w?.label || w?.name || ''),
      value: typeof w?.value === 'number' ? w.value : 0,
    }))
    .filter((o) => o.label !== '')
}

/**
 * The options an aspect dropdown offers for one lot: the levels its quality
 * configures, whatever the sample type. Only where the quality configures none
 * may a caller ask for the house list instead. A saved value that is not on the
 * list is added last, so the field always shows what is saved. No list at all
 * stays no list: the aspect is not part of that lot's grading.
 */
export function aspectOptions(input: {
  kind: AspectKind
  parameters: Record<string, any> | null | undefined
  saved?: string | null
  fallbackToStandard?: boolean
}): AspectOption[] {
  const fromSpec = specAspectOptions(input.parameters, input.kind)
  const options = fromSpec.length > 0 || !input.fallbackToStandard ? fromSpec : standardAspectOptions(input.kind)

  const saved = input.saved?.trim()
  if (saved && options.length > 0 && !options.some((o) => norm(o.label) === norm(saved))) {
    return [...options, { label: saved, value: Number.NaN, unlisted: true }]
  }
  return options
}
