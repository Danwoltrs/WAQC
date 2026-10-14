/**
 * laboratories.code: NOT NULL, no default, and nothing in the create form asks
 * for it. Database functions find the head office by code = 'SANTOS_HQ' and the
 * user-management table shows it, so new labs get a code in the same style:
 * upper-case ascii words joined by underscores.
 */

const MAX_LENGTH = 24

export function labCodeBase(text: string | null | undefined): string | null {
  if (!text) return null

  const code = text
    .normalize('NFD')
    // Strip combining marks so Bogotá -> BOGOTA.
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/_+$/, '')

  return code || null
}

/** The base code, or the first free BASE_2, BASE_3, ... among the taken ones. */
export function uniqueLabCode(base: string, taken: string[]): string {
  const used = new Set(taken.map((code) => code.toUpperCase()))
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}
