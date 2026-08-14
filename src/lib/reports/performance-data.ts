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
  reportRowClientId,
  fetchSubContractOverrides,
  attachSubContracts,
  categorizeViolation,
  buildSankey,
  aggregateDefectBreakdown,
  isRoasterCompany,
  resolveClientSankeyType,
  type RawCertSampleRow,
  type WeeklySSCertRow,
  type RejectionReasonRow,
  type NamedDefectCount,
  type NamedCuppingDefect,
  type SupplierScorecardRow,
  type ClientSankeyType,
} from '@/lib/report-data'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'
import { buildSupplierRatings, type SupplierRatingRow } from '@/lib/reports/supplier-ratings'

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
  bagsRejected: number
  mtRejected: number    // metric tons (rejected only), 1 decimal
  /** Distinct importer contract numbers; a certificate with none counts as its
   *  own contract, so this can never under-report. One contract carries several
   *  containers (FCL), each with its own certificate. */
  contracts: number
  /** Distinct containers. Zero for PSS, which carries no container. */
  fcl: number
}

export interface GroupPerf {
  name: string
  approvedCount: number
  rejectedCount: number
  approvedBags: number
  rejectedBags: number
  approvedMt: number    // 1 decimal
  rejectedMt: number    // 1 decimal
  rejectionRate: number // by count, 0-100
}

export interface RegionRow {
  region: string
  count: number
  bags: number
  mt: number // 1 decimal
  pct: number // 0-100 of the side total; basis = the bucket metric
}

export interface BucketAggregate {
  totals: BucketTotals
  byImporter: GroupPerf[]
  bySeller: GroupPerf[]
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
  /** Supply-chain flow built from this bucket's APPROVED rows, bag-weighted. */
  sankey: SankeyLayoutResult | null
  sankeyColumns: string[]
  /** A 2-column chain (Shipper → Seller) says nothing a table doesn't; hidden. */
  showSankey: boolean
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
  /** Year-to-date supplier rating for this client, both buckets combined.
   *  Same data on every bucket section — it is a client-wide year view. */
  ratings: {
    shippers: SupplierRatingRow[]
    sellers: SupplierRatingRow[]
    window: { start: string; end: string }
  }
  pss: PerformanceBucket | null
  ss: PerformanceBucket | null
}

const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

function emptyGroup(name: string): GroupPerf {
  return {
    name, approvedCount: 0, rejectedCount: 0,
    approvedBags: 0, rejectedBags: 0, approvedMt: 0, rejectedMt: 0,
    rejectionRate: 0,
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

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
    const mt = r.mt ?? 0
    if (r.is_rejected) {
      g.rejectedCount += 1
      g.rejectedBags += bags
      g.rejectedMt += mt
    } else {
      g.approvedCount += 1
      g.approvedBags += bags
      g.approvedMt += mt
    }
    map.set(name, g)
  }
  for (const g of map.values()) {
    const total = g.approvedCount + g.rejectedCount
    g.rejectionRate = pct(g.rejectedCount, total)
    g.approvedMt = round1(g.approvedMt)
    g.rejectedMt = round1(g.rejectedMt)
  }
  return [...map.values()].sort((a, b) =>
    (b.approvedCount + b.rejectedCount) - (a.approvedCount + a.rejectedCount),
  )
}

/**
 * How many commercial contracts the bucket covers. One contract carries several
 * containers, each with its own certificate, so this is the distinct count of
 * importer contract numbers. A certificate with no importer reference is counted
 * as its own contract — the figure degrades toward the certificate count rather
 * than silently collapsing rows together.
 */
export function countContracts(rows: PerformanceRow[]): number {
  const seen = new Set<string>()
  let unreferenced = 0
  for (const r of rows) {
    const v = r.importer_contract_nr?.trim()
    if (v) seen.add(v)
    else unreferenced += 1
  }
  return seen.size + unreferenced
}

/** Full container loads = distinct containers. Zero on PSS (no container). */
export function countFcl(rows: PerformanceRow[]): number {
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r.container_nr?.trim()
    if (v) seen.add(v)
  }
  return seen.size
}

function regionBreakdown(rows: PerformanceRow[], metric: 'count' | 'bags'): RegionRow[] {
  const map = new Map<string, { count: number; bags: number; mt: number }>()
  for (const r of rows) {
    const region = (r.region && r.region.trim()) || 'Unspecified'
    const cur = map.get(region) ?? { count: 0, bags: 0, mt: 0 }
    cur.count += 1
    cur.bags += r.bags ?? 0
    cur.mt += r.mt ?? 0
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
      mt: round1(v.mt),
      pct: pct(metric === 'bags' ? v.bags : v.count, whole),
    }))
    .sort((a, b) => (metric === 'bags' ? b.bags - a.bags : b.count - a.count))
}

