import { FLOW_STEPS } from './portal-facts'
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
