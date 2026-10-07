/**
 * The lab's blueprint as stored in laboratories.floor_plan, and the shelf rows
 * saved with it. Every length is a whole number of centimetres, seen from
 * above, origin top-left; `rot` turns a shape clockwise about its centre
 * (spec 2026-10-07-lab-storage-blueprint-design, section 3).
 */

export type Rotation = 0 | 90 | 180 | 270
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

export type FloorItemKind = 'bench' | 'table' | 'cabinet' | 'equipment' | 'door' | 'window' | 'other'
export const FLOOR_ITEM_KINDS: readonly FloorItemKind[] = ['bench', 'table', 'cabinet', 'equipment', 'door', 'window', 'other']
export const FLOOR_ITEM_LABELS: Record<FloorItemKind, string> = {
  bench: 'Bench', table: 'Table', cabinet: 'Cabinet', equipment: 'Equipment', door: 'Door', window: 'Window', other: 'Other',
}

export type AccessSide = 'front' | 'both'

export interface Rect { x: number; y: number; w: number; d: number }
export interface FloorRoom extends Rect { id: string }
export interface FloorItem extends Rect { id: string; kind: FloorItemKind; label: string | null; rot: Rotation }
export interface FloorPlan { version: 1; rooms: FloorRoom[]; items: FloorItem[] }

export interface ShelfInput {
  id?: string
  shelf_letter: string
  rows: number
  columns: number
  samples_per_position: number
  x_cm: number
  y_cm: number
  width_cm: number
  depth_cm: number
  rot: Rotation
  access_side: AccessSide
}

export const MIN_SIZE_CM = 20
export const MAX_PLAN_CM = 10_000
export const MAX_ROWS = 26
export const MAX_COLUMNS = 99
export const MAX_CUBBY_CAPACITY = 500

