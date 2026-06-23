/**
 * Annual Quality Performance Review — data layer.
 *
 * Reuses the Bi-Weekly engine (aggregateBucket + helpers) over a full
 * calendar-year window for ONE QC client, across ALL labs and ALL origins.
 * Adds the pieces the Bi-Weekly lacks: a seller breakdown, by-origin and
 * by-lab breakdowns, a 12-month trend series, and a whole-year Sankey.
 *
 * The Supabase fetch lives in getAnnualPerformanceReportData (below); the pure
 * functions above it are unit-tested in isolation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aggregateBucket,
  groupBy,
  scorecardFromExporters,
  type BiweeklyRow,
  type GroupPerf,
  type BucketAggregate,
} from '@/lib/reports/biweekly-data'
import {
  buildSankey,
  mapCertRowToReportRow,
  type ClientSankeyType,
  type RawCertSampleRow,
} from '@/lib/report-data'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

/** A BiweeklyRow extended with the fields the Annual groups on. */
export type AnnualRow = BiweeklyRow & { origin: string | null; laboratory_name: string | null }

export interface MonthlyPoint {
  month: number          // 1-12
  label: string          // 'Jan' … 'Dec'
  evaluated: number      // PSS + SS samples assessed that month
  approved: number
  rejected: number
  approvalRate: number   // 0-100, rounded; 0 when evaluated === 0
  bagsApproved: number   // SS approved bags that month
}
export type MonthlySeries = MonthlyPoint[]

export interface AnnualHero {
  samplesEvaluated: number
  overallApprovalRate: number   // 0-100
  bagsCleared: number           // SS approved bags
  rejections: number
  overallRejectionRate: number  // 0-100
}

export interface AnnualAggregates {
  hero: AnnualHero
  pss: BucketAggregate          // basis: count
  ss: BucketAggregate           // basis: bags
  bySellerPss: GroupPerf[]
  bySellerSs: GroupPerf[]
  byOrigin: GroupPerf[]
  byLab: GroupPerf[]
  labsCovered: string[]
  originsCovered: string[]
  monthly: MonthlySeries
  sankey: SankeyLayoutResult
  sankeyColumns: string[]
  showSankey: boolean
}

export interface AnnualPerformanceReportData {
  client: { id: string; name: string; logo_url: string | null; is_roaster: boolean; sankey_type: ClientSankeyType }
  period: { year: number; issued_at: string }
  origin: string | null         // dominant origin, for the header flag
  agg: AnnualAggregates
}

export function computeHero(pss: BucketAggregate, ss: BucketAggregate): AnnualHero {
  const evaluated = pss.totals.evaluated + ss.totals.evaluated
  const approved = pss.totals.approved + ss.totals.approved
  const rejected = pss.totals.rejected + ss.totals.rejected
  return {
    samplesEvaluated: evaluated,
    overallApprovalRate: pct(approved, evaluated),
    bagsCleared: ss.totals.bagsApproved,
    rejections: rejected,
    overallRejectionRate: pct(rejected, evaluated),
  }
}

export function buildMonthlySeries(pssRows: BiweeklyRow[], ssRows: BiweeklyRow[]): MonthlySeries {
  const series: MonthlySeries = MONTH_LABELS.map((label, i) => ({
    month: i + 1, label, evaluated: 0, approved: 0, rejected: 0, approvalRate: 0, bagsApproved: 0,
  }))
  const add = (rows: BiweeklyRow[], countBags: boolean) => {
    for (const r of rows) {
      const created = (r as any).created_at as string | undefined
      if (!created) continue
      const m = new Date(created).getUTCMonth() // 0-11
      const p = series[m]
      p.evaluated += 1
      if (r.is_rejected) p.rejected += 1
      else {
        p.approved += 1
        if (countBags) p.bagsApproved += r.bags ?? 0
      }
    }
  }
  add(pssRows, false)   // PSS contributes to counts only
  add(ssRows, true)     // SS contributes counts + approved bags
  for (const p of series) p.approvalRate = pct(p.approved, p.evaluated)
  return series
}

