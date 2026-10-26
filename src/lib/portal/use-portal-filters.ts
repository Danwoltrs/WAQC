'use client'
import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FLOW_STEPS, type FlowStep } from './portal-facts'
import type { FlowFilters } from './overview-model'

/** Flow filters out of a URL: only the five flow steps, empty values dropped. Pure. */
export function filtersFromSearch(params: URLSearchParams): FlowFilters {
  const filters: FlowFilters = {}
  for (const step of FLOW_STEPS) {
    const value = params.get(step)
    if (value) filters[step] = value
  }
  return filters
}

/** The same params with the flow steps replaced by `filters`; company, period and the rest stay. */
export function searchWithFilters(params: URLSearchParams, filters: FlowFilters): URLSearchParams {
  const next = new URLSearchParams(params.toString())
  for (const step of FLOW_STEPS) next.delete(step)
  for (const step of FLOW_STEPS) {
    const value = filters[step]
    if (value) next.set(step, value)
  }
  return next
}

/** Flow-step filters held in the URL, shared by every portal page. */
export function usePortalFilters(): {
  filters: FlowFilters
  toggle(step: FlowStep, value: string): void
  remove(step: FlowStep): void
  clear(): void
  /** 'origin=..&seller=..' for fetches and links. */
  query: string
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

  return { filters, toggle, remove, clear, query }
}
