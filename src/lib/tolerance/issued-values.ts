import {
  criteriaToViolations,
  evaluateCompliance,
  type ComplianceInputs,
  type GreenBeanData,
} from '@/lib/compliance-criteria'
import type { DefectConfig } from '@/types/defect-configuration'
import { normalizeDistribution, type ScreenLimit } from './normalize-distribution'
import { normalizeDefects, type DefectLimits, type IssuedDefects } from './normalize-defects'

export interface IssuedValues {
  screen_percentages: Record<string, number> | null
  defects: IssuedDefects | null
}

export type IssuedResult = { ok: true; issued: IssuedValues } | { ok: false; reason: string }

/**
 * A copy of the lot's green-bean data with the issued values substituted in.
 *
 * Issued PERCENTAGES go into `screen_sizes`, which normally holds grams. That is
 * exact rather than sloppy: screenGramsToPercent divides by the sum, and issued
 * percentages sum to 100, so the gate reads back precisely what was issued.
 */
export function buildIssuedGreenBean(
  greenBean: GreenBeanData | null,
  issued: IssuedValues,
): GreenBeanData {
  const out: GreenBeanData = { ...(greenBean ?? {}) }
  if (issued.screen_percentages) out.screen_sizes = { ...issued.screen_percentages }
  if (issued.defects) {
    const existing = (greenBean?.defects as Record<string, unknown> | undefined) ?? {}
    out.defects = {
      ...existing,
      counts: { ...issued.defects.counts },
      primary: issued.defects.primary,
      secondary: issued.defects.secondary,
      total: issued.defects.total,
    }
  }
  return out
}

export interface ComputeIssuedArgs {
  /** The very inputs the approval gate judged the raw lot with. */
  inputs: ComplianceInputs
  screenPercentages: Record<string, number> | null
  screenLimits: ScreenLimit[]
  defectCounts: Record<string, number> | null
  defectConfigs: DefectConfig[]
  defectLimits: DefectLimits
}

/**
 * Produce the values a buyer certificate will carry, and prove them.
 *
 * The proof is the point: the issued values are re-fed through the SAME
 * evaluateCompliance the approval gate uses, and a single remaining violation
 * refuses the decision. A buyer certificate therefore cannot print numbers the
 * gate would have rejected.
 */
export function computeIssuedValues(args: ComputeIssuedArgs): IssuedResult {
  let screen_percentages: Record<string, number> | null = null
  if (args.screenPercentages && args.screenLimits.length > 0) {
    const d = normalizeDistribution(args.screenPercentages, args.screenLimits)
    if (!d.ok) return { ok: false, reason: d.reason }
    screen_percentages = d.issued
  }

  let defects: IssuedDefects | null = null
  // Only normalize secondary and total; primary is never reduced by normalizeDefects,
  // and a primary-only violation is still caught by the proof step running over untouched counts.
  const hasDefectLimit =
    args.defectLimits.max_secondary !== undefined || args.defectLimits.max_total !== undefined
  if (hasDefectLimit && args.defectCounts) {
    const r = normalizeDefects(args.defectCounts, args.defectConfigs, args.defectLimits)
    if (!r.ok) return { ok: false, reason: r.reason }
    defects = r.issued
  }

  const issued: IssuedValues = { screen_percentages, defects }

  const proof = evaluateCompliance({
    ...args.inputs,
    greenBean: buildIssuedGreenBean(args.inputs.greenBean, issued),
  })
  const violations = criteriaToViolations(proof)
  if (violations.length > 0) {
    return { ok: false, reason: `Issued values would still fail: ${violations[0]}` }
  }

  return { ok: true, issued }
}
