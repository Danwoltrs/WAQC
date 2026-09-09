// The thumbstick drives a CURSOR over the wheel (Daniel 2026-09-09, after the
// second phone test: "if I hold it down left, it should keep going down left,
// the further my thumb is from the center, the faster it goes, going back
// center slows down"). Pure maths, no DOM: how the cursor moves, what wedge it
// is on, and how the camera scrolls to keep it in view. FlavorWheel's rAF loop
// integrates it every frame while the knob is held; the stick itself still only
// reports a vector.
//
// The first attempt was a D-pad — one discrete step per push — and it read as
// dead on a ring of nine families, where one step in a direction is all there
// is. A cursor keeps going: across the family, out through its groups and
// leaves (a tick at every boundary), round the rim, through the hub to the far
// side. Direction is screen direction, which is also scene direction because
// the camera never rotates.

import { CX, CY, R3, type WheelNode } from '@/lib/cva/flavor-wheel-data'
import { regionAtScene } from './hit-test'
import { worldToScreen, clampCamera, pxPerUnit, type Camera, type Viewport } from './camera'

/** Scene units per second at full deflection. A family wedge is ~57 units across, a leaf ~14. */
export const CURSOR_SPEED = 150
/** The cursor may drift this far (fraction of each visible side) before the camera follows. */
export const FOLLOW_MARGIN = 0.22
/** The cursor never leaves the disc: it slides along a circle just inside the rim. */
const RIM = R3 - 0.5

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export const centroidOf = (n: WheelNode): { x: number; y: number } => {
  const mid = (n.a0 + n.a1) / 2, r = (n.r0 + n.r1) / 2
  return { x: CX + Math.cos(mid) * r, y: CY + Math.sin(mid) * r }
}

/**
 * Speed for a stick magnitude `m`. stickVector squares the deflection past the
 * deadzone (so the pan it used to drive eased in); the cursor wants the thumb's
 * actual travel — linear — so half way out is half speed.
 */
export const cursorSpeed = (m: number): number => CURSOR_SPEED * Math.sqrt(clamp01(m))

/**
 * One frame of travel: `dt` seconds in the stick's direction at its speed, then
 * held inside the rim. Pushing straight out at the rim goes nowhere; pushing
 * sideways there slides the cursor round the circle. The hub is open — the
 * cursor crosses it to the far side of the wheel.
 */
export function moveCursor(pos: { x: number; y: number }, v: { x: number; y: number; m: number }, dt: number): { x: number; y: number } {
  const sp = cursorSpeed(v.m)
  if (sp === 0 || dt <= 0) return pos
  let x = pos.x + v.x * sp * dt, y = pos.y + v.y * sp * dt
  const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy)
  if (r > RIM) { x = CX + (dx * RIM) / r; y = CY + (dy * RIM) / r }
  return { x, y }
}

/**
 * The wedge under the cursor, any ring. The hub is nothing (the highlight
 * clears). Anywhere the hit-test finds nothing else — the rim's edge, a
 * hairline — keeps the wedge the cursor came from, so the highlight never
 * flickers off mid-glide.
 */
export function wedgeUnder(pt: { x: number; y: number }, prevKey: string | null): string | null {
  const reg = regionAtScene(pt.x, pt.y)
  if (reg.kind === 'node') return reg.node.path.join('>')
  if (reg.kind === 'hub') return null
  return prevKey
}

/**
 * Keep a scene point on screen: if it has left the inner box of the VISIBLE
 * region (the root above the tray band), shift the camera by exactly the
 * overshoot, then clamp like every other move. A point already in the box
 * returns the camera untouched, so gliding along a visible ring does not make
 * the wheel swim.
 */
export function followPoint(pt: { x: number; y: number }, cam: Camera, vp: Viewport): Camera {
  if (!vp.width || !vp.height) return cam
  const s = worldToScreen(pt.x, pt.y, cam, vp)
  const visH = Math.max(1, vp.height - (vp.insetBottom ?? 0))
  const mx = vp.width * FOLLOW_MARGIN, my = visH * FOLLOW_MARGIN
  let dx = 0, dy = 0
  if (s.x < mx) dx = s.x - mx
  else if (s.x > vp.width - mx) dx = s.x - (vp.width - mx)
  if (s.y < my) dy = s.y - my
  else if (s.y > visH - my) dy = s.y - (visH - my)
  if (!dx && !dy) return cam
  const k = pxPerUnit(vp) * cam.scale
  return clampCamera({ ...cam, x: cam.x + dx / k, y: cam.y + dy / k }, vp)
}

/** followPoint for a wedge's centroid. */
export const followCamera = (node: WheelNode, cam: Camera, vp: Viewport): Camera => followPoint(centroidOf(node), cam, vp)
