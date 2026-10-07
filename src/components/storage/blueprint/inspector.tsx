'use client'

import { useEffect, useState } from 'react'
import { RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FLOOR_ITEM_KINDS, FLOOR_ITEM_LABELS, MAX_COLUMNS, MAX_CUBBY_CAPACITY, MAX_PLAN_CM, MAX_ROWS, MIN_SIZE_CM,
  type AccessSide, type FloorItemKind,
} from '@/lib/storage/floor-plan'
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

/** A number that commits on blur or Enter, so one edit is one undo step. */
function NumberField({ label, value, min, max, onCommit }: {
  label: string; value: number; min: number; max: number; onCommit: (n: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Number.parseInt(text, 10)
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n)
    else setText(String(value))
  }
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={text} inputMode="numeric" aria-label={label} className="h-8"
        onChange={(e) => setText(e.target.value)} onBlur={commit}
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
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => {
    const next = transform ? transform(text) : text
    if (next !== value && (!valid || valid(next))) onCommit(next)
    else setText(value)
  }
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={text} aria-label={label} className="h-8"
        onChange={(e) => setText(e.target.value)} onBlur={commit}
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
        <NumberField label="X (cm)" value={info.rect.x} min={0} max={MAX_PLAN_CM} onCommit={(x) => patch({ x })} />
        <NumberField label="Y (cm)" value={info.rect.y} min={0} max={MAX_PLAN_CM} onCommit={(y) => patch({ y })} />
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
