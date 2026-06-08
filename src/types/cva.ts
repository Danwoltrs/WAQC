import type { CvaSectionKey } from '@/lib/cva/sections'

export type RoastLevel = 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark'

export interface CvaSectionScore {
  impression?: number          // 1–9 initial impression
  impression_final?: number    // 1–9 cooled-final (this is what scores, if set)
  note?: string
}

export interface CvaDescribe {
  intensities: Record<Exclude<CvaSectionKey, 'overall'>, number>  // 7 sections, 0–15
  aroma: { cata: string[] }                                       // ≤5 olfactory (fragrance + aroma)
  flavor_aftertaste: { cata: string[]; main_tastes: string[] }    // ≤5 olfactory + ≤2 main tastes
  mouthfeel: { cata: string[] }                                   // ≤2 mouthfeel CATA
  notes: { acidity?: string; sweetness?: string }
  voice: Record<string, string>                                   // group → transcript (Phase 3)
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
      aroma: { cata: [] },
      flavor_aftertaste: { cata: [], main_tastes: [] },
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
