'use client'

import { Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EditorShelf } from './editor-state'
import { zoneCounts } from './zones'
import type { ZoneStyle } from './zone-colors'

/** A shelf in the side panel: its size, how many cubbies each client holds, and Open cubbies. */
export function ShelfSummary({ shelf, zones, names, onOpen }: {
  shelf: EditorShelf; zones: Map<string, ZoneStyle>; names: Map<string, string>; onOpen: () => void
}) {
  const counts = zoneCounts(shelf)
  const total = shelf.rows * shelf.columns
  const zoned = [...counts.values()].reduce((a, b) => a + b, 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {total} cubbies, {(total * shelf.samples_per_position).toLocaleString()} samples
      </p>
      <ul className="space-y-1 text-xs">
        {[...counts].map(([id, n]) => (
          <li key={id} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ backgroundColor: zones.get(id)?.color }} />
            <span className="truncate">{names.get(id) ?? 'Client'}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{n}</span>
          </li>
        ))}
        {zoned < total && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 border" />
            <span>General</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{total - zoned}</span>
          </li>
        )}
      </ul>
      <Button variant="outline" size="sm" className="w-full" onClick={onOpen}>
        <Grid3x3 className="mr-1.5 h-4 w-4" />Open cubbies
      </Button>
    </div>
  )
}
