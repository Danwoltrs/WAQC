import { describe, it, expect } from 'vitest'
import { cleanOptionName, isIsoMethod, methodFromSpec, optionLabel, optionsForLot, type MeasurementOption } from './measurement-options'

const opt = (over: Partial<MeasurementOption>): MeasurementOption => ({
  id: over.name ?? 'x', kind: 'humidity_method', name: 'X', is_iso: false, spec_key: null, is_active: true, sort_order: 100, ...over,
})

const list: MeasurementOption[] = [
  opt({ name: 'ISO 6673', is_iso: true, spec_key: 'iso_6673', sort_order: 20 }),
  opt({ name: 'Coffee industry', spec_key: 'coffee_industry', sort_order: 10 }),
  opt({ name: 'Sinar 6070', sort_order: 30 }),
  opt({ name: 'Old meter', is_active: false }),
  opt({ kind: 'density_type', name: 'Free flow' }),
]

describe('measurement options', () => {
  it('lists the active entries of one kind in list order', () => {
    expect(optionsForLot(list, 'humidity_method').map((o) => o.name)).toEqual(['Coffee industry', 'ISO 6673', 'Sinar 6070'])
    expect(optionsForLot(list, 'density_type').map((o) => o.name)).toEqual(['Free flow'])
  })

  it('still offers what is saved on the lot when it is retired or was never listed', () => {
    const retired = optionsForLot(list, 'humidity_method', 'Old meter', true)
    expect(retired.at(-1)).toEqual({ name: 'Old meter', is_iso: true, kind: 'humidity_method', retired: true })
    // A saved name on the list is not repeated, whatever its case.
    expect(optionsForLot(list, 'humidity_method', 'iso 6673')).toHaveLength(3)
  })

  it('says whether a humidity method is ISO, without repeating it in a name that says so', () => {
    expect(optionLabel(list[0])).toBe('ISO 6673')
    expect(optionLabel(list[1])).toBe('Coffee industry (not ISO)')
    expect(optionLabel(opt({ name: 'Oven 105 C', is_iso: true }))).toBe('Oven 105 C (ISO)')
    expect(optionLabel(list[4])).toBe('Free flow')
  })

  it("starts a lot from its quality's standard", () => {
    expect(methodFromSpec(list, { moisture_standard: 'iso_6673' })?.name).toBe('ISO 6673')
    expect(methodFromSpec(list, { moisture_standard: 'something_else' })).toBeNull()
    expect(methodFromSpec(list, null)).toBeNull()
  })

  it('takes ISO from the list, and from the lot for a name off the list', () => {
    expect(isIsoMethod(list, 'ISO 6673')).toBe(true)
    expect(isIsoMethod(list, 'Sinar 6070', true)).toBe(false)
    expect(isIsoMethod(list, 'Gone', true)).toBe(true)
    expect(isIsoMethod(list, null)).toBe(false)
  })

  it('cleans a typed name', () => {
    expect(cleanOptionName('  Sinar   6070 ')).toBe('Sinar 6070')
    expect(cleanOptionName('   ')).toBeNull()
    expect(cleanOptionName('x'.repeat(81))).toBeNull()
    expect(cleanOptionName(5)).toBeNull()
  })
})
