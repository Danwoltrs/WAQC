/**
 * Report data fetchers.
 *
 * Aggregates certificate + sample data for the client-facing reports. Each
 * function returns a normalized shape that report PDF templates can render
 * without doing additional queries.
 */

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
 * Shared by the performance + annual fetchers so their field mapping can't drift.
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

const SANKEY_WIDTH = 720
const SANKEY_HEIGHT = 260

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
