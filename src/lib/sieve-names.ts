/**
 * One sieve, several spellings.
 *
 * Quality templates name a sieve "Screen 18"; older templates and the grading
 * defaults say "18"; the certificate editor re-saves grams under "18" whatever
 * they were graded as. Every place that looks a spec sieve up in a grading's
 * screen map has to go through `sieveKey`, or "Screen 18" finds nothing and the
 * lot reads 0% on a sieve that holds a quarter of it.
 *
 * Only the "Screen" prefix, case and spacing are ignored. "Peas 10" is not
 * "Screen 10", and "Pan" stays Pan.
 */
export function sieveKey(name: string): string {
  return String(name)
    .trim()
    .replace(/^screen[_\s]*/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * The share of the lot on a spec's sieve, from percentages keyed however the
 * grading saved them. 0 when the grading has no such sieve: no grams recorded
 * on it.
 */
export function sievePercent(percentages: Record<string, number>, specName: string): number {
  const key = sieveKey(specName)
  let sum = 0
  for (const [size, pct] of Object.entries(percentages)) {
    if (sieveKey(size) === key) sum += pct
  }
  return sum
}

/**
 * The grading's grams re-keyed to the spec's sieve names, so the grading form's
 * "Screen 18" row finds grams saved under "18". Without it the row shows empty,
 * and saving the form writes "Screen 18" next to the old "18": the sieve counted
 * twice. Keys the spec does not name are kept as they are.
 */
export function rekeyToSpec(
  grams: Record<string, number>,
  specNames: string[],
): Record<string, number> {
  const specByKey = new Map(specNames.map((n) => [sieveKey(n), n]))
  const out: Record<string, number> = {}
  for (const [size, g] of Object.entries(grams)) {
    const name = specByKey.get(sieveKey(size)) ?? size
    out[name] = (out[name] ?? 0) + g
  }
  return out
}

/**
 * "Screen 16" for a sieve, whether the spec keys it "16" or already "Screen 16"
 * (newer templates do). Prefixing unconditionally printed "Screen Screen 16"
 * on certificates and hid screen failures from the rejection reasons.
 */
export function screenName(size: string): string {
  const s = String(size).trim()
  return /^screen\b/i.test(s) ? s : `Screen ${s}`
}
