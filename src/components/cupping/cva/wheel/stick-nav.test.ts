import { describe, it, expect } from 'vitest'
import { NODES, CX, CY, R0, R3 } from '@/lib/cva/flavor-wheel-data'
import { restCamera, pxPerUnit, worldToScreen, clampCamera, REST_SCALE_MOBILE, type Viewport } from './camera'
import {
  cursorSpeed, moveCursor, wedgeUnder, followPoint, followCamera, centroidOf,
  CURSOR_SPEED, FOLLOW_MARGIN,
} from './stick-nav'

const UP = { x: 0, y: -1 }
const byKey = (k: string) => NODES.find((n) => n.path.join('>') === k)!
const hub = { x: CX, y: CY }
const stick = (dir: { x: number; y: number }, m: number) => ({ ...dir, m })

describe('cursorSpeed — the further the thumb, the faster (Daniel 2026-09-09: "going back center slows down")', () => {
  it('is zero at the deadzone, the full speed at the rim, and climbs in between', () => {
    expect(cursorSpeed(0)).toBe(0)
    expect(cursorSpeed(1)).toBe(CURSOR_SPEED)
    const quarter = cursorSpeed(0.25 ** 2), half = cursorSpeed(0.5 ** 2)   // stickVector squares the deflection
    expect(quarter).toBeGreaterThan(0)
    expect(half).toBeGreaterThan(quarter)
    expect(half).toBeLessThan(CURSOR_SPEED)
    expect(half).toBeCloseTo(CURSOR_SPEED / 2, 6)   // linear in the thumb's deflection, not in its square
    expect(cursorSpeed(9)).toBe(CURSOR_SPEED)        // clamped
  })
})

describe('moveCursor — a point that keeps going the way the stick points', () => {
  it('advances by speed × dt in the pushed direction', () => {
    const next = moveCursor(hub, stick(UP, 1), 0.1)
    expect(next.x).toBeCloseTo(CX, 6)
    expect(next.y).toBeCloseTo(CY - CURSOR_SPEED * 0.1, 6)
  })
  it('stands still inside the deadzone', () => {
    expect(moveCursor(hub, stick(UP, 0), 0.1)).toEqual(hub)
  })
  it('never leaves the wheel: pushing straight out at the rim holds the rim', () => {
    const atRim = { x: CX, y: CY - (R3 - 0.5) }
    const next = moveCursor(atRim, stick(UP, 1), 0.5)
    expect(Math.hypot(next.x - CX, next.y - CY)).toBeLessThanOrEqual(R3)
    expect(next.y).toBeCloseTo(atRim.y, 6)
  })
  it('at the rim a sideways push slides the cursor round it — the circular motion', () => {
    const atRim = { x: CX, y: CY - (R3 - 0.5) }
    const next = moveCursor(atRim, stick({ x: 1, y: 0 }, 1), 0.2)
    expect(next.x).toBeGreaterThan(CX)
    expect(Math.hypot(next.x - CX, next.y - CY)).toBeLessThanOrEqual(R3)
    expect(Math.hypot(next.x - CX, next.y - CY)).toBeGreaterThan(R3 - 1)
  })
  it('passes through the hub to the far side of the wheel', () => {
    const above = { x: CX, y: CY - 30 }
    const next = moveCursor(above, stick({ x: 0, y: 1 }, 1), 0.5)   // 75 units down
    expect(next.y).toBeGreaterThan(CY + R0 - 30)
  })
})

describe('wedgeUnder — what the cursor is on', () => {
  it('a point in a family wedge names it; the hub names nothing', () => {
    expect(wedgeUnder(centroidOf(byKey('Floral')), null)).toBe('Floral')
    expect(wedgeUnder(hub, 'Floral')).toBeNull()
  })
  it('just past the rim (nothing there) keeps the wedge it came from — no flicker', () => {
    expect(wedgeUnder({ x: CX, y: CY - R3 - 2 }, 'Floral>Black Tea')).toBe('Floral>Black Tea')
  })
  it('a leaf is named at any ring', () => {
    expect(wedgeUnder(centroidOf(byKey('Fruity>Berry>Blueberry')), null)).toBe('Fruity>Berry>Blueberry')
  })
})

describe('followPoint — the view scrolls only when the cursor would leave the inner box', () => {
  const phone: Viewport = { width: 390, height: 604, insetBottom: 192 }
  it('a point already inside the inner box leaves the camera alone', () => {
    const cam = restCamera(true)
    expect(followPoint(centroidOf(byKey('Floral')), cam, phone)).toEqual(cam)
    expect(followCamera(byKey('Floral'), cam, phone)).toEqual(cam)
  })
  it('a point hidden under the tray band pulls the camera down, clamped like every other move', () => {
    const cam = restCamera(true)
    const pt = centroidOf(byKey('Other>Papery/Musty>Woody'))
    const next = followPoint(pt, cam, phone)
    expect(next.y).toBeGreaterThan(cam.y)
    const s = worldToScreen(pt.x, pt.y, next, phone)
    const visH = phone.height - phone.insetBottom!
    expect(s.y).toBeLessThanOrEqual(visH)
    expect(s.y).toBeGreaterThanOrEqual(0)
    expect(next).toEqual(clampCamera(next, phone))
  })
  it('the top rim pulls the camera up until the wheel box meets the screen top', () => {
    const cam = { x: CX, y: CY, scale: REST_SCALE_MOBILE }
    const k = pxPerUnit(phone) * cam.scale
    const next = followPoint({ x: CX, y: CY - R3 + 1 }, cam, phone)
    expect(next.y).toBeLessThan(cam.y)
    expect(next.y - (phone.height / 2) / k).toBeGreaterThanOrEqual(CY - 220 - 1e-6)
    expect(FOLLOW_MARGIN).toBeGreaterThan(0)
  })
})
