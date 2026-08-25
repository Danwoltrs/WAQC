'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { CVA_SECTIONS, type CvaSectionKey } from '@/lib/cva/sections'
import { cvaBand, effectiveImpression } from '@/lib/cva/scoring'
import { useCvaSession, type CvaSampleMeta } from '@/hooks/useCvaSession'
import { describeIsEmpty, type DescribeGroup } from '@/types/cva'
import type { LiveScore } from '@/lib/cva/scoring'
import { ProgressPath } from './ProgressPath'
import { RoastStep } from './RoastStep'
import { SectionScreen } from './SectionScreen'
import { ScoreSummary } from './ScoreSummary'
import { LiveScore as LiveScorePill } from './LiveScore'
// Code-split: the wheel subtree (~110-node taxonomy + label geometry) stays out
// of the route's first-load JS; a mount-time preload warms the chunk long
// before a Describe button is reachable.
const DescribeOverlay = dynamic(
  () => import('./wheel/DescribeOverlay').then((m) => ({ default: m.DescribeOverlay })),
  { ssr: false },
)

const ROAST_ACCENT = '#6d6f54'
const SCORE_ACCENT = '#151618'

/** Which overlay group a section's Describe button opens (spec §1 table). */
const GROUP_FOR: Partial<Record<CvaSectionKey, DescribeGroup>> = {
  fragrance: 'aroma',
  aroma: 'aroma',
  flavor: 'flavor_aftertaste',
  aftertaste: 'flavor_aftertaste',
  mouthfeel: 'mouthfeel',
}
const NOTE_FOR: Partial<Record<CvaSectionKey, 'acidity' | 'sweetness'>> = {
  acidity: 'acidity',
  sweetness: 'sweetness',
}

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
  const { samples, ready, activeId, setActive, assessment, step, setStep, setSectionValue, setRoast, setDescribe, saving, savedAt, scoreOf } = session

  const [describeOpen, setDescribeOpen] = useState(false)
  const [describeGroup, setDescribeGroup] = useState<DescribeGroup>('aroma')
  const [gateOpen, setGateOpen] = useState(false)
  const gateAcked = useRef<Set<string>>(new Set())

  // The overlay mounts on first open and then stays mounted (hidden) — the
  // wheel's ~600-element mount is paid once, not on every Describe tap.
  const everOpenedDescribe = useRef(false)
  if (describeOpen) everOpenedDescribe.current = true
  const closeDescribe = useCallback(() => setDescribeOpen(false), [])

  // Warm the code-split overlay chunk right after mount so the first open
  // never waits on the network.
  useEffect(() => { void import('./wheel/DescribeOverlay') }, [])

  const live = useMemo(() => scoreOf(activeId), [scoreOf, activeId])

  const steps = useMemo(() => {
    const sectionSteps = CVA_SECTIONS.map((s) => {
      const v = effectiveImpression(assessment.sections[s.key])
      return {
        key: s.key,
        label: s.label,
        accent: s.accent,
        done: v != null,
        value: v != null ? String(v) : null,
      }
    })
    const roastLabel = assessment.roast.level
      ? assessment.roast.level.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-')
      : null
    return [
      { key: 'roast', label: 'Roast', accent: ROAST_ACCENT, done: !!assessment.roast.level, value: roastLabel },
      ...sectionSteps,
      {
        key: 'score',
        label: 'Score',
        accent: SCORE_ACCENT,
        done: live.complete,
        value: live.complete ? Number(live.score.toFixed(2)).toString() : null,
      },
    ]
  }, [assessment, live.complete, live.score])

  const last = steps.length - 1
  const activeMeta = samples.find((s) => s.id === activeId)

  // Show the lot's own reference in the address bar, never the raw session UUID
  // and never the internal lab number — the journey can be opened by either (the
  // API [id] route resolves both). Rewrite cosmetically via the History API so it
  // does NOT remount/refetch the session.
  useEffect(() => {
    if (!ready || !activeMeta?.reference_slug || typeof window === 'undefined') return
    const slug = activeMeta.reference_slug
    const segs = window.location.pathname.split('/')
    if (decodeURIComponent(segs[segs.length - 1]) === slug) return
    segs[segs.length - 1] = encodeURIComponent(slug)
    window.history.replaceState(window.history.state, '', segs.join('/') + window.location.search)
  }, [ready, activeMeta?.reference_slug])

  // requires_descriptors soft gate — fires on ANY first transition into the
  // score step (footer button, progress-path jump, live-score pill); soft only.
  const goToStep = (n: number) => {
    if (
      n === last &&
      step !== last &&
      activeMeta?.requires_descriptors &&
      !gateAcked.current.has(activeId) &&
      describeIsEmpty(assessment.describe)
    ) {
      setGateOpen(true)
      return
    }
    setStep(n)
  }

  const descriptorSlotFor = (key: CvaSectionKey) => {
    const group = GROUP_FOR[key]
    if (group) {
      const d = assessment.describe
      const dots = [
        d.aroma.picks.length > 0,
        d.flavor_aftertaste.picks.length > 0 || d.flavor_aftertaste.main_tastes.length > 0,
        d.mouthfeel.cata.length > 0,
      ]
      const total =
        d.aroma.picks.length + d.flavor_aftertaste.picks.length +
        d.flavor_aftertaste.main_tastes.length + d.mouthfeel.cata.length
      return (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => { setDescribeGroup(group); setDescribeOpen(true) }}
            className="inline-flex items-center gap-2.5 rounded-[16px] border border-border bg-card px-[22px] py-[11px] text-[13px] font-bold transition hover:-translate-y-0.5 hover:border-[var(--cva-accent)] hover:bg-[var(--cva-accent-soft)] hover:shadow-lg"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[17px] w-[17px]">
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" />
              <path d="M12 3v2.4M21 12h-2.4M12 21v-2.4M3 12h2.4" />
            </svg>
            Describe this cup
            {total > 0 && (
              <span className="rounded-full px-2 py-px text-[11px] font-extrabold text-white" style={{ background: 'var(--cva-accent)' }}>
                {total}
              </span>
            )}
            <span className="ml-0.5 inline-flex gap-1" aria-hidden>
              {dots.map((on, k) => (
                <span key={k} className="h-[7px] w-[7px] rounded-full transition" style={{ background: on ? 'var(--cva-accent)' : 'var(--border)', transform: on ? 'scale(1.15)' : undefined }} />
              ))}
            </span>
          </button>
          <span className="text-[11px] font-semibold text-muted-foreground">Shared across all sections · edit anytime</span>
        </div>
      )
    }
    const noteKey = NOTE_FOR[key]
    if (!noteKey) return null
    return (
      <label className="flex w-full max-w-[560px] flex-col gap-1.5 text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
        Descriptors — freely elicited
        <input
          value={assessment.describe.notes[noteKey] ?? ''}
          onChange={(e) => setDescribe((d) => ({ ...d, notes: { ...d.notes, [noteKey]: e.target.value } }))}
          placeholder="SCA gives this section no checklist — write what you taste."
          className="h-11 rounded-[14px] border border-border bg-card px-4 text-sm font-normal normal-case tracking-normal outline-none focus:border-[var(--cva-accent)]"
        />
      </label>
    )
  }

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
                  {s.reference}
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
          <b className="font-semibold text-foreground">{activeMeta?.reference ?? 'CVA cupping'}</b>
          {activeMeta?.reference_secondary && (
            <>
              {' · '}
              <span className="text-muted-foreground">{activeMeta.reference_secondary}</span>
            </>
          )}
          {' · '}
          {saving ? 'Saving…' : savedAt ? 'Saved' : 'Specialty · SCA CVA 2024'}
        </div>
        <div className="ml-auto">
          <LiveScorePill live={live} onClick={() => goToStep(last)} />
        </div>
      </header>

      <div className="relative z-10 border-b border-border px-6">
        <ProgressPath steps={steps} current={step} onJump={goToStep} />
      </div>

      <div className="relative z-[2] flex flex-1 flex-col overflow-y-auto min-h-0">
        <div className="m-auto flex w-full max-w-[880px] flex-col px-6 py-6">
          <main className="flex w-full justify-center">
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
                onCommit={() => { if (step < last) goToStep(step + 1) }}
                intensity={section.key === 'overall' ? undefined : assessment.describe.intensities[section.key]}
                onIntensityChange={
                  section.key === 'overall' ? undefined
                  : (v) => setDescribe((d) => ({ ...d, intensities: { ...d.intensities, [section.key]: v } }))
                }
                descriptorSlot={descriptorSlotFor(section.key)}
              />
            )
          })()}
          {step === 9 && (
            <ScoreSummary
              assessment={assessment}
              live={live}
              subtitle={
                [activeMeta?.reference, activeMeta?.reference_secondary].filter(Boolean).join(' · ') || undefined
              }
              onJump={(s) => setStep(s)}
            />
          )}
          </main>

          <footer className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">
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
          onClick={() => goToStep(Math.min(last, step + 1))}
          className="inline-flex items-center gap-2 rounded-[16px] px-7 py-3 text-sm font-bold text-white transition disabled:pointer-events-none disabled:opacity-35"
          style={{ background: 'var(--cva-accent)', boxShadow: '0 6px 18px var(--cva-accent-soft)' }}
        >
          {nextLabel}
        </button>
          </footer>
        </div>
      </div>

      {(everOpenedDescribe.current || describeOpen) && (
        <DescribeOverlay
          open={describeOpen}
          group={describeGroup}
          onGroupChange={setDescribeGroup}
          describe={assessment.describe}
          onDescribe={setDescribe}
          onClose={closeDescribe}
        />
      )}

      {gateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="w-[min(92vw,420px)] rounded-[20px] border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-sm font-bold">No descriptors recorded</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This quality requires flavor notes. Reveal the score anyway?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGateOpen(false)}
                className="rounded-[12px] border border-border px-4 py-2 text-sm font-semibold"
              >
                Keep describing
              </button>
              <button
                type="button"
                onClick={() => { gateAcked.current.add(activeId); setGateOpen(false); setStep(last) }}
                className="rounded-[12px] px-4 py-2 text-sm font-bold text-white"
                style={{ background: 'var(--cva-accent)' }}
              >
                Reveal anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
