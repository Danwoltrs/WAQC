'use client'

// The nine-point affective impression (SCA-104 §5.2), one linear row.
//
// Tap a block OR drag across the row: every integer the finger crosses is
// recorded as it is crossed and ticks the phone once (Daniel 2026-09-09: "drag
// from left to right on the 1-9, with haptic feedback, showing the nr on the
// right as it goes up and down"). The numeric box on the right follows live;
// what the number MEANS is printed by the section header, above the row, in the
// hint's place — this component no longer repeats it underneath.
//
// Picking never advances the step. It used to (onCommit → next section) and
// the cupper had no time to place the intensity; Next is the only way on.
//
// Cooled is a second mark on the same row, never an overwrite (locked decision
// 5): with the toggle armed, a tap or drag places the final and the original
// stays where it was, with an arrow drawn between them.

import { useCallback, useRef, useState, type PointerEvent as RPE } from 'react'
import { IMPRESSION_COLORS, IMPRESSION_LABELS } from '@/lib/cva/sections'
import { hapticTick } from '@/lib/haptics'

interface ImpressionScaleProps {
  value?: number
  finalValue?: number
  accent: string
  onChange: (v: number) => void
  onChangeFinal: (v: number | undefined) => void
  /**
   * When the section owns the Cooled toggle (locked decision 5: ONE toggle arms
   * both the impression row and the intensity track), it passes `cooling` and
   * hears changes here. Left undefined, the scale keeps its own state as before.
   */
  cooling?: boolean
  onCoolingChange?: (cooling: boolean) => void
}

const POINTS = 9

export function ImpressionScale({ value, finalValue, accent, onChange, onChangeFinal, cooling: coolingProp, onCoolingChange }: ImpressionScaleProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [coolingState, setCoolingState] = useState<boolean>(finalValue != null)
  const cooling = coolingProp ?? coolingState
  const setCooling = (next: boolean) => {
    if (coolingProp === undefined) setCoolingState(next)
    onCoolingChange?.(next)
  }

  // The mark this row is currently placing; a drag ticks once per change of it.
  // A ref rather than the prop: two moves can land before the parent re-renders.
  const dragging = useRef(false)
  const shownMark = cooling ? (finalValue ?? value) : value
  const lastPlaced = useRef<number | undefined>(shownMark)
  if (!dragging.current) lastPlaced.current = shownMark

  const pick = useCallback((point: number) => {
    if (point !== lastPlaced.current) { lastPlaced.current = point; hapticTick() }
    if (cooling) onChangeFinal(point)
    else onChange(point)
  }, [cooling, onChange, onChangeFinal])

  /** The block under the pointer, clamped to the row (a drag past either end holds 1 or 9). */
  const pointAt = (e: RPE<HTMLDivElement>): number => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    return Math.max(1, Math.min(POINTS, Math.floor((x / Math.max(1, r.width)) * POINTS) + 1))
  }
  const onPointerDown = (e: RPE<HTMLDivElement>) => {
    dragging.current = true
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* jsdom, or an already-captured pointer */ }
    const p = pointAt(e)
    setHovered(p - 1)
    pick(p)
  }
  const onPointerMove = (e: RPE<HTMLDivElement>) => {
    if (!dragging.current) return
    const p = pointAt(e)
    setHovered(p - 1)
    if (p !== lastPlaced.current) pick(p)
  }
  const onPointerUp = () => {
    dragging.current = false
    setHovered(null)
  }

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

  // Two-tier swell from the prototype: target 1.16×, immediate neighbours 1.07×.
  // Fed by the mouse hover on desktop and by the finger's block during a drag.
  const swell = (i: number): { scale: number; lift: number; z: number } => {
    if (hovered == null) return { scale: 1, lift: 0, z: 1 }
    const d = Math.abs(i - hovered)
    if (d === 0) return { scale: 1.16, lift: -6, z: 3 }
    if (d === 1) return { scale: 1.07, lift: -2, z: 2 }
    return { scale: 1, lift: 0, z: 1 }
  }

  const numericValue = shownMark ?? value
  const ringBg = 'var(--background)'

  return (
    <div
      data-testid="impression-scale"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="mx-auto w-full max-w-[820px] space-y-2 outline-none sm:space-y-3.5"
    >
      {/* scale row: nine blocks (fill the width) + the inline numeric box */}
      <div className="flex w-full items-end justify-center gap-3 sm:gap-[18px]">
        <div
          data-testid="impression-blocks"
          className="relative flex h-[92px] flex-1 touch-none select-none items-end justify-center gap-1.5 px-1 pt-4 sm:h-[128px] sm:gap-[9px] sm:pt-6"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onMouseLeave={() => { if (!dragging.current) setHovered(null) }}
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
                onMouseEnter={() => { if (!dragging.current) setHovered(i) }}
                // Pointer input is resolved by the row (so a drag works); this
                // only serves the keyboard and assistive tech, whose clicks
                // carry detail 0.
                onClick={(e) => { if (e.detail === 0) pick(point) }}
                className={`group relative flex max-w-[78px] flex-1 items-center justify-center rounded-[14px] sm:rounded-[18px] ${active ? 'cva-anim-springpop' : ''} ${
                  active ? 'h-[74px] sm:h-[108px]' : 'h-[56px] sm:h-[78px]'
                }`}
                style={{
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
                  className="text-[18px] font-extrabold sm:text-[22px]"
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

        <label className="flex flex-none flex-col items-center gap-1 pb-0.5 sm:gap-1.5">
          <input
            aria-label="Impression value"
            type="number"
            min={1}
            max={9}
            placeholder="-"
            value={numericValue ?? ''}
            onChange={(e) => onNumeric(e.target.value)}
            className="h-14 w-14 rounded-[16px] border bg-card text-center text-[22px] font-extrabold outline-none transition-colors focus:border-[var(--cva-accent)] focus:ring-4 focus:ring-[var(--cva-accent-soft)] sm:h-16 sm:w-16 sm:rounded-[18px] sm:text-[26px]"
            style={{ borderColor: numericValue != null ? 'var(--cva-accent)' : 'var(--border)' }}
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">1–9</span>
        </label>
      </div>

      {/* ends */}
      <div className="flex justify-between px-1.5 text-[10.5px] font-semibold text-muted-foreground sm:text-[11px]">
        <span style={{ color: '#ef4444' }}>1 · {IMPRESSION_LABELS[0]}</span>
        <span>5 · {IMPRESSION_LABELS[4]}</span>
        <span style={{ color: '#22c55e' }}>9 · {IMPRESSION_LABELS[8]}</span>
      </div>

      {/* the Cooled toggle (appears once a value is set); the readout itself is the header's */}
      {value != null && (
        <div className="flex min-h-[32px] flex-wrap items-center justify-center gap-3 text-sm sm:min-h-[44px] sm:pt-0.5">
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-[14px] border px-[15px] py-1.5 text-[12.5px] font-semibold transition sm:py-2 ${
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
