'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { Rect, Rotation } from '@/lib/storage/floor-plan'
import {
  HANDLES, footprint, fromFootprint, moveShape, outlineSegments, overlappingKeys, planBounds,
  rectFromDrag, resizeRect, type Handle,
} from '@/lib/storage/geometry'
import {
  defaultRect, listShapes, sameRef, shapeKey, shelfRect,
  type DrawTool, type EditorDoc, type ShapePatch, type ShapeRef, type Tool,
} from './editor-state'
import { isTypingTarget } from './use-blueprint-editor'
import { ItemShape, ShelfShape } from './shapes'
import type { ZoneStyle } from './zone-colors'

interface ViewBox { x: number; y: number; w: number; h: number }
interface Point { x: number; y: number }

type Gesture =
  | { kind: 'pan'; client: Point; view: ViewBox }
  | { kind: 'draw'; start: Point; current: Point; free: boolean }
  | { kind: 'move'; ref: ShapeRef; start: Point; rect: Rect; rot: Rotation; moved: boolean }
  | { kind: 'resize'; ref: ShapeRef; handle: Handle; rect: Rect; rot: Rotation; moved: boolean }

export interface BlueprintCanvasProps {
  doc: EditorDoc
  mode: 'view' | 'edit'
  tool: Tool
  selected: ShapeRef | null
  zones: Map<string, ZoneStyle>
  highlightShelfKey?: string | null
  /** Bump to frame everything again. */
  fitToken: number
  onSelect: (ref: ShapeRef | null) => void
  onCheckpoint: () => void
  onPatch: (ref: ShapeRef, patch: ShapePatch) => void
  onAdd: (shape: DrawTool, rect: Rect) => void
}

const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
}

const svgRect = (r: Rect) => ({ x: r.x, y: r.y, width: r.w, height: r.d })

function handlePoint(r: Rect, h: Handle): Point {
  return {
    x: h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2,
    y: h.includes('n') ? r.y : h.includes('s') ? r.y + r.d : r.y + r.d / 2,
  }
}

export function BlueprintCanvas({
  doc, mode, tool, selected, zones, highlightShelfKey, fitToken, onSelect, onCheckpoint, onPatch, onAdd,
}: BlueprintCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const spaceDown = useRef(false)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: 1000, h: 700 })
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const [draft, setDraft] = useState<Rect | null>(null)
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

  const onBackgroundDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    const drawing = mode === 'edit' && tool !== 'select' && !spaceDown.current && e.button === 0
    if (!drawing) {
      if (!spaceDown.current && e.button === 0) onSelect(null)
      begin(e, { kind: 'pan', client: { x: e.clientX, y: e.clientY }, view })
      return
    }
    const p = toPlan(e.clientX, e.clientY)
    begin(e, { kind: 'draw', start: p, current: p, free: e.altKey })
    setDraft(rectFromDrag(p.x, p.y, p.x, p.y, e.altKey))
  }

  const onShapeDown = (ref: ShapeRef, rect: Rect, rot: Rotation = 0) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || spaceDown.current) return
    if (mode === 'edit' && tool !== 'select') return // drawing over a shape still draws
    e.stopPropagation()
    onSelect(ref)
    if (mode === 'edit') begin(e, { kind: 'move', ref, start: toPlan(e.clientX, e.clientY), rect, rot, moved: false })
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
    if (!g.moved) {
      onCheckpoint()
      g.moved = true
      setActiveRef(g.ref)
    }
    if (g.kind === 'move') {
      const next = moveShape(g.rect, g.rot, p.x - g.start.x, p.y - g.start.y, e.altKey)
      onPatch(g.ref, { x: next.x, y: next.y })
      return
    }
    const next = fromFootprint(resizeRect(footprint({ ...g.rect, rot: g.rot }), g.handle, p.x, p.y, e.altKey), g.rot)
    onPatch(g.ref, next)
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    gesture.current = null
    setActiveRef(null)
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    if (g?.kind === 'draw' && tool !== 'select') {
      const small = Math.abs(g.current.x - g.start.x) < 10 && Math.abs(g.current.y - g.start.y) < 10
      onAdd(tool, small ? defaultRect(tool, g.start, g.free) : rectFromDrag(g.start.x, g.start.y, g.current.x, g.current.y, g.free))
      setDraft(null)
    }
  }

  const selectedShape = shapes.find((s) => sameRef(s.ref, selected))
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
          <rect key={r.id} {...svgRect(r)} className="fill-background" onPointerDown={onShapeDown({ kind: 'room', key: r.id }, r)} />
        ))}
        {outline.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-foreground" strokeWidth={3}
            strokeLinecap="square" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {doc.plan.items.map((it) => (
          <ItemShape key={it.id} item={it} cmPerPx={cmPerPx} onPointerDown={onShapeDown({ kind: 'item', key: it.id }, it, it.rot)} />
        ))}
        {doc.shelves.map((s) => (
          <ShelfShape key={s.key} shelf={s} cmPerPx={cmPerPx} zones={zones} highlighted={s.key === highlightShelfKey}
            onPointerDown={onShapeDown({ kind: 'shelf', key: s.key }, shelfRect(s), s.rot)} />
        ))}

        {shapes.filter((s) => overlaps.has(shapeKey(s.ref))).map((s) => (
          <rect key={`overlap-${shapeKey(s.ref)}`} {...svgRect(s.fp)} fill="none" stroke="#ef4444" strokeWidth={2}
            vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}

        {selectedShape && (
          <g>
            <rect {...svgRect(selectedShape.fp)} fill="none" className="stroke-foreground" strokeDasharray="4 3"
              strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {mode === 'edit' && HANDLES.map((h) => {
              const p = handlePoint(selectedShape.fp, h)
              const s = px(9)
              return (
                <rect key={h} data-testid={`handle-${h}`} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s}
                  className="fill-background stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  style={{ cursor: HANDLE_CURSOR[h] }}
                  onPointerDown={onHandleDown(selectedShape.ref, selectedShape.rect, selectedShape.rot, h)} />
              )
            })}
          </g>
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
