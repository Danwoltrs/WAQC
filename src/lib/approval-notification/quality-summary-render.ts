/**
 * Pure renderers for the quality-summary email (text, HTML table, cover note,
 * subject). No Supabase or server imports, so the send composer can import this
 * file client-side to re-render the preview.
 *
 * The internal sample number (samples.tracking_number) is never rendered.
 */

import { escapeHtml } from '@/lib/html'
import { COPY } from '@/lib/seller-requests/copy'
import { buildRequestLines } from '@/lib/seller-requests/request-lines'
import type { Lang, SellerRequests } from '@/lib/seller-requests/types'
import type { ToleranceItem } from '@/lib/tolerance/types'
import { buildToleranceBlock, type ScreenAdjustmentRow } from './tolerance-comment-block'
import type { ApprovalDecision } from './types'

export type GroupBy = 'qcClient' | 'seller'

export interface QualityScreenRow {
  /** Matching key across samples: the bare sieve number ("18"), the raw stored
   *  key for free-text legacy sieves, or "pan". */
  key: string
  /** "18" for numbered sieves, the raw key otherwise (the pan is shown with COPY.pan). */
  label: string
  /** 0–100, one decimal, as the certificate prints it. */
  pct: number
  isPan: boolean
  /** The sieve number; -Infinity for free-text keys and the pan. */
  sortKey: number
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
  /** The tolerance decision's ISSUED screen distribution / defect total, when
   *  one is on file. Populated for every caller, exactly like `toleranceItems`;
   *  which audience actually sees them is decided in the renderers below, where
   *  `audience === 'buyer'` selects issued over measured. Present only when the
   *  decision substituted that particular metric — a screens-only decision
   *  leaves `issuedDefects` undefined and vice versa. */
  issuedScreen?: QualityScreenRow[]
  issuedDefects?: number | null
  typeOk: boolean | null // green grading vs spec; null = undetermined
  cupOk: boolean | null // cupping vs spec; null = undetermined
  decision: ApprovalDecision
  reason: string | null // surfaced for rejections only
  sellerComment: string | null // approval note — rendered ONLY in seller emails
  /** Present only when this lot was approved with comments. Seller emails only:
   *  the buyer's copy shows the issued values with no comments and no mention
   *  of tolerance (see `buildQualitySummaryHtml`'s `opts.sellerComment` guard). */
  toleranceItems?: ToleranceItem[]
  toleranceComments?: string[]
  requestAdditionalSample?: boolean
  /** Seller emails only, beside `toleranceItems`: every sieve with the sample's
   *  %, the quality's requirement and the adjusted %. */
  toleranceScreenRows?: ScreenAdjustmentRow[]
}

/** Render options. `sellerComment` is true only for seller emails (the note is
 *  never shown to buyers). */
export interface QualitySummaryOpts {
  sellerComment?: boolean
  /** Which side the email is for: buyer sees Sample + Buyer Ref, seller sees
   *  Sample + Contract. Defaults to seller. */
  audience?: 'buyer' | 'seller'
  language?: Lang
  /** Seller emails only: per-sample request lines, keyed by sample id. */
  requests?: Record<string, SellerRequests>
}

export interface QualitySummaryGroup {
  heading: string
  samples: QualitySampleSummary[]
}

export interface SieveColumn { key: string; label: string; isPan: boolean }

// ---- Shown values ----------------------------------------------------------

/**
 * Which sieve / defect numbers this audience is shown. A buyer sees the issued
 * values when a tolerance decision substituted them (so the email matches the
 * certificate); a seller always sees the measured ones. Screens and defects are
 * chosen independently. `audience` defaults to 'seller' (measured).
 */
function shownScreen(s: QualitySampleSummary, audience: 'buyer' | 'seller'): QualityScreenRow[] {
  if (audience === 'buyer' && s.issuedScreen && s.issuedScreen.length > 0) return s.issuedScreen
  return s.screen
}

function shownDefects(s: QualitySampleSummary, audience: 'buyer' | 'seller'): number | null {
  if (audience === 'buyer' && s.issuedDefects != null) return s.issuedDefects
  return s.defects
}

/** Union of the sieves shown across a group: numbered high to low, then
 *  free-text keys in first-seen order, the pan last. */
