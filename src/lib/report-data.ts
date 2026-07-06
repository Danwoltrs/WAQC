/**
 * Report data fetchers.
 *
 * Aggregates certificate + sample data for the client-facing reports. Each
 * function returns a normalized shape that report PDF templates can render
 * without doing additional queries.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  computeSankeyLayout,
  type SankeyInputNode,
  type SankeyInputLink,
  type SankeyLayoutResult,
} from '@/lib/charts/sankey-layout'

/** Which Sankey shape to render. Decided from the client's client_types. */
export type ClientSankeyType = 'final_buyer' | 'roaster' | 'importer'

export interface WeeklySSCertRow {
  approval_date: string  // ISO date (display formatter in PDF picks d/m/yyyy)
  certificate_number: string
  exporter_name: string | null    // = "Shipper" in the redesigned chart
  seller_name: string | null      // separate seller (often a trading desk)
  importer_name: string | null
  importer_contract_nr: string | null
  roaster_name: string | null     // "Roaster Destination" column
  container_nr: string | null
  ico_marks: string | null         // ICO mark numbers from sample
  bags: number | null
  mt: number | null               // metric tons, 1 decimal (same source as bags)
  is_rejected: boolean
}

export interface RejectionReasonRow {
  /** Human-readable category — normalized from compliance_violations text
   *  (e.g. `Total defects`, `Cupping taints`, `Finish below min`). */
  category: string
  count: number
}

export interface SupplierScorecardRow {
  exporter_name: string
  total: number
  approved: number
  rejected: number
  approval_rate: number  // 0-100
  bags: number
}

/** Shape of a `certificates ⋈ samples` row from the report query. */
export interface RawCertSampleRow {
  certificate_number: string
  created_at: string
  is_rejected: boolean | null
  compliance_violations: string[] | null
  sample: {
    id: string
    sample_type: string | null
    client_id: string | null
    origin: string | null
    micro_origin: string | null
    container_nr: string | null
    ico_number: string | null
    bag_count: number | null
    bag_weight_kg: number | null
    equivalent_60kg_bags: number | null
    bags_quantity_mt: number | null
    buyer_contract_nr: string | null
    exporter: { name: string | null; fantasy_name: string | null } | null
    seller: { name: string | null; fantasy_name: string | null } | null
    importer: { name: string | null; fantasy_name: string | null } | null
    roaster: { name: string | null; fantasy_name: string | null } | null
  } | null
}

/** Prefer a company's fantasy (trade) name, falling back to its legal name. */
function companyDisplayName(c: { name: string | null; fantasy_name: string | null } | null | undefined): string | null {
  if (!c) return null
  const fantasy = c.fantasy_name?.trim()
  return fantasy || c.name || null
}

/**
 * Best-available total weight → 60kg-equivalent bags + metric tons.
 *
 * Fixes the big-bag bug: a 20 x 1000kg contract must report ~333 bags,
 * not 20. Priority: stored 60kg equivalent → physical count x actual
 * bag weight (handles 59kg and 1000kg bags) → stored MT → assume 60kg.
 */
export function computeBagsAndMt(s: {
  bag_count: number | null
  bag_weight_kg: number | null
  equivalent_60kg_bags: number | null
  bags_quantity_mt: number | null
}): { bags: number | null; mt: number | null } {
  const kg =
    s.equivalent_60kg_bags != null ? s.equivalent_60kg_bags * 60
    : s.bag_count != null && s.bag_weight_kg != null ? s.bag_count * s.bag_weight_kg
    : s.bags_quantity_mt != null ? s.bags_quantity_mt * 1000
    : s.bag_count != null ? s.bag_count * 60
    : null
  if (kg == null) return { bags: null, mt: null }
  return { bags: Math.round(kg / 60), mt: Math.round(kg / 100) / 10 }
}

/**
 * Map one joined `certificates ⋈ samples` row to a `WeeklySSCertRow`.
 * Shared by the Weekly + Bi-Weekly fetchers so their field mapping can't drift.
 */
export function mapCertRowToReportRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): WeeklySSCertRow {
  const s = c.sample!
  const { bags, mt } = computeBagsAndMt({
    bag_count: s.bag_count ?? null,
    bag_weight_kg: s.bag_weight_kg ?? null,
    equivalent_60kg_bags: s.equivalent_60kg_bags ?? null,
    bags_quantity_mt: s.bags_quantity_mt ?? null,
  })
  // For roaster clients with no importer FK, substitute the client name —
  // the roaster IS the de-facto importer in that case (Ahold style).
  const importerName = companyDisplayName(s.importer)
    ?? (ctx.sankeyType === 'roaster' ? ctx.clientDisplay : null)
  return {
    approval_date: c.created_at,
    certificate_number: c.certificate_number,
    exporter_name: companyDisplayName(s.exporter),
    seller_name: companyDisplayName(s.seller),
    importer_name: importerName,
    importer_contract_nr: s.buyer_contract_nr ?? null,
    roaster_name: companyDisplayName(s.roaster) ?? 'Unsold',
    container_nr: s.container_nr ?? null,
    ico_marks: s.ico_number ?? null,
    bags,
    mt,
    is_rejected: !!c.is_rejected,
  }
}

