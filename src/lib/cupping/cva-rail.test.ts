// src/lib/cupping/cva-rail.test.ts
import { describe, it, expect } from 'vitest'
import { cvaAttributeRail } from './cva-rail'

describe('cvaAttributeRail', () => {
  it('renders one rail entry per scored section, on the 1-9 impression scale', () => {
    const rail = cvaAttributeRail({ sections: { fragrance: { impression: 7 } } })
    expect(rail).toEqual([
      { name: 'Fragrance', score: 7, allowedMin: null, allowedMax: null, scaleMin: 1, scaleMax: 9 },
    ])
  })

  it('prefers the cooled-final impression, which is what actually scores', () => {
    const rail = cvaAttributeRail({ sections: { flavor: { impression: 6, impression_final: 8 } } })
    expect(rail[0]).toMatchObject({ name: 'Flavor', score: 8 })
  })

  it('keeps sections in SCA tasting order, not object order', () => {
    const rail = cvaAttributeRail({
      sections: { overall: { impression: 8 }, fragrance: { impression: 7 } },
    })
    expect(rail.map(a => a.name)).toEqual(['Fragrance', 'Overall'])
  })

  it('omits sections the cupper never scored rather than showing them as zero', () => {
    const rail = cvaAttributeRail({ sections: { acidity: { impression: 6 }, aroma: {} } })
    expect(rail.map(a => a.name)).toEqual(['Acidity'])
  })

  it('returns nothing for an assessment with no sections at all', () => {
    expect(cvaAttributeRail({ sections: {} })).toEqual([])
  })
})
