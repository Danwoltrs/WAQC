/**
 * Performance report data (SS / PSS / SS+PSS).
 *
 * Pulls every certificate (approved + rejected) created in the window for
 * one QC client, for the requested sample-type buckets, and aggregates each
 * bucket into per-importer / per-exporter / per-region performance plus
 * rejection reasons. Reuses the shared row mapper, violation categorizer,
 * and Sankey builder from report-data so the three reports cannot drift.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  mapCertRowToReportRow,
  categorizeViolation,
  buildSankey,
  aggregateDefectBreakdown,
  type RawCertSampleRow,
  type WeeklySSCertRow,
  type RejectionReasonRow,
  type NamedDefectCount,
  type NamedCuppingDefect,
  type SupplierScorecardRow,
  type ClientSankeyType,
} from '@/lib/report-data'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'

export type ReportBucketKey = 'pss' | 'ss'

/** A report row carrying its region (micro_origin) for grouping. */
export type PerformanceRow = WeeklySSCertRow & { region: string | null }

export interface BucketTotals {
  evaluated: number
  approved: number
  rejected: number
  rejectionRate: number // 0-100, rounded
  bagsApproved: number
  mtApproved: number    // metric tons (approved only), 1 decimal
}

export interface GroupPerf {
  name: string
  approvedCount: number
  rejectedCount: number
  approvedBags: number
  rejectedBags: number
  rejectionRate: number // by count, 0-100
}

export interface RegionRow {
  region: string
  count: number
  bags: number
  pct: number // 0-100 of the side total; basis = the bucket metric
}

export interface BucketAggregate {
  totals: BucketTotals
  byImporter: GroupPerf[]
  byExporter: GroupPerf[]
  rejectionReasons: RejectionReasonRow[]
  approvedByRegion: RegionRow[]
  rejectedByRegion: RegionRow[]
}

/** A bucket's aggregates plus every cert row (approved + rejected),
 *  chronological — the appendix table renders these directly. */
export interface PerformanceBucket extends BucketAggregate {
  rows: PerformanceRow[]
  /** Named green-grading defects driving rejections (summed raw counts).
   *  Empty when no rejected sample recorded named defects. */
  greenDefects?: NamedDefectCount[]
  /** Named cupping faults/taints driving rejections (sample occurrences). */
  cuppingDefects?: NamedCuppingDefect[]
}

export interface PerformanceReportData {
  client: {
    id: string
    name: string
    logo_url: string | null
    is_roaster: boolean
    sankey_type: ClientSankeyType
  }
  period: { start_date: string; end_date: string; issued_at: string }
  origin: string | null
  pss: PerformanceBucket | null
  ss: PerformanceBucket | null
  /** Built from approved SS rows; null when the SS bucket wasn't requested. */
  sankey: SankeyLayoutResult | null
  sankeyColumns: string[]
  showSankey: boolean
}

const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

function emptyGroup(name: string): GroupPerf {
  return { name, approvedCount: 0, rejectedCount: 0, approvedBags: 0, rejectedBags: 0, rejectionRate: 0 }
}

export function groupBy(
  rows: PerformanceRow[],
  keyOf: (r: PerformanceRow) => string | null,
): GroupPerf[] {
  const map = new Map<string, GroupPerf>()
  for (const r of rows) {
    const name = keyOf(r)
    if (!name) continue
    const g = map.get(name) ?? emptyGroup(name)
    const bags = r.bags ?? 0
    if (r.is_rejected) {
      g.rejectedCount += 1
      g.rejectedBags += bags
    } else {
      g.approvedCount += 1
      g.approvedBags += bags
    }
    map.set(name, g)
  }
  for (const g of map.values()) {
    const total = g.approvedCount + g.rejectedCount
    g.rejectionRate = pct(g.rejectedCount, total)
  }
  return [...map.values()].sort((a, b) =>
    (b.approvedCount + b.rejectedCount) - (a.approvedCount + a.rejectedCount),
  )
}

