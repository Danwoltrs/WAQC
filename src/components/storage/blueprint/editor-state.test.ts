import { describe, it, expect } from 'vitest'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import {
  editorReducer, fromLayout, initialEditorState, nextShelfLetter, toSavePayload, type EditorDoc,
} from './editor-state'

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
    expect(s.selected).toEqual({ kind: 'room', key: 'r1' })
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

  it('records inspector edits, rotates and deletes', () => {
    const ref = { kind: 'shelf' as const, key: 's-a' }
    let s = editorReducer(initialEditorState(doc), { type: 'patch', ref, patch: { rows: 3, shelf_letter: ' c ' }, record: true })
    expect(s.doc.shelves[0]).toMatchObject({ rows: 3, shelf_letter: 'C' })
    s = editorReducer(s, { type: 'rotate', ref })
    expect(s.doc.shelves[0].rot).toBe(90)
    s = editorReducer(s, { type: 'delete', ref })
    expect(s.doc.shelves).toEqual([])
    expect(s.selected).toBeNull()
    expect(s.past).toHaveLength(3)
  })
})

describe('helpers', () => {
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
