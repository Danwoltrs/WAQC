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
import { evaluateQualityCompliance } from '@/lib/compliance'
import { fetchSysContractRefsBatch, isRefPinned, resolveRefForDisplay } from '@/lib/contract-ref-sync'
import { resolveLabSourceIds } from '@/lib/sample-group'
import { resolveSampleSpecs } from '@/lib/quality-spec/resolve'
import type { ResolvedSpec } from '@/lib/quality-spec/types'
import { buildScreenAdjustmentRows, type ScreenAdjustmentRow } from './tolerance-comment-block'
import type { QualitySampleSummary, QualityScreenRow, QualitySummaryGroup, GroupBy } from './quality-summary-render'
import { toScreenLimits } from '@/lib/tolerance/sample-limits'
import { screenGramsToPercent } from '@/lib/quality-resolvers'
import { fetchToleranceApproval } from '@/lib/tolerance/fetch'
import type { ToleranceItem } from '@/lib/tolerance/types'
import type { ApprovalDecision } from './types'

// The pure renderers live in quality-summary-render.ts (no server imports, so the
// composer can use them client-side). Re-exported so every existing import works.
export {
  refColumns,
  sieveColumns,
  buildQualitySummaryText,
  buildQualitySummaryHtml,
  buildQualityCoverNote,
  buildQualitySummarySubject,
} from './quality-summary-render'
export type {
  GroupBy,
  QualityScreenRow,
  QualitySampleSummary,
  QualitySummaryOpts,
  QualitySummaryGroup,
  SieveColumn,
} from './quality-summary-render'


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

/**
 * Screen sizes are stored as raw grams per sieve. Normalise to percentages of
 * the full total, the pan included (works whether the stored values are grams
 * or already percentages: dividing by the total cancels the unit), one decimal
 * like the certificate. EVERY sieve is returned, the pan last.
 *
 * The sieve number is extracted from any stored key format ("16", "Screen 16",
 * "screen_16"); keys without a number keep their raw text. Keys that resolve to
 * the same sieve are summed. Pan matching: `b`, `below`, `pan`, `fundo`, or a
 * leading `<`.
 */
