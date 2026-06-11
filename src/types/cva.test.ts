import { describe, it, expect } from 'vitest'
import { createEmptyAssessment, normalizeAssessment, describeIsEmpty, type CvaAssessment } from './cva'

describe('CvaDescribe v2', () => {
  it('empty assessment has picks arrays and five-key notes', () => {
    const a = createEmptyAssessment()
    expect(a.describe.aroma).toEqual({ picks: [], cata: [] })
    expect(a.describe.flavor_aftertaste).toEqual({ picks: [], cata: [], main_tastes: [] })
    expect(a.describe.mouthfeel).toEqual({ cata: [] })
    expect(a.describe.notes).toEqual({})
    expect(a.describe.intensities.fragrance).toBe(0)
  })

  it('normalizeAssessment upgrades a legacy v1 describe blob (no picks, two-key notes)', () => {
    const legacy = createEmptyAssessment() as unknown as Record<string, unknown>
    legacy.describe = {
      intensities: { fragrance: 7, aroma: 0, flavor: 0, aftertaste: 0, acidity: 0, sweetness: 0, mouthfeel: 0 },
      aroma: { cata: ['Floral'] },
      flavor_aftertaste: { cata: [], main_tastes: ['Sweet'] },
      mouthfeel: { cata: ['Oily'] },
      notes: { acidity: 'citric' },
      voice: {},
    }
    const n = normalizeAssessment(legacy as unknown as CvaAssessment)
    expect(n.describe.aroma).toEqual({ picks: [], cata: ['Floral'] })
    expect(n.describe.flavor_aftertaste.picks).toEqual([])
    expect(n.describe.flavor_aftertaste.main_tastes).toEqual(['Sweet'])
    expect(n.describe.notes.acidity).toBe('citric')
    expect(n.describe.intensities.fragrance).toBe(7)
  })

  it('normalizeAssessment tolerates a missing describe entirely', () => {
    const a = createEmptyAssessment() as unknown as Record<string, unknown>
    delete a.describe
    const n = normalizeAssessment(a as unknown as CvaAssessment)
    expect(n.describe.aroma.picks).toEqual([])
    expect(n.describe.intensities).toEqual(createEmptyAssessment().describe.intensities)
    expect(n.describe.mouthfeel).toEqual({ cata: [] })
    expect(n.describe.notes).toEqual({})
  })

  it('describeIsEmpty: true for empty, false with a pick or any intensity', () => {
    const a = createEmptyAssessment()
    expect(describeIsEmpty(a.describe)).toBe(true)
    const withPick = createEmptyAssessment()
    withPick.describe.aroma.picks.push({ path: ['Fruity', 'Berry', 'Blueberry'] })
    expect(describeIsEmpty(withPick.describe)).toBe(false)
    const withIntensity = createEmptyAssessment()
    withIntensity.describe.intensities.acidity = 9
    expect(describeIsEmpty(withIntensity.describe)).toBe(false)
    const withMouthfeel = createEmptyAssessment()
    withMouthfeel.describe.mouthfeel.cata.push('Oily')
    expect(describeIsEmpty(withMouthfeel.describe)).toBe(false)
    const withTaste = createEmptyAssessment()
    withTaste.describe.flavor_aftertaste.main_tastes.push('Sweet')
    expect(describeIsEmpty(withTaste.describe)).toBe(false)
  })
})
