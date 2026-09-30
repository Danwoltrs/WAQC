import { describe, it, expect } from 'vitest'
import { sampleHeadline, sortDefectsForDisplay } from './shared'

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
