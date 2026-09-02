// Pure camera maths for the wheel. No DOM, no React. The component keeps
// `current` and `target` in a ref and calls springStep once per rAF.
import { CX, CY, R3, VIEW, type WheelNode } from '@/lib/cva/flavor-wheel-data'

export interface Camera { x: number; y: number; scale: number }
export interface Viewport { width: number; height: number }

export const MIN_SCALE = 1
export const MAX_SCALE_DESKTOP = 1.5   // Daniel 2026-09-02
export const MAX_SCALE_MOBILE = 3      // Daniel 2026-09-02
export const RESPONSIVENESS = 9        // spring: k = 1 − e^(−dt·R)
export const MAX_PAN_SPEED = 900       // scene units / s at scale 1
export const EDGE_BAND = 0.14          // outer 14% of each viewport side
export const EDGE_PAN_MIN_SCALE = 1.05
export const RUBBER_PX = 60
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
 * Keep the viewport on the wheel disc. If the viewport is larger than the disc
 * on an axis, the camera is pinned to the centre on that axis; otherwise it may
 * roam until the viewport edge meets the disc edge, plus `slackPx` of rubber band.
 */
export function clampCamera(cam: Camera, vp: Viewport, slackPx = 0): Camera {
  const k = pxPerUnit(vp) * cam.scale
  const slack = slackPx / k
  const axis = (c: number, centre: number, halfPx: number) => {
    const half = halfPx / k
    const room = R3 - half
    if (room <= 0) return centre
    return Math.max(centre - room - slack, Math.min(centre + room + slack, c))
  }
  return { x: axis(cam.x, CX, vp.width / 2), y: axis(cam.y, CY, vp.height / 2), scale: cam.scale }
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
 * chord × depth fills ~80% of the viewport, clamped to [1, maxScale]. On desktop
 * the 1.5 cap always wins; on a phone this is what makes a narrow family fill
 * the screen.
 */
export function flyToNode(node: WheelNode, vp: Viewport, maxScale: number): Camera {
  const mid = (node.a0 + node.a1) / 2
  const rMid = (node.r0 + R3) / 2
  const f = pxPerUnit(vp)
  const chord = 2 * R3 * Math.sin(Math.min(Math.PI, node.a1 - node.a0) / 2)
  const depth = R3 - node.r0
  const wanted = 0.8 * Math.min(vp.width / (chord * f), vp.height / (depth * f))
  const scale = clampScale(wanted, maxScale)
  return clampCamera({ x: CX + Math.cos(mid) * rMid, y: CY + Math.sin(mid) * rMid, scale }, vp)
}

export const easeInOutCubic = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

/**
 * Desktop edge-proximity pan (spec: Desktop interactions). Penetration into the
 * outer band ramps the speed; dividing by scale keeps the apparent speed
 * constant; corners are clamped so diagonals are not 1.41× faster.
 */
export function edgePanVelocity(px: number, py: number, vp: Viewport, scale: number, reduced: boolean): { vx: number; vy: number } {
  if (reduced || scale <= EDGE_PAN_MIN_SCALE) return { vx: 0, vy: 0 }
  const band = (pos: number, size: number): number => {
    const b = size * EDGE_BAND
    if (pos < b) return -easeInOutCubic(1 - pos / b)
    if (pos > size - b) return easeInOutCubic(1 - (size - pos) / b)
    return 0
  }
  const max = MAX_PAN_SPEED / scale
  let vx = band(px, vp.width) * max, vy = band(py, vp.height) * max
  const mag = Math.hypot(vx, vy)
  if (mag > max) { vx *= max / mag; vy *= max / mag }
  return { vx, vy }
}
