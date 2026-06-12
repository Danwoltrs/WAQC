'use client'

import { MOUTH_CATA, MOUTH_CAP, toggleCapped } from '@/lib/cva/flavor-wheel-data'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

/** Mouthfeel CATA (SCA-103 §6.3.3) — five options, up to two, sub-qualifiers shown under the parent. */
export function MouthfeelCata({ value, onChange }: Props) {
  return (
    <div className="flex w-full max-w-[520px] flex-col gap-2.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
        Mouthfeel <span className="font-semibold normal-case tracking-normal">(up to {MOUTH_CAP})</span>
      </span>
      {MOUTH_CATA.map((o) => {
        const on = value.includes(o.name)
        return (
          <button
            key={o.name}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggleCapped(value, o.name, MOUTH_CAP))}
            className={`flex flex-col items-start gap-0.5 rounded-[16px] border px-5 py-3.5 text-left transition ${
              on ? 'border-[var(--cva-accent)]' : 'border-border hover:border-[var(--cva-accent)]'
            }`}
            style={on ? { background: 'var(--cva-accent-soft)' } : undefined}
          >
            <span className="text-sm font-bold">{o.name}</span>
            {o.sub && <span className="text-[11.5px] font-medium text-muted-foreground">{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}
