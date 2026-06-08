'use client'

import type { CvaAssessment, RoastLevel } from '@/types/cva'

const LEVELS: { key: RoastLevel; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'medium-light', label: 'Medium-Light' },
  { key: 'medium', label: 'Medium' },
  { key: 'medium-dark', label: 'Medium-Dark' },
  { key: 'dark', label: 'Dark' },
]

interface Props {
  roast: CvaAssessment['roast']
  onChange: (patch: Partial<CvaAssessment['roast']>) => void
}

export function RoastStep({ roast, onChange }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Roast level</h2>
        <p className="text-xs text-muted-foreground">Recorded visually before tasting (SCA-102). Cupping level ≈ CIELAB L* 26–29.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {LEVELS.map((l) => {
          const active = roast.level === l.key
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => onChange({ level: l.key })}
              className={`rounded-2xl border px-5 py-4 text-sm transition ${active ? 'border-foreground bg-foreground/5 font-semibold' : 'border-border hover:bg-foreground/5'}`}
            >
              {l.label}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Agtron (optional)</span>
        <input
          type="number"
          min={0}
          max={100}
          value={roast.agtron ?? ''}
          onChange={(e) => onChange({ agtron: e.target.value === '' ? undefined : Number(e.target.value) })}
          className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="63"
        />
      </label>
    </div>
  )
}
