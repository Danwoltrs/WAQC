# Storage editor menu, lock and groups: Implementation Plan, Part B (Tasks 6-10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On top of Part A's data and reducer, give the canvas several-shape gestures, lock glyphs and labels; add every keyboard shortcut; give the side panel group and several-shape panels; add the right-click menu; ship.

**Architecture:** The canvas stays a plain SVG with its own pointer handlers; it reads `selection`, expands a click into its group through `expandSelection`, moves every member by the anchor's snapped footprint offset, and reports right-click targets by the `data-shape` attribute under the pointer. The right-click menu is a pure `menuState()` (what shows, what is disabled) rendered by Radix ContextMenu around the canvas. Shortcuts move into their own hook that reads the latest state through a ref.

**Tech Stack:** as Part A.

**Spec:** [`docs/superpowers/specs/2026-10-13-storage-editor-menu-groups-design.md`](../specs/2026-10-13-storage-editor-menu-groups-design.md). Part A (Tasks 1-5, done first): [`2026-10-13-storage-editor-menu-groups-part-a.md`](2026-10-13-storage-editor-menu-groups-part-a.md). The Global Constraints and Review Focus in Part A apply here unchanged.

## Interfaces from Part A that Part B uses

- `editor-state.ts`: `EditorState { doc; past; future; selection: ShapeRef[]; tool; dirty; notice }`, `ShapeInfo { ref; rect; rot; fp; blocks; locked; group }`, `RefPatch`, `Clip`, `listShapes`, `findShape` (with `room`), `isSelected`, `sameRef`, `shapeKey`, `refFromKey`, `shapeLocked`, `shapeGroupId`, `expandSelection`, `selectionGroup`, `copySelection`, `defaultRect`, `fromLayout`, `toSavePayload`.
- `use-blueprint-editor.ts` actions: `load, saved, setTool, select(refs, exact?), toggle(ref), selectAll(), checkpoint(), add(tool, rect), patch(ref, patch, record?), patchMany(patches, record?), rotate(turn?), nudge(dx, dy), lock(locked), remove(), group(), ungroup(), renameGroup(id, name), align(edge), distribute(axis), duplicate(), paste(clip, at), undo(), redo()`; `isTypingTarget(target)`; `type EditorActions`.
- `clipboard.ts`: `readClipboard(): Clip | null`, `writeClipboard(clip): void`.
- `arrange.ts`: `Turn`, `AlignEdge`, `Axis`, `unionRect`, `onPlanOffset`, `moveFootprintBy`.

---

### Task 6: Canvas: several shapes, group drags, lock glyphs, labels, right-click target

**Files:**
- Modify: `src/components/storage/blueprint/editor-state.ts` (add `boxSelection`)
- Modify: `src/components/storage/blueprint/shapes.tsx`
- Modify (rewrite): `src/components/storage/blueprint/blueprint-canvas.tsx`
- Modify: `src/components/storage/blueprint/storage-workspace.tsx` (canvas props)
- Test: `src/components/storage/blueprint/editor-state.test.ts`, `src/components/storage/blueprint/blueprint-canvas.test.tsx` (new)

**Interfaces:**
- Produces:
  - `boxSelection(doc: EditorDoc, box: Rect): ShapeRef[]` in `editor-state.ts`
  - `LockGlyph({ x, y, size, testId? })` in `shapes.tsx`; `ShelfShape`/`ItemShape` take `onDoubleClick?: () => void` and render `data-shape="shelf:<key>"` / `data-shape="item:<id>"`
  - From `blueprint-canvas.tsx`: `interface Point { x: number; y: number }`, `type MenuTarget = { kind: 'shape'; ref: ShapeRef; at: Point } | { kind: 'floor'; at: Point }`, and `BlueprintCanvasProps`:
    `{ doc; mode; tool; selection: ShapeRef[]; zones; highlightShelfKey?; fitToken; viewCentre?: { current: Point | null }; onSelect(refs, exact?); onToggle(ref); onCheckpoint(); onPatchMany(patches: RefPatch[]); onAdd(shape, rect); onContextTarget?(target: MenuTarget) }`
  - Test ids: `lock-<kind>:<key>` per locked shape, `selection-box` while Shift+dragging, `handle-<h>` as before.

- [ ] **Step 1: Write the failing `boxSelection` test**

Append to `src/components/storage/blueprint/editor-state.test.ts` (add `boxSelection` to the `./editor-state` import):

```ts
describe('boxSelection', () => {
  it('picks what the box touches, and a room only when the box holds all of it', () => {
    expect(boxSelection(grouped, { x: 150, y: 280, w: 100, d: 40 })).toEqual([I1])
    expect(boxSelection(grouped, { x: -10, y: -10, w: 900, d: 700 })).toContainEqual(R1)
    expect(boxSelection(grouped, { x: 10, y: 10, w: 50, d: 50 })).toEqual([SA])
  })
})
```

- [ ] **Step 2: Write the failing canvas tests**

Create `src/components/storage/blueprint/blueprint-canvas.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BlueprintCanvas, type BlueprintCanvasProps } from './blueprint-canvas'
import type { EditorDoc } from './editor-state'

// jsdom 25 has no PointerEvent: fireEvent.pointerDown would send a bare Event
// with no `button`, and the canvas ignores anything but the primary button.
if (!('PointerEvent' in window)) {
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent
}

const I1 = { kind: 'item' as const, key: 'i1' }
const I2 = { kind: 'item' as const, key: 'i2' }
const SA = { kind: 'shelf' as const, key: 's-a' }

const doc: EditorDoc = {
  plan: {
    version: 1,
    rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: 'Sample room', locked: true }],
    items: [
      { id: 'i1', kind: 'bench', label: null, x: 100, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
      { id: 'i2', kind: 'bench', label: null, x: 300, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
    ],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [{
    key: 's-a', id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
    x_cm: 50, y_cm: 50, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
    locked: true, group_id: null, company_id: null, cubbies: [],
  }],
}

function renderCanvas(over: Partial<BlueprintCanvasProps> = {}) {
  const props: BlueprintCanvasProps = {
    doc, mode: 'edit', tool: 'select', selection: [], zones: new Map(), fitToken: 0,
    onSelect: vi.fn(), onToggle: vi.fn(), onCheckpoint: vi.fn(), onPatchMany: vi.fn(), onAdd: vi.fn(),
    onContextTarget: vi.fn(),
    ...over,
  }
  render(<BlueprintCanvas {...props} />)
  return props
}

describe('BlueprintCanvas', () => {
  it('selects a clicked shape (the reducer widens it to its group), and one member on double-click', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1 })
    expect(p.onSelect).toHaveBeenCalledWith([I1])
    fireEvent.doubleClick(screen.getByTestId('item-i1'))
    expect(p.onSelect).toHaveBeenLastCalledWith([I1], true)
  })

  it('toggles a shape on Shift+click', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('item-i2'), { button: 0, pointerId: 1, shiftKey: true })
    expect(p.onToggle).toHaveBeenCalledWith(I2)
    expect(p.onSelect).not.toHaveBeenCalled()
  })

  it('moves every selected shape together, but pans when one of them is locked', () => {
    const moving = renderCanvas({ selection: [I1, I2] })
    fireEvent.pointerDown(screen.getAllByTestId('item-i1')[0], { button: 0, pointerId: 1 })
    fireEvent.pointerMove(screen.getAllByRole('application')[0], { pointerId: 1, clientX: 40, clientY: 0 })
    expect(moving.onCheckpoint).toHaveBeenCalledTimes(1)
    expect(vi.mocked(moving.onPatchMany).mock.calls[0][0].map((p) => p.ref)).toEqual([I1, I2])
  })

  it('pans instead of moving a locked shape', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('shelf-A'), { button: 0, pointerId: 1 })
    fireEvent.pointerMove(screen.getByRole('application'), { pointerId: 1, clientX: 40, clientY: 0 })
    expect(p.onCheckpoint).not.toHaveBeenCalled()
    expect(p.onPatchMany).not.toHaveBeenCalled()
  })

  it('marks locked shapes, names rooms and groups, and gives handles only to one unlocked shape', () => {
    renderCanvas({ selection: [SA] })
    expect(screen.getByTestId('lock-shelf:s-a')).toBeInTheDocument()
    expect(screen.getByTestId('lock-room:r1')).toBeInTheDocument()
    expect(screen.getByText('Sample room')).toBeInTheDocument()
    expect(screen.getByText('Bench pair')).toBeInTheDocument()
    expect(screen.queryByTestId('handle-n')).toBeNull()
  })

  it('gives handles to one unlocked shape', () => {
    renderCanvas({ selection: [I1] })
    expect(screen.getByTestId('handle-n')).toBeInTheDocument()
  })

  it('reports what was right-clicked, selecting it first', () => {
    const p = renderCanvas()
    fireEvent.contextMenu(screen.getByTestId('shelf-A'))
    expect(p.onSelect).toHaveBeenCalledWith([SA], false)
    expect(p.onContextTarget).toHaveBeenCalledWith({ kind: 'shape', ref: SA, at: { x: 0, y: 0 } })
    fireEvent.contextMenu(screen.getByRole('application'))
    expect(p.onContextTarget).toHaveBeenLastCalledWith({ kind: 'floor', at: { x: 0, y: 0 } })
  })
})
```

