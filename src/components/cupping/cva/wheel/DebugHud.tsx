'use client'

// Dev-only frame-time overlay, shown when the page URL has ?debug=1. The wheel
// pushes one sample per rAF into a ref; this component samples that ref four
// times a second so the HUD itself costs nothing per frame.

import { useEffect, useState, type MutableRefObject } from 'react'

export interface FrameStats { p95: number; last: number; layouts: number; frames: number }

export function pushFrame(stats: FrameStats, ring: number[], ms: number): void {
  ring.push(ms)
  if (ring.length > 60) ring.shift()
  const sorted = [...ring].sort((a, b) => a - b)
  stats.p95 = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]
  stats.last = ms
  stats.frames++
}

export function DebugHud({ statsRef }: { statsRef: MutableRefObject<FrameStats> }) {
  const [snap, setSnap] = useState<FrameStats>({ p95: 0, last: 0, layouts: 0, frames: 0 })
  useEffect(() => {
    const id = setInterval(() => setSnap({ ...statsRef.current }), 250)
    return () => clearInterval(id)
  }, [statsRef])
  const bad = snap.p95 > 8
  return (
    <div className="wheel-hud" data-bad={bad ? '1' : '0'} aria-hidden>
      <div>p95 {snap.p95.toFixed(1)} ms</div>
      <div>last {snap.last.toFixed(1)} ms</div>
      <div>frames {snap.frames}</div>
    </div>
  )
}
