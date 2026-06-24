'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { DefectBarChart } from './charts'
import { QuadrantCard, EditPanel } from './ui-parts'
import { DefectDraft, computeDefectTotals, isPrimaryDefect } from './shared'

/** Read-only quadrant card. */
export function DefectsQuadrant({
  defects,
  locked,
  lockedReason,
  onEdit,
}: {
  defects: DefectDraft[]
  locked?: boolean
  lockedReason?: string | null
  onEdit: () => void
}) {
  const totals = computeDefectTotals(defects)
  return (
    <QuadrantCard
      title="Defects"
      meta={
        <span>
          Total <span className={totals.total > 0 ? 'font-semibold text-foreground' : ''}>{totals.total}</span>
          {' · '}
          {totals.primary} primary · {totals.secondary} secondary
        </span>
      }
      locked={locked}
      lockedReason={lockedReason}
      onEdit={onEdit}
    >
      <DefectBarChart defects={defects} />
    </QuadrantCard>
  )
}

interface Row {
  name: string
  countText: string
}

/** Live totals from the raw (string) rows so the summary updates as the user types. */
function liveTotals(rows: Row[]) {
  let primary = 0
  let secondary = 0
  for (const r of rows) {
    const c = parseInt(r.countText, 10)
    if (!Number.isFinite(c)) continue
    if (isPrimaryDefect(r.name)) primary += c
    else secondary += c
  }
  return { primary, secondary, total: primary + secondary }
}

/** Focused edit panel — fully controlled count inputs, live recalculated totals. */
export function DefectsEditPanel({
  open,
  defects,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  defects: DefectDraft[]
  saving?: boolean
  onCancel: () => void
  onApply: (next: DefectDraft[]) => void
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    defects.map((d) => ({ name: d.name, countText: String(d.count ?? 0) })),
  )

  const totals = liveTotals(rows)

  const setName = (i: number, name: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, name } : r)))
  const setCount = (i: number, countText: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, countText } : r)))
  const remove = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))
  const add = () => setRows((prev) => [...prev, { name: '', countText: '' }])

  const apply = () => {
    const next: DefectDraft[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), count: parseInt(r.countText, 10) || 0 }))
    onApply(next)
  }

  return (
    <EditPanel open={open} title="Edit defects" onCancel={onCancel} onSave={apply} saving={saving}>
      <div className="mb-4 flex items-center gap-4 rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
        <span>
          Total <span className="font-semibold text-foreground">{totals.total}</span>
        </span>
        <span className="text-muted-foreground">Primary {totals.primary}</span>
        <span className="text-muted-foreground">Secondary {totals.secondary}</span>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_96px_36px] items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>Defect</span>
          <span className="text-center">Count</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_96px_36px] items-center gap-2">
            <Input
              value={r.name}
              onChange={(e) => setName(i, e.target.value)}
              placeholder="Defect name"
              className="h-9"
            />
            <Input
              type="number"
              min="0"
              inputMode="numeric"
              value={r.countText}
              onChange={(e) => setCount(i, e.target.value)}
              className="h-9 text-center"
            />
            <button
              onClick={() => remove(i)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
              aria-label="Remove defect"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-1 py-4 text-sm text-muted-foreground">No defects recorded.</p>
        ) : null}
      </div>

      <Button variant="ghost" size="sm" className="mt-3 text-primary" onClick={add}>
        <Plus className="mr-1 h-4 w-4" />
        Add defect
      </Button>
    </EditPanel>
  )
}
