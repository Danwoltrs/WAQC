'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FLOOR_ITEM_KINDS, FLOOR_ITEM_LABELS, MAX_COLUMNS, MAX_CUBBY_CAPACITY, MAX_PLAN_CM, MAX_ROWS, MIN_SIZE_CM,
  type AccessSide, type FloorItemKind,
} from '@/lib/storage/floor-plan'
import { fromFootprint } from '@/lib/storage/geometry'
import { findShape, type EditorDoc, type ShapePatch, type ShapeRef } from './editor-state'
import { ShelfFrontGrid } from './shelf-front-grid'
import type { ZoneStyle } from './zone-colors'

interface InspectorProps {
  doc: EditorDoc
  selected: ShapeRef | null
  zones: Map<string, ZoneStyle>
  onPatch: (ref: ShapeRef, patch: ShapePatch) => void
  onRotate: (ref: ShapeRef) => void
  onDelete: (ref: ShapeRef) => void
}

/**
 * The text of a field that commits on blur or Enter, so one edit is one undo
 * step. Clicking another shape on the plan selects it before the field blurs,
 * so the shape to commit to and its starting value are taken at focus.
 */
function useDraft<T>(value: T, show: (v: T) => string) {
  const [text, setText] = useState(show(value))
  const editing = useRef<{ from: T; commit: (v: T) => void } | null>(null)
  const latest = useRef(value)
  latest.current = value
  useEffect(() => {
    if (!editing.current) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return {
    text,
    setText,
    begin: (commit: (v: T) => void) => { editing.current = { from: latest.current, commit } },
    /** Commit `next` when `accept` holds it, then show the selected shape's value. */
    end: (next: T | null, accept: (next: T, from: T) => boolean, current: (v: T) => void) => {
      const started = editing.current ?? { from: latest.current, commit: current }
      editing.current = null
      if (next !== null && next !== started.from && accept(next, started.from)) started.commit(next)
      setText(show(latest.current))
    },
  }
}

/** A whole number between min and max. */
function NumberField({ label, value, min, max, onCommit }: {
  label: string; value: number; min: number; max: number; onCommit: (n: number) => void
}) {
  const draft = useDraft(value, String)
  const end = () => {
    const n = Number.parseInt(draft.text, 10)
    draft.end(Number.isFinite(n) ? n : null, (next) => next >= min && next <= max, onCommit)
  }
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={draft.text} inputMode="numeric" aria-label={label} className="h-8"
        onFocus={() => draft.begin(onCommit)}
        onChange={(e) => draft.setText(e.target.value)} onBlur={end}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

function TextField({ label, value, onCommit, transform, valid }: {
  label: string
  value: string
  onCommit: (v: string) => void
  transform?: (v: string) => string
  /** A value that fails this snaps back instead of committing. */
  valid?: (v: string) => boolean
}) {
  const draft = useDraft(value, (v) => v)
  const end = () => draft.end(transform ? transform(draft.text) : draft.text, (next) => !valid || valid(next), onCommit)
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={draft.text} aria-label={label} className="h-8"
        onFocus={() => draft.begin(onCommit)}
        onChange={(e) => draft.setText(e.target.value)} onBlur={end}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

export function Inspector({ doc, selected, zones, onPatch, onRotate, onDelete }: InspectorProps) {
  const found = findShape(doc, selected)
  if (!selected || !found) {
    return <p className="text-sm text-muted-foreground">Select a shape to edit it, or pick a tool on the left and drag on the plan.</p>
  }
  const { info, item, shelf } = found
  const patch = (p: ShapePatch) => onPatch(selected, p)
  const title = shelf ? `Shelf ${shelf.shelf_letter}` : item ? FLOOR_ITEM_LABELS[item.kind] : 'Room'

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {/* X and Y are where the shape is drawn, turned or not. */}
        <NumberField label="X (cm)" value={info.fp.x} min={0} max={MAX_PLAN_CM}
          onCommit={(x) => patch({ x: fromFootprint({ ...info.fp, x }, info.rot).x })} />
        <NumberField label="Y (cm)" value={info.fp.y} min={0} max={MAX_PLAN_CM}
          onCommit={(y) => patch({ y: fromFootprint({ ...info.fp, y }, info.rot).y })} />
        <NumberField label="Width (cm)" value={info.rect.w} min={MIN_SIZE_CM} max={MAX_PLAN_CM} onCommit={(w) => patch({ w })} />
        <NumberField label="Depth (cm)" value={info.rect.d} min={MIN_SIZE_CM} max={MAX_PLAN_CM} onCommit={(d) => patch({ d })} />
      </div>

      {item && (
        <div className="space-y-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Kind</span>
            <Select value={item.kind} onValueChange={(v) => patch({ kind: v as FloorItemKind })}>
              <SelectTrigger className="h-8" aria-label="Kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLOOR_ITEM_KINDS.map((k) => <SelectItem key={k} value={k}>{FLOOR_ITEM_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <TextField label="Label" value={item.label ?? ''} onCommit={(label) => patch({ label })} />
        </div>
      )}

      {shelf && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Letter" value={shelf.shelf_letter} transform={(v) => v.trim().toUpperCase()}
              valid={(v) => /^[A-Z]{1,2}$/.test(v)} onCommit={(shelf_letter) => patch({ shelf_letter })} />
            <NumberField label="Samples per cubby" value={shelf.samples_per_position} min={1} max={MAX_CUBBY_CAPACITY}
              onCommit={(samples_per_position) => patch({ samples_per_position })} />
            <NumberField label="Rows" value={shelf.rows} min={1} max={MAX_ROWS} onCommit={(rows) => patch({ rows })} />
            <NumberField label="Columns" value={shelf.columns} min={1} max={MAX_COLUMNS} onCommit={(columns) => patch({ columns })} />
          </div>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Reached from</span>
            <Select value={shelf.access_side} onValueChange={(v) => patch({ access_side: v as AccessSide })}>
              <SelectTrigger className="h-8" aria-label="Reached from"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="front">Front only</SelectItem>
                <SelectItem value="both">Both sides</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <p className="text-xs text-muted-foreground">
            {shelf.rows * shelf.columns} cubbies, {(shelf.rows * shelf.columns * shelf.samples_per_position).toLocaleString()} samples
          </p>
          <ShelfFrontGrid letter={shelf.shelf_letter} rows={shelf.rows} columns={shelf.columns}
            capacity={shelf.samples_per_position} cubbies={shelf.cubbies} zones={zones} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onDelete(selected)}>
          <Trash2 className="mr-1.5 h-4 w-4" />Delete
        </Button>
        {selected.kind !== 'room' && (
          <Button variant="outline" size="sm" onClick={() => onRotate(selected)}>
            <RotateCw className="mr-1.5 h-4 w-4" />Rotate 90°
          </Button>
        )}
      </div>
    </div>
  )
}
