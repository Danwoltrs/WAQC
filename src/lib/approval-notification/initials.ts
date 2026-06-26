import { getInitials } from './batch-send'

/**
 * Derive approver initials from a profile row.
 * Prefers first_name + last_name (e.g. "Anderson" + "Nascimento" → "AN");
 * falls back to full_name when first/last are absent ("Maria Silva" → "MS");
 * returns null when no name data is available.
 */
export function initialsFromProfile(p: {
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
}): string | null {
  const composed = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  const source = composed || (p.full_name ?? '').trim()
  if (!source) return null
  const result = getInitials(source)
  // getInitials returns '—' for empty strings; treat that as null here.
  return result === '—' ? null : result
}
