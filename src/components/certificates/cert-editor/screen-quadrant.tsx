'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { ScreenBarChart } from './charts'
import { QuadrantCard, EditPanel } from './ui-parts'
import { SCREEN_ORDER, dominantScreens } from './shared'

export function ScreenQuadrant({
  screens,
  locked,
  lockedReason,
  onEdit,
}: {
  screens: Record<string, number>
  locked?: boolean
  lockedReason?: string | null
  onEdit: () => void
}) {
  const dom = dominantScreens(screens)
  return (
    <QuadrantCard
      title="Screen distribution"
      meta={dom.length ? <span>Dominant: {dom.join(' · ')}</span> : <span>No data</span>}
      locked={locked}
      lockedReason={lockedReason}
      onEdit={onEdit}
    >
      <ScreenBarChart screens={screens} />
    </QuadrantCard>
  )
}

export function ScreenEditPanel({
  open,
  screens,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  screens: Record<string, number>
  saving?: boolean
  onCancel: () => void
  onApply: (next: Record<string, number>) => void
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const k of SCREEN_ORDER) o[k] = screens[k] != null && screens[k] !== 0 ? String(screens[k]) : ''
    return o
  })

  const set = (k: string, v: string) => setVals((prev) => ({ ...prev, [k]: v }))

  const apply = () => {
    const next: Record<string, number> = {}
    for (const k of SCREEN_ORDER) {
      const n = parseFloat(vals[k])
      if (Number.isFinite(n) && n > 0) next[k] = n
    }
    onApply(next)
  }

  return (
    <EditPanel open={open} title="Edit screen distribution" onCancel={onCancel} onSave={apply} saving={saving}>
      <p className="mb-4 text-xs text-muted-foreground">Grams retained on each sieve size.</p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {SCREEN_ORDER.map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <label className="text-center text-xs text-muted-foreground">{k}</label>
            <Input
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={vals[k]}
              onChange={(e) => set(k, e.target.value)}
              className="h-9 text-center"
            />
          </div>
        ))}
      </div>
    </EditPanel>
  )
}
