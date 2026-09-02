// Touch gestures as a pure state machine. The component feeds pointer events
// in and calls tick() from its rAF loop while a press is pending; the machine
// never owns a timer, so it is deterministic and unit-testable.
export const LONG_PRESS_MS = 260
export const LONG_PRESS_SLOP_PX = 10
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_SLOP_PX = 24
export const SWIPE_DOWN_BAND_PX = 48
export const SWIPE_DOWN_MIN_PX = 80

export type Pt = { id: number; x: number; y: number }
export type GestureEvent = { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number; t: number }
export type GestureAction =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'double-tap'; x: number; y: number }
  | { kind: 'long-press'; x: number; y: number }
  | { kind: 'pinch'; cx: number; cy: number; factor: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'swipe-down' }
  | { kind: 'press-progress'; x: number; y: number; p: number }
  | { kind: 'press-cancel' }

export class GestureMachine {
  private pts = new Map<number, Pt>()
  private start: { x: number; y: number; t: number } | null = null
  private pressPending = false
  private fired = false        // long-press already emitted for this touch
  private moved = false        // slop exceeded → this touch cannot end as a tap
  private multi = false        // a second finger joined at some point
  private lastTap: { x: number; y: number; t: number } | null = null
  private lastPinchDist = 0
  private lastMid: { x: number; y: number } | null = null

  constructor(private now: () => number) {}

  reset(): void {
    this.pts.clear(); this.start = null; this.pressPending = false; this.fired = false
    this.moved = false; this.multi = false; this.lastPinchDist = 0; this.lastMid = null; this.lastTap = null
  }

  private mid(): { x: number; y: number; d: number } {
    const [a, b] = [...this.pts.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }
  }

  feed(e: GestureEvent): GestureAction[] {
    const out: GestureAction[] = []
    if (e.type === 'down') {
      this.pts.set(e.id, { id: e.id, x: e.x, y: e.y })
      if (this.pts.size === 1) {
        this.start = { x: e.x, y: e.y, t: e.t }
        this.pressPending = true; this.fired = false; this.moved = false; this.multi = false
      } else if (this.pts.size === 2) {
        this.multi = true
        if (this.pressPending) { this.pressPending = false; out.push({ kind: 'press-cancel' }) }
        const m = this.mid(); this.lastPinchDist = m.d; this.lastMid = { x: m.x, y: m.y }
      }
      return out
    }
    if (e.type === 'move') {
      const p = this.pts.get(e.id)
      if (!p) return out
      p.x = e.x; p.y = e.y
      if (this.pts.size >= 2 && this.lastMid) {
        const m = this.mid()
        if (this.lastPinchDist > 0 && m.d > 0) out.push({ kind: 'pinch', cx: m.x, cy: m.y, factor: m.d / this.lastPinchDist })
        out.push({ kind: 'pan', dx: m.x - this.lastMid.x, dy: m.y - this.lastMid.y })
        this.lastPinchDist = m.d; this.lastMid = { x: m.x, y: m.y }
        return out
      }
      if (this.start && !this.moved && Math.hypot(e.x - this.start.x, e.y - this.start.y) > LONG_PRESS_SLOP_PX) {
        this.moved = true
        if (this.pressPending) { this.pressPending = false; out.push({ kind: 'press-cancel' }) }
        this.lastMid = { x: this.start.x, y: this.start.y }
      }
      if (this.moved && this.lastMid && !this.fired) {
        out.push({ kind: 'pan', dx: e.x - this.lastMid.x, dy: e.y - this.lastMid.y })
        this.lastMid = { x: e.x, y: e.y }
      }
      return out
    }
    // up / cancel
    const wasPending = this.pressPending
    this.pressPending = false
    this.pts.delete(e.id)
    if (this.pts.size === 1) {
      // 2→1 finger transition: reseed from survivor for pan continuation
      const s = [...this.pts.values()][0]
      this.start = { x: s.x, y: s.y, t: e.t }
      this.lastMid = { x: s.x, y: s.y }
      this.moved = true
      this.pressPending = false
      this.lastPinchDist = 0
      if (wasPending) out.push({ kind: 'press-cancel' })
      return out
    }
    if (e.type === 'cancel') {
      if (wasPending) out.push({ kind: 'press-cancel' })
      if (this.pts.size === 0) this.reset()
      return out
    }
    if (this.pts.size > 0) return out          // other finger still down
    const s = this.start
    this.start = null
    if (!s || this.multi || this.fired) { this.multi = false; return out }
    if (this.moved) {
      if (s.y <= SWIPE_DOWN_BAND_PX && e.y - s.y >= SWIPE_DOWN_MIN_PX && Math.abs(e.x - s.x) < e.y - s.y) out.push({ kind: 'swipe-down' })
      return out
    }
    const lt = this.lastTap
    if (lt && e.t - lt.t <= DOUBLE_TAP_MS && Math.hypot(e.x - lt.x, e.y - lt.y) <= DOUBLE_TAP_SLOP_PX) {
      this.lastTap = null
      out.push({ kind: 'double-tap', x: e.x, y: e.y })
    } else {
      this.lastTap = { x: e.x, y: e.y, t: e.t }
      out.push({ kind: 'tap', x: e.x, y: e.y })
    }
    return out
  }

  /** Called every frame while a press is pending. Emits progress, then the long-press. */
  tick(t: number): GestureAction[] {
    if (!this.pressPending || !this.start) return []
    const p = Math.min(1, (t - this.start.t) / LONG_PRESS_MS)
    if (p >= 1) {
      this.pressPending = false; this.fired = true
      return [{ kind: 'long-press', x: this.start.x, y: this.start.y }]
    }
    return [{ kind: 'press-progress', x: this.start.x, y: this.start.y, p }]
  }
}