export interface WeeklySSCertReportData {
  client: {
    id: string
    name: string
    logo_url: string | null
    /** True when the QC client itself has a roaster client_type — header
     *  still hides the legacy Roasters block when true. */
    is_roaster: boolean
    /** Which Sankey shape to draw. */
    sankey_type: ClientSankeyType
  }
  period: {
    start_date: string
    end_date: string
    issued_at: string
  }
  origin: string | null
  totals: {
    certificate_count: number       // approved only (legacy semantics)
    bag_count: number               // approved only
    roaster_count: number
    importer_count: number
    evaluated_count: number         // approved + rejected
    rejected_count: number
    approval_rate: number           // 0-100 — approved / evaluated
    exporter_count: number
  }
  roaster_breakdown: Array<{ name: string; bags: number }>
  importer_breakdown: Array<{ name: string; bags: number }>
  rejection_reasons: RejectionReasonRow[]
  supplier_scorecard: SupplierScorecardRow[]
  /** Pre-computed Sankey layout. Column count depends on sankey_type:
   *    final_buyer  → 4 (Shipper / Seller / Importer / Roaster)
   *    roaster      → 3 (Shipper / Seller / Importer)
   *    importer     → 2 (Shipper / Seller) */
  sankey: SankeyLayoutResult
  sankey_columns: string[]
  rows: WeeklySSCertRow[]
}

const SANKEY_WIDTH = 720
const SANKEY_HEIGHT = 260

/**
 * Fetch the data for a Weekly SS Certificates report.
 *
 * Pulls **all** SS certificates created in the window for this client —
 * approved and rejected. The PDF template uses both: approved drives
 * the cert appendix + totals, rejected drives the "why things failed"
 * panel and the supplier-scorecard approval rate.
 */
