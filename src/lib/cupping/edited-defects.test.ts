import { describe, it, expect } from 'vitest'
import { parseEditedDefects } from './edited-defects'

describe('parseEditedDefects', () => {
  it('keeps name, cups and intensity in the shape the certificate prints', () => {
    const out = parseEditedDefects({
      taints: [{ name: ' Hard (riado) ', cups_affected: 1, intensity: 2 }],
      faults: [],
    })
    expect(out).toEqual({
      ok: true,
      value: { taints: [{ name: 'Hard (riado)', cups_affected: 1, intensity: 2 }], faults: [] },
    })
  })

  it('reads a missing cups or intensity as not recorded', () => {
    const out = parseEditedDefects({ taints: [], faults: [{ name: 'Phenol (rio)' }] })
    expect(out).toEqual({
      ok: true,
      value: { taints: [], faults: [{ name: 'Phenol (rio)', cups_affected: null, intensity: null }] },
    })
  })

  it('drops rows left without a name', () => {
    const out = parseEditedDefects({ taints: [{ name: '  ', cups_affected: 2 }], faults: [] })
    expect(out).toEqual({ ok: true, value: { taints: [], faults: [] } })
  })

  it('an empty list is a valid answer: the lot has no taints', () => {
    expect(parseEditedDefects({ taints: [], faults: [] })).toEqual({ ok: true, value: { taints: [], faults: [] } })
  })

  it('refuses a body that is not a taint/fault list', () => {
    expect(parseEditedDefects(null).ok).toBe(false)
    expect(parseEditedDefects([]).ok).toBe(false)
    expect(parseEditedDefects({ taints: 'Rioy' }).ok).toBe(false)
  })

  it('refuses cups that are not a whole number of cups', () => {
    const out = parseEditedDefects({ taints: [{ name: 'Rioy', cups_affected: 1.5 }], faults: [] })
    expect(out).toEqual({ ok: false, error: 'Rioy: cups must be a whole number' })
  })

  it('refuses a negative intensity', () => {
    const out = parseEditedDefects({ taints: [{ name: 'Rioy', intensity: -1 }], faults: [] })
    expect(out).toEqual({ ok: false, error: 'Rioy: intensity cannot be negative' })
  })

  it('refuses the same taint listed twice, which the certificate would print once', () => {
    const out = parseEditedDefects({ taints: [{ name: 'Rioy' }, { name: 'rioy ' }], faults: [] })
    expect(out).toEqual({ ok: false, error: 'Rioy is listed twice under taints' })
  })
})
