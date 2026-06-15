'use client'

interface Step { key: string; label: string; accent: string; done: boolean; value?: string | null }

interface Props {
  steps: Step[]
  current: number
  onJump: (index: number) => void
}

export function ProgressPath({ steps, current, onJump }: Props) {
  return (
    <nav className="flex items-center gap-0 px-1">
      {steps.map((s, i) => {
        const isCurrent = i === current
        const fill = s.done ? '100%' : isCurrent ? '50%' : '0%'
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onJump(i)}
            className="group relative flex flex-1 cursor-pointer flex-col items-center gap-1 px-0.5 py-1.5"
          >
            <span
              className="relative w-full overflow-hidden rounded"
              style={{
                height: 4,
                background: 'var(--cva-hair)',
                boxShadow: isCurrent ? '0 0 0 3px var(--cva-accent-soft)' : 'none',
                borderRadius: isCurrent ? 6 : 4,
              }}
            >
              <span
                className="absolute inset-0 rounded"
                style={{
                  width: fill,
                  background: s.done || isCurrent ? s.accent : 'transparent',
                  transition: 'width .55s var(--cva-ease), background .5s',
                }}
              />
            </span>
            <span
              className={`hidden whitespace-nowrap text-[10px] font-semibold tracking-tight transition-colors sm:block ${
                isCurrent || s.done ? 'text-foreground' : 'text-muted-foreground'
              } group-hover:text-[var(--cva-accent)]`}
            >
              {s.label}
            </span>
            {/* aria-hidden: keeps the button's accessible name = its label */}
            <span
              aria-hidden
              className={`hidden whitespace-nowrap text-[11px] font-bold leading-none sm:block ${
                s.value != null ? 'text-foreground' : 'text-muted-foreground/50'
              }`}
            >
              {s.value ?? '—'}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
