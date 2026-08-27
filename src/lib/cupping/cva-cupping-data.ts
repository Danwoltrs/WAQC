/**
 * Pure helpers for a specialty (SCA CVA) lot's certificate cupping data.
 *
 * certificate-data.ts — via load-cva-certificate-inputs.ts, which does the DB
 * reads — hands the raw persisted values here to be parsed and shaped into
 * the same `CuppingData` the commodity path produces via
 * `processCuppingScores`.
 *
 * The overall score, the pass mark and the pass/fail verdict are read
 * VERBATIM from the persisted quality_assessments columns Task 9's finalize
 * route wrote — never recomputed here. That is what lets an already-issued
 * certificate keep asserting what it asserted on the day: a later edit to the
 * assessment or the quality template cannot retroactively change it. The
 * assessment blob itself supplies only the attribute rail (the 8 section
 * impressions), which has no persisted, aggregate equivalent of its own.
 */
import { cvaAttributeRail } from './cva-rail'
import { cvaDescriptors } from './cva-descriptors'
import type { CvaAssessment } from '@/types/cva'
import type { CuppingData } from '@/lib/certificate-data'

/**
 * The slice of a persisted assessment the certificate reads: the 8 section
 * impressions for the rail, and the flavour-wheel selections for the
 * descriptor line. `describe` is optional because rows written before the
 * describe overlay existed have no such key — see normalizeAssessment.
 */
export type CvaCertificateAssessment =
  Pick<CvaAssessment, 'sections'> & Partial<Pick<CvaAssessment, 'describe'>>

/** The persisted CVA pass mark and tri-state verdict, as printed on a certificate. */
export interface CvaVerdictDisplay {
  /** `quality_assessments.cva_min_score` — the mark that applied on the day. */
  minScore: number | null
  /**
   * `quality_assessments.cva_passed`, tri-state: `true` passed, `false`
   * failed, `null` the cup could not be judged (no score recorded, or no
   * mark configured) — never a fail, and never derived by truthiness.
   */
  passed: boolean | null
}

/**
 * Parse a persisted numeric column defensively.
 *
 * `typeof value === 'number'` is the expected shape for a postgres `numeric`
 * column, but a bare `Number(x)` coercion is not safe on its own:
 * `Number('') === 0` and `Number.isFinite(0)` is `true`, so an empty string
 * would silently read as a real, printable zero — exactly the "blank or
 * zero" a CVA score must never become. A string is only accepted when it is
 * non-empty AND parses to a finite number; anything else (objects, booleans,
 * `null`, `undefined`) reads as "not recorded".
 */
export function parseCvaNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Parse a persisted tri-state boolean column.
 *
 * Only an actual `boolean` is accepted — never `Boolean(value)`, which would
 * turn any truthy stray value (a non-empty string, a non-zero number) into
 * `true`. Anything else, including `null`/`undefined`, reads as "not
 * recorded", which is the same tri-state `null` the column itself uses for
 * "could not be judged" — so a missing/malformed value degrades to the
 * honest "unknown" state rather than a guessed pass or fail.
 */
export function parseCvaTriBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** Parse a raw `quality_assessments` row's three CVA verdict columns at once. */
export function parseCvaVerdictRow(
  row: { cva_score?: unknown; cva_min_score?: unknown; cva_passed?: unknown } | null | undefined,
): { score: number | null; minScore: number | null; passed: boolean | null } {
  return {
    score: parseCvaNumber(row?.cva_score),
    minScore: parseCvaNumber(row?.cva_min_score),
    passed: parseCvaTriBoolean(row?.cva_passed),
  }
}

/**
 * Did the CVA finalize route actually certify this lot?
 *
 * The question certificate-data.ts has to answer before committing a
 * certificate to the specialty rail, and the ONLY honest evidence is a
 * persisted verdict: one of the three columns POST /api/cupping/cva/finalize
 * writes. The presence of an assessment BLOB is not evidence — `scores` is
 * written by the journey's first autosave, so any lot anyone ever opened on
 * the specialty table has one.
 *
 * The case that distinction protects is documented in the spec as a real
 * workaround: a specialty lot cupped a second time on the COMMODITY table and
 * certified there carries both a CVA blob and commodity score rows, while its
 * `cva_score` was never written (the commodity route does not write it). Under
 * a `methodology = 'cva'` template, committing on the blob switches such a
 * certificate to the CVA rail with `overallScore: null` — an already-issued
 * certificate silently losing its headline score the next time it regenerates.
 * With no persisted verdict the caller falls through to the commodity rail
 * instead, where that lot's real, already-cupped scores are.
 */
export function hasPersistedCvaVerdict(verdict: {
  score: number | null
  minScore: number | null
  passed: boolean | null
}): boolean {
  return verdict.score !== null || verdict.passed !== null || verdict.minScore !== null
}

export function buildCvaCuppingData({
  assessment,
  cvaScore,
  cleanCup,
  uniformCup,
  cvaMinScore,
  cvaPassed,
}: {
  /**
   * The authoritative CVA row's `scores` blob, or null when none could be
   * resolved for the sample (nothing scored yet, or the row is missing). The
   * rail is then empty rather than guessed. `overallScore` below still
   * carries the persisted score in that case — it is the correct value for
   * this function to return even though, as of this writing,
   * `CertificateCuppingChart`'s own `attributes.length === 0` guard means the
   * certificate does not render anything (score included) when the rail is
   * empty. That early return lives in the renderer, not here: this
   * assembler's job is to report what was persisted, not to guess what the
   * renderer will do with it.
   *
   * NOTE the renderer named here: the certificate draws
   * `CertificateCuppingChart`, NOT the similarly-named `CertificateCupping`,
   * which quality-certificate.tsx does not render at all.
   */
  assessment: CvaCertificateAssessment | null
  /**
   * `quality_assessments.cva_score`, already parsed to a finite number or
   * null (see `parseCvaNumber`). Independently nullable from `assessment`:
   * Task 9's decideCvaVerdict ignores the score entirely when a human
   * override decided the lot, so "approved, no score recorded" is a real,
   * valid combination — the renderer (CertificateCuppingChart) already shows
   * nothing for a null overallScore rather than a blank or a zero.
   */
  cvaScore: number | null
  /** `quality_assessments.clean_cup` — tri-state, printed verbatim. */
  cleanCup: boolean | null
  /** `quality_assessments.uniform_cup` — tri-state, printed verbatim. */
  uniformCup: boolean | null
  /** `quality_assessments.cva_min_score`, already parsed — the mark that applied on the day. */
  cvaMinScore: number | null
  /** `quality_assessments.cva_passed`, already parsed — tri-state, never a guess. */
  cvaPassed: boolean | null
}): CuppingData {
  return {
    attributes: assessment ? cvaAttributeRail(assessment) : [],
    overallScore: cvaScore,
    // CVA has no free-text per-cupper notes field, no taint/fault COUNT
    // concept (cup integrity is the clean/uniform booleans below, not a
    // number of defects), and no commodity-style cup-profile descriptor.
    // These stay empty rather than inventing a mapping the protocol has no
    // equivalent for.
    comments: null,
    isSpecialty: true,
    taints: null,
    faults: null,
    taintDetails: [],
    faultDetails: [],
    cleanCup,
    uniformCup,
    flavorDescriptor: null,
    cvaVerdict: { minScore: cvaMinScore, passed: cvaPassed },
    // What the cupper highlighted on the flavour wheel. Read from the same
    // assessment blob as the rail, and null when nothing was selected so the
    // certificate prints no empty heading.
    cvaDescriptors: cvaDescriptors(assessment?.describe),
  }
}
