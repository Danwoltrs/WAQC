import { describe, it, expect } from 'vitest'
import {
  footprint, fromFootprint, moveRect, moveShape, outlineSegments, overlappingKeys, planBounds,
  rectFromDrag, rectsOverlap, resizeRect, rotateQuarter, snap,
} from './geometry'

const perimeter = (segs: Array<[number, number, number, number]>) =>
  segs.reduce((sum, [x1, y1, x2, y2]) => sum + Math.abs(x2 - x1) + Math.abs(y2 - y1), 0)

describe('snap', () => {
  it('rounds to the 10 cm grid unless free', () => {
    expect(snap(14)).toBe(10)
    expect(snap(15)).toBe(20)
    expect(snap(14.4, true)).toBe(14)
  })
})

describe('rotation', () => {
  it('swaps width and depth about the centre on a quarter turn', () => {
    expect(footprint({ x: 100, y: 100, w: 120, d: 40, rot: 90 })).toEqual({ x: 140, y: 60, w: 40, d: 120 })
    expect(footprint({ x: 100, y: 100, w: 120, d: 40, rot: 180 })).toEqual({ x: 100, y: 100, w: 120, d: 40 })
  })

  it('round-trips a footprint back to the stored rectangle', () => {
    const r = { x: 100, y: 100, w: 120, d: 40 }
    expect(fromFootprint(footprint({ ...r, rot: 270 }), 270)).toEqual(r)
  })

  it('cycles 0, 90, 180, 270', () => {
    expect(rotateQuarter(270)).toBe(0)
    expect(rotateQuarter(90)).toBe(180)
  })
})

describe('move, resize, draw', () => {
  it('moves onto the grid, past zero too: the plan has no edge there', () => {
    expect(moveRect({ x: 100, y: 100, w: 50, d: 50 }, 13, -200)).toEqual({ x: 110, y: -100, w: 50, d: 50 })
  })

  it('moves the dragged edge and keeps the minimum size', () => {
    expect(resizeRect({ x: 0, y: 0, w: 100, d: 50 }, 'e', 143, 0)).toEqual({ x: 0, y: 0, w: 140, d: 50 })
    expect(resizeRect({ x: 0, y: 0, w: 100, d: 50 }, 'w', 95, 0)).toEqual({ x: 80, y: 0, w: 20, d: 50 })
    expect(resizeRect({ x: 0, y: 0, w: 100, d: 50 }, 'w', -38, 0)).toEqual({ x: -40, y: 0, w: 140, d: 50 })
    expect(resizeRect({ x: 100, y: 100, w: 100, d: 50 }, 'nw', 52, 61)).toEqual({ x: 50, y: 60, w: 150, d: 90 })
  })

  it('lengthens a shelf turned 90 degrees when its bottom handle is dragged', () => {
    const stored = { x: 100, y: 100, w: 120, d: 40 }
    const fp = footprint({ ...stored, rot: 90 })              // { x: 140, y: 60, w: 40, d: 120 }
    const next = fromFootprint(resizeRect(fp, 's', 0, 200), 90)
    expect(next).toEqual({ x: 90, y: 110, w: 140, d: 40 })
  })

  it('draws a rectangle from any two corners, at least 20 cm', () => {
    expect(rectFromDrag(37, 12, 3, 88)).toEqual({ x: 0, y: 10, w: 40, d: 80 })
    expect(rectFromDrag(5, 5, 8, 8)).toEqual({ x: 10, y: 10, w: 20, d: 20 })
    expect(rectFromDrag(37, 12, -23, 88)).toEqual({ x: -20, y: 10, w: 60, d: 80 })
  })
})

describe('overlap', () => {
  it('does not count touching edges', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 100, d: 50 }, { x: 100, y: 0, w: 50, d: 50 })).toBe(false)
    expect(rectsOverlap({ x: 0, y: 0, w: 100, d: 50 }, { x: 99, y: 0, w: 50, d: 50 })).toBe(true)
  })

  it('names every shape that overlaps another', () => {
    const keys = overlappingKeys([
      { key: 'a', rect: { x: 0, y: 0, w: 100, d: 50 } },
      { key: 'b', rect: { x: 50, y: 0, w: 100, d: 50 } },
      { key: 'c', rect: { x: 500, y: 0, w: 100, d: 50 } },
    ])
    expect([...keys].sort()).toEqual(['a', 'b'])
  })
})

describe('outlineSegments', () => {
  it('outlines one rectangle', () => {
    expect(perimeter(outlineSegments([{ x: 0, y: 0, w: 100, d: 50 }]))).toBe(300)
  })

  it('outlines an L-shaped room built from two rectangles without the shared wall', () => {
    const segs = outlineSegments([{ x: 0, y: 0, w: 200, d: 100 }, { x: 0, y: 100, w: 100, d: 100 }])
    expect(perimeter(segs)).toBe(800)
  })

  it('ignores an exact duplicate', () => {
    const r = { x: 0, y: 0, w: 100, d: 50 }
    expect(perimeter(outlineSegments([r, r]))).toBe(300)
  })
})

describe('planBounds', () => {
  it('falls back to a 10 x 7 m sheet when empty and pads real shapes', () => {
    expect(planBounds([])).toEqual({ x: 0, y: 0, w: 1000, d: 700 })
    expect(planBounds([{ x: 100, y: 100, w: 3000, d: 2000 }])).toEqual({ x: 50, y: 50, w: 3100, d: 2100 })
    expect(planBounds([{ x: 100, y: 100, w: 300, d: 200 }], 0)).toEqual({ x: 100, y: 100, w: 300, d: 200 })
  })
})

describe('moveShape', () => {
  it('lets a shelf turned 90 degrees reach the left wall', () => {
    const stored = { x: 100, y: 100, w: 120, d: 40 }          // covers x 140..180
    expect(moveShape(stored, 90, -140, 0)).toEqual({ x: -40, y: 100, w: 120, d: 40 })
    expect(footprint({ ...moveShape(stored, 90, -140, 0), rot: 90 }).x).toBe(0)
  })

  it('snaps what is drawn to the grid', () => {
    expect(footprint({ ...moveShape({ x: 100, y: 100, w: 120, d: 40 }, 90, 13, 0), rot: 90 }).x).toBe(150)
  })
})

describe('fromFootprint with an odd width-depth difference', () => {
  it('is the exact inverse of footprint, turned either way', () => {
    for (const r of [{ x: 100, y: 100, w: 125, d: 40 }, { x: 100, y: 100, w: 40, d: 125 }, { x: 7, y: 9, w: 121, d: 40 }]) {
      for (const rot of [90, 270] as const) {
        expect(fromFootprint(footprint({ ...r, rot }), rot)).toEqual(r)
      }
    }
  })
})
