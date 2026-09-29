'use client'

/**
 * UpSet chart of rejection-reason combinations — a Venn of five or six sets
 * is unreadable. Top: one bar per exact combination, largest first. Below: a
 * dot matrix, one row per reason; filled dots joined by a line mark the
 * reasons a combination is made of. The bars (Recharts) and the matrix (a
 * grid) share one left gutter and equal columns, so they line up.
 * Narrow screens get a ranked list instead.
 */
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { REJECTION_REASONS, type RejectionReasonKey } from '@/lib/reports/rejection-reasons'
import type { AnalyticsCombination } from '@/lib/reports/rejection-analytics'
import { cn } from '@/lib/utils'

const GUTTER = 128   // px: reason labels in the matrix, empty space under the bars
const DOT_ROW = 26   // px per matrix row
const MAX_COLUMNS = 15

interface Props {
  combinations: AnalyticsCombination[]
  selected: RejectionReasonKey[] | null
  onSelect: (reasons: RejectionReasonKey[]) => void
}

const key = (reasons: readonly RejectionReasonKey[]) => reasons.join('+')

export function UpsetChart({ combinations, selected, onSelect }: Props) {
  if (combinations.length === 0) {
    return <p className="text-sm text-muted-foreground">No rejections in this range.</p>
  }
  const shown = combinations.slice(0, MAX_COLUMNS)
  const hidden = combinations.slice(MAX_COLUMNS)
  const rows = REJECTION_REASONS.filter(r => combinations.some(c => c.reasons.includes(r.key)))
  const selectedKey = selected ? key(selected) : null
  const dim = (c: AnalyticsCombination) => selectedKey !== null && selectedKey !== key(c.reasons)
  const max = Math.max(...combinations.map(c => c.count))

  return (
    <div className="text-[#445763] dark:text-[#a9a454]">
      {/* Wide screens: bars over the dot matrix. */}
      <div className="hidden md:block">
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={shown} margin={{ top: 20, right: 0, bottom: 0, left: GUTTER }} barCategoryGap="28%">
              <XAxis dataKey="label" hide />
              <YAxis hide allowDecimals={false} domain={[0, max]} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }}
                content={({ active, payload }) => {
                  const c = active ? (payload?.[0]?.payload as AnalyticsCombination | undefined) : undefined
                  if (!c) return null
                  return (
                    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                      <div className="font-semibold">{c.label}</div>
                      <div className="text-muted-foreground">{c.count} {c.count === 1 ? 'certificate' : 'certificates'}</div>
                    </div>
                  )
                }}
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                className="cursor-pointer"
                onClick={(d: any) => d?.reasons && onSelect(d.reasons)}
                isAnimationActive={false}
              >
                {shown.map(c => (
                  <Cell key={key(c.reasons)} fill="currentColor" fillOpacity={dim(c) ? 0.35 : 1} />
                ))}
                <LabelList dataKey="count" position="top" className="fill-foreground text-xs font-semibold" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex border-t pt-2">
          <div className="shrink-0" style={{ width: GUTTER }}>
            {rows.map(r => (
              <div key={r.key} className="flex items-center pr-3 text-xs text-foreground" style={{ height: DOT_ROW }}>
                {r.label}
              </div>
            ))}
          </div>
          {shown.map(c => {
            const idx = rows.map((r, i) => (c.reasons.includes(r.key) ? i : -1)).filter(i => i >= 0)
            const first = Math.min(...idx)
            const last = Math.max(...idx)
            return (
              <button
                key={key(c.reasons)}
                type="button"
                onClick={() => onSelect(c.reasons)}
                aria-label={`${c.label}: ${c.count}`}
                className={cn('relative flex-1 min-w-0 rounded-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', dim(c) && 'opacity-40')}
              >
                {idx.length > 1 && (
                  <span
                    className="absolute left-1/2 w-0.5 -translate-x-1/2 bg-current"
                    style={{ top: first * DOT_ROW + DOT_ROW / 2, height: (last - first) * DOT_ROW }}
                  />
                )}
                {rows.map(r => (
                  <span key={r.key} className="relative flex items-center justify-center" style={{ height: DOT_ROW }}>
                    <span
                      className={cn(
                        'block h-2.5 w-2.5 rounded-full',
                        c.reasons.includes(r.key) ? 'bg-current' : 'bg-muted-foreground/20',
                      )}
                    />
                  </span>
                ))}
              </button>
            )
          })}
        </div>
        {hidden.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {hidden.length} smaller {hidden.length === 1 ? 'combination' : 'combinations'} not drawn
            ({hidden.reduce((s, c) => s + c.count, 0)} certificates).
          </p>
        )}
      </div>

      {/* Narrow screens: a ranked list. */}
      <ol className="space-y-1 md:hidden">
        {combinations.map((c, i) => (
          <li key={key(c.reasons)}>
            <button
              type="button"
              onClick={() => onSelect(c.reasons)}
              className={cn('w-full rounded-md px-2 py-2 text-left hover:bg-muted/60', dim(c) && 'opacity-40')}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm text-foreground">
                <span><span className="text-muted-foreground">{i + 1}.</span> {c.label}</span>
                <span className="font-semibold">{c.count}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-current" style={{ width: `${(c.count / max) * 100}%` }} />
              </div>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