function regionBreakdown(rows: PerformanceRow[], metric: 'count' | 'bags'): RegionRow[] {
  const map = new Map<string, { count: number; bags: number }>()
  for (const r of rows) {
    const region = (r.region && r.region.trim()) || 'Unspecified'
    const cur = map.get(region) ?? { count: 0, bags: 0 }
    cur.count += 1
    cur.bags += r.bags ?? 0
    map.set(region, cur)
  }
  const totalCount = rows.length
  const totalBags = rows.reduce((s, r) => s + (r.bags ?? 0), 0)
  const whole = metric === 'bags' ? totalBags : totalCount
  return [...map.entries()]
    .map(([region, v]) => ({
      region,
      count: v.count,
      bags: v.bags,
      pct: pct(metric === 'bags' ? v.bags : v.count, whole),
    }))
    .sort((a, b) => (metric === 'bags' ? b.bags - a.bags : b.count - a.count))
}

export function aggregateBucket(rows: PerformanceRow[], metric: 'count' | 'bags'): BucketAggregate {
  const approved = rows.filter(r => !r.is_rejected)
  const rejected = rows.filter(r => r.is_rejected)

  const totals: BucketTotals = {
    evaluated: rows.length,
    approved: approved.length,
    rejected: rejected.length,
    rejectionRate: pct(rejected.length, rows.length),
    bagsApproved: approved.reduce((s, r) => s + (r.bags ?? 0), 0),
    mtApproved: Math.round(approved.reduce((s, r) => s + (r.mt ?? 0), 0) * 10) / 10,
  }

  const reasonCounts = new Map<string, number>()
  for (const r of rejected) {
    // compliance_violations is not on the row; reasons are attached by the
    // fetcher via the `_violations` carrier. Optional so pure tests can omit.
    const violations = ((r as any)._violations as string[] | undefined) ?? []
    // Count each rejected certificate ONCE per category, so the reason list
    // reads "how many certificates were rejected for X" — not raw violation
    // occurrences (a cert with two "Total defects" lines is still one cert).
    const cats = new Set(violations.map(categorizeViolation))
    for (const cat of cats) {
      reasonCounts.set(cat, (reasonCounts.get(cat) ?? 0) + 1)
    }
  }
  const rejectionReasons: RejectionReasonRow[] = [...reasonCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totals,
    byImporter: groupBy(rows, r => r.importer_name),
    byExporter: groupBy(rows, r => r.exporter_name),
    rejectionReasons,
    approvedByRegion: regionBreakdown(approved, metric),
    rejectedByRegion: regionBreakdown(rejected, metric),
  }
}

/**
 * Order the appendix rows for display: approved certificates first, rejected
 * last, each group sub-sorted by shipper (exporter) then approval date. The
 * totals row stays approved-only regardless of order.
 */
export function sortAppendixRows(rows: PerformanceRow[]): PerformanceRow[] {
  const shipper = (r: PerformanceRow) => (r.exporter_name ?? '￿').toLowerCase()
  return [...rows].sort((a, b) => {
    if (a.is_rejected !== b.is_rejected) return a.is_rejected ? 1 : -1
    const s = shipper(a).localeCompare(shipper(b))
    if (s !== 0) return s
    return a.approval_date.localeCompare(b.approval_date)
  })
}

/** Map a raw cert row → a PerformanceRow, carrying region + raw violations. */
function toPerformanceRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): PerformanceRow {
  const base = mapCertRowToReportRow(c, ctx)
  const enriched = base as PerformanceRow & { _violations?: string[] }
  enriched.region = c.sample?.micro_origin ?? null
  enriched._violations = c.compliance_violations ?? []
  return enriched
}

export function scorecardFromExporters(perf: GroupPerf[]): SupplierScorecardRow[] {
  return perf.map(g => {
    const total = g.approvedCount + g.rejectedCount
    return {
      exporter_name: g.name,
      total,
      approved: g.approvedCount,
      rejected: g.rejectedCount,
      approval_rate: total > 0 ? round((g.approvedCount / total) * 100) : 0,
      bags: g.approvedBags,
    }
  })
}

