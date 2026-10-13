/**
 * Plan geometry in whole centimetres. Shapes are stored unrotated (x, y, w, d)
 * with a quarter-turn `rot`; what they cover on the floor is their footprint.
 * While editing, shapes may go past zero (the plan shows no edge there); a
 * save moves the whole plan back to start at 0, 0.
 */
import { MAX_PLAN_CM, MIN_SIZE_CM, footprintOrigin, type Rect, type Rotation } from './floor-plan'

export const SNAP_CM = 10
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export type Segment = [x1: number, y1: number, x2: number, y2: number]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function snap(v: number, free = false): number {
  return free ? Math.round(v) : Math.round(v / SNAP_CM) * SNAP_CM
}

/** The axis-aligned area a shape covers: a quarter turn swaps width and depth about the centre. */
export function footprint(r: Rect & { rot?: Rotation }): Rect {
  if (r.rot !== 90 && r.rot !== 270) return { x: r.x, y: r.y, w: r.w, d: r.d }
  return { ...footprintOrigin(r, r.rot), w: r.d, d: r.w }
}

/**
 * The stored rectangle whose rotated footprint is `fp`: the exact inverse of
 * footprint(), ceil included, so a turned shape with an odd width-depth
 * difference does not creep a centimetre on every move.
 */
export function fromFootprint(fp: Rect, rot: Rotation): Rect {
  if (rot !== 90 && rot !== 270) return { x: fp.x, y: fp.y, w: fp.w, d: fp.d }
  const w = fp.d
  const d = fp.w
  return { x: fp.x - Math.ceil((w - d) / 2), y: fp.y - Math.ceil((d - w) / 2), w, d }
}

export function rotateQuarter(rot: Rotation): Rotation {
  return ((rot + 90) % 360) as Rotation
}

export function moveRect(r: Rect, dx: number, dy: number, free = false): Rect {
  return {
    ...r,
    x: clamp(snap(r.x + dx, free), -MAX_PLAN_CM, MAX_PLAN_CM),
    y: clamp(snap(r.y + dy, free), -MAX_PLAN_CM, MAX_PLAN_CM),
  }
}

/** Move a shape by what it covers on the floor, so a turned shape can stand against a wall. */
export function moveShape(r: Rect, rot: Rotation, dx: number, dy: number, free = false): Rect {
  return fromFootprint(moveRect(footprint({ ...r, rot }), dx, dy, free), rot)
}

/** Move the edge(s) a handle names to the pointer; the opposite edge stays put. */
export function resizeRect(r: Rect, handle: Handle, px: number, py: number, free = false): Rect {
  let left = r.x
  let top = r.y
  let right = r.x + r.w
  let bottom = r.y + r.d
  const sx = snap(px, free)
  const sy = snap(py, free)
  if (handle.includes('w')) left = Math.max(-MAX_PLAN_CM, Math.min(sx, right - MIN_SIZE_CM))
  if (handle.includes('e')) right = Math.min(MAX_PLAN_CM, Math.max(sx, left + MIN_SIZE_CM))
  if (handle.includes('n')) top = Math.max(-MAX_PLAN_CM, Math.min(sy, bottom - MIN_SIZE_CM))
  if (handle.includes('s')) bottom = Math.min(MAX_PLAN_CM, Math.max(sy, top + MIN_SIZE_CM))
  return { x: left, y: top, w: right - left, d: bottom - top }
}

export function rectFromDrag(ax: number, ay: number, bx: number, by: number, free = false): Rect {
  const x1 = Math.max(-MAX_PLAN_CM, snap(Math.min(ax, bx), free))
  const y1 = Math.max(-MAX_PLAN_CM, snap(Math.min(ay, by), free))
  const x2 = snap(Math.max(ax, bx), free)
  const y2 = snap(Math.max(ay, by), free)
  return { x: x1, y: y1, w: Math.max(MIN_SIZE_CM, x2 - x1), d: Math.max(MIN_SIZE_CM, y2 - y1) }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d
}

export function overlappingKeys(shapes: Array<{ key: string; rect: Rect }>): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (rectsOverlap(shapes[i].rect, shapes[j].rect)) {
        out.add(shapes[i].key)
        out.add(shapes[j].key)
      }
    }
  }
  return out
}

/**
 * The outline of a union of rectangles (an L-shaped room drawn as two): the
 * edges between a covered and an uncovered cell of the compressed grid.
 */
export function outlineSegments(rects: Rect[]): Segment[] {
  if (rects.length === 0) return []
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b)
  const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.d]))].sort((a, b) => a - b)
  const covered = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false
    const cx = (xs[i] + xs[i + 1]) / 2
    const cy = (ys[j] + ys[j + 1]) / 2
    return rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.d)
  }
  const segs: Segment[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length; j++) {
      if (covered(i, j - 1) !== covered(i, j)) segs.push([xs[i], ys[j], xs[i + 1], ys[j]])
    }
  }
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length; i++) {
      if (covered(i - 1, j) !== covered(i, j)) segs.push([xs[i], ys[j], xs[i], ys[j + 1]])
    }
  }
  return segs
}

/** Box around everything, padded; a 10 x 7 m sheet when there is nothing yet. */
export function planBounds(rects: Rect[], pad = 50): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 1000, d: 700 }
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.d))
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, d: maxY - minY + 2 * pad }
}
