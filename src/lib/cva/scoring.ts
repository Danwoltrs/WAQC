import { SECTION_KEYS } from './sections'
import type { CvaAssessment, CvaSectionScore } from '@/types/cva'

/** Round to nearest 0.25 (SCA CVA spec, §5.5). */
export function roundToQuarter(n: number): number {
  return Math.round(n * 4) / 4
}

/**
 * SCA CVA cupping score (SCA-104 §5.5):
 *   S = 0.65625·Σh + 52.75 − 2u − 4d, rounded to nearest 0.25.
 * @param sumH sum of the eight 9-point section impressions (final-if-shifted)
 * @param nonUniform number of non-uniform cups (u)
 * @param defective number of defective cups (d)
 */
export function cvaScoreFromSum(sumH: number, nonUniform = 0, defective = 0): number {
  return roundToQuarter(0.65625 * sumH + 52.75 - 2 * nonUniform - 4 * defective)
}

export interface CvaBand {
  label: string
  color: string
}

/**
 * SCA CVA quality band for a 0–100 score (prototype §reveal). Pure presentation —
 * the Wolthers/contract pass mark lives on quality_templates.cva_min_score, not here.
 */
export function cvaBand(score: number): CvaBand {
  if (score >= 90) return { label: 'Outstanding', color: '#22c55e' }
  if (score >= 85) return { label: 'Excellent', color: '#6b8e23' }
  if (score >= 80) return { label: 'Very Good', color: '#a9a454' }
  if (score >= 75) return { label: 'Good', color: '#d98a3d' }
  return { label: 'Below Specialty', color: '#e0563f' }
}

/** The impression that scores: the cooled "final" value if present, else the initial. */
export function effectiveImpression(section?: CvaSectionScore | null): number | null {
  if (!section) return null
  if (typeof section.impression_final === 'number') return section.impression_final
  if (typeof section.impression === 'number') return section.impression
  return null
}

export interface LiveScore {
  sum: number          // Σ of effective impressions over scored sections
  count: number        // how many of the 8 sections are scored
  complete: boolean    // all 8 scored
  u: number            // non-uniform cups
  d: number            // defective cups
  score: number        // CVA 0–100 from the current sum (provisional until complete)
}

/** Derive the live score from the assessment's sections + cups. */
export function computeAssessmentScore(a: Pick<CvaAssessment, 'sections' | 'cups'>): LiveScore {
  let sum = 0
  let count = 0
  for (const key of SECTION_KEYS) {
    const v = effectiveImpression(a.sections?.[key])
    if (v != null) {
      sum += v
      count += 1
    }
  }
  const u = a.cups?.non_uniform?.length ?? 0
  const d = a.cups?.defective?.length ?? 0
  return {
    sum,
    count,
    complete: count === SECTION_KEYS.length,
    u,
    d,
    score: cvaScoreFromSum(sum, u, d),
  }
}
