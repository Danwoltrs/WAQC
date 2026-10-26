import { describe, expect, it } from 'vitest'
import { filtersFromSearch, searchWithFilters } from './use-portal-filters'

describe('filtersFromSearch', () => {
  it('keeps only the flow steps', () => {
    expect(filtersFromSearch(new URLSearchParams('origin=Brazil&seller=OFI&company=x&bogus=1'))).toEqual({ origin: 'Brazil', seller: 'OFI' })
  })
  it('ignores empty values', () => {
    expect(filtersFromSearch(new URLSearchParams('origin=&lab=Santos lab'))).toEqual({ lab: 'Santos lab' })
  })
})

describe('searchWithFilters', () => {
  it('replaces the flow params and keeps company and period', () => {
    const next = searchWithFilters(new URLSearchParams('company=c1&period=2026&origin=Brazil'), { seller: 'OFI' })
    expect(Object.fromEntries(next)).toEqual({ company: 'c1', period: '2026', seller: 'OFI' })
  })
})
