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
  buildSankey,
  aggregateDefectBreakdown,
  extractGreenDefects,
  extractCuppingDefects,
  isRoasterCompany,
  resolveClientSankeyType,
  type RawCertSampleRow,
  type WeeklySSCertRow,
  type RejectionReasonRow,
  type NamedDefectCount,
  type DefectLoad,
  SANKEY_HEIGHT_COMPACT,
  type NamedCuppingDefect,
  type SupplierScorecardRow,
  type ClientSankeyType,
} from '@/lib/report-data'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'
import { buildSupplierRatings, type SupplierRatingRow } from '@/lib/reports/supplier-ratings'
import { labSourceId } from '@/lib/sample-group'
import { isPrimaryDefect } from '@/lib/defect-classification'
import { summarizeWorstReasons, classifyRejection, rejectionViolations, type RejectionReasonKey } from '@/lib/reports/rejection-reasons'
import { selectAllPages } from '@/lib/supabase-paged'
import { saoPauloMidnight, saoPauloYear, lastReportDay, reportDay } from '@/lib/reports/periods'

export type ReportBucketKey = 'pss' | 'ss'

/**
 * What a rejected certificate's lab unit recorded, by name: the primary
 * defects graded and the taints and faults the cuppers settled on. Most beans
 * first for the defects. Lets the report say WHICH primary defect or cup fault
 * a certificate failed on, not only how many.
 */
export interface RejectionDetail {
  primaryDefects: string[]
  faults: string[]
  taints: string[]
}

/** A report row carrying its region (micro_origin) for grouping, and, on a
 *  rejected certificate, what its lab unit recorded (fetcher-attached). */
export type PerformanceRow = WeeklySSCertRow & { region: string | null; rejection_detail?: RejectionDetail | null }

/** Null when the lab unit recorded nothing nameable. */
export function rejectionDetailOf(qa: { green: unknown; resolved: unknown } | undefined): RejectionDetail | null {
  if (!qa) return null
  const primaryDefects = extractGreenDefects(qa.green).filter(d => isPrimaryDefect(d.name)).map(d => d.name)
  const cup = extractCuppingDefects(qa.resolved)
  const names = (kind: 'fault' | 'taint') => [...new Set(cup.filter(c => c.kind === kind).map(c => c.name))]
  const detail = { primaryDefects, faults: names('fault'), taints: names('taint') }
  return detail.primaryDefects.length + detail.faults.length + detail.taints.length > 0 ? detail : null
}

/** The names behind each worst-reason row: primary defects, faults, taints. */
const DETAIL_OF: Partial<Record<RejectionReasonKey, (d: RejectionDetail) => string[]>> = {
  primary: d => d.primaryDefects,
  cup_fault: d => d.faults,
  cup_taint: d => d.taints,
}

/** Names across the certificates counted under each reason, most frequent first. */
function reasonDetails(rejected: PerformanceRow[]): Map<RejectionReasonKey, string[]> {
  const tally = new Map<RejectionReasonKey, Map<string, number>>()
  for (const r of rejected) {
    if (!r.rejection_detail) continue
    const worst = classifyRejection(((r as any)._violations as string[] | undefined) ?? []).worst
    const pick = DETAIL_OF[worst]
    if (!pick) continue
    const t = tally.get(worst) ?? new Map<string, number>()
    for (const name of pick(r.rejection_detail!)) t.set(name, (t.get(name) ?? 0) + 1)
    tally.set(worst, t)
  }
  return new Map([...tally].map(([k, t]) => [k, [...t].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n)]))
}

export interface BucketTotals {
  evaluated: number
  approved: number
  rejected: number
  rejectionRate: number // 0-100, rounded
  bagsApproved: number
  mtApproved: number    // metric tons (approved only), 1 decimal
  bagsRejected: number
  mtRejected: number    // metric tons (rejected only), 1 decimal
  /** One per certificate: a sample covering N contracts is N sample rows with
   *  N certificates, so the certificate count IS the contract count. */
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
  /** Containers (countContainers): named ones on SS, estimated on PSS. */
  containers: number
  bags: number
  mt: number // 1 decimal
  pct: number // 0-100 of the side total; basis = the bucket metric
}

