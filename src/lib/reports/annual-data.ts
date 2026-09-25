/**
 * Annual Quality Performance Review — data layer.
 *
 * Reuses the performance engine (aggregateBucket + helpers) over a full
 * calendar-year window for ONE QC client, across ALL labs and ALL origins,
 * and adds what the annual report prints beyond the period reports: the year
 * at a glance, month-by-month grids, the supplier review, quality findings
 * per graded lot, key figures and a whole-year Sankey.
 *
 * The Supabase fetch lives in getAnnualPerformanceReportData (below); the pure
 * functions above it are unit-tested in isolation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aggregateBucket,
  groupBy,
  scorecardFromExporters,
  type GroupPerf,
  type BucketAggregate,
} from '@/lib/reports/performance-data'
import {
  buildSankey,
  reportRowClientId,
  isRoasterCompany,
  resolveClientSankeyType,
  type ClientSankeyType,
  type RawCertSampleRow,
} from '@/lib/report-data'
import { CHARCOAL_SANKEY_PALETTE, type SankeyLayoutResult } from '@/lib/charts/sankey-layout'
import { toAnnualRow, type AnnualRow } from './annual-row'
import { pct } from './annual-math'
import { computeGlance, countContainers, type AnnualGlance } from './annual-glance'
import {
  buildMonthlyGrid,
  buildMonthTotals,
  type MonthlyBasis,
  type MonthlyGrid,
  type MonthTotal,
} from './annual-monthly'
import { buildSupplierReview, sellerOf, shipperOf, type SupplierReview } from './annual-supplier-review'
import { buildQualityFindings, emptyQualityFindings, type QualityFindings } from './annual-quality'
import { fetchLabUnitQuality, type LabUnitRef } from './annual-quality-fetch'

export { toAnnualRow } from './annual-row'
export type { AnnualRow } from './annual-row'

export const ANNUAL_SANKEY_WIDTH = 760
export const ANNUAL_SANKEY_HEIGHT = 330

// ---------------------------------------------------------------------------
// Redesign
// ---------------------------------------------------------------------------

export interface MonthlySection {
  totals: MonthTotal[]
  byShipper: MonthlyGrid
  bySeller: MonthlyGrid
  /** Final-buyer clients with more than one importer only. */
  byImporter: MonthlyGrid | null
  /** Final-buyer clients with more than one roaster only. */
  byRoaster: MonthlyGrid | null
}

/** The year-in-review page's right-hand column — calculated here, never by the AI. */
export interface KeyFigures {
  pss: { rate: number; approved: number; total: number } | null
  ss: { rate: number; approvedBags: number; totalBags: number } | null
  busiestMonth: { label: string; value: number; unit: 'bags' | 'certificates' } | null
  topReason: { category: string; certificates: number } | null
  largestShipper: { name: string; mt: number } | null
  origins: Array<{ name: string; pct: number }>
  labs: Array<{ name: string; pct: number }>
}

export interface AnnualAggregates {
  glance: AnnualGlance
  pss: BucketAggregate          // basis: count
  ss: BucketAggregate           // basis: bags
  bySellerPss: GroupPerf[]
  bySellerSs: GroupPerf[]
  /** Approved SS containers per shipper / seller, and in total. */
  ssContainers: { byShipper: Record<string, number>; bySeller: Record<string, number>; total: number }
  months: { pss: MonthlySection; ss: MonthlySection }
  supplierReview: SupplierReview
  quality: QualityFindings
  /** Rejection categories, PSS and SS combined, most certificates first. */
  reasons: Array<{ category: string; count: number }>
  keyFigures: KeyFigures
  byOrigin: GroupPerf[]
  byLab: GroupPerf[]
  /** Ordered by certificates, most first. */
  labsCovered: string[]
  originsCovered: string[]
  sankey: SankeyLayoutResult
  sankeyColumns: string[]
  showSankey: boolean
}

export interface AnnualPerformanceReportData {
  client: { id: string; name: string; logo_url: string | null; is_roaster: boolean; sankey_type: ClientSankeyType }
  period: { year: number; issued_at: string }
  origin: string | null         // dominant origin
  agg: AnnualAggregates
}

const importerOf = (r: AnnualRow) => r.importer_name?.trim() || null
const roasterOf = (r: AnnualRow) => r.roaster_name?.trim() || null

function distinctCount(rows: AnnualRow[], key: (r: AnnualRow) => string | null): number {
  return new Set(rows.map(key).filter((v): v is string => !!v)).size
}

function monthlySection(rows: AnnualRow[], basis: MonthlyBasis, chainGrids: boolean): MonthlySection {
  return {
    totals: buildMonthTotals(rows, basis),
    byShipper: buildMonthlyGrid(rows, shipperOf, basis),
    bySeller: buildMonthlyGrid(rows, sellerOf, basis),
    byImporter: chainGrids && distinctCount(rows, importerOf) > 1 ? buildMonthlyGrid(rows, importerOf, basis) : null,
    byRoaster: chainGrids && distinctCount(rows, roasterOf) > 1 ? buildMonthlyGrid(rows, roasterOf, basis) : null,
  }
}

