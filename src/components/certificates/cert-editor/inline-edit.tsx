'use client'

import { ReactNode, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Pencil } from 'lucide-react'

/** Inline editor: hover shows a pencil; click opens a popover with the field's control. */
export function InlineEdit({
  display,
  children,
  className,
  contentClassName,
}: {
  display: ReactNode
  /** Editor body; call close() after a single-value commit to dismiss the popover. */
  children: (close: () => void) => ReactNode
  className?: string
  contentClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40 ${className || ''}`}
        >
          {display}
          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={`w-auto p-1 ${contentClassName || ''}`}>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}