(The third test renders once; `getAllBy…[0]` keeps it robust if a previous render was not cleaned. Testing Library cleans up between tests, so `getBy…` also works.)

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/blueprint-canvas.test.tsx src/components/storage/blueprint/editor-state.test.ts`
Expected: FAIL (`boxSelection` missing; canvas props `onToggle`/`onPatchMany` unknown; no lock glyphs).

- [ ] **Step 4: Add `boxSelection`**

In `src/components/storage/blueprint/editor-state.ts`, import `rectsOverlap` from `@/lib/storage/geometry` (with `footprint, fromFootprint, snap`) and add after `selectedShapes`:

```ts
/** What a selection box picks: items and shelves it touches, a room only when it holds all of it. */
export function boxSelection(doc: EditorDoc, box: Rect): ShapeRef[] {
  const holds = (r: Rect) => r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.d <= box.y + box.d
  return listShapes(doc)
    .filter((s) => (s.ref.kind === 'room' ? holds(s.fp) : rectsOverlap(s.fp, box)))
    .map((s) => s.ref)
}
```

- [ ] **Step 5: Shapes: `data-shape`, double-click, `LockGlyph`**

In `src/components/storage/blueprint/shapes.tsx`:

- `ShelfShape` props gain `onDoubleClick?: () => void`; its `<g …>` gains `data-shape={`shelf:${shelf.key}`} onDoubleClick={onDoubleClick}`.
- `ItemShape` props become `{ item: FloorItem; cmPerPx: number; onPointerDown: Down; onDoubleClick?: () => void }`; its `<g …>` gains `data-shape={`item:${item.id}`} onDoubleClick={onDoubleClick}`.
- Append:

```tsx
/** A small padlock with its top-left at (x, y), `size` plan units wide; drawn over a locked shape. */
export function LockGlyph({ x, y, size, testId }: { x: number; y: number; size: number; testId?: string }) {
  const s = size
  return (
    <g pointerEvents="none" data-testid={testId}>
      <path
        d={`M ${x + s * 0.25} ${y + s * 0.45} V ${y + s * 0.3} A ${s * 0.25} ${s * 0.25} 0 0 1 ${x + s * 0.75} ${y + s * 0.3} V ${y + s * 0.45}`}
        fill="none" className="stroke-foreground" strokeWidth={1.25} vectorEffect="non-scaling-stroke"
      />
      <rect x={x} y={y + s * 0.45} width={s} height={s * 0.55} rx={s * 0.08} className="fill-foreground" />
    </g>
  )
}
```

- [ ] **Step 6: Rewrite the canvas**

Replace `src/components/storage/blueprint/blueprint-canvas.tsx` with:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { Rect, Rotation } from '@/lib/storage/floor-plan'
import {
  HANDLES, footprint, fromFootprint, moveShape, outlineSegments, overlappingKeys, planBounds,
  rectFromDrag, resizeRect, type Handle,
} from '@/lib/storage/geometry'
import { moveFootprintBy, onPlanOffset, unionRect } from '@/lib/storage/arrange'
import {
  boxSelection, defaultRect, expandSelection, isSelected, listShapes, refFromKey, sameRef, shapeKey,
  type DrawTool, type EditorDoc, type RefPatch, type ShapeInfo, type ShapeRef, type Tool,
} from './editor-state'
import { isTypingTarget } from './use-blueprint-editor'
import { ItemShape, LockGlyph, ShelfShape } from './shapes'
import type { ZoneStyle } from './zone-colors'

interface ViewBox { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
/** What was right-clicked: a shape, or the floor; `at` is the plan point under the pointer. */
export type MenuTarget = { kind: 'shape'; ref: ShapeRef; at: Point } | { kind: 'floor'; at: Point }

interface Member { ref: ShapeRef; rect: Rect; rot: Rotation }
type Gesture =
  | { kind: 'pan'; client: Point; view: ViewBox }
  | { kind: 'draw'; start: Point; current: Point; free: boolean }
  | { kind: 'move'; anchor: Member; start: Point; members: Member[]; moved: boolean }
  | { kind: 'resize'; ref: ShapeRef; handle: Handle; rect: Rect; rot: Rotation; moved: boolean }
  | { kind: 'box'; start: Point; current: Point; client: Point; room: ShapeRef | null }

export interface BlueprintCanvasProps {
  doc: EditorDoc
  mode: 'view' | 'edit'
  tool: Tool
  selection: ShapeRef[]
  zones: Map<string, ZoneStyle>
  highlightShelfKey?: string | null
  /** Bump to frame everything again. */
  fitToken: number
  /** Kept at the plan point in the middle of the view, for Paste. */
  viewCentre?: { current: Point | null }
  onSelect: (refs: ShapeRef[], exact?: boolean) => void
  onToggle: (ref: ShapeRef) => void
  onCheckpoint: () => void
  onPatchMany: (patches: RefPatch[]) => void
  onAdd: (shape: DrawTool, rect: Rect) => void
  onContextTarget?: (target: MenuTarget) => void
}

const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
}

/** A press that moves less than this many screen pixels is a click. */
const CLICK_PX = 4

const svgRect = (r: Rect) => ({ x: r.x, y: r.y, width: r.w, height: r.d })
const corners = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), d: Math.abs(a.y - b.y),
})
const member = (s: ShapeInfo): Member => ({ ref: s.ref, rect: s.rect, rot: s.rot })

function handlePoint(r: Rect, h: Handle): Point {
  return {
    x: h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2,
    y: h.includes('n') ? r.y : h.includes('s') ? r.y + r.d : r.y + r.d / 2,
  }
}

export function BlueprintCanvas({
  doc, mode, tool, selection, zones, highlightShelfKey, fitToken, viewCentre,
  onSelect, onToggle, onCheckpoint, onPatchMany, onAdd, onContextTarget,
}: BlueprintCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const spaceDown = useRef(false)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: 1000, h: 700 })
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const [draft, setDraft] = useState<Rect | null>(null)
  const [box, setBox] = useState<Rect | null>(null)
  const [activeRef, setActiveRef] = useState<ShapeRef | null>(null)

  const shapes = useMemo(() => listShapes(doc), [doc])
  const overlaps = useMemo(
    () => overlappingKeys(shapes.filter((s) => s.blocks).map((s) => ({ key: shapeKey(s.ref), rect: s.fp }))),
    [shapes],
  )
  const outline = useMemo(() => outlineSegments(doc.plan.rooms), [doc.plan.rooms])
  const cmPerPx = Math.max(view.w / size.w, view.h / size.h)
  const px = (n: number) => n * cmPerPx

  const toPlan = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM?.()
    if (!svg || !ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  // Frame everything on open and whenever asked.
  useEffect(() => {
    const b = planBounds([...doc.plan.rooms, ...shapes.map((s) => s.fp)])
    setView({ x: b.x, y: b.y, w: b.w, h: b.d })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken])

  useEffect(() => {
    if (viewCentre) viewCentre.current = { x: view.x + view.w / 2, y: view.y + view.h / 2 }
  }, [view, viewCentre])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  // Wheel / pinch zoom about the pointer; non-passive so the page does not zoom.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = toPlan(e.clientX, e.clientY)
      const k = Math.exp(e.deltaY * 0.0015)
      setView((v) => {
        const w = Math.min(Math.max(v.w * k, 100), 20000)
        const s = w / v.w
        return { x: p.x - (p.x - v.x) * s, y: p.y - (p.y - v.y) * s, w, h: v.h * s }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !isTypingTarget(e.target)) spaceDown.current = true }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const begin = (e: ReactPointerEvent, g: Gesture) => {
    gesture.current = g
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }
  const pan = (e: ReactPointerEvent) => begin(e, { kind: 'pan', client: { x: e.clientX, y: e.clientY }, view })
  const startBox = (e: ReactPointerEvent, room: ShapeRef | null) => {
    const p = toPlan(e.clientX, e.clientY)
    begin(e, { kind: 'box', start: p, current: p, client: { x: e.clientX, y: e.clientY }, room })
  }

  const onBackgroundDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    const selecting = mode === 'edit' && tool === 'select' && !spaceDown.current && e.button === 0
    if (selecting && e.shiftKey) { startBox(e, null); return }
    const drawing = mode === 'edit' && tool !== 'select' && !spaceDown.current && e.button === 0
    if (!drawing) {
      if (!spaceDown.current && e.button === 0) onSelect([])
      pan(e)
      return
    }
    const p = toPlan(e.clientX, e.clientY)
    begin(e, { kind: 'draw', start: p, current: p, free: e.altKey })
    setDraft(rectFromDrag(p.x, p.y, p.x, p.y, e.altKey))
  }

  const onShapeDown = (ref: ShapeRef) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || spaceDown.current) return
    if (mode === 'edit' && tool !== 'select') return // drawing over a shape still draws
    e.stopPropagation()
    if (mode === 'view') { onSelect([ref], true); return }
    if (e.shiftKey) {
      // A box may start inside a room; a Shift+click on the room toggles it on release.
      if (ref.kind === 'room') startBox(e, ref)
      else onToggle(ref)
      return
    }
    const already = isSelected(selection, ref)
    if (!already) onSelect([ref])
    const moving = already ? selection : expandSelection(doc, [ref])
    const members = shapes.filter((s) => isSelected(moving, s.ref))
    const anchor = members.find((s) => sameRef(s.ref, ref))
    if (!anchor || members.some((s) => s.locked)) { pan(e); return }
    begin(e, { kind: 'move', anchor: member(anchor), start: toPlan(e.clientX, e.clientY), members: members.map(member), moved: false })
  }

  const onShapeDouble = (ref: ShapeRef) => () => {
    if (mode === 'edit' && tool === 'select') onSelect([ref], true)
  }

  const onHandleDown = (ref: ShapeRef, rect: Rect, rot: Rotation, handle: Handle) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    begin(e, { kind: 'resize', ref, handle, rect, rot, moved: false })
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') {
      setView({ ...g.view, x: g.view.x - (e.clientX - g.client.x) * cmPerPx, y: g.view.y - (e.clientY - g.client.y) * cmPerPx })
      return
    }
    const p = toPlan(e.clientX, e.clientY)
    if (g.kind === 'draw') {
      g.current = p
      g.free = e.altKey
      setDraft(rectFromDrag(g.start.x, g.start.y, p.x, p.y, e.altKey))
      return
    }
    if (g.kind === 'box') {
      g.current = p
      setBox(corners(g.start, p))
      return
    }
    if (!g.moved) {
      onCheckpoint()
      g.moved = true
      setActiveRef(g.kind === 'move' ? g.anchor.ref : g.ref)
    }
    if (g.kind === 'move') {
      // The shape under the pointer snaps; the rest keep their offsets, and the set stays on the plan.
      const { anchor, members } = g
      const placed = moveShape(anchor.rect, anchor.rot, p.x - g.start.x, p.y - g.start.y, e.altKey)
      const from = footprint({ ...anchor.rect, rot: anchor.rot })
      const to = footprint({ ...placed, rot: anchor.rot })
      const set = unionRect(members.map((m) => footprint({ ...m.rect, rot: m.rot })))
      const fix = onPlanOffset({ ...set, x: set.x + to.x - from.x, y: set.y + to.y - from.y })
      const o = { dx: to.x - from.x + fix.dx, dy: to.y - from.y + fix.dy }
      onPatchMany(members.map((m) => {
        const r = moveFootprintBy(m.rect, m.rot, o)
        return { ref: m.ref, patch: { x: r.x, y: r.y } }
      }))
      return
    }
    const next = fromFootprint(resizeRect(footprint({ ...g.rect, rot: g.rot }), g.handle, p.x, p.y, e.altKey), g.rot)
    onPatchMany([{ ref: g.ref, patch: next }])
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    gesture.current = null
    setActiveRef(null)
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    if (g?.kind === 'box') {
      setBox(null)
      const click = Math.abs(e.clientX - g.client.x) < CLICK_PX && Math.abs(e.clientY - g.client.y) < CLICK_PX
      if (click) {
        if (g.room) onToggle(g.room)
        return
      }
      onSelect([...selection, ...boxSelection(doc, corners(g.start, g.current))])
      return
    }
    if (g?.kind === 'draw' && tool !== 'select') {
      const small = Math.abs(g.current.x - g.start.x) < 10 && Math.abs(g.current.y - g.start.y) < 10
      onAdd(tool, small ? defaultRect(tool, g.start, g.free) : rectFromDrag(g.start.x, g.start.y, g.current.x, g.current.y, g.free))
      setDraft(null)
    }
  }

  // Right-click: name the shape under the pointer (by its data-shape) or the floor, selecting the shape first.
  const onContextMenu = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!onContextTarget) return
    const at = toPlan(e.clientX, e.clientY)
    const el = e.target instanceof Element ? e.target.closest('[data-shape]') : null
    const ref = el ? refFromKey(el.getAttribute('data-shape') ?? '') : null
    if (!ref) { onContextTarget({ kind: 'floor', at }); return }
    if (!isSelected(selection, ref)) onSelect([ref], mode === 'view')
    onContextTarget({ kind: 'shape', ref, at })
  }

  const selectedShapes = shapes.filter((s) => isSelected(selection, s.ref))
  const single = selectedShapes.length === 1 ? selectedShapes[0] : null
  const selectionBox = selectedShapes.length > 1 ? unionRect(selectedShapes.map((s) => s.fp)) : null
  const groupLabels = doc.plan.groups.flatMap((g) => {
    const fps = shapes.filter((s) => s.group === g.id).map((s) => s.fp)
    return g.name && fps.length > 0 ? [{ id: g.id, name: g.name, box: unionRect(fps) }] : []
  })
  const activeShape = shapes.find((s) => sameRef(s.ref, activeRef))
  const sizeLabelRect = draft ?? activeShape?.fp ?? null

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/40">
      <svg
        ref={svgRef}
        role="application"
        aria-label="Lab floor plan"
        className={cn('h-full w-full touch-none select-none', mode === 'edit' && tool !== 'select' ? 'cursor-crosshair' : 'cursor-grab')}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="bp-grid-minor" width={10} height={10} patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" className="stroke-border" strokeWidth={px(0.5)} />
          </pattern>
          <pattern id="bp-grid-major" width={100} height={100} patternUnits="userSpaceOnUse">
            {10 / cmPerPx >= 6 && <rect width={100} height={100} fill="url(#bp-grid-minor)" />}
            <path d="M 100 0 L 0 0 0 100" fill="none" className="stroke-border" strokeWidth={px(1)} />
          </pattern>
        </defs>
        <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#bp-grid-major)" />

        {doc.plan.rooms.map((r) => (
          <rect key={r.id} {...svgRect(r)} className="fill-background" data-shape={`room:${r.id}`}
            onPointerDown={onShapeDown({ kind: 'room', key: r.id })} />
        ))}
        {doc.plan.rooms.filter((r) => r.name).map((r) => (
          <text key={`name-${r.id}`} x={r.x + r.w / 2} y={r.y + r.d / 2} textAnchor="middle" dominantBaseline="central"
            fontSize={px(12)} className="select-none fill-muted-foreground" pointerEvents="none">
            {r.name}
          </text>
        ))}
        {outline.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-foreground" strokeWidth={3}
            strokeLinecap="square" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {doc.plan.items.map((it) => {
          const ref: ShapeRef = { kind: 'item', key: it.id }
          return <ItemShape key={it.id} item={it} cmPerPx={cmPerPx} onPointerDown={onShapeDown(ref)} onDoubleClick={onShapeDouble(ref)} />
        })}
        {doc.shelves.map((s) => {
          const ref: ShapeRef = { kind: 'shelf', key: s.key }
          return (
            <ShelfShape key={s.key} shelf={s} cmPerPx={cmPerPx} zones={zones} highlighted={s.key === highlightShelfKey}
              onPointerDown={onShapeDown(ref)} onDoubleClick={onShapeDouble(ref)} />
          )
        })}

        {shapes.filter((s) => overlaps.has(shapeKey(s.ref))).map((s) => (
          <rect key={`overlap-${shapeKey(s.ref)}`} {...svgRect(s.fp)} fill="none" stroke="#ef4444" strokeWidth={2}
            vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}

        {groupLabels.map((g) => (
          <text key={`group-${g.id}`} x={g.box.x} y={g.box.y - px(6)} fontSize={px(11)}
            className="select-none fill-muted-foreground" pointerEvents="none">
            {g.name}
          </text>
        ))}
        {mode === 'edit' && shapes.filter((s) => s.locked).map((s) => (
          <LockGlyph key={`lock-${shapeKey(s.ref)}`} testId={`lock-${shapeKey(s.ref)}`}
            x={s.fp.x + s.fp.w - px(15)} y={s.fp.y + px(3)} size={px(12)} />
        ))}

        {selectedShapes.map((s) => (
          <rect key={`sel-${shapeKey(s.ref)}`} {...svgRect(s.fp)} fill="none" className="stroke-foreground" strokeDasharray="4 3"
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {selectionBox && (
          <rect {...svgRect(selectionBox)} fill="none" className="stroke-foreground" strokeDasharray="2 4"
            strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
        {single && mode === 'edit' && !single.locked && HANDLES.map((h) => {
          const p = handlePoint(single.fp, h)
          const s = px(9)
          return (
            <rect key={h} data-testid={`handle-${h}`} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s}
              className="fill-background stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
              style={{ cursor: HANDLE_CURSOR[h] }}
              onPointerDown={onHandleDown(single.ref, single.rect, single.rot, h)} />
          )
        })}

        {box && (
          <rect data-testid="selection-box" {...svgRect(box)} className="fill-foreground stroke-foreground" fillOpacity={0.05}
            strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
        {draft && (
          <rect {...svgRect(draft)} className="fill-foreground stroke-foreground" fillOpacity={0.08} strokeDasharray="4 3"
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
        {sizeLabelRect && (
          <text x={sizeLabelRect.x + sizeLabelRect.w / 2} y={sizeLabelRect.y - px(8)} textAnchor="middle"
            fontSize={px(12)} className="fill-foreground" pointerEvents="none">
            {sizeLabelRect.w} × {sizeLabelRect.d} cm
          </text>
        )}
      </svg>
      <ScaleBar cmPerPx={cmPerPx} rooms={doc.plan.rooms} />
    </div>
  )
}

function ScaleBar({ cmPerPx, rooms }: { cmPerPx: number; rooms: Rect[] }) {
  const cm = [50, 100, 200, 500, 1000, 2000, 5000].find((s) => s / cmPerPx >= 60) ?? 5000
  const room = rooms.length > 0 ? planBounds(rooms, 0) : null
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 space-y-1 text-[11px] text-muted-foreground">
      <div className="h-1.5 border-x border-b border-foreground" style={{ width: cm / cmPerPx }} />
      <div>
        {cm >= 100 ? `${cm / 100} m` : `${cm} cm`}
        {room ? ` · Room ${(room.w / 100).toFixed(2)} × ${(room.d / 100).toFixed(2)} m` : ''}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Workspace canvas props**

In `src/components/storage/blueprint/storage-workspace.tsx`:

- Change the React import to `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'` and the canvas import to `import { BlueprintCanvas, type Point } from './blueprint-canvas'`.
- After `const { state, actions } = useBlueprintEditor()` add `const viewCentre = useRef<Point | null>(null)`.
- Replace the `<BlueprintCanvas … />` element with:

```tsx
          <BlueprintCanvas
            doc={state.doc} mode={mode} tool={state.tool} selection={state.selection} zones={zones}
            highlightShelfKey={highlight?.shelfKey ?? null} fitToken={fitToken} viewCentre={viewCentre}
            onSelect={select} onToggle={actions.toggle} onCheckpoint={actions.checkpoint}
            onPatchMany={(patches) => actions.patchMany(patches, false)} onAdd={actions.add}
          />
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run src/components/storage`
Expected: PASS (canvas, overlay, workspace, reducer).
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/storage/blueprint
git commit -m "feat(storage): select, box-select and drag several shapes; lock glyphs; room and group names on the plan"
```

---

### Task 7: Keyboard shortcuts

**Files:**
- Create: `src/components/storage/blueprint/use-editor-keyboard.ts`
- Modify: `src/components/storage/blueprint/use-blueprint-editor.ts` (remove the old `useEditorKeyboard` and the now-unused `useEffect` import)
- Modify: `src/components/storage/blueprint/storage-workspace.tsx`
- Test: `src/components/storage/blueprint/use-editor-keyboard.test.tsx` (new)

**Interfaces:**
- Consumes: `EditorState`, `copySelection`, `shapeLocked`; `EditorActions`, `isTypingTarget`; `readClipboard`, `writeClipboard`; `Point` from `blueprint-canvas.tsx`.
- Produces: `useEditorKeyboard(enabled: boolean, state: EditorState, actions: EditorActions, viewCentre: () => Point): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/storage/blueprint/use-editor-keyboard.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEditorKeyboard } from './use-editor-keyboard'
import { initialEditorState, type EditorDoc, type EditorState, type ShapeRef } from './editor-state'
import type { EditorActions } from './use-blueprint-editor'
import { readClipboard } from './clipboard'