/**
 * Collapse the green-defect grading family to a single rejection reason per
 * certificate (mutates the category set in place):
 *   - failed on PRIMARY defects → keep "Primary defects" only (the headline);
 *   - else failed on SECONDARY and/or TOTAL defects → "Secondary defects"
 *     (total is merged into secondary — a total-defect overage is a
 *     secondary-defect story unless primaries were the cause).
 * Non-defect reasons (moisture, cupping faults, screen sizes, cup attrs) are
 * left untouched.
 */
function collapseDefectFamily(cats: Set<string>): void {
  const hasPrimary = cats.has('Primary defects')
  const hasSecondaryOrTotal = cats.has('Secondary defects') || cats.has('Total defects')
  cats.delete('Primary defects')
  cats.delete('Secondary defects')
  cats.delete('Total defects')
  if (hasPrimary) cats.add('Primary defects')
  else if (hasSecondaryOrTotal) cats.add('Secondary defects')
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
    mtApproved: round1(approved.reduce((s, r) => s + (r.mt ?? 0), 0)),
    bagsRejected: rejected.reduce((s, r) => s + (r.bags ?? 0), 0),
    mtRejected: round1(rejected.reduce((s, r) => s + (r.mt ?? 0), 0)),
    contracts: countContracts(rows),
    fcl: countFcl(rows),
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
    collapseDefectFamily(cats)
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
    // Seller and shipper are frequently different companies (Grano ships, Volcafe
    // sells). Fall back to the shipper when no seller is recorded — the same
    // fallback `buildSankey` applies, so chart and flow name the same companies.
    bySeller: groupBy(rows, r => r.seller_name?.trim() || r.exporter_name?.trim() || null),
    byExporter: groupBy(rows, r => r.exporter_name),
    rejectionReasons,
    approvedByRegion: regionBreakdown(approved, metric),
    rejectedByRegion: regionBreakdown(rejected, metric),
  }
}

/**
 * Order the appendix rows for display: approved certificates first, rejected
 * last, each group sub-sorted by shipper (exporter) then approval date.
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

/**
 * The bucket's supply-chain flow. Built from APPROVED rows only — a rejected lot
 * never moved through the chain — and weighted by bags, which PSS rows carry too
 * (quantities come from the sample, not the shipment stage).
 */
