// Pure camera maths for the wheel. No DOM, no React. The component keeps
// `current` and `target` in a ref and calls springStep once per rAF.
import { CX, CY, R3, VIEW, type WheelNode } from '@/lib/cva/flavor-wheel-data'

export interface Camera { x: number; y: number; scale: number }
export interface Viewport {
  width: number
  height: number
  /** CSS px at the bottom of the root covered by chrome (the descriptors tray band). Framing, clamping and the edge band work against the region ABOVE it. */
  insetBottom?: number
}

export const MIN_SCALE = 1
export const MAX_SCALE_DESKTOP = 1.5   // Daniel 2026-09-02
export const MAX_SCALE_MOBILE = 3      // Daniel 2026-09-02
export const RESPONSIVENESS = 9        // spring: k = 1 − e^(−dt·R)
export const MAX_PAN_SPEED = 900       // scene units / s at scale 1
export const EDGE_BAND = 0.14          // outer 14% of each viewport side
export const EDGE_PAN_MIN_SCALE = 1.05
export const RUBBER_PX = 60
export const SCENE_HALF = VIEW / 2     // the wheel's padded box; the rim (R3) sits 8 units inside it
const EPS_POS = 0.02, EPS_SCALE = 0.0005

export const restCamera = (): Camera => ({ x: CX, y: CY, scale: 1 })

/** CSS px per scene unit at scale 1: the wheel always fits the shorter side. */
export const pxPerUnit = (vp: Viewport): number => Math.min(vp.width, vp.height) / VIEW

/**
 * The ONE transform in the wheel. #camera has transform-origin 50% 50% and is
 * the size of the root, with the svg centred inside it, so scaling about the
 * centre then translating by −(cam − C)·f·s puts scene point `cam` at the
 * viewport centre.
 */
export function cameraTransform(cam: Camera, vp: Viewport): string {
  const k = pxPerUnit(vp) * cam.scale
  const tx = -(cam.x - CX) * k, ty = -(cam.y - CY) * k
  return `translate(${round(tx)}px, ${round(ty)}px) scale(${round(cam.scale)})`
}
const round = (v: number) => Math.round(v * 1000) / 1000

export function screenToWorld(px: number, py: number, cam: Camera, vp: Viewport): { x: number; y: number } {
  const k = pxPerUnit(vp) * cam.scale
  return { x: cam.x + (px - vp.width / 2) / k, y: cam.y + (py - vp.height / 2) / k }
}

export function worldToScreen(x: number, y: number, cam: Camera, vp: Viewport): { x: number; y: number } {
  const k = pxPerUnit(vp) * cam.scale
  return { x: vp.width / 2 + (x - cam.x) * k, y: vp.height / 2 + (y - cam.y) * k }
}

const clampScale = (s: number, max: number) => Math.max(MIN_SCALE, Math.min(max, s))

/** Zoom by `factor` keeping the scene point under (px, py) fixed (spec: Zoom anchoring). */
export function zoomAt(cam: Camera, vp: Viewport, px: number, py: number, factor: number, maxScale: number): Camera {
  const before = screenToWorld(px, py, cam, vp)
  const scaled = { ...cam, scale: clampScale(cam.scale * factor, maxScale) }
  const after = screenToWorld(px, py, scaled, vp)
  return { x: scaled.x + before.x - after.x, y: scaled.y + before.y - after.y, scale: scaled.scale }
}

/**
 * Keep the VISIBLE region on the wheel's padded box. Per axis, the near and far
 * visible edges may not pass the box's edges (plus `slackPx` of rubber band);
 * when the box fits inside the visible region on an axis, the camera is pinned
 * to that region's centre. Without an inset the visible region is the root, so
 * at scale 1 the wheel sits centred exactly as before. A bottom inset (the
 * descriptors tray band) shortens the visible region from below: a zoomed wheel
 * may then sit exactly one band higher, and on a phone whose wheel fits above
 * the band, rest itself centres in the clear area. The limit is the box, not
 * the rim, so an inset can lift a rest wheel without shoving its top edge off
 * the root (Daniel 2026-09-03: "when we go to the lower part, it must all move up").
 */