const shelf = (locked: boolean) => ({
  key: 's-a', id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
  x_cm: 0, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0 as const, access_side: 'front' as const,
  locked, group_id: null, company_id: null, cubbies: [],
})
const docWith = (locked: boolean): EditorDoc => ({ plan: { version: 1, rooms: [], items: [], groups: [] }, shelves: [shelf(locked)] })
const SA: ShapeRef = { kind: 'shelf', key: 's-a' }

function Harness({ state, actions }: { state: EditorState; actions: EditorActions }) {
  useEditorKeyboard(true, state, actions, () => ({ x: 400, y: 300 }))
  return (
    <>
      <input aria-label="Letter" />
      <div role="menu" tabIndex={-1} data-testid="menu" />
    </>
  )
}

function setup(selection: ShapeRef[] = [SA], locked = false) {
  const actions = {
    select: vi.fn(), selectAll: vi.fn(), rotate: vi.fn(), lock: vi.fn(), remove: vi.fn(), nudge: vi.fn(),
    duplicate: vi.fn(), group: vi.fn(), ungroup: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  }
  const state = { ...initialEditorState(docWith(locked)), selection }
  render(<Harness state={state} actions={actions as unknown as EditorActions} />)
  return actions
}
const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document, { key: k, ...init })

afterEach(() => localStorage.clear())

