'use client'

import {
  BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  DefectDraft, SCREEN_ORDER, isPrimaryDefect, sortDefectsForDisplay, dominantScreens,
  DEFECT_PRIMARY_COLOR, DEFECT_SECONDARY_COLOR, SCREEN_COLOR, SCREEN_DOMINANT_COLOR,
} from './shared'

const GRID = 'rgba(128,128,128,0.15)'
const axisTick = { fontSize: 11, fill: 'currentColor' as const }

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center text-xs text-muted-foreground">
      {label}
    </div>
  )
}

/** Vertical bar chart of defect counts; primary defects in red, secondary in olive. */
export function DefectBarChart({ defects, height = 180 }: { defects: DefectDraft[]; height?: number }) {
  const data = sortDefectsForDisplay(defects)
    .filter((d) => d.name.trim())
    .map((d) => ({ name: d.name, count: Number(d.count) || 0, primary: isPrimaryDefect(d.name) }))
  if (data.length === 0) return <EmptyChart label="No defects recorded" />
  return (
    <div className="text-muted-foreground" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} interval={0} angle={-18} textAnchor="end" height={48} tickLine={false} axisLine={false} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(128,128,128,0.08)' }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(128,128,128,0.3)' }}
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={56}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.primary ? DEFECT_PRIMARY_COLOR : DEFECT_SECONDARY_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Vertical bar chart of grams per sieve size; dominant sieve(s) highlighted. */
export function ScreenBarChart({ screens, height = 180 }: { screens: Record<string, number>; height?: number }) {
  const dominant = new Set(dominantScreens(screens))
  const data = SCREEN_ORDER.map((size) => ({ size, grams: Number(screens[size]) || 0 }))
  const hasAny = data.some((d) => d.grams > 0)
  if (!hasAny) return <EmptyChart label="No screen distribution recorded" />
  return (
    <div className="text-muted-foreground" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="size" tick={axisTick} interval={0} tickLine={false} axisLine={false} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(128,128,128,0.08)' }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(128,128,128,0.3)' }}
          />
          <Bar dataKey="grams" radius={[8, 8, 0, 0]} maxBarSize={40}>
            {data.map((d, i) => (
              <Cell key={i} fill={dominant.has(d.size) ? SCREEN_DOMINANT_COLOR : SCREEN_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
