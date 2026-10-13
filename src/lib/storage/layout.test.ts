import { describe, it, expect } from 'vitest'
import { assembleLayout, loadStorageLayout } from './layout'
import { fakeSupabase } from './__fixtures__/fake-supabase'
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

  it('reads a shelf group only when the plan names it', () => {
    const layout = assembleLayout({
      lab: { id: 'lab', name: 'Santos', floor_plan: { version: 1, rooms: [], items: [], groups: [{ id: 'g1', name: 'Wall rack' }] } },
      shelves: [{ ...shelfRow, locked: true, group_id: 'g1' }, { ...shelfRow, id: 's-b', shelf_letter: 'B', group_id: 'gone' }],
      positions: [], occupancy: [], companies: [],
    })
    expect(layout.shelves.map((s) => [s.shelf_letter, s.locked, s.group_id])).toEqual([['A', true, 'g1'], ['B', false, null]])
  })

  it('falls back to an empty room when the stored plan is malformed', () => {
    const layout = assembleLayout({
      lab: { id: 'lab', name: 'Santos', floor_plan: { version: 2 } },
      shelves: [], positions: [], occupancy: [], companies: [],
    })
    expect(layout.laboratory.floor_plan).toEqual(EMPTY_FLOOR_PLAN)
  })
})

describe('loadStorageLayout', () => {
  it('reads every cubby of a lab with more than 1000, though the server caps each answer at 1000 rows', async () => {
    const shelf = {
      id: 's-a', shelf_letter: 'A', rows: 30, columns: 40, samples_per_position: 42, x_cm: 0, y_cm: 0,
      width_cm: 400, depth_cm: 40, rot: 0, access_side: 'front', company_id: null, locked: false, group_id: null,
    }
    const positions = Array.from({ length: 1200 }, (_, i) => ({
      id: `p${i}`, shelf_id: 's-a', row_number: Math.floor(i / 40) + 1, column_number: (i % 40) + 1,
      position_code: `A-${i}`, capacity_per_position: 42, company_id: null,
    }))
    const db = fakeSupabase({
      maxRows: 1000,
      tables: { laboratories: { id: 'lab', name: 'Santos', floor_plan: null }, lab_shelves: [shelf], storage_positions: positions },
    })
    const layout = await loadStorageLayout(db as any, 'lab')
    expect(layout!.shelves[0].cubbies).toHaveLength(1200)
    expect(db.calls).toContainEqual({ table: 'storage_positions', op: 'order', args: ['id'] })
  })
})
