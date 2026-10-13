'use client'

import { RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AlignEdge, Axis } from '@/lib/storage/arrange'
import {
  FLOOR_ITEM_KINDS, FLOOR_ITEM_LABELS, MAX_COLUMNS, MAX_CUBBY_CAPACITY, MAX_PLAN_CM, MAX_ROWS, MIN_SIZE_CM,
  type AccessSide, type FloorItemKind,
} from '@/lib/storage/floor-plan'
import { fromFootprint } from '@/lib/storage/geometry'
import { findShape, selectionGroup, shapeLocked, type EditorDoc, type ShapePatch, type ShapeRef } from './editor-state'
import { NumberField, TextField } from './inspector-fields'
import { GroupPanel, LockButton, MultiPanel } from './selection-panel'
import { ShelfFrontGrid } from './shelf-front-grid'
import type { ZoneStyle } from './zone-colors'

export interface InspectorProps {
  doc: EditorDoc
  selection: ShapeRef[]
  zones: Map<string, ZoneStyle>
  onPatch: (ref: ShapeRef, patch: ShapePatch) => void
  onRotate: () => void
  onDelete: () => void
  onLock: (locked: boolean) => void
  onGroup: () => void
  onUngroup: () => void
  onRenameGroup: (id: string, name: string | null) => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: Axis) => void
}

/** The Edit-mode side panel: one shape, one group, or several shapes. */
export function Inspector(props: InspectorProps) {
  const { doc, selection } = props
  if (selection.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a shape to edit it, or pick a tool on the left and drag on the plan. Right-click a shape for more.
      </p>
    )
  }
  const anyLocked = selection.some((r) => shapeLocked(doc, r))
  const allLocked = selection.every((r) => shapeLocked(doc, r))
  const group = selectionGroup(doc, selection)
  if (group) {
    return (
      <GroupPanel group={group} count={selection.length} allLocked={allLocked} anyLocked={anyLocked}
        onRename={(name) => props.onRenameGroup(group.id, name)} onLock={props.onLock}
        onUngroup={props.onUngroup} onDelete={props.onDelete} />
    )
  }
  if (selection.length > 1) {
    return (
      <MultiPanel count={selection.length} hasRoom={selection.some((r) => r.kind === 'room')}
        allLocked={allLocked} anyLocked={anyLocked} onGroup={props.onGroup} onAlign={props.onAlign}
        onDistribute={props.onDistribute} onLock={props.onLock} onDelete={props.onDelete} />
    )
  }
  return <ShapePanel {...props} selected={selection[0]} locked={anyLocked} />
}

function ShapePanel({ doc, selected, locked, zones, onPatch, onRotate, onDelete, onLock }:
  InspectorProps & { selected: ShapeRef; locked: boolean }) {
  const found = findShape(doc, selected)
  if (!found) return null
  const { info, room, item, shelf } = found
  const patch = (p: ShapePatch) => onPatch(selected, p)
  const title = shelf ? `Shelf ${shelf.shelf_letter}` : item ? FLOOR_ITEM_LABELS[item.kind] : room?.name || 'Room'

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {room && <TextField label="Name" focus="name" value={room.name ?? ''} onCommit={(name) => patch({ name })} />}
      <div className="grid grid-cols-2 gap-2">
        {/* X and Y are where the shape is drawn, turned or not; below 0 is fine until Save moves the plan back. */}
        <NumberField label="X (cm)" focus="first" disabled={locked} value={info.fp.x} min={-MAX_PLAN_CM} max={MAX_PLAN_CM}
          onCommit={(x) => patch({ x: fromFootprint({ ...info.fp, x }, info.rot).x })} />
        <NumberField label="Y (cm)" disabled={locked} value={info.fp.y} min={-MAX_PLAN_CM} max={MAX_PLAN_CM}
          onCommit={(y) => patch({ y: fromFootprint({ ...info.fp, y }, info.rot).y })} />
        <NumberField label="Width (cm)" disabled={locked} value={info.rect.w} min={MIN_SIZE_CM} max={MAX_PLAN_CM}
          onCommit={(w) => patch({ w })} />
        <NumberField label="Depth (cm)" disabled={locked} value={info.rect.d} min={MIN_SIZE_CM} max={MAX_PLAN_CM}
          onCommit={(d) => patch({ d })} />
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
          <TextField label="Label" focus="name" value={item.label ?? ''} onCommit={(label) => patch({ label })} />
        </div>
      )}

      {shelf && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Letter" focus="name" value={shelf.shelf_letter} transform={(v) => v.trim().toUpperCase()}
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" className="text-red-600" disabled={locked} onClick={onDelete}>
          <Trash2 className="mr-1.5 h-4 w-4" />Delete
        </Button>
        <div className="flex items-center gap-2">
          <LockButton allLocked={locked} onLock={onLock} />
          {selected.kind !== 'room' && (
            <Button variant="outline" size="sm" disabled={locked} onClick={onRotate}>
              <RotateCw className="mr-1.5 h-4 w-4" />Rotate 90°
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
