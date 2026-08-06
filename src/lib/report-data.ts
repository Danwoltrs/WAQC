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

/** A named green-grading defect (e.g. "Black beans") with its total raw count
 *  summed across the rejected samples in a bucket. */
export interface NamedDefectCount {
  name: string
  count: number
}

/** A named cupping defect with its kind and how many rejected samples showed it. */
export interface NamedCuppingDefect {
  name: string
  kind: 'fault' | 'taint'
  count: number
}

/** The dig-in rejection breakdown for a bucket: which specific green defects and
 *  cupping faults/taints drove the rejections, each ranked by magnitude. */
export interface DefectBreakdown {
  greenDefects: NamedDefectCount[]
  cuppingDefects: NamedCuppingDefect[]
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
 * The `sample_contracts` columns a report needs when a certificate belongs to a
 * commercial split. Each split is its own contract — own buyer side, own
 * container/ICO and its OWN quantity — so its certificate must report those,
 * exactly like `certificate-data.ts` renders it.
 */
export interface SubContractOverrideRow {
  id: string
  /** A split may be sold to a different QC client than the mother sample. */
  client_id: string | null
  container_nr: string | null
  ico_number: string | null
  buyer_contract_nr: string | null
  bag_count: number | null
  bag_weight_kg: number | null
  equivalent_60kg_bags: number | null
  bags_quantity_mt: number | null
  importer_is_qc_client: boolean | null
  importer: { name: string | null; fantasy_name: string | null } | null
  roaster: { name: string | null; fantasy_name: string | null } | null
}

/** Shape of a `certificates ⋈ samples` row from the report query. */
export interface RawCertSampleRow {
  certificate_number: string
  created_at: string
  is_rejected: boolean | null
  compliance_violations: string[] | null
  /** Set when this certificate belongs to a commercial split; null = mother. */
  sample_contract_id?: string | null
  /** The split row, attached by the fetcher via `fetchSubContractOverrides`. */
  sub?: SubContractOverrideRow | null
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
 * The QC client a certificate belongs to. A split may be sold to a different QC
 * client than its mother sample, so its own `client_id` wins when present.
 */
export function reportRowClientId(c: RawCertSampleRow): string | null {
  return c.sub?.client_id ?? c.sample?.client_id ?? null
}

/**
 * Map one joined `certificates ⋈ samples` row to a `WeeklySSCertRow`.
 * Shared by the performance + annual fetchers so their field mapping can't drift.
 *
 * When the row is a sub-contract certificate (`c.sub` set), the split's own
 * buyer side / refs / quantity replace the mother's — the mother sample is
 * contract #1 of the shipment and each split is its own contract, so their
 * quantities are additive, never a subdivision of one another. The supply side
 * (exporter, seller) and the sample's origin stay the mother's: a split has no
 * shipper of its own.
 */
export function mapCertRowToReportRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): WeeklySSCertRow {
  const s = c.sample!
  const sub = c.sub ?? null
  // A split reports ITS OWN quantity and never falls back to the mother's —
  // inheriting it would count the same coffee once per split.
  const qty = sub
    ? {
        bag_count: sub.bag_count ?? null,
        bag_weight_kg: sub.bag_weight_kg ?? null,
        equivalent_60kg_bags: sub.equivalent_60kg_bags ?? null,
        bags_quantity_mt: sub.bags_quantity_mt ?? null,
      }
    : {
        bag_count: s.bag_count ?? null,
        bag_weight_kg: s.bag_weight_kg ?? null,
        equivalent_60kg_bags: s.equivalent_60kg_bags ?? null,
        bags_quantity_mt: s.bags_quantity_mt ?? null,
      }
  const { bags, mt } = computeBagsAndMt(qty)
  // For roaster clients with no importer FK, substitute the client name —
  // the roaster IS the de-facto importer in that case (Ahold style). A split
  // that flags `importer_is_qc_client` names the client the same way.
  const importerName = sub
    ? companyDisplayName(sub.importer)
        ?? (sub.importer_is_qc_client ? ctx.clientDisplay : null)
        ?? (ctx.sankeyType === 'roaster' ? ctx.clientDisplay : null)
    : companyDisplayName(s.importer) ?? (ctx.sankeyType === 'roaster' ? ctx.clientDisplay : null)
  return {
    approval_date: c.created_at,
    certificate_number: c.certificate_number,
    exporter_name: companyDisplayName(s.exporter),
    seller_name: companyDisplayName(s.seller),
    importer_name: importerName,
    importer_contract_nr: (sub ? sub.buyer_contract_nr : s.buyer_contract_nr) ?? null,
    roaster_name: (sub ? companyDisplayName(sub.roaster) : companyDisplayName(s.roaster)) ?? 'Unsold',
    container_nr: (sub?.container_nr ?? s.container_nr) ?? null,
    ico_marks: (sub?.ico_number ?? s.ico_number) ?? null,
    bags,
    mt,
    is_rejected: !!c.is_rejected,
  }
}

/**
 * Load the `sample_contracts` rows behind a batch of certificates, keyed by id.
 * Callers attach the result onto each raw row's `sub` before mapping.
 */
export async function fetchSubContractOverrides(
  supabase: { from: (t: string) => any },
  certs: Array<{ sample_contract_id?: string | null }>,
): Promise<Map<string, SubContractOverrideRow>> {
  const out = new Map<string, SubContractOverrideRow>()
  const ids = [...new Set(certs.map(c => c.sample_contract_id).filter((x): x is string => !!x))]
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('sample_contracts')
    .select(`
      id, client_id, container_nr, ico_number, buyer_contract_nr,
      bag_count, bag_weight_kg, equivalent_60kg_bags, bags_quantity_mt,
      importer_is_qc_client,
      importer:companies!sample_contracts_importer_id_fkey(name,fantasy_name),
      roaster:companies!sample_contracts_roaster_id_fkey(name,fantasy_name)
    `)
    .in('id', ids)

  if (error) {
    // Non-fatal: without the split rows those certificates would report the
    // mother's figures, so drop them from the report instead of lying.
    console.error('[report-data] sample_contracts query failed:', error)
    return out
  }
  for (const r of (data ?? []) as SubContractOverrideRow[]) out.set(r.id, r)
  return out
}

/**
 * Attach each certificate's split row. Sub-contract certificates whose split
 * row didn't load are dropped — reporting them would repeat the mother's
 * importer and quantity under a different certificate number.
 */
export function attachSubContracts<T extends RawCertSampleRow>(
  certs: T[],
  subById: Map<string, SubContractOverrideRow>,
): T[] {
  const out: T[] = []
  for (const c of certs) {
    if (!c.sample_contract_id) {
      out.push(c)
      continue
    }
    const sub = subById.get(c.sample_contract_id)
    if (!sub) continue
    out.push({ ...c, sub })
  }
  return out
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
export function extractGreenDefects(defectsData: unknown): NamedDefectCount[] {
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
  const green = new Map<string, number>()
  const cup = new Map<string, NamedCuppingDefect>()
  for (const s of samples) {
    for (const g of extractGreenDefects(s.green)) {
      green.set(g.name, (green.get(g.name) ?? 0) + g.count)
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
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    cuppingDefects: [...cup.values()].sort((a, b) => b.count - a.count),
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
