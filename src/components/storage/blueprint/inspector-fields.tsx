'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

/** Which field "Edit details" and "Rename" put the cursor in. */
export type FocusTarget = 'first' | 'name'

/**
 * The text of a field that commits on blur or Enter, so one edit is one undo
 * step. Clicking another shape on the plan selects it before the field blurs,
 * so the shape to commit to and its starting value are taken at focus.
 */
function useDraft<T>(value: T, show: (v: T) => string) {
  const [text, setText] = useState(show(value))
  const editing = useRef<{ from: T; commit: (v: T) => void } | null>(null)
  const latest = useRef(value)
  latest.current = value
  useEffect(() => {
    if (!editing.current) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return {
    text,
    setText,
    begin: (commit: (v: T) => void) => { editing.current = { from: latest.current, commit } },
    /** Commit `next` when `accept` holds it, then show the selected shape's value. */
    end: (next: T | null, accept: (next: T, from: T) => boolean, current: (v: T) => void) => {
      const started = editing.current ?? { from: latest.current, commit: current }
      editing.current = null
      if (next !== null && next !== started.from && accept(next, started.from)) started.commit(next)
      setText(show(latest.current))
    },
  }
}

/** A whole number between min and max. */
export function NumberField({ label, value, min, max, onCommit, focus, disabled }: {
  label: string; value: number; min: number; max: number; onCommit: (n: number) => void
  focus?: FocusTarget; disabled?: boolean
}) {
  const draft = useDraft(value, String)
  const end = () => {
    const n = Number.parseInt(draft.text, 10)
    draft.end(Number.isFinite(n) ? n : null, (next) => next >= min && next <= max, onCommit)
  }
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={draft.text} inputMode="numeric" aria-label={label} className="h-8" data-focus={focus} disabled={disabled}
        onFocus={() => draft.begin(onCommit)}
        onChange={(e) => draft.setText(e.target.value)} onBlur={end}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

export function TextField({ label, value, onCommit, transform, valid, focus }: {
  label: string
  value: string
  onCommit: (v: string) => void
  transform?: (v: string) => string
  /** A value that fails this snaps back instead of committing. */
  valid?: (v: string) => boolean
  focus?: FocusTarget
}) {
  const draft = useDraft(value, (v) => v)
  const end = () => draft.end(transform ? transform(draft.text) : draft.text, (next) => !valid || valid(next), onCommit)
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={draft.text} aria-label={label} className="h-8" data-focus={focus}
        onFocus={() => draft.begin(onCommit)}
        onChange={(e) => draft.setText(e.target.value)} onBlur={end}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}
