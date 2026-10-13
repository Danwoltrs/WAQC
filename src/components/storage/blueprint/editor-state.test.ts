import { describe, it, expect } from 'vitest'
import { EMPTY_FLOOR_PLAN, type FloorItem } from '@/lib/storage/floor-plan'
import { footprint } from '@/lib/storage/geometry'
import {
  boxSelection, copySelection, defaultRect, editorReducer, listShapes, shelfRect, fromLayout, initialEditorState, nextShelfLetter, planShift, selectionGroup, toSavePayload, LOCKED_NOTICE,
  type EditorAction, type EditorDoc, type EditorShelf, type EditorState,
} from './editor-state'
import type { PickMode } from './zones'

const shelf = {
  key: 's-a', id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 60, depth_cm: 40, rot: 0 as const, access_side: 'front' as const,
  locked: false, group_id: null, company_id: null, cubbies: [],
}
const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf] }

describe('editorReducer', () => {
  it('adds a room, selects it and returns to the select tool', () => {
    const s = editorReducer({ ...initialEditorState(doc), tool: 'room' }, { type: 'add', shape: 'room', id: 'r1', rect: { x: 0, y: 0, w: 800, d: 600 } })
    expect(s.doc.plan.rooms).toEqual([{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }])
    expect(s.selection).toEqual([{ kind: 'room', key: 'r1' }])
    expect(s.tool).toBe('select')
    expect(s.dirty).toBe(true)
  })

  it('gives a new shelf the next free letter and 42 samples per cubby', () => {
    const s = editorReducer(initialEditorState(doc), { type: 'add', shape: 'shelf', id: 'n1', rect: { x: 200, y: 50, w: 120, d: 40 } })
    expect(s.doc.shelves[1]).toMatchObject({ key: 'n1', shelf_letter: 'B', samples_per_position: 42, x_cm: 200 })
    expect(s.doc.shelves[1].id).toBeUndefined()
  })

  it('records one undo step for a whole drag', () => {
    const ref = { kind: 'shelf' as const, key: 's-a' }
    let s = editorReducer(initialEditorState(doc), { type: 'checkpoint' })
    s = editorReducer(s, { type: 'patch', ref, patch: { x: 60 }, record: false })
    s = editorReducer(s, { type: 'patch', ref, patch: { x: 70 }, record: false })
    expect(s.doc.shelves[0].x_cm).toBe(70)
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.shelves[0].x_cm).toBe(50)
    s = editorReducer(s, { type: 'redo' })
    expect(s.doc.shelves[0].x_cm).toBe(70)
  })

  it('records inspector edits, rotates and deletes the selection', () => {
    const ref = { kind: 'shelf' as const, key: 's-a' }
    let s = editorReducer(initialEditorState(doc), { type: 'patch', ref, patch: { rows: 3, shelf_letter: ' c ' }, record: true })
    expect(s.doc.shelves[0]).toMatchObject({ rows: 3, shelf_letter: 'C' })
    s = editorReducer(s, { type: 'select', refs: [ref] })
    s = editorReducer(s, { type: 'rotate', turn: 1 })
    expect(s.doc.shelves[0].rot).toBe(90)
    s = editorReducer(s, { type: 'delete' })
    expect(s.doc.shelves).toEqual([])
    expect(s.selection).toEqual([])
    expect(s.past).toHaveLength(3)
  })
})

