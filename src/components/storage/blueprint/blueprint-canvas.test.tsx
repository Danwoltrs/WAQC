import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BlueprintCanvas, type BlueprintCanvasProps } from './blueprint-canvas'
import type { EditorDoc } from './editor-state'
import { zoneStyles } from './zone-colors'

// jsdom 25 has no PointerEvent: fireEvent.pointerDown would send a bare Event
// with no `button`, and the canvas ignores anything but the primary button.
if (!('PointerEvent' in window)) {
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent
}

const I1 = { kind: 'item' as const, key: 'i1' }
const I2 = { kind: 'item' as const, key: 'i2' }
const SA = { kind: 'shelf' as const, key: 's-a' }

const doc: EditorDoc = {
  plan: {
    version: 1,
    rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: 'Sample room', locked: true }],
    items: [
      { id: 'i1', kind: 'bench', label: null, x: 100, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
      { id: 'i2', kind: 'bench', label: null, x: 300, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: 'g1' },
    ],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [{
    key: 's-a', id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
    x_cm: 50, y_cm: 50, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
    locked: true, group_id: null, company_id: null, cubbies: [],
  }],
}

function renderProps(over: Partial<BlueprintCanvasProps> = {}): BlueprintCanvasProps {
  return {
    doc, mode: 'edit', tool: 'select', selection: [], zones: new Map(), fitToken: 0,
    onSelect: vi.fn(), onToggle: vi.fn(), onCheckpoint: vi.fn(), onPatchMany: vi.fn(), onAdd: vi.fn(),
    onContextTarget: vi.fn(),
    ...over,
  }
}

function renderCanvas(over: Partial<BlueprintCanvasProps> = {}) {
  const props = renderProps(over)
  render(<BlueprintCanvas {...props} />)
  return props
}