export async function getWeeklySSCertReportData(
  supabase: SupabaseClient,
  params: { clientId: string; startDate: string; endDate: string }
): Promise<WeeklySSCertReportData | null> {
  const { clientId, startDate, endDate } = params

  const { data: client, error: clientError } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, logo_url, company_types, trading_roles')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[report-data] client not found:', clientId, clientError)
    return null
  }
  // Post-consolidation: roaster lives in company_types, "importer" maps to trading_roles 'buyer'.
  const companyTypes: string[] = client.company_types ?? []
  const tradingRoles: string[] = client.trading_roles ?? []
  const clientIsRoaster = companyTypes.some(
    t => typeof t === 'string' && t.toLowerCase() === 'roaster',
  )
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name

  // Sankey shape is purely a function of client_types — see ClientSankeyType.
  // Order matters: importer wins over roaster (an importer-roaster still
  // shows the 2-col chain since they're a single-step destination), and
  // roaster wins over final_buyer (an Ahold-style buyer-roaster gets the
  // 3-col chain without a redundant trailing roaster column).
  const sankeyType: ClientSankeyType = clientIsImporter
    ? 'importer'
    : clientIsRoaster
      ? 'roaster'
      : 'final_buyer'

  // Pull every cert created in the window (approved + rejected) so we
  // can compute approval rate, rejection reasons, and supplier perf.
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      id,
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id,
        sample_type,
        client_id,
        origin,
        container_nr,
        ico_number,
        bag_count,
        bag_weight_kg,
        equivalent_60kg_bags,
        bags_quantity_mt,
        buyer_contract_nr,
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
    console.error('[report-data] certificates query failed:', certsError)
    return null
  }

  // Only keep SS certs for this client. Approval state stays mixed —
  // each downstream aggregation handles it.
  const filtered = (certs || []).filter((c: any) => {
    const s = c.sample
    if (!s) return false
    if (s.client_id !== clientId) return false
    if (s.sample_type !== 'ss') return false
    return true
  })

  const rows: WeeklySSCertRow[] = filtered.map((c: any) =>
    mapCertRowToReportRow(c as RawCertSampleRow, { sankeyType, clientDisplay }),
  )

  const approvedRows = rows.filter(r => !r.is_rejected)
  const rejectedRows = rows.filter(r => r.is_rejected)

  // Header aggregates — match legacy report semantics (approved only).
  const bagCount = approvedRows.reduce((sum, r) => sum + (r.bags ?? 0), 0)
  const roasterMap = new Map<string, number>()
  const importerMap = new Map<string, number>()
  const exporterSet = new Set<string>()
  const originCounts = new Map<string, number>()

  for (const r of approvedRows) {
    const roasterKey = r.roaster_name || 'Unsold'
    roasterMap.set(roasterKey, (roasterMap.get(roasterKey) ?? 0) + (r.bags ?? 0))
    if (r.importer_name) {
      importerMap.set(r.importer_name, (importerMap.get(r.importer_name) ?? 0) + (r.bags ?? 0))
    }
    if (r.exporter_name) exporterSet.add(r.exporter_name)
  }
  for (const c of filtered as any[]) {
    const origin = c.sample?.origin
    if (origin) originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1)
  }
  const dominantOrigin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const evaluatedCount = rows.length
  const rejectedCount = rejectedRows.length
  const approvalRate = evaluatedCount > 0
    ? Math.round(((evaluatedCount - rejectedCount) / evaluatedCount) * 100)
    : 0

  // Rejection-reason aggregation. `compliance_violations` is a JSONB
  // array of human-readable sentences. Bucket each into a normalized
  // category so the bar chart shows recurring themes.
  const reasonCounts = new Map<string, number>()
  for (const c of filtered as any[]) {
    if (!c.is_rejected) continue
    const violations = (c.compliance_violations as string[] | null) ?? []
    for (const v of violations) {
      const cat = categorizeViolation(v)
      reasonCounts.set(cat, (reasonCounts.get(cat) ?? 0) + 1)
    }
  }
  const rejection_reasons: RejectionReasonRow[] = [...reasonCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  // Supplier scorecard — count approved / rejected per exporter (shipper).
  const supplierAgg = new Map<string, {
    total: number
    approved: number
    rejected: number
    bags: number
  }>()
  for (const r of rows) {
    if (!r.exporter_name) continue
    const cur = supplierAgg.get(r.exporter_name) ?? {
      total: 0, approved: 0, rejected: 0, bags: 0,
    }
    cur.total += 1
    if (r.is_rejected) cur.rejected += 1
    else cur.approved += 1
    cur.bags += r.bags ?? 0
    supplierAgg.set(r.exporter_name, cur)
  }
  const supplier_scorecard: SupplierScorecardRow[] = [...supplierAgg.entries()]
    .map(([exporter_name, agg]) => ({
      exporter_name,
      total: agg.total,
      approved: agg.approved,
      rejected: agg.rejected,
      approval_rate: agg.total > 0 ? Math.round((agg.approved / agg.total) * 100) : 0,
      bags: agg.bags,
    }))
    .sort((a, b) => {
      if (b.approval_rate !== a.approval_rate) return b.approval_rate - a.approval_rate
      return b.total - a.total
    })

  // Sankey: shape varies by client type.
  const { layout: sankey, columns: sankey_columns } = buildSankey(
    approvedRows,
    supplier_scorecard,
    sankeyType,
    clientDisplay,
  )

  return {
    client: {
      id: client.id,
      name: clientDisplay,
      logo_url: (client as any).logo_url ?? null,
      is_roaster: clientIsRoaster,
      sankey_type: sankeyType,
    },
    period: {
      start_date: startDate,
      end_date: endDate,
      issued_at: new Date().toISOString(),
    },
    origin: dominantOrigin,
    totals: {
      certificate_count: approvedRows.length,
      bag_count: bagCount,
      roaster_count: roasterMap.size,
      importer_count: importerMap.size,
      evaluated_count: evaluatedCount,
      rejected_count: rejectedCount,
      approval_rate: approvalRate,
      exporter_count: exporterSet.size,
    },
    roaster_breakdown: [...roasterMap.entries()]
      .map(([name, bags]) => ({ name, bags }))
      .sort((a, b) => b.bags - a.bags),
    importer_breakdown: [...importerMap.entries()]
      .map(([name, bags]) => ({ name, bags }))
      .sort((a, b) => b.bags - a.bags),
    rejection_reasons,
    supplier_scorecard,
    sankey,
    sankey_columns,
    rows: approvedRows,
  }
}

/**
 * Bucket a compliance-violation sentence into a short category label.
 *
 * Categories are tuned to the strings actually produced by
 * `src/lib/compliance.ts` — see that file for the source patterns.
 * Anything that doesn't match falls into `Other`; with the patterns
 * below, `Other` should be rare in practice.
 */