describe('helpers', () => {
  it('places a clicked wall as 2 m by 20 cm, and lets nothing stand in it', () => {
    expect(defaultRect('wall', { x: 100, y: 100 })).toEqual({ x: 0, y: 90, w: 200, d: 20 })
    const wall: FloorItem = { id: 'w1', kind: 'wall', label: null, x: 0, y: 90, w: 200, d: 20, rot: 0, locked: false, group_id: null }
    const shapes = listShapes({ plan: { ...EMPTY_FLOOR_PLAN, items: [wall] }, shelves: [] })
    expect(shapes[0].blocks).toBe(true)
  })

  it('skips used letters', () => {
    expect(nextShelfLetter(['A', 'B', 'D'])).toBe('C')
    expect(nextShelfLetter('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBe('AA')
  })

  it('sends only what the database stores', () => {
    const payload = toSavePayload(doc)
    expect(payload.shelves[0]).toEqual({
      id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
      x_cm: 50, y_cm: 50, width_cm: 60, depth_cm: 40, rot: 0, access_side: 'front', locked: false, group_id: null,
    })
  })

  it('loads an API body without the new fields as unlocked and ungrouped', () => {
    const doc = fromLayout({
      laboratory: { id: 'lab', name: 'Santos', floor_plan: { version: 1, rooms: [], items: [] } as never, storage_capacity: 0 },
      shelves: [{ ...shelf, locked: undefined as never, group_id: undefined as never }],
    })
    expect(doc.plan.groups).toEqual([])
    expect(doc.shelves[0]).toMatchObject({ key: 's-a', locked: false, group_id: null })
  })
})

const R1 = { kind: 'room' as const, key: 'r1' }
const I1 = { kind: 'item' as const, key: 'i1' }
const I2 = { kind: 'item' as const, key: 'i2' }
const SA = { kind: 'shelf' as const, key: 's-a' }
const SB = { kind: 'shelf' as const, key: 's-b' }

const bench = (id: string, x: number, over: Partial<FloorItem> = {}): FloorItem => ({
  id, kind: 'bench', label: null, x, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: null, ...over,
})
const shelfAt = (key: string, letter: string, x: number, over: Partial<EditorShelf> = {}): EditorShelf => ({
  key, id: key, shelf_letter: letter, rows: 1, columns: 2, samples_per_position: 42,
  x_cm: x, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null, cubbies: [], ...over,
})
const grouped: EditorDoc = {
  plan: {
    version: 1,
    rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }],
    items: [bench('i1', 100, { group_id: 'g1' }), bench('i2', 300, { group_id: 'g1' })],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [shelfAt('s-a', 'A', 0), shelfAt('s-b', 'B', 200)],
}
const start = (d: EditorDoc = grouped) => initialEditorState(d)

describe('selection', () => {
  it('selects a whole group on click, and one member when asked exactly', () => {
    expect(editorReducer(start(), { type: 'select', refs: [I1] }).selection).toEqual([I1, I2])
    expect(editorReducer(start(), { type: 'select', refs: [I1], exact: true }).selection).toEqual([I1])
  })

  it('adds and removes a group as a whole on Shift+click', () => {
    let s = editorReducer(start(), { type: 'toggle', ref: SA })
    expect(s.selection).toEqual([SA])
    s = editorReducer(s, { type: 'toggle', ref: I2 })
    expect(s.selection).toEqual([SA, I1, I2])
    s = editorReducer(s, { type: 'toggle', ref: I1 })
    expect(s.selection).toEqual([SA])
  })

  it('selects every shape', () => {
    expect(editorReducer(start(), { type: 'selectAll' }).selection).toEqual([R1, I1, I2, SA, SB])
  })
})

describe('turning, nudging and locks', () => {
  it('turns two shelves side by side into a column about their centre, as one undo step', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA, SB] })
    s = editorReducer(s, { type: 'rotate', turn: 1 })
    expect(s.doc.shelves.map((x) => [x.x_cm, x.y_cm, x.rot])).toEqual([[100, -100, 90], [100, 100, 90]])
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.shelves.map((x) => [x.x_cm, x.y_cm, x.rot])).toEqual([[0, 0, 0], [200, 0, 0]])
  })

  it('never turns a room', () => {
    const s = editorReducer(editorReducer(start(), { type: 'select', refs: [R1] }), { type: 'rotate', turn: 1 })
    expect(s.past).toHaveLength(0)
  })

  it('refuses to move, turn or delete a locked shape, but edits its details', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA] })
    s = editorReducer(s, { type: 'lock', locked: true })
    expect(s.doc.shelves[0].locked).toBe(true)
    const locked = s.doc
    s = editorReducer(s, { type: 'rotate', turn: 1 })
    expect(s.doc).toBe(locked)
    expect(s.notice).toEqual({ seq: 1, text: LOCKED_NOTICE })
    s = editorReducer(s, { type: 'patch', ref: SA, patch: { x: 10 }, record: true })
    expect(s.notice?.seq).toBe(2)
    s = editorReducer(s, { type: 'delete' })
    expect(s.doc.shelves).toHaveLength(2)
    s = editorReducer(s, { type: 'patch', ref: SA, patch: { shelf_letter: 'Z' }, record: true })
    expect(s.doc.shelves[0].shelf_letter).toBe('Z')
  })

  it('nudges the selection, past the plan corner too', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA] })
    s = editorReducer(s, { type: 'nudge', dx: -10, dy: 0 })
    expect(s.doc.shelves[0].x_cm).toBe(-10)
    s = editorReducer(s, { type: 'nudge', dx: 10, dy: 1 })
    expect([s.doc.shelves[0].x_cm, s.doc.shelves[0].y_cm]).toEqual([0, 1])
  })

  it('remembers how far each save moved the plan, so the view can follow; a load starts over', () => {
    let s = editorReducer(start(), { type: 'saved', doc: grouped, shift: { dx: 50, dy: 20 } })
    s = editorReducer(s, { type: 'saved', doc: grouped, shift: { dx: 10, dy: 0 } })
    expect(s.shift).toEqual({ dx: 60, dy: 20 })
    expect(editorReducer(s, { type: 'load', doc: grouped }).shift).toEqual({ dx: 0, dy: 0 })
  })

  it('saves a plan pushed past its corner moved back to start at 0, 0', () => {
    const pushed: EditorDoc = { ...grouped, plan: { ...grouped.plan, rooms: [{ ...grouped.plan.rooms[0], x: -50, y: -20 }] } }
    expect(planShift(pushed)).toEqual({ dx: 50, dy: 20 })
    const payload = toSavePayload(pushed)
    expect(payload.floor_plan.rooms[0]).toMatchObject({ x: 0, y: 0 })
    expect(payload.floor_plan.items.map((i) => [i.x, i.y])).toEqual([[150, 320], [350, 320]])
    expect(payload.shelves.map((x) => [x.x_cm, x.y_cm])).toEqual([[50, 20], [250, 20]])
  })

  it('leaves a plan alone when nothing covers floor past its corner, a turned shelf at x -30 included', () => {
    // 100 x 40 turned 90 degrees at (-30, 30) covers x 0..40, y 0..100.
    const turned: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', -30, { rot: 90, y_cm: 30 })] }
    expect(planShift(turned)).toEqual({ dx: 0, dy: 0 })
    expect(toSavePayload(turned).shelves[0].x_cm).toBe(-30)
  })

  it('puts a whole group drag back with one undo', () => {
    let s = editorReducer(start(), { type: 'checkpoint' })
    s = editorReducer(s, { type: 'patchMany', record: false, patches: [{ ref: I1, patch: { x: 110 } }, { ref: I2, patch: { x: 310 } }] })
    s = editorReducer(s, { type: 'patchMany', record: false, patches: [{ ref: I1, patch: { x: 120 } }, { ref: I2, patch: { x: 320 } }] })
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.plan.items.map((i) => i.x)).toEqual([100, 300])
  })

  it('dissolves a group left with one member when the other is deleted', () => {
    let s = editorReducer(start(), { type: 'select', refs: [I1], exact: true })
    s = editorReducer(s, { type: 'delete' })
    expect(s.doc.plan.items).toEqual([bench('i2', 300)])
    expect(s.doc.plan.groups).toEqual([])
  })

  it('names a room', () => {
    const s = editorReducer(start(), { type: 'patch', ref: R1, patch: { name: '  Sample room  ' }, record: true })
    expect(s.doc.plan.rooms[0].name).toBe('Sample room')
  })

  it('never saves a group with one member', () => {
    const lonely: EditorDoc = { ...grouped, plan: { ...grouped.plan, items: [bench('i1', 100, { group_id: 'g1' })] } }
    const payload = toSavePayload(lonely)
    expect(payload.floor_plan.groups).toEqual([])
    expect(payload.floor_plan.items[0].group_id).toBeNull()
  })
})

