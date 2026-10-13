import { describe, it, expect } from 'vitest'
import {
  alignOffsets, distributeOffsets, duplicateOffset, moveFootprintBy, onPlanOffset, turnFootprint, unionRect,
} from './arrange'

describe('unionRect', () => {
  it('is the box around every rectangle', () => {
    expect(unionRect([{ x: 0, y: 10, w: 100, d: 40 }, { x: 200, y: 0, w: 50, d: 20 }])).toEqual({ x: 0, y: 0, w: 250, d: 50 })
  })
})

describe('turnFootprint', () => {
  it('turns two shapes side by side into a column about their shared centre', () => {
    const a = { x: 0, y: 0, w: 100, d: 40 }
    const b = { x: 200, y: 0, w: 100, d: 40 }
    const c = { x: 150, y: 20 }
    expect(turnFootprint(a, c, 1)).toEqual({ x: 130, y: -130, w: 40, d: 100 })
    expect(turnFootprint(b, c, 1)).toEqual({ x: 130, y: 70, w: 40, d: 100 })
  })

  it('comes back after a turn each way', () => {
    const a = { x: 40, y: 60, w: 120, d: 40 }
    const c = { x: 300, y: 200 }
    expect(turnFootprint(turnFootprint(a, c, 1), c, -1)).toEqual(a)
  })
})

describe('onPlanOffset', () => {
  it('moves a set back onto the plan, and leaves one already on it', () => {
    expect(onPlanOffset({ x: 130, y: -130, w: 40, d: 300 })).toEqual({ dx: 0, dy: 130 })
    expect(onPlanOffset({ x: 9990, y: 0, w: 40, d: 40 })).toEqual({ dx: -30, dy: 0 })
    expect(onPlanOffset({ x: 10, y: 10, w: 40, d: 40 })).toEqual({ dx: 0, dy: 0 })
  })
})

describe('alignOffsets', () => {
  it('lines shapes up with the left edge; a locked one stays and anchors', () => {
    const fps = [{ x: 0, y: 0, w: 100, d: 40 }, { x: 50, y: 100, w: 80, d: 40 }]
    expect(alignOffsets(fps, [false, true], 'left')).toEqual([{ dx: 0, dy: 0 }, { dx: -50, dy: 0 }])
    expect(alignOffsets(fps, [true, true], 'bottom')).toEqual([{ dx: 0, dy: 100 }, { dx: 0, dy: 0 }])
  })
})

describe('distributeOffsets', () => {
  it('leaves equal gaps between the first and the last', () => {
    const fps = [{ x: 0, y: 0, w: 100, d: 40 }, { x: 500, y: 0, w: 100, d: 40 }, { x: 150, y: 0, w: 100, d: 40 }]
    expect(distributeOffsets(fps, [true, true, true], 'h')).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 100, dy: 0 }])
  })

  it('needs three shapes', () => {
    const fps = [{ x: 0, y: 0, w: 100, d: 40 }, { x: 500, y: 0, w: 100, d: 40 }]
    expect(distributeOffsets(fps, [true, true], 'h')).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }])
  })
})

describe('duplicateOffset', () => {
  it('puts copies to the right, or below when the right edge is near', () => {
    expect(duplicateOffset({ x: 0, y: 0, w: 300, d: 40 })).toEqual({ dx: 310, dy: 0 })
    expect(duplicateOffset({ x: 9800, y: 0, w: 150, d: 40 })).toEqual({ dx: 0, dy: 50 })
  })
})

describe('moveFootprintBy', () => {
  it('moves a turned shape by what it covers', () => {
    // 120 x 40 turned 90 covers 40 x 120 centred on it: stored x 50 covers from x 90.
    expect(moveFootprintBy({ x: 50, y: 50, w: 120, d: 40 }, 90, { dx: 10, dy: -20 })).toEqual({ x: 60, y: 30, w: 120, d: 40 })
  })
})
