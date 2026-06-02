'use client'

import { useMemo, useState } from 'react'
import { CVA_SECTIONS } from '@/lib/cva/sections'
import { computeAssessmentScore, effectiveImpression } from '@/lib/cva/scoring'
import { useCvaAssessment } from '@/hooks/useCvaAssessment'
import { ProgressPath } from './ProgressPath'
import { RoastStep } from './RoastStep'
import { SectionScreen } from './SectionScreen'
import { ScoreSummary } from './ScoreSummary'
import { LiveScore } from './LiveScore'

const NEUTRAL = '#9ca3af'

export function CvaJourney({ sessionId }: { sessionId: string }) {
  const { assessment, sample, ready, saving, savedAt, setSectionValue, setRoast } = useCvaAssessment(sessionId)
  const [step, setStep] = useState(0)

  const live = useMemo(() => computeAssessmentScore(assessment), [assessment])

  // Steps: 0 = roast, 1..8 = sections, 9 = score.
  const steps = useMemo(() => {
    const sectionSteps = CVA_SECTIONS.map((s) => ({
      key: s.key,
      label: s.label,
      accent: s.accent,
      done: effectiveImpression(assessment.sections[s.key]) != null,
    }))
    return [
      { key: 'roast', label: 'Roast', accent: NEUTRAL, done: !!assessment.roast.level },
      ...sectionSteps,
      { key: 'score', label: 'Score', accent: '#151618', done: live.complete },
    ]
  }, [assessment, live.complete])

  const accent = steps[step]?.accent ?? NEUTRAL
  const last = steps.length - 1

  if (!ready) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ ['--cva-accent' as any]: accent }}>
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{sample?.tracking_number ?? 'CVA cupping'}</div>
            <div className="text-xs text-muted-foreground">
              {saving ? 'Saving…' : savedAt ? 'Saved' : 'Specialty · SCA CVA 2024'}
            </div>
          </div>
          <LiveScore live={live} />
        </div>
        <div className="mx-auto max-w-3xl">
          <ProgressPath steps={steps} current={step} onJump={setStep} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {step === 0 && <RoastStep roast={assessment.roast} onChange={setRoast} />}
        {step >= 1 && step <= 8 && (() => {
          const section = CVA_SECTIONS[step - 1]
          return (
            <SectionScreen
              key={section.key}
              section={section}
              value={assessment.sections[section.key]}
              onChange={(patch) => setSectionValue(section.key, patch)}
              onCommit={() => { if (step < last) setStep(step + 1) }}
            />
          )
        })()}
        {step === 9 && <ScoreSummary assessment={assessment} live={live} />}
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-full border border-border px-5 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            disabled={step === last}
            onClick={() => setStep((s) => Math.min(last, s + 1))}
            className="rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: accent }}
          >
            Next
          </button>
        </div>
      </footer>
    </div>
  )
}
