'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Changes the editor made on its own (the intake's copy of a specification,
 * read from the sys contract: quality-copy-edits) that the lab still has to
 * look at. Amber until confirmed, green after (Daniel 2026-09-29).
 */
export type ReviewTone = 'pending' | 'confirmed'

export interface SpecReviewItem {
  id: string
  /** The editor section it belongs to. */
  section: string
  /** What changed: "Description", "Total defects". */
  label: string
  /** Why, in one line. */
  summary: string
  /** Before and after (Daniel 2026-09-29: "was = change to ="). */
  was?: string
  now?: string
  /** False when the copy needs a look but nothing was changed (no Undo). */
  changed: boolean
  status: ReviewTone
  /** Screens: the row that now carries the requirement. */
  screen?: string
}

export interface SpecReview {
  items: SpecReviewItem[]
  onConfirm: (id: string) => void
  onUndo: (id: string) => void
}

/** The tint of a field a review item changed. */
export const REVIEW_FIELD: Record<ReviewTone, string> = {
  pending: '!border-amber-500 bg-amber-50 dark:bg-amber-500/10',
  confirmed: '!border-green-500 bg-green-50 dark:bg-green-500/10',
}

/** The tone of a section's items: amber while any is pending. */
export function sectionTone(items: SpecReviewItem[]): ReviewTone | null {
  if (items.length === 0) return null
  return items.some((i) => i.status === 'pending') ? 'pending' : 'confirmed'
}

/** The nav mark beside a section's name. */
export function ReviewMark({ tone }: { tone: ReviewTone | null }) {
  if (!tone) return null
  return tone === 'pending' ? (
    <span className="ml-auto shrink-0 rounded-sm bg-amber-100 px-1.5 py-px text-[10.5px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
      Check
    </span>
  ) : (
    <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-label="Checked" />
  )
}

/** "Description · Copied from the contract.", then Was and Changed to. */
function ReviewBody({ item }: { item: SpecReviewItem }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p>
        <span className="font-semibold">{item.label}</span>
        <span className="opacity-80"> · {item.summary}</span>
      </p>
      {item.was != null && item.now != null && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
          <dt className="opacity-70">Was:</dt>
          <dd className="break-words line-through decoration-1 opacity-70">{item.was}</dd>
          <dt className="opacity-70">Changed to:</dt>
          <dd className="break-words font-medium">{item.now}</dd>
        </dl>
      )}
    </div>
  )
}

/** One note per item of the section: what changed, Undo, and Correct. */
export function ReviewNotes({ review, section }: { review: SpecReview; section: string }) {
  const items = review.items.filter((i) => i.section === section)
  if (items.length === 0) return null
  return (
    <div className="mb-4 space-y-2">
      {items.map((item) =>
        item.status === 'pending' ? (
          <div
            key={item.id}
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-500/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <ReviewBody item={item} />
            <span className="flex shrink-0 items-center gap-2 self-start">
              {item.changed && (
                <Button type="button" variant="ghost" onClick={() => review.onUndo(item.id)} className="h-7 px-2.5 text-xs">
                  Undo
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => review.onConfirm(item.id)} className="h-7 px-2.5 text-xs">
                <Check className="mr-1 h-3.5 w-3.5" />
                {item.changed ? 'Correct' : 'Checked'}
              </Button>
            </span>
          </div>
        ) : (
          <div
            key={item.id}
            role="status"
            className={cn(
              'flex gap-2 rounded-md border border-green-500/60 bg-green-50 px-3 py-2 text-sm text-green-900',
              'dark:bg-green-500/10 dark:text-green-200',
            )}
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0 self-start" aria-hidden />
            <ReviewBody item={item} />
          </div>
        ),
      )}
    </div>
  )
}