export function buildAnnualAggregates(
  pssRows: BiweeklyRow[],
  ssRows: BiweeklyRow[],
  opts: { sankeyType: ClientSankeyType; clientDisplay: string },
): AnnualAggregates {
  const pss = aggregateBucket(pssRows, 'count')
  const ss = aggregateBucket(ssRows, 'bags')

  const allRows = [...pssRows, ...ssRows] as AnnualRow[]
  const bySellerPss = groupBy(pssRows, r => r.seller_name ?? 'Unspecified')
  const bySellerSs = groupBy(ssRows, r => r.seller_name ?? 'Unspecified')
  const byOrigin = groupBy(allRows, r => ((r as AnnualRow).origin?.trim()) || 'Unspecified')
  const byLab = groupBy(allRows, r => ((r as AnnualRow).laboratory_name?.trim()) || 'Unspecified')

  const labsCovered = [...new Set(allRows.map(r => r.laboratory_name).filter((x): x is string => !!x))]
  const originsCovered = [...new Set(allRows.map(r => r.origin).filter((x): x is string => !!x))]

  // Whole-year Sankey from approved SS rows (trade-relevant flow), same basis
  // the Bi-Weekly uses.
  const ssApproved = ssRows.filter(r => !r.is_rejected)
  const { layout: sankey, columns: sankeyColumns } = buildSankey(
    ssApproved, scorecardFromExporters(ss.byExporter), opts.sankeyType, opts.clientDisplay,
  )

  return {
    hero: computeHero(pss, ss),
    pss, ss,
    bySellerPss, bySellerSs,
    byOrigin, byLab,
    labsCovered, originsCovered,
    monthly: buildMonthlySeries(pssRows, ssRows),
    sankey, sankeyColumns,
    showSankey: sankeyColumns.length > 2,
  }
}

/** Map a raw cert row → an AnnualRow, carrying region, origin, lab name, violations. */
export function toAnnualRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
  labName: string | null,
): AnnualRow {
  const base = mapCertRowToReportRow(c, ctx)
  const enriched = base as AnnualRow & { _violations?: string[]; created_at?: string }
  enriched.region = c.sample?.micro_origin ?? null
  enriched.origin = c.sample?.origin ?? null
  enriched.laboratory_name = labName
  enriched.created_at = (c as any).created_at
  enriched._violations = (c as any).compliance_violations ?? []
  return enriched
}

export async function getAnnualPerformanceReportData(
  supabase: SupabaseClient,
  params: { clientId: string; year: number },
): Promise<AnnualPerformanceReportData | null> {
  const { clientId, year } = params
  const startDate = `${year}-01-01T00:00:00.000Z`
  const endDate = `${year + 1}-01-01T00:00:00.000Z`

  const { data: client, error: clientError } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, logo_url, company_types, trading_roles')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[annual-data] client not found:', clientId, clientError)
    return null
  }
  const companyTypes: string[] = client.company_types ?? []
  const tradingRoles: string[] = client.trading_roles ?? []
  const clientIsRoaster = companyTypes.some(t => typeof t === 'string' && t.toLowerCase() === 'roaster')
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'

  // Lab id → name lookup (small table; load once). Cross-lab is intentional —
  // we DO NOT filter by laboratory_id.
  const { data: labs } = await (supabase as any).from('laboratories').select('id, name')
  const labNameById = new Map<string, string>((labs ?? []).map((l: any) => [l.id, l.name]))

  // Same query shape as the Bi-Weekly, plus sample.laboratory_id. NO lab/origin filter.
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id, sample_type, client_id, origin, micro_origin, laboratory_id, container_nr, ico_number,
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
    console.error('[annual-data] certificates query failed:', certsError)
    return null
  }

  const forClient = (certs || []).filter((c: any) => c.sample && c.sample.client_id === clientId)
  const shape = (c: any) =>
    toAnnualRow(c as RawCertSampleRow, { sankeyType, clientDisplay }, labNameById.get(c.sample.laboratory_id) ?? null)
  const pssRows = forClient.filter((c: any) => c.sample.sample_type === 'pss').map(shape)
  const ssRows = forClient.filter((c: any) => c.sample.sample_type === 'ss').map(shape)

  // Dominant origin across both buckets (header flag).
  const originCounts = new Map<string, number>()
  for (const c of forClient as any[]) {
    const o = c.sample?.origin
    if (o) originCounts.set(o, (originCounts.get(o) ?? 0) + 1)
  }
  const origin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType, clientDisplay })

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { year, issued_at: new Date().toISOString() },
    origin,
    agg,
  }
}
