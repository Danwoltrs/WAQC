'use client'

// The 0–15 intensity track of SCA-103 §6.2, as the form draws it: one
// continuous scale with sixteen ticks, LOW / MEDIUM / HIGH beneath.
//
// This USED to be sixteen tap cells under the June rule "never a slider".
// Daniel reopened that on 2026-09-03 after re-reading the standard — §6.2:
// "Tasters may place a tick anywhere along the intensity scale, even in
// between integer numbers; however, the integer number closest to the tick
// shall be recorded." So: tap anywhere OR drag, and the nearest integer is
// what gets recorded (locked decision 1). A tap alone still works, which was
// the June rule's real intent.
//
// Cooled is a SECOND mark on the same track (locked decision 5), per §6.2:
// "they shall add a second mark and show the direction of change with an
// arrow above the scale. The original tick should not be erased." The section
// owns the one Cooled toggle (SectionScreen); this track only follows it.

import { useRef, type KeyboardEvent, type PointerEvent as RPE, type ReactNode } from 'react'
import { hapticTick } from '@/lib/haptics'

interface Props {
  /** 0–15 per the SCA form's 15-point scale (anchors 0 / 5 / 10 / 15). 0 = not rated. */
  value: number
  accent: string
  onChange: (v: number) => void
  /** Armed by the section's Cooled toggle: the next mark is the SECOND one. */
  cooling?: boolean
  finalValue?: number
  onChangeFinal?: (v: number | undefined) => void
  /** Rendered at the start of the value row, so the section's caption and the numeric share one line on a phone. */
  label?: ReactNode
}

export const INTENSITY_MAX = 15
/** The rail is inset from the track's edges so the thumb never overhangs. */
export const TRACK_INSET = 14
const COOL = 'var(--cva-cool)'

const clamp = (n: number) => Math.max(0, Math.min(INTENSITY_MAX, n))

export function IntensityTrack({ value, accent, onChange, cooling = false, finalValue, onChangeFinal, label }: Props) {
  const dragging = useRef(false)

  // Only a rated section can cool — there is no second mark without a first.
  const second = cooling && value > 0
  const shown = second && finalValue != null ? finalValue : value
  const shifted = second && finalValue != null && finalValue !== value

  // The mark as last placed — a ref, not the prop, because a drag can place
  // twice before the parent re-renders and each new integer must tick exactly
  // once (Daniel 2026-09-09: "this drag also should have a haptic feedback").
  const lastPlaced = useRef(shown)
  if (!dragging.current) lastPlaced.current = shown

  const place = (raw: number) => {
    const n = clamp(raw)
    if (n !== lastPlaced.current) { lastPlaced.current = n; hapticTick() }
    if (second) onChangeFinal?.(n)
    else onChange(n)
  }

  /** Nearest integer to the pointer, clamped to the rail (§6.2). */
  const valueAt = (e: RPE<HTMLDivElement>): number => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(r.width - TRACK_INSET, Math.max(TRACK_INSET, e.clientX - r.left))
    return Math.round(((x - TRACK_INSET) / Math.max(1, r.width - 2 * TRACK_INSET)) * INTENSITY_MAX)
  }
  const onPointerDown = (e: RPE<HTMLDivElement>) => {
    dragging.current = true
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* jsdom, or an already-captured pointer */ }
    place(valueAt(e))
  }
  const onPointerMove = (e: RPE<HTMLDivElement>) => { if (dragging.current) place(valueAt(e)) }
  const onPointerUp = () => { dragging.current = false }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1
      : null
    if (step != null) { e.preventDefault(); place(shown + step); return }
    if (e.key === 'Home') { e.preventDefault(); place(0) }
    if (e.key === 'End') { e.preventDefault(); place(INTENSITY_MAX) }
  }

  const pos = (v: number) => `calc(${TRACK_INSET}px + (100% - ${2 * TRACK_INSET}px) * ${(v / INTENSITY_MAX).toFixed(4)})`

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-0.5" data-testid="intensity-track">
      <div className="flex items-center justify-end gap-2">
        {label != null && <div className="mr-auto">{label}</div>}
        {shifted && (
          <span
            data-testid="intensity-shift"
            role="status"
            aria-label={`${value} → ${finalValue} · ${finalValue! > value ? 'rose' : 'fell'} as it cooled`}
            className="text-xs font-bold"
            style={{ color: COOL }}
          >
            {value} → {finalValue}
          </span>
        )}
        <input
          aria-label="Intensity value"
          inputMode="numeric"
          value={shown || ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
            place(raw === '' ? 0 : parseInt(raw, 10))
          }}
          className="h-8 w-12 rounded-[10px] border border-border bg-card text-center text-sm font-bold outline-none focus:border-[var(--cva-accent)] sm:h-9"
        />
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Intensity"
        aria-valuemin={0}
        aria-valuemax={INTENSITY_MAX}
        aria-valuenow={shown}
        aria-valuetext={shown ? `${shown} of ${INTENSITY_MAX}${shifted ? `, cooled from ${value}` : ''}` : 'not rated'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative h-12 cursor-pointer touch-none select-none outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--cva-accent)] sm:h-14"
      >
        {/* the rail, its fill, and the form's sixteen ticks */}
        <div
          className="absolute top-[22px] h-3 rounded-md border border-border"
          style={{ left: TRACK_INSET, right: TRACK_INSET, background: `linear-gradient(90deg, var(--cva-card-solid), ${accent}59)` }}
        />
        <div
          className="pointer-events-none absolute top-[22px] h-3 rounded-md"
          style={{ left: TRACK_INSET, width: `calc((100% - ${2 * TRACK_INSET}px) * ${(shown / INTENSITY_MAX).toFixed(4)})`, background: accent }}
        />
        {Array.from({ length: INTENSITY_MAX + 1 }, (_, i) => (
          <div
            key={i}
            data-testid="intensity-tick"
            className="pointer-events-none absolute top-9 w-px bg-muted-foreground opacity-60"
            style={{ left: pos(i), height: i % 5 === 0 ? 10 : 5 }}
          />
        ))}
        {/* the original tick stays where it was (§6.2) */}
        {shifted && (
          <div
            data-testid="intensity-initial"
            className="pointer-events-none absolute top-[14px] -ml-[14px] h-7 w-7 rounded-full border-2 border-dashed"
            style={{ left: pos(value), borderColor: COOL }}
          />
        )}
        <div
          className="pointer-events-none absolute top-[14px] -ml-[14px] grid h-7 w-7 place-items-center rounded-full border-2 bg-background text-[11px] font-extrabold shadow-md transition-[left] duration-100"
          style={{ left: pos(shown), borderColor: shifted ? COOL : accent, color: shifted ? COOL : accent }}
        >
          {shown}
        </div>
      </div>

      <div className="flex justify-between px-2 text-[9px] font-bold uppercase tracking-[1.2px] text-muted-foreground">
        <span>LOW</span>
        <span>MEDIUM</span>
        <span>HIGH</span>
      </div>
    </div>
  )
}
