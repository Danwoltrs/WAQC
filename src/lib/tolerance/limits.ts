/**
 * The uniform tolerance. Deliberately NOT per-template: one number for screens
 * and pan, one for defects, changed here and nowhere else.
 */
export const SCREEN_TOLERANCE_PP = 5
export const DEFECT_TOLERANCE_EQ = 5

/** Pan sits in the same grams distribution as the screens, under several names. */
export function isPanScreen(size: string): boolean {
  const lower = size.trim().toLowerCase()
  return lower === 'pan' || lower === 'fundo' || lower === 'bottom' || lower.includes('pan')
}
