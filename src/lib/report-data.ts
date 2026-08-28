/**
 * Report data fetchers.
 *
 * Aggregates certificate + sample data for the client-facing reports. Each
 * function returns a normalized shape that report PDF templates can render
 * without doing additional queries.
 */

import { resolveDefectCounts } from '@/lib/quality-resolvers'
import {
  computeSankeyLayout,
  type SankeyInputNode,
  type SankeyInputLink,
  type SankeyLayoutResult,
} from '@/lib/charts/sankey-layout'

/** Which Sankey shape to render. Decided from the client's client_types. */
export type ClientSankeyType = 'final_buyer' | 'roaster' | 'importer'

/** True when the company is typed as a roaster (case-insensitive). */
export function isRoasterCompany(companyTypes: unknown[] | null | undefined): boolean {
  return (companyTypes ?? []).some(
    (t) => typeof t === 'string' && t.trim().toLowerCase() === 'roaster',
  )
}

/**
 * Which Sankey shape a QC client gets.
 *
 * ROASTER WINS OVER BUYER. Ahold Delhaize Coffee Company carries both
 * `company_types: ['roaster']` and `trading_roles: ['buyer']`; when `buyer` won,
 * the flow collapsed to a 2-column Shipper → Seller chain, which the
 * `columns.length > 2` gate then hid — so the report shipped with no supply-chain
 * flow at all. Roaster-first yields Shipper → Seller → Importer.
 */
export function resolveClientSankeyType(
  companyTypes: unknown[] | null | undefined,
  tradingRoles: unknown[] | null | undefined,
): ClientSankeyType {
  if (isRoasterCompany(companyTypes)) return 'roaster'
  const isBuyer = (tradingRoles ?? []).some(
    (r) => typeof r === 'string' && r.trim().toLowerCase() === 'buyer',
  )
  return isBuyer ? 'importer' : 'final_buyer'
}

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
  /** Bulk lots only: containers, for the "N containers in bulk" wording. */
  container_count?: number | null
  is_rejected: boolean
}

export interface RejectionReasonRow {
  /** Human-readable category — normalized from compliance_violations text
   *  (e.g. `Total defects`, `Cupping taints`, `Finish below min`). */
  category: string
  count: number
}

/** A named green-grading defect (e.g. "Black beans") with its total raw count
 *  summed across the rejected samples in a bucket, plus the worst single
 *  certificate's count — a total alone cannot say whether 1,235 unripe beans
 *  were one catastrophic container or spread thinly across eighteen. */
export interface NamedDefectCount {
  name: string
  count: number
  /** Highest count this defect reached on any ONE rejected certificate. */
  max: number
}

/** A named cupping defect with its kind and how many rejected samples showed it. */
export interface NamedCuppingDefect {
  name: string
  kind: 'fault' | 'taint'
  count: number
}

/**
 * How heavy the GRADED defect count ran on the rejected lots — primary +
 * secondary, the number a quality spec is actually written against ("max 8
 * defects"), as opposed to the raw bean tallies in `greenDefects`.
 */
export interface DefectLoad {
  /** Mean total defects across graded certificates, rounded. */
  avg: number
  /** Worst single graded certificate. */
  max: number
  /** How many rejected certificates carried a green grading at all. */
  graded: number
}

/** The dig-in rejection breakdown for a bucket: which specific green defects and
 *  cupping faults/taints drove the rejections, each ranked by magnitude. */
export interface DefectBreakdown {
  greenDefects: NamedDefectCount[]
  cuppingDefects: NamedCuppingDefect[]
  /** null when no rejected certificate was green-graded. */
  defectLoad: DefectLoad | null
}

export interface SupplierScorecardRow {
  exporter_name: string
  total: number
  approved: number
  rejected: number
  approval_rate: number  // 0-100
  bags: number
}

/**
 * Shape of a `certificates ⋈ samples` row from the report query.
 *
 * Each certificate points at the ONE sample row it belongs to — a lab unit or
 * a contract sibling (sample-group.ts) — and that row carries every commercial
 * field the report prints. `lab_source_sample_id` is selected only to reach
 * the lab unit's grading; it never changes what a row reports.
 */
