import type { IssuedValues } from '@/lib/tolerance/issued-values'
import { sortScreenSizeEntries } from '@/types/screen-size-constraints'
import { isPanScreen } from '@/lib/tolerance/limits'

/**
 * "18" -> "Screen 18" (a bare screen number); a pan key in any of its spellings
 * ("Pan", "Fundo", "Bottom", ...) -> the single canonical "Pan"; anything else
 * ("Peas 11", or a legacy key already spelled "Screen 18") is shown as-is, so a
 * name that already carries its own label is never doubled into "Screen Screen 18".
 */
function formatScreenLabel(size: string): string {
  if (isPanScreen(size)) return 'Pan'
  if (/^\d+$/.test(size)) return `Screen ${size}`
  return size
}

/**
 * Internal-only. Staff always read the real measurement; this is the secondary
 * line telling them what the buyer's certificate carries instead.
 */
export function ApprovedWithCommentsBadge({ issued }: { issued: IssuedValues | null }) {
  if (!issued) return null

  const parts: string[] = []
  // Domain order, not object-key order: largest screen first, pan last. Reuses
  // the same helper normalize-distribution.ts sorts issued screens with, so
  // "Pan" and "Peas N" sizes (which a bare-numeric or ascending-numeric sort
  // cannot place) land where the rest of the app already puts them.
  const sortedScreens = sortScreenSizeEntries(Object.entries(issued.screen_percentages ?? {}))
  for (const [size, pct] of sortedScreens) {
    parts.push(`${formatScreenLabel(size)} ${Math.round(pct * 10) / 10}%`)
  }
  if (issued.defects) parts.push(`${issued.defects.total} defects`)

  return (
    <div className="text-xs">
      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">
        Approved with comments
      </span>
      {parts.length > 0 && (
        <span className="ml-2 text-muted-foreground">Issued: {parts.join(' · ')}</span>
      )}
    </div>
  )
}
