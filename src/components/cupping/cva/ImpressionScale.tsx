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
      onChange(n)
      onCommit?.(n)
    }
  }, [onChange, onCommit])

  const onNumeric = useCallback((raw: string) => {
    const n = Math.max(1, Math.min(9, Math.round(Number(raw))))
    if (!Number.isNaN(n)) { onChange(n); onCommit?.(n) }
  }, [onChange, onCommit])

  // Dock-style magnify factor for the block at index i (pointer only).
  const scaleFor = (i: number) => {
    if (hovered == null) return 1
    const d = Math.abs(i - hovered)
    return Math.max(1, 1.5 - 0.18 * d)
  }

  return (
    <div data-testid="impression-scale" tabIndex={0} onKeyDown={onKeyDown} className="space-y-4 outline-none">
      <div className="relative flex items-end gap-2" onMouseLeave={() => setHovered(null)}>
        {IMPRESSION_COLORS.map((color, i) => {
          const point = i + 1
          const selected = value === point
          const isFinal = finalValue === point
          return (
            <button
              key={point}
              type="button"
              aria-label={`Impression ${point} — ${IMPRESSION_LABELS[i]}`}
              aria-pressed={selected}
              onMouseEnter={() => setHovered(i)}
              onClick={() => pick(point)}
              className="relative flex-1 rounded-xl transition-transform duration-150 ease-out focus:outline-none"
              style={{
                height: 64,
                background: color,
                transform: `scale(${scaleFor(i)})`,
                transformOrigin: 'bottom center',
                boxShadow: selected ? `0 0 0 3px ${accent}` : isFinal ? `0 0 0 3px ${accent}80` : 'none',
                outline: isFinal && !selected ? `2px dashed ${accent}` : 'none',
              }}
            >
              <span className="absolute inset-x-0 bottom-1 text-center text-xs font-semibold text-white/90">{point}</span>
            </button>
          )
        })}
        {value != null && finalValue != null && value !== finalValue && (
          <CoolingArrow from={value} to={finalValue} accent={accent} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Value</span>
          <input
            aria-label="Impression value"
            type="number"
            min={1}
            max={9}
            value={value ?? ''}
            onChange={(e) => onNumeric(e.target.value)}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cooling}
            onChange={(e) => { setCooling(e.target.checked); if (!e.target.checked) onChangeFinal(undefined) }}
          />
          <span>Changed as it cooled?</span>
        </label>
        {value != null && (
          <span className="text-sm text-muted-foreground">{IMPRESSION_LABELS[value - 1]}</span>
        )}
      </div>
    </div>
  )
}

/** Thin arrow drawn from the initial block center to the cooled-final block center. */
function CoolingArrow({ from, to, accent }: { from: number; to: number; accent: string }) {
  const x = (point: number) => ((point - 0.5) / 9) * 100
  const x1 = x(from)
  const x2 = x(to)
  return (
    <svg className="pointer-events-none absolute -top-3 left-0 h-3 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
      <defs>
        <marker id="cva-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={accent} />
        </marker>
      </defs>
      <line x1={x1} y1="5" x2={x2} y2="5" stroke={accent} strokeWidth="1.5" markerEnd="url(#cva-arrow)" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
