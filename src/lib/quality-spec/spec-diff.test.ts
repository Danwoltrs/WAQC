import { describe, expect, it } from 'vitest'
import { diffSpecParameters, formatSpecDate, isCalendarDate, removedCuppingAttributes, scrubSan, sectionOfKey, stripEditorIds } from './spec-diff'

describe('diffSpecParameters', () => {
  it('reports a changed scalar under its section title', () => {
    expect(diffSpecParameters({ max_quakers: 8 }, { max_quakers: 5 })).toEqual([
      { section: 'Moisture, density & quakers', path: 'max_quakers', before: '8', after: '5' },
    ])
  })

  it('a key added under taint_fault_configuration has before (none)', () => {
    const changes = diffSpecParameters(
      { taint_fault_configuration: { max_taints: 0 } },
      { taint_fault_configuration: { max_taints: 0, max_faults: 1 } },
    )
    expect(changes).toEqual([
      { section: 'Taints & faults', path: 'taint_fault_configuration.max_faults', before: '(none)', after: '1' },
    ])
  })

  it('a removed key has after (none)', () => {
    expect(diffSpecParameters({ moisture_max: 12.5 }, {})).toEqual([
      { section: 'Moisture, density & quakers', path: 'moisture_max', before: '12.5', after: '(none)' },
    ])
  })

  it('identical inputs give no changes, whatever the key order', () => {
    const a = { defect_configuration: { max_primary: 2, max_secondary: 10 }, max_quakers: 3 }
    const b = { max_quakers: 3, defect_configuration: { max_secondary: 10, max_primary: 2 } }
    expect(diffSpecParameters(a, b)).toEqual([])
    expect(diffSpecParameters({}, {})).toEqual([])
  })

  it('section labels come from the top-level key; unknown keys are Other', () => {
    expect(sectionOfKey('screen_size_requirements')).toBe('Screen sizes')
    expect(sectionOfKey('green_aspect_configuration')).toBe('Green aspect')
    expect(sectionOfKey('roast_aspect_configuration')).toBe('Roast aspect')
    expect(sectionOfKey('defect_configuration')).toBe('Defects')
    expect(sectionOfKey('moisture_min')).toBe('Moisture, density & quakers')
    expect(sectionOfKey('density_max')).toBe('Moisture, density & quakers')
    expect(sectionOfKey('cupping_attributes')).toBe('Cupping attributes')
    expect(sectionOfKey('taint_fault_configuration')).toBe('Taints & faults')
    expect(sectionOfKey('cup_status_rules')).toBe('Clean / uniform cups')
    expect(sectionOfKey('something_new')).toBe('Other')
    expect(diffSpecParameters({}, { something_new: true })[0]).toMatchObject({ section: 'Other', before: '(none)', after: 'true' })
  })

  it('matches cupping attributes by id and names the path by the attribute', () => {
    const before = { cupping_attributes: [{ id: 'a1', attribute: 'Body', min_value: 6 }, { id: 'a2', attribute: 'Acidity', min_value: 6 }] }
    const after = { cupping_attributes: [{ id: 'a2', attribute: 'Acidity', min_value: 6 }, { id: 'a1', attribute: 'Body', min_value: 7 }] }
    expect(diffSpecParameters(before, after)).toEqual([
      { section: 'Cupping attributes', path: 'cupping_attributes[Body].min_value', before: '6', after: '7' },
    ])
  })

  it('a moisture-only change gives one line, though the editor added attr_N ids the stored spec never had', () => {
    const before = { moisture_max: 12.5, cupping_attributes: [{ attribute: 'Body', min_value: 6 }, { attribute: 'Acidity', min_value: 6 }] }
    const after = {
      moisture_max: 12,
      cupping_attributes: [{ attribute: 'Body', min_value: 6, id: 'attr_0' }, { attribute: 'Acidity', min_value: 6, id: 'attr_1' }],
    }
    expect(diffSpecParameters(before, after)).toEqual([
      { section: 'Moisture, density & quakers', path: 'moisture_max', before: '12.5', after: '12' },
    ])
  })

  it('cupping attributes match by name before id', () => {
    // A real (editor-made) id on one side only: still the same attribute.
    const before = { cupping_attributes: [{ attribute: 'Body', min_value: 6 }] }
    const after = { cupping_attributes: [{ id: '7f0c-uuid', attribute: 'Body', min_value: 7 }] }
    expect(diffSpecParameters(before, after).map((c) => c.path)).toEqual([
      'cupping_attributes[Body].id',
      'cupping_attributes[Body].min_value',
    ])
  })

  it('stripEditorIds drops only attr_N ids', () => {
    const p = { max_quakers: 3, cupping_attributes: [{ id: 'attr_0', attribute: 'Body' }, { id: 'u-1', attribute: 'Acidity' }, { id: 'attr_x', attribute: 'Sweetness' }] }
    expect(stripEditorIds(p)).toEqual({
      max_quakers: 3,
      cupping_attributes: [{ attribute: 'Body' }, { id: 'u-1', attribute: 'Acidity' }, { id: 'attr_x', attribute: 'Sweetness' }],
    })
    expect(stripEditorIds({ max_quakers: 3 })).toEqual({ max_quakers: 3 })
  })

  it('scrubs a SAN number before truncating, so a cut one never survives', () => {
    // The SAN number straddles the 200-character cut.
    const value = `${'x'.repeat(193)} SAN-01234/26 tail`
    const [change] = diffSpecParameters({ green_aspect_configuration: {} }, { green_aspect_configuration: { note: value } })
    expect(change.after).not.toMatch(/SAN/i)
    expect(change.after).not.toMatch(/01234/)
    const [bare] = diffSpecParameters({}, { origin: 'see SAN-01234 and r-san-00654/26' })
    expect(bare.after).not.toMatch(/SAN/i)
    expect(bare.after).not.toMatch(/01234|00654/)
  })

  it('leaves certificate numbers alone', () => {
    const [change] = diffSpecParameters({}, { origin: 'SAG-011895/26 and R-SAG-011793/26' })
    expect(change.after).toBe('SAG-011895/26 and R-SAG-011793/26')
    expect(scrubSan('Cert SAG-011895/26, lab SAN-00654/26')).toBe('Cert SAG-011895/26, lab')
    expect(scrubSan('artisan-roasted')).toBe('artisan-roasted')
  })

  it('renders objects as compact JSON and truncates long values to 200 characters', () => {
    const long = 'x'.repeat(500)
    const [change] = diffSpecParameters({ green_aspect_configuration: {} }, { green_aspect_configuration: { note: long } })
    expect(change.path).toBe('green_aspect_configuration.note')
    expect(change.after.length).toBe(200)
    expect(change.after.endsWith('…')).toBe(true)
    // A whole section added from nothing is one compact JSON value.
    const [section] = diffSpecParameters({}, { green_aspect_configuration: { note: long } })
    expect(section).toMatchObject({ path: 'green_aspect_configuration', before: '(none)' })
    expect(section.after.startsWith('{"note":"xxx')).toBe(true)
    expect(section.after.length).toBe(200)
    const [added] = diffSpecParameters({ cupping_attributes: [] }, { cupping_attributes: [{ attribute: 'Body', min_value: 6 }] })
    expect(added).toMatchObject({ path: 'cupping_attributes[Body]', before: '(none)', after: '{"attribute":"Body","min_value":6}' })
  })
})

