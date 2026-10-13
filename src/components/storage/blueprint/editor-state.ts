/**
 * The blueprint editor's state as a pure reducer: the document being drawn,
 * undo/redo history, the selection and the active tool. A drag is one undo
 * step: the canvas sends `checkpoint` on the first movement, then unrecorded
 * patches. Clicking a group member selects the whole group; a locked shape
 * refuses anything that would move it, and says so through `notice`. Lab staff
 * without layout rights (`canLayout` false) may only select, assign zones and undo.
 */
import {
  MAX_PLAN_CM, cleanName, parseFloorPlan,
  type AccessSide, type FloorGroup, type FloorItem, type FloorItemKind, type FloorPlan, type FloorRoom, type Rect,
  type Rotation, type ShelfInput,
} from '@/lib/storage/floor-plan'
import { footprint, fromFootprint, rectsOverlap, snap } from '@/lib/storage/geometry'
import {
  alignOffsets, distributeOffsets, duplicateOffset, moveFootprintBy, onPlanOffset, turnFootprint, unionRect,
  type AlignEdge, type Axis, type Offset, type Turn,
} from '@/lib/storage/arrange'
import type { Cubby, StorageLayout } from '@/lib/storage/layout'
import { inGrid, nextPick, shelfCells, shelfZones, type Cell, type CubbyPick, type PickMode } from './zones'

export type ShapeKind = 'room' | 'item' | 'shelf'
export interface ShapeRef { kind: ShapeKind; key: string }
export interface EditorShelf extends ShelfInput {
  key: string
  company_id: string | null
  cubbies: Cubby[]
  /** Zones assigned since the plan was loaded or saved, by "row:column"; Save sends only these. */
  zone_edits?: Record<Cell, string | null>
}
export interface EditorDoc { plan: FloorPlan; shelves: EditorShelf[] }
export type Tool = 'select' | 'room' | 'shelf' | FloorItemKind
export type DrawTool = Exclude<Tool, 'select'>

export interface EditorState {
  doc: EditorDoc
  past: EditorDoc[]
  future: EditorDoc[]
  selection: ShapeRef[]
  tool: Tool
  dirty: boolean
  /** Why the last action was refused; `seq` changes on every refusal so each one can be shown. */
  notice: { seq: number; text: string } | null
  /** How far saves have moved the plan since it was loaded, so the view can move with it. */
  shift: Offset
  /** False for lab staff without layout rights: every action that changes a shape is refused. */
  canLayout: boolean
  /** Cubbies picked in the cubby display; it goes when the selection changes. */
  cubbyPick: CubbyPick | null
}

export type ShapePatch = Partial<Rect> & {
  rot?: Rotation
  label?: string | null
  name?: string | null
  kind?: FloorItemKind
  shelf_letter?: string
  rows?: number
  columns?: number
  samples_per_position?: number
  access_side?: AccessSide
}

export interface RefPatch { ref: ShapeRef; patch: ShapePatch }

/** A shelf as copied: no id, zone, cubbies or lock. */
export type ClipShelf = Omit<ShelfInput, 'id' | 'locked'>
/** Shapes copied for pasting, where they were; ids and groups are remapped on paste. */
export interface Clip { version: 1; rooms: FloorRoom[]; items: FloorItem[]; shelves: ClipShelf[]; groups: FloorGroup[] }

export type EditorAction =
  | { type: 'load'; doc: EditorDoc; canLayout?: boolean }
  | { type: 'tool'; tool: Tool }
  | { type: 'select'; refs: ShapeRef[]; exact?: boolean }
  | { type: 'toggle'; ref: ShapeRef }
  | { type: 'selectAll' }
  | { type: 'checkpoint' }
  | { type: 'add'; shape: DrawTool; rect: Rect; id: string }
  | { type: 'patch'; ref: ShapeRef; patch: ShapePatch; record: boolean }
  | { type: 'patchMany'; patches: RefPatch[]; record: boolean }
  | { type: 'rotate'; turn: Turn }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'lock'; locked: boolean }
  | { type: 'delete' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; doc: EditorDoc; shift?: Offset; dirty?: boolean }
  | { type: 'pickCubby'; shelfKey: string; cell: Cell; mode: PickMode }
  | { type: 'clearPick' }
  | { type: 'assignZone'; companyId: string | null }
  | { type: 'group'; id: string }
  | { type: 'ungroup' }
  | { type: 'renameGroup'; id: string; name: string | null }
  | { type: 'align'; edge: AlignEdge }
  | { type: 'distribute'; axis: Axis }
  | { type: 'duplicate'; seed: string }
  | { type: 'paste'; clip: Clip; at: { x: number; y: number }; seed: string }

