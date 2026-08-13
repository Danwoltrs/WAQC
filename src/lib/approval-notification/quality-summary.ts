/**
 * Quality-summary email body (buyer + seller).
 *
 * Both sides get the same per-sample quality table — screen distribution,
 * defect count, green grading (Type) and cup result. The differences:
 *   - Buyers keep their certificate PDFs attached; sellers do not (they don't
 *     pay for certificates).
 *   - The table is grouped by the OTHER party: a seller's email groups by QC
 *     client (one seller supplies several buyers); a buyer's email groups by
 *     seller (one buyer buys from several sellers).
 *
 * This module holds the pure builders (text + HTML table) plus a single I/O
 * helper that assembles each sample's summary from the database. Type/Cup are
 * derived "vs spec": an approved sample passed both stages; a rejected sample is
 * run through the shared compliance engine and its violations are split into the
 * green stage (defects/screen/moisture/quakers) and the cup stage (attributes/
 * taints/faults). The result never contradicts the stored decision.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/lib/signatures/render'
import { evaluateQualityCompliance } from '@/lib/compliance'
import { resolveSupplyRefs } from '@/lib/certificate-supply-refs'
import { fetchSysContractRefsBatch, type SysContractRefs } from '@/lib/contract-ref-sync'
import type { ApprovalDecision } from './types'

export type GroupBy = 'qcClient' | 'seller'

/**
 * Identity of ONE certificate. A sample with commercial splits has several
 * certificates — the mother (`sample_contract_id` NULL) plus one per
 * `sample_contracts` row — and every one of them must be listed and attached.
 * The mother's key is the bare sample id so callers that only ever deal with
 * mother certificates (and prior `email_messages` metadata, which never carried
 * a sub-contract id) keep working unchanged.
 */
export const certUnitKey = (sampleId: string, sampleContractId?: string | null): string =>
  sampleContractId ? `${sampleId}:${sampleContractId}` : sampleId

export interface QualityScreenRow {
  label: string // "Scr. 18"
  pct: number // 0–100, rounded to a whole number
}

export interface QualitySampleSummary {
  sampleId: string
  /** The `sample_contracts` split this certificate belongs to; null = mother. */
  sampleContractId: string | null
  qcClientName: string | null
  sellerName: string | null
  exporterSampleNumber: string | null
  sellerContractNr: string | null
  wolthersContractNr: string | null
  buyerContractNr: string | null
  certificateNumber: string | null // official cert number (BR-…/26); fallback Sample ref
  containerNr: string | null
  icoNumber: string | null
  sampleType: string | null // pss | ss | type | specialty | stocklot
  /** Coffee quality/grade name — sample override, else the client quality, else
   *  the template. Same precedence the certificate PDF renders. */
  qualityName: string | null
  screen: QualityScreenRow[]
  defects: number | null // weighted total (primary + secondary), 1 decimal
  typeOk: boolean | null // green grading vs spec; null = undetermined
  cupOk: boolean | null // cupping vs spec; null = undetermined
  decision: ApprovalDecision
  reason: string | null // surfaced for rejections only
  sellerComment: string | null // approval note — rendered ONLY in seller emails
}

/** Render options. `sellerComment` is true only for seller emails (the note is
 *  never shown to buyers). */
export interface QualitySummaryOpts {
  sellerComment?: boolean
  /** Which side the email is for — selects the reference columns:
   *  buyer → Sample + Buyer ref; seller → Sample + Wolthers + Seller ref.
   *  Defaults to seller. */
  audience?: 'buyer' | 'seller'
}

export interface QualitySummaryGroup {
  heading: string
  samples: QualitySampleSummary[]
}

// ---- Pure helpers ----------------------------------------------------------

/**
 * Screen sizes are stored as raw grams per sieve. Normalise to percentages
 * (works whether the stored values are grams or already percentages — dividing
 * by the total cancels the unit). Sieves render "Scr. N" sorted high to low.
 *
 * The screen number is extracted from any stored key format ("16", "Screen 16",
 * "screen_16"); percentages are computed against the full total (incl. the pan)
 * so each sieve keeps its true proportion. The below-smallest-screen / pan
 * bucket is intentionally OMITTED from the email.
 */
/** Max screen lines per sample in the email table (see `collapseScreenRows`). */
export const MAX_SCREEN_LINES = 3

/**
 * Condense a long sieve list to at most three lines. A seven-sieve Grinders
 * distribution printed one line per sieve made the table tower over the rest of
 * the row; the two smallest sieves are what the contract is actually judged on,
 * so those stay explicit and everything coarser is summed into a single
 * "Scr. N up" line:
 *
 *   18 6% · 17 12% · 16 12% · 15 13% · 14 14% · 13 28% · 12 13%
 *   →  Scr. 14 up 57% · Scr. 13 28% · Scr. 12 13%
 *
 * Input must be sorted coarse→fine with raw (unrounded) percentages. Left alone
 * when there are already ≤3 lines, or when any label carries no sieve number
 * (legacy free-text keys) — there'd be no sound number to label the "up" line.
 */
