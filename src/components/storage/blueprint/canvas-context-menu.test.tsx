import { describe, it, expect } from 'vitest'
import { ADD_ENTRIES, menuState } from './canvas-context-menu'
import type { EditorDoc, EditorShelf, ShapeRef } from './editor-state'

const shelf = (key: string, letter: string, x: number, over: Partial<EditorShelf> = {}): EditorShelf => ({
  key, id: key, shelf_letter: letter, rows: 1, columns: 2, samples_per_position: 42,
  x_cm: x, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null, cubbies: [], ...over,
})
const doc: EditorDoc = {
  plan: {
    version: 1,
    rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }],
    items: [
      { id: 'i1', kind: 'bench', label: null, x: 100, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
      { id: 'i2', kind: 'table', label: null, x: 300, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
    ],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [shelf('s-a', 'A', 0, { access_side: 'both' }), shelf('s-b', 'B', 200, { locked: true })],
}
const R1: ShapeRef = { kind: 'room', key: 'r1' }
const I1: ShapeRef = { kind: 'item', key: 'i1' }
const I2: ShapeRef = { kind: 'item', key: 'i2' }
const SA: ShapeRef = { kind: 'shelf', key: 's-a' }
const SB: ShapeRef = { kind: 'shelf', key: 's-b' }
const at = { x: 10, y: 10 }
const on = (ref: ShapeRef) => ({ kind: 'shape' as const, ref, at })

describe('menuState', () => {
  it('can add a wall here', () => {
    expect(ADD_ENTRIES).toContainEqual(['wall', 'Wall'])
  })

  it('offers Add here, Paste here, Select all and Fit on the floor', () => {
    const m = menuState(doc, [], { kind: 'floor', at }, 'edit', false)
    expect([...m.show]).toEqual(['addHere', 'pasteHere', 'selectAll', 'fit'])
    expect(m.disabled.has('pasteHere')).toBe(true)
  })

  it('offers a shelf its own entries and turns', () => {
    const m = menuState(doc, [SA], on(SA), 'edit', true)
    for (const id of ['edit', 'rename', 'rotateRight', 'duplicate', 'copy', 'paste', 'lock', 'accessBoth', 'viewCubbies', 'delete'] as const) {
      expect(m.show.has(id)).toBe(true)
    }
    expect(m.accessBoth).toBe(true)
    expect(m.disabled.size).toBe(0)
    expect(m.show.has('group')).toBe(false)
  })

  it('offers Unlock on a locked shelf and blocks turning and deleting it', () => {
    const m = menuState(doc, [SB], on(SB), 'edit', false)
    expect(m.show.has('unlock')).toBe(true)
    expect(m.show.has('lock')).toBe(false)
    expect([...m.disabled].sort()).toEqual(['delete', 'paste', 'rotateLeft', 'rotateRight'])
  })

  it('names a group, offers Ungroup and not Group', () => {
    const m = menuState(doc, [I1, I2], on(I1), 'edit', false)
    expect(m.renameLabel).toBe('Name group')
    expect(m.show.has('ungroup')).toBe(true)
    expect(m.show.has('group')).toBe(false)
    expect(m.show.has('align')).toBe(true)
    expect(m.disabled.has('distribute')).toBe(true)
  })

  it('cannot group or turn a set with a room, and has no Edit for several loose shapes', () => {
    const m = menuState(doc, [R1, SA], on(SA), 'edit', false)
    expect(m.disabled.has('group')).toBe(true)
    expect(m.disabled.has('rotateRight')).toBe(true)
    expect(m.show.has('edit')).toBe(false)
  })

  it('lets furniture change type and a room add here', () => {
    expect(menuState(doc, [I2], on(I2), 'edit', false)).toMatchObject({ itemKind: 'table' })
    expect(menuState(doc, [I2], on(I2), 'edit', false).show.has('changeType')).toBe(true)
    expect(menuState(doc, [R1], on(R1), 'edit', false).show.has('addHere')).toBe(true)
  })

  it('offers only View cubbies and Fit when viewing', () => {
    expect([...menuState(doc, [SA], on(SA), 'view', true).show]).toEqual(['viewCubbies', 'fit'])
    expect([...menuState(doc, [], { kind: 'floor', at }, 'view', true).show]).toEqual(['fit'])
  })

  it('offers only View cubbies, Select all and Fit to someone without layout rights', () => {
    expect([...menuState(doc, [SA], on(SA), 'edit', true, false).show]).toEqual(['viewCubbies', 'selectAll', 'fit'])
    expect([...menuState(doc, [I1], on(I1), 'edit', true, false).show]).toEqual(['selectAll', 'fit'])
    expect([...menuState(doc, [], { kind: 'floor', at }, 'edit', true, false).show]).toEqual(['selectAll', 'fit'])
  })
})
