'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { DefectBarChart } from './charts'
import { QuadrantCard, EditPanel } from './ui-parts'
import { DefectDraft, computeDefectTotals, isPrimaryDefect } from './shared'
import type { DefectCatalogEntry } from '@/lib/grading/spec-defect-catalog'

/** Read-only quadrant card. */
export function DefectsQuadrant({
  defects,
  locked,
  lockedReason,
  readOnly,
  onEdit,
}: {
  defects: DefectDraft[]
  locked?: boolean
  lockedReason?: string | null
  readOnly?: boolean
  onEdit?: () => void
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
      readOnly={readOnly}
      onEdit={onEdit}
    >
      <DefectBarChart defects={defects} />
    </QuadrantCard>
  )
}

interface Row {
  name: string
  countText: string
  /** A defect type from the lot's spec: listed by name, only its count is typed. */
  fixed?: boolean
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

/**
 * One row per defect type the lot is graded against, with the recorded count
 * (blank when none), then any recorded defect the spec does not list. A lot
 * graded with no defects used to open an empty panel that asked for names.
 */
export function seedDefectRows(defects: DefectDraft[], catalog: DefectCatalogEntry[]): Row[] {
  const recorded = new Map<string, DefectDraft>()
  for (const d of defects) recorded.set(d.name.trim().toLowerCase(), d)
  const rows: Row[] = catalog.map((c) => {
    const hit = recorded.get(c.name.toLowerCase())
    recorded.delete(c.name.toLowerCase())
    return { name: c.name, countText: hit && hit.count ? String(hit.count) : '', fixed: true }
  })
  for (const d of defects) {
    if (!recorded.has(d.name.trim().toLowerCase())) continue
    rows.push({ name: d.name, countText: String(d.count ?? 0) })
  }
  return rows
}

/** Rows back to drafts: spec rows only when counted, added rows whenever named. */
export function defectRowsToDrafts(rows: Row[]): DefectDraft[] {
  return rows
    .filter((r) => r.name.trim() && (!r.fixed || (parseInt(r.countText, 10) || 0) > 0))
    .map((r) => ({ name: r.name.trim(), count: parseInt(r.countText, 10) || 0 }))
}

/** Focused edit panel — fully controlled count inputs, live recalculated totals. */
export function DefectsEditPanel({
  open,
  defects,
  catalog = [],
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  defects: DefectDraft[]
  /** Every defect type the lot is graded against; each gets a row. */
  catalog?: DefectCatalogEntry[]
  saving?: boolean
  onCancel: () => void
  onApply: (next: DefectDraft[]) => void
}) {
  const [rows, setRows] = useState<Row[]>(() => seedDefectRows(defects, catalog))

  const totals = liveTotals(rows)

  const setName = (i: number, name: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, name } : r)))
  const setCount = (i: number, countText: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, countText } : r)))
  const remove = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))
  const add = () => setRows((prev) => [...prev, { name: '', countText: '' }])

  const apply = () => onApply(defectRowsToDrafts(rows))

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
            {r.fixed ? (
              <span className="truncate px-3 text-sm">{r.name}</span>
            ) : (
              <Input
                value={r.name}
                onChange={(e) => setName(i, e.target.value)}
                placeholder="Defect name"
                className="h-9"
              />
            )}
            <Input
              type="number"
              min="0"
              inputMode="numeric"
              value={r.countText}
              onChange={(e) => setCount(i, e.target.value)}
              placeholder="0"
              aria-label={r.name ? `${r.name} count` : 'Defect count'}
              className="h-9 text-center"
            />
            {r.fixed ? (
              <span />
            ) : (
              <button
                onClick={() => remove(i)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                aria-label="Remove defect"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-1 py-4 text-sm text-muted-foreground">No defects recorded.</p>
        ) : null}
      </div>

      <Button variant="ghost" size="sm" className="mt-3 text-primary" onClick={add}>
        <Plus className="mr-1 h-4 w-4" />
        Add other defect
      </Button>
    </EditPanel>
  )
}
