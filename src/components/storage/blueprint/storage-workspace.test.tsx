import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StorageWorkspace } from './storage-workspace'

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
})
