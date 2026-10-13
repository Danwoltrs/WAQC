/**
 * Arranging several shapes at once by what they cover on the floor
 * (footprints, whole centimetres): their combined box, a quarter turn of the
 * set about its centre, keeping a set on the plan, align, distribute, and
 * where a duplicate goes.
 */
import { MAX_PLAN_CM, type Rect, type Rotation } from './floor-plan'
import { footprint, fromFootprint } from './geometry'

/** 1 turns clockwise on screen (y grows downwards), -1 anticlockwise. */
export type Turn = 1 | -1
export type AlignEdge = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'
export type Axis = 'h' | 'v'
export interface Offset { dx: number; dy: number }

export const DUPLICATE_GAP_CM = 10

const NONE: Offset = { dx: 0, dy: 0 }

/** The box around every rectangle; callers pass at least one. */
export function unionRect(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.d))
  return { x: minX, y: minY, w: maxX - minX, d: maxY - minY }
}

/** A footprint turned a quarter about `c`: its centre goes round `c`, width and depth swap. */
export function turnFootprint(fp: Rect, c: { x: number; y: number }, turn: Turn): Rect {
  const dx = fp.x + fp.w / 2 - c.x
  const dy = fp.y + fp.d / 2 - c.y
  const cx = c.x + (turn === 1 ? -dy : dy)
  const cy = c.y + (turn === 1 ? dx : -dx)
  return { x: Math.round(cx - fp.d / 2), y: Math.round(cy - fp.w / 2), w: fp.d, d: fp.w }
}

/** How far to move a set so its box lies on the plan (0..MAX_PLAN_CM); zero when it already does. */
export function onPlanOffset(box: Rect): Offset {
  const fix = (start: number, size: number) =>
    start < 0 ? -start : start + size > MAX_PLAN_CM ? MAX_PLAN_CM - (start + size) : 0
  return { dx: fix(box.x, box.w), dy: fix(box.y, box.d) }
}

/** Offsets lining each movable footprint up with an edge (or centre line) of the combined box. */
export function alignOffsets(fps: Rect[], movable: boolean[], edge: AlignEdge): Offset[] {
  const box = unionRect(fps)
  return fps.map((r, i) => {
    if (!movable[i]) return NONE
    switch (edge) {
      case 'left': return { dx: box.x - r.x, dy: 0 }
      case 'right': return { dx: box.x + box.w - (r.x + r.w), dy: 0 }
      case 'centre': return { dx: Math.round(box.x + box.w / 2 - (r.x + r.w / 2)), dy: 0 }
      case 'top': return { dx: 0, dy: box.y - r.y }
      case 'bottom': return { dx: 0, dy: box.y + box.d - (r.y + r.d) }
      case 'middle': return { dx: 0, dy: Math.round(box.y + box.d / 2 - (r.y + r.d / 2)) }
    }
  })
}

/**
 * Offsets leaving equal gaps between footprints along an axis. The first and
 * the last (by position) stay put; a locked one in between keeps its place.
 */
export function distributeOffsets(fps: Rect[], movable: boolean[], axis: Axis): Offset[] {
  const out = fps.map(() => NONE)
  if (fps.length < 3) return out
  const start = (r: Rect) => (axis === 'h' ? r.x : r.y)
  const size = (r: Rect) => (axis === 'h' ? r.w : r.d)
  const order = fps.map((_, i) => i).sort((a, b) => start(fps[a]) - start(fps[b]))
  const first = order[0]
  const last = order[order.length - 1]
  const span = start(fps[last]) + size(fps[last]) - start(fps[first])
  const gap = (span - order.reduce((n, i) => n + size(fps[i]), 0)) / (order.length - 1)
  let at = start(fps[first])
  for (const i of order) {
    if (movable[i] && i !== first && i !== last) {
      const d = Math.round(at) - start(fps[i])
      out[i] = axis === 'h' ? { dx: d, dy: 0 } : { dx: 0, dy: d }
    }
    at += size(fps[i]) + gap
  }
  return out
}

/** Where copies of a set go: right of it, else below, else left, else above; in place if none fits. */
export function duplicateOffset(box: Rect): Offset {
  const fits = (o: Offset) => {
    const x = box.x + o.dx
    const y = box.y + o.dy
    return x >= 0 && y >= 0 && x + box.w <= MAX_PLAN_CM && y + box.d <= MAX_PLAN_CM
  }
  const tries: Offset[] = [
    { dx: box.w + DUPLICATE_GAP_CM, dy: 0 },
    { dx: 0, dy: box.d + DUPLICATE_GAP_CM },
    { dx: -(box.w + DUPLICATE_GAP_CM), dy: 0 },
    { dx: 0, dy: -(box.d + DUPLICATE_GAP_CM) },
  ]
  return tries.find(fits) ?? NONE
}

/** A shape's stored rectangle after what it covers moves by an offset. */
export function moveFootprintBy(rect: Rect, rot: Rotation, o: Offset): Rect {
  const fp = footprint({ ...rect, rot })
  return fromFootprint({ ...fp, x: fp.x + o.dx, y: fp.y + o.dy }, rot)
}
