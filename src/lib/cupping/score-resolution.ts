// src/lib/cupping/score-resolution.ts
//
// How a lot's FINAL cupping score is decided, and how that decision is frozen.
//
// Until 2026-09-10 the rule was "the master cupper's row wins verbatim" and it
// lived, re-derived, in five separate places (certificate-data.ts,
// quality-resolvers.ts, the aggregate route, embed/quadrant-aggregate.ts, and
// cva-verdict.ts). Nothing was stored, and certificate PDFs are never persisted
// — every certificate re-renders its scores on each read — so changing the rule
// would silently reprint every certificate ever issued.
//
// The rule is now the PANEL AVERAGE, snapped to the quality spec's increment,
// and the resolution is FROZEN at validation into
// quality_assessments.score_resolution. Readers therefore go:
//
//   1. a stored resolution      -> print exactly what was validated
//   2. no stored resolution     -> legacy master-wins derivation (unchanged)
//
// so nothing already issued moves, and everything validated from now on prints
// the numbers the cuppers actually agreed on.
//
// Any cupper on the session may adjust the resolution before it is frozen:
// exclude a cupper from the average (`excluded_cupper_ids`), or take one
// cupper's card wholesale (`mode: 'cupper'`).

export type ScoreResolutionMode = 'average' | 'cupper'
export type ScoreProtocol = 'commodity' | 'cva'

export interface ScoreResolution {
  /** 'average' = mean of the included cuppers. 'cupper' = one cupper's card verbatim. */
  mode: ScoreResolutionMode
  protocol: ScoreProtocol
  /** Whose card was taken, when mode === 'cupper'. */
  source_cupper_id: string | null
  /** Cuppers deliberately dropped from the result, and why it is auditable. */
  excluded_cupper_ids: string[]
  /** Cuppers that actually fed the numbers below. */
  included_cupper_ids: string[]
  /** Commodity: attribute name -> agreed value, already snapped to the increment. */
  final_scores: Record<string, number>
  /** Commodity: the sum of final_scores, as certificate-data.ts has always defined it. */
  overall_score: number | null
  /** Specialty: the agreed 0-100 CVA score, rounded to 0.25 per SCA-104 §5.5. */
  cva_score: number | null
  /** The increment the values were snapped to (0.25 unless the spec says otherwise). */
  increment: number
  resolved_by: string | null
  resolved_at: string
}

export const DEFAULT_INCREMENT = 0.25

/** Round to the nearest multiple of `increment` (half-up, so 8.125 @ 0.25 -> 8.25). */
export function snapToIncrement(value: number, increment: number): number {
  const step = increment > 0 ? increment : DEFAULT_INCREMENT
  return Math.round(value / step) * step
}

/** Round to nearest 0.25 — the CVA scale (SCA-104 §5.5). */
export function snapToQuarter(value: number): number {
  return Math.round(value * 4) / 4
}

/**
 * True when `scores` is an SCA CVA assessment envelope rather than a map of
 * attribute names to scores.
 *
 * Specialty samples store the whole `CvaAssessment` object in this column, so
 * its own structural fields sit where attribute names normally are. Four of
 * them are numbers — `version`, `score`, `u`, `d` — and reading them as
 * attributes draws a spider graph with axes labelled "version 1.00" and
 * "score 86.50" clamped to the outer ring. The sensory scores are nested in
 * `sections`, on a different (1–9) scale entirely.
 *
 * Duplicated from quality-resolvers.ts rather than imported: that module
 * imports THIS one, and the test is a single field comparison.
 */
function isCvaEnvelope(scores: Record<string, unknown>): boolean {
  return scores.protocol === 'cva'
}

export interface CupperScoreRow {
  cupper_id?: string | null
  scores?: Record<string, unknown> | null
  cva_score?: number | string | null
}

/** The rows that count: everyone on the panel except those explicitly excluded. */
export function includedRows<T extends { cupper_id?: string | null }>(
  rows: T[],
  excludedCupperIds: readonly string[] = [],
): T[] {
  if (excludedCupperIds.length === 0) return rows
  const dropped = new Set(excludedCupperIds)
  return rows.filter((r) => !r.cupper_id || !dropped.has(r.cupper_id))
}

