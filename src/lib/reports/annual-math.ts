/**
 * Rounding shared by every figure in the annual report, so the cover, the
 * tables and the AI facts can never round the same quantity differently.
 */

/** Round to one decimal (MT figures). */
export const round1 = (n: number): number => Math.round(n * 10) / 10

/** Whole-number percentage of `part` in `whole`; 0 when `whole` is 0. */
export const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0
