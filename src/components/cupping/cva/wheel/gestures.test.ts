import { describe, it, expect } from 'vitest'
import { GestureMachine, LONG_PRESS_MS, DOUBLE_TAP_MS } from './gestures'

const ev = (type: 'down' | 'move' | 'up' | 'cancel', id: number, x: number, y: number, t: number) => ({ type, id, x, y, t })

describe('GestureMachine', () => {
  it('a quick press and release is a tap', () => {
    const m = new GestureMachine(() => 0)
    expect(m.feed(ev('down', 1, 100, 100, 0))).toEqual([])
    const out = m.feed(ev('up', 1, 102, 101, 80))
    expect(out).toEqual([{ kind: 'tap', x: 102, y: 101 }])
  })

  it('two taps within 300 ms and 24 px are a double-tap, not two taps', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 100, 100, 0)); m.feed(ev('up', 1, 100, 100, 50))
    m.feed(ev('down', 2, 105, 103, 200))
    const out = m.feed(ev('up', 2, 105, 103, 250))
    expect(out).toEqual([{ kind: 'double-tap', x: 105, y: 103 }])
  })

  it('holding still fires long-press at 260 ms with progress ticks before it, and no tap after', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 50, 60, 0))
    expect(m.tick(130)).toEqual([{ kind: 'press-progress', x: 50, y: 60, p: 0.5 }])
    expect(m.tick(LONG_PRESS_MS)).toEqual([{ kind: 'long-press', x: 50, y: 60 }])
    expect(m.feed(ev('up', 1, 50, 60, 400))).toEqual([])
  })

  it('moving more than 10 px cancels the press into a pan', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 50, 60, 0))
    m.tick(100)
    const out = m.feed(ev('move', 1, 70, 60, 120))
    expect(out[0]).toEqual({ kind: 'press-cancel' })
    expect(out[1]).toEqual({ kind: 'pan', dx: 20, dy: 0 })
    expect(m.tick(LONG_PRESS_MS + 10)).toEqual([])
  })

  it('two fingers pinch around their midpoint and pan by the midpoint delta', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 100, 100, 0)); m.feed(ev('down', 2, 200, 100, 5))
    const out = m.feed(ev('move', 2, 300, 100, 30))   // distance 100 → 200
    expect(out.find((a) => a.kind === 'pinch')).toEqual({ kind: 'pinch', cx: 200, cy: 100, factor: 2 })
    expect(out.find((a) => a.kind === 'pan')).toEqual({ kind: 'pan', dx: 50, dy: 0 })
    expect(m.feed(ev('up', 1, 100, 100, 60))).toEqual([])   // lifting after a pinch is never a tap
    expect(m.feed(ev('up', 2, 300, 100, 70))).toEqual([])
  })

  it('a swipe down that starts in the top band closes', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 200, 20, 0))
    m.feed(ev('move', 1, 200, 60, 40))
    const out = m.feed(ev('up', 1, 205, 140, 120))
    expect(out).toEqual([{ kind: 'swipe-down' }])
  })

  it('cancel clears everything', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 10, 10, 0))
    expect(m.feed(ev('cancel', 1, 10, 10, 10))).toEqual([{ kind: 'press-cancel' }])
    expect(m.tick(LONG_PRESS_MS)).toEqual([])
  })
})
