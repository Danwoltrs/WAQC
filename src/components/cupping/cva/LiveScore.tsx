'use client'

import type { LiveScore as Live } from '@/lib/cva/scoring'
import { cvaBand } from '@/lib/cva/scoring'
import { SECTION_KEYS } from '@/lib/cva/sections'

/**
 * The pill in the journey header.
 *
 * Until all eight sections are rated it counts SECTIONS, never a score. The
 * number it used to print was the CVA formula applied to a partial sum — with
 * four of eight rated it read "69.75", which looks exactly like a grade and is
 * not one. There is no such thing as a partial CVA score: the formula maps a
 * complete Σ of eight impressions onto 0–100, so feeding it four of them
 * produces a number that will not resemble the final one (Daniel 2026-09-03).
 */
export function LiveScore({ live, onClick }: { live: Live; onClick?: () => void }) {
  const band = live.complete ? cvaBand(live.score) : null
  // Always starts with "Score" so the control identifies itself in both states —
  // it is the score pill whether or not there is a score to show yet.
  const label = live.complete
    ? `Score ${live.score.toFixed(2)} — ${band!.label}`
    : `Score — ${live.count} of ${SECTION_KEYS.length} sections rated`
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex items-baseline gap-2 rounded-[14px] border border-border bg-card px-[15px] py-[7px] transition-colors"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {live.complete ? 'Score' : 'Sections'}
      </span>
      <span
        className="text-[19px] font-extrabold tabular-nums"
        style={{ color: band ? band.color : undefined }}
      >
        {live.complete ? live.score.toFixed(2) : `${live.count} / ${SECTION_KEYS.length}`}
      </span>
    </button>
  )
}
