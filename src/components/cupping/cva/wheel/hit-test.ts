// Pointer → wheel node with no DOM involvement: radius picks the ring, a
// binary search over that ring's sorted start angles picks the node. O(log n),
// identical for mouse and touch, and safe to call on every pointer move.
import { NODES, CX, CY, R0, R3, type WheelNode } from '@/lib/cva/flavor-wheel-data'

const TAU = Math.PI * 2
const START = -Math.PI / 2

export type Region = { kind: 'hub' } | { kind: 'outside' } | { kind: 'node'; node: WheelNode }

/** Wrap into [START, START + 2π). */
export function normalizeAngle(theta: number): number {
  let t = theta
  while (t < START) t += TAU
  while (t >= START + TAU) t -= TAU
  return t
}

interface RingIndex { r0: number; r1: number; starts: number[]; nodes: WheelNode[] }

/**
 * One index per radial band. Ring 2.5 nodes (childless mids spanning rings
 * 2–3) are listed in BOTH the ring-2 and ring-3 bands so a radius test on
 * either band finds them.
 */
export const RING_INDEX: readonly RingIndex[] = (() => {
  const bands: Array<{ r0: number; r1: number; pick: (n: WheelNode) => boolean }> = [
    { r0: R0, r1: NODES.find((n) => n.ring === 1)!.r1, pick: (n) => n.ring === 1 },
    { r0: NODES.find((n) => n.ring === 2)!.r0, r1: NODES.find((n) => n.ring === 2)!.r1, pick: (n) => n.ring === 2 || n.ring === 2.5 },
    { r0: NODES.find((n) => n.ring === 3)!.r0, r1: R3, pick: (n) => n.ring === 3 || n.ring === 2.5 },
  ]
  return bands.map(({ r0, r1, pick }) => {
    const nodes = NODES.filter(pick).sort((a, b) => a.a0 - b.a0)
    return { r0, r1, starts: nodes.map((n) => n.a0), nodes }
  })
})()

function lowerBound(starts: number[], theta: number): number {
  // last index whose start <= theta
  let lo = 0, hi = starts.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= theta) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

export function regionAtScene(x: number, y: number): Region {
  const dx = x - CX, dy = y - CY
  const r = Math.hypot(dx, dy)
  if (r <= R0) return { kind: 'hub' }
  if (r >= R3) return { kind: 'outside' }
  const theta = normalizeAngle(Math.atan2(dy, dx))
  for (const band of RING_INDEX) {
    if (r < band.r0 || r >= band.r1) continue
    const i = lowerBound(band.starts, theta)
    if (i < 0) return { kind: 'outside' }
    const n = band.nodes[i]
    if (theta < n.a1) return { kind: 'node', node: n }
    return { kind: 'outside' }   // hairline gap between wedges
  }
  return { kind: 'outside' }
}

export function nodeAtScene(x: number, y: number): WheelNode | null {
  const reg = regionAtScene(x, y)
  return reg.kind === 'node' ? reg.node : null
}
