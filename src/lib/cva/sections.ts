// SCA CVA affective sections + presentation constants.

export type CvaSectionKey =
  | 'fragrance' | 'aroma' | 'flavor' | 'aftertaste'
  | 'acidity' | 'sweetness' | 'mouthfeel' | 'overall'

export interface CvaSectionDef {
  key: CvaSectionKey
  label: string
  /** Ambient accent — reconciled verbatim to the locked prototype's SECTIONS palette. */
  accent: string
  /** One-line SCA descriptor shown under the section heading. */
  hint: string
}

/** The 8 affective sections, in tasting order (SCA-104 §5.1). Accents match the prototype. */
export const CVA_SECTIONS: CvaSectionDef[] = [
  { key: 'fragrance',  label: 'Fragrance',  accent: '#a9a454', hint: 'Dry aroma of the ground coffee' },
  { key: 'aroma',      label: 'Aroma',      accent: '#6b8e23', hint: 'Wet aroma after breaking the crust' },
  { key: 'flavor',     label: 'Flavor',     accent: '#b07946', hint: 'Combined taste and retronasal aroma' },
  { key: 'aftertaste', label: 'Aftertaste', accent: '#8a5a36', hint: 'Lingering quality after swallowing' },
  { key: 'acidity',    label: 'Acidity',    accent: '#c2c63e', hint: 'Quality of the perceived acidity' },
  { key: 'sweetness',  label: 'Sweetness',  accent: '#e8a23d', hint: 'Perceived sweetness of the cup' },
  { key: 'mouthfeel',  label: 'Mouthfeel',  accent: '#445763', hint: 'Texture and weight in the mouth' },
  { key: 'overall',    label: 'Overall',    accent: '#6d6f54', hint: 'Holistic impression of quality' },
]

export const SECTION_KEYS: CvaSectionKey[] = CVA_SECTIONS.map((s) => s.key)

/** The 7 sections that carry a descriptive intensity (SCA-103 — no "overall" intensity). */
export const INTENSITY_KEYS = SECTION_KEYS.filter((k) => k !== 'overall') as Exclude<CvaSectionKey, 'overall'>[]

/** 9-point diverging impression scale: 1 (worst, red) → 5 (neutral gray) → 9 (best, green). */
export const IMPRESSION_COLORS: string[] = [
  '#b91c1c', '#dc2626', '#ef4444', '#f87171',
  '#9ca3af',
  '#86efac', '#4ade80', '#22c55e', '#16a34a',
]

/** SCA-104 §5.2 "Impression of Quality" rubric labels for scale points 1–9. */
export const IMPRESSION_LABELS: string[] = [
  'Extremely Low', 'Very Low', 'Moderately Low', 'Slightly Low',
  'Neither High nor Low',
  'Slightly High', 'Moderately High', 'Very High', 'Extremely High',
]
