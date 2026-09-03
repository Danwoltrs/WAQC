import { describe, it, expect } from 'vitest'
import { CX, CY, NODES, R3, VIEW } from '@/lib/cva/flavor-wheel-data'
import {
  restCamera, pxPerUnit, cameraTransform, screenToWorld, worldToScreen, zoomAt, clampCamera,
  springStep, isSettled, flyToNode, edgePanVelocity, MAX_SCALE_DESKTOP, MAX_SCALE_MOBILE, MAX_PAN_SPEED,
} from './camera'

const vp = { width: 1000, height: 800 }

describe('camera transforms', () => {
  it('rest camera puts the wheel centre at the viewport centre with an identity-scale transform', () => {
    expect(cameraTransform(restCamera(), vp)).toBe('translate(0px, 0px) scale(1)')
    const c = worldToScreen(CX, CY, restCamera(), vp)
    expect(c.x).toBeCloseTo(500); expect(c.y).toBeCloseTo(400)
  })

  it('screenToWorld inverts worldToScreen at any camera', () => {
    const cam = { x: 300, y: 150, scale: 2.2 }
    for (const [x, y] of [[0, 0], [123, 456], [999, 1]]) {
      const s = worldToScreen(x, y, cam, vp)
      const w = screenToWorld(s.x, s.y, cam, vp)
      expect(w.x).toBeCloseTo(x, 6); expect(w.y).toBeCloseTo(y, 6)
    }
  })

  it('anchored zoom keeps the scene point under the pointer fixed', () => {
    const cam = restCamera()
    const px = 720, py = 260
    const before = screenToWorld(px, py, cam, vp)
    const next = zoomAt(cam, vp, px, py, 1.3, MAX_SCALE_MOBILE)
    const after = screenToWorld(px, py, next, vp)
    expect(after.x).toBeCloseTo(before.x, 6); expect(after.y).toBeCloseTo(before.y, 6)
    expect(next.scale).toBeCloseTo(1.3)
  })

  it('zoom is clamped to [1, max] and never drifts below the whole-wheel view', () => {
    expect(zoomAt(restCamera(), vp, 500, 400, 0.5, MAX_SCALE_DESKTOP).scale).toBe(1)
    expect(zoomAt(restCamera(), vp, 500, 400, 10, MAX_SCALE_DESKTOP).scale).toBe(MAX_SCALE_DESKTOP)
    expect(zoomAt(restCamera(), vp, 500, 400, 10, MAX_SCALE_MOBILE).scale).toBe(MAX_SCALE_MOBILE)
  })
})

describe('clampCamera', () => {
  it('at scale 1 the camera is pinned to the wheel centre', () => {
    const c = clampCamera({ x: 900, y: -50, scale: 1 }, vp)
    expect(c.x).toBe(CX); expect(c.y).toBe(CY)
  })

  it('zoomed in, the viewport may not leave the wheel disc by more than the slack', () => {
    const f = pxPerUnit(vp)
    const cam = { x: 10_000, y: CY, scale: 3 }
    const c = clampCamera(cam, vp, 60)
    const halfW = vp.width / 2 / (f * 3)
    // the roam limit is the wheel's padded box (VIEW/2), 8 units beyond the rim — so a bottom
    // inset can lift a REST wheel without also shoving its top edge off the root
    expect(c.x).toBeCloseTo(CX + VIEW / 2 - halfW + 60 / (f * 3), 6)
    const hard = clampCamera(cam, vp, 0)
    expect(hard.x).toBeCloseTo(CX + VIEW / 2 - halfW, 6)
  })
})

describe('clampCamera with a bottom inset (the descriptors tray band)', () => {
  it('at rest on desktop the camera stays on the wheel centre — the tray may cover the bottom leaves', () => {
    const c = clampCamera({ x: CX, y: CY, scale: 1 }, { ...vp, insetBottom: 250 })
    expect(c.x).toBe(CX); expect(c.y).toBe(CY)
  })

  it('zoomed in, the VISIBLE bottom edge (the tray top) is what may not pass the wheel box', () => {
    const inset = 250, scale = 1.5
    const k = pxPerUnit(vp) * scale
    const lifted = clampCamera({ x: CX, y: 10_000, scale }, { ...vp, insetBottom: inset }, 0)
    expect(lifted.y).toBeCloseTo(CY + VIEW / 2 - (vp.height / 2 - inset) / k, 6)
    const plain = clampCamera({ x: CX, y: 10_000, scale }, vp, 0)
    expect(lifted.y - plain.y).toBeCloseTo(inset / k, 6)   // exactly one tray-height higher, no more
  })

  it('when the wheel box fits in the visible region, the camera pins to the centre of THAT region', () => {
    const phone = { width: 390, height: 800, insetBottom: 150 }   // a 390 px wheel fits above a 150 px band
    const c = clampCamera({ x: CX, y: CY, scale: 1 }, phone)
    expect(c.x).toBe(CX)
    expect(c.y).toBeCloseTo(CY + 150 / (2 * pxPerUnit(phone)), 6)
  })
})

