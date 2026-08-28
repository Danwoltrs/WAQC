'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { BulkQuantityFields } from '@/components/samples/intake/bulk-quantity-fields'
import { bulkContainerCount } from '@/lib/bag-quantity'

const MIN_COUNT = 1
const MAX_COUNT = 20
const POPOVER_WIDTH = 240
const POPOVER_HEIGHT_ESTIMATE = 250
const EDGE_PADDING = 8

/**
 * Per-duplicate quantity override sent to the API: bags send a count, bulk
 * sends containers + total MT (the route derives the stored columns from
 * the pair). Empty = copy the source verbatim.
 */
export interface DuplicateBagOverride {
  bag_count?: number
  container_count?: number
  bags_quantity_mt?: number
}

interface DuplicateCountPopoverProps {
  trackingNumber: string
  /** Source sample bag info, used to label the field and prefill its value. */
  bagType?: string | null
  bagCount?: number | null
  bagsQuantityMt?: number | null
  /** Stored bulk container count; a legacy bulk row without one is estimated from its MT. */
  containerCount?: number | null
  x: number
  y: number
  busy?: boolean
  onCancel: () => void
  onSubmit: (count: number, bags: DuplicateBagOverride) => void
}

export function DuplicateCountPopover({
  trackingNumber,
  bagType,
  bagCount,
  bagsQuantityMt,
  containerCount,
  x,
  y,
  busy = false,
  onCancel,
  onSubmit,
}: DuplicateCountPopoverProps) {
  const isBulk = (bagType || '') === 'bulk'
  const [count, setCount] = useState(1)
  // Prefilled from the source so duplicating without touching it keeps the same
  // quantity; the user can change it to give the copies a different size.
  const sourceContainers = isBulk
    ? bulkContainerCount({ container_count: containerCount, bags_quantity_mt: bagsQuantityMt })
    : 0
  const [containers, setContainers] = useState<string>(() => (isBulk ? String(sourceContainers) : ''))
  const [mt, setMt] = useState<string>(() => (isBulk && bagsQuantityMt != null ? String(bagsQuantityMt) : ''))
  const [bagValue, setBagValue] = useState<string>(() => (!isBulk && bagCount != null ? String(bagCount) : ''))
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Clamp position so the popover stays inside the viewport regardless of
  // where the user clicked.
  const clampedLeft = Math.max(
    EDGE_PADDING,
    Math.min(x, window.innerWidth - POPOVER_WIDTH - EDGE_PADDING)
  )
  // Bulk shows one more row of fields than bags.
  const heightEstimate = POPOVER_HEIGHT_ESTIMATE + (isBulk ? 60 : 0)
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
    if (busy) return
    const value = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(count) || MIN_COUNT))
    const bags: DuplicateBagOverride = {}
    // Only send an override when the user actually changed the quantity; an
    // untouched value lets the API copy the source verbatim (no recompute).
    if (isBulk) {
      // Both halves travel together: the route derives the stored columns
      // from the pair. A cleared MT sends containers alone and the route
      // falls back to containers × 21.6.
      const nextContainers = Math.floor(parseFloat(containers)) || sourceContainers
      const nextMt = parseFloat(mt)
      const hasMt = Number.isFinite(nextMt) && nextMt > 0
      const mtChanged = hasMt && nextMt !== (bagsQuantityMt ?? NaN)
      if (nextContainers !== sourceContainers || mtChanged) {
        bags.container_count = nextContainers
        if (hasMt) bags.bags_quantity_mt = nextMt
      }
    } else {
      const num = parseFloat(bagValue)
      if (Number.isFinite(num) && num > 0 && num !== (bagCount ?? NaN)) {
        bags.bag_count = Math.floor(num)
      }
    }
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
        <div className="text-xs text-muted-foreground truncate" title={trackingNumber}>
          {trackingNumber}
        </div>
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
        {isBulk ? (
          <div className="grid grid-cols-2 gap-2" onKeyDown={submitOnEnter}>
            <BulkQuantityFields
              containers={containers}
              mt={mt}
              disabled={busy}
              onChange={(next) => {
                setContainers(next.container_count)
                setMt(next.bags_quantity_mt)
              }}
            />
          </div>
        ) : (
          <>
            <label htmlFor="duplicate-bags-input" className="text-xs font-medium">
              Bags
            </label>
            <input
              id="duplicate-bags-input"
              type="number"
              min={0}
              step="1"
              value={bagValue}
              disabled={busy}
              placeholder="Number of bags"
              onChange={e => setBagValue(e.target.value)}
              onKeyDown={submitOnEnter}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </>
        )}
        <p className="text-[11px] text-muted-foreground">
          Applied to {count > 1 ? `all ${count} copies` : 'the copy'}; leave as-is to keep the original quantity.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSubmit} disabled={busy}>
          {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Duplicate
        </Button>
      </div>
    </div>
  )
}
