'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Step } from './types'

/**
 * The intake's steps by name, always in view. Completed steps are buttons back
 * to themselves; the current and later ones are not (the wizard never skips a
 * step forward). On a narrow screen only the current step keeps its name.
 */
export function WizardStepper({
  steps,
  current,
  onGoTo,
}: {
  steps: Step[]
  current: number
  onGoTo: (step: number) => void
}) {
  return (
    <nav aria-label="Intake steps">
      <ol className="flex gap-2 sm:gap-3">
        {steps.map((step) => {
          const done = step.id < current
          const isCurrent = step.id === current
          const label = (
            <>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border text-xs font-semibold tabular-nums',
                  done && 'border-transparent bg-muted text-foreground',
                  isCurrent && 'border-foreground text-foreground',
                  !done && !isCurrent && 'border-input text-muted-foreground',
                )}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" /> : step.id}
              </span>
              <span
                className={cn(
                  'truncate text-sm',
                  isCurrent ? 'font-semibold text-foreground' : 'hidden text-muted-foreground sm:inline',
                )}
              >
                {step.name}
              </span>
            </>
          )
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn('flex min-w-0 flex-col gap-2', isCurrent ? 'flex-[2] sm:flex-1' : 'flex-1')}
            >
              <div className={cn('h-0.5', step.id <= current ? 'bg-foreground' : 'bg-muted')} aria-hidden />
              {done ? (
                <button
                  type="button"
                  onClick={() => onGoTo(step.id)}
                  className="flex min-w-0 items-center gap-2 rounded-sm text-left hover:[&>span:last-child]:text-foreground hover:[&>span:last-child]:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Back to step ${step.id}, ${step.name}`}
                >
                  {label}
                </button>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  {label}
                  <span className="sr-only">{isCurrent ? ', current step' : ', not reached yet'}</span>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
