import { describe, it, expect } from 'vitest'
import { hasClientCopies, templateClientsForDisplay, templateQualitiesUrl } from './template-clients'

describe('templateQualitiesUrl', () => {
  it("asks for the template's own laboratory's client qualities", () => {
    expect(templateQualitiesUrl({ id: 'tpl-1', laboratory_id: 'lab co' }))
      .toBe('/api/client-qualities?template_id=tpl-1&is_active=true&laboratory_id=lab+co')
  })

  it('leaves a template with no laboratory to the server default', () => {
    expect(templateQualitiesUrl({ id: 'tpl-1', laboratory_id: null }))
      .toBe('/api/client-qualities?template_id=tpl-1&is_active=true')
  })
})

describe('templateClientsForDisplay', () => {
  it('lists each client once, by its fantasy name, and marks copy-only clients', () => {
    expect(templateClientsForDisplay([
      { id: 'co-a', name: 'Ahold Delhaize USA', fantasy_name: 'Ahold', copy: false },
      { id: 'co-b', name: 'Blaser Trading AG', fantasy_name: null, copy: true },
      { id: 'co-a', name: 'Ahold Delhaize USA', fantasy_name: 'Ahold', copy: true },
      { id: 'co-b', name: 'Blaser Trading AG', fantasy_name: null, copy: true },
    ])).toEqual([
      { id: 'co-a', label: 'Ahold', copy: false },
      { id: 'co-b', label: 'Blaser Trading AG', copy: true },
    ])
  })

  it('reads an empty answer as no clients', () => {
    expect(templateClientsForDisplay(undefined)).toEqual([])
  })
})

describe('hasClientCopies', () => {
  it('is true when a client uses a private copy made from the template', () => {
    expect(hasClientCopies([{ id: 'c1', name: 'A', copy: false }, { id: 'c2', name: 'B', copy: true }])).toBe(true)
  })
  it('is false with direct users only, none, or a bad payload', () => {
    expect(hasClientCopies([{ id: 'c1', name: 'A', copy: false }])).toBe(false)
    expect(hasClientCopies([])).toBe(false)
    expect(hasClientCopies(undefined)).toBe(false)
    expect(hasClientCopies('x' as any)).toBe(false)
  })
})
