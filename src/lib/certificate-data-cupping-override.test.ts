import { describe, expect, it } from 'vitest'
import { applyCuppingScoreOverride, type CuppingData } from './certificate-data'

function baseData(): CuppingData {
  return {
    attributes: [
      { name: 'Body', score: 6, allowedMin: null, allowedMax: null },
      { name: 'Flavor', score: 6, allowedMin: null, allowedMax: null },
      { name: 'Overall', score: 6, allowedMin: null, allowedMax: null },
    ],
    overallScore: 6,
    comments: null,
    isSpecialty: false,
    taints: null,
    faults: null,
    taintDetails: [],
    faultDetails: [],
    cleanCup: true,
    uniformCup: true,
    flavorDescriptor: null,
  }
}

describe('applyCuppingScoreOverride', () => {
  it('replaces matching attribute scores with the override value', () => {
    const out = applyCuppingScoreOverride(baseData(), { Body: 8, Flavor: 7.5 })
    expect(out.attributes.find((a) => a.name === 'Body')?.score).toBe(8)
    expect(out.attributes.find((a) => a.name === 'Flavor')?.score).toBe(7.5)
  })

  it('leaves attributes without an override entry untouched', () => {
    const out = applyCuppingScoreOverride(baseData(), { Body: 8 })
    expect(out.attributes.find((a) => a.name === 'Flavor')?.score).toBe(6)
  })

  it('maps an Overall override to the headline overallScore', () => {
    const out = applyCuppingScoreOverride(baseData(), { Overall: 9 })
    expect(out.overallScore).toBe(9)
    expect(out.attributes.find((a) => a.name === 'Overall')?.score).toBe(9)
  })

  it('ignores non-numeric override values (e.g. flavor descriptor text)', () => {
    const out = applyCuppingScoreOverride(baseData(), { Body: 'Strictly Soft' as unknown as number })
    expect(out.attributes.find((a) => a.name === 'Body')?.score).toBe(6)
  })

  it('is a no-op for null/empty overrides', () => {
    const d = baseData()
    expect(applyCuppingScoreOverride(d, null)).toBe(d)
    expect(applyCuppingScoreOverride(d, undefined)).toBe(d)
    const empty = applyCuppingScoreOverride(d, {})
    expect(empty.attributes.map((a) => a.score)).toEqual([6, 6, 6])
    expect(empty.overallScore).toBe(6)
  })

  it('does not mutate the input', () => {
    const d = baseData()
    applyCuppingScoreOverride(d, { Body: 8, Overall: 9 })
    expect(d.attributes.find((a) => a.name === 'Body')?.score).toBe(6)
    expect(d.overallScore).toBe(6)
  })
})
