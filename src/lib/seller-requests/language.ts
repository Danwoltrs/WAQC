import type { Lang } from './types'

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase()

/** The 27 Brazilian federative units (26 states + DF). */
const BRAZIL_UF = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

/**
 * Language of an email to this seller (port of sys shipment-board/derive.ts):
 * an explicit `preferred_language` of pt / en decides; otherwise PT when the
 * country is Brazil, or when the country is blank and `state` is a Brazilian
 * UF; otherwise EN.
 */
export function sellerLanguage(
  co: { preferred_language?: string | null; country?: string | null; state?: string | null } | null,
): Lang {
  if (!co) return 'en'
  const pref = norm(co.preferred_language)
  if (pref === 'pt' || pref.startsWith('pt-')) return 'pt'
  if (pref === 'en' || pref.startsWith('en-')) return 'en'
  const country = norm(co.country)
  if (country === 'brazil' || country === 'brasil') return 'pt'
  if (!country && BRAZIL_UF.has((co.state ?? '').trim().toUpperCase())) return 'pt'
  return 'en'
}
