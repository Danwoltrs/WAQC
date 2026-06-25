import { describe, it, expect } from 'vitest'
import { sortDefectsForDisplay } from './shared'

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