export function categorizeViolation(v: string): string {
  if (typeof v !== 'string') return 'Other'

  // Named taints / faults: `Taint "Hard": Intensity 5 exceeds maximum (3)`
  const taint = v.match(/^Taint\s+"([^"]+)"/i)
  if (taint) return `Taint — ${taint[1]}`
  const fault = v.match(/^Fault\s+"([^"]+)"/i)
  if (fault) return `Fault — ${fault[1]}`

  // Aggregate-defect categories from green grading.
  if (/^Total defects:/i.test(v)) return 'Total defects'
  if (/^Secondary defects:/i.test(v)) return 'Secondary defects'
  if (/^Primary defects:/i.test(v)) return 'Primary defects'

  // Screen size constraints — keep the screen size suffix so the user
  // can see which sieve failed (e.g. "Screen Pan", "Screen 18").
  const screen = v.match(/^(Screen\s+[A-Za-z0-9]+):/i)
  if (screen) return screen[1]

  // Moisture + quaker count.
  if (/^Moisture:/i.test(v)) return 'Moisture'
  if (/^Quakers:/i.test(v)) return 'Quakers'

  // Cupping rule violations — all variants of taints/faults limits.
  if (/^Cupping\s+taints/i.test(v)) return 'Cupping taints'
  if (/^Cupping\s+faults/i.test(v)) return 'Cupping faults'
  if (/^Cupping\s+defects/i.test(v)) return 'Cupping defects'
  if (/^Zero tolerance/i.test(v)) return 'Zero tolerance defects'

  // Cup-score attribute limits: "Finish: 2.50 is below minimum (3)"
  const cupAttr = v.match(/^([A-Za-z][A-Za-z ]*?):\s+[\d.]+\s+is\s+(below minimum|above maximum)/i)
  if (cupAttr) {
    const attr = cupAttr[1].trim()
    const dir = cupAttr[2].toLowerCase().includes('below') ? 'below min' : 'above max'
    return `${attr} ${dir}`
  }

  return 'Other'
}

/**
 * Build the Sankey layout + column labels for the given client type.
 *
 *   final_buyer (Dunkin)         Shipper → Seller → Importer → Roaster
 *   roaster (Ahold)              Shipper → Seller → Importer
 *   importer (Blaser)            Shipper → Seller
 *
 * Approval rates per shipper (column 0) come from the supplier
 * scorecard; downstream columns are tinted neutral since their rate
 * is a function of upstream feeders.
 */
export function buildSankey(
  approvedRows: WeeklySSCertRow[],
  scorecard: SupplierScorecardRow[],
  type: ClientSankeyType,
  clientName: string,
): { layout: SankeyLayoutResult; columns: string[] } {
  const columns =
    type === 'final_buyer' ? ['Shipper', 'Seller', 'Importer', 'Roaster']
    : type === 'roaster' ? ['Shipper', 'Seller', 'Importer']
    : ['Shipper', 'Seller']

  const exporterRate = new Map<string, number>()
  for (const s of scorecard) exporterRate.set(s.exporter_name, s.approval_rate)

  const nodes = new Map<string, SankeyInputNode>()
  const linkAgg = new Map<string, { source: string; target: string; value: number }>()

  const addLink = (src: string, tgt: string, value: number) => {
    const key = `${src}|${tgt}`
    linkAgg.set(key, {
      source: src, target: tgt,
      value: (linkAgg.get(key)?.value ?? 0) + value,
    })
  }

  for (const r of approvedRows) {
    const bags = r.bags ?? 0
    if (bags <= 0) continue

    const shipper = (r.exporter_name?.trim() || 'Unknown shipper')
    const seller = (r.seller_name?.trim() || shipper) // fall back to shipper when seller not set
    const importer = (r.importer_name?.trim() || (type === 'roaster' ? clientName : 'Unknown importer'))
    const roaster = (r.roaster_name?.trim() || 'Unsold')

    const sh = `shipper:${shipper}`
    const se = `seller:${seller}`
    const im = `importer:${importer}`
    const ro = `roaster:${roaster}`

    if (!nodes.has(sh)) nodes.set(sh, { id: sh, label: shipper, column: 0, approvalRate: exporterRate.get(shipper) })
    if (!nodes.has(se)) nodes.set(se, { id: se, label: seller, column: 1 })

    addLink(sh, se, bags)

    if (type === 'importer') {
      // 2-col chain — stop after shipper → seller.
      continue
    }

    if (!nodes.has(im)) nodes.set(im, { id: im, label: importer, column: 2 })
    addLink(se, im, bags)

    if (type === 'final_buyer') {
      if (!nodes.has(ro)) nodes.set(ro, { id: ro, label: roaster, column: 3 })
      addLink(im, ro, bags)
    }
  }

  const inputNodes = [...nodes.values()]
  const inputLinks: SankeyInputLink[] = [...linkAgg.values()].map(l => ({
    source: l.source,
    target: l.target,
    value: l.value,
  }))

  const layout = computeSankeyLayout(inputNodes, inputLinks, {
    width: SANKEY_WIDTH,
    height: SANKEY_HEIGHT,
  })

  return { layout, columns }
}