export function collapseScreenRows<T extends QualityScreenRow & { sortKey: number }>(rows: T[]): QualityScreenRow[] {
  if (rows.length <= MAX_SCREEN_LINES) return rows
  if (rows.some((r) => !Number.isFinite(r.sortKey))) return rows
  const keep = rows.slice(-(MAX_SCREEN_LINES - 1)) // the two finest sieves
  const collapsed = rows.slice(0, rows.length - (MAX_SCREEN_LINES - 1))
  const smallest = collapsed[collapsed.length - 1]
  return [
    {
      label: `${smallest.label} up`,
      pct: collapsed.reduce((sum, r) => sum + r.pct, 0),
    },
    ...keep,
  ]
}

export function screenRowsFromGrams(screenSizes: Record<string, number> | null | undefined): QualityScreenRow[] {
  if (!screenSizes || typeof screenSizes !== 'object') return []
  const entries = Object.entries(screenSizes).filter(([, v]) => typeof v === 'number' && v >= 0)
  const total = entries.reduce((sum, [, v]) => sum + (v || 0), 0)
  if (total <= 0) return []
  const rows: Array<QualityScreenRow & { sortKey: number }> = []
  for (const [key, grams] of entries) {
    const trimmed = String(key).trim()
    const lower = trimmed.toLowerCase()
    const isBelow =
      lower === 'b' ||
      lower.includes('below') ||
      lower.includes('pan') ||
      lower.includes('fundo') ||
      lower.startsWith('<')
    if (isBelow) continue // pan / below-smallest-screen bucket is not shown in the email
    const numMatch = trimmed.match(/\d+(\.\d+)?/)
    rows.push({
      label: numMatch ? `Scr. ${numMatch[0]}` : trimmed,
      // Keep the raw share here; rounding happens after any collapsing so the
      // aggregated line is rounded once, not summed from rounded parts.
      pct: ((grams || 0) / total) * 100,
      sortKey: numMatch ? Number(numMatch[0]) : -Infinity,
    })
  }
  rows.sort((a, b) => b.sortKey - a.sortKey)
  return collapseScreenRows(rows).map(({ label, pct }) => ({ label, pct: Math.round(pct) }))
}

/**
 * Total defect count (weighted) for the "Defects" column. Prefers the
 * pre-calculated primary/secondary totals written by the grading page; falls
 * back to summing raw counts. Returns null when no defect data is present.
 */
export function totalDefects(greenBeanData: unknown): number | null {
  if (!greenBeanData || typeof greenBeanData !== 'object') return null
  const defects = (greenBeanData as Record<string, unknown>).defects
  if (!defects || typeof defects !== 'object') return null
  const d = defects as Record<string, unknown>
  if (typeof d.primary === 'number' && typeof d.secondary === 'number') {
    return Math.round((d.primary + d.secondary) * 10) / 10
  }
  if (d.counts && typeof d.counts === 'object') {
    const sum = Object.values(d.counts as Record<string, unknown>).reduce(
      (acc: number, c) => acc + (typeof c === 'number' ? c : 0),
      0,
    )
    return sum > 0 ? Math.round(sum * 10) / 10 : null
  }
  return null
}

// Violations from the green grading stage carry one of these prefixes; anything
// else (cupping attributes, taints, faults) belongs to the cup stage.
const GREEN_VIOLATION = /^(Primary defects|Secondary defects|Total defects|Screen |Moisture|Quaker)/i

/**
 * Derive Type (green) and Cup pass/fail from a sample's decision and computed
 * violations. Approved → both OK (never contradict the lab's decision). Rejected
 * → split violations into the two stages; when there are no computed violations
 * (a manual rejection), fall back to which comment field carries the reason.
 */
export function classifyStageResults(input: {
  decision: ApprovalDecision
  violations: string[]
  hasGradingComment: boolean
  hasCuppingComment: boolean
}): { typeOk: boolean | null; cupOk: boolean | null } {
  if (input.decision === 'approved') return { typeOk: true, cupOk: true }
  const green = input.violations.filter((v) => GREEN_VIOLATION.test(v))
  const cup = input.violations.filter((v) => !GREEN_VIOLATION.test(v))
  if (green.length > 0 || cup.length > 0) {
    return { typeOk: green.length === 0, cupOk: cup.length === 0 }
  }
  if (input.hasGradingComment || input.hasCuppingComment) {
    return { typeOk: !input.hasGradingComment, cupOk: !input.hasCuppingComment }
  }
  return { typeOk: null, cupOk: null }
}

interface DefectEntry {
  name?: string
  intensity?: number
}
export interface ResolvedDefects {
  taints?: DefectEntry[]
  faults?: DefectEntry[]
}