function containersBy(rows: AnnualRow[], key: (r: AnnualRow) => string | null): Record<string, number> {
  const groups = new Map<string, AnnualRow[]>()
  for (const r of rows) {
    const k = key(r)
    if (!k) continue
    const list = groups.get(k) ?? []
    list.push(r)
    groups.set(k, list)
  }
  const out: Record<string, number> = {}
  for (const [k, list] of groups) out[k] = countContainers(list)
  return out
}

function mergeReasons(a: BucketAggregate, b: BucketAggregate): Array<{ category: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of [...a.rejectionReasons, ...b.rejectionReasons]) m.set(r.category, (m.get(r.category) ?? 0) + r.count)
  return [...m.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((x, y) => y.count - x.count || x.category.localeCompare(y.category, 'en'))
}

function shares(groups: GroupPerf[], total: number): Array<{ name: string; pct: number }> {
  return groups
    .filter(g => g.name !== 'Unspecified')
    .slice(0, 3)
    .map(g => ({ name: g.name, pct: pct(g.approvedCount + g.rejectedCount, total) }))
}

function computeKeyFigures(
  pss: BucketAggregate,
  ss: BucketAggregate,
  months: { pss: MonthlySection; ss: MonthlySection },
  reasons: Array<{ category: string; count: number }>,
  byOrigin: GroupPerf[],
  byLab: GroupPerf[],
  certificates: number,
): KeyFigures {
  const hasSs = ss.totals.evaluated > 0
  let busiestMonth: KeyFigures['busiestMonth'] = null
  if (hasSs) {
    const m = [...months.ss.totals].sort((a, b) => b.approved - a.approved || a.month - b.month)[0]
    if (m && m.approved > 0) busiestMonth = { label: m.label, value: m.approved, unit: 'bags' }
  } else {
    const m = [...months.pss.totals].sort((a, b) => b.total - a.total || a.month - b.month)[0]
    if (m && m.total > 0) busiestMonth = { label: m.label, value: m.total, unit: 'certificates' }
  }
  // Never PSS + SS tonnage together: a lot's PSS and SS are the same coffee.
  const pool = hasSs ? ss.byExporter : pss.byExporter
  const largest = [...pool].sort((a, b) => b.approvedMt - a.approvedMt || a.name.localeCompare(b.name, 'en'))[0]
  const ssBags = ss.totals.bagsApproved + ss.totals.bagsRejected
  return {
    pss: pss.totals.evaluated > 0
      ? { rate: pct(pss.totals.approved, pss.totals.evaluated), approved: pss.totals.approved, total: pss.totals.evaluated }
      : null,
    ss: hasSs ? { rate: pct(ss.totals.bagsApproved, ssBags), approvedBags: ss.totals.bagsApproved, totalBags: ssBags } : null,
    busiestMonth,
    topReason: reasons[0] ? { category: reasons[0].category, certificates: reasons[0].count } : null,
    largestShipper: largest && largest.approvedMt > 0 ? { name: largest.name, mt: largest.approvedMt } : null,
    origins: shares(byOrigin, certificates),
    labs: shares(byLab, certificates),
  }
}

export function buildAnnualAggregates(
  pssRows: AnnualRow[],
  ssRows: AnnualRow[],
  opts: { sankeyType: ClientSankeyType; clientDisplay: string; quality: QualityFindings },
): AnnualAggregates {
  const pss = aggregateBucket(pssRows, 'count')
  const ss = aggregateBucket(ssRows, 'bags')
  const allRows = [...pssRows, ...ssRows]

  const bySellerPss = groupBy(pssRows, sellerOf)
  const bySellerSs = groupBy(ssRows, sellerOf)
  const byOrigin = groupBy(allRows, r => (r as AnnualRow).origin?.trim() || 'Unspecified')
  const byLab = groupBy(allRows, r => (r as AnnualRow).laboratory_name?.trim() || 'Unspecified')

  const ssApproved = ssRows.filter(r => !r.is_rejected)
  const chainGrids = opts.sankeyType === 'final_buyer'
  const months = { pss: monthlySection(pssRows, 'count', chainGrids), ss: monthlySection(ssRows, 'bags', chainGrids) }
  const reasons = mergeReasons(pss, ss)

  // Whole-year flow from approved SS rows (trade-relevant), charcoal bands.
  const { layout: sankey, columns: sankeyColumns } = buildSankey(
    ssApproved, scorecardFromExporters(ss.byExporter), opts.sankeyType, opts.clientDisplay,
    ANNUAL_SANKEY_HEIGHT, { width: ANNUAL_SANKEY_WIDTH, palette: CHARCOAL_SANKEY_PALETTE, linkOpacity: 0.18 },
  )

  return {
    glance: computeGlance(pssRows, ssRows),
    pss, ss,
    bySellerPss, bySellerSs,
    ssContainers: {
      byShipper: containersBy(ssApproved, shipperOf),
      bySeller: containersBy(ssApproved, sellerOf),
      total: countContainers(ssApproved),
    },
    months,
    supplierReview: buildSupplierReview(pssRows, ssRows, reasons.map(r => r.category)),
    quality: opts.quality,
    reasons,
    keyFigures: computeKeyFigures(pss, ss, months, reasons, byOrigin, byLab, allRows.length),
    byOrigin, byLab,
    labsCovered: byLab.map(g => g.name).filter(n => n !== 'Unspecified'),
    originsCovered: byOrigin.map(g => g.name).filter(n => n !== 'Unspecified'),
    sankey, sankeyColumns,
    // buildSankey skips rows without a quantity, so a >2 column chain can
    // still have no links — gate on the links too, as the period reports do.
    showSankey: sankeyColumns.length > 2 && sankey.links.length > 0,
  }
}

