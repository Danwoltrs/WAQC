'use client'

/**
 * Certificates per rejection reason: one horizontal bar per reason, in
 * severity order. A certificate counts under every reason it failed, so the
 * bars add up to more than the rejections — the caption says so.
 */
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReasonCount, RejectionReasonKey } from '@/lib/reports/rejection-reasons'

const ROW = 36

interface Props {
  reasons: ReasonCount[]
  rejected: number
  selected: RejectionReasonKey | null
  onSelect: (key: RejectionReasonKey) => void
}

export function ReasonBars({ reasons, rejected, selected, onSelect }: Props) {
  if (reasons.length === 0) {
    return <p className="text-sm text-muted-foreground">No rejections in this range.</p>
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        How many certificates failed each reason. One certificate can count under several reasons, so
        these bars add up to more than the {rejected} rejected {rejected === 1 ? 'certificate' : 'certificates'}.
      </p>
      {/* Bars take the text colour: slate in light mode, sand in dark. */}
      <div className="text-[#445763] dark:text-[#a9a454]" style={{ height: reasons.length * ROW + 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={reasons} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={128}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as ReasonCount | undefined) : undefined
                if (!r) return null
                return (
                  <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                    <span className="font-semibold">{r.count}</span> {r.count === 1 ? 'certificate' : 'certificates'} failed on {r.label}
                  </div>
                )
              }}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              className="cursor-pointer"
              onClick={(d: any) => d?.key && onSelect(d.key)}
              isAnimationActive={false}
            >
              {reasons.map(r => (
                <Cell key={r.key} fill="currentColor" fillOpacity={selected && selected !== r.key ? 0.35 : 1} />
              ))}
              <LabelList dataKey="count" position="right" className="fill-foreground text-xs font-semibold" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
