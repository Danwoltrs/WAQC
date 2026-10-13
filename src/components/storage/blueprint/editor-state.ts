/**
 * The blueprint editor's state as a pure reducer: the document being drawn,
 * undo/redo history, selection and the active tool. A drag is one undo step:
 * the canvas sends `checkpoint` on the first movement, then unrecorded patches.
 */
import {
  parseFloorPlan,
  type AccessSide, type FloorItem, type FloorItemKind, type FloorPlan, type Rect, type Rotation, type ShelfInput,
} from '@/lib/storage/floor-plan'
import { footprint, rotateQuarter, snap } from '@/lib/storage/geometry'
import type { Cubby, StorageLayout } from '@/lib/storage/layout'

export type ShapeKind = 'room' | 'item' | 'shelf'
export interface ShapeRef { kind: ShapeKind; key: string }
export interface EditorShelf extends ShelfInput { key: string; company_id: string | null; cubbies: Cubby[] }
export interface EditorDoc { plan: FloorPlan; shelves: EditorShelf[] }
export type Tool = 'select' | 'room' | 'shelf' | FloorItemKind
export type DrawTool = Exclude<Tool, 'select'>

export interface EditorState {
  doc: EditorDoc
  past: EditorDoc[]
  future: EditorDoc[]
  selected: ShapeRef | null
  tool: Tool
  dirty: boolean
}

export type ShapePatch = Partial<Rect> & {
  rot?: Rotation
  label?: string | null
  kind?: FloorItemKind
  shelf_letter?: string
  rows?: number
  columns?: number
  samples_per_position?: number
  access_side?: AccessSide
}

export type EditorAction =
  | { type: 'load'; doc: EditorDoc }
  | { type: 'tool'; tool: Tool }
  | { type: 'select'; ref: ShapeRef | null }
  | { type: 'checkpoint' }
  | { type: 'add'; shape: DrawTool; rect: Rect; id: string }
  | { type: 'patch'; ref: ShapeRef; patch: ShapePatch; record: boolean }
  | { type: 'rotate'; ref: ShapeRef }
  | { type: 'delete'; ref: ShapeRef }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; doc: EditorDoc }

export interface ShapeInfo { ref: ShapeRef; rect: Rect; rot: Rotation; fp: Rect; blocks: boolean }

const HISTORY = 100

export function initialEditorState(doc: EditorDoc): EditorState {
  return { doc, past: [], future: [], selected: null, tool: 'select', dirty: false }
}

export const shapeKey = (ref: ShapeRef): string => `${ref.kind}:${ref.key}`
export const sameRef = (a: ShapeRef | null | undefined, b: ShapeRef | null | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && a.key === b.key

export function shelfRect(s: Pick<ShelfInput, 'x_cm' | 'y_cm' | 'width_cm' | 'depth_cm'>): Rect {
  return { x: s.x_cm, y: s.y_cm, w: s.width_cm, d: s.depth_cm }
}

const rectOf = (r: Rect): Rect => ({ x: r.x, y: r.y, w: r.w, d: r.d })

export function listShapes(doc: EditorDoc): ShapeInfo[] {
  const rooms: ShapeInfo[] = doc.plan.rooms.map((r) => ({
    ref: { kind: 'room', key: r.id }, rect: rectOf(r), rot: 0, fp: rectOf(r), blocks: false,
  }))
  const items: ShapeInfo[] = doc.plan.items.map((it) => ({
    ref: { kind: 'item', key: it.id }, rect: rectOf(it), rot: it.rot, fp: footprint(it),
    blocks: it.kind !== 'door' && it.kind !== 'window',
  }))
  const shelves: ShapeInfo[] = doc.shelves.map((s) => {
    const rect = shelfRect(s)
    return { ref: { kind: 'shelf', key: s.key }, rect, rot: s.rot, fp: footprint({ ...rect, rot: s.rot }), blocks: true }
  })
  return [...rooms, ...items, ...shelves]
}

export function findShape(doc: EditorDoc, ref: ShapeRef | null): { info: ShapeInfo; item?: FloorItem; shelf?: EditorShelf } | null {
  if (!ref) return null
  const info = listShapes(doc).find((s) => sameRef(s.ref, ref))
  if (!info) return null
  if (ref.kind === 'item') return { info, item: doc.plan.items.find((i) => i.id === ref.key) }
  if (ref.kind === 'shelf') return { info, shelf: doc.shelves.find((s) => s.key === ref.key) }
  return { info }
}

export function nextShelfLetter(existing: string[]): string {
  const used = new Set(existing.map((l) => l.toUpperCase()))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const l of letters) if (!used.has(l)) return l
  for (const a of letters) for (const b of letters) if (!used.has(a + b)) return a + b
  return 'ZZ'
}

