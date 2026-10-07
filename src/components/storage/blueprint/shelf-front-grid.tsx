'use client'

import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { rowLetter } from '@/lib/storage/floor-plan'
import type { Cubby } from '@/lib/storage/layout'
import type { ZoneStyle } from './zone-colors'

interface ShelfFrontGridProps {
  letter: string
  rows: number
  columns: number
  /** Samples per cubby, for cubbies the database has not created yet. */
  capacity: number
  cubbies: Cubby[]
  zones: Map<string, ZoneStyle>
  highlightCubbyId?: string | null
  onCubbyClick?: (cubby: Cubby | null, row: number, column: number) => void
}

/** A shelf seen from the front: row A on top, column 1 on the left, one square per cubby. */
export function ShelfFrontGrid({
  letter, rows, columns, capacity, cubbies, zones, highlightCubbyId, onCubbyClick,
}: ShelfFrontGridProps) {
  const byPosition = new Map(cubbies.map((c) => [`${c.row}:${c.column}`, c]))
  return (
    <div className="overflow-auto">
      <div
        className="inline-grid gap-px bg-border"
        style={{ gridTemplateColumns: `1.5rem repeat(${columns}, minmax(3.25rem, 1fr))` }}
      >
        <div className="bg-background" />
        {Array.from({ length: columns }, (_, c) => (
          <div key={`col-${c}`} className="bg-background text-center text-[11px] text-muted-foreground">{c + 1}</div>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <Fragment key={`row-${r}`}>
            <div className="flex items-center justify-center bg-background text-[11px] text-muted-foreground">
              {rowLetter(r + 1)}
            </div>
            {Array.from({ length: columns }, (_, c) => {
              const cubby = byPosition.get(`${r + 1}:${c + 1}`) ?? null
              const zone = cubby?.company_id ? zones.get(cubby.company_id) : undefined
              const occupied = cubby?.occupied ?? 0
              const cap = cubby?.capacity ?? capacity
              const code = `${letter}-${rowLetter(r + 1)}${c + 1}`
              return (
                <button
                  key={code}
                  type="button"
                  data-testid={`cubby-${code}`}
                  aria-label={`${code}, ${occupied} of ${cap}`}
                  onClick={() => onCubbyClick?.(cubby, r + 1, c + 1)}
                  className={cn(
                    'h-12 bg-background px-1.5 text-left text-[11px] tabular-nums hover:bg-muted',
                    occupied >= cap && 'font-semibold',
                    cubby && cubby.id === highlightCubbyId && 'outline outline-2 -outline-offset-2 outline-foreground',
                  )}
                  style={zone ? {
                    backgroundColor: `${zone.color}24`,
                    boxShadow: `inset 3px 0 0 ${zone.color}`,
                    backgroundImage: zone.hatched
                      ? `repeating-linear-gradient(45deg, ${zone.color}33 0 4px, transparent 4px 8px)`
                      : undefined,
                  } : undefined}
                >
                  <span className="block">{code}</span>
                  <span className="block text-muted-foreground">{occupied}/{cap}</span>
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