export interface RawCertSampleRow {
  certificate_number: string
  created_at: string
  is_rejected: boolean | null
  compliance_violations: string[] | null
  sample: {
    id: string
    /** NULL = lab unit (cupped and graded); set = sibling whose lab data lives on that row. */
    lab_source_sample_id?: string | null
    sample_type: string | null
    client_id: string | null
    origin: string | null
    micro_origin: string | null
    container_nr: string | null
    ico_number: string | null
    bag_count: number | null
    bag_weight_kg: number | null
    bag_type?: string | null
    equivalent_60kg_bags: number | null
    bags_quantity_mt: number | null
    /** Bulk lots: containers entered at intake. Passed through for the quantity wording. */
    container_count?: number | null
    buyer_contract_nr: string | null
    /** Intake flag: the importer IS the QC client, so `importer` may be unset. */
    importer_is_qc_client?: boolean | null
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
 * The heaviest thing that is genuinely a bag: a 1,000 kg big bag. Anything
 * above it is a container's net weight sitting in the bag_weight_kg column.
 */
const MAX_REAL_BAG_KG = 1000

/**
 * Best-available total weight → 60kg-equivalent bags + metric tons.
 *
 * Fixes the big-bag bug: a 20 x 1000kg contract must report ~333 bags,
 * not 20. Priority: stored 60kg equivalent → physical count x actual
 * bag weight (handles 59kg and 1000kg bags) → stored MT → assume 60kg.
 *
 * Bulk never takes the count x weight branch. A bulk row stores bag_count as
 * the 60kg EQUIVALENT and bag_weight_kg as the container's whole net weight
 * (21,600 kg) — see `computeBagQuantities` — so multiplying them counts the
 * coffee 360x over, turning one container into 7,776 MT. Rows written before
 * bag_type reached the report are caught by the weight sanity check instead.
 */
export function computeBagsAndMt(s: {
  bag_count: number | null
  bag_weight_kg: number | null
  equivalent_60kg_bags: number | null
  bags_quantity_mt: number | null
  bag_type?: string | null
}): { bags: number | null; mt: number | null } {
  const isBulk = s.bag_type === 'bulk' || (s.bag_weight_kg ?? 0) > MAX_REAL_BAG_KG
  const kg =
    s.equivalent_60kg_bags != null ? s.equivalent_60kg_bags * 60
    : !isBulk && s.bag_count != null && s.bag_weight_kg != null ? s.bag_count * s.bag_weight_kg
    : s.bags_quantity_mt != null ? s.bags_quantity_mt * 1000
    : s.bag_count != null ? s.bag_count * 60
    : null
  if (kg == null) return { bags: null, mt: null }
  return { bags: Math.round(kg / 60), mt: Math.round(kg / 100) / 10 }
}

/**
 * The QC client a certificate belongs to: the one on its own sample row. A
 * sibling sold to a different QC client than its lab unit carries that client
 * itself, so there is nothing to look past.
 */
export function reportRowClientId(c: RawCertSampleRow): string | null {
  return c.sample?.client_id ?? null
}

/**
 * Map one joined `certificates ⋈ samples` row to a `WeeklySSCertRow`.
 * Shared by the performance + annual fetchers so their field mapping can't drift.
 *
 * Every field comes from the certificate's own sample row. A sample covering
 * several contracts is several rows — one lab unit plus siblings pointing at
 * it (sample-group.ts) — each owning its buyer side, refs, container and
 * quantity. Quantities across a group are therefore additive, never a
 * subdivision of one another, and a blank on a sibling stays blank: the copy
 * rule filled it from the lab unit when the row was built, so there is no
 * second table left to fall back to at report time.
 */
export function mapCertRowToReportRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): WeeklySSCertRow {
  const s = c.sample!
  const { bags, mt } = computeBagsAndMt(s)
  // No importer FK: the intake flag says the importer IS the QC client — the
  // certificate prints the client on the same flag (certificate-data.ts) — and
  // a roaster-type client is the de-facto importer regardless (Ahold style).
  const importerName =
    companyDisplayName(s.importer)
    ?? (s.importer_is_qc_client ? ctx.clientDisplay : null)
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
    container_count: s.container_count ?? null,
    is_rejected: !!c.is_rejected,
  }
}

const SANKEY_WIDTH = 720
const SANKEY_HEIGHT = 260
/**
 * Height used when the flow shares Page A with the bar charts instead of
 * getting Page B to itself — which is what happens for a bucket with no
 * rejections, where the reasons block and half the chart grid drop out.
 */
export const SANKEY_HEIGHT_COMPACT = 145

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
 * Extract named green-grading defects with raw counts. Accepts EITHER the
 * `green_bean_data.defects` blob or the whole `green_bean_data` column (it
 * unwraps a nested `.defects` object) — every canonical reader nests defects
 * under `green_bean_data.defects`, so the fetcher can hand over either shape.
 * Handles the formats produced across the grading / cert / quality editors:
 *   - counts:       `{ counts: { Black: 2, Sour: 1 }, primary, secondary }`
 *   - defect_list:  `{ defect_list: [{ name, count }], primary, secondary }`
 *   - bare array:   `[{ name, count }]`
 *   - split arrays: `{ primary: [{ name, count }], secondary: [{ name, count }] }`
 * Bare numeric `primary`/`secondary` aggregates carry no names and are ignored
 * (they surface only as the aggregate `rejectionReasons` fallback).
 */
