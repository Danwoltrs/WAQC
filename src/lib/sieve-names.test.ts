import { describe, expect, it } from 'vitest'
import { rekeyToSpec, screenName, sieveKey, sievePercent } from './sieve-names'
import { validateScreenSizeDistribution } from '@/types/screen-size-constraints'
import { checkScreenSpec } from '@/components/pdf/certificate/certificate-screen-defects'

describe('sieveKey', () => {
  it.each([
    ['Screen 18', '18'],
    ['18', '18'],
    ['screen_18', '18'],
    ['  SCREEN  18 ', '18'],
    ['Pan', 'pan'],
    ['Peas 10', 'peas 10'],
  ])('%s → %s', (name, key) => expect(sieveKey(name)).toBe(key))

  it('keeps Peas 10 apart from Screen 10', () => {
    expect(sieveKey('Peas 10')).not.toBe(sieveKey('Screen 10'))
  })
})

describe('sievePercent', () => {
  it('finds a spec "Screen 18" under a grading "18"', () => {
    expect(sievePercent({ '17': 71, '18': 25, Pan: 4 }, 'Screen 18')).toBe(25)
  })

  it('reads 0 for a sieve the grading never recorded', () => {
    expect(sievePercent({ '17': 100 }, 'Screen 19')).toBe(0)
  })
})

describe('screenName', () => {
  it('prefixes a bare number once', () => {
    expect(screenName('16')).toBe('Screen 16')
    expect(screenName('Screen 16')).toBe('Screen 16')
  })
})

describe('rekeyToSpec', () => {
  it("renames grading keys to the spec's spelling, keeping unmatched ones", () => {
    expect(rekeyToSpec({ '18': 25, '17': 71, Pan: 4, '16': 1 }, ['Screen 18', 'Screen 17', 'Pan']))
      .toEqual({ 'Screen 18': 25, 'Screen 17': 71, Pan: 4, '16': 1 })
  })

  it('adds up a sieve saved under both spellings', () => {
    expect(rekeyToSpec({ '18': 10, 'Screen 18': 15 }, ['Screen 18'])).toEqual({ 'Screen 18': 25 })
  })
})

describe('grading page screen compliance', () => {
  it('flags a "Screen 18" minimum against a distribution keyed "18"', () => {
    const r = validateScreenSizeDistribution(
      { '17': 71, '18': 25, Pan: 4 },
      { constraints: [{ screen_size: 'Screen 18', constraint_type: 'minimum', min_value: 30 }] },
    )
    expect(r.violations).toEqual([expect.objectContaining({ screen_size: 'Screen 18', actual: 25 })])
  })
})

describe('certificate out-of-spec marker', () => {
  it('marks a sieve printed as "18" against a "Screen 18" constraint', () => {
    expect(
      checkScreenSpec('18', 25, [{ screen_size: 'Screen 18', constraint_type: 'minimum', min_value: 30 }]),
    ).toEqual({ outOfSpec: true, note: '(min 30%)' })
  })
})