export function sieveColumns(samples: QualitySampleSummary[], audience: 'buyer' | 'seller'): SieveColumn[] {
  const seen = new Map<string, QualityScreenRow>()
  for (const s of samples) {
    for (const r of shownScreen(s, audience)) if (!seen.has(r.key)) seen.set(r.key, r)
  }
  const all = [...seen.values()]
  const numbered = all.filter((r) => !r.isPan && Number.isFinite(r.sortKey)).sort((a, b) => b.sortKey - a.sortKey)
  const free = all.filter((r) => !r.isPan && !Number.isFinite(r.sortKey))
  const pan = all.filter((r) => r.isPan)
  return [...numbered, ...free, ...pan].map((r) => ({ key: r.key, label: r.label, isPan: r.isPan }))
}

const okText = (v: boolean | null): string => (v === null ? '—' : v ? 'OK' : 'FAIL')

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

const sampleCellValue = (s: QualitySampleSummary): string => {
  const ref = s.exporterSampleNumber?.trim() || s.certificateNumber?.trim()
  const stage = sampleTypeLabel(s.sampleType)
  if (stage && ref) return `${stage} · ${ref}`
  return ref || stage || '—'
}

interface RefColumn {
  header: string
  value: (s: QualitySampleSummary) => string
  /** Optional second line under the main value. */
  sub?: (s: QualitySampleSummary) => string | null
}

const icoText = (s: QualitySampleSummary): string | null => (s.icoNumber && s.icoNumber.trim() ? `ICO ${s.icoNumber.trim()}` : null)

/**
 * Reference columns for the plain-text fallback. "Sample" is the seller's own
 * sample reference (else the certificate number, never the internal lab number)
 * with the stage tag; container and ICO travel to both sides.
 */
export function refColumns(audience: 'buyer' | 'seller', lang: Lang = 'en'): RefColumn[] {
  const c = COPY[lang]
  const sample: RefColumn = { header: c.headings.sample, value: sampleCellValue }
  const audienceCols: RefColumn[] =
    audience === 'buyer'
      ? [sample, { header: c.headings.buyerRef, value: (s) => s.buyerContractNr ?? '—' }]
      : [
          sample,
          { header: 'Wolthers', value: (s) => s.wolthersContractNr ?? '—' },
          { header: c.sellerRef, value: (s) => s.sellerContractNr ?? '—' },
        ]
  const quality: RefColumn = { header: c.headings.quality, value: (s) => s.qualityName ?? '—' }
  const container: RefColumn = { header: c.container, value: (s) => s.containerNr ?? '—', sub: icoText }
  return [...audienceCols, quality, container]
}

function refCellText(c: RefColumn, s: QualitySampleSummary): string {
  const sub = c.sub?.(s)
  return sub && sub.trim() ? `${c.value(s)} (${sub.trim()})` : c.value(s)
}

const sieveLabel = (label: string, isPan: boolean, lang: Lang): string => (isPan ? COPY[lang].pan : label)

function screenCellText(rows: QualityScreenRow[], lang: Lang): string {
  if (!rows.length) return '—'
  return rows.map((r) => `${sieveLabel(r.label, r.isPan, lang)} ${r.pct.toFixed(1)}%`).join('   ')
}

const showsSellerComment = (s: QualitySampleSummary, opts?: QualitySummaryOpts): boolean =>
  !!opts?.sellerComment && s.decision === 'approved' && !!s.sellerComment && s.sellerComment.trim().length > 0

/** The request lines go under an approved PSS, in seller emails only. */
function requestLinesFor(s: QualitySampleSummary, opts: QualitySummaryOpts | undefined, lang: Lang) {
  if ((opts?.audience ?? 'seller') !== 'seller') return null
  if (s.decision !== 'approved' || s.sampleType?.trim().toLowerCase() !== 'pss') return null
  const req = opts?.requests?.[s.sampleId]
  return req ? buildRequestLines(req, lang) : null
}

