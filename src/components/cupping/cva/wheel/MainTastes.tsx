'use client'

import { MAIN_TASTES, TASTE_CAP, toggleCapped } from '@/lib/cva/flavor-wheel-data'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

/** "Main Tastes (2)" from the official form — gustatory, not on the wheel. */
export function MainTastes({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
        Main tastes <span className="font-semibold normal-case tracking-normal">(up to {TASTE_CAP})</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {MAIN_TASTES.map((t) => {
          const on = value.includes(t)
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleCapped(value, t, TASTE_CAP))}
              className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
                on ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:border-[var(--cva-accent)]'
              }`}
              style={on ? { background: 'var(--cva-accent)' } : undefined}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