describe('useEditorKeyboard', () => {
  it('turns, locks, deletes and nudges the selection', () => {
    const a = setup()
    key('r')
    expect(a.rotate).toHaveBeenLastCalledWith(1)
    key('R', { shiftKey: true })
    expect(a.rotate).toHaveBeenLastCalledWith(-1)
    key('l')
    expect(a.lock).toHaveBeenLastCalledWith(true)
    key('Delete')
    expect(a.remove).toHaveBeenCalledTimes(1)
    key('ArrowLeft')
    expect(a.nudge).toHaveBeenLastCalledWith(-10, 0)
    key('ArrowDown', { shiftKey: true })
    expect(a.nudge).toHaveBeenLastCalledWith(0, 1)
  })

  it('unlocks when everything selected is locked', () => {
    const a = setup([SA], true)
    key('L')
    expect(a.lock).toHaveBeenLastCalledWith(false)
  })

  it('duplicates, groups, ungroups and selects all with the modifier', () => {
    const a = setup()
    key('d', { metaKey: true })
    expect(a.duplicate).toHaveBeenCalledTimes(1)
    key('g', { ctrlKey: true })
    expect(a.group).toHaveBeenCalledTimes(1)
    key('g', { metaKey: true, shiftKey: true })
    expect(a.ungroup).toHaveBeenCalledTimes(1)
    key('a', { metaKey: true })
    expect(a.selectAll).toHaveBeenCalledTimes(1)
    expect(a.rotate).not.toHaveBeenCalled()
  })

  it('copies the selection and pastes it at the middle of the view', () => {
    const a = setup()
    key('c', { metaKey: true })
    const clip = readClipboard()
    expect(clip?.shelves).toHaveLength(1)
    key('v', { metaKey: true })
    expect(a.paste).toHaveBeenCalledWith(clip, { x: 400, y: 300 })
  })

  it('leaves keys typed in a field, or handled by an open menu, alone', () => {
    const a = setup()
    fireEvent.keyDown(screen.getByLabelText('Letter'), { key: 'r' })
    fireEvent.keyDown(screen.getByTestId('menu'), { key: 'ArrowDown' })
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    document.dispatchEvent(handled)
    expect(a.rotate).not.toHaveBeenCalled()
    expect(a.nudge).not.toHaveBeenCalled()
    expect(a.select).not.toHaveBeenCalled()
    key('Escape')
    expect(a.select).toHaveBeenCalledWith([])
  })

  it('still undoes with nothing selected, and does nothing else', () => {
    const a = setup([])
    key('r')
    key('z', { metaKey: true })
    expect(a.rotate).not.toHaveBeenCalled()
    expect(a.undo).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/use-editor-keyboard.test.tsx`
Expected: FAIL with "Failed to resolve import './use-editor-keyboard'".

- [ ] **Step 3: Write the hook**

Create `src/components/storage/blueprint/use-editor-keyboard.ts`:

```ts
'use client'

import { useEffect, useRef } from 'react'
import { copySelection, shapeLocked, type EditorState } from './editor-state'
import { readClipboard, writeClipboard } from './clipboard'
import { isTypingTarget, type EditorActions } from './use-blueprint-editor'
import type { Point } from './blueprint-canvas'

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

/**
 * Every editing shortcut, listening on `document` (which a key reaches before
 * `window`, so an Escape that only clears the selection is handled before the
 * overlay's close listener). Keys in a field, inside an open menu, or already
 * handled (a closing menu's Escape) are left alone. The menu shows the same keys.
 */
export function useEditorKeyboard(enabled: boolean, state: EditorState, actions: EditorActions, viewCentre: () => Point) {
  const latest = useRef({ state, viewCentre })
  latest.current = { state, viewCentre }

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return
      if (e.target instanceof Element && e.target.closest('[role="menu"]')) return
      const { state: s, viewCentre: centre } = latest.current
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const has = s.selection.length > 0
      const run = (fn: () => void) => { e.preventDefault(); fn() }

      if (mod) {
        if (k === 'z') return run(() => (e.shiftKey ? actions.redo() : actions.undo()))
        if (k === 'a') return run(actions.selectAll)
        if (k === 'v') {
          const clip = readClipboard()
          if (clip) run(() => actions.paste(clip, centre()))
          return
        }
        if (!has) return
        if (k === 'c') {
          const clip = copySelection(s.doc, s.selection)
          if (clip) run(() => writeClipboard(clip))
          return
        }
        if (k === 'd') return run(actions.duplicate)
        if (k === 'g') return run(() => (e.shiftKey ? actions.ungroup() : actions.group()))
        return
      }

      if (e.key === 'Escape' && has) return run(() => actions.select([]))
      if (!has) return
      if (e.key === 'Delete' || e.key === 'Backspace') return run(actions.remove)
      if (k === 'r') return run(() => actions.rotate(e.shiftKey ? -1 : 1))
      if (k === 'l') return run(() => actions.lock(!s.selection.every((r) => shapeLocked(s.doc, r))))
      const n = NUDGE[e.key]
      if (n) {
        const step = e.shiftKey ? 1 : 10
        run(() => actions.nudge(n[0] * step, n[1] * step))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, actions])
}
```

- [ ] **Step 4: Remove the old hook and wire the new one**

In `src/components/storage/blueprint/use-blueprint-editor.ts`: delete the whole `useEditorKeyboard` function and its doc comment, and change the React import to `import { useMemo, useReducer } from 'react'`.

In `src/components/storage/blueprint/storage-workspace.tsx`:

- Change `import { useBlueprintEditor, useEditorKeyboard } from './use-blueprint-editor'` to `import { useBlueprintEditor } from './use-blueprint-editor'` and add `import { useEditorKeyboard } from './use-editor-keyboard'`.
- Above the component add:

```ts
/** Where Paste puts shapes before the view has reported its centre. */
const DEFAULT_CENTRE: Point = { x: 500, y: 350 }
```

- Replace `useEditorKeyboard(mode === 'edit', state.selection, actions)` with:

```ts
  useEditorKeyboard(mode === 'edit', state, actions, () => viewCentre.current ?? DEFAULT_CENTRE)
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run src/components/storage`
Expected: PASS (the overlay's "first Escape only deselects" still holds).
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/storage/blueprint
git commit -m "feat(storage): editor shortcuts for turn, lock, nudge, duplicate, copy, paste and groups"
```

---

### Task 8: Side panel: room name, lock, group and several-shape panels

**Files:**
- Create: `src/components/storage/blueprint/inspector-fields.tsx` (moved from `inspector.tsx`)
- Create: `src/components/storage/blueprint/selection-panel.tsx`
- Modify (rewrite): `src/components/storage/blueprint/inspector.tsx`
- Modify: `src/components/storage/blueprint/storage-workspace.tsx` (Inspector props, `asideRef`)
- Test: `src/components/storage/blueprint/inspector.test.tsx`

**Interfaces:**
- Consumes: `selectionGroup`, `shapeLocked`, `findShape` (with `room`); actions from Part A.
- Produces:
  - `type FocusTarget = 'first' | 'name'`; `NumberField({ label, value, min, max, onCommit, focus?, disabled? })`, `TextField({ label, value, onCommit, transform?, valid?, focus? })` render `data-focus={focus}` on their input.
  - `LockButton({ allLocked, onLock })`, `GroupPanel({ group, count, allLocked, anyLocked, onRename, onLock, onUngroup, onDelete })`, `MultiPanel({ count, hasRoom, allLocked, anyLocked, onGroup, onAlign, onDistribute, onLock, onDelete })`.
  - `interface InspectorProps { doc; selection; zones; onPatch(ref, patch); onRotate(); onDelete(); onLock(locked); onGroup(); onUngroup(); onRenameGroup(id, name); onAlign(edge); onDistribute(axis) }`.

- [ ] **Step 1: Write the failing tests**

Replace `src/components/storage/blueprint/inspector.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import { Inspector, type InspectorProps } from './inspector'
import type { EditorDoc, EditorShelf } from './editor-state'

const shelf = (key: string, letter: string, depth: number, over: Partial<EditorShelf> = {}): EditorShelf => ({
  key, id: key, shelf_letter: letter, rows: 6, columns: 4, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 120, depth_cm: depth, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null, cubbies: [], ...over,
})

function handlers() {
  return {
    onPatch: vi.fn(), onRotate: vi.fn(), onDelete: vi.fn(), onLock: vi.fn(), onGroup: vi.fn(), onUngroup: vi.fn(),
    onRenameGroup: vi.fn(), onAlign: vi.fn(), onDistribute: vi.fn(),
  }
}

function editDepthThenSelectB(depthB: number) {
  const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf('a', 'A', 40), shelf('b', 'B', depthB)] }
  const h = handlers()
  const props: Omit<InspectorProps, 'selection'> = { doc, zones: new Map(), ...h }
  const { rerender } = render(<Inspector {...props} selection={[{ kind: 'shelf', key: 'a' }]} />)
  const depth = screen.getByLabelText('Depth (cm)')
  fireEvent.focus(depth)
  fireEvent.change(depth, { target: { value: '60' } })
  // Clicking shelf B on the plan selects it on pointerdown, before the field blurs.
  rerender(<Inspector {...props} selection={[{ kind: 'shelf', key: 'b' }]} />)
  fireEvent.blur(depth)
  return { onPatch: h.onPatch, depth }
}

const room = { id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }
const pair: EditorDoc = {
  plan: {
    version: 1,
    rooms: [room],
    items: [
      { id: 'i1', kind: 'bench', label: null, x: 100, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
      { id: 'i2', kind: 'bench', label: null, x: 300, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
    ],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [shelf('a', 'A', 40, { locked: true })],
}

describe('Inspector', () => {
  it('commits a typed value to the shape it was typed for when another shape of the same size is clicked', () => {
    const { onPatch, depth } = editDepthThenSelectB(40)
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith({ kind: 'shelf', key: 'a' }, { d: 60 })
    expect(depth).toHaveValue('40')
  })

  it('keeps the typed value when the next shape differs, and then shows that shape', () => {
    const { onPatch, depth } = editDepthThenSelectB(50)
    expect(onPatch).toHaveBeenCalledWith({ kind: 'shelf', key: 'a' }, { d: 60 })
    expect(depth).toHaveValue('50')
  })

  it('names a room', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'room', key: 'r1' }]} />)
    const name = screen.getByLabelText('Name')
    fireEvent.focus(name)
    fireEvent.change(name, { target: { value: 'Sample room' } })
    fireEvent.blur(name)
    expect(h.onPatch).toHaveBeenCalledWith({ kind: 'room', key: 'r1' }, { name: 'Sample room' })
  })

  it('keeps a locked shape in place but its details editable', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'shelf', key: 'a' }]} />)
    expect(screen.getByLabelText('X (cm)')).toBeDisabled()
    expect(screen.getByLabelText('Letter')).toBeEnabled()
    expect(screen.getByRole('button', { name: /Delete/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
    expect(h.onLock).toHaveBeenCalledWith(false)
  })

  it('shows a group with its name, Ungroup and Lock', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'item', key: 'i1' }, { kind: 'item', key: 'i2' }]} />)
    const name = screen.getByLabelText('Group name')
    fireEvent.focus(name)
    fireEvent.change(name, { target: { value: 'Pair' } })
    fireEvent.blur(name)
    expect(h.onRenameGroup).toHaveBeenCalledWith('g1', 'Pair')
    fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }))
    expect(h.onUngroup).toHaveBeenCalled()
  })

  it('offers Group only without a room, and Distribute only for three or more', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'room', key: 'r1' }, { kind: 'item', key: 'i1' }]} />)
    expect(screen.getByRole('button', { name: 'Group' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Distribute horizontally' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }))
    expect(h.onAlign).toHaveBeenCalledWith('left')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/inspector.test.tsx`
Expected: FAIL (no Name field, no lock button, no group panel).

- [ ] **Step 3: Move the fields**

Create `src/components/storage/blueprint/inspector-fields.tsx` with `useDraft`, `NumberField` and `TextField` moved out of `inspector.tsx` (unchanged apart from the new `focus` and `disabled` options):

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

/** Which field "Edit details" and "Rename" put the cursor in. */
export type FocusTarget = 'first' | 'name'

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
export function NumberField({ label, value, min, max, onCommit, focus, disabled }: {
  label: string; value: number; min: number; max: number; onCommit: (n: number) => void
  focus?: FocusTarget; disabled?: boolean
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
        value={draft.text} inputMode="numeric" aria-label={label} className="h-8" data-focus={focus} disabled={disabled}
        onFocus={() => draft.begin(onCommit)}
        onChange={(e) => draft.setText(e.target.value)} onBlur={end}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

export function TextField({ label, value, onCommit, transform, valid, focus }: {
  label: string
  value: string
  onCommit: (v: string) => void
  transform?: (v: string) => string
  /** A value that fails this snaps back instead of committing. */
  valid?: (v: string) => boolean
  focus?: FocusTarget
}) {
  const draft = useDraft(value, (v) => v)
  const end = () => draft.end(transform ? transform(draft.text) : draft.text, (next) => !valid || valid(next), onCommit)
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={draft.text} aria-label={label} className="h-8" data-focus={focus}
        onFocus={() => draft.begin(onCommit)}
        onChange={(e) => draft.setText(e.target.value)} onBlur={end}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}
```

- [ ] **Step 4: Create the selection panels**

Create `src/components/storage/blueprint/selection-panel.tsx`:

```tsx
'use client'

import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, Lock, LockOpen, Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AlignEdge, Axis } from '@/lib/storage/arrange'
import type { FloorGroup } from '@/lib/storage/floor-plan'
import { TextField } from './inspector-fields'

const ALIGN: Array<{ edge: AlignEdge; label: string; icon: LucideIcon }> = [
  { edge: 'left', label: 'Align left', icon: AlignStartVertical },
  { edge: 'centre', label: 'Align centre', icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right', icon: AlignEndVertical },
  { edge: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Align middle', icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
]

/** Lock when anything selected is unlocked; Unlock when all of it is locked. */
export function LockButton({ allLocked, onLock }: { allLocked: boolean; onLock: (locked: boolean) => void }) {
  return (
    <Button variant="outline" size="sm" aria-pressed={allLocked} onClick={() => onLock(!allLocked)}>
      {allLocked
        ? <><LockOpen className="mr-1.5 h-4 w-4" />Unlock</>
        : <><Lock className="mr-1.5 h-4 w-4" />Lock</>}
    </Button>
  )
}

function DeleteButton({ disabled, onDelete }: { disabled: boolean; onDelete: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="text-red-600" disabled={disabled} onClick={onDelete}>
      <Trash2 className="mr-1.5 h-4 w-4" />Delete
    </Button>
  )
}

export function GroupPanel({ group, count, allLocked, anyLocked, onRename, onLock, onUngroup, onDelete }: {
  group: FloorGroup
  count: number
  allLocked: boolean
  anyLocked: boolean
  onRename: (name: string | null) => void
  onLock: (locked: boolean) => void
  onUngroup: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{group.name || 'Group'}</h3>
      <TextField label="Group name" focus="name" value={group.name ?? ''} onCommit={(name) => onRename(name.trim() || null)} />
      <p className="text-xs text-muted-foreground">{count} shapes move together. Double-click one to edit it alone.</p>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <LockButton allLocked={allLocked} onLock={onLock} />
        <Button variant="outline" size="sm" onClick={onUngroup}>Ungroup</Button>
        <DeleteButton disabled={anyLocked} onDelete={onDelete} />
      </div>
    </div>
  )
}

export function MultiPanel({ count, hasRoom, allLocked, anyLocked, onGroup, onAlign, onDistribute, onLock, onDelete }: {
  count: number
  hasRoom: boolean
  allLocked: boolean
  anyLocked: boolean
  onGroup: () => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: Axis) => void
  onLock: (locked: boolean) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{count} shapes selected</h3>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Align and space</p>
        <div className="flex flex-wrap gap-1">
          {ALIGN.map(({ edge, label, icon: Icon }) => (
            <Button key={edge} variant="outline" size="icon" className="h-8 w-8" aria-label={label} title={label}
              onClick={() => onAlign(edge)}>
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Distribute horizontally"
            title="Distribute horizontally" disabled={count < 3} onClick={() => onDistribute('h')}>
            <AlignHorizontalDistributeCenter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Distribute vertically"
            title="Distribute vertically" disabled={count < 3} onClick={() => onDistribute('v')}>
            <AlignVerticalDistributeCenter className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" disabled={hasRoom} title={hasRoom ? 'Rooms cannot be grouped' : undefined}
          onClick={onGroup}>
          Group
        </Button>
        <LockButton allLocked={allLocked} onLock={onLock} />
        <DeleteButton disabled={anyLocked} onDelete={onDelete} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite the inspector**

Replace `src/components/storage/blueprint/inspector.tsx` with:

```tsx
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
        {/* X and Y are where the shape is drawn, turned or not. */}
        <NumberField label="X (cm)" focus="first" disabled={locked} value={info.fp.x} min={0} max={MAX_PLAN_CM}
          onCommit={(x) => patch({ x: fromFootprint({ ...info.fp, x }, info.rot).x })} />
        <NumberField label="Y (cm)" disabled={locked} value={info.fp.y} min={0} max={MAX_PLAN_CM}
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
```

- [ ] **Step 6: Workspace: Inspector props and `asideRef`**

In `src/components/storage/blueprint/storage-workspace.tsx`:

- After `const viewCentre = useRef<Point | null>(null)` add `const asideRef = useRef<HTMLElement>(null)`.
- Add `ref={asideRef}` to the `<aside …>`.
- Replace the `<Inspector … />` element with:

```tsx
            <Inspector doc={state.doc} selection={state.selection} zones={zones}
              onPatch={(ref, patch) => actions.patch(ref, patch, true)} onRotate={() => actions.rotate(1)}
              onDelete={actions.remove} onLock={actions.lock} onGroup={actions.group} onUngroup={actions.ungroup}
              onRenameGroup={actions.renameGroup} onAlign={actions.align} onDistribute={actions.distribute} />
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run src/components/storage`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/storage/blueprint
git commit -m "feat(storage): side panel names rooms, locks shapes, and handles groups and several shapes"
```

---

### Task 9: Right-click menu

**Files:**
- Create: `src/components/storage/blueprint/canvas-context-menu.tsx`
- Modify (rewrite): `src/components/storage/blueprint/storage-workspace.tsx`
- Test: `src/components/storage/blueprint/canvas-context-menu.test.tsx` (new), `src/components/storage/blueprint/storage-workspace.test.tsx`

**Interfaces:**
- Consumes: `MenuTarget`, `Point` (canvas); `selectionGroup`, `shapeGroupId`, `shapeLocked`, `copySelection`, `defaultRect` (state); clipboard; `FocusTarget`.
- Produces:
  - `type MenuId = 'edit' | 'rename' | 'rotateRight' | 'rotateLeft' | 'duplicate' | 'copy' | 'paste' | 'lock' | 'unlock' | 'group' | 'ungroup' | 'align' | 'distribute' | 'delete' | 'accessBoth' | 'viewCubbies' | 'changeType' | 'addHere' | 'pasteHere' | 'selectAll' | 'fit'`
  - `interface MenuState { show: Set<MenuId>; disabled: Set<MenuId>; renameLabel: string; accessBoth: boolean; itemKind: FloorItemKind | null }`
  - `menuState(doc, selection, target: MenuTarget | null, mode: 'view' | 'edit', canPaste: boolean): MenuState`
  - `interface MenuHandlers { editDetails(); rename(); rotate(turn); duplicate(); copy(); paste(at: Point | null); lock(locked); group(); ungroup(); align(edge); distribute(axis); remove(); setAccessBoth(both); viewCubbies(); changeType(kind); addHere(tool, at); selectAll(); fit() }`
  - `CanvasContextMenu({ children, menu, target, on, onOpenChange? })`

- [ ] **Step 1: Write the failing menu-state tests**

Create `src/components/storage/blueprint/canvas-context-menu.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { menuState } from './canvas-context-menu'
import type { EditorDoc, EditorShelf, ShapeRef } from './editor-state'

const shelf = (key: string, letter: string, x: number, over: Partial<EditorShelf> = {}): EditorShelf => ({
  key, id: key, shelf_letter: letter, rows: 1, columns: 2, samples_per_position: 42,
  x_cm: x, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null, cubbies: [], ...over,
})
const doc: EditorDoc = {
  plan: {
    version: 1,
    rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }],
    items: [
      { id: 'i1', kind: 'bench', label: null, x: 100, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
      { id: 'i2', kind: 'table', label: null, x: 300, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
    ],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [shelf('s-a', 'A', 0, { access_side: 'both' }), shelf('s-b', 'B', 200, { locked: true })],
}
const R1: ShapeRef = { kind: 'room', key: 'r1' }
const I1: ShapeRef = { kind: 'item', key: 'i1' }
const I2: ShapeRef = { kind: 'item', key: 'i2' }
const SA: ShapeRef = { kind: 'shelf', key: 's-a' }
const SB: ShapeRef = { kind: 'shelf', key: 's-b' }
const at = { x: 10, y: 10 }
const on = (ref: ShapeRef) => ({ kind: 'shape' as const, ref, at })

describe('menuState', () => {
  it('offers Add here, Paste here, Select all and Fit on the floor', () => {
    const m = menuState(doc, [], { kind: 'floor', at }, 'edit', false)
    expect([...m.show]).toEqual(['addHere', 'pasteHere', 'selectAll', 'fit'])
    expect(m.disabled.has('pasteHere')).toBe(true)
  })

  it('offers a shelf its own entries and turns', () => {
    const m = menuState(doc, [SA], on(SA), 'edit', true)
    for (const id of ['edit', 'rename', 'rotateRight', 'duplicate', 'copy', 'paste', 'lock', 'accessBoth', 'viewCubbies', 'delete'] as const) {
      expect(m.show.has(id)).toBe(true)
    }
    expect(m.accessBoth).toBe(true)
    expect(m.disabled.size).toBe(0)
    expect(m.show.has('group')).toBe(false)
  })

  it('offers Unlock on a locked shelf and blocks turning and deleting it', () => {
    const m = menuState(doc, [SB], on(SB), 'edit', false)
    expect(m.show.has('unlock')).toBe(true)
    expect(m.show.has('lock')).toBe(false)
    expect([...m.disabled].sort()).toEqual(['delete', 'paste', 'rotateLeft', 'rotateRight'])
  })

  it('names a group, offers Ungroup and not Group', () => {
    const m = menuState(doc, [I1, I2], on(I1), 'edit', false)
    expect(m.renameLabel).toBe('Name group')
    expect(m.show.has('ungroup')).toBe(true)
    expect(m.show.has('group')).toBe(false)
    expect(m.show.has('align')).toBe(true)
    expect(m.disabled.has('distribute')).toBe(true)
  })

  it('cannot group or turn a set with a room, and has no Edit for several loose shapes', () => {
    const m = menuState(doc, [R1, SA], on(SA), 'edit', false)
    expect(m.disabled.has('group')).toBe(true)
    expect(m.disabled.has('rotateRight')).toBe(true)
    expect(m.show.has('edit')).toBe(false)
  })

  it('lets furniture change type and a room add here', () => {
    expect(menuState(doc, [I2], on(I2), 'edit', false)).toMatchObject({ itemKind: 'table' })
    expect(menuState(doc, [I2], on(I2), 'edit', false).show.has('changeType')).toBe(true)
    expect(menuState(doc, [R1], on(R1), 'edit', false).show.has('addHere')).toBe(true)
  })

  it('offers only View cubbies and Fit when viewing', () => {
    expect([...menuState(doc, [SA], on(SA), 'view', true).show]).toEqual(['viewCubbies', 'fit'])
    expect([...menuState(doc, [], { kind: 'floor', at }, 'view', true).show]).toEqual(['fit'])
  })
})
```

- [ ] **Step 2: Write the failing workspace tests**

In `src/components/storage/blueprint/storage-workspace.test.tsx`, change the React Testing Library import to `import { render, screen, fireEvent } from '@testing-library/react'`, add the `TestPointerEvent` stand-in block from `blueprint-canvas.test.tsx` below the imports, and append inside `describe('StorageWorkspace', …)`:

```tsx
  it('locks a shelf from its right-click menu', async () => {
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.contextMenu(screen.getByTestId('shelf-A'))
    expect(await screen.findByRole('menuitem', { name: /Rotate right/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Lock/ }))
    expect(await screen.findByTestId('lock-shelf:s-a')).toBeInTheDocument()
  })

  it('offers Add here and Fit on the floor', async () => {
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.contextMenu(screen.getByRole('application'))
    expect(await screen.findByRole('menuitem', { name: 'Fit plan to screen' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Add here/ })).toBeInTheDocument()
  })
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/canvas-context-menu.test.tsx src/components/storage/blueprint/storage-workspace.test.tsx`
Expected: FAIL ("Failed to resolve import './canvas-context-menu'"; no menu opens).

- [ ] **Step 4: Write the menu**

Create `src/components/storage/blueprint/canvas-context-menu.tsx`:

```tsx
'use client'

import { Fragment, type ReactNode } from 'react'
import {
  ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuRadioGroup,
  ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { AlignEdge, Axis, Turn } from '@/lib/storage/arrange'
import { FLOOR_ITEM_KINDS, FLOOR_ITEM_LABELS, type FloorItemKind } from '@/lib/storage/floor-plan'
import { selectionGroup, shapeGroupId, shapeLocked, type DrawTool, type EditorDoc, type ShapeRef } from './editor-state'
import type { MenuTarget, Point } from './blueprint-canvas'

export type MenuId =
  | 'edit' | 'rename' | 'rotateRight' | 'rotateLeft' | 'duplicate' | 'copy' | 'paste' | 'lock' | 'unlock'
  | 'group' | 'ungroup' | 'align' | 'distribute' | 'delete' | 'accessBoth' | 'viewCubbies' | 'changeType'
  | 'addHere' | 'pasteHere' | 'selectAll' | 'fit'

export interface MenuState {
  show: Set<MenuId>
  disabled: Set<MenuId>
  renameLabel: string
  accessBoth: boolean
  itemKind: FloorItemKind | null
}

export interface MenuHandlers {
  editDetails: () => void
  rename: () => void
  rotate: (turn: Turn) => void
  duplicate: () => void
  copy: () => void
  /** null: the middle of the view. */
  paste: (at: Point | null) => void
  lock: (locked: boolean) => void
  group: () => void
  ungroup: () => void
  align: (edge: AlignEdge) => void
  distribute: (axis: Axis) => void
  remove: () => void
  setAccessBoth: (both: boolean) => void
  viewCubbies: () => void
  changeType: (kind: FloorItemKind) => void
  addHere: (tool: DrawTool, at: Point) => void
  selectAll: () => void
  fit: () => void
}

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

const LABELS: Record<MenuId, [label: string, shortcut?: string]> = {
  edit: ['Edit details'],
  rename: ['Rename'],
  rotateRight: ['Rotate right', 'R'],
  rotateLeft: ['Rotate left', '⇧R'],
  duplicate: ['Duplicate', `${MOD}D`],
  copy: ['Copy', `${MOD}C`],
  paste: ['Paste', `${MOD}V`],
  lock: ['Lock', 'L'],
  unlock: ['Unlock', 'L'],
  group: ['Group', `${MOD}G`],
  ungroup: ['Ungroup', `⇧${MOD}G`],
  align: ['Align'],
  distribute: ['Distribute'],
  delete: ['Delete', 'Del'],
  accessBoth: ['Access from both sides'],
  viewCubbies: ['View cubbies'],
  changeType: ['Change type'],
  addHere: ['Add here'],
  pasteHere: ['Paste here'],
  selectAll: ['Select all', `${MOD}A`],
  fit: ['Fit plan to screen'],
}

const ALIGN_ENTRIES: Array<[AlignEdge, string]> = [
  ['left', 'Left'], ['centre', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom'],
]
const ADD_ENTRIES: Array<[DrawTool, string]> = [
  ['shelf', 'Shelf'], ['door', 'Door'], ['window', 'Window'], ['bench', 'Bench'], ['table', 'Table'],
  ['cabinet', 'Cabinet'], ['equipment', 'Equipment'], ['other', 'Other'],
]

/** What the menu shows for a target and the selection the canvas made for it. */
export function menuState(
  doc: EditorDoc, selection: ShapeRef[], target: MenuTarget | null, mode: 'view' | 'edit', canPaste: boolean,
): MenuState {
  const show = new Set<MenuId>()
  const disabled = new Set<MenuId>()
  const st: MenuState = { show, disabled, renameLabel: 'Rename', accessBoth: false, itemKind: null }
  if (!target) return st

  if (mode === 'view') {
    if (target.kind === 'shape' && target.ref.kind === 'shelf') show.add('viewCubbies')
    show.add('fit')
    return st
  }
  if (target.kind === 'floor') {
    for (const id of ['addHere', 'pasteHere', 'selectAll', 'fit'] as const) show.add(id)
    if (!canPaste) disabled.add('pasteHere')
    return st
  }

  const group = selectionGroup(doc, selection)
  const single = selection.length === 1 ? selection[0] : null
  const anyLocked = selection.some((r) => shapeLocked(doc, r))
  const allLocked = selection.length > 0 && selection.every((r) => shapeLocked(doc, r))
  const hasRoom = selection.some((r) => r.kind === 'room')

  if (single || group) {
    show.add('edit')
    show.add('rename')
    if (group) st.renameLabel = 'Name group'
  }
  show.add('rotateRight')
  show.add('rotateLeft')
  if (anyLocked || hasRoom) { disabled.add('rotateRight'); disabled.add('rotateLeft') }
  show.add('duplicate')
  show.add('copy')
  show.add('paste')
  if (!canPaste) disabled.add('paste')
  show.add(allLocked ? 'unlock' : 'lock')
  if (selection.length >= 2 && !group) {
    show.add('group')
    if (hasRoom) disabled.add('group')
  }
  if (selection.some((r) => shapeGroupId(doc, r))) show.add('ungroup')
  if (selection.length >= 2) {
    show.add('align')
    show.add('distribute')
    if (selection.length < 3) disabled.add('distribute')
  }
  show.add('delete')
  if (anyLocked) disabled.add('delete')

  if (single?.kind === 'shelf') {
    show.add('accessBoth')
    show.add('viewCubbies')
    st.accessBoth = doc.shelves.find((s) => s.key === single.key)?.access_side === 'both'
  }
  if (single?.kind === 'item') {
    show.add('changeType')
    st.itemKind = doc.plan.items.find((i) => i.id === single.key)?.kind ?? null
  }
  if (single?.kind === 'room') {
    show.add('addHere')
    show.add('pasteHere')
    if (!canPaste) disabled.add('pasteHere')
  }
  return st
}

/** The canvas wrapped in a right-click menu; the canvas reports the target before the menu opens. */
export function CanvasContextMenu({ children, menu, target, on, onOpenChange }: {
  children: ReactNode
  menu: MenuState
  target: MenuTarget | null
  on: MenuHandlers
  onOpenChange?: (open: boolean) => void
}) {
  const at = target?.at ?? { x: 0, y: 0 }
  const item = (id: MenuId, run: () => void) => menu.show.has(id) && (
    <ContextMenuItem key={id} disabled={menu.disabled.has(id)} onSelect={run}>
      {id === 'rename' ? menu.renameLabel : LABELS[id][0]}
      {LABELS[id][1] && <ContextMenuShortcut>{LABELS[id][1]}</ContextMenuShortcut>}
    </ContextMenuItem>
  )
  const sub = (id: MenuId, children: ReactNode) => menu.show.has(id) && (
    <ContextMenuSub key={id}>
      <ContextMenuSubTrigger disabled={menu.disabled.has(id)}>{LABELS[id][0]}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-44">{children}</ContextMenuSubContent>
    </ContextMenuSub>
  )

  const sections: ReactNode[][] = [
    [item('edit', on.editDetails), item('rename', on.rename)],
    [item('rotateRight', () => on.rotate(1)), item('rotateLeft', () => on.rotate(-1))],
    [item('duplicate', on.duplicate), item('copy', on.copy), item('paste', () => on.paste(null))],
    [
      item('lock', () => on.lock(true)), item('unlock', () => on.lock(false)),
      item('group', on.group), item('ungroup', on.ungroup),
      sub('align', ALIGN_ENTRIES.map(([edge, label]) => (
        <ContextMenuItem key={edge} onSelect={() => on.align(edge)}>{label}</ContextMenuItem>
      ))),
      sub('distribute', [
        <ContextMenuItem key="h" onSelect={() => on.distribute('h')}>Horizontally</ContextMenuItem>,
        <ContextMenuItem key="v" onSelect={() => on.distribute('v')}>Vertically</ContextMenuItem>,
      ]),
    ],
    [
      menu.show.has('accessBoth') && (
        <ContextMenuCheckboxItem key="accessBoth" checked={menu.accessBoth} onCheckedChange={(c) => on.setAccessBoth(c === true)}>
          {LABELS.accessBoth[0]}
        </ContextMenuCheckboxItem>
      ),
      item('viewCubbies', on.viewCubbies),
      sub('changeType', (
        <ContextMenuRadioGroup value={menu.itemKind ?? ''} onValueChange={(v) => on.changeType(v as FloorItemKind)}>
          {FLOOR_ITEM_KINDS.map((k) => <ContextMenuRadioItem key={k} value={k}>{FLOOR_ITEM_LABELS[k]}</ContextMenuRadioItem>)}
        </ContextMenuRadioGroup>
      )),
    ],
    [
      sub('addHere', ADD_ENTRIES.map(([tool, label]) => (
        <ContextMenuItem key={tool} onSelect={() => on.addHere(tool, at)}>{label}</ContextMenuItem>
      ))),
      item('pasteHere', () => on.paste(at)),
      item('selectAll', on.selectAll),
      item('fit', on.fit),
    ],
    [item('delete', on.remove)],
  ]
  const visible = sections.map((s) => s.filter(Boolean)).filter((s) => s.length > 0)

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>
        <div className="h-full w-full">{children}</div>
      </ContextMenuTrigger>
      {/* Keep focus where a handler puts it (Edit details focuses the side panel). */}
      <ContextMenuContent className="w-60" onCloseAutoFocus={(e) => e.preventDefault()}>
        {visible.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && <ContextMenuSeparator />}
            {s}
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
```

- [ ] **Step 5: Rewrite the workspace with the menu wired in**

Replace `src/components/storage/blueprint/storage-workspace.tsx` with:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Maximize, Pencil, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import type { StorageLayout } from '@/lib/storage/layout'
import { copySelection, defaultRect, fromLayout, toSavePayload, type ShapeRef } from './editor-state'
import { useBlueprintEditor } from './use-blueprint-editor'
import { useEditorKeyboard } from './use-editor-keyboard'
import { BlueprintCanvas, type MenuTarget, type Point } from './blueprint-canvas'
import { CanvasContextMenu, menuState, type MenuHandlers } from './canvas-context-menu'
import { readClipboard, writeClipboard } from './clipboard'
import { Inspector } from './inspector'
import type { FocusTarget } from './inspector-fields'
import { ToolPalette } from './tool-palette'
import { ViewPanel } from './view-panel'
import { zoneStyles } from './zone-colors'

interface StorageWorkspaceProps {
  laboratoryId: string
  initialMode?: 'view' | 'edit'
  onDirtyChange?: (dirty: boolean) => void
  /** Never offer Edit here, e.g. an embed with no unsaved-changes guard. */
  readOnly?: boolean
}

/** Where Paste puts shapes before the view has reported its centre. */
const DEFAULT_CENTRE: Point = { x: 500, y: 350 }

export function StorageWorkspace({ laboratoryId, initialMode = 'view', onDirtyChange, readOnly = false }: StorageWorkspaceProps) {
  const [layout, setLayout] = useState<StorageLayout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<{ message: string; items: string[] } | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [highlight, setHighlight] = useState<{ shelfKey: string; cubbyId: string } | null>(null)
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null)
  const [canPaste, setCanPaste] = useState(false)
  const viewCentre = useRef<Point | null>(null)
  const asideRef = useRef<HTMLElement>(null)
  const { state, actions } = useBlueprintEditor()

  const load = useCallback(async () => {
    setLoadError(null)
    const res = await fetch(`/api/laboratories/${laboratoryId}/storage`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(body.error || 'Failed to load storage'); return }
    setLayout(body)
    actions.load(fromLayout(body))
    setFitToken((t) => t + 1)
    if (initialMode === 'edit' && body.can_edit && !readOnly) setMode('edit')
  }, [laboratoryId, initialMode, readOnly, actions])

  useEffect(() => { load() }, [load])
  useEffect(() => { onDirtyChange?.(state.dirty) }, [state.dirty, onDirtyChange])
  useEffect(() => { if (state.notice) toast({ title: state.notice.text }) }, [state.notice])
  useEditorKeyboard(mode === 'edit', state, actions, () => viewCentre.current ?? DEFAULT_CENTRE)

  const zones = useMemo(() => zoneStyles((layout?.companies ?? []).map((c) => c.id)), [layout])

  const select = (refs: ShapeRef[], exact = false) => {
    actions.select(refs, exact)
    const only = refs.length === 1 ? refs[0] : null
    if (!only || only.kind !== 'shelf' || only.key !== highlight?.shelfKey) setHighlight(null)
  }

  /** Put the cursor in a side-panel field once the menu has closed. */
  const focusPanel = (field: FocusTarget) => {
    window.setTimeout(() => {
      const aside = asideRef.current
      const el = aside?.querySelector<HTMLInputElement>(`[data-focus="${field}"]`)
        ?? aside?.querySelector<HTMLInputElement>('[data-focus]')
      el?.focus()
    }, 0)
  }

  const save = async () => {
    setSaving(true)
    setConflicts(null)
    try {
      const res = await fetch(`/api/laboratories/${laboratoryId}/storage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSavePayload(state.doc)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setConflicts({ message: body.error || 'Failed to save the floor plan', items: body.conflicts ?? [] })
        return
      }
      setLayout(body)
      actions.saved(fromLayout(body))
      toast({ title: 'Floor plan saved' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="p-6 text-sm">
        <p className="text-red-600">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>Try again</Button>
      </div>
    )
  }
  if (!layout) return <div className="p-6 text-sm text-muted-foreground">Loading storage…</div>

  const single = state.selection.length === 1 ? state.selection[0] : null
  const selectedShelfKey = single?.kind === 'shelf' ? single.key : null
  const companiesInUse = layout.companies
  const menu = menuState(state.doc, state.selection, menuTarget, mode, canPaste)
  const menuHandlers: MenuHandlers = {
    editDetails: () => focusPanel('first'),
    rename: () => focusPanel('name'),
    rotate: actions.rotate,
    duplicate: actions.duplicate,
    copy: () => {
      const clip = copySelection(state.doc, state.selection)
      if (clip) writeClipboard(clip)
    },
    paste: (at) => {
      const clip = readClipboard()
      if (clip) actions.paste(clip, at ?? viewCentre.current ?? DEFAULT_CENTRE)
    },
    lock: actions.lock,
    group: actions.group,
    ungroup: actions.ungroup,
    align: actions.align,
    distribute: actions.distribute,
    remove: actions.remove,
    setAccessBoth: (both) => {
      if (single?.kind === 'shelf') actions.patch(single, { access_side: both ? 'both' : 'front' }, true)
    },
    viewCubbies: () => {
      if (menuTarget?.kind === 'shape') select([menuTarget.ref], true)
    },
    changeType: (kind) => {
      if (single?.kind === 'item') actions.patch(single, { kind }, true)
    },
    addHere: (tool, at) => actions.add(tool, defaultRect(tool, at)),
    selectAll: actions.selectAll,
    fit: () => setFitToken((t) => t + 1),
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="text-xs text-muted-foreground">
          {layout.shelves.length} shelves · {layout.laboratory.storage_capacity.toLocaleString()} samples capacity
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label="Fit to screen" onClick={() => setFitToken((t) => t + 1)}>
            <Maximize className="h-4 w-4" />
          </Button>
          {mode === 'edit' && (
            <>
              <Button variant="ghost" size="sm" aria-label="Undo" disabled={state.past.length === 0} onClick={actions.undo}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Redo" disabled={state.future.length === 0} onClick={actions.redo}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </>
          )}
          {layout.can_edit && !readOnly && (
            mode === 'view' ? (
              <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
                <Pencil className="mr-1.5 h-4 w-4" />Edit
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={state.dirty}
                title={state.dirty ? 'Save or undo your changes first' : undefined}
                onClick={() => { setMode('view'); actions.setTool('select') }}>
                <Eye className="mr-1.5 h-4 w-4" />View
              </Button>
            )
          )}
          {mode === 'edit' && (
            <Button size="sm" disabled={!state.dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
          )}
        </div>
      </div>

      {conflicts && (
        <div role="alert" className="border-b border-red-500/40 bg-red-500/5 px-4 py-2 text-sm">
          <p className="font-medium text-red-600">{conflicts.message}</p>
          {conflicts.items.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-600">
              {conflicts.items.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {mode === 'edit' && <ToolPalette tool={state.tool} onTool={actions.setTool} />}
        <div className="relative min-w-0 flex-1">
          <CanvasContextMenu menu={menu} target={menuTarget} on={menuHandlers}
            onOpenChange={(open) => { if (open) setCanPaste(readClipboard() !== null) }}>
            <BlueprintCanvas
              doc={state.doc} mode={mode} tool={state.tool} selection={state.selection} zones={zones}
              highlightShelfKey={highlight?.shelfKey ?? null} fitToken={fitToken} viewCentre={viewCentre}
              onSelect={select} onToggle={actions.toggle} onCheckpoint={actions.checkpoint}
              onPatchMany={(patches) => actions.patchMany(patches, false)} onAdd={actions.add}
              onContextTarget={setMenuTarget}
            />
          </CanvasContextMenu>
          {mode === 'edit' && state.doc.plan.rooms.length === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border bg-background px-3 py-1.5 text-xs">
              Draw the room first: pick Room and drag out its walls.
            </div>
          )}
          {companiesInUse.length > 0 && (
            <ul className="absolute bottom-3 right-3 space-y-1 rounded-md border bg-background p-2 text-[11px]">
              {companiesInUse.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: zones.get(c.id)?.color }} />
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside ref={asideRef} className="w-80 shrink-0 overflow-y-auto border-l p-4">
          {mode === 'edit' ? (
            <Inspector doc={state.doc} selection={state.selection} zones={zones}
              onPatch={(ref, patch) => actions.patch(ref, patch, true)} onRotate={() => actions.rotate(1)}
              onDelete={actions.remove} onLock={actions.lock} onGroup={actions.group} onUngroup={actions.ungroup}
              onRenameGroup={actions.renameGroup} onAlign={actions.align} onDistribute={actions.distribute} />
          ) : (
            <ViewPanel laboratoryId={laboratoryId} doc={state.doc} selectedShelfKey={selectedShelfKey} zones={zones}
              highlightCubbyId={highlight?.cubbyId ?? null}
              onFound={(shelfKey, cubbyId) => { actions.select([{ kind: 'shelf', key: shelfKey }], true); setHighlight({ shelfKey, cubbyId }) }} />
          )}
        </aside>
      </div>
    </div>
  )
}
```

(This is the workspace as it stands after Tasks 6-8, with the menu state, handlers and the `CanvasContextMenu` wrapper added; if an earlier task's edits differ slightly, keep their behaviour and add only the menu parts.)

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run src/components/storage`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/storage/blueprint
git commit -m "feat(storage): right-click menu on the blueprint, with shortcuts shown"
```

---

### Task 10: Verify, review, push and hand over

**Files:**
- Modify: `/Users/danielwolthers/.claude/projects/-Users-danielwolthers-Documents-GitHub-WAQC/memory/lab-storage-blueprint.md` and `MEMORY.md` (index line)
- Modify: `docs/superpowers/handoffs/2026-10-07-lab-storage-blueprint-handoff.md` (resume point)

- [ ] **Step 1: Full verification**

Run: `npx vitest run`
Expected: every storage test passes; the whole suite has no new failures (the 19 unhandled-rejection "Errors" from CvaJourney and sample-intake-form tests predate this work).
Run: `npx tsc --noEmit -p .`
Expected: no errors.
Run: `npm run build`
Expected: exit 0.
Run: `wc -l src/components/storage/blueprint/*.tsx src/components/storage/blueprint/*.ts src/lib/storage/*.ts`
Expected: every file under 2000 lines.

- [ ] **Step 2: Confirm the SQL**

Ask Daniel whether `20261013000001_storage_lock_groups.sql` and the scenario script (Task 2) both ran clean. Do not push until he says yes.

- [ ] **Step 3: Review**

One fresh reviewer (most capable model) reads the whole diff since `e2870200` against the spec and Part A's Review Focus, then fix what it finds, re-running Step 1.

- [ ] **Step 4: Push**

```bash
git fetch origin && git log --oneline HEAD..origin/main
git push origin HEAD:main
```

Expected: nothing new on `main` before the push; the push fast-forwards `main`.

- [ ] **Step 5: Smoke test (ask Daniel, on localhost:3001 or Production)**

1. Right-click a shelf: the menu shows shortcuts. Rotate right turns it; Lock draws a padlock; dragging it now pans; Unlock.
2. Shift+click two shelves, Group (⌘G). Click one: both get a dashed box; drag: both move; Undo puts both back. Name the group "Wall rack" in the side panel: the name shows above them.
3. Double-click one member: only it is selected; change its letter.
4. Shift+drag a box inside the room: shelves and furniture are picked, the room is not.
5. Three shelves: Align left, then Distribute horizontally.
6. ⌘D a shelf: a copy with the next letter appears beside it. ⌘C, then ⌘V: copies appear in the middle of the view with new letters.
7. Rename the room "Sample room": the name shows in the middle of the room. Lock the room: dragging inside it pans.
8. Arrow keys nudge 10 cm, Shift+arrow 1 cm.
9. Open the menu and press Escape: only the menu closes; the selection stays and the storage screen stays open.
10. Save, close, reopen: locks, the group and its name, and the room name are kept.

- [ ] **Step 6: Record**

Update the memory file `lab-storage-blueprint.md` (what shipped, head SHA, migration applied) and its `MEMORY.md` line; update the handoff's resume point to "Part 1 + editor menu/groups live; next: Part 2 plan (zones + place_sample)". Commit the handoff:

```bash
git add docs/superpowers/handoffs/2026-10-07-lab-storage-blueprint-handoff.md
git commit -m "docs(handoff): lab-storage-blueprint — editor menu, lock and groups shipped"
```
