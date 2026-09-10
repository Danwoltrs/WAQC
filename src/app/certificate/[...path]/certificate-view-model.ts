import { resolveScreenPercentages } from '@/lib/certificate-data'
import { resolveDefectCounts } from '@/lib/quality-resolvers'
import type { IssuedValues } from '@/lib/tolerance/issued-values'

/**
 * The slice of `green_bean_data` this page's public-facing numbers are derived
 * from. Deliberately narrow (not the page's own `any`) so this module stays
 * testable without dragging in the page's full row shape.
 */
export interface PublicCertificateGreenBean {
  screen_sizes?: Record<string, number> | null
  defects?: unknown
}

export interface PublicCertificateNumbers {
  screenPercentages: Record<string, number> | null
  totalDefects: number | null
}

/**
 * The two numbers this page shows a buyer that a tolerance decision can
 * override: screen distribution and total defect count.
 *
 * Both the certificate body (spec checklist, screen bars) and
 * `generateMetadata`'s link-preview description must read the SAME resolved
 * numbers — the preview a buyer's phone renders the instant they scan the tin
 * is the first thing they see, so a raw number there while the body shows the
 * issued one is exactly the two-surfaces-disagree defect this feature exists
 * to close. Both callers should go through this one function rather than each
 * reconciling `issued` against the raw green-bean data themselves.
 *
 * Screens delegate entirely to `resolveScreenPercentages` (never reimplemented
 * here). Defects follow the same precedence by hand, because the resolver
 * space here is `DefectCounts.total` vs `IssuedDefects.total` — two different
 * shapes with no shared helper (see `resolveDefectCounts` in
 * quality-resolvers.ts and `IssuedDefects` in tolerance/normalize-defects.ts).
 * With `issued` null (no tolerance decision on file — true everywhere today,
 * since `sample_tolerance_approvals` is unmigrated), both fields resolve
 * exactly as this page always computed them, byte-for-byte.
 */
export function resolvePublicCertificateNumbers(
  greenBean: PublicCertificateGreenBean | null,
  issued: IssuedValues | null,
): PublicCertificateNumbers {
  const resolvedScreens = resolveScreenPercentages(greenBean?.screen_sizes ?? null, issued)
  const rawDefectCounts = resolveDefectCounts(greenBean?.defects)
  // `issued.defects` is only ever set when the decision actually substituted a
  // count — checked for presence (not truthiness of `.total`) so an issued
  // total of exactly 0 still counts as an override, not a fallback signal.
  const totalDefects = issued?.defects != null ? issued.defects.total : (rawDefectCounts?.total ?? null)

  return {
    screenPercentages: resolvedScreens?.percentages ?? null,
    totalDefects,
  }
}