/** Plain-text block layout, also the fallback body for text-only clients. */
export function buildQualitySummaryText(groups: QualitySummaryGroup[], opts?: QualitySummaryOpts): string {
  const audience = opts?.audience ?? 'seller'
  const lang = opts?.language ?? 'en'
  const c = COPY[lang]
  const refCols = refColumns(audience, lang)
  const out: string[] = []
  for (const group of groups) {
    out.push(group.heading, '─'.repeat(Math.min(group.heading.length, 40)))
    for (const s of group.samples) {
      const result = s.decision === 'rejected' ? c.headings.rejected : c.headings.approved
      const refs = refCols.map((col) => `${col.header}: ${refCellText(col, s)}`).join('      ')
      out.push(`${refs}      ${result}`)
      const screen = shownScreen(s, audience)
      const defects = shownDefects(s, audience)
      if (screen.length) out.push(`   ${screenCellText(screen, lang)}`)
      const metrics = [
        defects != null ? `${c.defectsLong}: ${defects}` : null,
        `${c.headings.type}: ${okText(s.typeOk)}`,
        `${c.headings.cup}: ${okText(s.cupOk)}`,
      ]
        .filter(Boolean)
        .join('   ')
      out.push(`   ${metrics}`)
      if (s.decision === 'rejected' && s.reason && s.reason.trim()) {
        for (const line of s.reason.split('\n')) out.push(`   ${c.reasonLabel}: ${line.trim()}`)
      }
      if (showsSellerComment(s, opts)) {
        for (const line of s.sellerComment!.split('\n')) out.push(`   ${c.headings.note}: ${line.trim()}`)
      }
      const req = requestLinesFor(s, opts, lang)
      if (req) for (const line of req.text.split('\n')) out.push(`   ${line}`)
      out.push('')
    }
  }
  return out.join('\n').replace(/\s+$/, '')
}

// ---- HTML table ------------------------------------------------------------

const TABLE_STYLE =
  'width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:10pt;color:#1a1a1a;margin:4px 0 18px;'
const TH_STYLE = 'text-align:left;padding:6px 8px;background:#556b2f;color:#ffffff;font-weight:600;font-size:9pt;'
const THN_STYLE = 'text-align:right;padding:6px 4px;background:#556b2f;color:#ffffff;font-weight:600;font-size:9pt;white-space:nowrap;'
const TD_STYLE = 'padding:6px 8px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:top;'
const TDN_STYLE = 'padding:6px 4px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:top;text-align:right;white-space:nowrap;'
const SUB_STYLE = 'color:#6b7280;font-size:9pt;'

/** A cell with a main value and an optional muted second line. */
function stackedCell(main: string, sub: string | null): string {
  const subHtml = sub && sub.trim() ? `<div style="${SUB_STYLE}">${escapeHtml(sub.trim())}</div>` : ''
  return `<div>${escapeHtml(main)}</div>${subHtml}`
}

function okHtml(v: boolean | null): string {
  if (v === null) return `<span style="color:#6b7280;">—</span>`
  const color = v ? '#22c55e' : '#ef4444'
  return `<span style="color:${color};font-weight:600;">${v ? 'OK' : 'FAIL'}</span>`
}