describe('spring', () => {
  it('is frame-rate independent: 60 steps of 1/60 land where 6 steps of 1/6 land (within 1%)', () => {
    const tgt = { x: 300, y: 300, scale: 2 }
    let a = restCamera(); for (let i = 0; i < 60; i++) a = springStep(a, tgt, 1 / 60)
    let b = restCamera(); for (let i = 0; i < 6; i++) b = springStep(b, tgt, 1 / 6)
    expect(Math.abs(a.x - b.x)).toBeLessThan(1)
    expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.02)
  })

  it('settles and snaps', () => {
    const tgt = { x: 250, y: 200, scale: 1.4 }
    let c = restCamera()
    for (let i = 0; i < 400 && !isSettled(c, tgt); i++) c = springStep(c, tgt, 1 / 60)
    expect(isSettled(c, tgt)).toBe(true)
    expect(springStep(c, tgt, 1 / 60)).toEqual(tgt)   // snapped exactly once settled
  })
})

describe('flyToNode', () => {
  it('centres on the sector centroid and lands at the desktop cap', () => {
    const fruity = NODES.find((n) => n.name === 'Fruity')!
    const c = flyToNode(fruity, vp, MAX_SCALE_DESKTOP)
    const mid = (fruity.a0 + fruity.a1) / 2
    const raw = { x: CX + Math.cos(mid) * (fruity.r0 + R3) / 2, y: CY + Math.sin(mid) * (fruity.r0 + R3) / 2, scale: MAX_SCALE_DESKTOP }
    const clamped = clampCamera(raw, vp)          // the viewport may not leave the disc
    expect(c.x).toBeCloseTo(clamped.x, 6); expect(c.y).toBeCloseTo(clamped.y, 6)
    expect(c.scale).toBe(MAX_SCALE_DESKTOP)
  })

  it('with a bottom inset, a bottom family flies up so its rim clears the tray (Daniel 2026-09-03)', () => {
    const big = { width: 1800, height: 1750, insetBottom: 250 }
    const green = NODES.find((n) => n.name === 'Green/Vegetative')!
    const mid = (green.a0 + green.a1) / 2
    const rim = { x: CX + Math.cos(mid) * R3, y: CY + Math.sin(mid) * R3 }
    const trayTop = big.height - big.insetBottom
    const lifted = flyToNode(green, big, MAX_SCALE_DESKTOP)
    expect(worldToScreen(rim.x, rim.y, lifted, big).y).toBeLessThanOrEqual(trayTop)
    // the same fly without the inset leaves that rim under the tray
    const plain = flyToNode(green, { width: big.width, height: big.height }, MAX_SCALE_DESKTOP)
    expect(worldToScreen(rim.x, rim.y, plain, big).y).toBeGreaterThan(trayTop)
  })

  it('the framing scale uses the visible height, so a tall tray on a short stage lands under the cap', () => {
    const laptop = { width: 1400, height: 700, insetBottom: 300 }
    const green = NODES.find((n) => n.name === 'Green/Vegetative')!
    const c = flyToNode(green, laptop, MAX_SCALE_DESKTOP)
    expect(c.scale).toBeGreaterThan(1); expect(c.scale).toBeLessThan(MAX_SCALE_DESKTOP)
    const mid = (green.a0 + green.a1) / 2
    const rimY = worldToScreen(CX + Math.cos(mid) * R3, CY + Math.sin(mid) * R3, c, laptop).y
    expect(rimY).toBeLessThanOrEqual(laptop.height - laptop.insetBottom)
  })

  it('on a phone frames a narrow family at ~80% of the viewport, within the mobile cap', () => {
    const phone = { width: 390, height: 600 }
    const nutty = NODES.find((n) => n.name === 'Nutty/Cocoa')!
    const c = flyToNode(nutty, phone, MAX_SCALE_MOBILE)
    expect(c.scale).toBeGreaterThan(1); expect(c.scale).toBeLessThanOrEqual(MAX_SCALE_MOBILE)
  })
})

describe('edgePanVelocity', () => {
  it('is zero inside the band, at scale ≤ 1.05, and under reduced motion', () => {
    expect(edgePanVelocity(500, 400, vp, 2, false)).toEqual({ vx: 0, vy: 0 })
    expect(edgePanVelocity(5, 400, vp, 1, false)).toEqual({ vx: 0, vy: 0 })
    expect(edgePanVelocity(5, 400, vp, 2, true)).toEqual({ vx: 0, vy: 0 })
  })

  it('ramps toward the edge, divides by scale, and clamps the corner magnitude', () => {
    const edge = edgePanVelocity(0, 400, vp, 2, false)
    expect(edge.vx).toBeCloseTo(-MAX_PAN_SPEED / 2, 3); expect(edge.vy).toBe(0)
    const half = edgePanVelocity(vp.width * 0.14 * 0.5, 400, vp, 2, false)
    expect(Math.abs(half.vx)).toBeLessThan(Math.abs(edge.vx)); expect(half.vx).toBeLessThan(0)
    const corner = edgePanVelocity(0, 0, vp, 2, false)
    expect(Math.hypot(corner.vx, corner.vy)).toBeCloseTo(MAX_PAN_SPEED / 2, 3)
  })

  it('with a bottom inset the bottom band sits above the tray; a pointer beside the tray saturates, never exceeds', () => {
    const v = { ...vp, insetBottom: 200 }   // visible height 600
    expect(edgePanVelocity(500, 600, v, 2, false).vy).toBeCloseTo(MAX_PAN_SPEED / 2, 3)
    expect(edgePanVelocity(500, 600, vp, 2, false)).toEqual({ vx: 0, vy: 0 })   // without the inset 600/800 is mid-stage
    expect(edgePanVelocity(500, 760, v, 2, false).vy).toBeCloseTo(MAX_PAN_SPEED / 2, 3)   // beside the tray card
  })
})
