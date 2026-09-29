'use client'

import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { FormData } from './types'

/** True while a field still holds what the linked contract (or PSS) filled; an edit clears it. */
export const isPrefilled = (form: FormData, key: keyof FormData) =>
  form.contract_prefilled_fields?.includes(key) ?? false

/**
 * The highlight a prefilled control carries, so the user sees at a glance
 * which values came from the link: a dark olive border over a light olive
 * fill (Daniel 2026-09-29: "dark green highlight all prefilled").
 */
export const PREFILLED_CONTROL =
  'border-[#556b2f] bg-[#556b2f]/10 dark:border-[#a9b87a] dark:bg-[#a9b87a]/10'

/** The same highlight on a segmented switch (Bags / Bulk, bag kind): its track. */
export const PREFILLED_SEGMENTED = 'bg-[#556b2f]/15 ring-1 ring-[#556b2f] dark:bg-[#a9b87a]/15 dark:ring-[#a9b87a]'

export function PrefilledTag() {
  return (
    <span
      className="inline-flex h-[18px] items-center rounded-sm border border-[#556b2f]/30 bg-[#556b2f]/10 px-1.5 text-[10.5px] font-semibold tracking-wide text-[#3f5122] dark:text-[#c3d196]"
      title="Filled from the linked contract or PSS. Edit it to change it."
    >
      Prefilled
    </span>
  )
}

/**
 * One labelled field: the label, a "Prefilled" tag while the value is the
 * link's, the control, and any notice under it. `field` is the marker the
 * "Still needed" list jumps to (see field-targets.ts).
 */
export function FieldBox({
  label,
  htmlFor,
  field,
  required,
  prefilled,
  aside,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  field?: string
  required?: boolean
  prefilled?: boolean
  /** Small control beside the label (e.g. "is also the shipper"). */
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div data-field={field} className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex min-h-4 items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[12.5px] font-medium">
          {label}
          {required && ' *'}
        </Label>
        <div className="flex items-center gap-3">
          {aside}
          {prefilled && <PrefilledTag />}
        </div>
      </div>
      {children}
    </div>
  )
}