// Per-SAMPLE counts, so there is no cross-certificate `max` to report here —
// that is `aggregateDefectBreakdown`'s job once it has seen every sample.
export function extractGreenDefects(defectsData: unknown): Array<{ name: string; count: number }> {
  if (!defectsData || typeof defectsData !== 'object') return []
  // Unwrap a `green_bean_data` wrapper down to its `.defects` blob.
  let src: unknown = defectsData
  if (
    !Array.isArray(src) &&
    (src as Record<string, unknown>).defects &&
    typeof (src as Record<string, unknown>).defects === 'object'
  ) {
    src = (src as Record<string, unknown>).defects
  }

  const out = new Map<string, number>()
  const add = (name: unknown, rawCount: unknown) => {
    if (typeof name !== 'string') return
    const trimmed = name.trim()
    if (!trimmed) return
    const c = typeof rawCount === 'number' ? rawCount : Number(rawCount)
    if (!Number.isFinite(c) || c <= 0) return
    out.set(trimmed, (out.get(trimmed) ?? 0) + c)
  }

  if (Array.isArray(src)) {
    for (const it of src as Array<{ name?: unknown; count?: unknown }>) {
      if (it) add(it.name, it.count)
    }
  } else {
    const d = src as Record<string, unknown>
    if (d.counts && typeof d.counts === 'object') {
      for (const [name, c] of Object.entries(d.counts as Record<string, unknown>)) add(name, c)
    }
    if (Array.isArray(d.defect_list)) {
      for (const it of d.defect_list as Array<{ name?: unknown; count?: unknown }>) {
        if (it) add(it.name, it.count)
      }
    }
    for (const key of ['primary', 'secondary'] as const) {
      if (Array.isArray(d[key])) {
        for (const it of d[key] as Array<{ name?: unknown; count?: unknown }>) {
          if (it) add(it.name, it.count)
        }
      }
    }
  }

  return [...out.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Extract named cupping defects from a `quality_assessments.resolved_defects`
 * blob (`{ taints: [{ name }], faults: [{ name }] }`). One entry per named
 * occurrence; callers aggregate across samples.
 */
export function extractCuppingDefects(resolved: unknown): NamedCuppingDefect[] {
  if (!resolved || typeof resolved !== 'object') return []
  const r = resolved as { taints?: unknown; faults?: unknown }
  const out: NamedCuppingDefect[] = []
  const collect = (arr: unknown, kind: 'fault' | 'taint') => {
    if (!Array.isArray(arr)) return
    for (const it of arr as Array<string | { name?: unknown }>) {
      const name = typeof it === 'string' ? it : typeof it?.name === 'string' ? it.name : null
      if (name && name.trim()) out.push({ name: name.trim(), kind, count: 1 })
    }
  }
  collect(r.faults, 'fault')
  collect(r.taints, 'taint')
  return out
}

/**
 * Aggregate the per-sample green + cupping defect data of a bucket's rejected
 * samples into ranked "which defects drove rejections" lists.
 *   - greenDefects: summed raw counts by defect name (bean magnitude)
 *   - cuppingDefects: how many rejected samples showed each named taint/fault
 */
export function aggregateDefectBreakdown(
  samples: Array<{ green: unknown; resolved: unknown }>,
): DefectBreakdown {
  const green = new Map<string, { count: number; max: number }>()
  const cup = new Map<string, NamedCuppingDefect>()
  // Graded defect totals, averaged over the certificates that HAVE a grading —
  // a lot rejected on cupping alone has none, and scoring it zero would drag
  // the average below what any real lot showed.
  const loads: number[] = []
  for (const s of samples) {
    // Same tolerance extractGreenDefects applies: the counts normally sit under
    // a `.defects` wrapper, but a bare summary blob keeps them at the top level.
    const g = s.green as { defects?: unknown } | null
    const counts = resolveDefectCounts(g?.defects ?? g)
    if (counts && counts.total > 0) loads.push(counts.total)
    for (const g of extractGreenDefects(s.green)) {
      // extractGreenDefects already sums within one sample, so g.count is this
      // certificate's whole burden for that defect and can be compared as-is.
      const cur = green.get(g.name) ?? { count: 0, max: 0 }
      cur.count += g.count
      cur.max = Math.max(cur.max, g.count)
      green.set(g.name, cur)
    }
    for (const c of extractCuppingDefects(s.resolved)) {
      const key = `${c.kind}::${c.name}`
      const cur = cup.get(key) ?? { name: c.name, kind: c.kind, count: 0 }
      cur.count += 1
      cup.set(key, cur)
    }
  }
  return {
    greenDefects: [...green.entries()]
      .map(([name, v]) => ({ name, count: v.count, max: v.max }))
      .sort((a, b) => b.count - a.count),
    cuppingDefects: [...cup.values()].sort((a, b) => b.count - a.count),
    defectLoad: loads.length > 0
      ? {
          avg: Math.round(loads.reduce((a, b) => a + b, 0) / loads.length),
          max: Math.max(...loads),
          graded: loads.length,
        }
      : null,
  }
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
  height: number = SANKEY_HEIGHT,
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
    height,
  })

  return { layout, columns }
}
