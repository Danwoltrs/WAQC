/**
 * Quakers: counted on the roasted sample, and limited per quality as "at most
 * X quakers per Y g". Both numbers live on the quality (`max_quakers`,
 * `roast_sample_size_grams`). The lot records the count and, when the lab
 * roasted a different amount, the weight it was counted on
 * (`green_bean_data.quaker_sample_grams`); the limit is then scaled to that
 * weight, so 5 per 300 g allows 2.5 on a 150 g roast.
 *
 * Quakers stay outside the 5% tolerance rule: see `src/lib/tolerance`.
 */

export interface QuakerLimit {
  /** The most quakers allowed on `perGrams` of roasted coffee. */
  max: number
  /** The roasted sample weight the limit is stated for; null when the quality names none. */
  perGrams: number | null
}

function positive(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function count(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

/** The quality's quaker limit, or null when the quality sets none. */
export function quakerLimit(parameters: Record<string, any> | null | undefined): QuakerLimit | null {
  const max = count(parameters?.max_quakers)
  if (max === null) return null
  return { max, perGrams: positive(parameters?.roast_sample_size_grams) }
}

/** The weight the lot's quakers were counted on: its own, else the quality's. */
export function quakerSampleGrams(
  greenBeanData: Record<string, any> | null | undefined,
  parameters: Record<string, any> | null | undefined,
): number | null {
  return positive(greenBeanData?.quaker_sample_grams) ?? positive(parameters?.roast_sample_size_grams)
}

export interface QuakerCheck {
  passed: boolean
  /** The most quakers allowed on the weight actually counted. */
  allowed: number
  /** True when the limit was scaled to a weight other than the quality's. */
  scaled: boolean
}

/**
 * Is `quakers`, counted on `countedGrams`, within the limit? The limit is scaled
 * in proportion when the counted weight differs from the quality's; with either
 * weight unknown the count is compared with the limit as stated.
 */
export function checkQuakers(quakers: number, limit: QuakerLimit, countedGrams?: number | null): QuakerCheck {
  const grams = positive(countedGrams)
  if (limit.perGrams === null || grams === null || grams === limit.perGrams) {
    return { passed: quakers <= limit.max, allowed: limit.max, scaled: false }
  }
  // Cross-multiplied so 5 per 300 g on 150 g is exactly 2.5, not 2.4999…
  return {
    passed: quakers * limit.perGrams <= limit.max * grams,
    allowed: (limit.max * grams) / limit.perGrams,
    scaled: true,
  }
}

/** A number without a trailing ".0": 2.5 → "2.5", 5 → "5". */
function tidy(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/** "3 quakers per 300 g"; "1 quaker per 300 g"; "3 quakers" when no weight is known. */
export function quakerPhrase(quakers: number, grams?: number | null): string {
  const noun = quakers === 1 ? 'quaker' : 'quakers'
  const g = positive(grams)
  return g === null ? `${tidy(quakers)} ${noun}` : `${tidy(quakers)} ${noun} per ${tidy(g)} g`
}

/** "max 5 per 300 g"; "max 5" when the quality names no weight. */
export function quakerLimitPhrase(limit: QuakerLimit): string {
  return limit.perGrams === null ? `max ${tidy(limit.max)}` : `max ${tidy(limit.max)} per ${tidy(limit.perGrams)} g`
}

/**
 * The sentence recorded when a lot is over the limit. The opening
 * "Quakers: N exceeds maximum (M)" is fixed: the rejection reports read the
 * count and the limit out of it. M is the limit on the weight counted; when
 * that was scaled, the weight and the quality's own limit follow.
 */
export function quakerViolation(quakers: number, limit: QuakerLimit, countedGrams?: number | null): string {
  const check = checkQuakers(quakers, limit, countedGrams)
  const base = `Quakers: ${tidy(quakers)} exceeds maximum (${tidy(check.allowed)})`
  if (!check.scaled) return base
  return `${base} on ${tidy(positive(countedGrams)!)} g, from ${tidy(limit.max)} per ${tidy(limit.perGrams!)} g`
}
