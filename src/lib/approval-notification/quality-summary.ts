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
import type { ApprovalDecision } from './types'

export type GroupBy = 'qcClient' | 'seller'

export interface QualityScreenRow {
  label: string // "Scr. 18" or "B" (below screen)
  pct: number // 0–100, rounded to a whole number
}

export interface QualitySampleSummary {
  sampleId: string
  qcClientName: string | null
  sellerName: string | null
  exporterSampleNumber: string | null
  sellerContractNr: string | null
  wolthersContractNr: string | null
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
}

export interface QualitySummaryGroup {
  heading: string
  samples: QualitySampleSummary[]
}

// ---- Pure helpers ----------------------------------------------------------

/**
 * Screen sizes are stored as raw grams per sieve. Normalise to percentages
 * (works whether the stored values are grams or already percentages — dividing
 * by the total cancels the unit). Numeric sieves render "Scr. N" sorted high to
 * low; a below-screen / pan bucket renders "B" and sorts last.
 */
export function screenRowsFromGrams(screenSizes: Record<string, number> | null | undefined): QualityScreenRow[] {
  if (!screenSizes || typeof screenSizes !== 'object') return []
  const entries = Object.entries(screenSizes).filter(([, v]) => typeof v === 'number' && v >= 0)
  const total = entries.reduce((sum, [, v]) => sum + (v || 0), 0)
  if (total <= 0) return []
  const rows = entries.map(([key, grams]) => {
    const trimmed = String(key).trim()
    const isNumeric = /^\d+(\.\d+)?$/.test(trimmed)
    const lower = trimmed.toLowerCase()
    const isBelow =
      !isNumeric &&
      (lower === 'b' ||
        lower.includes('below') ||
        lower.includes('pan') ||
        lower.includes('fundo') ||
        lower.startsWith('<'))
    return {
      label: isNumeric ? `Scr. ${trimmed}` : isBelow ? 'B' : trimmed,
      pct: Math.round(((grams || 0) / total) * 100),
      sortKey: isNumeric ? Number(trimmed) : -Infinity,
    }
  })
  rows.sort((a, b) => b.sortKey - a.sortKey)
  return rows.map(({ label, pct }) => ({ label, pct }))
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
      return refOf(a).localeCompare(refOf(b))
    }),
  }))
  groups.sort((a, b) => a.heading.localeCompare(b.heading))
  return groups
}

const okText = (v: boolean | null): string => (v === null ? '—' : v ? 'OK' : 'FAIL')

function refCellText(s: QualitySampleSummary): string {
  const parts = [s.exporterSampleNumber, s.sellerContractNr].filter((p): p is string => !!p && p.trim().length > 0)
  return parts.length ? parts.join(' / ') : '—'
}

function screenCellText(s: QualitySampleSummary): string {
  if (!s.screen.length) return '—'
  return s.screen.map((r) => `${r.label} ${r.pct}%`).join('   ')
}

const showsSellerComment = (s: QualitySampleSummary, opts?: QualitySummaryOpts): boolean =>
  !!opts?.sellerComment && s.decision === 'approved' && !!s.sellerComment && s.sellerComment.trim().length > 0