export function screenRowsFromGrams(screenSizes: Record<string, number> | null | undefined): QualityScreenRow[] {
  if (!screenSizes || typeof screenSizes !== 'object') return []
  const entries = Object.entries(screenSizes).filter(([, v]) => typeof v === 'number' && v >= 0)
  const total = entries.reduce((sum, [, v]) => sum + (v || 0), 0)
  if (total <= 0) return []
  const byKey = new Map<string, { label: string; grams: number; isPan: boolean; sortKey: number }>()
  for (const [rawKey, grams] of entries) {
    const trimmed = String(rawKey).trim()
    const lower = trimmed.toLowerCase()
    const isPan =
      lower === 'b' || lower.includes('below') || lower.includes('pan') || lower.includes('fundo') || lower.startsWith('<')
    const numMatch = isPan ? null : trimmed.match(/\d+(\.\d+)?/)
    const key = isPan ? 'pan' : numMatch ? numMatch[0] : trimmed
    const prev = byKey.get(key)
    if (prev) prev.grams += grams || 0
    else
      byKey.set(key, {
        label: isPan ? 'pan' : key,
        grams: grams || 0,
        isPan,
        sortKey: numMatch ? Number(numMatch[0]) : -Infinity,
      })
  }
  const rows: QualityScreenRow[] = [...byKey.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    pct: Math.round((v.grams / total) * 1000) / 10,
    isPan: v.isPan,
    sortKey: v.sortKey,
  }))
  const rank = (r: QualityScreenRow) => (r.isPan ? 2 : Number.isFinite(r.sortKey) ? 0 : 1)
  rows.sort((x, y) => rank(x) - rank(y) || y.sortKey - x.sortKey)
  return rows
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

  // Quality names for the samples that reference a client quality, and the
  // spec's screen requirements for the seller's adjustment table: the lot's
  // spec VERSION (one batched resolve), never the live template, so the table
  // cites the limits the lot was judged by. Keyed by SAMPLE: two lots of one
  // quality may sit on different versions. The template name is the
  // last-resort label.
  const specSampleIds = rows.filter((r) => !!r.quality_spec_id).map((r) => r.id as string)
  // A failed read leaves the names and the table out, as the old join did;
  // the verdict itself is evaluated separately below.
  let specBySample = new Map<string, ResolvedSpec>()
  if (specSampleIds.length > 0) {
    try {
      specBySample = await resolveSampleSpecs(specSampleIds, { admin })
    } catch (error) {
      console.error('[quality-summary] could not resolve the spec versions:', error)
    }
  }
  const specNameBySample = new Map<string, { custom: string | null; template: string | null }>()
  const specTemplateBySample = new Map<string, Record<string, any>>()
  for (const [sampleId, spec] of specBySample) {
    specNameBySample.set(sampleId, {
      custom: spec.custom_name ?? null,
      template: spec.template?.name ?? null,
    })
    if (spec.template) specTemplateBySample.set(sampleId, spec.template)
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

  // Tolerance decision fields (toleranceItems / toleranceComments /
  // requestAdditionalSample, plus the issued screen/defect numbers) —
  // populated here, ONCE, for every caller of this function. This is the
  // single enrichment site on purpose: the queue route and the send route each
  // independently call fetchQualitySampleSummaries, and a per-caller wrapper
  // had already been tried and would have left the send route silently
  // unenriched (a real gap, caught in review). Presence on the object is not
  // what protects buyers — the RENDER guards do that: `opts.sellerComment`
  // decides whether the comment block is emitted at all, and `opts.audience`
  // decides which numbers the Screen / Def. columns print. One fetch serves a
  // buyer send and a seller send of the same lot, so BOTH sets of numbers are
  // carried and the renderer chooses. Both guards are covered by dedicated
  // invariant tests with the fields populated on BOTH sides.
  //
  // Guarded like the seller_comment read above: `approved_with_comments` and
  // `sample_tolerance_approvals` both come from a migration that has not been
  // applied yet, so a missing-column error must leave every summary
  // unchanged (byte-identical emails) rather than break the whole summary.
  const toleranceFieldsBySample = new Map<
    string,
    {
      toleranceItems: ToleranceItem[]
      toleranceComments: string[]
      requestAdditionalSample: boolean
      toleranceScreenRows?: ScreenAdjustmentRow[]
      issuedScreen?: QualityScreenRow[]
      issuedDefects?: number | null
    }
  >()
  const approvedIds = rows.filter((r) => r.status !== 'rejected').map((r) => r.id as string)
  if (approvedIds.length > 0) {
    const { data: flagRows, error: flagErr } = await admin
      .from('samples')
      .select('id, approved_with_comments')
      .in('id', approvedIds)
    if (!flagErr) {
      const flaggedIds = ((flagRows ?? []) as Array<{ id: string; approved_with_comments: boolean | null }>)
        .filter((r) => r.approved_with_comments)
        .map((r) => r.id)
      for (const sampleId of flaggedIds) {
        // labIdOf was already resolved above for every id in one batch
        // (resolveLabSourceIds) — pass it through so fetchToleranceApproval
        // never re-resolves it with its own per-sample query.
        const approval = await fetchToleranceApproval(admin, sampleId, labIdOf(sampleId))
        if (!approval) continue
        // Issued screens go through the SAME row builder the measured ones use
        // (percentages in — the divide-by-total cancels the unit — pan dropped,
        // long lists collapsed, rounded once), so the buyer's cell is formatted
        // identically to the seller's and only the numbers differ.
        const issuedScreens = approval.issued_values?.screen_percentages ?? null
        const issuedDefectTotal = approval.issued_values?.defects?.total
        const template = specTemplateBySample.get(sampleId)
        const labGreen = qaByLab.get(labIdOf(sampleId))?.green_bean_data as Record<string, unknown> | undefined
        const screenRows = buildScreenAdjustmentRows(
          screenGramsToPercent(labGreen?.screen_sizes as Record<string, number> | undefined),
          issuedScreens,
          template ? toScreenLimits(template.parameters ?? {}, template) : [],
        )
        toleranceFieldsBySample.set(sampleId, {
          toleranceItems: approval.metrics as ToleranceItem[],
          toleranceComments: approval.comments.filter((c): c is string => typeof c === 'string'),
          requestAdditionalSample: approval.request_additional_sample,
          ...(screenRows.length > 0 ? { toleranceScreenRows: screenRows } : {}),
          ...(issuedScreens ? { issuedScreen: screenRowsFromGrams(issuedScreens) } : {}),
          ...(typeof issuedDefectTotal === 'number'
            ? { issuedDefects: Math.round(issuedDefectTotal * 10) / 10 }
            : {}),
        })
      }
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
        specNameBySample.get(sampleId)?.custom ?? null,
        specNameBySample.get(sampleId)?.template ?? null,
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
      ...toleranceFieldsBySample.get(sampleId),
    })
  }

  return out
}