const DEFAULT_SIZES: Record<DrawTool, { w: number; d: number }> = {
  room: { w: 600, d: 400 }, shelf: { w: 120, d: 40 }, bench: { w: 200, d: 70 }, table: { w: 160, d: 80 },
  cabinet: { w: 100, d: 50 }, equipment: { w: 80, d: 60 }, door: { w: 90, d: 20 }, window: { w: 120, d: 20 },
  other: { w: 100, d: 60 },
}

/** A click without a drag places the shape at its usual size, centred on the click. */
export function defaultRect(tool: DrawTool, at: { x: number; y: number }, free = false): Rect {
  const { w, d } = DEFAULT_SIZES[tool]
  return { x: Math.max(0, snap(at.x - w / 2, free)), y: Math.max(0, snap(at.y - d / 2, free)), w, d }
}

/** The editor's copy of a layout; older bodies without lock or group read as unlocked and ungrouped. */
export function fromLayout(layout: Pick<StorageLayout, 'laboratory' | 'shelves'>): EditorDoc {
  const plan = parseFloorPlan(layout.laboratory.floor_plan)
  return {
    plan: plan.ok ? plan.value : layout.laboratory.floor_plan,
    shelves: layout.shelves.map((s) => ({ ...s, key: s.id, locked: s.locked === true, group_id: s.group_id ?? null })),
  }
}

export function toSavePayload(doc: EditorDoc): { floor_plan: FloorPlan; shelves: ShelfInput[] } {
  return {
    floor_plan: doc.plan,
    shelves: doc.shelves.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      shelf_letter: s.shelf_letter, rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm, rot: s.rot, access_side: s.access_side,
      locked: s.locked, group_id: s.group_id,
    })),
  }
}

function pickRect(p: ShapePatch): Partial<Rect> {
  const out: Partial<Rect> = {}
  if (p.x !== undefined) out.x = p.x
  if (p.y !== undefined) out.y = p.y
  if (p.w !== undefined) out.w = p.w
  if (p.d !== undefined) out.d = p.d
  return out
}

function patchShelf(s: EditorShelf, p: ShapePatch): EditorShelf {
  return {
    ...s,
    ...(p.x !== undefined ? { x_cm: p.x } : {}),
    ...(p.y !== undefined ? { y_cm: p.y } : {}),
    ...(p.w !== undefined ? { width_cm: p.w } : {}),
    ...(p.d !== undefined ? { depth_cm: p.d } : {}),
    ...(p.rot !== undefined ? { rot: p.rot } : {}),
    ...(p.shelf_letter !== undefined ? { shelf_letter: p.shelf_letter.trim().toUpperCase() } : {}),
    ...(p.rows !== undefined ? { rows: p.rows } : {}),
    ...(p.columns !== undefined ? { columns: p.columns } : {}),
    ...(p.samples_per_position !== undefined ? { samples_per_position: p.samples_per_position } : {}),
    ...(p.access_side !== undefined ? { access_side: p.access_side } : {}),
  }
}