export const EMPTY_FLOOR_PLAN: FloorPlan = { version: 1, rooms: [], items: [] }

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const LETTER = /^[A-Z]{1,2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

function rectError(r: Record<string, unknown>, what: string): string | null {
  if (!isInt(r.x, 0, MAX_PLAN_CM) || !isInt(r.y, 0, MAX_PLAN_CM)) {
    return `${what}: position must be whole centimetres between 0 and ${MAX_PLAN_CM}`
  }
  if (!isInt(r.w, MIN_SIZE_CM, MAX_PLAN_CM) || !isInt(r.d, MIN_SIZE_CM, MAX_PLAN_CM)) {
    return `${what}: size must be whole centimetres between ${MIN_SIZE_CM} and ${MAX_PLAN_CM}`
  }
  return null
}

/** Validate a stored or submitted plan; null/undefined is an empty room. */
export function parseFloorPlan(input: unknown): Parsed<FloorPlan> {
  if (input === null || input === undefined) return { ok: true, value: EMPTY_FLOOR_PLAN }
  if (!isObj(input) || input.version !== 1) return { ok: false, error: 'Floor plan must be version 1' }
  const { rooms, items } = input
  if (!Array.isArray(rooms) || rooms.length > 50) return { ok: false, error: 'A floor plan has at most 50 room rectangles' }
  if (!Array.isArray(items) || items.length > 500) return { ok: false, error: 'A floor plan has at most 500 items' }

  const outRooms: FloorRoom[] = []
  for (const [i, r] of rooms.entries()) {
    if (!isObj(r) || !isId(r.id)) return { ok: false, error: `Room ${i + 1}: missing id` }
    const err = rectError(r, `Room ${i + 1}`)
    if (err) return { ok: false, error: err }
    outRooms.push({ id: r.id, x: r.x as number, y: r.y as number, w: r.w as number, d: r.d as number })
  }

  const outItems: FloorItem[] = []
  for (const [i, it] of items.entries()) {
    const what = `Item ${i + 1}`
    if (!isObj(it) || !isId(it.id)) return { ok: false, error: `${what}: missing id` }
    if (!FLOOR_ITEM_KINDS.includes(it.kind as FloorItemKind)) return { ok: false, error: `${what}: unknown kind` }
    if (!ROTATIONS.includes(it.rot as Rotation)) return { ok: false, error: `${what}: rotation must be 0, 90, 180 or 270` }
    if (it.label !== null && it.label !== undefined && typeof it.label !== 'string') {
      return { ok: false, error: `${what}: label must be text` }
    }
    const err = rectError(it, what)
    if (err) return { ok: false, error: err }
    const label = typeof it.label === 'string' ? it.label.trim().slice(0, 60) || null : null
    outItems.push({
      id: it.id, kind: it.kind as FloorItemKind, label, rot: it.rot as Rotation,
      x: it.x as number, y: it.y as number, w: it.w as number, d: it.d as number,
    })
  }

  return { ok: true, value: { version: 1, rooms: outRooms, items: outItems } }
}

/** Validate the shelves sent with a plan; letters are upper-cased and must be unique. */
export function parseShelfInputs(input: unknown): Parsed<ShelfInput[]> {
  if (!Array.isArray(input) || input.length > 100) return { ok: false, error: 'A lab has at most 100 shelves' }
  const out: ShelfInput[] = []
  const seen = new Set<string>()
  for (const [i, s] of input.entries()) {
    if (!isObj(s)) return { ok: false, error: `Shelf ${i + 1}: not a shelf` }
    const letter = typeof s.shelf_letter === 'string' ? s.shelf_letter.trim().toUpperCase() : ''
    if (!LETTER.test(letter)) return { ok: false, error: `Shelf ${i + 1}: the letter must be one or two letters A-Z` }
    if (seen.has(letter)) return { ok: false, error: `Shelf letter ${letter} is used twice` }
    seen.add(letter)
    const name = `Shelf ${letter}`
    if (s.id !== undefined && s.id !== null && !(typeof s.id === 'string' && UUID.test(s.id))) {
      return { ok: false, error: `${name}: unknown id` }
    }
    if (!isInt(s.rows, 1, MAX_ROWS)) return { ok: false, error: `${name}: rows must be 1 to ${MAX_ROWS}` }
    if (!isInt(s.columns, 1, MAX_COLUMNS)) return { ok: false, error: `${name}: columns must be 1 to ${MAX_COLUMNS}` }
    if (!isInt(s.samples_per_position, 1, MAX_CUBBY_CAPACITY)) {
      return { ok: false, error: `${name}: samples per cubby must be 1 to ${MAX_CUBBY_CAPACITY}` }
    }
    if (!isInt(s.x_cm, 0, MAX_PLAN_CM) || !isInt(s.y_cm, 0, MAX_PLAN_CM)) {
      return { ok: false, error: `${name}: position must be whole centimetres between 0 and ${MAX_PLAN_CM}` }
    }
    if (!isInt(s.width_cm, MIN_SIZE_CM, MAX_PLAN_CM) || !isInt(s.depth_cm, MIN_SIZE_CM, MAX_PLAN_CM)) {
      return { ok: false, error: `${name}: size must be whole centimetres between ${MIN_SIZE_CM} and ${MAX_PLAN_CM}` }
    }
    if (!ROTATIONS.includes(s.rot as Rotation)) return { ok: false, error: `${name}: rotation must be 0, 90, 180 or 270` }
    if (s.access_side !== 'front' && s.access_side !== 'both') return { ok: false, error: `${name}: access side must be front or both` }
    out.push({
      ...(typeof s.id === 'string' ? { id: s.id } : {}),
      shelf_letter: letter,
      rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm,
      rot: s.rot as Rotation, access_side: s.access_side,
    })
  }
  return { ok: true, value: out }
}

/** Row 1 is A, the top row; mirrors generate_position_code() in the database. */
export function rowLetter(row: number): string {
  return String.fromCharCode(64 + row)
}

export function positionCode(letter: string, row: number, column: number): string {
  return `${letter}-${rowLetter(row)}${column}`
}
