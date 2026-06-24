'use client'

import { ReactNode, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Lock, Pencil, X } from 'lucide-react'

/**
 * A clickable read-only quadrant card. Shows a title, optional right-aligned meta,
 * a summary line and a chart/body. Clicking anywhere opens the focused edit panel
 * (unless `locked`). Mirrors the dashboard mockup ("Click to edit" affordance).
 */
export function QuadrantCard({
  title,
  meta,
  summary,
  locked,
  lockedReason,
  onEdit,
  children,
}: {
  title: string
  meta?: ReactNode
  summary?: ReactNode
  locked?: boolean
  lockedReason?: string | null
  onEdit?: () => void
  children: ReactNode
}) {
  const clickable = !locked && !!onEdit
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onEdit : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onEdit?.()
              }
            }
          : undefined
      }
      className={[
        'group relative flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors',
        clickable ? 'cursor-pointer hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring' : '',
      ].join(' ')}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {meta ? <div className="text-xs text-muted-foreground text-right">{meta}</div> : null}
      </div>
      {summary ? <div className="mb-3 text-sm text-muted-foreground">{summary}</div> : null}
      <div className="flex-1">{children}</div>
      <div className="mt-3 flex items-center justify-end text-xs">
        {locked ? (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Lock className="h-3.5 w-3.5" />
            {lockedReason || 'Locked'}
          </span>
        ) : clickable ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <Pencil className="h-3.5 w-3.5" />
            Click to edit
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** A centered modal panel that floats over the dimmed quadrant grid. */
export function EditPanel({
  open,
  title,
  onCancel,
  onSave,
  saving,
  saveLabel = 'Save',
  wide,
  children,
}: {
  open: boolean
  title: string
  onCancel: () => void
  onSave: () => void
  saving?: boolean
  saveLabel?: string
  wide?: boolean
  children: ReactNode
}) {
  // Hooks must run unconditionally; render is gated below.
  const titleId = useId()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'relative flex max-h-[88vh] w-full flex-col rounded-2xl border border-border bg-background shadow-2xl',
          wide ? 'max-w-4xl' : 'max-w-2xl',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-sm font-semibold text-foreground">{title}</h2>
          <button
            onClick={onCancel}
            autoFocus
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Compact metric tile (label over big value), used for moisture / density etc. */
export function MetricCell({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}
