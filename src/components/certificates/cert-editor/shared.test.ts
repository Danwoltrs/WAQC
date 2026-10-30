import { describe, it, expect } from 'vitest'
import {
  cupDefectLine,
  cupDefectNames,
  sampleHeadline,
  seedCupDefects,
  sortDefectsForDisplay,
  taintLimitWarning,
} from './shared'

describe('sortDefectsForDisplay', () => {
  it('orders primary defects before secondary', () => {
    const out = sortDefectsForDisplay([
      { name: 'Broken', count: 1 },     // secondary
      { name: 'Full Black', count: 1 }, // primary
    ])
    expect(out.map((d) => d.name)).toEqual(['Full Black', 'Broken'])
  })

  it('orders by count descending within a group', () => {
    const out = sortDefectsForDisplay([
      { name: 'Broken', count: 2 },
      { name: 'Bad Formed', count: 9 },
      { name: 'Minor Broca', count: 5 },
    ])
    expect(out.map((d) => d.name)).toEqual(['Bad Formed', 'Minor Broca', 'Broken'])
  })

  it('keeps primary before secondary even when a secondary has a higher count', () => {
    const out = sortDefectsForDisplay([
      { name: 'Broken', count: 50 },   // secondary, high count
      { name: 'Full Sour', count: 1 }, // primary, low count
    ])
    expect(out.map((d) => d.name)).toEqual(['Full Sour', 'Broken'])
  })

  it('does not mutate the input array', () => {
    const input = [{ name: 'Broken', count: 1 }, { name: 'Full Black', count: 1 }]
    const snapshot = JSON.parse(JSON.stringify(input))
    sortDefectsForDisplay(input)
    expect(input).toEqual(snapshot)
  })

  it('returns empty for empty input', () => {
    expect(sortDefectsForDisplay([])).toEqual([])
  })
})

describe('sampleHeadline', () => {
  it('titles a shipment sample by its ICO, certified or not', () => {
    expect(sampleHeadline({ sample_type: 'ss', ico_number: '002/4600/3508' }))
      .toEqual({ tag: 'ICO', value: '002/4600/3508' })
    expect(sampleHeadline({ sample_type: 'ss', ico_number: '002/4600/3508', certificate_id: 'c', certificate_number: 'BR-1/26' }))
      .toEqual({ tag: 'ICO', value: '002/4600/3508' })
  })
  it('titles anything else by its certificate number once issued', () => {
    expect(sampleHeadline({ sample_type: 'pss', exporter_sample_number: '143/26', certificate_id: 'c', certificate_number: 'BR-037415/26' }))
      .toEqual({ tag: null, value: 'BR-037415/26' })
  })
  it('titles an uncertified contract by its own sample number', () => {
    expect(sampleHeadline({ sample_type: 'pss', exporter_sample_number: '144/26' }))
      .toEqual({ tag: 'SMP', value: '144/26' })
  })
  it('never titles a sample by its SAN lab number', () => {
    const sample = { sample_type: 'pss', tracking_number: 'SAN-01171/26' }
    expect(sampleHeadline(sample)).toEqual({ tag: null, value: 'Sample' })
  })
})

describe('seedCupDefects', () => {
  const fromCards = {
    taints: [{ name: 'Fermented', intensity: 2 }],
    faults: [],
  }

  it('starts from the list the certificate prints when the lot has one', () => {
    const out = seedCupDefects(
      { taints: [{ name: 'Hard (riado)', intensity: 2, cups_affected: 1 }], faults: [], resolved_at: '2026-10-29T12:00:00Z' },
      fromCards,
    )
    expect(out).toEqual({ taints: [{ name: 'Hard (riado)', intensity: 2, cups: 1 }], faults: [] })
  })

  it('an empty settled list means the validator cleared the cup, not "use the cards"', () => {
    expect(seedCupDefects({ taints: [], faults: [] }, fromCards)).toEqual({ taints: [], faults: [] })
  })

  it('reads the bare names older records stored', () => {
    expect(seedCupDefects({ taints: ['Woody'], faults: [] }, fromCards).taints).toEqual([
      { name: 'Woody', intensity: null, cups: null },
    ])
  })

  it('falls back to the cupping cards when no list was ever settled', () => {
    // Same shape as an edited row, key order included: the save compares JSON,
    // so a panel opened and closed untouched must not count as a taint edit.
    expect(JSON.stringify(seedCupDefects(null, fromCards))).toBe(
      JSON.stringify({ taints: [{ name: 'Fermented', intensity: 2, cups: null }], faults: [] }),
    )
  })
})

describe('taintLimitWarning', () => {
  const one = [{ name: 'Hard (riado)', intensity: 2, cups: 1 }]

  it('is silent inside the limits', () => {
    expect(taintLimitWarning({ max_taints: 1 }, one, [])).toBeNull()
  })

  it('names the limit a late taint breaks', () => {
    expect(taintLimitWarning({ max_taints: 0 }, one, [])).toBe('This quality allows at most 0 taints; this lot now has 1.')
  })

  it('names a broken fault limit', () => {
    expect(taintLimitWarning({ max_faults: 0 }, [], one)).toBe('This quality allows at most 0 faults; this lot now has 1.')
  })

  it('names a broken combined limit', () => {
    expect(taintLimitWarning({ max_combined: 1 }, one, one)).toBe(
      'This quality allows at most 1 taints and faults together; this lot now has 2.',
    )
  })

  it('zero tolerance refuses any taint or fault', () => {
    expect(taintLimitWarning({ zero_tolerance: true }, one, [])).toBe('This quality allows no taints or faults.')
  })

  it('a quality without rules never warns', () => {
    expect(taintLimitWarning(undefined, one, one)).toBeNull()
  })

  it('counts named rows only, as the certificate does', () => {
    expect(taintLimitWarning({ max_taints: 0 }, [{ name: ' ', intensity: null, cups: null }], [])).toBeNull()
  })
})

describe('cupDefectNames', () => {
  it('offers the active taints and faults of the quality, in order', () => {
    const params = {
      taint_fault_configuration: {
        defects: [
          { name: 'Hard (riado)', active: true, display_order: 1 },
          { name: 'Fermented', active: true, display_order: 0 },
          { name: 'Moldy', active: false, display_order: 2 },
        ],
      },
    }
    expect(cupDefectNames(params, null)).toEqual(['Fermented', 'Hard (riado)'])
  })

  it("a client quality's own list wins over its template's", () => {
    const template = { taint_fault_configuration: { defects: [{ name: 'Earthy' }] } }
    const custom = { taint_fault_configuration: { defects: [{ name: 'Phenol (rio)' }] } }
    expect(cupDefectNames(template, custom)).toEqual(['Phenol (rio)'])
  })

  it('reads the older taints/faults lists too', () => {
    const params = { taint_fault_configuration: { taints: [{ name: 'Woody' }], faults: [{ name: 'Moldy' }] } }
    expect(cupDefectNames(params, null)).toEqual(['Woody', 'Moldy'])
  })

  it('no list configured: nothing to suggest, a name can still be typed', () => {
    expect(cupDefectNames(undefined, null)).toEqual([])
  })
})

describe('cupDefectLine', () => {
  it('reads like the certificate line', () => {
    expect(cupDefectLine({ name: 'Hard (riado)', cups: 1, intensity: 2 })).toBe('Hard (riado) · 1 cup · int. 2')
    expect(cupDefectLine({ name: 'Fermented', cups: 3, intensity: null })).toBe('Fermented · 3 cups')
    expect(cupDefectLine({ name: 'Woody', intensity: null })).toBe('Woody')
  })
})
