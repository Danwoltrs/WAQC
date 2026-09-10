export type ToleranceQuadrant = 'distribution' | 'defects'

export interface ToleranceItem {
  /** The compliance criterion key this came from. */
  key: string
  /** Human label, e.g. "Screen 18" or "Total defects". */
  label: string
  quadrant: ToleranceQuadrant
  direction: 'min' | 'max'
  actual: number
  limit: number
  /** Always positive: how far out of spec. */
  gap: number
  /** The tolerance that was applied to this metric. */
  tolerance: number
}

export interface ToleranceAssessment {
  /** True only when at least one criterion failed and every failure is within tolerance. */
  offered: boolean
  items: ToleranceItem[]
  /** Criterion keys that are non-tolerable or beyond tolerance. */
  blockedBy: string[]
}
