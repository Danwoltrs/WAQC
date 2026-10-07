import { describe, it, expect } from 'vitest'
import { assembleLayout } from './layout'
import { EMPTY_FLOOR_PLAN } from './floor-plan'

const shelfRow = {
  id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 60, depth_cm: 40, rot: 0 as const, access_side: 'front' as const, company_id: null,
}

describe('assembleLayout', () => {
  it('opens a lab with legacy shelves and no floor plan as an empty room with its shelves', () => {
    const layout = assembleLayout({
      lab: { id: 'lab', name: 'Santos', floor_plan: null },
      shelves: [shelfRow],
      positions: [
        { id: 'p2', shelf_id: 's-a', row_number: 1, column_number: 2, position_code: 'A-A2', capacity_per_position: 42, company_id: 'co-1' },
        { id: 'p1', shelf_id: 's-a', row_number: 1, column_number: 1, position_code: 'A-A1', capacity_per_position: 42, company_id: null },
      ],
      occupancy: [{ position_id: 'p2', occupied: 7 }],
      companies: [{ id: 'co-1', name: 'Dunkin Brands Inc', fantasy_name: 'Dunkin' }],
    })
    expect(layout.laboratory.floor_plan).toEqual(EMPTY_FLOOR_PLAN)
    expect(layout.laboratory.storage_capacity).toBe(84)
    expect(layout.shelves[0].cubbies.map((c) => [c.code, c.occupied])).toEqual([['A-A1', 0], ['A-A2', 7]])
    expect(layout.companies).toEqual([{ id: 'co-1', name: 'Dunkin' }])
  })

  it('falls back to an empty room when the stored plan is malformed', () => {
    const layout = assembleLayout({
      lab: { id: 'lab', name: 'Santos', floor_plan: { version: 2 } },
      shelves: [], positions: [], occupancy: [], companies: [],
    })
    expect(layout.laboratory.floor_plan).toEqual(EMPTY_FLOOR_PLAN)
  })
})