// Compliance lines that only COUNT taints/faults ("Cupping faults: 1 exceeds…",
// "Zero tolerance: …") — dropped when we already list the named defects, so the
// reason doesn't say both "Hard (riado)" and "Cupping faults: 1".
const TF_COUNT_VIOLATION = /^(Cupping taints|Cupping faults|Zero tolerance|Combined)/i

// Green-grading defect-count lines, e.g. "Total defects: 45 exceeds limit (30)".
const DEFECT_COUNT_VIOLATION = /^(Primary|Secondary|Total) defects: (\d+) exceeds limit \((\d+)\)$/

/**
 * Collapse the verbose, often-redundant defect-count violations into a terse
 * "Defects: N (max M)". With no primary defects the engine emits Secondary AND
 * Total with the same number — printed twice it overflows the cell. We keep the
 * Total breach when present (it subsumes the sub-categories), else one line per
 * distinct count/limit. Non-defect violations pass through untouched, in place.
 */
export function compactDefectViolations(violations: string[]): string[] {
  const parsed = violations
    .map((v) => v.match(DEFECT_COUNT_VIOLATION))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ count: Number(m[2]), limit: Number(m[3]), isTotal: m[1] === 'Total' }))
  if (parsed.length === 0) return violations

  const total = parsed.find((d) => d.isTotal)
  const seen = new Set<string>()
  const chosen = (total ? [total] : parsed).filter((d) => {
    const key = `${d.count}/${d.limit}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const defectLines = chosen.map((d) => `Defects: ${d.count} (max ${d.limit})`)

  let emitted = false
  const out: string[] = []
  for (const v of violations) {
    if (DEFECT_COUNT_VIOLATION.test(v)) {
      if (!emitted) {
        out.push(...defectLines)
        emitted = true
      }
      continue
    }
    out.push(v)
  }
  return out
}

/**
 * Human-readable "why it failed" for a rejected sample. Combines, in order:
 *   1. the named cup faults/taints from the authoritative resolved set, shown
 *      concisely as `name (intensity)` — e.g. `Hard (riado) (3)`;
 *   2. the compliance engine's spec violations (attribute below min, defects over
 *      limit, screen, moisture, quakers) — minus the generic taint/fault counts
 *      already named in (1);
 *   3. any free-text grading/cupping note the lab wrote.
 * Returns null when there's nothing concrete to show.
 */
export function buildRejectionReason(input: {
  violations: string[]
  resolvedDefects: ResolvedDefects | null
  cuppingComment: string
  gradingComment: string
}): string | null {
  const lines: string[] = []
  const named = (list?: DefectEntry[]): string[] =>
    (list ?? [])
      .map((d) => {
        const n = d?.name?.trim()
        if (!n) return null
        return typeof d.intensity === 'number' ? `${n} (${d.intensity})` : n
      })
      .filter((s): s is string => !!s)

  // Named cup defects (faults + taints) shown concisely, e.g. "Hard (riado) (3)".
  const defects = [...named(input.resolvedDefects?.faults), ...named(input.resolvedDefects?.taints)]
  if (defects.length) lines.push(defects.join(', '))

  const haveNamed = defects.length > 0
  for (const v of compactDefectViolations(input.violations)) {
    if (haveNamed && TF_COUNT_VIOLATION.test(v)) continue
    if (v.trim()) lines.push(v.trim())
  }

  const note = [input.cuppingComment, input.gradingComment].filter(Boolean).join('\n')
  if (note.trim()) lines.push(note.trim())

  const joined = lines.join('\n').trim()
  return joined || null
}

/** The `sample_contracts` columns a split certificate's summary row draws on. */
export interface SubContractRefs {
  id: string
  contract_id?: string | null
  wolthers_contract_nr?: string | null
  buyer_contract_nr?: string | null
  container_nr?: string | null
  ico_number?: string | null
  supplier_contract_nr?: string | null
  seller_contract_nr?: string | null
  shipper_contract_nr?: string | null
  exporter_sample_number?: string | null
}

const nonBlank = (v: string | null | undefined): string | null =>
  v != null && String(v).trim() !== '' ? String(v) : null

/**
 * The quality name shown to buyers and sellers. `samples.quality_name` is a
 * per-sample override (commonly used for type samples); otherwise the client
 * quality's custom name, otherwise the underlying template name.
 */
export function resolveQualityName(
  sampleQualityName: string | null | undefined,
  specCustomName: string | null | undefined,
  templateName: string | null | undefined,
): string | null {
  return nonBlank(sampleQualityName) ?? nonBlank(specCustomName) ?? nonBlank(templateName)
}

/**
 * Summary row for a sub-contract certificate. A split is its own commercial
 * contract — own Wolthers number, buyer reference, container, ICO — but it is
 * the SAME physical coffee, so the lab result (screen, defects, Type, Cup,
 * decision, rejection reason) is inherited from the mother sample.
 *
 * Reference precedence mirrors the certificate PDF exactly (certificate-data.ts),
 * so the email table can never contradict the attachment: the split's own sys
 * contract wins, then the split's stored value, then — for container / ICO /
 * Wolthers number only — the mother's. The buyer reference deliberately does NOT
 * fall back to the mother's: printing the mother's buyer ref on a split would
 * name the wrong contract.
 */
export function buildSubContractSummary(
  mother: QualitySampleSummary,
  sub: SubContractRefs,
  certificateNumber: string | null,
  qcClientName: string | null,
  sysRefs?: SysContractRefs | null,
): QualitySampleSummary {
  const supply = resolveSupplyRefs({
    sample: {
      seller_contract_nr: mother.sellerContractNr,
      exporter_sample_number: mother.exporterSampleNumber,
    },
    contract: sub,
  })
  return {
    ...mother,
    sampleContractId: sub.id,
    certificateNumber: certificateNumber ?? mother.certificateNumber,
    qcClientName: qcClientName ?? mother.qcClientName,
    wolthersContractNr: nonBlank(sub.wolthers_contract_nr) ?? mother.wolthersContractNr,
    buyerContractNr: nonBlank(sysRefs?.buyer_reference) ?? nonBlank(sub.buyer_contract_nr),
    containerNr: nonBlank(sub.container_nr) ?? mother.containerNr,
    icoNumber: nonBlank(sub.ico_number) ?? mother.icoNumber,
    sellerContractNr: nonBlank(sysRefs?.seller_reference) ?? supply.sellerContract ?? mother.sellerContractNr,
    exporterSampleNumber: supply.exporterSampleNumber ?? mother.exporterSampleNumber,
  }
}

/** Group samples by the chosen party (QC client or seller), ordered by heading;
 *  within a group, approvals first then by reference. */
export function groupQualitySamples(list: QualitySampleSummary[], by: GroupBy): QualitySummaryGroup[] {
  const headingOf = (s: QualitySampleSummary) =>
    (by === 'seller' ? s.sellerName : s.qcClientName) ?? 'Other'
  const refOf = (s: QualitySampleSummary) =>
    s.exporterSampleNumber ?? s.sellerContractNr ?? s.wolthersContractNr ?? ''
  const byHeading = new Map<string, QualitySampleSummary[]>()
  for (const s of list) {
    const key = headingOf(s)
    const arr = byHeading.get(key) ?? []
    arr.push(s)
    byHeading.set(key, arr)
  }
  const groups: QualitySummaryGroup[] = [...byHeading.entries()].map(([heading, samples]) => ({
    heading,
    samples: samples.slice().sort((a, b) => {
      if (a.decision !== b.decision) return a.decision === 'approved' ? -1 : 1
      // Certificate number breaks the tie so a mother and its splits (which
      // share every other reference) keep a stable, ascending order.
      return (
        refOf(a).localeCompare(refOf(b)) ||
        String(a.certificateNumber ?? '').localeCompare(String(b.certificateNumber ?? ''))
      )
    }),
  }))
  groups.sort((a, b) => a.heading.localeCompare(b.heading))
  return groups
}

const okText = (v: boolean | null): string => (v === null ? '—' : v ? 'OK' : 'FAIL')

interface RefColumn {
  header: string
  value: (s: QualitySampleSummary) => string
  /** Optional second line under the main value (e.g. the seller's sample ref). */
  sub?: (s: QualitySampleSummary) => string | null
}

/**
 * Reference columns shown before Screen, chosen by audience:
 *   buyer  → Sample + Buyer ref
 *   seller → Sample + Wolthers contract # + Seller ref
 * "Sample" is the seller/shipper's OWN sample reference (exporter_sample_number,
 * entered at intake), prefixed with the stage tag (PSS/SS/Stocklot). When no
 * seller reference was entered it falls back to the official certificate number
 * (BR-…/26). The internal Wolthers lab number (samples.tracking_number, e.g.
 * SAN-00101/26) is an internal identifier and is NEVER shown to buyers or sellers.
 * Buyers also don't see the Wolthers contract number.
 */
/** Short uppercase stage label (PSS / SS / Stocklot / …) from the sample type. */
function sampleTypeLabel(t: string | null): string | null {
  if (!t || !t.trim()) return null
  const key = t.trim().toLowerCase()
  const map: Record<string, string> = {
    pss: 'PSS',
    ss: 'SS',
    type: 'Type',
    specialty: 'Specialty',
    stocklot: 'Stocklot',
  }
  return map[key] ?? key.toUpperCase()
}

function refColumns(audience: 'buyer' | 'seller'): RefColumn[] {
  // "Sample" shows the stage tag (PSS/SS/Stocklot) + a reference. Preference:
  //   1. the seller/shipper's OWN sample reference (exporter_sample_number)
  //   2. else the official certificate number (BR-…/26)
  // The internal Wolthers lab number (tracking_number, SAN-…/26) is intentionally
  // never shown — it must not leak to buyers or sellers. Falls back to the stage
  // alone (then "—") when neither reference exists.
  const sample: RefColumn = {
    header: 'Sample',
    value: (s) => {
      const ref = s.exporterSampleNumber?.trim() || s.certificateNumber?.trim()
      const stage = sampleTypeLabel(s.sampleType)
      if (stage && ref) return `${stage} · ${ref}`
      return ref || stage || '—'
    },
  }
  // Container + ICO are shown to both sides (traceability). Container is the
  // per-shipment identifier; the ICO number rides as a labelled second line.
  const container: RefColumn = {
    header: 'Container',
    value: (s) => s.containerNr ?? '—',
    sub: (s) => (s.icoNumber && s.icoNumber.trim() ? `ICO ${s.icoNumber.trim()}` : null),
  }
  const audienceCols: RefColumn[] =
    audience === 'buyer'
      ? [sample, { header: 'Buyer Ref', value: (s) => s.buyerContractNr ?? '—' }]
      : [
          sample,
          { header: 'Wolthers', value: (s) => s.wolthersContractNr ?? '—' },
          { header: 'Seller Ref', value: (s) => s.sellerContractNr ?? '—' },
        ]
  // The coffee quality/grade the sample was assessed against — requested by
  // buyers, who otherwise cannot tell which spec the OK/FAIL verdicts are against.
  const quality: RefColumn = {
    header: 'Quality',
    value: (s) => s.qualityName ?? '—',
  }
  return [...audienceCols, quality, container]
}

/** Text form of a ref cell: "value (sub)" when a sub-reference is present. */
function refCellText(c: RefColumn, s: QualitySampleSummary): string {
  const sub = c.sub?.(s)
  return sub && sub.trim() ? `${c.value(s)} (${sub.trim()})` : c.value(s)
}

function screenCellText(s: QualitySampleSummary): string {
  if (!s.screen.length) return '—'
  return s.screen.map((r) => `${r.label} ${r.pct}%`).join('   ')
}

const showsSellerComment = (s: QualitySampleSummary, opts?: QualitySummaryOpts): boolean =>
  !!opts?.sellerComment && s.decision === 'approved' && !!s.sellerComment && s.sellerComment.trim().length > 0

/** Plain-text block layout — also the fallback body for text-only clients. */
export function buildQualitySummaryText(groups: QualitySummaryGroup[], opts?: QualitySummaryOpts): string {
  const refCols = refColumns(opts?.audience ?? 'seller')
  const out: string[] = []
  for (const group of groups) {
    out.push(group.heading, '─'.repeat(Math.min(group.heading.length, 40)))
    for (const s of group.samples) {
      const result = s.decision === 'rejected' ? 'REJECTED' : 'APPROVED'
      const refs = refCols.map((c) => `${c.header}: ${refCellText(c, s)}`).join('      ')
      out.push(`${refs}      ${result}`)
      if (s.screen.length) out.push(`   ${screenCellText(s)}`)
      const metrics = [
        s.defects != null ? `Defects: ${s.defects}` : null,
        `Type: ${okText(s.typeOk)}`,
        `Cup: ${okText(s.cupOk)}`,
      ]
        .filter(Boolean)
        .join('   ')
      out.push(`   ${metrics}`)
      if (s.decision === 'rejected' && s.reason && s.reason.trim()) {
        for (const line of s.reason.split('\n')) out.push(`   Reason: ${line.trim()}`)
      }
      if (showsSellerComment(s, opts)) {
        for (const line of s.sellerComment!.split('\n')) out.push(`   Note: ${line.trim()}`)
      }
      out.push('')
    }
  }
  return out.join('\n').replace(/\s+$/, '')
}

// ---- HTML table ------------------------------------------------------------

const TABLE_STYLE =
  'width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:10pt;color:#1a1a1a;margin:4px 0 18px;'
const TH_STYLE = 'text-align:left;padding:6px 8px;background:#556b2f;color:#ffffff;font-weight:600;font-size:9pt;'
const TD_STYLE = 'padding:6px 8px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:top;'
const SUB_STYLE = 'color:#6b7280;font-size:9pt;'

/** HTML form of a ref cell: main value with an optional muted second line. */
function refCellHtml(c: RefColumn, s: QualitySampleSummary): string {
  const sub = c.sub?.(s)
  const subHtml = sub && sub.trim() ? `<div style="${SUB_STYLE}">${escapeHtml(sub.trim())}</div>` : ''
  return `<div>${escapeHtml(c.value(s))}</div>${subHtml}`
}

function okHtml(v: boolean | null): string {
  if (v === null) return `<span style="color:#6b7280;">—</span>`
  const color = v ? '#22c55e' : '#ef4444'
  return `<span style="color:${color};font-weight:600;">${v ? 'OK' : 'FAIL'}</span>`
}

function screenCellHtml(s: QualitySampleSummary): string {
  if (!s.screen.length) return '—'
  return s.screen.map((r) => `${escapeHtml(r.label)} ${r.pct}%`).join('<br/>')
}

/** Styled HTML tables (one per group) for the actual email. */
export function buildQualitySummaryHtml(groups: QualitySummaryGroup[], opts?: QualitySummaryOpts): string {
  const refCols = refColumns(opts?.audience ?? 'seller')
  const colCount = refCols.length + 5 // ref columns + Screen, Def., Type, Cup, Result
  const blocks: string[] = []
  for (const group of groups) {
    const rows: string[] = []
    for (const s of group.samples) {
      // The rejection reason sits in the Result cell, directly under REJECTED.
      const reasonHtml =
        s.decision === 'rejected' && s.reason && s.reason.trim()
          ? `<div style="color:#b91c1c;font-style:italic;font-size:9pt;margin-top:3px;">${escapeHtml(s.reason).replace(/\n/g, '<br/>')}</div>`
          : ''
      const result =
        s.decision === 'rejected'
          ? `<span style="color:#ef4444;font-weight:600;">REJECTED</span>${reasonHtml}`
          : `<span style="color:#22c55e;font-weight:600;">APPROVED</span>`
      const refTds = refCols.map((c) => `<td style="${TD_STYLE}">${refCellHtml(c, s)}</td>`).join('')
      rows.push(
        `<tr>` +
          refTds +
          `<td style="${TD_STYLE}">${screenCellHtml(s)}</td>` +
          `<td style="${TD_STYLE}">${s.defects != null ? s.defects : '—'}</td>` +
          `<td style="${TD_STYLE}">${okHtml(s.typeOk)}</td>` +
          `<td style="${TD_STYLE}">${okHtml(s.cupOk)}</td>` +
          `<td style="${TD_STYLE}">${result}</td>` +
          `</tr>`,
      )
      if (showsSellerComment(s, opts)) {
        rows.push(
          `<tr><td colspan="${colCount}" style="padding:2px 8px 8px;border-bottom:1px solid rgba(0,0,0,0.08);color:#374151;font-size:9pt;">` +
            `Note: ${escapeHtml(s.sellerComment!).replace(/\n/g, '<br/>')}` +
            `</td></tr>`,
        )
      }
    }
    const headerThs =
      refCols.map((c) => `<th style="${TH_STYLE}">${escapeHtml(c.header)}</th>`).join('') +
      `<th style="${TH_STYLE}">Screen</th>` +
      `<th style="${TH_STYLE}">Def.</th>` +
      `<th style="${TH_STYLE}">Type</th>` +
      `<th style="${TH_STYLE}">Cup</th>` +
      `<th style="${TH_STYLE}">Result</th>`
    blocks.push(
      `<div style="font-weight:600;font-size:11pt;margin:14px 0 4px;color:#556b2f;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(group.heading)}</div>` +
        `<table style="${TABLE_STYLE}"><thead><tr>${headerThs}</tr></thead><tbody>${rows.join('')}</tbody></table>`,
    )
  }
  return blocks.join('')
}

