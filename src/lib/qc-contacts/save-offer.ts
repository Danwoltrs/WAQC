import { isValidEmail } from '@/lib/html'
import { isInternalEmail } from './tags'

/**
 * Pure: the addresses just added to an email's recipients that are worth offering
 * to save as a QC-certificate contact — new to this email (compared
 * case-insensitively), well-formed, external, not already saved for the company,
 * and not already declined ("just this send") in this sitting. `saved` and
 * `declined` hold lower-cased addresses. Order and typed casing are kept.
 */
export function addressesToOffer(args: {
  before: string[]
  after: string[]
  saved: ReadonlySet<string>
  declined: ReadonlySet<string>
}): string[] {
  const seen = new Set(args.before.map((e) => e.trim().toLowerCase()))
  const offer: string[] = []
  for (const raw of args.after) {
    const email = raw.trim()
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!isValidEmail(email) || isInternalEmail(email)) continue
    if (args.saved.has(key) || args.declined.has(key)) continue
    offer.push(email)
  }
  return offer
}
