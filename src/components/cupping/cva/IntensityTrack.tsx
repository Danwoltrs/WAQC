'use client'

interface Props {
  /** 0–15 per the SCA form's 15-point scale (anchors 0 / 5 / 10 / 15). 0 = not rated. */
  value: number
  accent: string
  onChange: (v: number) => void
}

/** Tap-track intensity input — taps + a numeric field, never a slider (locked rule). */
export function IntensityTrack({ value, accent, onChange }: Props) {
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-1.5" data-testid="intensity-track">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-[3px]">
          {Array.from({ length: 16 }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Intensity ${i}`}
              onClick={() => onChange(i)}
              className="h-7 flex-1 rounded-[5px] border border-border transition-transform hover:scale-y-110"
              style={{ background: i <= value && value > 0 ? accent : 'var(--cva-card-solid)', opacity: i <= value && value > 0 ? 0.35 + (i / 15) * 0.65 : 1 }}
            />
          ))}
        </div>
        <input
          aria-label="Intensity value"
          inputMode="numeric"
          value={value || ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
            if (raw === '') return onChange(0)
            onChange(Math.min(15, parseInt(raw, 10)))
          }}
          className="h-9 w-12 rounded-[10px] border border-border bg-card text-center text-sm font-bold outline-none focus:border-[var(--cva-accent)]"
        />
      </div>
      <div className="flex justify-between px-0.5 text-[9px] font-bold uppercase tracking-[1.2px] text-muted-foreground">
        <span>LOW</span>
        <span>MEDIUM</span>
        <span>HIGH</span>
      </div>
    </div>
  )
}
