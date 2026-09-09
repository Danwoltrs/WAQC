import { describe, it, expect } from 'vitest'
import { NODES, CX, CY, R3 } from '@/lib/cva/flavor-wheel-data'
import { restCamera, pxPerUnit, worldToScreen, clampCamera, REST_SCALE_MOBILE, type Viewport } from './camera'
import { stepFocus, stickCandidates, followCamera, repeatMs, centroidOf, REPEAT_MIN_MS, REPEAT_MAX_MS, FOLLOW_MARGIN } from './stick-nav'

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, RIGHT = { x: 1, y: 0 }, LEFT = { x: -1, y: 0 }
const hub = { x: CX, y: CY }
const byKey = (k: string) => NODES.find((n) => n.path.join('>') === k)!
const key = (n: { path: string[] }) => n.path.join('>')

describe('stickCandidates — what the stick can land on', () => {
  it('with nothing framed: the nine families and nothing else', () => {
    const c = stickCandidates(null)
    expect(c).toHaveLength(9)
    expect(c.every((n) => n.ring === 1)).toBe(true)
  })
  it('inside a framed family: its own groups and leaves, plus every family ring wedge — never another family\'s leaves', () => {
    const c = stickCandidates('Fruity')
    expect(c.filter((n) => n.family === 'Fruity' && n.ring !== 1)).toHaveLength(NODES.filter((n) => n.family === 'Fruity' && n.ring !== 1).length)
    expect(c.filter((n) => n.ring === 1)).toHaveLength(9)
    expect(c.some((n) => n.family === 'Sweet' && n.ring === 3)).toBe(false)
  })
})

describe('stepFocus — the wedge in the direction the stick points', () => {
  it('from the hub at rest, up is Floral (the family whose centre is closest to straight up)', () => {
    expect(key(stepFocus(hub, null, UP, null)!)).toBe('Floral')
  })
  it('from Floral, right is Fruity and left is Sweet — its neighbours around the ring', () => {
    const floral = byKey('Floral')
    expect(key(stepFocus(centroidOf(floral), 'Floral', RIGHT, null)!)).toBe('Fruity')
    expect(key(stepFocus(centroidOf(floral), 'Floral', LEFT, null)!)).toBe('Sweet')
  })
  it('from the topmost family, up has nowhere to go', () => {
    expect(stepFocus(centroidOf(byKey('Floral')), 'Floral', UP, null)).toBeNull()
  })
  it('never returns the wedge it started on', () => {
    for (const n of stickCandidates(null)) {
      for (const d of [UP, DOWN, LEFT, RIGHT]) {
        const r = stepFocus(centroidOf(n), key(n), d, null)
        if (r) expect(key(r)).not.toBe(key(n))
      }
    }
  })
  it('inside Fruity, stepping outward from the family wedge reaches one of its own groups or leaves', () => {
    const fruity = byKey('Fruity')
    const c = centroidOf(fruity)
    const outward = { x: c.x - CX, y: c.y - CY }
    const m = Math.hypot(outward.x, outward.y)
    const r = stepFocus(c, 'Fruity', { x: outward.x / m, y: outward.y / m }, 'Fruity')!
    expect(r.family).toBe('Fruity')
    expect(r.ring).not.toBe(1)
  })
  it('the cone is wide enough that every family can be left in at least two directions', () => {
    for (const n of stickCandidates(null)) {
      const exits = [UP, DOWN, LEFT, RIGHT].filter((d) => stepFocus(centroidOf(n), key(n), d, null) != null)
      expect(exits.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('repeatMs — the tac-tac-tac gets faster the harder the stick is pushed', () => {
  it('runs from the slow rate at the deadzone edge to the fast rate at full deflection', () => {
    expect(repeatMs(0)).toBe(REPEAT_MAX_MS)
    expect(repeatMs(1)).toBe(REPEAT_MIN_MS)
    expect(repeatMs(0.5)).toBeGreaterThan(REPEAT_MIN_MS)
    expect(repeatMs(0.5)).toBeLessThan(REPEAT_MAX_MS)
    expect(repeatMs(7)).toBe(REPEAT_MIN_MS)   // clamped
  })
})

describe('followCamera — the view scrolls only when the highlight would leave the inner box', () => {
  const phone: Viewport = { width: 390, height: 604, insetBottom: 192 }
  it('a wedge already inside the inner box leaves the camera alone', () => {
    const cam = restCamera(true)
    const floral = byKey('Floral')   // r≈82 above the hub: 82·0.886·1.7 ≈ 124 px up from the centre — inside 302·(1−0.22)
    expect(followCamera(floral, cam, phone)).toEqual(cam)
  })
  it('a wedge hidden under the tray band pulls the camera down until it sits inside the visible region', () => {
    const cam = restCamera(true)
    const other = byKey('Other>Papery/Musty>Woody')   // bottom-left leaf, r≈185
    const next = followCamera(other, cam, phone)
    expect(next.y).toBeGreaterThan(cam.y)
    const s = worldToScreen(centroidOf(other).x, centroidOf(other).y, next, phone)
    // The wheel box clamps the follow before the leaf reaches the inner box, so
    // the guarantee is "on screen above the tray", not "inside the margin".
    const visH = phone.height - phone.insetBottom!
    expect(s.y).toBeLessThanOrEqual(visH)
    expect(s.y).toBeGreaterThanOrEqual(0)
    expect(next).toEqual(clampCamera(next, phone))
  })
  it('the follow never leaves the wheel box: it is clamped like every other camera move', () => {
    const cam = { x: CX, y: CY, scale: REST_SCALE_MOBILE }
    const k = pxPerUnit(phone) * cam.scale
    const top = byKey('Floral>Floral>Rose')
    const far = { ...cam, y: CY + 500 }
    const next = followCamera(top, far, phone)
    // visible top edge may not pass the box top (CY − 220)
    expect(next.y - (phone.height / 2) / k).toBeGreaterThanOrEqual(CY - 220 - 1e-6)
    expect(Math.abs(centroidOf(top).y) < R3 + CY).toBe(true)
  })
})
