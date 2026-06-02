'use client'

interface Step { key: string; label: string; accent: string; done: boolean }

interface Props {
  steps: Step[]
  current: number
  onJump: (index: number) => void
}

export function ProgressPath({ steps, current, onJump }: Props) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto py-2">
      {steps.map((s, i) => {
        const active = i === current
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onJump(i)}
            className="group flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs transition"
            style={{ background: active ? `${s.accent}22` : 'transparent' }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: active || s.done ? s.accent : 'var(--border, #9ca3af)', opacity: s.done || active ? 1 : 0.4 }}
            />
            <span className={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{s.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
