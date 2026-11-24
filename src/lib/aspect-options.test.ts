import { describe, it, expect } from 'vitest'
import { aspectOptions, standardAspectOptions } from './aspect-options'

const spec = {
  green_aspect_configuration: {
    wordings: [
      { id: 'a', label: 'Greenish', value: 6, display_order: 0 },
      { id: 'b', label: 'Green', value: 7, display_order: 1 },
    ],
  },
  roast_aspect_configuration: {
    wordings: [
      { id: 'c', label: 'Good', value: 4, display_order: 0 },
      { id: 'd', label: 'Good to Fine', value: 7, display_order: 1 },
      { id: 'e', label: 'Fine', value: 10, display_order: 2 },
    ],
  },
}

describe('aspectOptions', () => {
  it("lists the quality's own roast levels", () => {
    expect(aspectOptions({ kind: 'roast', parameters: spec }).map((o) => o.label)).toEqual([
      'Good', 'Good to Fine', 'Fine',
    ])
    expect(aspectOptions({ kind: 'green', parameters: spec })).toEqual([
      { label: 'Greenish', value: 6 },
      { label: 'Green', value: 7 },
    ])
  })

  it("keeps the quality's levels when a fallback is allowed (a type sample with a quality)", () => {
    const options = aspectOptions({ kind: 'roast', parameters: spec, fallbackToStandard: true })
    expect(options.map((o) => o.label)).toEqual(['Good', 'Good to Fine', 'Fine'])
  })

  it('falls back to the standard list only when asked and the quality has none', () => {
    expect(aspectOptions({ kind: 'roast', parameters: {} })).toEqual([])
    expect(aspectOptions({ kind: 'roast', parameters: null })).toEqual([])
    expect(aspectOptions({ kind: 'roast', parameters: null, fallbackToStandard: true })).toEqual(
      standardAspectOptions('roast'),
    )
    expect(aspectOptions({ kind: 'green', parameters: { green_aspect_configuration: { wordings: [] } }, fallbackToStandard: true }))
      .toEqual(standardAspectOptions('green'))
  })

  it('keeps a saved value that is on no list, so the field shows what is saved', () => {
    const options = aspectOptions({ kind: 'green', parameters: spec, saved: 'Yellow Green' })
    expect(options.map((o) => o.label)).toEqual(['Greenish', 'Green', 'Yellow Green'])
    expect(options[2].unlisted).toBe(true)
    expect(Number.isNaN(options[2].value)).toBe(true)
  })

  it('does not repeat a saved value that is already listed, whatever its case or spacing', () => {
    expect(aspectOptions({ kind: 'green', parameters: spec, saved: 'Green' })).toHaveLength(2)
    expect(aspectOptions({ kind: 'green', parameters: spec, saved: ' green ' })).toHaveLength(2)
  })

  it('offers nothing extra for an empty saved value', () => {
    expect(aspectOptions({ kind: 'green', parameters: spec, saved: '' })).toHaveLength(2)
    expect(aspectOptions({ kind: 'green', parameters: spec, saved: null })).toHaveLength(2)
    expect(aspectOptions({ kind: 'green', parameters: null, saved: null })).toEqual([])
  })

  it('stays empty when the quality has no levels and no fallback is asked for', () => {
    expect(aspectOptions({ kind: 'green', parameters: null, saved: 'Greenish' })).toEqual([])
  })

  it('reads the older shapes a quality may still carry', () => {
    const legacy = { roast_aspect_configuration: { wordings: ['Fine', { name: 'Good', value: 4 }] } }
    expect(aspectOptions({ kind: 'roast', parameters: legacy })).toEqual([
      { label: 'Fine', value: 0 },
      { label: 'Good', value: 4 },
    ])
  })
})

describe('standardAspectOptions', () => {
  it('holds every value the lab has saved so far', () => {
    const green = standardAspectOptions('green').map((o) => o.label)
    for (const label of ['Brownish', 'Green', 'Greenish', 'Uneven', 'Yellow-Green']) expect(green).toContain(label)
    const roast = standardAspectOptions('roast').map((o) => o.label)
    expect(roast).toEqual(['Uneven', 'Good', 'Good to Fine', 'Fine'])
  })
})