/** Styled HTML tables (one per group): one column per sieve, pan last. */
export function buildQualitySummaryHtml(groups: QualitySummaryGroup[], opts?: QualitySummaryOpts): string {
  const audience = opts?.audience ?? 'seller'
  const lang = opts?.language ?? 'en'
  const c = COPY[lang]
  const blocks: string[] = []
  for (const group of groups) {
    const sieves = sieveColumns(group.samples, audience)
    const colCount = 3 + sieves.length + 4 // Sample, Contract/Buyer Ref, Quality, sieves, Def., Type, Cup, Result
    const rows: string[] = []
    for (const s of group.samples) {
      const reasonHtml =
        s.decision === 'rejected' && s.reason && s.reason.trim()
          ? `<div style="color:#b91c1c;font-style:italic;font-size:9pt;margin-top:3px;">${escapeHtml(s.reason).replace(/\n/g, '<br/>')}</div>`
          : ''
      const result =
        s.decision === 'rejected'
          ? `<span style="color:#ef4444;font-weight:600;">${escapeHtml(c.headings.rejected)}</span>${reasonHtml}`
          : `<span style="color:#22c55e;font-weight:600;">${escapeHtml(c.headings.approved)}</span>`
      const sampleSub = [s.containerNr?.trim() || null, icoText(s)].filter((x): x is string => !!x).join(' · ')
      const refTds =
        `<td style="${TD_STYLE}">${stackedCell(sampleCellValue(s), sampleSub)}</td>` +
        (audience === 'buyer'
          ? `<td style="${TD_STYLE}">${stackedCell(s.buyerContractNr ?? '—', null)}</td>`
          : `<td style="${TD_STYLE}">${stackedCell(s.wolthersContractNr ?? '—', s.sellerContractNr)}</td>`) +
        `<td style="${TD_STYLE}">${escapeHtml(s.qualityName ?? '—')}</td>`
      const byKey = new Map(shownScreen(s, audience).map((r) => [r.key, r]))
      const sieveTds = sieves
        .map((col) => {
          const r = byKey.get(col.key)
          return `<td style="${TDN_STYLE}">${r ? r.pct.toFixed(1) : '—'}</td>`
        })
        .join('')
      const shownDef = shownDefects(s, audience)
      rows.push(
        `<tr>` +
          refTds +
          sieveTds +
          `<td style="${TDN_STYLE}">${shownDef != null ? shownDef : '—'}</td>` +
          `<td style="${TD_STYLE}">${okHtml(s.typeOk)}</td>` +
          `<td style="${TD_STYLE}">${okHtml(s.cupOk)}</td>` +
          `<td style="${TD_STYLE}">${result}</td>` +
          `</tr>`,
      )
      const fullRow = (inner: string) =>
        `<tr><td colspan="${colCount}" style="padding:2px 8px 8px;border-bottom:1px solid rgba(0,0,0,0.08);">${inner}</td></tr>`
      if (showsSellerComment(s, opts)) {
        rows.push(
          fullRow(
            `<span style="color:#374151;font-size:9pt;">${escapeHtml(c.headings.note)}: ${escapeHtml(s.sellerComment!).replace(/\n/g, '<br/>')}</span>`,
          ),
        )
      }
      // Seller emails only: the buyer's copy carries the issued values with no
      // comments and no mention of tolerance.
      if (opts?.sellerComment && s.toleranceItems?.length) {
        rows.push(
          fullRow(
            buildToleranceBlock(
              s.toleranceItems,
              s.toleranceComments ?? [],
              s.requestAdditionalSample ?? false,
              s.toleranceScreenRows ?? [],
              lang,
            ),
          ),
        )
      }
      const req = requestLinesFor(s, opts, lang)
      if (req) rows.push(fullRow(req.html))
    }
    const headerThs =
      `<th style="${TH_STYLE}">${escapeHtml(c.headings.sample)}</th>` +
      `<th style="${TH_STYLE}">${escapeHtml(audience === 'buyer' ? c.headings.buyerRef : c.headings.contract)}</th>` +
      `<th style="${TH_STYLE}">${escapeHtml(c.headings.quality)}</th>` +
      sieves.map((col) => `<th style="${THN_STYLE}">${escapeHtml(sieveLabel(col.label, col.isPan, lang))}</th>`).join('') +
      `<th style="${THN_STYLE}">${escapeHtml(c.headings.defects)}</th>` +
      `<th style="${TH_STYLE}">${escapeHtml(c.headings.type)}</th>` +
      `<th style="${TH_STYLE}">${escapeHtml(c.headings.cup)}</th>` +
      `<th style="${TH_STYLE}">${escapeHtml(c.headings.result)}</th>`
    const unitRow = sieves.length
      ? `<tr><td colspan="3"></td><td colspan="${sieves.length}" style="${SUB_STYLE}padding:2px 4px;text-align:right;">${escapeHtml(c.percentOfSample)}</td><td colspan="4"></td></tr>`
      : ''
    blocks.push(
      `<div style="font-weight:600;font-size:11pt;margin:14px 0 4px;color:#556b2f;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(group.heading)}</div>` +
        `<table style="${TABLE_STYLE}"><thead><tr>${headerThs}</tr>${unitRow}</thead><tbody>${rows.join('')}</tbody></table>`,
    )
  }
  return blocks.join('')
}

/** Editable cover note shown above the (non-editable) summary table. Plain text. */
export function buildQualityCoverNote(greeting: string, attached: boolean, language: Lang = 'en'): string {
  const c = COPY[language]
  return [c.greeting(greeting), '', attached ? c.leadAttached : c.leadPlain].join('\n')
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