/** Editable cover note shown above the (non-editable) summary table. */
export function buildQualityCoverNote(greeting: string, attached: boolean): string {
  const lead = attached
    ? 'Please find below the quality results; the certificates are attached.'
    : 'Please find below the quality results for the samples we assessed.'
  return [`Dear ${greeting},`, '', lead].join('\n')
}

export function buildQualitySummarySubject(groups: QualitySummaryGroup[], attached: boolean): string {
  const samples = groups.flatMap((g) => g.samples)
  const n = samples.length
  const approved = samples.filter((s) => s.decision === 'approved').length
  const rejected = n - approved
  const noun = attached ? `certificate${n === 1 ? '' : 's'}` : `quality result${n === 1 ? '' : 's'}`
  if (approved > 0 && rejected > 0) {
    return `Wolthers QC — ${n} ${noun} (${approved} approved, ${rejected} rejected)`
  }
  if (rejected > 0) return `Wolthers QC — ${n} rejected ${noun}`
  return `Wolthers QC — ${n} ${attached ? 'approved ' : ''}${noun}`
}

// ---- I/O -------------------------------------------------------------------

/**
 * Assemble per-CERTIFICATE quality summaries from the database, keyed by
 * `certUnitKey`. A sample with commercial splits yields one row for its mother
 * certificate (key = sample id) plus one per `sample_contracts` row that has an
 * issued certificate, so the email lists every certificate it attaches. Splits
 * without a certificate are omitted — the table must match the attachments.
 *
 * Approved samples are free (Type/Cup = OK); only rejected samples run the
 * compliance engine to split the failing stage, so cost scales with the (usually
 * small) rejection count.
 */
