import type { ComplianceCriterion } from '@/lib/compliance-criteria'
import { DEFECT_TOLERANCE_EQ, SCREEN_TOLERANCE_PP, isPanScreen } from './limits'
import type { ToleranceAssessment, ToleranceItem } from './types'

/** Defect criteria that may be issued down. `primary_defects` is deliberately absent. */
const TOLERABLE_DEFECT_KEYS = new Set(['secondary_defects', 'total_defects'])

function toNumber(v: number | string | null): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

/**
 * Classify one failing criterion, or return null when it is not tolerable.
 *
 * This is an ALLOWLIST: a criterion key that does not match one of the shapes
 * below is non-tolerable, so any future quality check added to
 * compliance-criteria.ts fails closed rather than silently becoming approvable.
 */
function classify(c: ComplianceCriterion): Omit<ToleranceItem, 'gap' | 'tolerance'> | null {
  const actual = toNumber(c.actual)
  const limit = toNumber(c.limit)
  if (actual === null || limit === null) return null

  if (TOLERABLE_DEFECT_KEYS.has(c.key)) {
    return {
      key: c.key,
      label: c.label,
      quadrant: 'defects',
      direction: 'max',
      actual,
      limit,
    }
  }

  if (!c.key.startsWith('screen_')) return null
  // `screen_<size>_exact` is never tolerable; an exact requirement has no slack.
  if (c.key.endsWith('_exact')) return null

  let size: string
  let direction: 'min' | 'max'
  if (c.key.endsWith('_max')) {
    size = c.key.slice('screen_'.length, -'_max'.length)
    direction = 'max'
  } else if (c.key.endsWith('_min')) {
    size = c.key.slice('screen_'.length, -'_min'.length)
    direction = 'min'
  } else {
    // Legacy template format pushes a suffix-less key for the minimum.
    size = c.key.slice('screen_'.length)
    direction = 'min'
  }
  if (!size) return null

  return {
    key: c.key,
    label: isPanScreen(size) ? 'Pan' : `Screen ${size}`,
    quadrant: 'distribution',
    direction,
    actual,
    limit,
  }
}

/**
 * Decide whether a lot may be approved with comments.
 *
 * Judged from the approval gate's OWN criteria rather than re-derived, so the
 * banner can never disagree with the decision the gate would make.
 */
export function evaluateTolerance(criteria: ComplianceCriterion[]): ToleranceAssessment {
  const failures = criteria.filter((c) => !c.passed)
  if (failures.length === 0) return { offered: false, items: [], blockedBy: [] }

  const items: ToleranceItem[] = []
  const blockedBy: string[] = []

  for (const c of failures) {
    const base = classify(c)
    if (!base) {
      blockedBy.push(c.key)
      continue
    }
    const gap = base.direction === 'min' ? base.limit - base.actual : base.actual - base.limit
    const tolerance = base.quadrant === 'defects' ? DEFECT_TOLERANCE_EQ : SCREEN_TOLERANCE_PP
    if (gap > tolerance) {
      blockedBy.push(c.key)
      continue
    }
    items.push({ ...base, gap, tolerance })
  }

  return { offered: blockedBy.length === 0 && items.length > 0, items, blockedBy }
}