/** Plain-text block layout — also the fallback body for text-only clients. */
export function buildQualitySummaryText(groups: QualitySummaryGroup[], opts?: QualitySummaryOpts): string {
  const out: string[] = []
  for (const group of groups) {
    out.push(group.heading, '─'.repeat(Math.min(group.heading.length, 40)))
    for (const s of group.samples) {
      const wolthers = s.wolthersContractNr ? `Wolthers: ${s.wolthersContractNr}` : ''
      const result = s.decision === 'rejected' ? 'REJECTED' : 'APPROVED'
      out.push(`Sample: ${refCellText(s)}      ${wolthers}      ${result}`)
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

function okHtml(v: boolean | null): string {
  if (v === null) return `<span style="color:#6b7280;">—</span>`
  const color = v ? '#22c55e' : '#ef4444'
  return `<span style="color:${color};font-weight:600;">${v ? 'OK' : 'FAIL'}</span>`
}

function screenCellHtml(s: QualitySampleSummary): string {
  if (!s.screen.length) return '—'
  return s.screen.map((r) => `${escapeHtml(r.label)} ${r.pct}%`).join('<br/>')
}

function sampleCellHtml(s: QualitySampleSummary): string {
  const top = s.exporterSampleNumber ?? s.sellerContractNr ?? '—'
  const sub = s.exporterSampleNumber && s.sellerContractNr ? s.sellerContractNr : ''
  return `<div>${escapeHtml(top)}</div>${sub ? `<div style="${SUB_STYLE}">${escapeHtml(sub)}</div>` : ''}`
}

/** Styled HTML tables (one per group) for the actual email. */
export function buildQualitySummaryHtml(groups: QualitySummaryGroup[], opts?: QualitySummaryOpts): string {
  const blocks: string[] = []
  for (const group of groups) {
    const rows: string[] = []
    for (const s of group.samples) {
      const result =
        s.decision === 'rejected'
          ? `<span style="color:#ef4444;font-weight:600;">REJECTED</span>`
          : `<span style="color:#22c55e;font-weight:600;">APPROVED</span>`
      rows.push(
        `<tr>` +
          `<td style="${TD_STYLE}">${sampleCellHtml(s)}</td>` +
          `<td style="${TD_STYLE}">${escapeHtml(s.wolthersContractNr ?? '—')}</td>` +
          `<td style="${TD_STYLE}">${screenCellHtml(s)}</td>` +
          `<td style="${TD_STYLE}">${s.defects != null ? s.defects : '—'}</td>` +
          `<td style="${TD_STYLE}">${okHtml(s.typeOk)}</td>` +
          `<td style="${TD_STYLE}">${okHtml(s.cupOk)}</td>` +
          `<td style="${TD_STYLE}">${result}</td>` +
          `</tr>`,
      )
      if (s.decision === 'rejected' && s.reason && s.reason.trim()) {
        rows.push(
          `<tr><td colspan="7" style="padding:2px 8px 8px;border-bottom:1px solid rgba(0,0,0,0.08);color:#b91c1c;font-style:italic;font-size:9pt;">` +
            `Reason: ${escapeHtml(s.reason).replace(/\n/g, '<br/>')}` +
            `</td></tr>`,
        )
      }
      if (showsSellerComment(s, opts)) {
        rows.push(
          `<tr><td colspan="7" style="padding:2px 8px 8px;border-bottom:1px solid rgba(0,0,0,0.08);color:#374151;font-size:9pt;">` +
            `Note: ${escapeHtml(s.sellerComment!).replace(/\n/g, '<br/>')}` +
            `</td></tr>`,
        )
      }
    }
    blocks.push(
      `<div style="font-weight:600;font-size:11pt;margin:14px 0 4px;color:#556b2f;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(group.heading)}</div>` +
        `<table style="${TABLE_STYLE}"><thead><tr>` +
        `<th style="${TH_STYLE}">Sample</th>` +
        `<th style="${TH_STYLE}">Wolthers</th>` +
        `<th style="${TH_STYLE}">Screen</th>` +
        `<th style="${TH_STYLE}">Def.</th>` +
        `<th style="${TH_STYLE}">Type</th>` +
        `<th style="${TH_STYLE}">Cup</th>` +
        `<th style="${TH_STYLE}">Result</th>` +
        `</tr></thead><tbody>${rows.join('')}</tbody></table>`,
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
 * Assemble per-sample quality summaries from the database. Approved samples are
 * free (Type/Cup = OK); only rejected samples run the compliance engine to split
 * the failing stage, so cost scales with the (usually small) rejection count.
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
      'id, exporter_sample_number, seller_contract_nr, wolthers_contract_nr, client_id, seller_id, status, quality_spec_id',
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

  const { data: qaRows } = await admin
    .from('quality_assessments')
    .select('sample_id, green_bean_data, grading_comments, cupping_comments, created_at')
    .in('sample_id', ids)
    .order('created_at', { ascending: false })
  const qaBySample = new Map<string, Record<string, unknown>>()
  for (const r of (qaRows ?? []) as Array<Record<string, unknown>>) {
    if (!qaBySample.has(r.sample_id as string)) qaBySample.set(r.sample_id as string, r)
  }

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
    const reason =
      decision === 'rejected' ? [cuppingComment, gradingComment].filter(Boolean).join('\n') || null : null

    let typeOk: boolean | null = true
    let cupOk: boolean | null = true
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
    }

    out.set(sampleId, {
      sampleId,
      qcClientName: s.client_id ? nameById.get(s.client_id as string) ?? null : null,
      sellerName: s.seller_id ? nameById.get(s.seller_id as string) ?? null : null,
      exporterSampleNumber: (s.exporter_sample_number as string) ?? null,
      sellerContractNr: (s.seller_contract_nr as string) ?? null,
      wolthersContractNr: (s.wolthers_contract_nr as string) ?? null,
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
