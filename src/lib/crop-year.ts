/**
 * Coffee crop year helpers.
 *
 * Crop year runs Sep 1 → Aug 31 of the following calendar year. We label
 * each crop year by the last two digits of both years — e.g. "25/26" means
 * Sep 1 2025 through Aug 31 2026.
 *
 *   getCurrentCropYearStart()  — start year of the crop year we're in now
 *   formatCropYear(startYear)  — "YY/YY+1" display label
 *   cropYearRange(startYear)   — { start, end } Date pair for queries
 */

const CROP_YEAR_START_MONTH = 8 // September, zero-indexed

export function getCurrentCropYearStart(now: Date = new Date()): number {
  return now.getMonth() >= CROP_YEAR_START_MONTH
    ? now.getFullYear()
    : now.getFullYear() - 1
}

export function formatCropYear(startYear: number): string {
  const a = String(startYear).slice(-2).padStart(2, '0')
  const b = String(startYear + 1).slice(-2).padStart(2, '0')
  return `${a}/${b}`
}

export function cropYearRange(startYear: number): { start: Date; end: Date } {
  return {
    start: new Date(startYear, CROP_YEAR_START_MONTH, 1),
    end: new Date(startYear + 1, CROP_YEAR_START_MONTH, 1),
  }
}
