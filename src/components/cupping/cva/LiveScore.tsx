'use client'

import type { LiveScore as Live } from '@/lib/cva/scoring'

export function LiveScore({ live }: { live: Live }) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-border bg-background/80 px-4 py-2 backdrop-blur">
      <span className="text-2xl font-semibold tabular-nums text-foreground">
        {live.complete ? live.score.toFixed(2) : '—'}
      </span>
      <span className="text-xs text-muted-foreground">
        {live.complete ? 'CVA score' : `${live.count}/8 sections · Σ${live.sum}`}
      </span>
    </div>
  )
}