/** One reference per lab unit (graded lot), named by its earliest certificate. */
export function labUnitRefs(rows: AnnualRow[]): LabUnitRef[] {
  const out: LabUnitRef[] = []
  const seen = new Set<string>()
  const ordered = [...rows].sort(
    (a, b) => a.approval_date.localeCompare(b.approval_date, 'en') || a.certificate_number.localeCompare(b.certificate_number, 'en'),
  )
  for (const r of ordered) {
    if (seen.has(r.lab_unit_id)) continue
    seen.add(r.lab_unit_id)
    out.push({ labUnitId: r.lab_unit_id, shipper: r.exporter_name ?? null, certificateNumber: r.certificate_number })
  }
  return out
}

async function loadQuality(
  db: SupabaseClient,
  admin: SupabaseClient<any> | null,
  rows: AnnualRow[],
): Promise<QualityFindings> {
  try {
    return buildQualityFindings(await fetchLabUnitQuality(db as SupabaseClient<any>, admin, labUnitRefs(rows)))
  } catch (err) {
    console.error('[annual-data] quality findings failed:', err)
    return emptyQualityFindings()
  }
}

export async function getAnnualPerformanceReportData(
  supabase: SupabaseClient,
  params: { clientId: string; year: number },
  opts: { admin?: SupabaseClient<any> | null } = {},
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
  const clientIsRoaster = isRoasterCompany(companyTypes)
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = resolveClientSankeyType(companyTypes, tradingRoles)

  // Lab id → display label (small table; load once). Cross-lab is intentional —
  // we DO NOT filter by laboratory_id. Label by city: `name` is often the legal
  // entity (e.g. "WOLTHERS & ASSOCIATES CORRETORA DE MERCADORIAS LTDA" for
  // Santos), which must never reach the cover, key figures or methodology.
  const { data: labs } = await (supabase as any).from('laboratories').select('id, name, city')
  const labNameById = new Map<string, string>(
    (labs ?? []).map((l: any) => [l.id, (l.city as string | null | undefined)?.trim() || l.name]),
  )

  // Same query shape as the Bi-Weekly, plus sample.laboratory_id. NO lab/origin
  // filter, and no group filter either: a sample covering several contracts is
  // several sample rows (a lab unit plus siblings) with one certificate each,
  // and every certificate counts, same as on the certificates page.
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id, deleted_at, lab_source_sample_id, sample_type, client_id, origin, micro_origin, laboratory_id, container_nr, ico_number,
        bag_count, bag_weight_kg, bag_type, equivalent_60kg_bags, bags_quantity_mt, container_count,
        buyer_contract_nr, importer_is_qc_client,
        exporter:companies!samples_exporter_id_fkey(name,fantasy_name),
        seller:companies!samples_seller_id_fkey(name,fantasy_name),
        importer:companies!samples_importer_id_fkey(name,fantasy_name),
        roaster:companies!samples_roaster_id_fkey(name,fantasy_name)
      )
    `)
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (certsError) {
    console.error('[annual-data] certificates query failed:', certsError)
    return null
  }

  // Filter by QC client on the certificate's own sample row — a sibling can be
  // sold to a different client than its lab unit.
  const forClient = ((certs || []) as any[])
    .filter(c => c.sample && !c.sample.deleted_at)
    .filter(c => reportRowClientId(c as RawCertSampleRow) === clientId)
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

  const quality = await loadQuality(supabase, opts.admin ?? null, [...pssRows, ...ssRows])
  const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType, clientDisplay, quality })

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { year, issued_at: new Date().toISOString() },
    origin,
    agg,
  }
}
