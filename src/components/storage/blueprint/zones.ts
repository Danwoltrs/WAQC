/**
 * Zones on the editor's shelves (spec 2026-10-13-storage-zone-assignment-design §4).
 * A cell is a cubby's place, "row:column"; its zone is this session's edit if
 * it has one, else the saved cubby's client, else general space (null).
 */
import type { StorageLayout } from '@/lib/storage/layout'
import type { ZoneChange } from '@/lib/storage/zone-changes'
import type { EditorDoc, EditorShelf } from './editor-state'

export type Cell = string
export type PickMode = 'only' | 'toggle' | 'range'
/** Cubbies picked on one shelf in the cubby display; a Shift+click block starts at `anchor`. */
export interface CubbyPick { shelfKey: string; cells: Cell[]; anchor: Cell | null }

type Grid = Pick<EditorShelf, 'rows' | 'columns'>
type Zoned = Pick<EditorShelf, 'rows' | 'columns' | 'cubbies' | 'zone_edits'>

export const cell = (row: number, column: number): Cell => `${row}:${column}`

export function cellParts(c: Cell): { row: number; column: number } {
  const [row, column] = c.split(':').map(Number)
  return { row, column }
}

export function inGrid(shelf: Grid, c: Cell): boolean {
  const { row, column } = cellParts(c)
  return Number.isInteger(row) && Number.isInteger(column)
    && row >= 1 && column >= 1 && row <= shelf.rows && column <= shelf.columns
}

/** Every cell of the shelf, row by row. */
export function shelfCells(shelf: Grid): Cell[] {
  const out: Cell[] = []
  for (let r = 1; r <= shelf.rows; r++) for (let c = 1; c <= shelf.columns; c++) out.push(cell(r, c))
  return out
}

/** Each cell's zone: this session's edit, else the saved cubby's client, else general. */
export function shelfZones(shelf: Zoned): Map<Cell, string | null> {
  const saved = new Map(shelf.cubbies.map((c) => [cell(c.row, c.column), c.company_id]))
  const edits = shelf.zone_edits ?? {}
  return new Map(shelfCells(shelf).map((c) => [c, c in edits ? edits[c] : saved.get(c) ?? null]))
}

/** How many cubbies each client holds on the shelf. */
export function zoneCounts(shelf: Zoned): Map<string, number> {
  const out = new Map<string, number>()
  for (const z of shelfZones(shelf).values()) if (z) out.set(z, (out.get(z) ?? 0) + 1)
  return out
}

/** The block of cells between two corners, row by row. */
export function rectCells(a: Cell, b: Cell): Cell[] {
  const p = cellParts(a)
  const q = cellParts(b)
  const out: Cell[] = []
  for (let r = Math.min(p.row, q.row); r <= Math.max(p.row, q.row); r++) {
    for (let c = Math.min(p.column, q.column); c <= Math.max(p.column, q.column); c++) out.push(cell(r, c))
  }
  return out
}

/** A click on a cubby: pick only it, add or remove it, or pick the block from the anchor. */
export function nextPick(pick: CubbyPick | null, shelfKey: string, c: Cell, mode: PickMode): CubbyPick {
  const same = pick?.shelfKey === shelfKey ? pick : null
  if (mode === 'toggle' && same) {
    const cells = same.cells.includes(c) ? same.cells.filter((x) => x !== c) : [...same.cells, c]
    return { shelfKey, cells, anchor: c }
  }
  if (mode === 'range' && same?.anchor) return { shelfKey, cells: rectCells(same.anchor, c), anchor: same.anchor }
  return { shelfKey, cells: [c], anchor: c }
}

/**
 * What Save sends: this session's edits, each shelf found in the fresh layout by
 * letter and each cell by row and column. Cells outside the grid or without a
 * cubby are left out; the database skips cubbies that already have that zone.
 */
export function zoneChanges(doc: EditorDoc, layout: Pick<StorageLayout, 'shelves'>): ZoneChange[] {
  const out: ZoneChange[] = []
  for (const shelf of doc.shelves) {
    const edits = Object.entries(shelf.zone_edits ?? {})
    if (edits.length === 0) continue
    const saved = layout.shelves.find((s) => s.shelf_letter === shelf.shelf_letter)
    if (!saved) continue
    for (const [c, company_id] of edits) {
      if (!inGrid(shelf, c)) continue
      const { row, column } = cellParts(c)
      const cubby = saved.cubbies.find((x) => x.row === row && x.column === column)
      if (cubby) out.push({ code: cubby.code, company_id })
    }
  }
  return out
}

/** `next` (a just-saved layout) with `prev`'s pending edits, shelf by letter: kept when the zones failed to save. */
export function carryZoneEdits(next: EditorDoc, prev: EditorDoc): EditorDoc {
  return {
    ...next,
    shelves: next.shelves.map((s) => {
      const edits = prev.shelves.find((p) => p.shelf_letter === s.shelf_letter)?.zone_edits
      return edits && Object.keys(edits).length > 0 ? { ...s, zone_edits: { ...edits } } : s
    }),
  }
}
