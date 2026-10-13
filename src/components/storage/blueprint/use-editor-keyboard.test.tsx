import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEditorKeyboard } from './use-editor-keyboard'
import { initialEditorState, type EditorDoc, type EditorState, type ShapeRef } from './editor-state'
import type { EditorActions } from './use-blueprint-editor'
import { readClipboard } from './clipboard'

const shelf = (locked: boolean) => ({
  key: 's-a', id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
  x_cm: 0, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0 as const, access_side: 'front' as const,
  locked, group_id: null, company_id: null, cubbies: [],
})
const docWith = (locked: boolean): EditorDoc => ({ plan: { version: 1, rooms: [], items: [], groups: [] }, shelves: [shelf(locked)] })
const SA: ShapeRef = { kind: 'shelf', key: 's-a' }

function Harness({ state, actions }: { state: EditorState; actions: EditorActions }) {
  useEditorKeyboard(true, state, actions, () => ({ x: 400, y: 300 }))
  return (
    <>
      <input aria-label="Letter" />
      <div role="menu" tabIndex={-1} data-testid="menu" />
    </>
  )
}

function setup(selection: ShapeRef[] = [SA], locked = false) {
  const actions = {
    select: vi.fn(), selectAll: vi.fn(), rotate: vi.fn(), lock: vi.fn(), remove: vi.fn(), nudge: vi.fn(),
    duplicate: vi.fn(), group: vi.fn(), ungroup: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  }
  const state = { ...initialEditorState(docWith(locked)), selection }
  render(<Harness state={state} actions={actions as unknown as EditorActions} />)
  return actions
}
const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document, { key: k, ...init })

afterEach(() => localStorage.clear())

describe('useEditorKeyboard', () => {
  it('turns, locks, deletes and nudges the selection', () => {
    const a = setup()
    key('r')
    expect(a.rotate).toHaveBeenLastCalledWith(1)
    key('R', { shiftKey: true })
    expect(a.rotate).toHaveBeenLastCalledWith(-1)
    key('l')
    expect(a.lock).toHaveBeenLastCalledWith(true)
    key('Delete')
    expect(a.remove).toHaveBeenCalledTimes(1)
    key('ArrowLeft')
    expect(a.nudge).toHaveBeenLastCalledWith(-10, 0)
    key('ArrowDown', { shiftKey: true })
    expect(a.nudge).toHaveBeenLastCalledWith(0, 1)
  })

  it('unlocks when everything selected is locked', () => {
    const a = setup([SA], true)
    key('L')
    expect(a.lock).toHaveBeenLastCalledWith(false)
  })

  it('duplicates, groups, ungroups and selects all with the modifier', () => {
    const a = setup()
    key('d', { metaKey: true })
    expect(a.duplicate).toHaveBeenCalledTimes(1)
    key('g', { ctrlKey: true })
    expect(a.group).toHaveBeenCalledTimes(1)
    key('g', { metaKey: true, shiftKey: true })
    expect(a.ungroup).toHaveBeenCalledTimes(1)
    key('a', { metaKey: true })
    expect(a.selectAll).toHaveBeenCalledTimes(1)
    expect(a.rotate).not.toHaveBeenCalled()
  })

  it('copies the selection and pastes it at the middle of the view', () => {
    const a = setup()
    key('c', { metaKey: true })
    const clip = readClipboard()
    expect(clip?.shelves).toHaveLength(1)
    key('v', { metaKey: true })
    expect(a.paste).toHaveBeenCalledWith(clip, { x: 400, y: 300 })
  })

  it('leaves keys typed in a field, or handled by an open menu, alone', () => {
    const a = setup()
    fireEvent.keyDown(screen.getByLabelText('Letter'), { key: 'r' })
    fireEvent.keyDown(screen.getByTestId('menu'), { key: 'ArrowDown' })
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    document.dispatchEvent(handled)
    expect(a.rotate).not.toHaveBeenCalled()
    expect(a.nudge).not.toHaveBeenCalled()
    expect(a.select).not.toHaveBeenCalled()
    key('Escape')
    expect(a.select).toHaveBeenCalledWith([])
  })

  it('still undoes with nothing selected, and does nothing else', () => {
    const a = setup([])
    key('r')
    key('z', { metaKey: true })
    expect(a.rotate).not.toHaveBeenCalled()
    expect(a.undo).toHaveBeenCalledTimes(1)
  })

  it('leaves keys pressed inside the cubby display alone', () => {
    const a = setup()
    render(<div data-cubby-display=""><button type="button">B-A1</button></div>)
    const cubby = screen.getByRole('button', { name: 'B-A1' })
    fireEvent.keyDown(cubby, { key: 'Delete' })
    fireEvent.keyDown(cubby, { key: 'r' })
    expect(a.remove).not.toHaveBeenCalled()
    expect(a.rotate).not.toHaveBeenCalled()
  })
})
