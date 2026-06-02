'use client'

import type { CvaSectionDef } from '@/lib/cva/sections'
import type { CvaSectionScore } from '@/types/cva'
import { ImpressionScale } from './ImpressionScale'

interface Props {
  section: CvaSectionDef
  value: CvaSectionScore | undefined
  onChange: (patch: Partial<CvaSectionScore>) => void
  onCommit?: (v: number) => void
}

export function SectionScreen({ section, value, onChange, onCommit }: Props) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: section.accent }} />
        <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
      </div>
      <ImpressionScale
        value={value?.impression}
        finalValue={value?.impression_final}
        accent={section.accent}
        onChange={(v) => onChange({ impression: v })}
        onChangeFinal={(v) => onChange({ impression_final: v })}
        onCommit={onCommit}
      />
      <textarea
        value={value?.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Affective note (optional) — a short justification for the score."
        className="min-h-20 w-full rounded-2xl border border-border bg-background p-4 text-sm"
      />
    </div>
  )
}