describe('groups', () => {
  it('groups two shelves, names the group and ungroups them', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA, SB] })
    s = editorReducer(s, { type: 'group', id: 'g2' })
    expect(s.doc.shelves.map((x) => x.group_id)).toEqual(['g2', 'g2'])
    s = editorReducer(s, { type: 'renameGroup', id: 'g2', name: ' Wall rack ' })
    expect(selectionGroup(s.doc, s.selection)).toEqual({ id: 'g2', name: 'Wall rack' })
    s = editorReducer(s, { type: 'ungroup' })
    expect(s.doc.shelves.map((x) => x.group_id)).toEqual([null, null])
    expect(s.doc.plan.groups.map((g) => g.id)).toEqual(['g1'])
  })

  it('moves shapes out of their old group, which dissolves when one is left', () => {
    let s = editorReducer(start(), { type: 'select', refs: [I1, SA], exact: true })
    s = editorReducer(s, { type: 'group', id: 'g2' })
    expect(s.doc.plan.items.map((i) => i.group_id)).toEqual(['g2', null])
    expect(s.doc.plan.groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('never groups a room', () => {
    const before = editorReducer(start(), { type: 'select', refs: [R1, SA] })
    expect(editorReducer(before, { type: 'group', id: 'g2' })).toBe(before)
  })
})

describe('align and distribute', () => {
  it('lines shapes up with a locked one as the anchor', () => {
    const d: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', 0, { locked: true }), shelfAt('s-b', 'B', 200, { y_cm: 100 })] }
    let s = editorReducer(start(d), { type: 'select', refs: [SA, SB] })
    s = editorReducer(s, { type: 'align', edge: 'left' })
    expect(s.doc.shelves.map((x) => [x.x_cm, x.y_cm])).toEqual([[0, 0], [0, 100]])
  })

  it('spaces three shelves evenly', () => {
    const d: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', 0), shelfAt('s-b', 'B', 150), shelfAt('s-c', 'C', 500)] }
    let s = editorReducer(start(d), { type: 'select', refs: [SA, SB, { kind: 'shelf', key: 's-c' }] })
    s = editorReducer(s, { type: 'distribute', axis: 'h' })
    expect(s.doc.shelves.map((x) => x.x_cm)).toEqual([0, 250, 500])
  })
})

describe('duplicate, copy and paste', () => {
  it('duplicates beside the original with the next free letter, unlocked and without a zone', () => {
    const d: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', 0), shelfAt('s-b', 'B', 200, { locked: true, company_id: 'co-1' })] }
    let s = editorReducer(start(d), { type: 'select', refs: [SB] })
    s = editorReducer(s, { type: 'duplicate', seed: 'd' })
    expect(s.doc.shelves[2]).toMatchObject({ key: 'd-0', shelf_letter: 'C', x_cm: 310, y_cm: 0, locked: false, company_id: null })
    expect(s.doc.shelves[2].id).toBeUndefined()
    expect(s.selection).toEqual([{ kind: 'shelf', key: 'd-0' }])
  })

  it('pastes with fresh letters, centred on the point', () => {
    const clip = copySelection(grouped, [SA, SB])
    if (!clip) throw new Error('nothing copied')
    const s = editorReducer(start(), { type: 'paste', clip, at: { x: 400, y: 400 }, seed: 'p' })
    expect(s.doc.shelves.slice(2).map((x) => [x.shelf_letter, x.x_cm, x.y_cm])).toEqual([['C', 250, 380], ['D', 450, 380]])
  })

  it('copies a group with its name and pastes it as a new group', () => {
    const clip = copySelection(grouped, [I1, I2])
    expect(clip?.groups).toEqual([{ id: 'g1', name: 'Bench pair' }])
    if (!clip) throw new Error('nothing copied')
    const s = editorReducer(start(), { type: 'paste', clip, at: { x: 600, y: 500 }, seed: 'p' })
    const pasted = s.doc.plan.items.slice(2)
    expect(pasted.map((i) => i.group_id)).toEqual(['p-0', 'p-0'])
    expect(s.doc.plan.groups).toEqual([{ id: 'g1', name: 'Bench pair' }, { id: 'p-0', name: 'Bench pair' }])
  })
})

describe('boxSelection', () => {
  it('picks what the box touches, and a room only when the box holds all of it', () => {
    expect(boxSelection(grouped, { x: 150, y: 280, w: 100, d: 40 })).toEqual([I1])
    expect(boxSelection(grouped, { x: -10, y: -10, w: 900, d: 700 })).toContainEqual(R1)
    expect(boxSelection(grouped, { x: 10, y: 10, w: 50, d: 50 })).toEqual([SA])
  })
})

describe('turned shelves with an odd width-depth difference', () => {
  const odd: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', 300, { width_cm: 125, depth_cm: 40, rot: 90, y_cm: 200 })] }
  const covers = (st: { doc: EditorDoc }) => footprint({ ...shelfRect(st.doc.shelves[0]), rot: st.doc.shelves[0].rot })

  it('nudge by exactly the step', () => {
    let s = editorReducer(start(odd), { type: 'select', refs: [SA] })
    const before = covers(s)
    s = editorReducer(s, { type: 'nudge', dx: 10, dy: 0 })
    const after = covers(s)
    expect([after.x - before.x, after.y - before.y]).toEqual([10, 0])
  })

  it('come back to where they were after four turns', () => {
    let s = editorReducer(start(odd), { type: 'select', refs: [SA] })
    for (let i = 0; i < 4; i++) s = editorReducer(s, { type: 'rotate', turn: 1 })
    expect(s.doc.shelves[0]).toMatchObject({ x_cm: 300, y_cm: 200, rot: 90 })
  })
})

describe('align with a group selected', () => {
  it('moves the group as one unit', () => {
    let s = editorReducer(start(), { type: 'select', refs: [I1, SA] })
    s = editorReducer(s, { type: 'align', edge: 'left' })
    expect(s.doc.plan.items.map((i) => i.x)).toEqual([0, 200])
    expect(s.doc.shelves[0].x_cm).toBe(0)
  })
})

describe('zones in the editor', () => {
  const pick = (s: EditorState, cell: string, mode: PickMode = 'only') =>
    editorReducer(s, { type: 'pickCubby', shelfKey: 's-a', cell, mode })

  it('assigns picked cubbies as one undo step, at once', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA] })
    s = pick(pick(s, '1:1'), '1:2', 'toggle')
    s = editorReducer(s, { type: 'assignZone', companyId: 'co-1' })
    expect(s.doc.shelves[0].zone_edits).toEqual({ '1:1': 'co-1', '1:2': 'co-1' })
    expect(s.dirty).toBe(true)
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.shelves[0].zone_edits ?? {}).toEqual({})
  })

  it('assigns every cubby of the selected shelves when none are picked, ignoring rooms', () => {
    let s = editorReducer(start(), { type: 'select', refs: [R1, SA, SB] })
    s = editorReducer(s, { type: 'assignZone', companyId: 'co-1' })
    expect(s.doc.shelves.map((x) => x.zone_edits)).toEqual([{ '1:1': 'co-1', '1:2': 'co-1' }, { '1:1': 'co-1', '1:2': 'co-1' }])
    expect(s.doc.plan.rooms).toEqual(grouped.plan.rooms)
    expect(editorReducer(s, { type: 'assignZone', companyId: 'co-1' })).toBe(s)
  })

  it('drops the pick when the selection changes', () => {
    let s = pick(editorReducer(start(), { type: 'select', refs: [SA] }), '1:1')
    expect(s.cubbyPick?.cells).toEqual(['1:1'])
    s = editorReducer(s, { type: 'select', refs: [SB] })
    expect(s.cubbyPick).toBeNull()
  })

  it('without layout rights refuses every layout change, but assigns zones and undoes', () => {
    let s = editorReducer(start(), { type: 'load', doc: grouped, canLayout: false })
    s = editorReducer(s, { type: 'select', refs: [SA] })
    const refused: EditorAction[] = [
      { type: 'nudge', dx: 10, dy: 0 }, { type: 'rotate', turn: 1 }, { type: 'delete' }, { type: 'lock', locked: true },
      { type: 'patch', ref: SA, patch: { shelf_letter: 'Z' }, record: true }, { type: 'checkpoint' },
      { type: 'add', shape: 'shelf', rect: { x: 0, y: 0, w: 100, d: 40 }, id: 'n1' }, { type: 'duplicate', seed: 'd' },
    ]
    for (const a of refused) expect(editorReducer(s, a)).toBe(s)
    s = editorReducer(s, { type: 'assignZone', companyId: 'co-1' })
    expect(s.doc.shelves[0].zone_edits).toEqual({ '1:1': 'co-1', '1:2': 'co-1' })
    expect(editorReducer(s, { type: 'undo' }).doc.shelves[0].zone_edits ?? {}).toEqual({})
  })

  it('stays dirty after a save that left zones unsaved, and keeps layout rights through saves', () => {
    let s = editorReducer(start(), { type: 'load', doc: grouped, canLayout: false })
    s = editorReducer(s, { type: 'saved', doc: grouped, dirty: true })
    expect([s.dirty, s.canLayout]).toEqual([true, false])
  })
})
