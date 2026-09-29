'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * One section of a sample's details as a card: the fields a lab checks every
 * time, and "All fields" for the rest of the section, opened in place. The
 * same card lays out the intake's Step 2 and the sample editor, so a sample
 * reads the same whether it is being entered or corrected.
 *
 * `forceOpen` keeps the extra fields open while one of them still needs a
 * value, so nothing required is ever hidden behind the toggle.
 */
export function SectionCard({
  title,
  label,
  description,
  section,
  children,
  more,
  forceOpen = false,
  defaultOpen = false,
  className,
}: {
  /** Left out where the fields name the section themselves (quality, quantity). */
  title?: string
  /** The section's name for assistive tech when it shows no title. */
  label?: string
  description?: ReactNode
  /** The `data-section` marker an Edit link or a jump lands on. */
  section?: string
  children: ReactNode
  /** The rest of the section, behind "All fields". */
  more?: ReactNode
  forceOpen?: boolean
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const shown = open || forceOpen
  return (
    <section
      data-section={section}
      aria-label={title ?? label}
      className={cn('scroll-mt-4 space-y-4 rounded-lg border bg-card p-4 sm:p-5', className)}
    >
      {(title || more) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {more && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(!shown)}
              disabled={forceOpen}
              aria-expanded={shown}
              className="-mr-2 -mt-1 h-7 flex-shrink-0 gap-1 px-2 text-xs text-muted-foreground"
            >
              {shown ? 'Fewer fields' : 'All fields'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', shown && 'rotate-180')} />
            </Button>
          )}
        </div>
      )}
      {children}
      {more && shown && <div className="space-y-4 border-t pt-4">{more}</div>}
    </section>
  )
}
