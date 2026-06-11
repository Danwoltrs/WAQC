'use client'

import type { CvaAssessment, RoastLevel } from '@/types/cva'

const LEVELS: { key: RoastLevel; label: string; swatch: string }[] = [
  { key: 'light', label: 'Light', swatch: 'rgb(214,178,128)' },
  { key: 'medium-light', label: 'Medium-Light', swatch: 'rgb(178,130,78)' },
  { key: 'medium', label: 'Medium', swatch: 'rgb(138,90,48)' },
  { key: 'medium-dark', label: 'Medium-Dark', swatch: 'rgb(86,54,32)' },
  { key: 'dark', label: 'Dark', swatch: 'rgb(40,26,16)' },
]

interface Props {
  roast: CvaAssessment['roast']
  onChange: (patch: Partial<CvaAssessment['roast']>) => void
}

export function RoastStep({ roast, onChange }: Props) {
  const current = LEVELS.find((l) => l.key === roast.level)
  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[2.5px]" style={{ color: 'var(--cva-accent)' }}>
          Before you taste
        </span>
        <h2 className="text-[clamp(28px,5vw,46px)] font-extrabold leading-none tracking-tight">Roast level</h2>
        <p className="max-w-[520px] text-sm font-medium text-muted-foreground">
          Recorded visually before tasting (SCA-102). Cupping level ≈ CIELAB L* 26–29.
        </p>
      </div>

      <div
        className="flex w-full max-w-[560px] flex-col gap-5 rounded-[20px] border border-border p-8"
        style={{ background: 'hsl(var(--card))', boxShadow: 'var(--cva-shadow)' }}
      >
        {current && (
          <div className="text-center text-base font-extrabold" style={{ color: 'var(--cva-accent)' }}>
            {current.label}
            {roast.agtron != null && <span className="font-semibold text-muted-foreground"> · Agtron {roast.agtron}</span>}
          </div>
        )}
        <div className="flex gap-2.5">
          {LEVELS.map((l) => {
            const active = roast.level === l.key
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => onChange({ level: l.key })}
                className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border px-1.5 pb-3 pt-3.5 text-[11px] font-bold leading-tight transition ${
                  active ? 'text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                style={
                  active
                    ? { borderColor: 'var(--cva-accent)', background: 'var(--cva-accent-soft)', boxShadow: '0 6px 18px var(--cva-accent-soft)' }
                    : undefined
                }
              >
                <span
                  className="h-10 w-10 rounded-full"
                  style={{
                    background: l.swatch,
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,.35)',
                    outline: active ? '3px solid var(--cva-accent)' : '2px solid hsl(var(--background))',
                    outlineOffset: active ? 2 : 0,
                  }}
                />
                {l.label}
              </button>
            )
          })}
        </div>
        <label className="flex items-center justify-center gap-3 text-[13px] font-semibold text-muted-foreground">
          Agtron <span className="font-normal opacity-70">(optional)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={roast.agtron ?? ''}
            onChange={(e) => onChange({ agtron: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="h-[42px] w-[90px] rounded-xl border border-border bg-card text-center text-base font-extrabold outline-none focus:border-[var(--cva-accent)] focus:ring-4 focus:ring-[var(--cva-accent-soft)]"
            placeholder="63"
          />
        </label>
      </div>
    </div>
  )
}
