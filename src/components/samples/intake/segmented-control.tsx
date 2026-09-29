'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * Mutually exclusive choices laid out side by side: every option visible,
 * one click (or the arrow keys) to change, no dropdown to open. A radio group
 * to assistive tech; the checked option is the one Tab lands on.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
  className,
}: {
  value: T | ''
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const checkedIndex = options.findIndex((o) => o.value === value)

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex gap-0.5 rounded-md bg-muted p-[3px]', size === 'md' ? 'h-9' : 'h-7', className)}
    >
      {options.map((option, i) => {
        const checked = i === checkedIndex
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (checkedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(i, -1)
              }
            }}
            className={cn(
              'whitespace-nowrap rounded-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'md' ? 'px-3 text-[13px]' : 'px-2.5 text-xs',
              checked
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