export function buildBucketSankey(
  rows: PerformanceRow[],
  byExporter: GroupPerf[],
  sankeyType: ClientSankeyType,
  clientDisplay: string,
): { sankey: SankeyLayoutResult | null; sankeyColumns: string[]; showSankey: boolean } {
  const approved = rows.filter(r => !r.is_rejected)
  const built = buildSankey(approved, scorecardFromExporters(byExporter), sankeyType, clientDisplay)
  return {
    sankey: built.layout,
    sankeyColumns: built.columns,
    // `buildSankey` skips rows with no quantity (bags <= 0), so a bucket can
    // have a >2 column chain yet produce zero links — e.g. every PSS sample
    // in the bucket carries no bag count. Gate on the built layout actually
    // having links too, or the panel prints only the chart's own
    // "Not enough supply-chain data" placeholder under a "Supply chain flow"
    // heading that promised more.
    showSankey: built.columns.length > 2 && built.layout.links.length > 0,
  }
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
  const clientIsRoaster = isRoasterCompany(companyTypes)
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = resolveClientSankeyType(companyTypes, tradingRoles)

  // EVERY certificate issued in the window — the mother certificate of each
  // sample PLUS one per commercial split (`sample_contracts`). Filtering to
  // `sample_contract_id IS NULL` is what used to report a 12-container shipment
  // as a single certificate. The unit of a performance report is the
  // CERTIFICATE, matching the certificates page and the batch send.
  //
  // NOTE: select must include sample.micro_origin (region) + bag_weight_kg
  // (bags/MT rule).
  //
  // The YTD rating needs the whole year, not just the report period, so the
  // certificate query is widened once rather than run twice. `min` guards a
  // period that straddles a year boundary (Dec 28 – Jan 3), where Jan 1 of the
  // end year would otherwise be NARROWER than the report period itself.
  //
  // `endDate` is EXCLUSIVE. A report covering Dec 16-31 arrives with
  // endDate = Jan 1 of the following year, so taking the year of endDate
  // directly would put yearStart a year too late (at/after endDate itself,
  // collapsing the `min` guard below to `startDate` and silently shrinking
  // "year to date" to the report period). Take the year of the last instant
  // actually covered (endDate minus 1ms) instead.
  const yearStart = `${new Date(new Date(endDate).getTime() - 1).getUTCFullYear()}-01-01T00:00:00.000Z`
  const ytdStart = new Date(startDate) < new Date(yearStart) ? startDate : yearStart

  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample_contract_id,
      sample:samples!certificates_sample_id_fkey(
        id, sample_type, client_id, origin, micro_origin, container_nr, ico_number,
        bag_count, bag_weight_kg, bag_type, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,
        exporter:companies!samples_exporter_id_fkey(name,fantasy_name),
        seller:companies!samples_seller_id_fkey(name,fantasy_name),
        importer:companies!samples_importer_id_fkey(name,fantasy_name),
        roaster:companies!samples_roaster_id_fkey(name,fantasy_name)
      )
    `)
    .gte('created_at', ytdStart)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (certsError) {
    console.error('[performance-data] certificates query failed:', certsError)
    return null
  }

  // Attach each split's own contract row, then filter by QC client — a split
  // can belong to a different client than its mother sample.
  const withSubs = attachSubContracts(
    ((certs || []) as any[]).filter(c => c.sample) as RawCertSampleRow[],
    await fetchSubContractOverrides(supabase as any, (certs || []) as any[]),
  )
  const forClient = withSubs.filter(c => reportRowClientId(c) === clientId) as any[]

  // `forClient` now spans the whole YTD window. Everything except the rating
  // tables must see ONLY the report period — the defect breakdown and the header
  // origin included, or a weekly report would describe the whole year.
  const periodStartMs = new Date(startDate).getTime()
  const inPeriodRaw = (c: any) => new Date(c.created_at).getTime() >= periodStartMs

  const ytdBucketRows = (type: ReportBucketKey): PerformanceRow[] =>
    forClient
      .filter((c: any) => c.sample.sample_type === type)
      .map((c: any) => toPerformanceRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))

  const ytdPssRows = ytdBucketRows('pss')
  const ytdSsRows = ytdBucketRows('ss')
  const inPeriod = (r: PerformanceRow) => new Date(r.approval_date).getTime() >= periodStartMs

  const pssRows = buckets.includes('pss') ? ytdPssRows.filter(inPeriod) : null
  const ssRows = buckets.includes('ss') ? ytdSsRows.filter(inPeriod) : null

  const forClientPeriod = (forClient as any[]).filter(inPeriodRaw)

  // Named rejection breakdown: pull the latest quality assessment for each
  // rejected sample and aggregate its green + cupping defects. Only rejected
  // samples are queried, so approved-heavy periods stay cheap.
  // Deduped by SAMPLE: quality is graded once on the mother, so a rejected
  // sample's defects must be counted once no matter how many of its split
  // certificates carry the rejection.
  const rejectedIdsFor = (type: ReportBucketKey): string[] => [
    ...new Set<string>(
      forClientPeriod
        .filter((c: any) => c.sample.sample_type === type && c.is_rejected && c.sample.id)
        .map((c: any) => c.sample.id as string),
    ),
  ]

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
    ? {
        ...aggregateBucket(pssRows, 'count'),
        rows: pssRows,
        ...pssBreakdown,
        ...buildBucketSankey(pssRows, groupBy(pssRows, r => r.exporter_name), sankeyType, clientDisplay),
      }
    : null
  const ss: PerformanceBucket | null = ssRows
    ? {
        ...aggregateBucket(ssRows, 'bags'),
        rows: ssRows,
        ...ssBreakdown,
        ...buildBucketSankey(ssRows, groupBy(ssRows, r => r.exporter_name), sankeyType, clientDisplay),
      }
    : null

  // Dominant origin across the REQUESTED buckets (header flag).
  const requestedTypes = new Set(buckets)
  const originCounts = new Map<string, number>()
  for (const c of forClientPeriod as any[]) {
    if (!requestedTypes.has(c.sample?.sample_type)) continue
    const o = c.sample?.origin
    if (o) originCounts.set(o, (originCounts.get(o) ?? 0) + 1)
  }
  const origin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { start_date: startDate, end_date: endDate, issued_at: new Date().toISOString() },
    origin,
    ratings: {
      shippers: buildSupplierRatings(ytdPssRows, ytdSsRows, r => r.exporter_name),
      // Seller falls back to the shipper, matching `bySeller` and `buildSankey`.
      sellers: buildSupplierRatings(ytdPssRows, ytdSsRows, r => r.seller_name || r.exporter_name),
      window: { start: ytdStart, end: endDate },
    },
    pss,
    ss,
  }
}