export async function fetchQualitySampleSummaries(
  admin: SupabaseClient,
  sampleIds: string[],
): Promise<Map<string, QualitySampleSummary>> {
  const out = new Map<string, QualitySampleSummary>()
  const ids = [...new Set(sampleIds.filter(Boolean))]
  if (ids.length === 0) return out

  const { data: samples } = await admin
    .from('samples')
    .select(
      'id, exporter_sample_number, seller_contract_nr, wolthers_contract_nr, buyer_contract_nr, container_nr, ico_number, sample_type, quality_name, client_id, seller_id, status, quality_spec_id, contract_id',
    )
    .in('id', ids)
  const rows = (samples ?? []) as Array<Record<string, unknown>>

  const companyIds = [
    ...new Set(
      rows.flatMap((r) => [r.client_id, r.seller_id]).filter((c): c is string => !!c),
    ),
  ]
  const nameById = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: comps } = await admin.from('companies').select('id, name, fantasy_name').in('id', companyIds)
    for (const c of (comps ?? []) as Array<Record<string, unknown>>) {
      nameById.set(c.id as string, (c.fantasy_name as string) ?? (c.name as string) ?? (c.id as string))
    }
  }

  // Quality names for the samples that reference a client quality. One IN-query;
  // the template name is the last-resort label.
  const specIds = [
    ...new Set(rows.map((r) => r.quality_spec_id).filter((x): x is string => !!x)),
  ]
  const specNameById = new Map<string, { custom: string | null; template: string | null }>()
  if (specIds.length > 0) {
    const { data: specs } = await admin
      .from('client_qualities')
      .select('id, custom_name, template:quality_templates(name)')
      .in('id', specIds)
    for (const q of (specs ?? []) as Array<Record<string, unknown>>) {
      specNameById.set(q.id as string, {
        custom: (q.custom_name as string) ?? null,
        template: ((q.template as { name?: string } | null)?.name as string) ?? null,
      })
    }
  }

  const { data: qaRows } = await admin
    .from('quality_assessments')
    .select('sample_id, green_bean_data, grading_comments, cupping_comments, resolved_defects, created_at')
    .in('sample_id', ids)
    .order('created_at', { ascending: false })
  const qaBySample = new Map<string, Record<string, unknown>>()
  for (const r of (qaRows ?? []) as Array<Record<string, unknown>>) {
    if (!qaBySample.has(r.sample_id as string)) qaBySample.set(r.sample_id as string, r)
  }

  // Official certificate numbers — shown as the Sample reference when the
  // seller/shipper didn't enter their own sample number. Never the internal
  // tracking number. Keyed per certificate: the mother (sample_contract_id NULL)
  // AND every split's own certificate.
  const certNumberByUnit = new Map<string, string>()
  const subIdsWithCert = new Set<string>()
  const { data: certRows } = await admin
    .from('certificates')
    .select('sample_id, sample_contract_id, certificate_number, status')
    .in('sample_id', ids)
  for (const r of (certRows ?? []) as Array<Record<string, unknown>>) {
    if (r.status && r.status !== 'issued') continue
    const key = certUnitKey(r.sample_id as string, (r.sample_contract_id as string) ?? null)
    if (r.sample_contract_id) subIdsWithCert.add(r.sample_contract_id as string)
    const n = r.certificate_number
    if (typeof n === 'string' && n.trim() && !certNumberByUnit.has(key)) certNumberByUnit.set(key, n)
  }

  // Splits (one commercial contract each) that carry their own certificate.
  const subsBySample = new Map<string, SubContractRefs[]>()
  const subClientIds = new Set<string>()
  if (subIdsWithCert.size > 0) {
    const { data: subRows } = await admin
      .from('sample_contracts')
      .select(
        'id, sample_id, client_id, sort_order, contract_id, wolthers_contract_nr, buyer_contract_nr, container_nr, ico_number, supplier_contract_nr, seller_contract_nr, shipper_contract_nr, exporter_sample_number',
      )
      .in('id', [...subIdsWithCert])
      .order('sort_order', { ascending: true })
    for (const r of (subRows ?? []) as Array<Record<string, unknown>>) {
      const sid = r.sample_id as string
      const list = subsBySample.get(sid) ?? []
      list.push(r as unknown as SubContractRefs)
      subsBySample.set(sid, list)
      if (r.client_id) subClientIds.add(r.client_id as string)
    }
    const missing = [...subClientIds].filter((c) => !nameById.has(c))
    if (missing.length > 0) {
      const { data: comps } = await admin.from('companies').select('id, name, fantasy_name').in('id', missing)
      for (const c of (comps ?? []) as Array<Record<string, unknown>>) {
        nameById.set(c.id as string, (c.fantasy_name as string) ?? (c.name as string) ?? (c.id as string))
      }
    }
  }
  const subClientById = new Map<string, string | null>()
  for (const list of subsBySample.values()) {
    for (const s of list) {
      const cid = (s as unknown as Record<string, unknown>).client_id as string | null
      subClientById.set(s.id, cid ? nameById.get(cid) ?? null : null)
    }
  }

  // sys.wolthers is the source of truth for the seller/buyer references, and the
  // certificate PDF reads them through at render time. Do the same here (one
  // link per certificate) so the email table can never print a different
  // reference than the certificate it attaches.
  const sysRefsByUnit = await fetchSysContractRefsBatch(admin, [
    ...rows.map((s) => ({
      key: s.id as string,
      contractId: (s.contract_id as string) ?? null,
      contractNumber: (s.wolthers_contract_nr as string) ?? null,
    })),
    ...[...subsBySample.entries()].flatMap(([sampleId, list]) =>
      list.map((sub) => ({
        key: certUnitKey(sampleId, sub.id),
        contractId: sub.contract_id ?? null,
        contractNumber: sub.wolthers_contract_nr ?? null,
      })),
    ),
  ])

  // Seller approval note — separate guarded query so a not-yet-applied
  // migration (missing column) never breaks the whole summary.
  const sellerCommentBySample = new Map<string, string>()
  const { data: commentRows, error: commentErr } = await admin
    .from('samples')
    .select('id, seller_comment')
    .in('id', ids)
  if (!commentErr) {
    for (const r of (commentRows ?? []) as Array<Record<string, unknown>>) {
      const c = r.seller_comment
      if (typeof c === 'string' && c.trim()) sellerCommentBySample.set(r.id as string, c)
    }
  }

  for (const s of rows) {
    const sampleId = s.id as string
    const decision: ApprovalDecision = s.status === 'rejected' ? 'rejected' : 'approved'
    const qa = qaBySample.get(sampleId)
    const greenBean = qa?.green_bean_data ?? null
    const gradingComment = String(qa?.grading_comments ?? '').trim()
    const cuppingComment = String(qa?.cupping_comments ?? '').trim()
    const resolvedDefects = (qa?.resolved_defects as ResolvedDefects | null) ?? null

    let typeOk: boolean | null = true
    let cupOk: boolean | null = true
    let reason: string | null = null
    if (decision === 'rejected') {
      let violations: string[] = []
      try {
        const res = await evaluateQualityCompliance(admin, sampleId, (s.quality_spec_id as string) ?? null)
        violations = res.violations
      } catch {
        violations = []
      }
      ;({ typeOk, cupOk } = classifyStageResults({
        decision,
        violations,
        hasGradingComment: !!gradingComment,
        hasCuppingComment: !!cuppingComment,
      }))
      reason = buildRejectionReason({ violations, resolvedDefects, cuppingComment, gradingComment })
    }

    // Same precedence the certificate PDF uses: the linked sys contract first,
    // then the value stored on the sample.
    const motherSys = sysRefsByUnit.get(sampleId)
    const mother: QualitySampleSummary = {
      sampleId,
      sampleContractId: null,
      qcClientName: s.client_id ? nameById.get(s.client_id as string) ?? null : null,
      sellerName: s.seller_id ? nameById.get(s.seller_id as string) ?? null : null,
      exporterSampleNumber: (s.exporter_sample_number as string) ?? null,
      sellerContractNr:
        nonBlank(motherSys?.seller_reference) ?? ((s.seller_contract_nr as string) || null),
      wolthersContractNr: (s.wolthers_contract_nr as string) ?? null,
      buyerContractNr: nonBlank(motherSys?.buyer_reference) ?? ((s.buyer_contract_nr as string) || null),
      certificateNumber: certNumberByUnit.get(sampleId) ?? null,
      containerNr: (s.container_nr as string) ?? null,
      icoNumber: (s.ico_number as string) ?? null,
      sampleType: (s.sample_type as string) ?? null,
      qualityName: resolveQualityName(
        s.quality_name as string | null,
        s.quality_spec_id ? specNameById.get(s.quality_spec_id as string)?.custom : null,
        s.quality_spec_id ? specNameById.get(s.quality_spec_id as string)?.template : null,
      ),
      screen: screenRowsFromGrams(
        greenBean ? ((greenBean as Record<string, unknown>).screen_sizes as Record<string, number>) : null,
      ),
      defects: totalDefects(greenBean),
      typeOk,
      cupOk,
      decision,
      reason,
      sellerComment: sellerCommentBySample.get(sampleId) ?? null,
    }
    out.set(sampleId, mother)

    // One additional row per split that has its own certificate.
    for (const sub of subsBySample.get(sampleId) ?? []) {
      const key = certUnitKey(sampleId, sub.id)
      out.set(
        key,
        buildSubContractSummary(
          mother,
          sub,
          certNumberByUnit.get(key) ?? null,
          subClientById.get(sub.id) ?? null,
          sysRefsByUnit.get(key) ?? null,
        ),
      )
    }
  }

  return out
}
