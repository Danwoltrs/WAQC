'use client'

import { FocusEvent, ReactNode, RefObject, useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Pencil } from 'lucide-react'

// Inline edits overwrite: whatever input takes focus starts selected. An input
// that places its own selection (the ICO's last segment) says so with
// data-select-on-focus and is left alone.
function selectOnFocus(e: FocusEvent<HTMLElement>) {
  if (e.target instanceof HTMLInputElement && !e.target.dataset.selectOnFocus) e.target.select()
}

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
      <PopoverContent
        align="start"
        className={`w-auto p-1 ${contentClassName || ''}`}
        // Delegated here because an editor's autoFocus lands before Radix's
        // focus scope mounts, and Radix then skips its own select-on-open.
        onFocus={selectOnFocus}
      >
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

/** Ends an in-place edit; `refocus` returns focus to the value (Enter / Escape). */
export type InPlaceDone = (opts?: { refocus?: boolean }) => void

/**
 * In-place editor (2026-09-30, Daniel: "editable in place instead of this
 * bubble underneath"): the value itself becomes its control, in the same
 * spot, and turns back into text when the edit ends. Hover shows a pencil.
 * `children(done)` renders the control, which commits or drops its value and
 * calls done(). Any input that takes focus starts selected, as in InlineEdit.
 */
export function InPlaceEdit({
  display,
  children,
  className,
}: {
  display: ReactNode
  children: (done: InPlaceDone) => ReactNode
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      triggerRef.current?.focus()
    }
  }, [editing])

  if (editing) {
    return (
      <div className={`w-full min-w-0 ${className || ''}`} onFocus={selectOnFocus}>
        {children((opts) => {
          refocus.current = !!opts?.refocus
          setEditing(false)
        })}
      </div>
    )
  }
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setEditing(true)}
      className={`group -mx-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40 ${className || ''}`}
    >
      {display}
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

/**
 * Calls `onLeave` when the user leaves an in-place editor: a press anywhere
 * outside its box, or focus moving outside it (Tab). A press inside the box (a
 * suggestion row under the input) does not count, so picking a match is never
 * lost to the input's blur, which Safari fires with no target for a button.
 */
export function useEditLeave(boxRef: RefObject<HTMLElement | null>, onLeave: () => void) {
  const latest = useRef(onLeave)
  latest.current = onLeave
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onDown = (e: MouseEvent) => {
      if (!box.contains(e.target as Node)) latest.current()
    }
    const onFocusOut = (e: globalThis.FocusEvent) => {
      const next = e.relatedTarget as Node | null
      if (next && !box.contains(next)) latest.current()
    }
    document.addEventListener('mousedown', onDown, true)
    box.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      box.removeEventListener('focusout', onFocusOut)
    }
  }, [boxRef])
}
