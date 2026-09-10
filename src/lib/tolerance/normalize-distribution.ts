import { getScreenSizeOrder } from '@/types/screen-size-constraints'
import { isPanScreen } from './limits'

export interface ScreenLimit {
  screen_size: string
  min?: number
  max?: number
}

export type DistributionResult =
  | { ok: true; issued: Record<string, number> }
  | { ok: false; reason: string }

const EPS = 1e-9

/**
 * Issue an in-spec screen distribution without inventing coffee.
 *
 * Input and output are PERCENTAGES and the total is preserved exactly: every
 * point added to one screen is taken from another. Percentages are derived from
 * grams upstream and always total 100, so a preserved total keeps the issued
 * distribution self-consistent.
 *
 * Order is the spec's: pan excess first, then screen minimums, then a full
 * re-validation. Anything the rules cannot satisfy refuses rather than
 * half-fixing.
 */
export function normalizeDistribution(
  actual: Record<string, number>,
  limits: ScreenLimit[],
): DistributionResult {
  const issued: Record<string, number> = { ...actual }
  const limitOf = new Map(limits.map((l) => [l.screen_size, l]))
  const total = Object.values(actual).reduce((a, b) => a + b, 0)

  // Largest screen first, pan last — getScreenSizeOrder already orders that way.
  const order = Object.keys(issued).sort((a, b) => getScreenSizeOrder(a) - getScreenSizeOrder(b))

  // 1. Pan over its maximum: push the excess up, smallest non-pan screen first.
  for (const size of order) {
    if (!isPanScreen(size)) continue
    const max = limitOf.get(size)?.max
    if (max === undefined || issued[size] <= max + EPS) continue

    let excess = issued[size] - max
    const receivers = order.filter((s) => !isPanScreen(s)).reverse()
    for (const r of receivers) {
      if (excess <= EPS) break
      const rMax = limitOf.get(r)?.max
      const capacity = rMax === undefined ? Infinity : rMax - issued[r]
      if (capacity <= EPS) continue
      const take = Math.min(excess, capacity)
      issued[r] += take
      excess -= take
    }
    if (excess > EPS) {
      return { ok: false, reason: `Pan excess cannot be absorbed by the screens above it` }
    }
    issued[size] = max
  }

  // 2. Screens short of their minimum: take from the next smaller screen and
  //    continue downward. Pan is last in `order`, so it is drawn on last.
  for (let i = 0; i < order.length; i++) {
    const size = order[i]
    const min = limitOf.get(size)?.min
    if (min === undefined) continue
    let need = min - issued[size]
    if (need <= EPS) continue

    for (let j = i + 1; j < order.length; j++) {
      if (need <= EPS) break
      const donor = order[j]
      const donorMin = limitOf.get(donor)?.min ?? 0
      const available = Math.max(0, issued[donor] - donorMin)
      if (available <= EPS) continue
      const take = Math.min(need, available)
      issued[donor] -= take
      need -= take
    }
    if (need > EPS) {
      return { ok: false, reason: `Screen ${size} cannot reach its minimum without breaching another limit` }
    }
    issued[size] = min
  }

  // 3. Re-validate every limit, and the total.
  for (const l of limits) {
    const v = issued[l.screen_size]
    if (v === undefined) continue
    if (l.min !== undefined && v < l.min - EPS) {
      return { ok: false, reason: `Screen ${l.screen_size} is still below its minimum` }
    }
    if (l.max !== undefined && v > l.max + EPS) {
      return { ok: false, reason: `Screen ${l.screen_size} is still above its maximum` }
    }
  }
  const issuedTotal = Object.values(issued).reduce((a, b) => a + b, 0)
  if (Math.abs(issuedTotal - total) > 1e-6) {
    return { ok: false, reason: 'Adjustment did not preserve the distribution total' }
  }

  return { ok: true, issued }
}
