'use client'

// Cups & uniformity — SCA-104 §5.4, the June spec's §3.5. The step that never
// got built: types/cva.ts defined `cups` from day one and nothing wrote them,
// so every CVA score in the database carried u = 0, d = 0. The rules themselves
// live in lib/cva/cups.ts; this is the five tappable cups the spec asked for.

import { useState } from 'react'
import type { CvaCups, CvaDefectType } from '@/types/cva'
import { CUP_COUNT, DEFECT_TYPES, cycleMark, cupsFromMarks, marksFromCups, cupPenalty, type CupMark } from '@/lib/cva/cups'

interface Props {
  cups: CvaCups | undefined
  onChange: (cups: CvaCups) => void
}

const NU = { border: '#eab308', bg: 'rgba(234,179,8,.14)', text: '#a16207' }
const DEF = { border: '#ef4444', bg: 'rgba(239,68,68,.12)', text: '#ef4444' }
const MARK_LABEL: Record<CupMark, string> = { none: 'clean', nu: 'non-uniform', def: 'defective' }
const TYPE_LABEL: Record<CvaDefectType, string> = { moldy: 'Moldy', phenolic: 'Phenolic', potato: 'Potato' }

function CupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M3 21h16" />
    </svg>
  )
}

export function CupsStep({ cups, onChange }: Props) {
  // Marks are what the cupper tapped; storage is what the standard records —
  // an untyped defect exists only here until its type is picked (§5.4.1).
  const [local, setLocal] = useState(() => marksFromCups(cups))
  const { marks, type } = local
  const anyDefect = marks.some((m) => m === 'def')
  const allDefective = marks.every((m) => m === 'def')
  const { u, d, uncounted, penalty } = cupPenalty(marks, type)

  const commit = (next: CupMark[], nextType: CvaDefectType | null) => {
    setLocal({ marks: next, type: nextType })
    onChange(cupsFromMarks(next, nextType))
  }
  const tap = (i: number) => {
    const next = marks.slice()
    next[i] = cycleMark(next[i])
    // the type belongs to the defects; with none left it has nothing to describe
    commit(next, next.some((m) => m === 'def') ? type : null)
  }
  const pickType = (t: CvaDefectType) => commit(marks, type === t ? null : t)

  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[2.5px]" style={{ color: 'var(--cva-accent)' }}>
          After the last liquoring round
        </span>
        <h2 className="text-[clamp(28px,5vw,46px)] font-extrabold leading-none tracking-tight">Cups</h2>
        <p className="max-w-[520px] text-sm font-medium text-muted-foreground">
          Tap a cup once if it is qualitatively different from the rest, twice if it carries a sensory defect.
        </p>
      </div>

      <div
        className="flex w-full max-w-[560px] flex-col gap-4 rounded-[20px] border border-border p-5 sm:p-7"
        style={{ background: 'hsl(var(--card))', boxShadow: 'var(--cva-shadow)' }}
      >
        <div className="flex gap-2">
          {marks.map((m, i) => {
            const c = m === 'def' ? DEF : m === 'nu' ? NU : null
            return (
              <button
                key={i}
                type="button"
                aria-label={`Cup ${i + 1} — ${MARK_LABEL[m]}`}
                onClick={() => tap(i)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border px-1 pb-2.5 pt-3 text-[11px] font-bold transition ${
                  c ? '' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                style={c ? { borderColor: c.border, background: c.bg, color: c.text } : undefined}
              >
                <CupIcon />
                Cup {i + 1}
              </button>
            )
          })}
        </div>

        <div className="flex justify-center gap-4 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: NU.border }} aria-hidden />Non-uniform −2</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DEF.border }} aria-hidden />Defective −4</span>
        </div>

        {anyDefect && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
              Defect type <span className="font-semibold normal-case tracking-normal">(required)</span>
            </span>
            <div className="flex gap-2">
              {DEFECT_TYPES.map((t) => {
                const on = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickType(t)}
                    className={`h-10 flex-1 rounded-full border text-[13px] font-semibold transition ${on ? '' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    style={on ? { borderColor: DEF.border, background: DEF.bg, color: DEF.text } : undefined}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
            {!type && (
              <p className="text-xs font-semibold" style={{ color: DEF.text }}>
                Not counted yet — a defect needs both the cups and the type (SCA-104 §5.4.1).
              </p>
            )}
            {!allDefective && (
              <p className="text-xs text-muted-foreground">
                Defective cups are also marked non-uniform (§5.4.2) — unless all five are evenly defective.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex w-full max-w-[560px] items-center justify-between rounded-2xl border border-border px-4 py-3" style={{ background: 'hsl(var(--card))' }}>
        <span data-testid="cups-line" className="text-[12.5px] font-semibold text-muted-foreground">
          {u} non-uniform · {d} defective{uncounted > 0 ? ` (${uncounted} not counted)` : ''}
        </span>
        <span data-testid="cups-penalty" className="text-xl font-extrabold tabular-nums" style={{ color: penalty ? DEF.text : undefined }}>
          {penalty ? `−${penalty}` : '0'}
        </span>
      </div>
      <span className="sr-only">{CUP_COUNT} cups</span>
    </div>
  )
}
