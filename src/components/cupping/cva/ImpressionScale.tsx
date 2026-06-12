'use client'

import { useState, useCallback } from 'react'
import { IMPRESSION_COLORS, IMPRESSION_LABELS } from '@/lib/cva/sections'

interface ImpressionScaleProps {
  value?: number
  finalValue?: number
  accent: string
  onChange: (v: number) => void
  onChangeFinal: (v: number | undefined) => void
  onCommit?: (v: number) => void
}

export function ImpressionScale({ value, finalValue, accent, onChange, onChangeFinal, onCommit }: ImpressionScaleProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [cooling, setCooling] = useState<boolean>(finalValue != null)

  const pick = useCallback((point: number) => {
    if (cooling) {
      onChangeFinal(point)
    } else {
      onChange(point)
      onCommit?.(point)
    }
  }, [cooling, onChange, onChangeFinal, onCommit])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const n = Number(e.key)
    if (n >= 1 && n <= 9) {
      e.preventDefault()
      pick(n)
    }
  }, [pick])

  const onNumeric = useCallback((raw: string) => {
    if (raw === '') return
    const n = Math.max(1, Math.min(9, Math.round(Number(raw))))
    if (!Number.isNaN(n)) pick(n)
  }, [pick])

  // Two-tier hover swell from the prototype: target 1.16×, immediate neighbours 1.07×.
  const swell = (i: number): { scale: number; lift: number; z: number } => {
    if (hovered == null) return { scale: 1, lift: 0, z: 1 }
    const d = Math.abs(i - hovered)
    if (d === 0) return { scale: 1.16, lift: -6, z: 3 }
    if (d === 1) return { scale: 1.07, lift: -2, z: 2 }
    return { scale: 1, lift: 0, z: 1 }
  }

  const numericValue = (cooling ? finalValue : value) ?? value
  const ringBg = 'var(--background)'

  return (
    <div
      data-testid="impression-scale"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="mx-auto w-full max-w-[820px] space-y-3.5 outline-none"
    >
      {/* scale row: nine blocks (fill the width) + the inline numeric box */}
      <div className="flex w-full items-end justify-center gap-[18px]">
        <div
          className="relative flex h-[128px] flex-1 items-end justify-center gap-[9px] px-1 pt-6"
          onMouseLeave={() => setHovered(null)}
        >
          {IMPRESSION_COLORS.map((color, i) => {
            const point = i + 1
            const selected = value === point && !cooling
            const isFinal = finalValue === point && cooling
            const active = value === point || finalValue === point
            const sw = swell(i)
            return (
              <button
                key={point}
                type="button"
                aria-label={`Impression ${point} — ${IMPRESSION_LABELS[i]}`}
                aria-pressed={value === point}
                onMouseEnter={() => setHovered(i)}
                onClick={() => pick(point)}
                className={`group relative flex h-full max-w-[78px] flex-1 items-center justify-center rounded-[18px] ${active ? 'cva-anim-springpop' : ''}`}
                style={{
                  height: active ? 108 : 78,
                  background: color,
                  color,
                  transform: `scale(${sw.scale}) translateY(${sw.lift}px)`,
                  transformOrigin: 'bottom center',
                  zIndex: active ? 4 : sw.z,
                  transition: 'transform .28s var(--cva-spring), height .28s var(--cva-spring), box-shadow .28s',
                  boxShadow: selected
                    ? `0 16px 40px rgba(0,0,0,.28), 0 0 0 3px ${ringBg}, 0 0 0 6px currentColor`
                    : isFinal
                      ? `0 16px 40px rgba(0,0,0,.28), 0 0 0 3px ${ringBg}, 0 0 0 6px ${accent}`
                      : '0 4px 14px rgba(0,0,0,.12)',
                  outline: isFinal ? '3px dashed rgba(255,255,255,.9)' : 'none',
                  outlineOffset: isFinal ? -9 : 0,
                }}
              >
                <span
                  className="text-[22px] font-extrabold"
                  style={{ color: 'rgba(255,255,255,.96)', textShadow: '0 1px 3px rgba(0,0,0,.3)' }}
                >
                  {point}
                </span>
              </button>
            )
          })}
          {value != null && finalValue != null && value !== finalValue && (
            <CoolingArrow from={value} to={finalValue} accent={accent} />
          )}
        </div>

        <label className="flex flex-none flex-col items-center gap-1.5 pb-0.5">
          <input
            aria-label="Impression value"
            type="number"
            min={1}
            max={9}
            placeholder="-"
            value={numericValue ?? ''}
            onChange={(e) => onNumeric(e.target.value)}
            className="h-16 w-16 rounded-[18px] border bg-card text-center text-[26px] font-extrabold outline-none transition-colors focus:border-[var(--cva-accent)] focus:ring-4 focus:ring-[var(--cva-accent-soft)]"
            style={{ borderColor: numericValue != null ? 'var(--cva-accent)' : 'var(--border)' }}
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">1–9</span>
        </label>
      </div>

      {/* ends */}
      <div className="flex justify-between px-1.5 text-[11px] font-semibold text-muted-foreground">
        <span style={{ color: '#ef4444' }}>1 · {IMPRESSION_LABELS[0]}</span>
        <span>5 · {IMPRESSION_LABELS[4]}</span>
        <span style={{ color: '#22c55e' }}>9 · {IMPRESSION_LABELS[8]}</span>
      </div>

      {/* readout + cooling toggle (appears once a value is set) */}
      {value != null && (
        <div className="flex min-h-[44px] flex-wrap items-center justify-center gap-3 pt-0.5 text-sm">
          <span className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-card px-4 py-2 font-bold">
            <span className="h-3.5 w-3.5 rounded-md" style={{ background: IMPRESSION_COLORS[value - 1] }} />
            {value} · {IMPRESSION_LABELS[value - 1]}
          </span>
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-[14px] border px-[15px] py-2 text-[12.5px] font-semibold transition ${
              cooling ? 'border-[var(--cva-cool)] text-[var(--cva-cool)]' : 'border-dashed border-border text-muted-foreground hover:text-foreground'
            }`}
            style={cooling ? { background: 'rgba(59,130,246,.1)' } : undefined}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={cooling}
              onChange={(e) => { setCooling(e.target.checked); if (!e.target.checked) onChangeFinal(undefined) }}
            />
            <span aria-hidden className="text-[13px]">{cooling ? '●' : '○'}</span>
            Changed as it cooled?
          </label>
          {cooling && finalValue != null && finalValue !== value && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--cva-cool)' }}>
              {value} <span aria-hidden>→</span> {finalValue} · {finalValue > value ? 'rose' : 'fell'} as it cooled
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Thin arrow drawn from the initial block center to the cooled-final block center. */
function CoolingArrow({ from, to, accent }: { from: number; to: number; accent: string }) {
  const x = (point: number) => ((point - 0.5) / 9) * 100
  const x1 = x(from)
  const x2 = x(to)
  return (
    <svg className="pointer-events-none absolute left-0 top-1 h-3 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
      <defs>
        <marker id="cva-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={accent} />
        </marker>
      </defs>
      <line x1={x1} y1="5" x2={x2} y2="5" stroke={accent} strokeWidth="1.5" markerEnd="url(#cva-arrow)" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