function applyPatch(doc: EditorDoc, ref: ShapeRef, p: ShapePatch): EditorDoc {
  if (ref.kind === 'room') {
    return { ...doc, plan: { ...doc.plan, rooms: doc.plan.rooms.map((r) => (r.id === ref.key ? { ...r, ...pickRect(p) } : r)) } }
  }
  if (ref.kind === 'item') {
    return {
      ...doc,
      plan: {
        ...doc.plan,
        items: doc.plan.items.map((it) =>
          it.id === ref.key
            ? {
                ...it,
                ...pickRect(p),
                ...(p.rot !== undefined ? { rot: p.rot } : {}),
                ...(p.label !== undefined ? { label: p.label?.trim() || null } : {}),
                ...(p.kind !== undefined ? { kind: p.kind } : {}),
              }
            : it,
        ),
      },
    }
  }
  return { ...doc, shelves: doc.shelves.map((s) => (s.key === ref.key ? patchShelf(s, p) : s)) }
}

function removeShape(doc: EditorDoc, ref: ShapeRef): EditorDoc {
  if (ref.kind === 'room') return { ...doc, plan: { ...doc.plan, rooms: doc.plan.rooms.filter((r) => r.id !== ref.key) } }
  if (ref.kind === 'item') return { ...doc, plan: { ...doc.plan, items: doc.plan.items.filter((i) => i.id !== ref.key) } }
  return { ...doc, shelves: doc.shelves.filter((s) => s.key !== ref.key) }
}

function recorded(s: EditorState, doc: EditorDoc, extra: Partial<EditorState> = {}): EditorState {
  return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [], doc, dirty: true, ...extra }
}

function keepSelection(doc: EditorDoc, ref: ShapeRef | null): ShapeRef | null {
  return ref && listShapes(doc).some((x) => sameRef(x.ref, ref)) ? ref : null
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'load':
      return initialEditorState(a.doc)
    case 'saved':
      return { ...initialEditorState(a.doc), selected: keepSelection(a.doc, s.selected) }
    case 'tool':
      return { ...s, tool: a.tool }
    case 'select':
      return { ...s, selected: a.ref }
    case 'checkpoint':
      return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [] }
    case 'add': {
      const { shape, rect, id } = a
      if (shape === 'room') {
        const doc = { ...s.doc, plan: { ...s.doc.plan, rooms: [...s.doc.plan.rooms, { id, ...rect, name: null, locked: false }] } }
        return recorded(s, doc, { selected: { kind: 'room', key: id }, tool: 'select' })
      }
      if (shape === 'shelf') {
        const shelf: EditorShelf = {
          key: id, shelf_letter: nextShelfLetter(s.doc.shelves.map((x) => x.shelf_letter)),
          rows: 6, columns: 4, samples_per_position: 42,
          x_cm: rect.x, y_cm: rect.y, width_cm: rect.w, depth_cm: rect.d, rot: 0, access_side: 'front',
          locked: false, group_id: null, company_id: null, cubbies: [],
        }
        return recorded(s, { ...s.doc, shelves: [...s.doc.shelves, shelf] }, { selected: { kind: 'shelf', key: id }, tool: 'select' })
      }
      const item: FloorItem = { id, kind: shape, label: null, rot: 0, locked: false, group_id: null, ...rect }
      const doc = { ...s.doc, plan: { ...s.doc.plan, items: [...s.doc.plan.items, item] } }
      return recorded(s, doc, { selected: { kind: 'item', key: id }, tool: 'select' })
    }
    case 'patch': {
      const doc = applyPatch(s.doc, a.ref, a.patch)
      return a.record ? recorded(s, doc) : { ...s, doc, dirty: true }
    }
    case 'rotate': {
      if (a.ref.kind === 'room') return s
      const found = findShape(s.doc, a.ref)
      if (!found) return s
      return recorded(s, applyPatch(s.doc, a.ref, { rot: rotateQuarter(found.info.rot) }))
    }
    case 'delete':
      return recorded(s, removeShape(s.doc, a.ref), { selected: null })
    case 'undo': {
      if (s.past.length === 0) return s
      const doc = s.past[s.past.length - 1]
      return { ...s, doc, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: true, selected: keepSelection(doc, s.selected) }
    }
    case 'redo': {
      if (s.future.length === 0) return s
      const [doc, ...rest] = s.future
      return { ...s, doc, past: [...s.past, s.doc], future: rest, dirty: true, selected: keepSelection(doc, s.selected) }
    }
  }
}
