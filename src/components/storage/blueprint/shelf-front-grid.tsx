'use client'

import { Fragment, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { rowLetter } from '@/lib/storage/floor-plan'
import type { Cubby } from '@/lib/storage/layout'
import { cell, type Cell } from './zones'
import type { ZoneStyle } from './zone-colors'

/** How a cubby was clicked: Cmd/Ctrl adds or removes it, Shift picks a block. */
export interface CubbyClick { toggle: boolean; range: boolean }

interface ShelfFrontGridProps {
  letter: string
  rows: number
  columns: number
  /** Samples per cubby, for cubbies the database has not created yet. */
  capacity: number
  cubbies: Cubby[]
  zones: Map<string, ZoneStyle>
  /** Each cell's zone, pending assignments included; without it, the saved cubbies' zones. */
  zoneOf?: Map<Cell, string | null>
  /** Client names, written in a zoned cubby. */
  names?: Map<string, string>
  /** Picked cubbies (editing); each cubby then says whether it is picked. */
  picked?: ReadonlySet<Cell>
  highlightCubbyId?: string | null
  onCubbyClick?: (cubby: Cubby | null, row: number, column: number, how: CubbyClick) => void
}

/** A shelf seen from the front: row A on top, column 1 on the left, one large square per cubby. */
export function ShelfFrontGrid({
  letter, rows, columns, capacity, cubbies, zones, zoneOf, names, picked, highlightCubbyId, onCubbyClick,
}: ShelfFrontGridProps) {
  const byPosition = new Map(cubbies.map((c) => [cell(c.row, c.column), c]))
  const click = (cubby: Cubby | null, row: number, column: number) => (e: MouseEvent) =>
    onCubbyClick?.(cubby, row, column, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey })
  return (
    <div className="overflow-auto">
      <div
        className="inline-grid gap-px bg-border"
        style={{ gridTemplateColumns: `1.5rem repeat(${columns}, minmax(5.5rem, 1fr))` }}
      >
        <div className="bg-background" />
        {Array.from({ length: columns }, (_, c) => (
          <div key={`col-${c}`} className="bg-background py-1 text-center text-xs text-muted-foreground">{c + 1}</div>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <Fragment key={`row-${r}`}>
            <div className="flex items-center justify-center bg-background text-xs text-muted-foreground">
              {rowLetter(r + 1)}
            </div>
            {Array.from({ length: columns }, (_, c) => {
              const at = cell(r + 1, c + 1)
              const cubby = byPosition.get(at) ?? null
              const companyId = zoneOf ? zoneOf.get(at) ?? null : cubby?.company_id ?? null
              const zone = companyId ? zones.get(companyId) : undefined
              const client = companyId ? names?.get(companyId) : undefined
              const occupied = cubby?.occupied ?? 0
              const cap = cubby?.capacity ?? capacity
              const code = `${letter}-${rowLetter(r + 1)}${c + 1}`
              const isPicked = picked?.has(at) ?? false
              return (
                <button
                  key={code}
                  type="button"
                  data-testid={`cubby-${code}`}
                  aria-label={`${code}, ${occupied} of ${cap}${client ? `, ${client}` : ''}`}
                  aria-pressed={picked ? isPicked : undefined}
                  onClick={click(cubby, r + 1, c + 1)}
                  className={cn(
                    'flex h-[4.5rem] flex-col items-start justify-between bg-background p-2 text-left text-xs tabular-nums hover:bg-muted',
                    occupied >= cap && 'font-semibold',
                    (isPicked || (cubby !== null && cubby.id === highlightCubbyId)) &&
                      'outline outline-2 -outline-offset-2 outline-foreground',
                  )}
                  style={zone ? {
                    backgroundColor: `${zone.color}24`,
                    boxShadow: `inset 3px 0 0 ${zone.color}`,
                    backgroundImage: zone.hatched
                      ? `repeating-linear-gradient(45deg, ${zone.color}33 0 4px, transparent 4px 8px)`
                      : undefined,
                  } : undefined}
                >
                  <span className="block font-medium">{code}</span>
                  <span className="block text-muted-foreground">{occupied}/{cap}</span>
                  {client && <span className="block w-full truncate">{client}</span>}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
