'use client'
import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FLOW_STEPS, type FlowStep } from './portal-facts'
import { carriedQuery, filtersFromSearch, searchWithFilters } from './portal-filter-params'
import type { FlowFilters } from './overview-model'

export { filtersFromSearch, searchWithFilters }

/** Flow-step filters held in the URL, shared by every portal page. */
export function usePortalFilters(): {
  filters: FlowFilters
  toggle(step: FlowStep, value: string): void
  remove(step: FlowStep): void
  clear(): void
  /** 'origin=..&seller=..' for fetches and links. */
  query: string
  /** 'period=..&origin=..' for links that must keep the period too (tabs, "All certificates"). */
  linkQuery: string
} {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filters = useMemo(() => filtersFromSearch(new URLSearchParams(searchParams.toString())), [searchParams])
  const query = useMemo(() => {
    const out = new URLSearchParams()
    for (const step of FLOW_STEPS) if (filters[step]) out.set(step, filters[step]!)
    return out.toString()
  }, [filters])

  const linkQuery = useMemo(() => carriedQuery(new URLSearchParams(searchParams.toString()), filters), [searchParams, filters])

  const apply = useCallback((next: FlowFilters) => {
    const qs = searchWithFilters(new URLSearchParams(searchParams.toString()), next).toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const toggle = useCallback((step: FlowStep, value: string) => {
    const next = { ...filters }
    if (next[step] === value) delete next[step]
    else next[step] = value
    apply(next)
  }, [filters, apply])
  const remove = useCallback((step: FlowStep) => {
    const next = { ...filters }
    delete next[step]
    apply(next)
  }, [filters, apply])
  const clear = useCallback(() => apply({}), [apply])

  return { filters, toggle, remove, clear, query, linkQuery }
}
