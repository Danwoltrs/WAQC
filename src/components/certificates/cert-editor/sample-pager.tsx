'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** One row of the host page's list, as the overlay steps through it. */
export interface SampleNavItem {
  id: string
  /** What the row is called on screen (certificate nr, else SMP / ICO / CTR). */
  label: string
}

/**
 * Where the open sample sits in the host list. A contract opened from
 * "Contracts in this sample" while its lot row is collapsed is not listed
 * itself, so it steps from its lot's row.
 */
export function navPosition(items: SampleNavItem[], currentId: string | null, lotId: string | null) {
  let index = currentId ? items.findIndex((n) => n.id === currentId) : -1
  if (index < 0 && lotId) index = items.findIndex((n) => n.id === lotId)
  return {
    index,
    prev: index > 0 ? items[index - 1] : null,
    next: index >= 0 && index < items.length - 1 ? items[index + 1] : null,
  }
}

/** Arrow keys belong to whatever control has focus; only a bare page takes them. */
function keyIsFree(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false
  const t = e.target as HTMLElement | null
  if (!t) return true
  if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return false
  return !t.closest('[role="listbox"],[role="menu"],[role="combobox"],[role="slider"],[role="tablist"],[role="dialog"],[role="alertdialog"]')
}

/**
 * Previous / next sample in the list the overlay was opened from, named so
 * the user sees what is on either side before stepping (2026-09-30). The
 * left and right arrow keys step too, unless a control has focus or
 * `keysDisabled` (an edit panel is open).
 */
export function SamplePager({
  items,
  currentId,
  lotId,
  onGo,
  keysDisabled,
}: {
  items: SampleNavItem[]
  currentId: string | null
  lotId: string | null
  onGo: (id: string) => void
  keysDisabled?: boolean
}) {
  const { index, prev, next } = navPosition(items, currentId, lotId)

  useEffect(() => {
    if (keysDisabled || index < 0) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !keyIsFree(e)) return
      const to = e.key === 'ArrowLeft' ? prev : next
      if (!to) return
      e.preventDefault()
      onGo(to.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keysDisabled, index, prev, next, onGo])

  if (index < 0 || items.length < 2) return null
  return (
    <nav aria-label="Samples in this list" className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={!prev}
        onClick={() => prev && onGo(prev.id)}
        aria-label={prev ? `Previous sample: ${prev.label}` : 'Previous sample'}
        title={prev ? `Previous: ${prev.label} (←)` : 'First in the list'}
        className="max-w-[11rem] gap-1 px-2"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        {prev ? <span className="hidden truncate font-mono text-xs md:inline">{prev.label}</span> : null}
      </Button>
      <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {index + 1} / {items.length}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={!next}
        onClick={() => next && onGo(next.id)}
        aria-label={next ? `Next sample: ${next.label}` : 'Next sample'}
        title={next ? `Next: ${next.label} (→)` : 'Last in the list'}
        className="max-w-[11rem] gap-1 px-2"
      >
        {next ? <span className="hidden truncate font-mono text-xs md:inline">{next.label}</span> : null}
        <ChevronRight className="h-4 w-4 shrink-0" />
      </Button>
    </nav>
  )
}
