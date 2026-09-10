import type { IssuedValues } from '@/lib/tolerance/issued-values'

/**
 * Internal-only. Staff always read the real measurement; this is the secondary
 * line telling them what the buyer's certificate carries instead.
 */
export function ApprovedWithCommentsBadge({ issued }: { issued: IssuedValues | null }) {
  if (!issued) return null

  const parts: string[] = []
  // Object key order for numeric-string keys ("18", "15") is ascending numeric per
  // spec, regardless of insertion order — sort explicitly (largest screen first,
  // matching how screen sizes are conventionally listed) instead of relying on it.
  const sizes = Object.keys(issued.screen_percentages ?? {}).sort((a, b) => Number(b) - Number(a))
  for (const size of sizes) {
    const pct = (issued.screen_percentages as Record<string, number>)[size]
    parts.push(`Screen ${size} ${Math.round(pct * 10) / 10}%`)
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
