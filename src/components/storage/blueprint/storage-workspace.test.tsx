import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('saves a room nudged past the plan corner with the plan moved back, and the view moves with it', async () => {
    const roomy = { ...layout, laboratory: { ...layout.laboratory, floor_plan: { version: 1, rooms: [{ id: 'r1', x: 0, y: 0, w: 280, d: 200 }], items: [] } } }
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method !== 'PUT') return Promise.resolve(new Response(JSON.stringify(roomy)))
      const body = JSON.parse(String(init.body))
      return Promise.resolve(new Response(JSON.stringify({
        ...roomy,
        laboratory: { ...roomy.laboratory, floor_plan: body.floor_plan },
        shelves: body.shelves.map((x: object) => ({ ...x, company_id: null, cubbies: [] })),
      })))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const plan = screen.getByRole('application')
    fireEvent.pointerDown(plan.querySelector('[data-shape="room:r1"]')!, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(plan, { pointerId: 1 })
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    const before = plan.getAttribute('viewBox')!.split(' ').map(Number)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
    const sent = JSON.parse(String(put[1]!.body))
    expect(sent.floor_plan.rooms[0]).toMatchObject({ x: 0, y: 0 })
    expect(sent.shelves[0]).toMatchObject({ x_cm: 60, y_cm: 50 })
    await waitFor(() => expect(plan.getAttribute('viewBox')!.split(' ').map(Number)).toEqual([before[0] + 10, ...before.slice(1)]))
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
