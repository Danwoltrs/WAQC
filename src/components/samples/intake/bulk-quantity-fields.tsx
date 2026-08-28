'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { BULK_CONTAINER_MT, bulkQuantitiesFromContainers } from '@/lib/bag-quantity'

/**
 * Bulk is weight-driven: staff enter containers + total MT and the 60 kg
 * equivalent derives (spec addendum 2026-08-28). One control shared by every
 * quantity surface — intake, the contract panel, the certificate editor, the
 * cupping details dialog, the duplicate popover — so "720 × 21600 kg bulk
 * bags" cannot be typed into any of them again.
 *
 * Values are strings so a half-typed "43." survives a re-render; the caller
 * parses at its own boundary. The wrapper is `display: contents`, so the three
 * cells take the parent's layout (a popover column or a form grid).
 */
export function BulkQuantityFields({
  containers,
  mt,
  onChange,
  disabled,
}: {
  containers: string
  mt: string
  onChange: (next: { container_count: string; bags_quantity_mt: string }) => void
  disabled?: boolean
}) {
  const id = useId()
  // A blank container count reads as one container: the default the spec asks
  // for, without writing a value the user has not typed.
  const containerCount = Number(containers) > 0 ? Number(containers) : 1
  const suggestedMt = Number((containerCount * BULK_CONTAINER_MT).toFixed(1))
  const derived = bulkQuantitiesFromContainers(containerCount, Number(mt) > 0 ? Number(mt) : suggestedMt)
  const equivalent = derived.equivalent_60kg_bags

  return (
    <div className="contents">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-containers`} className="text-xs text-muted-foreground">Containers</label>
        <Input
          id={`${id}-containers`}
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          placeholder="1"
          value={containers}
          disabled={disabled}
          onChange={(e) => onChange({ container_count: e.target.value, bags_quantity_mt: mt })}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-mt`} className="text-xs text-muted-foreground">Total MT</label>
        <Input
          id={`${id}-mt`}
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          placeholder={String(suggestedMt)}
          value={mt}
          disabled={disabled}
          onChange={(e) => onChange({ container_count: containers, bags_quantity_mt: e.target.value })}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">60 kg equivalent</span>
        <div className="flex h-9 items-center text-sm text-muted-foreground">
          {equivalent ? `eq. ${equivalent} × 60 kg bags` : '—'}
        </div>
      </div>
    </div>
  )
}