export interface ShapeInfo {
  ref: ShapeRef
  rect: Rect
  rot: Rotation
  fp: Rect
  blocks: boolean
  locked: boolean
  group: string | null
}

export const LOCKED_NOTICE = 'Unlock it first'

const HISTORY = 100

export function initialEditorState(doc: EditorDoc, canLayout = true): EditorState {
  return {
    doc, past: [], future: [], selection: [], tool: 'select', dirty: false, notice: null, shift: { dx: 0, dy: 0 },
    canLayout, cubbyPick: null,
  }
}

export const shapeKey = (ref: ShapeRef): string => `${ref.kind}:${ref.key}`
export const sameRef = (a: ShapeRef | null | undefined, b: ShapeRef | null | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && a.key === b.key
export const isSelected = (selection: ShapeRef[], ref: ShapeRef): boolean => selection.some((r) => sameRef(r, ref))

/** The inverse of shapeKey: `shelf:abc` back to a ref; null for anything else. */
export function refFromKey(k: string): ShapeRef | null {
  const i = k.indexOf(':')
  const kind = k.slice(0, i)
  if (i < 1 || (kind !== 'room' && kind !== 'item' && kind !== 'shelf')) return null
  return { kind, key: k.slice(i + 1) }
}

export function shelfRect(s: Pick<ShelfInput, 'x_cm' | 'y_cm' | 'width_cm' | 'depth_cm'>): Rect {
  return { x: s.x_cm, y: s.y_cm, w: s.width_cm, d: s.depth_cm }
}

const rectOf = (r: Rect): Rect => ({ x: r.x, y: r.y, w: r.w, d: r.d })

export function listShapes(doc: EditorDoc): ShapeInfo[] {
  const rooms: ShapeInfo[] = doc.plan.rooms.map((r) => ({
    ref: { kind: 'room', key: r.id }, rect: rectOf(r), rot: 0, fp: rectOf(r), blocks: false, locked: r.locked, group: null,
  }))
  const items: ShapeInfo[] = doc.plan.items.map((it) => ({
    ref: { kind: 'item', key: it.id }, rect: rectOf(it), rot: it.rot, fp: footprint(it),
    blocks: it.kind !== 'door' && it.kind !== 'window', locked: it.locked, group: it.group_id,
  }))
  const shelves: ShapeInfo[] = doc.shelves.map((s) => {
    const rect = shelfRect(s)
    return {
      ref: { kind: 'shelf', key: s.key }, rect, rot: s.rot, fp: footprint({ ...rect, rot: s.rot }),
      blocks: true, locked: s.locked, group: s.group_id,
    }
  })
  return [...rooms, ...items, ...shelves]
}

export function findShape(doc: EditorDoc, ref: ShapeRef | null):
  { info: ShapeInfo; room?: FloorRoom; item?: FloorItem; shelf?: EditorShelf } | null {
  if (!ref) return null
  const info = listShapes(doc).find((s) => sameRef(s.ref, ref))
  if (!info) return null
  if (ref.kind === 'room') return { info, room: doc.plan.rooms.find((r) => r.id === ref.key) }
  if (ref.kind === 'item') return { info, item: doc.plan.items.find((i) => i.id === ref.key) }
  return { info, shelf: doc.shelves.find((s) => s.key === ref.key) }
}

export function shapeLocked(doc: EditorDoc, ref: ShapeRef): boolean {
  if (ref.kind === 'room') return doc.plan.rooms.find((r) => r.id === ref.key)?.locked === true
  if (ref.kind === 'item') return doc.plan.items.find((i) => i.id === ref.key)?.locked === true
  return doc.shelves.find((s) => s.key === ref.key)?.locked === true
}

export function shapeGroupId(doc: EditorDoc, ref: ShapeRef): string | null {
  if (ref.kind === 'item') return doc.plan.items.find((i) => i.id === ref.key)?.group_id ?? null
  if (ref.kind === 'shelf') return doc.shelves.find((s) => s.key === ref.key)?.group_id ?? null
  return null
}

export function groupMembers(doc: EditorDoc, groupId: string): ShapeRef[] {
  return [
    ...doc.plan.items.filter((i) => i.group_id === groupId).map((i): ShapeRef => ({ kind: 'item', key: i.id })),
    ...doc.shelves.filter((s) => s.group_id === groupId).map((s): ShapeRef => ({ kind: 'shelf', key: s.key })),
  ]
}

function uniqueRefs(refs: ShapeRef[]): ShapeRef[] {
  const seen = new Set<string>()
  return refs.filter((r) => {
    const k = shapeKey(r)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Every member of each group a ref belongs to; rooms and ungrouped shapes stand alone. */
export function expandSelection(doc: EditorDoc, refs: ShapeRef[]): ShapeRef[] {
  return uniqueRefs(refs.flatMap((r) => {
    const g = shapeGroupId(doc, r)
    return g ? groupMembers(doc, g) : [r]
  }))
}

/** The refs that still name a shape in `doc`, in the order given. */
function keepSelection(doc: EditorDoc, refs: ShapeRef[]): ShapeRef[] {
  const keys = new Set(listShapes(doc).map((s) => shapeKey(s.ref)))
  return refs.filter((r) => keys.has(shapeKey(r)))
}

export function selectedShapes(doc: EditorDoc, selection: ShapeRef[]): ShapeInfo[] {
  return listShapes(doc).filter((s) => isSelected(selection, s.ref))
}

/** What a selection box picks: items and shelves it touches, a room only when it holds all of it. */
export function boxSelection(doc: EditorDoc, box: Rect): ShapeRef[] {
  const holds = (r: Rect) => r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.d <= box.y + box.d
  return listShapes(doc)
    .filter((s) => (s.ref.kind === 'room' ? holds(s.fp) : rectsOverlap(s.fp, box)))
    .map((s) => s.ref)
}

export function nextShelfLetter(existing: string[]): string {
  const used = new Set(existing.map((l) => l.toUpperCase()))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const l of letters) if (!used.has(l)) return l
  for (const a of letters) for (const b of letters) if (!used.has(a + b)) return a + b
  return 'ZZ'
}

const DEFAULT_SIZES: Record<DrawTool, { w: number; d: number }> = {
  room: { w: 600, d: 400 }, wall: { w: 200, d: 20 }, shelf: { w: 120, d: 40 }, bench: { w: 200, d: 70 }, table: { w: 160, d: 80 },
  cabinet: { w: 100, d: 50 }, equipment: { w: 80, d: 60 }, door: { w: 90, d: 20 }, window: { w: 120, d: 20 },
  other: { w: 100, d: 60 },
}

/** A click without a drag places the shape at its usual size, centred on the click. */
export function defaultRect(tool: DrawTool, at: { x: number; y: number }, free = false): Rect {
  const { w, d } = DEFAULT_SIZES[tool]
  return { x: Math.max(-MAX_PLAN_CM, snap(at.x - w / 2, free)), y: Math.max(-MAX_PLAN_CM, snap(at.y - d / 2, free)), w, d }
}

/** How far the whole plan must move so nothing covers floor left of or above 0; zero when nothing does. */
export function planShift(doc: EditorDoc): Offset {
  const fps = listShapes(doc).map((s) => s.fp)
  if (fps.length === 0) return { dx: 0, dy: 0 }
  const box = unionRect(fps)
  return { dx: Math.max(0, -box.x), dy: Math.max(0, -box.y) }
}

function shiftDoc(doc: EditorDoc, o: Offset): EditorDoc {
  if (o.dx === 0 && o.dy === 0) return doc
  return {
    plan: {
      ...doc.plan,
      rooms: doc.plan.rooms.map((r) => ({ ...r, x: r.x + o.dx, y: r.y + o.dy })),
      items: doc.plan.items.map((i) => ({ ...i, x: i.x + o.dx, y: i.y + o.dy })),
    },
    shelves: doc.shelves.map((s) => ({ ...s, x_cm: s.x_cm + o.dx, y_cm: s.y_cm + o.dy })),
  }
}

/** The editor's copy of a layout; older bodies without lock or group read as unlocked and ungrouped. */
export function fromLayout(layout: Pick<StorageLayout, 'laboratory' | 'shelves'>): EditorDoc {
  const plan = parseFloorPlan(layout.laboratory.floor_plan)
  return {
    plan: plan.ok ? plan.value : layout.laboratory.floor_plan,
    shelves: layout.shelves.map((s) => ({ ...s, key: s.id, locked: s.locked === true, group_id: s.group_id ?? null, zone_edits: {} })),
  }
}

/**
 * What PUT sends: the plan moved back to start at 0, 0 (see planShift), and
 * a group left with fewer than two members dropped.
 */
export function toSavePayload(doc: EditorDoc): { floor_plan: FloorPlan; shelves: ShelfInput[] } {
  const d = pruneGroups(shiftDoc(doc, planShift(doc)))
  return {
    floor_plan: d.plan,
    shelves: d.shelves.map((s) => ({
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
    return {
      ...doc,
      plan: {
        ...doc.plan,
        rooms: doc.plan.rooms.map((r) => (r.id === ref.key
          ? { ...r, ...pickRect(p), ...(p.name !== undefined ? { name: cleanName(p.name) } : {}) }
          : r)),
      },
    }
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

const applyMany = (doc: EditorDoc, patches: RefPatch[]): EditorDoc =>
  patches.reduce((d, p) => applyPatch(d, p.ref, p.patch), doc)

function removeShapes(doc: EditorDoc, refs: ShapeRef[]): EditorDoc {
  const gone = (kind: ShapeKind, key: string) => isSelected(refs, { kind, key })
  return {
    plan: {
      ...doc.plan,
      rooms: doc.plan.rooms.filter((r) => !gone('room', r.id)),
      items: doc.plan.items.filter((i) => !gone('item', i.id)),
    },
    shelves: doc.shelves.filter((s) => !gone('shelf', s.key)),
  }
}

function setLocked(doc: EditorDoc, refs: ShapeRef[], locked: boolean): EditorDoc {
  const on = (kind: ShapeKind, key: string) => isSelected(refs, { kind, key })
  return {
    plan: {
      ...doc.plan,
      rooms: doc.plan.rooms.map((r) => (on('room', r.id) ? { ...r, locked } : r)),
      items: doc.plan.items.map((i) => (on('item', i.id) ? { ...i, locked } : i)),
    },
    shelves: doc.shelves.map((s) => (on('shelf', s.key) ? { ...s, locked } : s)),
  }
}

/** A group needs two members: one left alone, or none, dissolves. */
export function pruneGroups(doc: EditorDoc): EditorDoc {
  const count = new Map<string, number>()
  for (const g of [...doc.plan.items.map((i) => i.group_id), ...doc.shelves.map((s) => s.group_id)]) {
    if (g) count.set(g, (count.get(g) ?? 0) + 1)
  }
  const keeps = (g: string | null): boolean => !!g && (count.get(g) ?? 0) >= 2
  return {
    plan: {
      ...doc.plan,
      items: doc.plan.items.map((i) => (i.group_id && !keeps(i.group_id) ? { ...i, group_id: null } : i)),
      groups: doc.plan.groups.filter((g) => keeps(g.id)),
    },
    shelves: doc.shelves.map((s) => (s.group_id && !keeps(s.group_id) ? { ...s, group_id: null } : s)),
  }
}

/** The group a selection is, exactly: every member and nothing else. */
export function selectionGroup(doc: EditorDoc, selection: ShapeRef[]): FloorGroup | null {
  if (selection.length < 2) return null
  const g = shapeGroupId(doc, selection[0])
  if (!g || !selection.every((r) => shapeGroupId(doc, r) === g)) return null
  if (groupMembers(doc, g).length !== selection.length) return null
  return doc.plan.groups.find((x) => x.id === g) ?? null
}

function setGroup(doc: EditorDoc, refs: ShapeRef[], group: string | null): EditorDoc {
  const on = (kind: ShapeKind, key: string) => isSelected(refs, { kind, key })
  return {
    plan: { ...doc.plan, items: doc.plan.items.map((i) => (on('item', i.id) ? { ...i, group_id: group } : i)) },
    shelves: doc.shelves.map((s) => (on('shelf', s.key) ? { ...s, group_id: group } : s)),
  }
}

export function copySelection(doc: EditorDoc, selection: ShapeRef[]): Clip | null {
  const has = (kind: ShapeKind, key: string) => isSelected(selection, { kind, key })
  const rooms = doc.plan.rooms.filter((r) => has('room', r.id))
  const items = doc.plan.items.filter((i) => has('item', i.id))
  const shelves = doc.shelves.filter((s) => has('shelf', s.key)).map((s): ClipShelf => ({
    shelf_letter: s.shelf_letter, rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
    x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm, rot: s.rot, access_side: s.access_side,
    group_id: s.group_id,
  }))
  if (rooms.length + items.length + shelves.length === 0) return null
  const used = new Set([...items.map((i) => i.group_id), ...shelves.map((s) => s.group_id)])
  return { version: 1, rooms, items, shelves, groups: doc.plan.groups.filter((g) => used.has(g.id)) }
}

/** The box around what a clip's shapes cover. */
export function clipBox(clip: Clip): Rect {
  return unionRect([
    ...clip.rooms.map(rectOf),
    ...clip.items.map((i) => footprint(i)),
    ...clip.shelves.map((s) => footprint({ ...shelfRect(s), rot: s.rot })),
  ])
}

/**
 * A clip's shapes added to `doc`, moved by `o`, with ids `<seed>-<n>`, the
 * next free shelf letters, unlocked, no zones, and their own new groups.
 */
export function insertClip(doc: EditorDoc, clip: Clip, o: Offset, seed: string): { doc: EditorDoc; refs: ShapeRef[] } {
  let n = 0
  const nextId = () => `${seed}-${n++}`
  const groupIds = new Map(clip.groups.map((g) => [g.id, nextId()]))
  const regroup = (g: string | null) => (g ? groupIds.get(g) ?? null : null)
  const rooms: FloorRoom[] = clip.rooms.map((r) => ({ ...r, ...moveFootprintBy(r, 0, o), id: nextId(), locked: false }))
  const items: FloorItem[] = clip.items.map((it) => ({
    ...it, ...moveFootprintBy(it, it.rot, o), id: nextId(), locked: false, group_id: regroup(it.group_id),
  }))
  const letters = doc.shelves.map((s) => s.shelf_letter)
  const shelves: EditorShelf[] = clip.shelves.map((s) => {
    const letter = nextShelfLetter(letters)
    letters.push(letter)
    const r = moveFootprintBy(shelfRect(s), s.rot, o)
    return {
      ...s, key: nextId(), shelf_letter: letter, x_cm: r.x, y_cm: r.y,
      locked: false, group_id: regroup(s.group_id), company_id: null, cubbies: [], zone_edits: {},
    }
  })
  const groups = clip.groups.map((g) => ({ id: groupIds.get(g.id) as string, name: g.name }))
  return {
    doc: {
      plan: {
        ...doc.plan,
        rooms: [...doc.plan.rooms, ...rooms],
        items: [...doc.plan.items, ...items],
        groups: [...doc.plan.groups, ...groups],
      },
      shelves: [...doc.shelves, ...shelves],
    },
    refs: [
      ...rooms.map((r): ShapeRef => ({ kind: 'room', key: r.id })),
      ...items.map((i): ShapeRef => ({ kind: 'item', key: i.id })),
      ...shelves.map((s): ShapeRef => ({ kind: 'shelf', key: s.key })),
    ],
  }
}

const turnRot = (rot: Rotation, turn: Turn): Rotation => ((rot + (turn === 1 ? 90 : 270)) % 360) as Rotation

/** Shapes turned a quarter about the centre of what they cover together, kept within reach. */
function turnShapes(shapes: ShapeInfo[], turn: Turn): RefPatch[] {
  const box = unionRect(shapes.map((s) => s.fp))
  const c = { x: box.x + box.w / 2, y: box.y + box.d / 2 }
  const turned = shapes.map((s) => ({ s, fp: turnFootprint(s.fp, c, turn), rot: turnRot(s.rot, turn) }))
  const o = onPlanOffset(unionRect(turned.map((t) => t.fp)))
  return turned.map(({ s, fp, rot }) => {
    const r = fromFootprint({ ...fp, x: fp.x + o.dx, y: fp.y + o.dy }, rot)
    return { ref: s.ref, patch: { x: r.x, y: r.y, rot } }
  })
}

/** One shape turned about its own centre: only `rot` changes, unless that puts it out of reach. */
function turnOne(s: ShapeInfo, turn: Turn): RefPatch {
  const rot = turnRot(s.rot, turn)
  const r = moveFootprintBy(s.rect, rot, onPlanOffset(footprint({ ...s.rect, rot })))
  return { ref: s.ref, patch: { x: r.x, y: r.y, rot } }
}

/**
 * What align and distribute move: each fully selected group as one unit, and
 * each other shape alone. A selection that is exactly one group lines up its members.
 */
function arrangeUnits(doc: EditorDoc, shapes: ShapeInfo[]): ShapeInfo[][] {
  const units = new Map<string, ShapeInfo[]>()
  for (const x of shapes) {
    const whole = x.group !== null && groupMembers(doc, x.group).every((m) => shapes.some((y) => sameRef(y.ref, m)))
    const key = whole ? `group:${x.group}` : shapeKey(x.ref)
    units.set(key, [...(units.get(key) ?? []), x])
  }
  const list = [...units.values()]
  return list.length === 1 ? shapes.map((x) => [x]) : list
}

/** Shapes moved together by an offset, stopping at the edge of reach. */
function moveShapes(shapes: ShapeInfo[], dx: number, dy: number): RefPatch[] {
  const box = unionRect(shapes.map((s) => s.fp))
  const fix = onPlanOffset({ ...box, x: box.x + dx, y: box.y + dy })
  const o = { dx: dx + fix.dx, dy: dy + fix.dy }
  return shapes.map((s) => {
    const r = moveFootprintBy(s.rect, s.rot, o)
    return { ref: s.ref, patch: { x: r.x, y: r.y } }
  })
}

const MOVES: Array<keyof ShapePatch> = ['x', 'y', 'w', 'd', 'rot']
const movesShape = (p: ShapePatch): boolean => MOVES.some((k) => p[k] !== undefined)

function refuse(s: EditorState, text = LOCKED_NOTICE): EditorState {
  return { ...s, notice: { seq: (s.notice?.seq ?? 0) + 1, text } }
}

function recorded(s: EditorState, doc: EditorDoc, extra: Partial<EditorState> = {}): EditorState {
  return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [], doc, dirty: true, ...extra }
}

function reduce(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'load':
      return initialEditorState(a.doc, a.canLayout ?? true)
    case 'saved': {
      const shift = { dx: s.shift.dx + (a.shift?.dx ?? 0), dy: s.shift.dy + (a.shift?.dy ?? 0) }
      return {
        ...initialEditorState(a.doc, s.canLayout), selection: keepSelection(a.doc, s.selection), shift, dirty: a.dirty ?? false,
      }
    }
    case 'tool':
      return { ...s, tool: a.tool }
    case 'select':
      return { ...s, selection: keepSelection(s.doc, a.exact ? uniqueRefs(a.refs) : expandSelection(s.doc, a.refs)) }
    case 'toggle': {
      const set = keepSelection(s.doc, expandSelection(s.doc, [a.ref]))
      const all = set.every((r) => isSelected(s.selection, r))
      return { ...s, selection: all ? s.selection.filter((r) => !isSelected(set, r)) : uniqueRefs([...s.selection, ...set]) }
    }
    case 'selectAll':
      return { ...s, selection: listShapes(s.doc).map((x) => x.ref) }
    case 'checkpoint':
      return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [] }
    case 'add': {
      const { shape, rect, id } = a
      if (shape === 'room') {
        const doc = { ...s.doc, plan: { ...s.doc.plan, rooms: [...s.doc.plan.rooms, { id, ...rect, name: null, locked: false }] } }
        return recorded(s, doc, { selection: [{ kind: 'room', key: id }], tool: 'select' })
      }
      if (shape === 'shelf') {
        const shelf: EditorShelf = {
          key: id, shelf_letter: nextShelfLetter(s.doc.shelves.map((x) => x.shelf_letter)),
          rows: 6, columns: 4, samples_per_position: 42,
          x_cm: rect.x, y_cm: rect.y, width_cm: rect.w, depth_cm: rect.d, rot: 0, access_side: 'front',
          locked: false, group_id: null, company_id: null, cubbies: [], zone_edits: {},
        }
        return recorded(s, { ...s.doc, shelves: [...s.doc.shelves, shelf] }, { selection: [{ kind: 'shelf', key: id }], tool: 'select' })
      }
      const item: FloorItem = { id, kind: shape, label: null, rot: 0, locked: false, group_id: null, ...rect }
      const doc = { ...s.doc, plan: { ...s.doc.plan, items: [...s.doc.plan.items, item] } }
      return recorded(s, doc, { selection: [{ kind: 'item', key: id }], tool: 'select' })
    }
    case 'patch': {
      if (movesShape(a.patch) && shapeLocked(s.doc, a.ref)) return refuse(s)
      const doc = applyPatch(s.doc, a.ref, a.patch)
      return a.record ? recorded(s, doc) : { ...s, doc, dirty: true }
    }
    case 'patchMany': {
      if (a.patches.some((p) => movesShape(p.patch) && shapeLocked(s.doc, p.ref))) return refuse(s)
      const doc = applyMany(s.doc, a.patches)
      return a.record ? recorded(s, doc) : { ...s, doc, dirty: true }
    }
    case 'rotate': {
      const shapes = selectedShapes(s.doc, s.selection)
      if (shapes.length === 0 || shapes.some((x) => x.ref.kind === 'room')) return s
      if (shapes.some((x) => x.locked)) return refuse(s)
      return recorded(s, applyMany(s.doc, shapes.length === 1 ? [turnOne(shapes[0], a.turn)] : turnShapes(shapes, a.turn)))
    }
    case 'nudge': {
      const shapes = selectedShapes(s.doc, s.selection)
      if (shapes.length === 0) return s
      if (shapes.some((x) => x.locked)) return refuse(s)
      return recorded(s, applyMany(s.doc, moveShapes(shapes, a.dx, a.dy)))
    }
    case 'lock':
      return s.selection.length === 0 ? s : recorded(s, setLocked(s.doc, s.selection, a.locked))
    case 'delete': {
      if (s.selection.length === 0) return s
      if (s.selection.some((r) => shapeLocked(s.doc, r))) return refuse(s)
      return recorded(s, pruneGroups(removeShapes(s.doc, s.selection)), { selection: [] })
    }
    case 'group': {
      if (s.selection.length < 2 || s.selection.some((r) => r.kind === 'room')) return s
      const doc = setGroup(s.doc, s.selection, a.id)
      return recorded(s, pruneGroups({ ...doc, plan: { ...doc.plan, groups: [...doc.plan.groups, { id: a.id, name: null }] } }))
    }
    case 'ungroup': {
      const ids = new Set(s.selection.map((r) => shapeGroupId(s.doc, r)).filter((g): g is string => !!g))
      if (ids.size === 0) return s
      const doc = setGroup(s.doc, [...ids].flatMap((g) => groupMembers(s.doc, g)), null)
      return recorded(s, { ...doc, plan: { ...doc.plan, groups: doc.plan.groups.filter((g) => !ids.has(g.id)) } })
    }
    case 'renameGroup': {
      const groups = s.doc.plan.groups.map((g) => (g.id === a.id ? { ...g, name: cleanName(a.name) } : g))
      return recorded(s, { ...s.doc, plan: { ...s.doc.plan, groups } })
    }
    case 'align':
    case 'distribute': {
      const units = arrangeUnits(s.doc, selectedShapes(s.doc, s.selection))
      if (units.length < 2) return s
      const fps = units.map((u) => unionRect(u.map((x) => x.fp)))
      const movable = units.map((u) => u.every((x) => !x.locked))
      const offsets = a.type === 'align' ? alignOffsets(fps, movable, a.edge) : distributeOffsets(fps, movable, a.axis)
      const patches = units.flatMap((u, i): RefPatch[] => {
        const o = offsets[i]
        if (o.dx === 0 && o.dy === 0) return []
        return u.map((x) => {
          const r = moveFootprintBy(x.rect, x.rot, o)
          return { ref: x.ref, patch: { x: r.x, y: r.y } }
        })
      })
      return patches.length === 0 ? s : recorded(s, applyMany(s.doc, patches))
    }
    case 'duplicate': {
      const clip = copySelection(s.doc, s.selection)
      if (!clip) return s
      const { doc, refs } = insertClip(s.doc, clip, duplicateOffset(clipBox(clip)), a.seed)
      return recorded(s, pruneGroups(doc), { selection: refs })
    }
    case 'paste': {
      const box = clipBox(a.clip)
      const want = { dx: snap(a.at.x - (box.x + box.w / 2)), dy: snap(a.at.y - (box.y + box.d / 2)) }
      const fix = onPlanOffset({ ...box, x: box.x + want.dx, y: box.y + want.dy })
      const { doc, refs } = insertClip(s.doc, a.clip, { dx: want.dx + fix.dx, dy: want.dy + fix.dy }, a.seed)
      return recorded(s, pruneGroups(doc), { selection: refs })
    }
    case 'pickCubby':
      return { ...s, cubbyPick: nextPick(s.cubbyPick, a.shelfKey, a.cell, a.mode) }
    case 'clearPick':
      return s.cubbyPick ? { ...s, cubbyPick: null } : s
    case 'assignZone': {
      // Picked cubbies, else every cubby of each selected shelf; rooms and furniture have none.
      const targets = new Map<string, Cell[]>()
      if (s.cubbyPick && s.cubbyPick.cells.length > 0) targets.set(s.cubbyPick.shelfKey, s.cubbyPick.cells)
      else for (const r of s.selection) {
        const shelf = r.kind === 'shelf' ? s.doc.shelves.find((x) => x.key === r.key) : undefined
        if (shelf) targets.set(shelf.key, shelfCells(shelf))
      }
      let changed = false
      const shelves = s.doc.shelves.map((shelf) => {
        const cells = (targets.get(shelf.key) ?? []).filter((c) => inGrid(shelf, c))
        const now = shelfZones(shelf)
        if (cells.every((c) => now.get(c) === a.companyId)) return shelf
        changed = true
        const zone_edits = { ...(shelf.zone_edits ?? {}) }
        for (const c of cells) zone_edits[c] = a.companyId
        return { ...shelf, zone_edits }
      })
      return changed ? recorded(s, { ...s.doc, shelves }) : s
    }
    case 'undo': {
      if (s.past.length === 0) return s
      const doc = s.past[s.past.length - 1]
      return { ...s, doc, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: true, selection: keepSelection(doc, s.selection) }
    }
    case 'redo': {
      if (s.future.length === 0) return s
      const [doc, ...rest] = s.future
      return { ...s, doc, past: [...s.past, s.doc], future: rest, dirty: true, selection: keepSelection(doc, s.selection) }
    }
  }
}

/** What only someone with layout rights may do: everything that adds, moves, changes or removes a shape. */
const LAYOUT_ACTIONS: ReadonlySet<EditorAction['type']> = new Set<EditorAction['type']>([
  'checkpoint', 'add', 'patch', 'patchMany', 'rotate', 'nudge', 'lock', 'delete', 'group', 'ungroup',
  'renameGroup', 'align', 'distribute', 'duplicate', 'paste',
])

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  if (!s.canLayout && LAYOUT_ACTIONS.has(a.type)) return s
  const next = reduce(s, a)
  // A pick belongs to the shelf selected when it was made.
  return next.cubbyPick && next.selection !== s.selection ? { ...next, cubbyPick: null } : next
}
