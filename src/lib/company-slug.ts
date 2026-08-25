/**
 * URL slug for a company name, used as the buyer segment of a public
 * certificate URL (/certificate/<buyer>/<number>).
 *
 * Certificate numbers are unique per client, not globally (migration
 * 20260824000000), so a scanned tin needs the client in the URL to tell two
 * clients' 000001/26 apart. The slug is a disambiguator, never an identifier:
 * resolution falls back to the number alone, so a company rename does not
 * invalidate tins already printed.
 *
 * Returns null when nothing printable survives, so callers fall back to the
 * bare number rather than emitting an empty path segment.
 */
export function companyNameToSlug(name: string | null | undefined): string | null {
  if (!name) return null

  const slug = name
    .normalize('NFD')
    // Strip combining marks so Cooxupé -> cooxupe and the URL stays ascii.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || null
}
