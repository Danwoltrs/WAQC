// src/lib/cupping/cva-cupping-data.test.ts
import { describe, it, expect } from 'vitest'
import { buildCvaCuppingData } from './cva-cupping-data'

describe('buildCvaCuppingData', () => {
  it('builds the rail from the assessment and the overall from the persisted score', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: { fragrance: { impression: 7 }, flavor: { impression: 8 } } },
      cvaScore: 86.5,
      cleanCup: true,
      uniformCup: true,
    })
    expect(data.attributes.map((a) => a.name)).toEqual(['Fragrance', 'Flavor'])
    expect(data.overallScore).toBe(86.5)
    expect(data.isSpecialty).toBe(true)
  })

  it('is always marked specialty, regardless of the score achieved', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: {} },
      cvaScore: 62,
      cleanCup: false,
      uniformCup: false,
    })
    expect(data.isSpecialty).toBe(true)
  })

  it('returns an empty rail rather than guessing when no assessment row was found', () => {
    const data = buildCvaCuppingData({
      assessment: null,
      cvaScore: 84.25,
      cleanCup: null,
      uniformCup: null,
    })
    expect(data.attributes).toEqual([])
    // The headline score still prints even though the rail behind it is missing.
    expect(data.overallScore).toBe(84.25)
  })

  it('prints no score rather than a blank or a zero for an override-approved lot', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: { flavor: { impression: 8 } } },
      cvaScore: null,
      cleanCup: true,
      uniformCup: true,
    })
    expect(data.overallScore).toBeNull()
    // The rail itself is unaffected — what was actually assessed still shows.
    expect(data.attributes).toHaveLength(1)
  })

  it('passes clean/uniform cup through verbatim, including the unjudged null state', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: {} },
      cvaScore: null,
      cleanCup: null,
      uniformCup: null,
    })
    expect(data.cleanCup).toBeNull()
    expect(data.uniformCup).toBeNull()
  })

  it('has no taints, faults, comments or flavor descriptor — concepts CVA has no equivalent for', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: { flavor: { impression: 6 } } },
      cvaScore: 80,
      cleanCup: true,
      uniformCup: true,
    })
    expect(data.taints).toBeNull()
    expect(data.faults).toBeNull()
    expect(data.taintDetails).toEqual([])
    expect(data.faultDetails).toEqual([])
    expect(data.comments).toBeNull()
    expect(data.flavorDescriptor).toBeNull()
  })
})
