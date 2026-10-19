/**
 * Query helpers for GET /api/certificates. Every filter, the sort and the paging
 * run in the query itself (not in the browser after a 100-row window), so a
 * filtered or sorted list is complete and its pages are stable. The select must
 * alias the embed `sample:samples(...)` for the `sample.` paths below.
 */
import { santosDayRangeUtc } from '@/lib/tin-label-batch'

export const CERTIFICATE_PAGE_SIZE = 100
export const MAX_CERTIFICATE_IDS = 300

export type CertificateSortField = 'certificate_number' | 'created_at' | 'issued_to' | 'origin' | 'status'
export type CertificateStatus = 'issued' | 'draft' | 'revoked'

export interface CertificateListParams {
  search: string
  status: CertificateStatus | null
  clientId: string | null
  qualityId: string | null
  dateFrom: string | null // YYYY-MM-DD, a Santos day
  dateTo: string | null
  sortBy: CertificateSortField
  ascending: boolean
  limit: number // 1..300
  offset: number // >= 0
  ids: string[] // non-empty = ids mode, at most 300
}

const SORT_FIELDS: readonly CertificateSortField[] = ['certificate_number', 'created_at', 'issued_to', 'origin', 'status']
const STATUSES: readonly CertificateStatus[] = ['issued', 'draft', 'revoked']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const nonEmpty = (v: string | null): string | null => (v && v.trim() ? v : null)
// Shape alone is not enough: 2026-02-31 rolls over to March in Date, and 2026-13-45
// is Invalid Date (toISOString would throw), so the parsed day must round-trip.
const dateOrNull = (v: string | null): string | null => {
  if (!v || !DATE_RE.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

export function parseCertificateListParams(sp: URLSearchParams): CertificateListParams {
  const sortBy = sp.get('sort_by') as CertificateSortField
  const status = sp.get('status') as CertificateStatus
  const limitRaw = parseInt(sp.get('limit') ?? '', 10)
  const offsetRaw = parseInt(sp.get('offset') ?? '', 10)
  return {
    search: sp.get('search') ?? '',
    status: STATUSES.includes(status) ? status : null,
    clientId: nonEmpty(sp.get('client_id')),
    qualityId: nonEmpty(sp.get('quality_id')),
    dateFrom: dateOrNull(sp.get('date_from')),
    dateTo: dateOrNull(sp.get('date_to')),
    sortBy: SORT_FIELDS.includes(sortBy) ? sortBy : 'created_at',
    ascending: sp.get('sort_order') === 'asc',
    limit: Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, 300) : CERTIFICATE_PAGE_SIZE,
    offset: Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0,
    ids: (sp.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_CERTIFICATE_IDS),
  }
}

/**
 * Whole Santos days as UTC instants: `gte` starts the `dateFrom` day, `lt` is
 * the end of the `dateTo` day. Noon UTC is safely inside the same Santos day.
 */
export function santosDateBoundsUtc(
  dateFrom: string | null,
  dateTo: string | null,
): { gte: string | null; lt: string | null } {
  const day = (d: string) => santosDayRangeUtc(new Date(`${d}T12:00:00Z`))
  return {
    gte: dateFrom ? day(dateFrom).startUtc.toISOString() : null,
    lt: dateTo ? day(dateTo).endUtc.toISOString() : null,
  }
}

interface ListBuilder {
  is(column: string, value: null): unknown
  in(column: string, values: string[]): unknown
  eq(column: string, value: string): unknown
  not(column: string, operator: string, value: null): unknown
  or(filters: string): unknown
  gte(column: string, value: string): unknown
  lt(column: string, value: string): unknown
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): unknown
  range(from: number, to: number): unknown
}

/**
 * Select for a count-only (`head`) query through the list's filters: the
 * `sample.` filter paths need the `sample` embed, even when no row is returned.
 */
export const CERTIFICATE_COUNT_SELECT = 'id, sample:samples(id, deleted_at, client_id, quality_spec_id)'

// Keep a certificate without a sample; drop one whose sample was deleted.
const LIVE_SAMPLE_OR = 'sample.not.is.null,sample_id.is.null'

/**
 * Apply the list's filters only: no sort, no window (a count query uses this
 * alone). Generic over the builder: it only chains methods and returns what it
 * is given, so the caller keeps its own type.
 */
export function applyCertificateListFilters<Q>(query: Q, p: CertificateListParams, searchOr: string | null): Q {
  // Builder methods return the builder; the cast keeps the caller's own type.
  let q = query as unknown as ListBuilder
  const step = (next: unknown) => { q = next as ListBuilder }

  // A deleted sample's embed comes back null, which drops its certificate below.
  step(q.is('sample.deleted_at', null))

  if (p.ids.length > 0) {
    // A restored print list never brings back a deleted lot's certificate.
    step(q.in('id', p.ids))
    step(q.or(LIVE_SAMPLE_OR))
    return q as unknown as Q
  }

  if (p.clientId) step(q.eq('sample.client_id', p.clientId))
  if (p.qualityId) step(q.eq('sample.quality_spec_id', p.qualityId))
  if (p.clientId || p.qualityId) {
    step(q.not('sample', 'is', null))
  } else {
    step(q.or(LIVE_SAMPLE_OR))
  }

  if (p.status) step(q.eq('status', p.status))
  const { gte, lt } = santosDateBoundsUtc(p.dateFrom, p.dateTo)
  if (gte) step(q.gte('created_at', gte))
  if (lt) step(q.lt('created_at', lt))
  // A second .or() param: PostgREST ANDs it with the one above.
  if (searchOr) step(q.or(searchOr))
  return q as unknown as Q
}

