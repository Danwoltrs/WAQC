import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { filtersFromSearch, searchWithFilters, usePortalFilters } from './use-portal-filters'

const replace = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/portal',
  useSearchParams: () => new URLSearchParams(search),
}))

describe('usePortalFilters', () => {
  beforeEach(() => { replace.mockClear(); search = 'company=c1&period=crop-2025&origin=Brazil' })
  const urlOf = () => new URL(replace.mock.calls[0][0], 'http://x')

  it('reads the filters and builds the query', () => {
    const { result } = renderHook(() => usePortalFilters())
    expect(result.current.filters).toEqual({ origin: 'Brazil' })
    expect(result.current.query).toBe('origin=Brazil')
  })
  it('toggling the active value removes it and keeps company and period', () => {
    const { result } = renderHook(() => usePortalFilters())
    result.current.toggle('origin', 'Brazil')
    const u = urlOf()
    expect(u.pathname).toBe('/portal')
    expect(Object.fromEntries(u.searchParams)).toEqual({ company: 'c1', period: 'crop-2025' })
  })
  it('toggling another step adds it', () => {
    const { result } = renderHook(() => usePortalFilters())
    result.current.toggle('seller', 'OFI')
    expect(Object.fromEntries(urlOf().searchParams)).toEqual({ company: 'c1', period: 'crop-2025', origin: 'Brazil', seller: 'OFI' })
  })
  it('clear keeps company and period only', () => {
    const { result } = renderHook(() => usePortalFilters())
    result.current.clear()
    expect(Object.fromEntries(urlOf().searchParams)).toEqual({ company: 'c1', period: 'crop-2025' })
  })
})

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
