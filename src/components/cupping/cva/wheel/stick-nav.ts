// The thumbstick as a D-pad (Daniel 2026-09-09: "make the stick work like
// scrolling up on the buttons … jumping from one to the other, on the direction
// the stick is showing, with a tac tac tac feeling"). Pure maths, no DOM: which
// wedge lies in the pushed direction, how fast the steps repeat, and how the
// camera scrolls to keep the highlight in view. FlavorWheel's rAF loop calls
// these; the stick itself still only reports a vector.
//
// Direction is screen direction — up is up on the glass — which is also scene
// direction, because the camera never rotates.

import { NODES, CX, CY, type WheelNode } from '@/lib/cva/flavor-wheel-data'
import { worldToScreen, clampCamera, pxPerUnit, type Camera, type Viewport } from './camera'

/** Half-angle of the cone a candidate must lie in. Wide, so a ring can be walked with one thumb direction. */
export const STEP_CONE_DEG = 62
/** Steps per hold: fast at full deflection, slow at the deadzone edge. */
export const REPEAT_MIN_MS = 150
export const REPEAT_MAX_MS = 380
/** The highlight may drift this far (fraction of each visible side) before the camera follows. */
export const FOLLOW_MARGIN = 0.22

export const centroidOf = (n: WheelNode): { x: number; y: number } => {
  const mid = (n.a0 + n.a1) / 2, r = (n.r0 + n.r1) / 2
  return { x: CX + Math.cos(mid) * r, y: CY + Math.sin(mid) * r }
}

/**
 * What the stick may land on. Nothing framed: the nine families — the only
 * wedges a cupper can read at rest, and the only ones a tap would act on.
 * Inside a framed family: its own groups and leaves (the pickable ones), plus
 * every family wedge so the thumb can hop to a neighbour without zooming out.
 * Never another family's leaves: `activate` would only re-aim to them anyway.
 */
export function stickCandidates(focusFamily: string | null): WheelNode[] {
  if (!focusFamily) return NODES.filter((n) => n.ring === 1)
  return NODES.filter((n) => n.ring === 1 || n.family === focusFamily)
}

/**
 * The next wedge in direction `dir` (unit vector) from `from` (scene point):
 * the nearest candidate inside the cone, misalignment penalised so a close
 * wedge slightly off-axis beats a far one dead ahead only when it is much
 * closer. Null when nothing lies that way — the stick has run off the wheel.
 */
export function stepFocus(
  from: { x: number; y: number },
  fromKey: string | null,
  dir: { x: number; y: number },
  focusFamily: string | null,
): WheelNode | null {
  const cosMin = Math.cos((STEP_CONE_DEG * Math.PI) / 180)
  let best: WheelNode | null = null
  let bestScore = Infinity
  for (const n of stickCandidates(focusFamily)) {
    if (n.path.join('>') === fromKey) continue
    const c = centroidOf(n)
    const vx = c.x - from.x, vy = c.y - from.y
    const d = Math.hypot(vx, vy)
    if (d === 0) continue
    const cos = (vx * dir.x + vy * dir.y) / d
    if (cos < cosMin) continue
    const score = d / (cos * cos)
    if (score < bestScore) { bestScore = score; best = n }
  }
  return best
}

/** Milliseconds until the next step for a stick deflected `m` (0–1). */
export const repeatMs = (m: number): number =>
  REPEAT_MAX_MS - (REPEAT_MAX_MS - REPEAT_MIN_MS) * Math.max(0, Math.min(1, m))

/**
 * Keep the highlighted wedge on screen: if its centroid has left the inner box
 * of the VISIBLE region (the root above the tray band), shift the camera by
 * exactly the overshoot, then clamp like every other move. A wedge already in
 * the box returns the camera untouched, so stepping along a visible ring does
 * not make the wheel swim.
 */
export function followCamera(node: WheelNode, cam: Camera, vp: Viewport): Camera {
  if (!vp.width || !vp.height) return cam
  const c = centroidOf(node)
  const s = worldToScreen(c.x, c.y, cam, vp)
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
