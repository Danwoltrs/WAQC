'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveScore } from '@/lib/cva/scoring'
import { cvaBand, effectiveImpression, roundToQuarter } from '@/lib/cva/scoring'
import { CVA_SECTIONS, IMPRESSION_COLORS } from '@/lib/cva/sections'
import type { CvaAssessment } from '@/types/cva'

const BASE = 52.75

interface Props {
  assessment: CvaAssessment
  live: LiveScore
  subtitle?: string
  onJump?: (step: number) => void
}

export function ScoreSummary({ assessment, live, subtitle, onJump }: Props) {
  const complete = live.complete
  const band = cvaBand(live.score)
  const [display, setDisplay] = useState(complete ? BASE : 0)
  const [revealed, setRevealed] = useState(false)
  const raf = useRef<number | null>(null)

  // Count-up from the formula base to the final score, then reveal the rest + confetti.
  useEffect(() => {
    if (!complete) { setRevealed(false); return }
    setRevealed(false)
    const start = performance.now()
    const dur = 1500
    const target = live.score
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      const val = BASE + (target - BASE) * eased
      setDisplay(roundToQuarter(val))
      if (p < 1) { raf.current = requestAnimationFrame(tick) }
      else { setDisplay(target); setRevealed(true); if (target >= 85) celebrate(band.color) }
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, live.score])

  const penalty = 2 * live.u + 4 * live.d

  if (!complete) {
    return (
      <div className="flex w-full max-w-[780px] flex-col items-center gap-3 text-center">
        <div className="text-[clamp(64px,16vw,140px)] font-extrabold leading-none tracking-tighter text-muted-foreground">—</div>
        <p className="text-sm text-muted-foreground">
          Your CVA score appears once all 8 sections are rated ({live.count}/8 so far).
        </p>
      </div>
    )
  }

  return (
    <div
      className="relative flex w-full flex-col items-center justify-center gap-1.5 rounded-[20px] py-6"
      style={{ background: `radial-gradient(circle at 50% 40%, ${hexa(band.color, 0.16)}, transparent 65%)` }}
    >
      <div className="text-[12px] font-bold uppercase tracking-[3px] text-muted-foreground">
        SCA 2024 Coffee Value Assessment
      </div>
      <div
        className="text-[clamp(90px,22vw,200px)] font-extrabold leading-[.9] tabular-nums"
        style={{ letterSpacing: '-6px', color: band.color, transition: 'color .8s' }}
      >
        {display.toFixed(2)}
      </div>
      <div
        className="rounded-[18px] px-[26px] py-2 text-[clamp(20px,4vw,34px)] font-extrabold text-white transition-all duration-500"
        style={{ background: band.color, opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(16px)' }}
      >
        {band.label}
      </div>
      {subtitle && <div className="mt-1.5 text-[13px] font-medium text-muted-foreground">{subtitle}</div>}

      <div
        className="mt-4 flex max-w-[780px] flex-wrap justify-center gap-2.5 transition-all duration-500"
        style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(16px)' }}
      >
        {CVA_SECTIONS.map((s, i) => {
          const v = effectiveImpression(assessment.sections[s.key])
          const shifted = assessment.sections[s.key]?.impression_final != null
            && assessment.sections[s.key]?.impression_final !== assessment.sections[s.key]?.impression
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onJump?.(i + 1)}
              className="flex min-w-[76px] flex-col items-center gap-0.5 rounded-2xl border border-border bg-card px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-[var(--cva-accent)]"
            >
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</span>
              <span className="text-lg font-extrabold tabular-nums" style={{ color: v != null ? IMPRESSION_COLORS[v - 1] : undefined }}>
                {v ?? '—'}
                {shifted && <small className="ml-0.5 text-[11px] font-bold" style={{ color: 'var(--cva-cool)' }}>↓{assessment.sections[s.key]?.impression}</small>}
              </span>
            </button>
          )
        })}
        <div className="flex min-w-[76px] flex-col items-center gap-0.5 rounded-2xl border border-border bg-card px-3 py-2.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Penalty</span>
          <span className="text-lg font-extrabold tabular-nums" style={{ color: penalty ? '#ef4444' : undefined }}>
            {penalty ? `-${penalty}` : '0'}
          </span>
        </div>
      </div>

      <div
        className="mt-5 max-w-[600px] text-center text-[11.5px] leading-[1.7] text-muted-foreground transition-opacity duration-500"
        style={{ opacity: revealed ? 1 : 0 }}
      >
        S = 0.65625 × Σ(8 sections) + 52.75 − 2·non-uniform − 4·defective
        <br />
        <code className="rounded-md border border-border bg-card px-1.5 py-0.5 font-semibold text-foreground">0.65625 × {live.sum}</code>
        {' + '}
        <code className="rounded-md border border-border bg-card px-1.5 py-0.5 font-semibold text-foreground">52.75</code>
        {' − '}
        <code className="rounded-md border border-border bg-card px-1.5 py-0.5 font-semibold text-foreground">2×{live.u}</code>
        {' − '}
        <code className="rounded-md border border-border bg-card px-1.5 py-0.5 font-semibold text-foreground">4×{live.d}</code>
        {' = '}
        <code className="rounded-md border border-border bg-card px-1.5 py-0.5 font-semibold text-foreground">{live.score.toFixed(2)}</code>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        The full Coffee Profile (flavor path, AI highlights, whiskey-style label, certificate) arrives in Phase 5.
      </p>
    </div>
  )
}

function hexa(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function celebrate(color: string) {
  if (typeof document === 'undefined') return
  const cols = [color, '#a9a454', '#e8a23d', '#556b2f', '#22c55e']
  for (let i = 0; i < 46; i++) {
    const c = document.createElement('div')
    c.className = 'cva-confetti'
    c.style.left = Math.random() * 100 + '%'
    c.style.background = cols[i % cols.length]
    document.body.appendChild(c)
    const dx = (Math.random() - 0.5) * 240
    const fall = window.innerHeight + 60
    const dur = 1400 + Math.random() * 1100
    c.animate(
      [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx}px,${fall}px) rotate(${Math.random() * 720}deg)`, opacity: 0.9 },
      ],
      { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)' }
    ).onfinish = () => c.remove()
  }
}
