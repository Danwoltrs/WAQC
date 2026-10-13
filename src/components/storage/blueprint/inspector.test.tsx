import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import { Inspector, type InspectorProps } from './inspector'
import type { EditorDoc, EditorShelf } from './editor-state'

const shelf = (key: string, letter: string, depth: number, over: Partial<EditorShelf> = {}): EditorShelf => ({
  key, id: key, shelf_letter: letter, rows: 6, columns: 4, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 120, depth_cm: depth, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null, cubbies: [], ...over,
})

function handlers() {
  return {
    onPatch: vi.fn(), onRotate: vi.fn(), onDelete: vi.fn(), onLock: vi.fn(), onGroup: vi.fn(), onUngroup: vi.fn(),
    onRenameGroup: vi.fn(), onAlign: vi.fn(), onDistribute: vi.fn(),
  }
}

function editDepthThenSelectB(depthB: number) {
  const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf('a', 'A', 40), shelf('b', 'B', depthB)] }
  const h = handlers()
  const props: Omit<InspectorProps, 'selection'> = { doc, zones: new Map(), ...h }
  const { rerender } = render(<Inspector {...props} selection={[{ kind: 'shelf', key: 'a' }]} />)
  const depth = screen.getByLabelText('Depth (cm)')
  fireEvent.focus(depth)
  fireEvent.change(depth, { target: { value: '60' } })
  // Clicking shelf B on the plan selects it on pointerdown, before the field blurs.
  rerender(<Inspector {...props} selection={[{ kind: 'shelf', key: 'b' }]} />)
  fireEvent.blur(depth)
  return { onPatch: h.onPatch, depth }
}

const room = { id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }
const pair: EditorDoc = {
  plan: {
    version: 1,
    rooms: [room],
    items: [
      { id: 'i1', kind: 'bench', label: null, x: 100, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
      { id: 'i2', kind: 'bench', label: null, x: 300, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
    ],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [shelf('a', 'A', 40, { locked: true })],
}

describe('Inspector', () => {
  it('takes a position past the plan corner, as a drag can; the save moves the plan back', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'room', key: 'r1' }]} />)
    const x = screen.getByLabelText('X (cm)')
    fireEvent.focus(x)
    fireEvent.change(x, { target: { value: '-50' } })
    fireEvent.blur(x)
    expect(h.onPatch).toHaveBeenCalledWith({ kind: 'room', key: 'r1' }, { x: -50 })
  })

  it('commits a typed value to the shape it was typed for when another shape of the same size is clicked', () => {
    const { onPatch, depth } = editDepthThenSelectB(40)
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith({ kind: 'shelf', key: 'a' }, { d: 60 })
    expect(depth).toHaveValue('40')
  })

  it('keeps the typed value when the next shape differs, and then shows that shape', () => {
    const { onPatch, depth } = editDepthThenSelectB(50)
    expect(onPatch).toHaveBeenCalledWith({ kind: 'shelf', key: 'a' }, { d: 60 })
    expect(depth).toHaveValue('50')
  })

  it('names a room', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'room', key: 'r1' }]} />)
    const name = screen.getByLabelText('Name')
    fireEvent.focus(name)
    fireEvent.change(name, { target: { value: 'Sample room' } })
    fireEvent.blur(name)
    expect(h.onPatch).toHaveBeenCalledWith({ kind: 'room', key: 'r1' }, { name: 'Sample room' })
  })

  it('keeps a locked shape in place but its details editable', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'shelf', key: 'a' }]} />)
    expect(screen.getByLabelText('X (cm)')).toBeDisabled()
    expect(screen.getByLabelText('Letter')).toBeEnabled()
    expect(screen.getByRole('button', { name: /Delete/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
    expect(h.onLock).toHaveBeenCalledWith(false)
  })

  it('shows a group with its name, Ungroup and Lock', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'item', key: 'i1' }, { kind: 'item', key: 'i2' }]} />)
    const name = screen.getByLabelText('Group name')
    fireEvent.focus(name)
    fireEvent.change(name, { target: { value: 'Pair' } })
    fireEvent.blur(name)
    expect(h.onRenameGroup).toHaveBeenCalledWith('g1', 'Pair')
    fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }))
    expect(h.onUngroup).toHaveBeenCalled()
  })

  it('offers Group only without a room, and Distribute only for three or more', () => {
    const h = handlers()
    render(<Inspector doc={pair} zones={new Map()} {...h} selection={[{ kind: 'room', key: 'r1' }, { kind: 'item', key: 'i1' }]} />)
    expect(screen.getByRole('button', { name: 'Group' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Distribute horizontally' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }))
    expect(h.onAlign).toHaveBeenCalledWith('left')
  })

  it('keeps a group name typed just before the panel closes', () => {
    const h = handlers()
    const both = [{ kind: 'item' as const, key: 'i1' }, { kind: 'item' as const, key: 'i2' }]
    const { rerender } = render(<Inspector doc={pair} zones={new Map()} {...h} selection={both} />)
    const name = screen.getByLabelText('Group name')
    fireEvent.focus(name)
    fireEvent.change(name, { target: { value: 'Wall rack' } })
    // Clicking the floor clears the selection on pointerdown: the field goes away before it blurs.
    rerender(<Inspector doc={pair} zones={new Map()} {...h} selection={[]} />)
    expect(h.onRenameGroup).toHaveBeenCalledWith('g1', 'Wall rack')
  })
})