describe('BlueprintCanvas', () => {
  it('draws a wall as a solid bar with no label', () => {
    const wall = { id: 'w1', kind: 'wall' as const, label: null, x: 0, y: 300, w: 400, d: 20, rot: 0 as const, locked: false, group_id: null }
    renderCanvas({ doc: { ...doc, plan: { ...doc.plan, items: [...doc.plan.items, wall] } } })
    const shape = screen.getByTestId('item-w1')
    expect(shape.textContent).toBe('')
    expect(shape.querySelector('rect.fill-foreground')).not.toBeNull()
  })

  it('moves the view with the plan when a save shifts it, so nothing jumps on screen', () => {
    const props: BlueprintCanvasProps = {
      doc, mode: 'edit', tool: 'select', selection: [], zones: new Map(), fitToken: 0, shift: { dx: 0, dy: 0 },
      onSelect: vi.fn(), onToggle: vi.fn(), onCheckpoint: vi.fn(), onPatchMany: vi.fn(), onAdd: vi.fn(),
      onContextTarget: vi.fn(),
    }
    const { rerender } = render(<BlueprintCanvas {...props} />)
    const view = () => screen.getByRole('application').getAttribute('viewBox')!.split(' ').map(Number)
    const [x, y, w, h] = view()
    rerender(<BlueprintCanvas {...props} shift={{ dx: 50, dy: 20 }} />)
    expect(view()).toEqual([x + 50, y + 20, w, h])
  })

  it('selects a clicked shape (the reducer widens it to its group), and one member on double-click', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1 })
    expect(p.onSelect).toHaveBeenCalledWith([I1])
    fireEvent.doubleClick(screen.getByTestId('item-i1'))
    expect(p.onSelect).toHaveBeenLastCalledWith([I1], true)
  })

  it('toggles a shape on Shift+click', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('item-i2'), { button: 0, pointerId: 1, shiftKey: true })
    expect(p.onToggle).toHaveBeenCalledWith(I2)
    expect(p.onSelect).not.toHaveBeenCalled()
  })

  it('moves every selected shape together, but pans when one of them is locked', () => {
    const moving = renderCanvas({ selection: [I1, I2] })
    fireEvent.pointerDown(screen.getAllByTestId('item-i1')[0], { button: 0, pointerId: 1 })
    fireEvent.pointerMove(screen.getAllByRole('application')[0], { pointerId: 1, clientX: 40, clientY: 0 })
    expect(moving.onCheckpoint).toHaveBeenCalledTimes(1)
    expect(vi.mocked(moving.onPatchMany).mock.calls[0][0].map((p) => p.ref)).toEqual([I1, I2])
  })

  it('pans instead of moving a locked shape', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('shelf-A'), { button: 0, pointerId: 1 })
    fireEvent.pointerMove(screen.getByRole('application'), { pointerId: 1, clientX: 40, clientY: 0 })
    expect(p.onCheckpoint).not.toHaveBeenCalled()
    expect(p.onPatchMany).not.toHaveBeenCalled()
  })

  it('marks locked shapes, names rooms and groups, and gives handles only to one unlocked shape', () => {
    renderCanvas({ selection: [SA] })
    expect(screen.getByTestId('lock-shelf:s-a')).toBeInTheDocument()
    expect(screen.getByTestId('lock-room:r1')).toBeInTheDocument()
    expect(screen.getByText('Sample room')).toBeInTheDocument()
    expect(screen.getByText('Bench pair')).toBeInTheDocument()
    expect(screen.queryByTestId('handle-n')).toBeNull()
  })

  it('gives handles to one unlocked shape', () => {
    renderCanvas({ selection: [I1] })
    expect(screen.getByTestId('handle-n')).toBeInTheDocument()
  })

  it('reports what was right-clicked, selecting it first', () => {
    const p = renderCanvas()
    fireEvent.contextMenu(screen.getByTestId('shelf-A'))
    expect(p.onSelect).toHaveBeenCalledWith([SA], false)
    expect(p.onContextTarget).toHaveBeenCalledWith({ kind: 'shape', ref: SA, at: { x: 0, y: 0 } })
    fireEvent.contextMenu(screen.getByRole('application'))
    expect(p.onContextTarget).toHaveBeenLastCalledWith({ kind: 'floor', at: { x: 0, y: 0 } })
  })

  it('moves nothing when a click wobbles a pixel', () => {
    const p = renderCanvas({ selection: [I1, I2] })
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(screen.getByRole('application'), { pointerId: 1, clientX: 102, clientY: 101 })
    fireEvent.pointerUp(screen.getByRole('application'), { pointerId: 1, clientX: 102, clientY: 101 })
    expect(p.onCheckpoint).not.toHaveBeenCalled()
    expect(p.onPatchMany).not.toHaveBeenCalled()
  })

  it('narrows a bigger selection to the clicked shape and its group', () => {
    const loose: EditorDoc = { ...doc, shelves: [{ ...doc.shelves[0], locked: false }] }
    const p = renderCanvas({ doc: loose, selection: [I1, I2, SA] })
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(screen.getByRole('application'), { pointerId: 1, clientX: 100, clientY: 100 })
    expect(p.onSelect).toHaveBeenCalledWith([I1])
  })

  it('narrows too when a locked shape in the selection turns the press into a pan', () => {
    const p = renderCanvas({ selection: [I1, I2, SA] })
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(screen.getByRole('application'), { pointerId: 1, clientX: 100, clientY: 100 })
    expect(p.onSelect).toHaveBeenCalledWith([I1])
  })

  it('leaves a Ctrl+click on a Mac to the right-click menu', () => {
    const platform = vi.spyOn(Navigator.prototype, 'platform', 'get').mockReturnValue('MacIntel')
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1, ctrlKey: true })
    fireEvent.pointerMove(screen.getByRole('application'), { pointerId: 1, clientX: 40, clientY: 0 })
    expect(p.onSelect).not.toHaveBeenCalled()
    expect(p.onCheckpoint).not.toHaveBeenCalled()
    platform.mockRestore()
  })

  it('toggles a shape on Cmd+click as on Shift+click', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('item-i2'), { button: 0, pointerId: 1, metaKey: true })
    expect(p.onToggle).toHaveBeenCalledWith(I2)
  })

  it("opens a shelf's cubbies on a click when viewing and on a double-click when editing", () => {
    const onOpenShelf = vi.fn()
    const { unmount } = render(<BlueprintCanvas {...renderProps({ mode: 'view', onOpenShelf })} />)
    fireEvent.click(screen.getByTestId('shelf-A'))
    expect(onOpenShelf).toHaveBeenLastCalledWith('s-a')
    unmount()
    const p = renderCanvas({ onOpenShelf })
    fireEvent.doubleClick(screen.getByTestId('shelf-A'))
    expect(p.onSelect).toHaveBeenLastCalledWith([{ kind: 'shelf', key: 's-a' }], true)
    expect(onOpenShelf).toHaveBeenCalledTimes(2)
  })

  it('without layout rights selects a shape but pans instead of moving it, and shows no handles', () => {
    const p = renderCanvas({ canLayout: false, selection: [I1] })
    expect(screen.queryByTestId('handle-nw')).toBeNull()
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(screen.getByRole('application'), { pointerId: 1, clientX: 80, clientY: 10 })
    expect(p.onCheckpoint).not.toHaveBeenCalled()
    expect(p.onPatchMany).not.toHaveBeenCalled()
  })

  it('tints a shelf by the zones assigned in this session', () => {
    const zoned = { ...doc, shelves: [{ ...doc.shelves[0], zone_edits: { '1:1': 'co-1' } }] }
    renderCanvas({ doc: zoned, zones: zoneStyles(['co-1']) })
    expect(screen.getByTestId('shelf-A').querySelector('rect[fill="#556b2f"]')).not.toBeNull()
  })
})
