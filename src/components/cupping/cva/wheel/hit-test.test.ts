import { describe, it, expect } from 'vitest'
import { NODES, CX, CY, R0, R3, nodeAt } from '@/lib/cva/flavor-wheel-data'
import { nodeAtScene, regionAtScene, normalizeAngle } from './hit-test'

describe('hit-test', () => {
  it('normalises any angle into the wheel range starting at −π/2', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(normalizeAngle(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI)
  })

  it('hub and outside are classified, never as a node', () => {
    expect(regionAtScene(CX, CY).kind).toBe('hub')
    expect(regionAtScene(CX + R0 - 1, CY).kind).toBe('hub')
    expect(regionAtScene(CX + R3 + 1, CY).kind).toBe('outside')
    expect(nodeAtScene(CX, CY)).toBeNull()
  })

  it('agrees with the brute-force linear search for 5,000 random points', () => {
    let seed = 42
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let i = 0; i < 5000; i++) {
      const x = rnd() * 440, y = rnd() * 440
      const a = nodeAtScene(x, y), b = nodeAt(x, y)
      expect(a?.path.join('>') ?? null, `(${x.toFixed(1)},${y.toFixed(1)})`).toBe(b?.path.join('>') ?? null)
    }
  })

  it('hits every node at its own centroid, including both sides of the seam', () => {
    for (const n of NODES) {
      const mid = (n.a0 + n.a1) / 2, r = (n.r0 + n.r1) / 2
      expect(nodeAtScene(CX + Math.cos(mid) * r, CY + Math.sin(mid) * r)?.path).toEqual(n.path)
    }
    // straight up is the seam: first family on one side, last on the other
    const first = NODES.find((n) => n.ring === 1)!, last = [...NODES].reverse().find((n) => n.ring === 1)!
    expect(nodeAtScene(CX + 0.01, CY - 80)?.name).toBe(first.name)
    expect(nodeAtScene(CX - 0.01, CY - 80)?.name).toBe(last.name)
  })
})
