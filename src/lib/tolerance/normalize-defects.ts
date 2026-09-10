import type { DefectConfig } from '@/types/defect-configuration'

export interface DefectLimits {
  max_primary?: number
  max_secondary?: number
  max_total?: number
}

export interface IssuedDefects {
  counts: Record<string, number>
  primary: number
  secondary: number
  total: number
}

export type DefectResult =
  | { ok: true; issued: IssuedDefects }
  | { ok: false; reason: string }

const EPS = 1e-9
const round2 = (n: number) => Math.round(n * 100) / 100

function weightedTotal(
  counts: Record<string, number>,
  configs: DefectConfig[],
  category: 'primary' | 'secondary',
): number {
  let total = 0
  for (const c of configs) {
    if (c.category !== category) continue
    total += (counts[c.name] || 0) * c.weight
  }
  return round2(total)
}

/**
 * Issue a defect count that meets every non-primary limit.
 *
 * Limits are expressed in full-defect EQUIVALENTS (count x weight), so removing
 * one bean moves the total by that category's weight — 0.2 or 0.34, not 1. An
 * exact landing on the limit therefore often does not exist, and the rule is to
 * stop at the first achievable total that MEETS the limit: better than required,
 * never worse.
 *
 * Primary defects are never reduced. A lot whose primary limit is the failing one
 * is refused here and is non-tolerable upstream.
 */
export function normalizeDefects(
  counts: Record<string, number>,
  configs: DefectConfig[],
  limits: DefectLimits,
): DefectResult {
  if (!configs.length || Object.keys(counts).length === 0) {
    return { ok: false, reason: 'This lot has no per-category defect counts stored' }
  }

  const issued: Record<string, number> = { ...counts }
  const primary = weightedTotal(issued, configs, 'primary')

  if (limits.max_primary !== undefined && primary > limits.max_primary + EPS) {
    return { ok: false, reason: 'The primary defect limit is exceeded and primary defects are never reduced' }
  }

  const secondaryConfigs = configs.filter((c) => c.category === 'secondary')
  const over = (): boolean => {
    const secondary = weightedTotal(issued, configs, 'secondary')
    const total = round2(primary + secondary)
    if (limits.max_secondary !== undefined && secondary > limits.max_secondary + EPS) return true
    if (limits.max_total !== undefined && total > limits.max_total + EPS) return true
    return false
  }

  while (over()) {
    // The category currently contributing the most weighted equivalents.
    // Ties break on the heavier bean, then on name, so the result is deterministic.
    let pick: DefectConfig | null = null
    let best = -1
    for (const c of secondaryConfigs) {
      const n = issued[c.name] || 0
      if (n <= 0) continue
      const contribution = n * c.weight
      if (
        contribution > best + EPS ||
        (Math.abs(contribution - best) <= EPS &&
          pick !== null &&
          (c.weight > pick.weight || (c.weight === pick.weight && c.name < pick.name)))
      ) {
        best = contribution
        pick = c
      }
    }
    if (!pick) {
      return { ok: false, reason: 'Secondary defect categories are exhausted and the limit is still exceeded' }
    }
    issued[pick.name] = (issued[pick.name] || 0) - 1
  }

  const secondary = weightedTotal(issued, configs, 'secondary')
  return {
    ok: true,
    issued: { counts: issued, primary, secondary, total: round2(primary + secondary) },
  }
}