export async function getPerformanceReportData(
  supabase: SupabaseClient,
  params: { clientId: string; startDate: string; endDate: string; buckets: ReportBucketKey[] },
): Promise<PerformanceReportData | null> {
  const { clientId, startDate, endDate, buckets } = params

  const { data: client, error: clientError } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, logo_url, company_types, trading_roles')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[performance-data] client not found:', clientId, clientError)
    return null
  }
  const companyTypes: string[] = client.company_types ?? []
  const tradingRoles: string[] = client.trading_roles ?? []
  const clientIsRoaster = companyTypes.some(t => typeof t === 'string' && t.toLowerCase() === 'roaster')
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'

  // NOTE: select must include sample.micro_origin (region) + bag_weight_kg
  // (bags/MT rule).
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id, sample_type, client_id, origin, micro_origin, container_nr, ico_number,
        bag_count, bag_weight_kg, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,
        exporter:companies!samples_exporter_id_fkey(name,fantasy_name),
        seller:companies!samples_seller_id_fkey(name,fantasy_name),
        importer:companies!samples_importer_id_fkey(name,fantasy_name),
        roaster:companies!samples_roaster_id_fkey(name,fantasy_name)
      )
    `)
    .is('sample_contract_id', null)
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (certsError) {
    console.error('[performance-data] certificates query failed:', certsError)
    return null
  }

  const forClient = (certs || []).filter((c: any) => c.sample && c.sample.client_id === clientId)

  const bucketRows = (type: ReportBucketKey): PerformanceRow[] =>
    forClient
      .filter((c: any) => c.sample.sample_type === type)
      .map((c: any) => toPerformanceRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))

  const pssRows = buckets.includes('pss') ? bucketRows('pss') : null
  const ssRows = buckets.includes('ss') ? bucketRows('ss') : null

  // Named rejection breakdown: pull the latest quality assessment for each
  // rejected sample and aggregate its green + cupping defects. Only rejected
  // samples are queried, so approved-heavy periods stay cheap.
  const rejectedIdsFor = (type: ReportBucketKey): string[] =>
    forClient
      .filter((c: any) => c.sample.sample_type === type && c.is_rejected && c.sample.id)
      .map((c: any) => c.sample.id as string)

  const pssRejectedIds = buckets.includes('pss') ? rejectedIdsFor('pss') : []
  const ssRejectedIds = buckets.includes('ss') ? rejectedIdsFor('ss') : []
  const allRejectedIds = [...new Set([...pssRejectedIds, ...ssRejectedIds])]

  const qaBySample = new Map<string, { green: unknown; resolved: unknown }>()
  if (allRejectedIds.length > 0) {
    const { data: assessments, error: qaError } = await supabase
      .from('quality_assessments')
      .select('sample_id, green_bean_data, resolved_defects, created_at')
      .in('sample_id', allRejectedIds)
      .order('created_at', { ascending: false })
    if (qaError) {
      console.error('[performance-data] quality_assessments query failed:', qaError)
    } else {
      // Ordered latest-first → keep the first (most recent) row per sample.
      // `green` is the whole green_bean_data column; extractGreenDefects
      // unwraps its nested `.defects` blob. `resolved_defects` is top-level.
      for (const a of (assessments || []) as any[]) {
        if (a.sample_id && !qaBySample.has(a.sample_id)) {
          qaBySample.set(a.sample_id, { green: a.green_bean_data, resolved: a.resolved_defects })
        }
      }
    }
  }

  const breakdownFor = (ids: string[]) =>
    aggregateDefectBreakdown(ids.map(id => qaBySample.get(id) ?? { green: null, resolved: null }))

  const pssBreakdown = breakdownFor(pssRejectedIds)
  const ssBreakdown = breakdownFor(ssRejectedIds)

  const pss: PerformanceBucket | null = pssRows
    ? { ...aggregateBucket(pssRows, 'count'), rows: pssRows, ...pssBreakdown }
    : null
  const ss: PerformanceBucket | null = ssRows
    ? { ...aggregateBucket(ssRows, 'bags'), rows: ssRows, ...ssBreakdown }
    : null

  // Dominant origin across the REQUESTED buckets (header flag).
  const requestedTypes = new Set(buckets)
  const originCounts = new Map<string, number>()
  for (const c of forClient as any[]) {
    if (!requestedTypes.has(c.sample?.sample_type)) continue
    const o = c.sample?.origin
    if (o) originCounts.set(o, (originCounts.get(o) ?? 0) + 1)
  }
  const origin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Sankey from approved SS rows; shown only when >2 companies (3+ columns).
  let sankey: SankeyLayoutResult | null = null
  let sankeyColumns: string[] = []
  if (ss && ssRows) {
    const approved = ssRows.filter(r => !r.is_rejected)
    const built = buildSankey(approved, scorecardFromExporters(ss.byExporter), sankeyType, clientDisplay)
    sankey = built.layout
    sankeyColumns = built.columns
  }

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { start_date: startDate, end_date: endDate, issued_at: new Date().toISOString() },
    origin,
    pss,
    ss,
    sankey,
    sankeyColumns,
    showSankey: sankeyColumns.length > 2,
  }
}
