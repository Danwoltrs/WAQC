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
 *
 * One sample is one contract is one certificate (sample-group.ts). A physical
 * sample covering several contracts is several `samples` rows — the lab unit
 * plus its contract siblings — each with its own references and certificate,
 * all sharing the lab unit's assessment. Every row in the table is built from
 * its own sample; only the lab data is looked up through the group.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { escapeHtml } from '@/lib/signatures/render'
import { evaluateQualityCompliance } from '@/lib/compliance'
import { fetchSysContractRefsBatch, isRefPinned, resolveRefForDisplay } from '@/lib/contract-ref-sync'
import { resolveLabSourceIds } from '@/lib/sample-group'
import type { ApprovalDecision } from './types'

export type GroupBy = 'qcClient' | 'seller'

/**
 * Identity of ONE certificate: its sample id. A contract sibling is its own
 * sample with its own certificate, so the plain id is the whole key. Kept as a
 * function so the queue, the send route and the summaries all key the same way
 * — and so prior `email_messages.metadata.sample_id` rows (rewritten to the
 * sibling id by the one-sample-per-contract migration) match unchanged.
 */
export const certUnitKey = (sampleId: string): string => sampleId

interface CompanyNameRow {
  id: string
  name: string | null
  fantasy_name: string | null
}

export interface QualityScreenRow {
  label: string // "Scr. 18"
  pct: number // 0–100, rounded to a whole number
}