/**
 * Apply the list's filters, sort and window. Generic over the builder, like
 * applyCertificateListFilters. Ids mode has no sort and no window.
 */
export function applyCertificateListQuery<Q>(query: Q, p: CertificateListParams, searchOr: string | null): Q {
  let q = applyCertificateListFilters(query, p, searchOr) as unknown as ListBuilder
  if (p.ids.length > 0) return q as unknown as Q
  const step = (next: unknown) => { q = next as ListBuilder }

  if (p.sortBy === 'origin') {
    step(q.order('sample(origin)', { ascending: p.ascending, nullsFirst: false }))
  } else {
    step(q.order(p.sortBy, { ascending: p.ascending }))
  }
  // Tie-break so equal sort values do not shuffle between pages.
  step(q.order('id', { ascending: false }))
  step(q.range(p.offset, p.offset + p.limit - 1))
  return q as unknown as Q
}

/** `/api/certificates` plus only non-default params; `search` first. */
export function certificateListUrl(p: Partial<CertificateListParams>): string {
  const sp = new URLSearchParams()
  if (p.search) sp.set('search', p.search)
  if (p.status) sp.set('status', p.status)
  if (p.clientId) sp.set('client_id', p.clientId)
  if (p.qualityId) sp.set('quality_id', p.qualityId)
  if (p.dateFrom) sp.set('date_from', p.dateFrom)
  if (p.dateTo) sp.set('date_to', p.dateTo)
  if (p.sortBy && p.sortBy !== 'created_at') sp.set('sort_by', p.sortBy)
  if (p.ascending) sp.set('sort_order', 'asc')
  if (p.limit != null && p.limit !== CERTIFICATE_PAGE_SIZE) sp.set('limit', String(p.limit))
  if (p.offset) sp.set('offset', String(p.offset))
  if (p.ids && p.ids.length > 0) sp.set('ids', p.ids.join(','))
  const qs = sp.toString()
  return qs ? `/api/certificates?${qs}` : '/api/certificates'
}

export interface FilterOptionRow {
  client_id: string
  client_name: string
  quality_id: string | null
  quality_name: string | null
}

export interface FilterOptions {
  clients: { id: string; name: string }[]
  qualities: { id: string; name: string; client_id: string }[]
}

const byName = <T extends { name: string }>(list: T[]): T[] => list.sort((a, b) => a.name.localeCompare(b.name))
const qualityKey = (q: { id: string; client_id: string }) => `${q.id}|${q.client_id}`

export function foldFilterOptions(rows: FilterOptionRow[]): FilterOptions {
  const clients = new Map<string, { id: string; name: string }>()
  const qualities = new Map<string, { id: string; name: string; client_id: string }>()
  for (const r of rows) {
    if (!clients.has(r.client_id)) clients.set(r.client_id, { id: r.client_id, name: r.client_name })
    if (r.quality_id && r.quality_name != null) {
      const q = { id: r.quality_id, name: r.quality_name, client_id: r.client_id }
      if (!qualities.has(qualityKey(q))) qualities.set(qualityKey(q), q)
    }
  }
  return {
    clients: byName([...clients.values()]),
    qualities: byName([...qualities.values()]),
  }
}

/** The part of a list row the filter options are read from. */
export interface FilterOptionCertificate {
  sample?: {
    client_id?: string | null
    client?: { id: string; name?: string | null; company?: string | null; fantasy_name?: string | null } | null
    quality_spec?: { id: string; custom_name?: string | null; template?: { name?: string | null } | null } | null
  } | null
}

/**
 * The clients and qualities that list rows carry, named the way the list
 * named them before the filter-options lookup: the client by its trade name,
 * the quality by its own name, else its template's. The page's fallback while
 * that lookup fails (it does until migration 20261019000000 is applied).
 */
export function filterOptionRowsFromCertificates(certs: FilterOptionCertificate[]): FilterOptionRow[] {
  const out: FilterOptionRow[] = []
  for (const cert of certs) {
    const sample = cert.sample
    const client = sample?.client
    if (!sample || !client?.id) continue
    const quality = sample.client_id ? sample.quality_spec : null
    out.push({
      client_id: client.id,
      client_name: client.fantasy_name || client.company || client.name || '',
      quality_id: quality?.id ?? null,
      quality_name: quality ? quality.custom_name || quality.template?.name || 'Unknown' : null,
    })
  }
  return out
}

/**
 * `prev` plus whatever `rows` add, sorted. Nothing already offered is taken
 * away, so a load narrowed by a filter or a search never empties a dropdown.
 */
export function mergeFilterOptions(prev: FilterOptions, rows: FilterOptionRow[]): FilterOptions {
  const next = foldFilterOptions(rows)
  const clients = new Map(prev.clients.map((c) => [c.id, c]))
  for (const c of next.clients) if (!clients.has(c.id)) clients.set(c.id, c)
  const qualities = new Map(prev.qualities.map((q) => [qualityKey(q), q]))
  for (const q of next.qualities) if (!qualities.has(qualityKey(q))) qualities.set(qualityKey(q), q)
  return {
    clients: byName([...clients.values()]),
    qualities: byName([...qualities.values()]),
  }
}