export interface BucketAggregate {
  totals: BucketTotals
  byImporter: GroupPerf[]
  bySeller: GroupPerf[]
  byExporter: GroupPerf[]
  /** One row per reason, each rejected certificate counted ONCE under its
   *  worst reason (rejection-reasons.ts), severity order; sums to `rejected`. */
  rejectionReasons: RejectionReasonRow[]
  /** Rejected certificates that failed on more than one reason. */
  rejectedMultiReason: number
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
  defectLoad?: DefectLoad | null
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
 * How many commercial contracts the bucket covers. One sample per contract
 * (sample-group.ts) makes every certificate exactly one contract, so this is
 * the row count. It used to be the distinct importer references, which
 * collapsed contracts sharing a buyer reference and left the Pre-Shipment band
 * reading 19 contracts against 12 approved + 10 rejected certificates.
 */
export function countContracts(rows: PerformanceRow[]): number {
  return rows.length
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

/** A bagged container: 320 bags of 60 kg (19.2 MT), the trade's FCL. */
export const BAGS_PER_CONTAINER = 320

/**
 * Containers a set of certificates covers, for the region tables. A shipment
 * sample names its container (counted once however many certificates share
 * it); a pre-shipment sample has none yet, so it counts its recorded container
 * count, else its quantity in 320-bag containers.
 */
export function countContainers(rows: PerformanceRow[]): number {
  const seen = new Set<string>()
  let estimated = 0
  for (const r of rows) {
    const nr = r.container_nr?.trim().toUpperCase()
    if (nr) { seen.add(nr); continue }
    if (r.container_count && r.container_count > 0) estimated += Math.round(r.container_count)
    else if (r.bags && r.bags > 0) estimated += Math.max(1, Math.round(r.bags / BAGS_PER_CONTAINER))
  }
  return seen.size + estimated
}

function regionBreakdown(rows: PerformanceRow[], metric: 'count' | 'bags'): RegionRow[] {
  const map = new Map<string, { count: number; bags: number; mt: number; rows: PerformanceRow[] }>()
  for (const r of rows) {
    const region = (r.region && r.region.trim()) || 'Unspecified'
    const cur = map.get(region) ?? { count: 0, bags: 0, mt: 0, rows: [] }
    cur.count += 1
    cur.bags += r.bags ?? 0
    cur.mt += r.mt ?? 0
    cur.rows.push(r)
    map.set(region, cur)
  }
  const totalCount = rows.length
  const totalBags = rows.reduce((s, r) => s + (r.bags ?? 0), 0)
  const whole = metric === 'bags' ? totalBags : totalCount
  return [...map.entries()]
    .map(([region, v]) => ({
      region,
      count: v.count,
      containers: countContainers(v.rows),
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
export function collapseDefectFamily(cats: Set<string>): void {
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

  // compliance_violations is not on the row; the fetcher attaches it as the
  // `_violations` carrier. Optional so pure tests can omit it.
  const worst = summarizeWorstReasons(
    rejected.map(r => ((r as any)._violations as string[] | undefined) ?? []),
  )
  const details = reasonDetails(rejected)
  const rejectionReasons: RejectionReasonRow[] = worst.rows.map(r => ({
    category: r.label,
    count: r.count,
    ...(details.get(r.key)?.length ? { detail: details.get(r.key)!.join(', ') } : {}),
  }))

  return {
    totals,
    byImporter: groupBy(rows, r => r.importer_name),
    // Seller and shipper are frequently different companies (Grano ships, Volcafe
    // sells). Fall back to the shipper when no seller is recorded — the same
    // fallback `buildSankey` applies, so chart and flow name the same companies.
    bySeller: groupBy(rows, r => r.seller_name?.trim() || r.exporter_name?.trim() || null),
    byExporter: groupBy(rows, r => r.exporter_name),
    rejectionReasons,
    rejectedMultiReason: worst.multiReason,
    approvedByRegion: regionBreakdown(approved, metric),
    rejectedByRegion: regionBreakdown(rejected, metric),
  }
}

/**
 * Order the appendix rows for display: by issue date, then certificate number
 * — the order Daniel's weekly Excel uses, and the annual report's. Approved and
 * rejected mix; the Status column and the two total bars tell them apart.
 */
export function sortAppendixRows(rows: PerformanceRow[]): PerformanceRow[] {
  return [...rows].sort((a, b) =>
    reportDay(a.approval_date).localeCompare(reportDay(b.approval_date))
    || a.certificate_number.localeCompare(b.certificate_number, 'en', { numeric: true }),
  )
}

/** Map a raw cert row → a PerformanceRow, carrying region + raw violations. */
function toPerformanceRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): PerformanceRow {
  const base = mapCertRowToReportRow(c, ctx)
  const enriched = base as PerformanceRow & { _violations?: string[]; _labId?: string }
  enriched.region = c.sample?.micro_origin ?? null
  enriched._violations = rejectionViolations(!!c.is_rejected, c.compliance_violations, (c as { override_comment?: string | null }).override_comment)
  // Where its grading lives, to name the defects behind a rejection.
  if (c.is_rejected && c.sample?.id) enriched._labId = labSourceId(c.sample)
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

/** Whether Page B prints the approved/rejected region tables: not when no
 *  certificate carries a real region (all would read "Unspecified"). */
export function showRegionTables(agg: Pick<BucketAggregate, 'approvedByRegion' | 'rejectedByRegion'>): boolean {
  return [...agg.approvedByRegion, ...agg.rejectedByRegion].some(r => r.region !== 'Unspecified')
}

/** Body rows of the taller region table (an empty side prints one "None"
 *  row), or 0 when the tables are not printed. */
export function regionTableRows(agg: Pick<BucketAggregate, 'approvedByRegion' | 'rejectedByRegion'>): number {
  if (!showRegionTables(agg)) return 0
  return Math.max(agg.approvedByRegion.length, agg.rejectedByRegion.length, 1)
}

/**
 * The flow's plot height on Page B, so it fits UNDER the region tables
 * instead of jumping to its own page and leaving most of Page B blank (the
 * 29/09 Dunkin report). Budget in points, measured on the rendered page:
 * 539 of usable height, 95 for the logo header and title bar, 61 for the
 * flow's heading, column labels and legend, 12 of slack; the tables cost 60
 * plus 17 per body row.
 */
export const SANKEY_WIDTH_PAGE = 792
export const SANKEY_HEIGHT_PAGE_B_MAX = 260
export const SANKEY_HEIGHT_PAGE_B_MIN = 120
export function sankeyHeightUnderRegions(rows: number): number {
  const tables = rows > 0 ? 60 + 17 * rows : 0
  const avail = 539 - 95 - 61 - 12 - tables
  return Math.max(SANKEY_HEIGHT_PAGE_B_MIN, Math.min(SANKEY_HEIGHT_PAGE_B_MAX, avail))
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
  /** Rows the Page B region tables print above the flow (0 = no tables). */
  regionTableRows: number = 0,
): { sankey: SankeyLayoutResult | null; sankeyColumns: string[]; showSankey: boolean } {
  const approved = rows.filter(r => !r.is_rejected)
  // A bucket with nothing rejected loses its reasons block, two grid rows and
  // the legend, and its flow is promoted onto Page A to fill the gap — which
  // only fits at the compact height. See sankeyOnChartsPage in the PDF.
  // Otherwise it shares Page B with the region tables and takes what they leave.
  const height = approved.length === rows.length
    ? SANKEY_HEIGHT_COMPACT
    : sankeyHeightUnderRegions(regionTableRows)
  // Full page width: A4 landscape less the 24pt margins.
  const built = buildSankey(approved, scorecardFromExporters(byExporter), sankeyType, clientDisplay, height, { width: SANKEY_WIDTH_PAGE })
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

  // EVERY certificate issued in the window. A sample covering several contracts
  // is several sample rows — a lab unit plus siblings — each with its own
  // certificate, so no group filter belongs here: the unit of a performance
  // report is the CERTIFICATE, matching the certificates page and the batch
  // send. `lab_source_sample_id` is selected only to reach the lab unit's
  // grading for the defect breakdown.
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
  // Days are São Paulo days (periods.ts), so the year starts at São Paulo
  // midnight on 1 January; a UTC midnight printed as "Dec 31".
  const yearStart = saoPauloMidnight(`${saoPauloYear(lastReportDay(endDate))}-01-01`)
  const ytdStart = new Date(startDate) < new Date(yearStart) ? startDate : yearStart

  // Paged: a year of certificates passes PostgREST's 1000-row cap, which cut
  // the NEWEST rows (the report week itself) without an error. `id` breaks
  // created_at ties so no row falls between two pages.
  const { data: certs, error: certsError } = await selectAllPages<any>((from, to) =>
    supabase
      .from('certificates')
      .select(`
        certificate_number,
        created_at,
        is_rejected,
        compliance_violations,
        override_comment,
        sample:samples!certificates_sample_id_fkey(
          id, deleted_at, lab_source_sample_id, sample_type, client_id, origin, micro_origin, container_nr, ico_number,
          bag_count, bag_weight_kg, bag_type, equivalent_60kg_bags, bags_quantity_mt, container_count,
          buyer_contract_nr, importer_is_qc_client,
          exporter:companies!samples_exporter_id_fkey(name,fantasy_name),
          seller:companies!samples_seller_id_fkey(name,fantasy_name),
          importer:companies!samples_importer_id_fkey(name,fantasy_name),
          roaster:companies!samples_roaster_id_fkey(name,fantasy_name)
        )
      `)
      .gte('created_at', ytdStart)
      .lt('created_at', endDate)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )

  if (certsError) {
    console.error('[performance-data] certificates query failed:', certsError)
    return null
  }

  // Filter by QC client on the certificate's own sample row — a sibling can be
  // sold to a different client than its lab unit.
  // A soft-deleted sample's certificate row survives for the audit; it is not
  // a result any report counts.
  const forClient = ((certs || []) as any[])
    .filter(c => c.sample && !c.sample.deleted_at)
    .filter(c => reportRowClientId(c as RawCertSampleRow) === clientId)

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
  // rejected lot and aggregate its green + cupping defects. Only rejected lots
  // are queried, so approved-heavy periods stay cheap.
  // Read by LAB UNIT (a sibling has no grading of its own; its lab data lives
  // on the row `lab_source_sample_id` points at), but COUNTED per rejected
  // certificate: the page's unit is the certificate, so a lot covering three
  // rejected contracts shows its defects three times, matching the reasons
  // table beside it (Cup (fault) 8 next to Hard (riado) 3 read as a mismatch).
  const rejectedLabIdsFor = (type: ReportBucketKey): string[] =>
    forClientPeriod
      .filter((c: any) => c.sample.sample_type === type && c.is_rejected && c.sample.id)
      .map((c: any) => labSourceId(c.sample))
  const rejectedIdsFor = (type: ReportBucketKey): string[] => [...new Set(rejectedLabIdsFor(type))]

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
      // Ordered latest-first → keep the first (most recent) row per lab unit.
      // `green` is the whole green_bean_data column; extractGreenDefects
      // unwraps its nested `.defects` blob. `resolved_defects` is top-level.
      for (const a of (assessments || []) as any[]) {
        if (a.sample_id && !qaBySample.has(a.sample_id)) {
          qaBySample.set(a.sample_id, { green: a.green_bean_data, resolved: a.resolved_defects })
        }
      }
    }
  }

  // Each rejected certificate names what its lab unit recorded, before the
  // buckets aggregate (the worst-reason table lists the names too).
  for (const r of [...(pssRows ?? []), ...(ssRows ?? [])]) {
    const labId = (r as { _labId?: string })._labId
    if (r.is_rejected && labId) r.rejection_detail = rejectionDetailOf(qaBySample.get(labId))
  }

  const breakdownFor = (ids: string[]) =>
    aggregateDefectBreakdown(ids.map(id => qaBySample.get(id) ?? { green: null, resolved: null }))

  const pssBreakdown = breakdownFor(buckets.includes('pss') ? rejectedLabIdsFor('pss') : [])
  const ssBreakdown = breakdownFor(buckets.includes('ss') ? rejectedLabIdsFor('ss') : [])

  const bucket = (rows: PerformanceRow[], metric: 'count' | 'bags', breakdown: typeof pssBreakdown): PerformanceBucket => {
    const agg = aggregateBucket(rows, metric)
    return {
      ...agg,
      rows,
      ...breakdown,
      ...buildBucketSankey(rows, agg.byExporter, sankeyType, clientDisplay, regionTableRows(agg)),
    }
  }
  const pss: PerformanceBucket | null = pssRows ? bucket(pssRows, 'count', pssBreakdown) : null
  const ss: PerformanceBucket | null = ssRows ? bucket(ssRows, 'bags', ssBreakdown) : null

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