export interface QualitySampleSummary {
  /** The certificate's own sample — a lab unit or a contract sibling. */
  sampleId: string
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
   *  the template. This is the short label; the certificate PDF prints the
   *  template's longer `description` field instead (quality-certificate.tsx),
   *  by deliberate choice — the email table has no room for the long form. */
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

const nonBlank = (v: string | null | undefined): string | null =>
  v != null && String(v).trim() !== '' ? String(v) : null

/**
 * The short quality name shown to buyers and sellers in the daily-results
 * table. `samples.quality_name` is a per-sample override (commonly used for
 * type samples); otherwise the client quality's custom name, otherwise the
 * underlying template name. This deliberately differs from the certificate
 * PDF, which prints the template's longer `description` field instead
 * (quality-certificate.tsx) — the two surfaces have different space budgets
 * and are not meant to match word-for-word.
 */
export function resolveQualityName(
  sampleQualityName: string | null | undefined,
  specCustomName: string | null | undefined,
  templateName: string | null | undefined,
): string | null {
  return nonBlank(sampleQualityName) ?? nonBlank(specCustomName) ?? nonBlank(templateName)
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
      // Certificate number breaks the tie so a lab unit and its contract
      // siblings (which may share every other reference) keep a stable,
      // ascending order.
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

/** Blank and "TBI" / "T.B.I." (to-be-informed) placeholders are not references. */
const cleanRef = (s: string | null | undefined): string | null => {
  const t = s?.trim()
  return !t || /^t\.?b\.?i\.?$/i.test(t) ? null : t
}

/** Stage order in a mixed subject: "PSS + SS", never "SS + PSS". */
const STAGE_ORDER = ['PSS', 'SS', 'Type', 'Specialty', 'Stocklot']

/**
 * Subject in the format a buyer asked for (Rich Coop, 2026-08-28) — applied to
 * every batch, since each piece is generic:
 *
 *   PSS Quality Report / <Shipper> for <Client> / Contract no. <recipient's ref>
 *
 * One email covers a whole (company, side) batch and half of all batches span
 * several contracts, so every distinct stage, shipper, client and contract in
 * the batch is named ("Contract nos. A, B") — buyers file by contract number.
 * The reference is the RECIPIENT's own: buyer ref → seller ref → Wolthers
 * number for buyers; seller ref → Wolthers number for sellers. A segment with
 * no data is dropped rather than printed as a placeholder.
 */
export function buildQualitySummarySubject(groups: QualitySummaryGroup[], side: 'buyer' | 'seller'): string {
  const samples = groups.flatMap((g) => g.samples)
  const uniq = (xs: Array<string | null>): string[] => [...new Set(xs.filter((x): x is string => !!x))]
  const rank = (stage: string) => STAGE_ORDER.indexOf(stage) + 1 || 99
  const stages = uniq(samples.map((s) => sampleTypeLabel(s.sampleType))).sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  )
  const shippers = uniq(samples.map((s) => s.sellerName?.trim() || null))
  const clients = uniq(samples.map((s) => s.qcClientName?.trim() || null))
  const refs = uniq(
    samples.map((s) =>
      side === 'buyer'
        ? cleanRef(s.buyerContractNr) ?? cleanRef(s.sellerContractNr) ?? cleanRef(s.wolthersContractNr)
        : cleanRef(s.sellerContractNr) ?? cleanRef(s.wolthersContractNr),
    ),
  )

  let head = `${stages.length ? `${stages.join(' + ')} ` : ''}Quality Report`
  if (shippers.length) head += ` / ${shippers.join(' & ')}`
  if (clients.length) head += ` for ${clients.join(' & ')}`
  const parts = [head]
  if (refs.length) parts.push(`Contract no${refs.length > 1 ? 's' : ''}. ${refs.join(', ')}`)
  return parts.join(' / ')
}

// ---- I/O -------------------------------------------------------------------

/**
 * Assemble per-sample quality summaries from the database, keyed by sample id
 * (`certUnitKey`). Every requested sample gets one row built from its OWN
 * commercial fields and its own certificate number — a contract sibling is a
 * sample like any other. What a sibling does not own is lab data: its quality
 * assessment, compliance verdict and rejection reason live on the group's lab
 * unit (`lab_source_sample_id`), so they are read once per lab unit and shared
 * by every member, whichever members were asked for. The email can therefore
 * never show two results for one physical coffee.
 *
 * Approved samples are free (Type/Cup = OK); only rejected groups run the
 * compliance engine — once per lab unit — to split the failing stage, so cost
 * scales with the (usually small) rejection count.
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
      'id, exporter_sample_number, seller_contract_nr, wolthers_contract_nr, buyer_contract_nr, container_nr, ico_number, sample_type, quality_name, client_id, seller_id, status, quality_spec_id, contract_id, manual_ref_fields',
    )
    .in('id', ids)
  const rows = (samples ?? []) as Array<Record<string, unknown>>

  // Lab data is keyed by the LAB UNIT. Resolve every requested id to its lab
  // unit up front so the assessment query is one read per group.
  const labOf = await resolveLabSourceIds(admin, ids)
  const labIdOf = (sampleId: string) => labOf.get(sampleId) ?? sampleId
  const labIds = [...new Set(rows.map((r) => labIdOf(r.id as string)))]

  const companyIds = [
    ...new Set(
      rows.flatMap((r) => [r.client_id, r.seller_id]).filter((c): c is string => !!c),
    ),
  ]
  const nameById = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: comps } = await admin.from('companies').select('id, name, fantasy_name').in('id', companyIds)
    // Always the trade (fantasy) name — "Ahold", not "Ahold Delhaize Coffee
    // Company B.V." — the legal name only when no fantasy name is stored.
    for (const c of (comps ?? []) as unknown as CompanyNameRow[]) nameById.set(c.id, companyDisplayName(c) || c.id)
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
    .in('sample_id', labIds)
    .order('created_at', { ascending: false })
  const qaByLab = new Map<string, Record<string, unknown>>()
  for (const r of (qaRows ?? []) as Array<Record<string, unknown>>) {
    if (!qaByLab.has(r.sample_id as string)) qaByLab.set(r.sample_id as string, r)
  }

  // Official certificate numbers — shown as the Sample reference when the
  // seller/shipper didn't enter their own sample number. Never the internal
  // tracking number. One certificate per sample.
  const certNumberBySample = new Map<string, string>()
  const { data: certRows } = await admin
    .from('certificates')
    .select('sample_id, certificate_number, status')
    .in('sample_id', ids)
  for (const r of (certRows ?? []) as Array<Record<string, unknown>>) {
    if (r.status && r.status !== 'issued') continue
    const sid = r.sample_id as string
    const n = r.certificate_number
    if (typeof n === 'string' && n.trim() && !certNumberBySample.has(sid)) certNumberBySample.set(sid, n)
  }

  // sys.wolthers is the source of truth for the seller/buyer references, and the
  // certificate PDF reads them through at render time. Do the same here (one
  // link per sample = per certificate) so the email table can never print a
  // different reference than the certificate it attaches — including the pin
  // rule, so a hand-corrected reference wins on both.
  const sysRefsBySample = await fetchSysContractRefsBatch(
    admin,
    rows.map((s) => ({
      key: s.id as string,
      contractId: (s.contract_id as string) ?? null,
      contractNumber: (s.wolthers_contract_nr as string) ?? null,
    })),
  )

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

  // The compliance verdict is a property of the physical coffee, so it is
  // evaluated for the LAB UNIT (the row that carries the cupping and grading)
  // and memoised: a group of thirteen contracts costs one evaluation, and a
  // sibling never asks the engine about its own — empty — lab tables.
  const violationsByLab = new Map<string, string[]>()
  const violationsFor = async (labId: string, specId: string | null): Promise<string[]> => {
    const memoKey = `${labId}:${specId ?? ''}`
    const hit = violationsByLab.get(memoKey)
    if (hit) return hit
    let violations: string[] = []
    try {
      violations = (await evaluateQualityCompliance(admin, labId, specId)).violations
    } catch {
      violations = []
    }
    violationsByLab.set(memoKey, violations)
    return violations
  }

  for (const s of rows) {
    const sampleId = s.id as string
    const labId = labIdOf(sampleId)
    const decision: ApprovalDecision = s.status === 'rejected' ? 'rejected' : 'approved'
    const qa = qaByLab.get(labId)
    const greenBean = qa?.green_bean_data ?? null
    const gradingComment = String(qa?.grading_comments ?? '').trim()
    const cuppingComment = String(qa?.cupping_comments ?? '').trim()
    const resolvedDefects = (qa?.resolved_defects as ResolvedDefects | null) ?? null

    let typeOk: boolean | null = true
    let cupOk: boolean | null = true
    let reason: string | null = null
    if (decision === 'rejected') {
      const violations = await violationsFor(labId, (s.quality_spec_id as string) ?? null)
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
    const sys = sysRefsBySample.get(sampleId)
    out.set(sampleId, {
      sampleId,
      qcClientName: s.client_id ? nameById.get(s.client_id as string) ?? null : null,
      sellerName: s.seller_id ? nameById.get(s.seller_id as string) ?? null : null,
      exporterSampleNumber: (s.exporter_sample_number as string) ?? null,
      sellerContractNr: resolveRefForDisplay(
        s.seller_contract_nr as string | null,
        sys?.seller_reference,
        isRefPinned(s.manual_ref_fields as string[] | null, 'seller_contract_nr'),
      ),
      wolthersContractNr: (s.wolthers_contract_nr as string) ?? null,
      buyerContractNr: resolveRefForDisplay(
        s.buyer_contract_nr as string | null,
        sys?.buyer_reference,
        isRefPinned(s.manual_ref_fields as string[] | null, 'buyer_contract_nr'),
      ),
      certificateNumber: certNumberBySample.get(sampleId) ?? null,
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
    })
  }

  return out
}
