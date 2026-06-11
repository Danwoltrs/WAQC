import type { CvaSectionKey } from '@/lib/cva/sections'

export type RoastLevel = 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark'

export interface CvaSectionScore {
  impression?: number          // 1–9 initial impression
  impression_final?: number    // 1–9 cooled-final (this is what scores, if set)
  note?: string
}

export interface WheelPick {
  /** Full wheel path, most general first, e.g. ["Fruity","Berry","Blueberry"]. Length 1–3. */
  path: string[]
}

/** Overlay tab groups. Note: 'mouthfeel' has no wheel picks — consumers must
 *  narrow to 'aroma' | 'flavor_aftertaste' before touching `.picks`. */
export type DescribeGroup = 'aroma' | 'flavor_aftertaste' | 'mouthfeel'

export interface CvaDescribe {
  intensities: Record<Exclude<CvaSectionKey, 'overall'>, number>  // 7 sections, 0–15
  aroma:             { picks: WheelPick[]; cata: string[] }        // picks ≤5; cata DERIVED from picks
  flavor_aftertaste: { picks: WheelPick[]; cata: string[]; main_tastes: string[] }  // ≤5 / derived / ≤2
  mouthfeel:         { cata: string[] }                            // ≤2 of the 5 official options
  /** Freely elicited off-taxonomy notes — ALL sections per SCA-103 §6.3.4. */
  notes: {
    fragrance_aroma?: string
    flavor_aftertaste?: string
    mouthfeel?: string
    acidity?: string
    sweetness?: string
  }
  voice: Record<string, string>                                    // group → transcript (Phase 3)
}

export type CvaDefectType = 'moldy' | 'phenolic' | 'potato'

export interface CvaCups {
  non_uniform: number[]                                  // cup indices 1–5
  defective: { cup: number; type: CvaDefectType }[]
}

export interface CvaHighlights {
  narrative: string
  label: { nose: string; palate: string; finish: string; one_liner: string }
  lang: string
}

export interface CvaAssessment {
  protocol: 'cva'
  version: 1
  roast: { level?: RoastLevel; agtron?: number }
  sections: Partial<Record<CvaSectionKey, CvaSectionScore>>
  describe: CvaDescribe
  cups: CvaCups
  score: number
  u: number
  d: number
  highlights: CvaHighlights | null
}

export function createEmptyAssessment(): CvaAssessment {
  return {
    protocol: 'cva',
    version: 1,
    roast: {},
    sections: {},
    describe: {
      intensities: { fragrance: 0, aroma: 0, flavor: 0, aftertaste: 0, acidity: 0, sweetness: 0, mouthfeel: 0 },
      aroma: { picks: [], cata: [] },
      flavor_aftertaste: { picks: [], cata: [], main_tastes: [] },
      mouthfeel: { cata: [] },
      notes: {},
      voice: {},
    },
    cups: { non_uniform: [], defective: [] },
    score: 0,
    u: 0,
    d: 0,
    highlights: null,
  }
}

/**
 * Upgrade any persisted assessment to the current CvaDescribe shape.
 * Phase-1 rows were saved before the describe UI existed (empty or v1 blobs);
 * this fills missing picks arrays / notes keys without touching real data.
 */
export function normalizeAssessment(a: CvaAssessment): CvaAssessment {
  const empty = createEmptyAssessment()
  // The cast is deliberate: the input is typed CvaAssessment but comes from the
  // network/DB, where corrupted or pre-describe rows may lack the field entirely.
  const d = (a as Partial<CvaAssessment>).describe
  if (!d) return { ...a, describe: empty.describe }
  return {
    ...a,
    describe: {
      intensities: { ...empty.describe.intensities, ...d.intensities },
      aroma: { picks: d.aroma?.picks ?? [], cata: d.aroma?.cata ?? [] },
      flavor_aftertaste: {
        picks: d.flavor_aftertaste?.picks ?? [],
        cata: d.flavor_aftertaste?.cata ?? [],
        main_tastes: d.flavor_aftertaste?.main_tastes ?? [],
      },
      mouthfeel: { cata: d.mouthfeel?.cata ?? [] },
      notes: { ...d.notes },
      voice: d.voice ?? {},
    },
  }
}

/** True when nothing descriptive has been recorded — drives the requires_descriptors soft gate. */
export function describeIsEmpty(d: CvaDescribe): boolean {
  return (
    d.aroma.picks.length === 0 &&
    d.flavor_aftertaste.picks.length === 0 &&
    d.flavor_aftertaste.main_tastes.length === 0 &&
    d.mouthfeel.cata.length === 0 &&
    Object.values(d.intensities).every((v) => !v)
  )
}
