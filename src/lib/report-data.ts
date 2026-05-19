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

export interface WeeklySSCertRow {
  approval_date: string  // ISO date (display formatter in PDF picks d/m/yyyy)
  certificate_number: string
  exporter_name: string | null
  importer_name: string | null
  importer_contract_nr: string | null
  roaster_name: string | null     // "Roaster Destination" column
  container_nr: string | null
  ico_marks: string | null         // ICO mark numbers from sample
  bags: number | null
  is_rejected: boolean
}

export interface RejectionReasonRow {
  /** Human-readable category, normalized from compliance_violations text
   *  (e.g. `Taint - Hard`, `Aroma below min`, `Fault - Phenol`). */
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

export interface WeeklySSCertReportData {
  client: {
    id: string
    name: string
    logo_url: string | null
    /** True when the QC client itself has a roaster client_type. The
     *  legacy "Roasters" header block hides when this is true. */
    is_roaster: boolean
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
    // New: full-pipeline counts including rejections
    evaluated_count: number         // approved + rejected
    rejected_count: number
    approval_rate: number           // 0-100 — approved / evaluated
    exporter_count: number
  }
  roaster_breakdown: Array<{ name: string; bags: number }>
  importer_breakdown: Array<{ name: string; bags: number }>
  // New aggregates for the redesigned report
  rejection_reasons: RejectionReasonRow[]
  supplier_scorecard: SupplierScorecardRow[]
  /** Pre-computed Sankey layout (Exporter → Importer → Roaster).
   *  Sized for an A4 landscape main column (~720 × 240 px). */
  sankey: SankeyLayoutResult
  rows: WeeklySSCertRow[]
}

const SANKEY_WIDTH = 720
const SANKEY_HEIGHT = 240

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

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, company, fantasy_name, logo_url, client_types')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[report-data] client not found:', clientId, clientError)
    return null
  }
  const clientTypes = ((client as any).client_types as string[] | null) ?? []
  const clientIsRoaster = clientTypes.some(
    t => typeof t === 'string' && t.toLowerCase().includes('roaster'),
  )

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
        equivalent_60kg_bags,
        bags_quantity_mt,
        buyer_contract_nr,
        exporter:exporters!samples_exporter_id_fkey(name),
        importer:importers!samples_importer_id_fkey(name),
        roaster:roasters!samples_roaster_id_fkey(name)
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

  const rows: WeeklySSCertRow[] = filtered.map((c: any) => {
    const s = c.sample
    const bagsRaw = s.bag_count ?? s.equivalent_60kg_bags ?? null
    const bags = typeof bagsRaw === 'number' ? Math.round(bagsRaw) : null
    return {
      approval_date: c.created_at,
      certificate_number: c.certificate_number,
      exporter_name: s.exporter?.name ?? null,
      importer_name: s.importer?.name ?? null,
      importer_contract_nr: s.buyer_contract_nr ?? null,
      roaster_name: s.roaster?.name ?? 'Unsold',
      container_nr: s.container_nr ?? null,
      ico_marks: s.ico_number ?? null,
      bags,
      is_rejected: !!c.is_rejected,
    }
  })

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
  // category so the bar chart shows recurring themes instead of
  // unique full-text strings.
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

  // Supplier scorecard — count approved / rejected per exporter.
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

  // Sankey: build (Exporter → Importer) and (Importer → Roaster) links
  // weighted by bags. Use approved rows for volume — rejected coffee
  // doesn't actually flow through the chain in this period.
  const sankey = buildSupplyChainSankey(approvedRows, supplier_scorecard)

  return {
    client: {
      id: client.id,
      name: (client as any).fantasy_name || (client as any).company || client.name,
      logo_url: (client as any).logo_url ?? null,
      is_roaster: clientIsRoaster,
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
    rows: approvedRows,
  }
}

/**
 * Bucket a compliance-violation sentence into a short category label.
 *
 * The strings come from src/lib/compliance.ts in three known shapes:
 *   • `Taint "Hard": Intensity 5 exceeds maximum (3)`
 *   • `Fault "Phenol": Intensity 4 exceeds maximum (2)`
 *   • `Aroma: 5.50 is below minimum (6.00)` / `… is above maximum (…)`
 * Anything that doesn't match those shapes falls into `Other`.
 */
function categorizeViolation(v: string): string {
  if (typeof v !== 'string') return 'Other'
  const taint = v.match(/^Taint\s+"([^"]+)"/i)
  if (taint) return `Taint — ${taint[1]}`
  const fault = v.match(/^Fault\s+"([^"]+)"/i)
  if (fault) return `Fault — ${fault[1]}`
  const cup = v.match(/^([A-Za-z ]+):\s+[\d.]+\s+is\s+(below minimum|above maximum)/i)
  if (cup) {
    const attr = cup[1].trim()
    const dir = cup[2].toLowerCase().includes('below') ? 'below min' : 'above max'
    return `${attr} ${dir}`
  }
  return 'Other'
}

/**
 * Build the supply-chain Sankey layout. Two-stage flow:
 *   Exporter → Importer → Roaster
 * weighted by bags. Approval-rate per node is taken from the supplier
 * scorecard for exporter nodes; importer/roaster nodes are tinted by
 * their weighted approval (computed from the same rows).
 */
function buildSupplyChainSankey(
  approvedRows: WeeklySSCertRow[],
  scorecard: SupplierScorecardRow[],
): SankeyLayoutResult {
  const nodes = new Map<string, SankeyInputNode>()
  const linkAgg = new Map<string, { source: string; target: string; value: number }>()

  // Per-node approval-rate computation needs the full (approved+rejected)
  // counts. Exporter rates come from the scorecard; importer/roaster
  // rates we don't have a precomputed source for, so we set them
  // neutral. (Could compute weighted average across exporters feeding
  // each importer, but the visual signal is dominated by exporter
  // tinting since edges inherit source color.)
  const exporterRate = new Map<string, number>()
  for (const s of scorecard) exporterRate.set(s.exporter_name, s.approval_rate)

  for (const r of approvedRows) {
    const exporter = r.exporter_name?.trim() || 'Unknown exporter'
    const importer = r.importer_name?.trim() || 'Unknown importer'
    const roaster = r.roaster_name?.trim() || 'Unsold'
    const bags = r.bags ?? 0
    if (bags <= 0) continue

    const ex = `exporter:${exporter}`
    const im = `importer:${importer}`
    const ro = `roaster:${roaster}`

    if (!nodes.has(ex)) {
      nodes.set(ex, {
        id: ex, label: exporter, column: 0,
        approvalRate: exporterRate.get(exporter),
      })
    }
    if (!nodes.has(im)) nodes.set(im, { id: im, label: importer, column: 1 })
    if (!nodes.has(ro)) nodes.set(ro, { id: ro, label: roaster, column: 2 })

    const k1 = `${ex}|${im}`
    const k2 = `${im}|${ro}`
    linkAgg.set(k1, {
      source: ex, target: im,
      value: (linkAgg.get(k1)?.value ?? 0) + bags,
    })
    linkAgg.set(k2, {
      source: im, target: ro,
      value: (linkAgg.get(k2)?.value ?? 0) + bags,
    })
  }

  const inputNodes = [...nodes.values()]
  const inputLinks: SankeyInputLink[] = [...linkAgg.values()].map(l => ({
    source: l.source,
    target: l.target,
    value: l.value,
  }))

  return computeSankeyLayout(inputNodes, inputLinks, {
    width: SANKEY_WIDTH,
    height: SANKEY_HEIGHT,
  })
}
