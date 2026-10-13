import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StorageOverlay } from './storage-overlay'

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
    width_cm: 60, depth_cm: 40, rot: 0, access_side: 'front', company_id: null,
    cubbies: [
      { id: 'p1', row: 1, column: 1, code: 'A-A1', capacity: 42, occupied: 3, company_id: null },
      { id: 'p2', row: 1, column: 2, code: 'A-A2', capacity: 42, occupied: 0, company_id: null },
    ],
  }],
  companies: [],
  can_edit: true,
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return json({ error: 'Some changes would remove space that still holds samples', conflicts: ['Cubby A-A1 holds 3 samples and is outside the new grid'] }, 409)
    }
    return json(layout)
  }))
})

async function openAndEditRows() {
  const onClose = vi.fn()
  render(<StorageOverlay laboratoryId="lab" labName="Santos" onClose={onClose} />)
  await screen.findByTestId('shelf-A')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.pointerDown(screen.getByTestId('shelf-A'), { button: 0, pointerId: 1 })
  fireEvent.pointerUp(screen.getByRole('application'), { pointerId: 1 })
  const rows = await screen.findByLabelText('Columns')
  fireEvent.change(rows, { target: { value: '1' } })
  fireEvent.blur(rows)
  return onClose
}

describe('StorageOverlay', () => {
  it('covers the screen from the page body, not from inside the page that opened it', async () => {
    render(<div data-testid="page"><StorageOverlay laboratoryId="lab" labName="Santos" onClose={vi.fn()} /></div>)
    const overlay = screen.getByRole('dialog', { name: 'Storage · Santos' })
    expect(overlay.parentElement).toBe(document.body)
    expect(screen.getByTestId('page')).not.toContainElement(overlay)
    await screen.findByTestId('shelf-A')
  })

  it('puts the title after the logo and its divider, like the sidebar', async () => {
    render(<StorageOverlay laboratoryId="lab" labName="Santos" onClose={vi.fn()} />)
    const [logo] = screen.getAllByAltText('Wolthers')
    expect(logo.getAttribute('src')).toContain('/logos/wolthers-logo')
    const cell = logo.parentElement as HTMLElement
    expect(cell).toHaveClass('w-64', 'border-r')
    expect(cell.nextElementSibling).toBe(screen.getByRole('heading', { name: 'Storage · Santos' }))
    await screen.findByTestId('shelf-A')
  })

  it('shows every conflict when a save would drop samples', async () => {
    await openAndEditRows()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cubby A-A1 holds 3 samples')
    // One GET only: the workspace must not refetch on every render.
    const gets = vi.mocked(fetch).mock.calls.filter(([, init]) => !(init as RequestInit | undefined)?.method)
    expect(gets).toHaveLength(1)
  })

  it('asks before closing with unsaved changes', async () => {
    const onClose = await openAndEditRows()
    // Dispatched on document so it bubbles to window, as a real key press does.
    fireEvent.keyDown(document, { key: 'Escape' }) // first Escape only deselects the shelf
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