/**
 * The panel average per attribute, snapped to that attribute's increment.
 *
 * An attribute is averaged over the cuppers who actually scored it — a cupper
 * who left one attribute blank still counts on every other attribute, which is
 * how a partially-filled card behaves on the cupping screen too.
 */
export function averageAttributeScores(
  rows: CupperScoreRow[],
  increments: Record<string, number> = {},
  defaultIncrement: number = DEFAULT_INCREMENT,
): Record<string, number> {
  const sums: Record<string, { sum: number; count: number }> = {}

  for (const row of rows) {
    const scores = row.scores
    if (!scores || typeof scores !== 'object') continue
    // A CVA envelope is not an attribute map — see isCvaEnvelope in
    // quality-resolvers.ts, which drops these rows on the legacy path for the
    // same reason. Skipping it here means even a caller that forgets the
    // protocol cannot turn `version`/`score`/`u`/`d` into cupping attributes.
    if (isCvaEnvelope(scores)) continue
    for (const [attr, value] of Object.entries(scores)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const bucket = sums[attr] || (sums[attr] = { sum: 0, count: 0 })
      bucket.sum += value
      bucket.count += 1
    }
  }

  const out: Record<string, number> = {}
  for (const [attr, { sum, count }] of Object.entries(sums)) {
    if (count === 0) continue
    out[attr] = snapToIncrement(sum / count, increments[attr] ?? defaultIncrement)
  }
  return out
}

/** One cupper's card, verbatim but still snapped so it can't sit off-increment. */
export function cupperAttributeScores(
  rows: CupperScoreRow[],
  cupperId: string,
  increments: Record<string, number> = {},
  defaultIncrement: number = DEFAULT_INCREMENT,
): Record<string, number> {
  const row = rows.find((r) => r.cupper_id === cupperId)
  const scores = row?.scores
  if (!scores || typeof scores !== 'object') return {}
  if (isCvaEnvelope(scores)) return {} // see averageAttributeScores
  const out: Record<string, number> = {}
  for (const [attr, value] of Object.entries(scores)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[attr] = snapToIncrement(value, increments[attr] ?? defaultIncrement)
  }
  return out
}

/** The commodity "overall": the SUM of the per-attribute finals, to 2 decimals. */
export function overallFromFinals(finalScores: Record<string, number>): number | null {
  const values = Object.values(finalScores).filter((v) => Number.isFinite(v))
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100
}

const asNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * The agreed 0-100 CVA score: the mean of the included cuppers' scores, rounded
 * to 0.25. Cuppers with no score yet (an unfinished card writes `cva_score`
 * null) contribute nothing rather than dragging the mean down.
 */
