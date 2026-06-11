'use client'

import type { LiveScore as Live } from '@/lib/cva/scoring'
import { cvaBand } from '@/lib/cva/scoring'

export function LiveScore({ live, onClick }: { live: Live; onClick?: () => void }) {
  const band = live.complete ? cvaBand(live.score) : null
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-baseline gap-2 rounded-[14px] border border-border bg-card px-[15px] py-[7px] transition-colors"
      title={live.complete ? band!.label : `${live.count}/8 sections rated`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Score so far</span>
      <span
        className="text-[19px] font-extrabold tabular-nums"
        style={{ color: band ? band.color : undefined }}
      >
        {live.count > 0 ? live.score.toFixed(2) : '—'}
      </span>
    </button>
  )
}
