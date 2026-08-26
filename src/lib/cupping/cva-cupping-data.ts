/**
 * Assemble a specialty (SCA CVA) lot's certificate cupping data.
 *
 * Pure — certificate-data.ts does the DB reads (the newest `protocol = 'cva'`
 * cupping_scores row for the sample, and the persisted verdict columns on
 * quality_assessments) and hands the results here to be shaped into the same
 * `CuppingData` the commodity path produces via `processCuppingScores`.
 *
 * The overall score and the clean/uniform cup flags are read VERBATIM from
 * the persisted quality_assessments columns Task 9's finalize route wrote —
 * never recomputed here. That is what lets an already-issued certificate keep
 * asserting what it asserted on the day: a later edit to the assessment or the
 * quality template cannot retroactively change it. The assessment blob itself
 * supplies only the attribute rail (the 8 section impressions), which has no
 * persisted, aggregate equivalent of its own.
 */
import { cvaAttributeRail } from './cva-rail'
import type { CvaAssessment } from '@/types/cva'
import type { CuppingData } from '@/lib/certificate-data'

export function buildCvaCuppingData({
  assessment,
  cvaScore,
  cleanCup,
  uniformCup,
}: {
  /**
   * The authoritative CVA row's `scores` blob, or null when none could be
   * resolved for the sample (nothing scored yet, or the row is missing). The
   * rail is then empty rather than guessed — `overallScore` still prints if
   * one was persisted, so a certificate never loses its headline number
   * merely because the underlying assessment row couldn't be found.
   */
  assessment: Pick<CvaAssessment, 'sections'> | null
  /**
   * `quality_assessments.cva_score`, already parsed to a finite number or
   * null. Independently nullable from `assessment`: Task 9's decideCvaVerdict
   * ignores the score entirely when a human override decided the lot, so
   * "approved, no score recorded" is a real, valid combination — the caller
   * (CertificateCupping) already renders nothing for a null overallScore
   * rather than a blank or a zero.
   */
  cvaScore: number | null
  /** `quality_assessments.clean_cup` — tri-state, printed verbatim. */
  cleanCup: boolean | null
  /** `quality_assessments.uniform_cup` — tri-state, printed verbatim. */
  uniformCup: boolean | null
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
  }
}
