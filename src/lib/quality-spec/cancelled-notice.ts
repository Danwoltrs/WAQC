/**
 * The line the lab screens show after a staff save cancelled a client's
 * scheduled spec change (R33: the routes return `cancelledClientChanges`).
 * Pure: imported in the browser.
 */
import { formatSpecDate } from './spec-diff'

export function cancelledChangesNotice(list: unknown): string | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const parts = list
    .filter((c): c is { versionNo: number; effectiveFrom: string } => !!c && typeof c.effectiveFrom === 'string')
    .map((c) => `${formatSpecDate(c.effectiveFrom)} (version ${c.versionNo})`)
  if (parts.length === 0) return null
  const what = parts.length === 1 ? 'change' : 'changes'
  return `This save cancelled the client's ${what} scheduled from ${parts.join(' and ')}. Head office and the labs were emailed.`
}
