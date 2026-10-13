import { describe, it, expect } from 'vitest'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import { carryZoneEdits, nextPick, rectCells, shelfZones, zoneChanges, zoneCounts } from './zones'
import type { EditorDoc, EditorShelf } from './editor-state'

const CO = 'co-ahold'
const OTHER = 'co-dunkin'
const shelf = (over: Partial<EditorShelf> = {}): EditorShelf => ({
  key: 's-b', id: 's-b', shelf_letter: 'B', rows: 2, columns: 3, samples_per_position: 42,
  x_cm: 0, y_cm: 0, width_cm: 120, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null,
  cubbies: [{ id: 'p11', row: 1, column: 1, code: 'B-A1', capacity: 42, occupied: 0, company_id: OTHER }],
  ...over,
})
const doc = (...shelves: EditorShelf[]): EditorDoc => ({ plan: EMPTY_FLOOR_PLAN, shelves })
const savedCubbies = (letter: string) => [1, 2].flatMap((row) => [1, 2, 3].map((column) => ({
  id: `${letter}${row}${column}`, row, column, code: `${letter}-${'AB'[row - 1]}${column}`,
  capacity: 42, occupied: 0, company_id: null,
})))

describe('zones', () => {
  it('reads an edit over the saved zone, and the saved zone over general space', () => {
    const z = shelfZones(shelf({ zone_edits: { '1:2': CO, '1:1': null } }))
    expect([z.get('1:1'), z.get('1:2'), z.get('2:3')]).toEqual([null, CO, null])
    expect(zoneCounts(shelf({ zone_edits: { '1:2': CO, '2:2': CO } }))).toEqual(new Map([[OTHER, 1], [CO, 2]]))
  })

  it('picks one cubby, adds and removes with Cmd/Ctrl, and a block with Shift', () => {
    let p = nextPick(null, 's-b', '1:1', 'only')
    p = nextPick(p, 's-b', '2:3', 'range')
    expect(p.cells).toEqual(['1:1', '1:2', '1:3', '2:1', '2:2', '2:3'])
    p = nextPick(p, 's-b', '1:2', 'toggle')
    expect(p.cells).not.toContain('1:2')
    expect(nextPick(p, 's-c', '1:1', 'toggle')).toEqual({ shelfKey: 's-c', cells: ['1:1'], anchor: '1:1' })
    expect(rectCells('2:2', '1:1')).toEqual(['1:1', '1:2', '2:1', '2:2'])
  })

  it("sends only this session's edits, by the saved layout's cubby codes, after a letter change", () => {
    // Renamed B to C in the same session: the fresh layout has shelf C with C codes.
    const edited = shelf({ shelf_letter: 'C', zone_edits: { '1:1': CO, '2:3': null } })
    const fresh = { shelves: [{ ...shelf({ shelf_letter: 'C' }), id: 's-b', cubbies: savedCubbies('C') }] }
    expect(zoneChanges(doc(edited), fresh)).toEqual([{ code: 'C-A1', company_id: CO }, { code: 'C-B3', company_id: null }])
    expect(zoneChanges(doc(shelf({ shelf_letter: 'C' })), fresh)).toEqual([])
  })

  it('leaves out edits in rows the shelf no longer has', () => {
    const shrunk = shelf({ rows: 1, zone_edits: { '2:1': CO, '1:3': CO } })
    const fresh = { shelves: [{ ...shelf(), id: 's-b', cubbies: savedCubbies('B') }] }
    expect(zoneChanges(doc(shrunk), fresh)).toEqual([{ code: 'B-A3', company_id: CO }])
  })

  it('keeps pending edits on the saved shelves, matched by letter', () => {
    const prev = doc(shelf({ key: 'tmp-1', id: undefined, zone_edits: { '1:2': CO } }))
    expect(carryZoneEdits(doc(shelf()), prev).shelves[0].zone_edits).toEqual({ '1:2': CO })
  })
})
