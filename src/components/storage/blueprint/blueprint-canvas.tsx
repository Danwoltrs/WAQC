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
  | { kind: 'move'; anchor: Member; start: Point; client: Point; members: Member[]; moved: boolean }
  | { kind: 'resize'; ref: ShapeRef; handle: Handle; rect: Rect; rot: Rotation; client: Point; moved: boolean }
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
const near = (a: Point, x: number, y: number) => Math.abs(x - a.x) < CLICK_PX && Math.abs(y - a.y) < CLICK_PX
/** On a Mac, Ctrl+click is a right-click: leave it to the menu. */
const macContextClick = (e: ReactPointerEvent) =>
  e.ctrlKey && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

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
  /** A shape pressed inside a bigger selection: a click without a drag narrows the selection to it. */
  const narrow = useRef<ShapeRef | null>(null)
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
    if ((e.button !== 0 && e.button !== 1) || macContextClick(e)) return
    narrow.current = null
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
    if (e.button !== 0 || spaceDown.current || macContextClick(e)) return
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
    narrow.current = already && selection.length > expandSelection(doc, [ref]).length ? ref : null
    const moving = already ? selection : expandSelection(doc, [ref])
    const members = shapes.filter((s) => isSelected(moving, s.ref))
    const anchor = members.find((s) => sameRef(s.ref, ref))
    if (!anchor || members.some((s) => s.locked)) { pan(e); return }
    begin(e, {
      kind: 'move', anchor: member(anchor), start: toPlan(e.clientX, e.clientY), client: { x: e.clientX, y: e.clientY },
      members: members.map(member), moved: false,
    })
  }

  const onShapeDouble = (ref: ShapeRef) => () => {
    if (mode === 'edit' && tool === 'select') onSelect([ref], true)
  }

  const onHandleDown = (ref: ShapeRef, rect: Rect, rot: Rotation, handle: Handle) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    begin(e, { kind: 'resize', ref, handle, rect, rot, client: { x: e.clientX, y: e.clientY }, moved: false })
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
    // A click that wobbles a pixel is still a click: nothing moves, nothing snaps.
    if (!g.moved && near(g.client, e.clientX, e.clientY)) return
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
    const pressed = narrow.current
    narrow.current = null
    const stayed = g?.kind === 'move' ? !g.moved : g?.kind === 'pan' && near(g.client, e.clientX, e.clientY)
    if (pressed && stayed) onSelect([pressed])
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
