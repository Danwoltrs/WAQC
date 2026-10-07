import { describe, it, expect } from 'vitest'
import { EMPTY_FLOOR_PLAN, parseFloorPlan, parseShelfInputs, positionCode } from './floor-plan'


const shelf = (over: Record<string, unknown> = {}) => ({
  shelf_letter: 'a', rows: 6, columns: 4, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 120, depth_cm: 40, rot: 0, access_side: 'front', ...over,
})

describe('parseFloorPlan', () => {
  it('treats a missing plan as an empty room', () => {
    expect(parseFloorPlan(null)).toEqual({ ok: true, value: EMPTY_FLOOR_PLAN })
  })

  it('accepts rooms and items in whole centimetres', () => {
    const plan = {
      version: 1,
      rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600 }],
      items: [{ id: 'i1', kind: 'door', label: ' Entrance ', x: 0, y: 580, w: 90, d: 20, rot: 0 }],
    }
    const parsed = parseFloorPlan(plan)
    expect(parsed.ok && parsed.value.items[0].label).toBe('Entrance')
  })

  it('refuses a shape smaller than 20 cm, a fractional size and an unknown kind', () => {
    const base = { version: 1, rooms: [], items: [] }
    expect(parseFloorPlan({ ...base, rooms: [{ id: 'r', x: 0, y: 0, w: 10, d: 600 }] }).ok).toBe(false)
    expect(parseFloorPlan({ ...base, rooms: [{ id: 'r', x: 0.5, y: 0, w: 100, d: 100 }] }).ok).toBe(false)
    expect(parseFloorPlan({ ...base, items: [{ id: 'i', kind: 'sofa', label: null, x: 0, y: 0, w: 50, d: 50, rot: 0 }] }).ok).toBe(false)
    expect(parseFloorPlan({ ...base, items: [{ id: 'i', kind: 'bench', label: null, x: 0, y: 0, w: 50, d: 50, rot: 45 }] }).ok).toBe(false)
  })
})

describe('parseShelfInputs', () => {
  it('upper-cases letters and keeps an existing id', () => {
    const id = '7d3c1f9e-2a4b-4c5d-8e6f-0a1b2c3d4e5f'
    const parsed = parseShelfInputs([shelf({ id })])
    expect(parsed).toEqual({ ok: true, value: [{ ...shelf({ id }), shelf_letter: 'A' }] })
  })

  it('refuses a letter used twice, 27 rows and a capacity of 0', () => {
    expect(parseShelfInputs([shelf(), shelf({ shelf_letter: 'A' })])).toEqual({ ok: false, error: 'Shelf letter A is used twice' })
    expect(parseShelfInputs([shelf({ rows: 27 })]).ok).toBe(false)
    expect(parseShelfInputs([shelf({ samples_per_position: 0 })]).ok).toBe(false)
    expect(parseShelfInputs([shelf({ access_side: 'back' })]).ok).toBe(false)
  })
})

describe('positionCode', () => {
  it('names row 1 A, like the database', () => {
    expect(positionCode('B', 3, 4)).toBe('B-C4')
  })
})

describe('a shape turned a quarter against the wall', () => {
  // A 120 x 40 shelf turned 90 degrees covers 40 x 120 on the floor, centred on
  // its unrotated rectangle: flush with the wall at x = 0 its stored x is -40.
  it('is valid while what it covers stays on the plan', () => {
    expect(parseShelfInputs([shelf({ rot: 90, width_cm: 120, depth_cm: 40, x_cm: -40 })]).ok).toBe(true)
    const item = { id: 'i', kind: 'bench', label: null, x: -40, y: 50, w: 120, d: 40, rot: 270 }
    expect(parseFloorPlan({ version: 1, rooms: [], items: [item] }).ok).toBe(true)
  })

  it('is refused once what it covers crosses the edge', () => {
    expect(parseShelfInputs([shelf({ rot: 90, width_cm: 120, depth_cm: 40, x_cm: -50 })]).ok).toBe(false)
    expect(parseShelfInputs([shelf({ rot: 0, x_cm: -1 })]).ok).toBe(false)
  })
})
