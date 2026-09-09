'use client'

// One affective section, on one phone screen (Daniel 2026-09-09: "fit it all on
// the screen without scrolling down"). Title, the live readout, the nine-point
// row, the intensity track, the Describe button, the note — nothing below the
// fold on a 390 × ~700 viewport. Desktop keeps the roomier spacing.
//
// The readout — the number and what it means — takes the hint's place under
// the title as soon as there is a value and follows a drag live ("as a center
// display … where we see the text below Fragrance"). The hint is only for a
// section not yet rated.

import { useState, type ReactNode } from 'react'
import type { CvaSectionDef } from '@/lib/cva/sections'
import { IMPRESSION_COLORS, IMPRESSION_LABELS } from '@/lib/cva/sections'
import type { CvaSectionScore } from '@/types/cva'
import { ImpressionScale } from './ImpressionScale'
import { IntensityTrack } from './IntensityTrack'

interface Props {
  section: CvaSectionDef
  /** 1-based position in the 8-section journey. */
  index: number
  total: number
  value: CvaSectionScore | undefined
  onChange: (patch: Partial<CvaSectionScore>) => void
  /** Descriptive intensity 0–15 (SCA-103). Omit both to hide (Overall has none). */
  intensity?: number
  onIntensityChange?: (v: number) => void
  /** The cooled second mark on the intensity track (SCA-103 §6.2). */
  intensityFinal?: number
  onIntensityFinalChange?: (v: number | undefined) => void
  /** Injected by CvaJourney: a Describe button or the acidity/sweetness note field. */
  descriptorSlot?: ReactNode
}

export function SectionScreen({
  section, index, total, value, onChange, intensity, onIntensityChange, intensityFinal, onIntensityFinalChange, descriptorSlot,
}: Props) {
  // ONE Cooled toggle per section (locked decision 5). It lives on the
  // impression row and arms BOTH scales: the next impression is the final, the
  // next intensity is the second mark. Disarming clears both second marks; the
  // originals are never touched (SCA-103 §6.2, SCA-104 §5.2).
  const [cooling, setCooling] = useState(value?.impression_final != null || intensityFinal != null)
  const onCoolingChange = (next: boolean) => {
    setCooling(next)
    if (!next) onIntensityFinalChange?.(undefined)
  }

  const initial = value?.impression
  const final = value?.impression_final
  const shown = cooling && final != null ? final : initial
  const shifted = initial != null && final != null && final !== initial

  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-3 sm:gap-5">
      <div className="flex flex-col items-center gap-1 text-center sm:gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[2px] sm:text-[11px] sm:tracking-[2.5px]" style={{ color: section.accent }}>
          Section {index} of {total} · Affective Impression
        </span>
        <h2 className="text-[clamp(26px,5.5vw,52px)] font-extrabold leading-none tracking-tight" style={{ color: section.accent }}>
          {section.label}
        </h2>
        {/* the readout's slot: fixed height so the row below never jumps as it appears */}
        <div role="status" aria-live="polite" className="flex min-h-[34px] items-center justify-center sm:min-h-[40px]">
          {shown != null ? (
            <span
              data-testid="impression-readout"
              className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-card px-3.5 py-1.5 text-[14px] font-bold sm:text-[15px]"
            >
              <span className="h-3.5 w-3.5 shrink-0 rounded-md" style={{ background: IMPRESSION_COLORS[shown - 1] }} aria-hidden />
              {shifted && cooling ? `${initial} → ${final}` : shown} · {IMPRESSION_LABELS[shown - 1]}
            </span>
          ) : (
            <p className="max-w-[560px] text-[13px] font-medium leading-snug text-muted-foreground sm:text-[15px]">{section.hint}</p>
          )}
        </div>
      </div>

      <ImpressionScale
        value={initial}
        finalValue={final}
        accent={section.accent}
        onChange={(v) => onChange({ impression: v })}
        onChangeFinal={(v) => onChange({ impression_final: v })}
        cooling={cooling}
        onCoolingChange={onCoolingChange}
      />

      {onIntensityChange && (
        <IntensityTrack
          value={intensity ?? 0}
          accent={section.accent}
          onChange={onIntensityChange}
          cooling={cooling}
          finalValue={intensityFinal}
          onChangeFinal={onIntensityFinalChange}
          label={
            <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
              Intensity (0–15)
            </span>
          }
        />
      )}

      {descriptorSlot}

      <textarea
        value={value?.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
        rows={1}
        placeholder="Affective note (optional) — a short justification for the score."
        className="min-h-[44px] w-full max-w-[560px] rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-[var(--cva-accent)] sm:min-h-16 sm:p-4"
      />
    </div>
  )
}
