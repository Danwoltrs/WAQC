'use client'

import { useState, type ReactNode } from 'react'
import type { CvaSectionDef } from '@/lib/cva/sections'
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
  onCommit?: (v: number) => void
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
  section, index, total, value, onChange, onCommit, intensity, onIntensityChange, intensityFinal, onIntensityFinalChange, descriptorSlot,
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
  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[2.5px]" style={{ color: section.accent }}>
          Section {index} of {total} · Affective Impression
        </span>
        <h2 className="text-[clamp(30px,5.5vw,52px)] font-extrabold leading-none tracking-tight" style={{ color: section.accent }}>
          {section.label}
        </h2>
        <p className="max-w-[560px] text-[15px] font-medium text-muted-foreground">{section.hint}</p>
      </div>

      <ImpressionScale
        value={value?.impression}
        finalValue={value?.impression_final}
        accent={section.accent}
        onChange={(v) => onChange({ impression: v })}
        onChangeFinal={(v) => onChange({ impression_final: v })}
        onCommit={onCommit}
        cooling={cooling}
        onCoolingChange={onCoolingChange}
      />

      {onIntensityChange && (
        <div className="flex w-full max-w-[560px] flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
            Intensity (0–15)
          </span>
          <IntensityTrack
            value={intensity ?? 0}
            accent={section.accent}
            onChange={onIntensityChange}
            cooling={cooling}
            finalValue={intensityFinal}
            onChangeFinal={onIntensityFinalChange}
          />
        </div>
      )}

      {descriptorSlot}

      <textarea
        value={value?.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Affective note (optional) — a short justification for the score."
        className="min-h-16 w-full max-w-[560px] rounded-2xl border border-border bg-card p-4 text-sm outline-none focus:border-[var(--cva-accent)]"
      />
    </div>
  )
}
