// SCA CVA affective sections + presentation constants.

export type CvaSectionKey =
  | 'fragrance' | 'aroma' | 'flavor' | 'aftertaste'
  | 'acidity' | 'sweetness' | 'mouthfeel' | 'overall'

export interface CvaSectionDef {
  key: CvaSectionKey
  label: string
  /** Brand-aligned ambient accent (Wolthers chart palette + tasteful extensions). Tunable. */
  accent: string
}

/** The 8 affective sections, in tasting order (SCA-104 §5.1). */
export const CVA_SECTIONS: CvaSectionDef[] = [
  { key: 'fragrance',  label: 'Fragrance',  accent: '#556b2f' },
  { key: 'aroma',      label: 'Aroma',      accent: '#a9a454' },
  { key: 'flavor',     label: 'Flavor',     accent: '#b07946' },
  { key: 'aftertaste', label: 'Aftertaste', accent: '#8c6239' },
  { key: 'acidity',    label: 'Acidity',    accent: '#445763' },
  { key: 'sweetness',  label: 'Sweetness',  accent: '#c9a84a' },
  { key: 'mouthfeel',  label: 'Mouthfeel',  accent: '#6b7280' },
  { key: 'overall',    label: 'Overall',    accent: '#151618' },
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