describe('removedCuppingAttributes', () => {
  it('renaming Body to Mouthfeel reports Body as removed', () => {
    const before = { cupping_attributes: [{ id: 'a1', attribute: 'Body' }, { id: 'a2', attribute: 'Acidity' }] }
    const after = { cupping_attributes: [{ id: 'a1', attribute: 'Mouthfeel' }, { id: 'a2', attribute: 'Acidity' }] }
    expect(removedCuppingAttributes(before, after)).toEqual(['Body'])
  })
  it('nothing removed when the names stay', () => {
    expect(removedCuppingAttributes({ cupping_attributes: [{ attribute: 'Body' }] }, { cupping_attributes: [{ attribute: 'Body' }] })).toEqual([])
    expect(removedCuppingAttributes({}, {})).toEqual([])
  })
})

describe('dates', () => {
  it('formats a calendar date as d MMMM yyyy without a timezone shift', () => {
    expect(formatSpecDate('2026-12-01')).toBe('1 December 2026')
    expect(formatSpecDate('2027-01-31')).toBe('31 January 2027')
  })
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isCalendarDate('2026-12-01')).toBe(true)
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-1-1')).toBe(false)
    expect(isCalendarDate('now')).toBe(false)
    expect(isCalendarDate(20261201)).toBe(false)
  })
})
