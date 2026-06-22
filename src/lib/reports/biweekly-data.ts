/**
 * Bi-Weekly Performance report data.
 *
 * Pulls every certificate (approved + rejected) created in the window for one
 * QC client — both PSS and SS — and aggregates each sample-type bucket into
 * per-importer / per-exporter / per-region performance plus rejection reasons.
 * Reuses the Weekly report's row mapper, violation categorizer, and Sankey
 * builder so the two reports cannot drift.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  mapCertRowToReportRow,
  categorizeViolation,
  buildSankey,
  type RawCertSampleRow,
  type WeeklySSCertRow,
  type RejectionReasonRow,
  type SupplierScorecardRow,
  type ClientSankeyType,
} from '@/lib/report-data'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'

/** A report row carrying its region (micro_origin) for grouping. */
export type BiweeklyRow = WeeklySSCertRow & { region: string | null }

export interface BucketTotals {
  evaluated: number
  approved: number
  rejected: number
  rejectionRate: number // 0-100, rounded
  bagsApproved: number
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

export interface BiweeklyPerformanceReportData {
  client: {
    id: string
    name: string
    logo_url: string | null
    is_roaster: boolean
    sankey_type: ClientSankeyType
  }
  period: { start_date: string; end_date: string; issued_at: string }
  origin: string | null
  pss: BucketAggregate
  ss: BucketAggregate
  ssApprovedRows: WeeklySSCertRow[]
  sankey: SankeyLayoutResult
  sankeyColumns: string[]
  showSankey: boolean
}

const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

function emptyGroup(name: string): GroupPerf {
  return { name, approvedCount: 0, rejectedCount: 0, approvedBags: 0, rejectedBags: 0, rejectionRate: 0 }
}

function groupBy(
  rows: BiweeklyRow[],
  keyOf: (r: BiweeklyRow) => string | null,
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

function regionBreakdown(rows: BiweeklyRow[], metric: 'count' | 'bags'): RegionRow[] {
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

export function aggregateBucket(rows: BiweeklyRow[], metric: 'count' | 'bags'): BucketAggregate {
  const approved = rows.filter(r => !r.is_rejected)
  const rejected = rows.filter(r => r.is_rejected)

  const totals: BucketTotals = {
    evaluated: rows.length,
    approved: approved.length,
    rejected: rejected.length,
    rejectionRate: pct(rejected.length, rows.length),
    bagsApproved: approved.reduce((s, r) => s + (r.bags ?? 0), 0),
  }

  const reasonCounts = new Map<string, number>()
  for (const r of rejected) {
    // compliance_violations is not on the row; reasons are attached by the fetcher
    // via the `_violations` carrier. Kept optional so pure tests can omit it.
    const violations = ((r as any)._violations as string[] | undefined) ?? []
    for (const v of violations) {
      const cat = categorizeViolation(v)
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

/** Map a raw cert row → a BiweeklyRow, carrying region + raw violations. */
function toBiweeklyRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): BiweeklyRow {
  const base = mapCertRowToReportRow(c, ctx)
  const enriched = base as BiweeklyRow & { _violations?: string[] }
  enriched.region = c.sample?.micro_origin ?? null
  enriched._violations = c.compliance_violations ?? []
  return enriched
}

function scorecardFromExporters(perf: GroupPerf[]): SupplierScorecardRow[] {
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

export async function getBiweeklyPerformanceReportData(
  supabase: SupabaseClient,
  params: { clientId: string; startDate: string; endDate: string },
): Promise<BiweeklyPerformanceReportData | null> {
  const { clientId, startDate, endDate } = params

  const { data: client, error: clientError } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, logo_url, company_types, trading_roles')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[biweekly-data] client not found:', clientId, clientError)
    return null
  }
  const companyTypes: string[] = client.company_types ?? []
  const tradingRoles: string[] = client.trading_roles ?? []
  const clientIsRoaster = companyTypes.some(t => typeof t === 'string' && t.toLowerCase() === 'roaster')
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'

  // NOTE: select MUST include sample.micro_origin (region) — the Weekly query omits it.
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id, sample_type, client_id, origin, micro_origin, container_nr, ico_number,
        bag_count, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,
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
    console.error('[biweekly-data] certificates query failed:', certsError)
    return null
  }

  const forClient = (certs || []).filter((c: any) => c.sample && c.sample.client_id === clientId)
  const pssRows = forClient
    .filter((c: any) => c.sample.sample_type === 'pss')
    .map((c: any) => toBiweeklyRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))
  const ssRows = forClient
    .filter((c: any) => c.sample.sample_type === 'ss')
    .map((c: any) => toBiweeklyRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))

  const pss = aggregateBucket(pssRows, 'count')
  const ss = aggregateBucket(ssRows, 'bags')

  // Dominant origin across both buckets (for the header flag).
  const originCounts = new Map<string, number>()
  for (const c of forClient as any[]) {
    const o = c.sample?.origin
    if (o) originCounts.set(o, (originCounts.get(o) ?? 0) + 1)
  }
  const origin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Sankey from approved SS rows; shown only when >2 companies (3+ columns).
  const ssApprovedRows = ssRows.filter((r: BiweeklyRow) => !r.is_rejected)
  const { layout: sankey, columns: sankeyColumns } = buildSankey(
    ssApprovedRows, scorecardFromExporters(ss.byExporter), sankeyType, clientDisplay,
  )

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { start_date: startDate, end_date: endDate, issued_at: new Date().toISOString() },
    origin,
    pss,
    ss,
    ssApprovedRows,
    sankey,
    sankeyColumns,
    showSankey: sankeyColumns.length > 2,
  }
}
