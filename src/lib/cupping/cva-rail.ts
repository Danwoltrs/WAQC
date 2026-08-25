/**
 * The 8 CVA affective sections, shaped as the certificate's attribute rail.
 *
 * A specialty lot has no commodity attribute rows, so without this its
 * certificate prints an empty rail and an empty spider. The impressions are on
 * SCA's 1-9 scale, NOT the quality spec's commodity scale — passing the spec
 * scale here would misdraw the spider.
 *
 * An unscored section is omitted rather than rendered as zero: "not assessed"
 * and "assessed as the worst possible" are different claims to put on a
 * certificate.
 */
import { CVA_SECTIONS } from '@/lib/cva/sections'
import { effectiveImpression } from '@/lib/cva/scoring'
import type { CvaAssessment } from '@/types/cva'
import type { CuppingAttribute } from '@/lib/certificate-data'

export const CVA_IMPRESSION_SCALE_MIN = 1
export const CVA_IMPRESSION_SCALE_MAX = 9

export function cvaAttributeRail(
  assessment: Pick<CvaAssessment, 'sections'>,
): CuppingAttribute[] {
  const rail: CuppingAttribute[] = []
  for (const section of CVA_SECTIONS) {
    const score = effectiveImpression(assessment.sections?.[section.key])
    if (score == null) continue
    rail.push({
      name: section.label,
      score,
      allowedMin: null,
      allowedMax: null,
      scaleMin: CVA_IMPRESSION_SCALE_MIN,
      scaleMax: CVA_IMPRESSION_SCALE_MAX,
    })
  }
  return rail
}
