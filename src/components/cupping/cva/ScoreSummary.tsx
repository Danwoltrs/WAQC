'use client'

import type { LiveScore } from '@/lib/cva/scoring'
import { CVA_SECTIONS } from '@/lib/cva/sections'
import { effectiveImpression } from '@/lib/cva/scoring'
import type { CvaAssessment } from '@/types/cva'

export function ScoreSummary({ assessment, live }: { assessment: CvaAssessment; live: LiveScore }) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="text-6xl font-semibold tabular-nums text-foreground">
          {live.complete ? live.score.toFixed(2) : '—'}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {live.complete ? 'SCA CVA cupping score' : `Score appears once all 8 sections are rated (${live.count}/8).`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CVA_SECTIONS.map((s) => {
          const v = effectiveImpression(assessment.sections[s.key])
          return (
            <div key={s.key} className="rounded-2xl border border-border p-4" style={{ borderColor: `${s.accent}55` }}>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-semibold tabular-nums text-foreground">{v ?? '—'}</div>
            </div>
          )
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        The full Coffee Profile (flavor path, AI highlights, whiskey-style label, certificate) arrives in Phase 5.
      </p>
    </div>
  )
}