export function averageCvaScore(rows: CupperScoreRow[]): number | null {
  const values = rows.map((r) => asNumber(r.cva_score)).filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return snapToQuarter(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Read a stored resolution back off `quality_assessments.score_resolution`.
 *
 * Deliberately forgiving: an unrecognised shape returns null so the caller
 * falls back to the legacy derivation rather than printing a certificate with
 * no scores at all.
 */
export function parseScoreResolution(raw: unknown): ScoreResolution | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const mode = r.mode
  if (mode !== 'average' && mode !== 'cupper') return null

  const finalScores: Record<string, number> = {}
  const fs = r.final_scores
  if (fs && typeof fs === 'object' && !Array.isArray(fs)) {
    for (const [attr, value] of Object.entries(fs as Record<string, unknown>)) {
      const n = asNumber(value)
      if (n !== null) finalScores[attr] = n
    }
  }

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

  return {
    mode,
    protocol: r.protocol === 'cva' ? 'cva' : 'commodity',
    source_cupper_id: typeof r.source_cupper_id === 'string' ? r.source_cupper_id : null,
    excluded_cupper_ids: strings(r.excluded_cupper_ids),
    included_cupper_ids: strings(r.included_cupper_ids),
    final_scores: finalScores,
    overall_score: asNumber(r.overall_score),
    cva_score: asNumber(r.cva_score),
    increment: asNumber(r.increment) ?? DEFAULT_INCREMENT,
    resolved_by: typeof r.resolved_by === 'string' ? r.resolved_by : null,
    resolved_at: typeof r.resolved_at === 'string' ? r.resolved_at : '',
  }
}

/**
 * True when a stored resolution actually carries commodity attribute values.
 *
 * The protocol check is load-bearing, not decoration: a CVA resolution must
 * never be read as commodity finals, or the CvaAssessment envelope's struct
 * fields (version / score / u / d) reach the certificate as attribute rails.
 * buildScoreResolution already refuses to write them; this is the second lock,
 * so a hand-written or legacy-shaped row cannot re-open the hole either.
 */
export function hasCommodityFinals(resolution: ScoreResolution | null): boolean {
  return (
    !!resolution &&
    resolution.protocol === 'commodity' &&
    Object.keys(resolution.final_scores).length > 0
  )
}

/**
 * Build the resolution to freeze. `mode: 'cupper'` takes that cupper's card;
 * `mode: 'average'` averages everyone not excluded. `overrides` are the values
 * the validator typed over the computed result, applied last.
 */
export function buildScoreResolution(input: {
  protocol: ScoreProtocol
  mode: ScoreResolutionMode
  rows: CupperScoreRow[]
  sourceCupperId?: string | null
  excludedCupperIds?: readonly string[]
  increments?: Record<string, number>
  defaultIncrement?: number
  overrides?: Record<string, number>
  resolvedBy: string | null
  resolvedAt: string
}): ScoreResolution {
  const {
    protocol,
    mode,
    rows,
    sourceCupperId = null,
    excludedCupperIds = [],
    increments = {},
    defaultIncrement = DEFAULT_INCREMENT,
    overrides,
    resolvedBy,
    resolvedAt,
  } = input

  const kept = includedRows(rows, excludedCupperIds)

  // ATTRIBUTES ARE A COMMODITY-ONLY CONCEPT. A CVA row's `scores` is not an
  // attribute map at all — it is a whole CvaAssessment, whose top-level numeric
  // fields (version, score, u, d) would otherwise be averaged into `final_scores`
  // and then printed by every reader as if they were cupping attributes: a
  // "version" rail at 1.00 and a "score" rail at 86.25 on a 0-5 axis. The
  // specialty lot's number is `cva_score` below; its qualitative rail comes from
  // one cupper's assessment blob, which cannot be averaged and is chosen in
  // load-cva-certificate-inputs.ts.
  let finalScores: Record<string, number> = {}
  if (protocol === 'commodity') {
    finalScores =
      mode === 'cupper' && sourceCupperId
        ? cupperAttributeScores(kept, sourceCupperId, increments, defaultIncrement)
        : averageAttributeScores(kept, increments, defaultIncrement)

    if (overrides) {
      finalScores = { ...finalScores }
      for (const [attr, value] of Object.entries(overrides)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          finalScores[attr] = snapToIncrement(value, increments[attr] ?? defaultIncrement)
        }
      }
    }
  }

  const cvaScore =
    protocol === 'cva'
      ? mode === 'cupper' && sourceCupperId
        ? asNumber(kept.find((r) => r.cupper_id === sourceCupperId)?.cva_score)
        : averageCvaScore(kept)
      : null

  return {
    mode,
    protocol,
    source_cupper_id: mode === 'cupper' ? sourceCupperId : null,
    excluded_cupper_ids: [...excludedCupperIds],
    included_cupper_ids: kept
      .map((r) => r.cupper_id)
      .filter((id): id is string => typeof id === 'string'),
    final_scores: finalScores,
    overall_score: protocol === 'commodity' ? overallFromFinals(finalScores) : null,
    cva_score: cvaScore,
    increment: defaultIncrement,
    resolved_by: resolvedBy,
    resolved_at: resolvedAt,
  }
}
