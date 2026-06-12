'use client'

import type { ReactNode } from 'react'
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
  /** Injected by CvaJourney: a Describe button or the acidity/sweetness note field. */
  descriptorSlot?: ReactNode
}

export function SectionScreen({
  section, index, total, value, onChange, onCommit, intensity, onIntensityChange, descriptorSlot,
}: Props) {
  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[2.5px]" style={{ color: section.accent }}>
          Section {index} of {total}
        </span>
        <h2 className="text-[clamp(28px,5vw,46px)] font-extrabold leading-none tracking-tight">{section.label}</h2>
        <p className="max-w-[520px] text-sm font-medium text-muted-foreground">{section.hint}</p>
      </div>

      <ImpressionScale
        value={value?.impression}
        finalValue={value?.impression_final}
        accent={section.accent}
        onChange={(v) => onChange({ impression: v })}
        onChangeFinal={(v) => onChange({ impression_final: v })}
        onCommit={onCommit}
      />

      {onIntensityChange && (
        <div className="flex w-full max-w-[560px] flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
            Intensity (0–15)
          </span>
          <IntensityTrack value={intensity ?? 0} accent={section.accent} onChange={onIntensityChange} />
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
