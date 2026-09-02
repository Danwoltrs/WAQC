/**
 * How far apart a specialty panel's cuppers are on one lot.
 *
 * Pure on purpose: the threshold and the score rows are inputs, so the rule
 * is testable without a database and the panel route stays thin. The commodity
 * side computes its own discrepancies inside scores/aggregate against
 * per-attribute increments; this is the CVA equivalent and deliberately works
 * on the single 0-100 score, which is the number that decides pass/fail.
 */

/** The spread, in CVA points, a panel may show before it is worth a second look. */
export const DEFAULT_SPREAD_MAX = 3

export interface PanelScore {
  cupper_id: string
  /** null = opened the lot but recorded nothing. Never 0 for "unscored". */
  cva_score: number | null
}

export interface PanelStats {
  /** How many cuppers actually recorded a score. */
  recorded: number
  /** Mean of the recorded scores; null when nobody has scored. */
  mean: number | null
  /** max - min over the recorded scores; 0 below two of them. */
  spread: number
  flagged: boolean
  /** Cuppers furthest from the mean, only when flagged. Ties are all named. */
  outliers: string[]
}

export function panelStats(scores: PanelScore[], threshold: number): PanelStats {
  // A null score is "not recorded", not zero — counting it would drag the mean
  // toward nothing and invent a spread out of somebody's unfinished work.
  const recorded = scores.filter(
    (s): s is PanelScore & { cva_score: number } =>
      typeof s.cva_score === 'number' && Number.isFinite(s.cva_score),
  )

  if (recorded.length === 0) {
    return { recorded: 0, mean: null, spread: 0, flagged: false, outliers: [] }
  }

  const values = recorded.map((s) => s.cva_score)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const spread = recorded.length < 2 ? 0 : Math.max(...values) - Math.min(...values)
  const flagged = spread > threshold

  // Only worth naming somebody when the panel actually disagrees.
  let outliers: string[] = []
  if (flagged) {
    const distances = recorded.map((s) => Math.abs(s.cva_score - mean))
    const furthest = Math.max(...distances)
    outliers = recorded.filter((_, i) => distances[i] === furthest).map((s) => s.cupper_id)
  }

  return { recorded: recorded.length, mean, spread, flagged, outliers }
}
