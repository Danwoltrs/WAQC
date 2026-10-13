import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import { ViewPanel } from './view-panel'
import type { EditorDoc } from './editor-state'

const doc: EditorDoc = {
  plan: EMPTY_FLOOR_PLAN,
  shelves: [{
    key: 's-a', id: 's-a', shelf_letter: 'A', rows: 2, columns: 2, samples_per_position: 42,
    x_cm: 0, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
    locked: false, group_id: null, company_id: null, cubbies: [],
  }],
}

describe('ViewPanel', () => {
  it("shows the whole lab's zone history with no shelf selected, and a shelf's summary otherwise", async () => {
    const event = { changed_at: '2026-10-13T17:02:00Z', changed_by_name: 'Daniel Wolthers', from_name: null, to_name: 'Ahold', codes: ['A-A1'] }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events: [event] })))
    vi.stubGlobal('fetch', fetchMock)
    const onOpenShelf = vi.fn()
    const base = { laboratoryId: 'lab', doc, zones: new Map(), names: new Map(), historyToken: 0, onFound: vi.fn(), onOpenShelf }
    const { rerender } = render(<ViewPanel {...base} selectedShelfKey={null} />)
    expect(await screen.findByText('A-A1: General → Ahold')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/laboratories/lab/storage/zone-history?limit=20')
    rerender(<ViewPanel {...base} selectedShelfKey="s-a" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open cubbies' }))
    expect(onOpenShelf).toHaveBeenCalledWith('s-a')
  })
})
