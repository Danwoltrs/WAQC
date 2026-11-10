'use client'

import type { MonthBucket, ClientSummaryCounts } from '@/lib/clients/client-summary'
import { cn } from '@/lib/utils'

/** Result colours: the chart palette's olive and yellow-green, the validation red. */
export const RESULT_COLORS = { approved: '#556b2f', withComments: '#a9a454', rejected: '#ef4444' } as const

export function ResultLegend({ counts, className }: {
  counts: Pick<ClientSummaryCounts, 'approved' | 'approvedWithComments' | 'rejected'>
  className?: string
}) {
  const items = [
    { color: RESULT_COLORS.approved, label: 'Approved', n: counts.approved - counts.approvedWithComments },
    { color: RESULT_COLORS.withComments, label: 'Approved with comments', n: counts.approvedWithComments },
    { color: RESULT_COLORS.rejected, label: 'Rejected', n: counts.rejected },
  ]
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground', className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: i.color }} />
          {i.label} <span className="tabular-nums text-foreground">{i.n}</span>
        </span>
      ))}
    </div>
  )
}

/** Samples per month, stacked approved / with comments / rejected. */
export function MonthlyResultsChart({ monthly, height = 150 }: { monthly: MonthBucket[]; height?: number }) {
  const max = Math.max(1, ...monthly.map((m) => m.approved + m.withComments + m.rejected))
  return (
    <div>
      <div className="grid gap-2.5 items-end border-b border-border" style={{ gridTemplateColumns: `repeat(${monthly.length}, minmax(0, 1fr))`, height }}>
        {monthly.map((m) => {
          const total = m.approved + m.withComments + m.rejected
          return (
            <div
              key={m.month}
              className="flex h-full flex-col-reverse"
              title={`${m.label}: ${total} decided (${m.approved} approved, ${m.withComments} with comments, ${m.rejected} rejected)`}
            >
              {[
                [m.approved, RESULT_COLORS.approved],
                [m.withComments, RESULT_COLORS.withComments],
                [m.rejected, RESULT_COLORS.rejected],
              ].map(([n, color], i, arr) => {
                const isTop = arr.slice(i + 1).every(([later]) => !later)
                return n ? (
                  <div
                    key={i}
                    style={{ height: `${((n as number) / max) * 100}%`, background: color as string }}
                    className={cn('w-full', isTop && 'rounded-t-[4px]')}
                  />
                ) : null
              })}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 grid gap-2.5 text-center text-[11px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${monthly.length}, minmax(0, 1fr))` }}>
        {monthly.map((m) => <span key={m.month}>{m.label}</span>)}
      </div>
    </div>
  )
}

/** One bar split by result, for the Metrics tab. */
export function ResultSplitBar({ counts }: { counts: Pick<ClientSummaryCounts, 'approved' | 'approvedWithComments' | 'rejected'> }) {
  const plain = counts.approved - counts.approvedWithComments
  const total = plain + counts.approvedWithComments + counts.rejected
  if (total === 0) return <p className="text-[13px] text-muted-foreground">No decided samples yet.</p>
  return (
    <div className="flex h-3 overflow-hidden rounded-[2px]">
      {[[plain, RESULT_COLORS.approved], [counts.approvedWithComments, RESULT_COLORS.withComments], [counts.rejected, RESULT_COLORS.rejected]]
        .map(([n, color], i) => (n ? <div key={i} style={{ width: `${((n as number) / total) * 100}%`, background: color as string }} /> : null))}
    </div>
  )
}

/** Horizontal bars with the label on one line (truncated) and the figure written out. */
export function LabelledBars({ rows, color, empty }: {
  rows: Array<{ label: string; value: number; display: string }>
  color: string
  empty: string
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 text-[13px]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <span className="truncate" title={r.label}>{r.label}</span>
          <span className="h-3.5 bg-muted">
            <span className="block h-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{r.display}</span>
        </div>
      ))}
    </div>
  )
}
