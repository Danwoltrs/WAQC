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

/** The 8 affective sections, in tasting order (SCA-104 §5.1). Accents + subtitles match the prototype. */
export const CVA_SECTIONS: CvaSectionDef[] = [
  { key: 'fragrance',  label: 'Fragrance',  accent: '#a9a454', hint: 'Dry grounds, before water. Breathe in. How intense and pleasant?' },
  { key: 'aroma',      label: 'Aroma',      accent: '#6b8e23', hint: 'Wet crust, just after the pour. The bloom of the cup.' },
  { key: 'flavor',     label: 'Flavor',     accent: '#b07946', hint: 'The peak of taste and retronasal aroma combined. The heart of it.' },
  { key: 'aftertaste', label: 'Aftertaste', accent: '#8a5a36', hint: 'What lingers after you swallow. Length and quality of the finish.' },
  { key: 'acidity',    label: 'Acidity',    accent: '#c2c63e', hint: 'Brightness and liveliness. Not sourness, but vibrancy.' },
  { key: 'sweetness',  label: 'Sweetness',  accent: '#e8a23d', hint: 'Perceived sweetness and roundness across the palate.' },
  { key: 'mouthfeel',  label: 'Mouthfeel',  accent: '#445763', hint: 'Body, texture and weight on the tongue.' },
  { key: 'overall',    label: 'Overall',    accent: '#6d6f54', hint: 'Your holistic impression. Does the cup come together?' },
]

export const SECTION_KEYS: CvaSectionKey[] = CVA_SECTIONS.map((s) => s.key)

/** The 7 sections that carry a descriptive intensity (SCA-103 — no "overall" intensity). */
export const INTENSITY_KEYS = SECTION_KEYS.filter((k) => k !== 'overall') as Exclude<CvaSectionKey, 'overall'>[]

/** 9-point diverging impression scale — smooth red→amber→neutral→green ramp (prototype `blockColor`). */
export const IMPRESSION_COLORS: string[] = [
  'rgb(239,68,68)', 'rgb(233,99,79)', 'rgb(212,138,62)', 'rgb(185,165,80)',
  'rgb(154,160,166)',
  'rgb(120,170,120)', 'rgb(90,185,100)', 'rgb(55,200,95)', 'rgb(34,197,94)',
]

/** SCA-104 §5.2 "Impression of Quality" rubric labels for scale points 1–9. */
export const IMPRESSION_LABELS: string[] = [
  'Extremely Low', 'Very Low', 'Moderately Low', 'Slightly Low',
  'Neither High nor Low',
  'Slightly High', 'Moderately High', 'Very High', 'Extremely High',
]
