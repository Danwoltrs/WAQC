import { describe, it, expect } from 'vitest'
import { toContactOptions } from './use-pickable-contacts'
import type { PickableContact } from './pickable'

const c = (over: Partial<PickableContact> = {}): PickableContact => ({
  id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl', isGroup: false, ...over,
})

describe('toContactOptions', () => {
  it('maps id→value and "name — email"→label with email+nickname keywords', () => {
    const { options } = toContactOptions([c()])
    expect(options).toEqual([
      { value: 'c1', label: 'Joost Pollmann — joost@ahold.nl', keywords: ['joost@ahold.nl', 'Joost'] },
    ])
  })

  it('uses the bare email as the label when there is no name', () => {
    const { options } = toContactOptions([c({ id: 'g1', name: '', nickname: null, email: 'qc@ahold.nl', isGroup: true })])
    expect(options[0]).toEqual({ value: 'g1', label: 'qc@ahold.nl', keywords: ['qc@ahold.nl'] })
  })

  it('byId recovers the full contact for a picked value', () => {
    const { byId } = toContactOptions([c()])
    expect(byId['c1'].email).toBe('joost@ahold.nl')
    expect(byId['c1'].nickname).toBe('Joost')
  })
})