export function clampCamera(cam: Camera, vp: Viewport, slackPx = 0): Camera {
  const k = pxPerUnit(vp) * cam.scale
  const slack = slackPx / k
  const axis = (c: number, centre: number, nearPx: number, farPx: number): number => {
    const lo = centre - SCENE_HALF + nearPx / k
    const hi = centre + SCENE_HALF - farPx / k
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return centre
    if (hi <= lo) return (lo + hi) / 2   // the box fits: pin to the visible centre (= root centre + inset/2)
    return Math.max(lo - slack, Math.min(hi + slack, c))
  }
  const halfW = vp.width / 2, halfH = vp.height / 2
  return { x: axis(cam.x, CX, halfW, halfW), y: axis(cam.y, CY, halfH, halfH - (vp.insetBottom ?? 0)), scale: cam.scale }
}

/** Critically damped, frame-rate independent step toward `target`. Snaps once settled. */
export function springStep(cur: Camera, tgt: Camera, dt: number): Camera {
  if (isSettled(cur, tgt)) return { ...tgt }
  const k = 1 - Math.exp(-Math.min(dt, 0.1) * RESPONSIVENESS)
  return { x: cur.x + (tgt.x - cur.x) * k, y: cur.y + (tgt.y - cur.y) * k, scale: cur.scale + (tgt.scale - cur.scale) * k }
}

export const isSettled = (cur: Camera, tgt: Camera): boolean =>
  Math.abs(cur.x - tgt.x) < EPS_POS && Math.abs(cur.y - tgt.y) < EPS_POS && Math.abs(cur.scale - tgt.scale) < EPS_SCALE

/**
 * Camera that frames a family/group: centred on the sector centroid (mid angle,
 * mid radius between the node's inner edge and the rim), scaled so the sector's
 * chord × depth fills ~80% of the VISIBLE region, clamped to [1, maxScale]. On
 * desktop the 1.5 cap usually wins; on a phone this is what makes a narrow
 * family fill the screen. The centroid lands at the visible region's centre,
 * which sits insetBottom/2 px above the root centre — so a bottom family flies
 * up clear of the tray instead of under it.
 */
export function flyToNode(node: WheelNode, vp: Viewport, maxScale: number): Camera {
  const mid = (node.a0 + node.a1) / 2
  const rMid = (node.r0 + R3) / 2
  const f = pxPerUnit(vp)
  const inset = vp.insetBottom ?? 0
  const chord = 2 * R3 * Math.sin(Math.min(Math.PI, node.a1 - node.a0) / 2)
  const depth = R3 - node.r0
  const wanted = 0.8 * Math.min(vp.width / (chord * f), Math.max(1, vp.height - inset) / (depth * f))
  const scale = clampScale(wanted, maxScale)
  const lift = inset / (2 * f * scale)
  return clampCamera({ x: CX + Math.cos(mid) * rMid, y: CY + Math.sin(mid) * rMid + lift, scale }, vp)
}

export const easeInOutCubic = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Desktop edge-proximity pan (spec: Desktop interactions). Penetration into the
 * outer band ramps the speed; dividing by scale keeps the apparent speed
 * constant; corners are clamped so diagonals are not 1.41× faster. The bottom
 * band sits above the tray (the visible region), so moving the mouse toward the
 * tray pans the lower wheel up into view; a pointer beside the tray card — below
 * the visible bottom — saturates rather than exceeding the maximum.
 */
export function edgePanVelocity(px: number, py: number, vp: Viewport, scale: number, reduced: boolean): { vx: number; vy: number } {
  if (reduced || scale <= EDGE_PAN_MIN_SCALE) return { vx: 0, vy: 0 }
  const band = (pos: number, size: number): number => {
    const b = size * EDGE_BAND
    if (pos < b) return -easeInOutCubic(clamp01(1 - pos / b))
    if (pos > size - b) return easeInOutCubic(clamp01(1 - (size - pos) / b))
    return 0
  }
  const visibleH = Math.max(1, vp.height - (vp.insetBottom ?? 0))
  const max = MAX_PAN_SPEED / scale
  let vx = band(px, vp.width) * max, vy = band(py, visibleH) * max
  const mag = Math.hypot(vx, vy)
  if (mag > max) { vx *= max / mag; vy *= max / mag }
  return { vx, vy }
}
