'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { DUPLICATE_BULK_MAX_EQUIVALENTS } from '@/lib/sample-duplicate'

const MIN_COUNT = 1
const MAX_COUNT = 20
const POPOVER_WIDTH = 240
const POPOVER_HEIGHT_ESTIMATE = 270
const EDGE_PADDING = 8

/**
 * Another quantity for the copies, as typed: bags send a count, bulk sends
 * its 60 kg bag equivalents in the same field (one container, at most 360;
 * the route derives the stored columns). Empty = the copies keep the
 * source's quantity.
 */
export interface DuplicateBagOverride {
  bag_count?: number
}

interface DuplicateCountPopoverProps {
  /** What the source sample is called on screen (never its SAN- lab number). */
  sampleLabel: string
  /** Source sample packaging: picks bag or bulk quantity fields. */
  bagType?: string | null
  /** The source's quantity as printed ("640 × 60 kg jute bags (38.4 MT)"), which the copies keep by default. */
  sourceQuantity?: string | null
  x: number
  y: number
  busy?: boolean
  onCancel: () => void
  onSubmit: (count: number, bags: DuplicateBagOverride) => void
}

export function DuplicateCountPopover({
  sampleLabel,
  bagType,
  sourceQuantity,
  x,
  y,
  busy = false,
  onCancel,
  onSubmit,
}: DuplicateCountPopoverProps) {
  const isBulk = (bagType || '') === 'bulk'
  const [count, setCount] = useState(1)
  // Blank keeps the source's quantity on every copy (a copy is the same
  // contract in its next container); whatever is typed replaces it on all.
  const [bagValue, setBagValue] = useState('')
  const typedQuantity = Math.floor(parseFloat(bagValue))
  const overCap = isBulk && Number.isFinite(typedQuantity) && typedQuantity > DUPLICATE_BULK_MAX_EQUIVALENTS
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Clamp position so the popover stays inside the viewport regardless of
  // where the user clicked.
  const clampedLeft = Math.max(
    EDGE_PADDING,
    Math.min(x, window.innerWidth - POPOVER_WIDTH - EDGE_PADDING)
  )
  const heightEstimate = POPOVER_HEIGHT_ESTIMATE
  const clampedTop = Math.max(
    EDGE_PADDING,
    Math.min(y, window.innerHeight - heightEstimate - EDGE_PADDING)
  )

  // Autofocus the input and select its contents so typing replaces "1".
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Esc closes; outside click closes; both no-op while busy so we don't
  // dismiss while inserts are in flight.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (busy) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
    }
    function onClickOutside(event: MouseEvent) {
      if (busy) return
      const node = containerRef.current
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [busy, onCancel])

  function handleSubmit() {
    if (busy || overCap) return
    const value = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(count) || MIN_COUNT))
    const bags: DuplicateBagOverride = {}
    // Send only what was typed: bags as a count, bulk as 60 kg equivalents.
    if (Number.isFinite(typedQuantity) && typedQuantity > 0) bags.bag_count = typedQuantity
    onSubmit(value, bags)
  }

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Duplicate sample"
      style={{
        position: 'fixed',
        left: clampedLeft,
        top: clampedTop,
        width: POPOVER_WIDTH,
        zIndex: 100,
      }}
      className="rounded-md border bg-popover text-popover-foreground shadow-md p-3 space-y-3"
    >
      <div>
        <div className="text-sm font-semibold">Duplicate sample</div>
        <div className="text-xs text-muted-foreground truncate" title={sampleLabel}>
          {sampleLabel}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Copies everything except the container number, which starts blank.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="duplicate-count-input" className="text-xs font-medium">
          How many copies?
        </label>
        <div className="flex items-center gap-2">
          <input
            id="duplicate-count-input"
            ref={inputRef}
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={count}
            disabled={busy}
            onChange={e => {
              const raw = parseInt(e.target.value, 10)
              if (Number.isNaN(raw)) {
                setCount(MIN_COUNT)
                return
              }
              setCount(Math.max(MIN_COUNT, Math.min(MAX_COUNT, raw)))
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
            className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <span className="text-xs text-muted-foreground">
            ({MIN_COUNT}–{MAX_COUNT})
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="duplicate-bags-input" className="text-xs font-medium">
          {isBulk ? '60 kg bag equivalents' : 'Bags'}
        </label>
        <input
          id="duplicate-bags-input"
          type="number"
          min={0}
          max={isBulk ? DUPLICATE_BULK_MAX_EQUIVALENTS : undefined}
          step="1"
          value={bagValue}
          disabled={busy}
          placeholder={isBulk ? `Up to ${DUPLICATE_BULK_MAX_EQUIVALENTS}` : 'Number of bags'}
          aria-invalid={overCap || undefined}
          onChange={e => setBagValue(e.target.value)}
          onKeyDown={submitOnEnter}
          className={`h-8 w-full rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${overCap ? 'border-destructive' : 'border-input'}`}
        />
        {overCap ? (
          <p className="text-[11px] text-destructive" role="alert">
            Bulk is at most {DUPLICATE_BULK_MAX_EQUIVALENTS} × 60 kg bag equivalents (21.6 MT) per sample.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Leave blank to keep {sourceQuantity ? <span className="text-foreground">{sourceQuantity}</span> : 'the source\'s quantity'}
            {count > 1 ? ` on all ${count} copies` : ''}.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSubmit} disabled={busy || overCap}>
          {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Duplicate
        </Button>
      </div>
    </div>
  )
}
