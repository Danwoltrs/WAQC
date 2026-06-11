'use client'

import { useMemo } from 'react'
import { CVA_SECTIONS } from '@/lib/cva/sections'
import { cvaBand, effectiveImpression } from '@/lib/cva/scoring'
import { useCvaSession, type CvaSampleMeta } from '@/hooks/useCvaSession'
import type { LiveScore } from '@/lib/cva/scoring'
import { ProgressPath } from './ProgressPath'
import { RoastStep } from './RoastStep'
import { SectionScreen } from './SectionScreen'
import { ScoreSummary } from './ScoreSummary'
import { LiveScore as LiveScorePill } from './LiveScore'

const ROAST_ACCENT = '#6d6f54'
const SCORE_ACCENT = '#151618'

type TabStatus = 'none' | 'in-progress' | 'pass' | 'fail'

const TAB_BG: Record<TabStatus, { active: string; inactive: string }> = {
  none: { active: 'bg-muted/60', inactive: '' },
  'in-progress': { active: 'bg-yellow-500/30', inactive: 'bg-yellow-500/15' },
  pass: { active: 'bg-green-500/30', inactive: 'bg-green-500/15' },
  fail: { active: 'bg-red-500/30', inactive: 'bg-red-500/15' },
}

function tabStatus(meta: CvaSampleMeta, live: LiveScore): TabStatus {
  if (live.count === 0) return 'none'
  if (!live.complete) return 'in-progress'
  if (meta.min_score == null) return 'pass'
  return live.score >= meta.min_score ? 'pass' : 'fail'
}

export function CvaJourney({ sessionId }: { sessionId: string }) {
  const session = useCvaSession(sessionId)
  const { samples, ready, activeId, setActive, assessment, step, setStep, setSectionValue, setRoast, saving, savedAt, scoreOf } = session

  const live = useMemo(() => scoreOf(activeId), [scoreOf, activeId])

  const steps = useMemo(() => {
    const sectionSteps = CVA_SECTIONS.map((s) => ({
      key: s.key,
      label: s.label,
      accent: s.accent,
      done: effectiveImpression(assessment.sections[s.key]) != null,
    }))
    return [
      { key: 'roast', label: 'Roast', accent: ROAST_ACCENT, done: !!assessment.roast.level },
      ...sectionSteps,
      { key: 'score', label: 'Score', accent: SCORE_ACCENT, done: live.complete },
    ]
  }, [assessment, live.complete])

  const last = steps.length - 1
  const activeMeta = samples.find((s) => s.id === activeId)

  const accent = useMemo(() => {
    if (step === 0) return ROAST_ACCENT
    if (step >= 1 && step <= 8) return CVA_SECTIONS[step - 1].accent
    return live.complete ? cvaBand(live.score).color : SCORE_ACCENT
  }, [step, live.complete, live.score])

  const nextLabel = step === 0 ? 'Begin tasting' : step === 8 ? 'Reveal score' : 'Next'

  if (!ready) {
    return <div className="flex h-[100dvh] items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div
      className="cva-root relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground"
      style={{ ['--cva-accent' as string]: accent }}
    >
      <div className="cva-bleed" />

      {samples.length > 1 && (
        <div className="relative z-10 flex overflow-x-auto border-b border-border sample-tabs-scroll">
          {samples.map((s, i) => {
            const st = tabStatus(s, scoreOf(s.id))
            const isActive = s.id === activeId
            const bg = isActive ? TAB_BG[st].active : TAB_BG[st].inactive
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={`flex shrink-0 items-center gap-2 border-r border-border px-5 py-2.5 text-left transition-colors ${bg} ${
                  isActive ? '' : 'hover:bg-accent/40'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      st === 'pass' ? '#22c55e' : st === 'fail' ? '#ef4444' : st === 'in-progress' ? '#eab308' : 'var(--cva-hair)',
                  }}
                />
                <span className={`text-[13px] ${isActive ? 'font-bold' : 'font-medium text-muted-foreground'}`}>
                  {s.tracking_number}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <header className="relative z-10 flex flex-wrap items-center gap-3.5 border-b border-border px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-sm font-extrabold text-white"
            style={{ background: 'linear-gradient(135deg,#556b2f,#a9a454)', boxShadow: '0 2px 8px rgba(85,107,47,.4)' }}
          >
            W
          </span>
          <span className="leading-tight">
            <b className="block text-sm font-bold tracking-tight">Specialty CVA</b>
            <small className="block text-[10.5px] font-semibold uppercase tracking-[1.4px] text-muted-foreground">
              SCA 2024 Value Assessment
            </small>
          </span>
        </div>
        <div className="min-w-[120px] flex-1 truncate text-[12.5px] font-medium text-muted-foreground">
          <b className="font-semibold text-foreground">{activeMeta?.tracking_number ?? 'CVA cupping'}</b>
          {' · '}
          {saving ? 'Saving…' : savedAt ? 'Saved' : 'Specialty · SCA CVA 2024'}
        </div>
        <div className="ml-auto">
          <LiveScorePill live={live} onClick={() => setStep(last)} />
        </div>
      </header>

      <div className="relative z-10 border-b border-border px-6">
        <ProgressPath steps={steps} current={step} onJump={setStep} />
      </div>

      <main className="relative z-[2] flex flex-1 flex-col overflow-y-auto">
        <div className="m-auto flex w-full justify-center px-6 py-6">
          {step === 0 && <RoastStep roast={assessment.roast} onChange={setRoast} />}
          {step >= 1 && step <= 8 && (() => {
            const section = CVA_SECTIONS[step - 1]
            return (
              <SectionScreen
                key={`${activeId}:${section.key}`}
                section={section}
                index={step}
                total={8}
                value={assessment.sections[section.key]}
                onChange={(patch) => setSectionValue(section.key, patch)}
                onCommit={() => { if (step < last) setStep(step + 1) }}
              />
            )
          })()}
          {step === 9 && (
            <ScoreSummary
              assessment={assessment}
              live={live}
              subtitle={activeMeta?.tracking_number}
              onJump={(s) => setStep(s)}
            />
          )}
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between gap-3 border-t border-border px-6 py-3.5">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep(Math.max(0, step - 1))}
          className="inline-flex items-center gap-2 rounded-[16px] border border-border px-6 py-3 text-sm font-bold text-muted-foreground transition disabled:pointer-events-none disabled:opacity-35"
        >
          Back
        </button>
        <p className="hidden flex-1 text-center text-[11.5px] font-medium text-muted-foreground sm:block">
          Tap a block or type 1–9. Your score saves automatically.
        </p>
        <button
          type="button"
          disabled={step === last}
          onClick={() => setStep(Math.min(last, step + 1))}
          className="inline-flex items-center gap-2 rounded-[16px] px-7 py-3 text-sm font-bold text-white transition disabled:pointer-events-none disabled:opacity-35"
          style={{ background: 'var(--cva-accent)', boxShadow: '0 6px 18px var(--cva-accent-soft)' }}
        >
          {nextLabel}
        </button>
      </footer>
    </div>
  )
}
