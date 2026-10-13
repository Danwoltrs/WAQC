import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StorageWorkspace } from './storage-workspace'

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

const layout = {
  laboratory: { id: 'lab', name: 'Santos', floor_plan: { version: 1, rooms: [], items: [] }, storage_capacity: 84 },
  shelves: [{
    id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42, x_cm: 50, y_cm: 50,
    width_cm: 60, depth_cm: 40, rot: 0, access_side: 'front', company_id: null, cubbies: [],
  }],
  companies: [],
  can_edit: true,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(layout)))))
})

describe('StorageWorkspace', () => {
  it('offers no Edit on a read-only surface, even to a manager', async () => {
    render(<StorageWorkspace laboratoryId="lab" readOnly />)
    await screen.findByTestId('shelf-A')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('locks a shelf from its right-click menu', async () => {
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.contextMenu(screen.getByTestId('shelf-A'))
    expect(await screen.findByRole('menuitem', { name: /Rotate right/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Lock/ }))
    expect(await screen.findByTestId('lock-shelf:s-a')).toBeInTheDocument()
  })

  it('offers Add here and Fit on the floor', async () => {
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.contextMenu(screen.getByRole('application'))
    expect(await screen.findByRole('menuitem', { name: 'Fit plan to screen' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Add here/ })).toBeInTheDocument()
  })
})
