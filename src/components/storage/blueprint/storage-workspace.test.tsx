import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

  const CO = '11111111-1111-4111-8111-111111111111'
  const cubbies = [
    { id: 'p1', row: 1, column: 1, code: 'A-A1', capacity: 42, occupied: 0, company_id: null },
    { id: 'p2', row: 1, column: 2, code: 'A-A2', capacity: 42, occupied: 0, company_id: null },
  ]
  const zoned = (over: Record<string, unknown>) => ({ ...layout, ...over, shelves: [{ ...layout.shelves[0], cubbies }] })
  function serve(body: object, zonesStatus = 200) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('/api/clients')) return new Response(JSON.stringify({ clients: [{ id: CO, name: 'Ahold Delhaize USA', company: 'Ahold' }] }))
      if (u.includes('zone-history')) return new Response(JSON.stringify({ events: [] }))
      if (u.endsWith('/storage/zones')) {
        return new Response(JSON.stringify(zonesStatus === 200 ? body : { error: 'A client in these changes no longer exists' }), { status: zonesStatus })
      }
      return new Response(JSON.stringify(body))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const calls = (m: ReturnType<typeof serve>, end: string) =>
    m.mock.calls.filter(([u, i]) => String(u).endsWith(end) && (i as RequestInit | undefined)?.method === 'PUT')
  async function assignWholeShelfA() {
    fireEvent.doubleClick(screen.getByTestId('shelf-A'))
    const dialog = await screen.findByRole('dialog', { name: 'Shelf A' })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ahold' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign whole shelf' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Shelf A' })).toBeNull())
  }

  it('lets lab staff without layout rights assign a whole shelf, and saves only the zones', async () => {
    const fetchMock = serve(zoned({ can_edit: false, can_assign: true }))
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('navigation', { name: 'Drawing tools' })).toBeNull()
    await assignWholeShelfA()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls(fetchMock, '/storage/zones')).toHaveLength(1))
    expect(calls(fetchMock, '/storage')).toHaveLength(0)
    expect(JSON.parse(String(calls(fetchMock, '/storage/zones')[0][1]!.body))).toEqual({
      changes: [{ code: 'A-A1', company_id: CO }, { code: 'A-A2', company_id: CO }],
    })
  })

  it("saves a manager's layout first, then the zones", async () => {
    const fetchMock = serve(zoned({ can_edit: true, can_assign: true }))
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await assignWholeShelfA()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls(fetchMock, '/storage/zones')).toHaveLength(1))
    const order = fetchMock.mock.calls.map(([u, i]) => ((i as RequestInit | undefined)?.method === 'PUT' ? String(u) : null)).filter(Boolean)
    expect(order).toEqual(['/api/laboratories/lab/storage', '/api/laboratories/lab/storage/zones'])
  })

  it('keeps the zone edits and stays unsaved when the zones fail after the layout saved', async () => {
    const fetchMock = serve(zoned({ can_edit: true, can_assign: true }), 400)
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await assignWholeShelfA()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A client in these changes no longer exists')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls(fetchMock, '/storage/zones')).toHaveLength(2))
    const [first, retry] = calls(fetchMock, '/storage/zones').map(([, i]) => (i as RequestInit).body)
    expect(retry).toBe(first)
  })
})
