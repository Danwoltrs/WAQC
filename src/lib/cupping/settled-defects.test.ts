import { describe, it, expect } from 'vitest'
import { settledDefects } from './settled-defects'

const riado = { name: 'Hard (riado)', intensity: 2, cups_affected: 1 }
const fermented = { name: 'Fermented', intensity: 1, cups_affected: 2 }

describe('settledDefects', () => {
  it("keeps the validator's who-and-when stamp on the list it settled", () => {
    // Every finalize since 2026-09-10 lost it here: 0 of 1,277 lots carried it,
    // so the QR page, compliance and emails recounted from the cards.
    const submitted = { taints: [riado], faults: [], resolved_by: 'val', resolved_at: '2026-10-29T12:00:00Z' }
    const out = settledDefects(submitted, [{ cupper_id: 'a', defects: { taints: [riado, fermented], faults: [] } }], 'a')
    expect(out.list).toEqual(submitted)
    expect(out).toMatchObject({ taints: 1, faults: 0 })
  })

  it("without a settled list, takes the authoritative cupper's card", () => {
    const out = settledDefects(null, [
      { cupper_id: 'a', defects: { taints: [fermented], faults: [riado] } },
      { cupper_id: 'b', defects: { taints: [riado, fermented], faults: [] } },
    ], 'a')
    expect(out).toEqual({ list: { taints: [fermented], faults: [riado] }, taints: 1, faults: 1 })
  })

  it('without either, counts the longest card but settles no list', () => {
    const out = settledDefects(null, [
      { cupper_id: 'a', defects: { taints: [fermented], faults: [] } },
      { cupper_id: 'b', defects: { taints: [riado, fermented], faults: [] } },
    ], null)
    expect(out).toEqual({ list: { taints: [], faults: [] }, taints: 2, faults: 0 })
  })
})
