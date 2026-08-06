import type { ComplianceCriterion } from '@/lib/compliance-criteria'

/**
 * One line of the public spec checklist.
 *
 * The verdict block is this same list filtered to failures, which is the whole
 * reason it exists: a page that names a rejection reason the checklist does not
 * list reads as broken.
 */
export interface ChecklistRow {
  key: string
  label: string
  sublabel: string | null
  actual: string
  operator: '>' | '<' | 'outside' | null
  limit: string | null
  /** false → render the value with no pass/fail icon rather than guess a limit */
  hasThreshold: boolean
  passed: boolean
}

const DEFECT_ORDER = ['primary_defects', 'secondary_defects', 'total_defects']

const isCuppingAttribute = (c: ComplianceCriterion) => c.key.startsWith('cupping_') &&
  !['cupping_taints', 'cupping_faults', 'cupping_combined'].includes(c.key)

const isCupIntegrity = (c: ComplianceCriterion) =>
  c.key.startsWith('intensity_') ||
  ['cupping_taints', 'cupping_faults', 'cupping_combined', 'zero_tolerance'].includes(c.key)

const isScreen = (c: ComplianceCriterion) => c.key.startsWith('screen_')

/**
 * Which side of a screen constraint a criterion enforces, read off its key
 * suffix rather than its (display) sublabel or its (passing-ambiguous)
 * operator. The engine's screen keys are:
 *   `screen_<size>`        legacy minimum
 *   `screen_<size>_min`    constraint minimum
 *   `screen_<size>_max`    legacy or constraint maximum
 *   `screen_<size>_exact`  constraint exact
 *
 * Called on the criterion's own key, before `buildChecklistRows` may rename
 * the row's key with a `__N` uniqueness suffix for a duplicate screen — so
 * that later rename never reaches this function.
 *
 * Exported so `page.tsx` can tell a below-minimum screen failure apart from
 * an above-maximum one when deciding which bars to dim.
 */
export function screenDirection(key: string): 'min' | 'max' | 'exact' {
  if (key.endsWith('_exact')) return 'exact'
  if (key.endsWith('_max')) return 'max'
  if (key.endsWith('_min')) return 'min'
  return 'min' // bare `screen_<size>`, the legacy minimum format
}

/**
 * "21 max", "min 90%", "exactly 50%", or null when there is no threshold to
 * state.
 *
 * A passing criterion always carries `operator: null` (the engine only sets
 * '<'/'>'/'outside' on the failing side of a check), so operator alone cannot
 * tell a passing min-type screen from a passing max-type or exact one. An
 * earlier version of this function fell back to sniffing the `sublabel`
 * text for that case, which is display copy — reword it and the fallback
 * breaks silently. The key suffix is structural and this file already
 * dispatches on it elsewhere, so screens use `screenDirection` instead;
 * every other criterion (defects, moisture, quakers, intensities) is
 * max-type whenever its limit is numeric, so `operator` alone is enough
 * for them.
 */
function formatLimit(c: ComplianceCriterion): string | null {
  if (c.limit === null || c.limit === undefined) return null
  if (typeof c.limit === 'string') return c.limit
  if (!isScreen(c)) {
    return c.operator === '<' ? `min ${c.limit}` : `${c.limit} max`
  }
  switch (screenDirection(c.key)) {
    case 'exact': return `exactly ${c.limit}%`
    case 'min': return `min ${c.limit}%`
    case 'max': return `${c.limit}% max`
  }
}

function formatActual(c: ComplianceCriterion): string {
  if (typeof c.actual !== 'number') return String(c.actual)
  return isScreen(c) ? `${c.actual.toFixed(1)}%` : String(c.actual)
}

/**
 * Group the engine's fine-grained criteria into the rows a scanner reads.
 *
 * Seven cupping attributes become one row; taints, faults and per-defect
 * intensities become Cup integrity. Defect counts, screens, moisture and
 * quakers stand on their own — each is independently able to reject a lot, so
 * each needs to be visible as its own verdict.
 */
export function buildChecklistRows(
  criteria: ComplianceCriterion[],
  cup: { cleanCup: boolean | null; uniformCup: boolean | null },
): ChecklistRow[] {
  if (criteria.length === 0) return []

  const rows: ChecklistRow[] = []
  const passthrough = (c: ComplianceCriterion): ChecklistRow => ({
    key: c.key,
    label: c.label,
    sublabel: c.sublabel ?? null,
    actual: formatActual(c),
    operator: c.operator,
    limit: formatLimit(c),
    hasThreshold: c.limit !== null && c.limit !== undefined,
    passed: c.passed,
  })

  // 1. Defect counts, in a fixed order regardless of how the engine emitted them.
  for (const key of DEFECT_ORDER) {
    const found = criteria.find(c => c.key === key)
    if (found) rows.push(passthrough(found))
  }

  // 2. Screens, in engine order. The engine's screen keys are not unique — a
  // template carrying both the legacy and constraint formats emits
  // `screen_<size>_max` from each — and these keys become React keys below.
  const seenScreenKeys = new Map<string, number>()
  for (const c of criteria.filter(isScreen)) {
    const row = passthrough(c)
    const seen = seenScreenKeys.get(row.key) ?? 0
    seenScreenKeys.set(row.key, seen + 1)
    if (seen > 0) row.key = `${row.key}__${seen}`
    rows.push(row)
  }

  // 3. Every cupping attribute, as one row.
  const attributes = criteria.filter(isCuppingAttribute)
  if (attributes.length > 0) {
    const passing = attributes.filter(a => a.passed).length
    const allPassed = passing === attributes.length
    rows.push({
      key: 'cupping_attributes',
      label: 'Cupping attributes',
      sublabel: `${passing} of ${attributes.length} inside target range`,
      actual: allPassed ? 'Pass' : 'Fail',
      operator: allPassed ? null : 'outside',
      limit: null,
      hasThreshold: true,
      passed: allPassed,
    })
  }

  // 4. Taints, faults and intensities, as one row.
  const integrity = criteria.filter(isCupIntegrity)
  if (integrity.length > 0) {
    const taintCriterion = integrity.find(c => c.key === 'cupping_taints')
    const faultCriterion = integrity.find(c => c.key === 'cupping_faults')
    const taints = typeof taintCriterion?.actual === 'number' ? taintCriterion.actual : 0
    const faults = typeof faultCriterion?.actual === 'number' ? faultCriterion.actual : 0

    const cupState =
      cup.cleanCup === false && cup.uniformCup === false
        ? 'Not clean, not uniform'
        : cup.cleanCup === false
          ? 'Not clean'
          : cup.uniformCup === false
            ? 'Not uniform'
            : 'Clean and uniform'

    const allPassed = integrity.every(c => c.passed)
    rows.push({
      key: 'cup_integrity',
      label: 'Cup integrity',
      sublabel: `${cupState} · ${taints} taints, ${faults} faults`,
      actual: allPassed ? 'Pass' : 'Fail',
      operator: allPassed ? null : '>',
      limit: null,
      // A configured limit earns the marker, but so does an actual failure —
      // the engine's default-reject taint rule emits `limit: null` on
      // purpose (no tolerance was configured, so no number to show), and a
      // lot rejected solely by that rule must still show as failed here, not
      // as a threshold-less grey row sitting under a REJECTED verdict.
      hasThreshold: integrity.some(c => c.limit !== null && c.limit !== undefined) ||
        integrity.some(c => !c.passed),
      passed: allPassed,
    })
  }

  // 5. Physicals.
  for (const key of ['moisture', 'quakers']) {
    const found = criteria.find(c => c.key === key)
    if (found) rows.push(passthrough(found))
  }

  return rows
}

/**
 * The rows the verdict block names as rejection reasons.
 *
 * Total defects earns a line only when it is the SOLE defect failure. If
 * primary or secondary already failed, they are the reason — "Primary defects
 * 5 > 1 max" followed by "Total defects 26 > 21 max" says the same thing twice
 * and buries which limit actually broke.
 *
 * The checklist still shows all three rows. This governs the verdict alone.
 */
export function verdictFailures(rows: ChecklistRow[]): ChecklistRow[] {
  const failures = rows.filter(r => !r.passed)
  const componentFailed = failures.some(
    r => r.key === 'primary_defects' || r.key === 'secondary_defects',
  )
  if (!componentFailed) return failures
  return failures.filter(r => r.key !== 'total_defects')
}

/** One line of the verdict's reason block: either a checklist row rendered
 * with its value and limit, or a plain prose sentence. */
export type VerdictReason =
  | { kind: 'row'; row: ChecklistRow }
  | { kind: 'text'; text: string }

/**
 * `certificates.compliance_violations` defensively, unpacked.
 *
 * It is a Postgres `Json` column and can hold anything — the override route
 * clears it to `null` on approval, the certify route writes a string array,
 * and nothing stops a future writer from putting something else there. A
 * non-array, or an array with no usable strings, is treated as absent rather
 * than thrown on.
 */
export function parseComplianceViolations(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

/**
 * The verdict block's reason lines for a REJECTED certificate, in priority
 * order — never leaves a bare badge with nothing under it:
 *
 * 1. Live failing rows (`verdictFailures`) — the current template re-judged
 *    against the current data. Covers the ordinary case.
 * 2. `compliance_violations` — the sentences recorded at certification time.
 *    Covers a template edited since certification (the live re-evaluation no
 *    longer disagrees with the cert) and a staff override to rejected that
 *    deliberately keeps them.
 * 3. `override_comment` — a staff override with no preserved violations
 *    (e.g. overriding an approved cert to rejected, which never had any).
 * 4. A plain acknowledgement, so there is always something to show.
 *
 * Callers gate this on `status === 'REJECTED'` themselves — an approved
 * certificate never reaches here.
 */
export function resolveVerdictReasons(
  rows: ChecklistRow[],
  complianceViolations: unknown,
  overrideComment: string | null,
): VerdictReason[] {
  const failures = verdictFailures(rows)
  if (failures.length > 0) return failures.map(row => ({ kind: 'row' as const, row }))

  const violations = parseComplianceViolations(complianceViolations)
  if (violations.length > 0) return violations.map(text => ({ kind: 'text' as const, text }))

  const comment = overrideComment?.trim()
  if (comment) return [{ kind: 'text' as const, text: `Laboratory decision: ${comment}` }]

  return [{ kind: 'text' as const, text: 'Rejected by laboratory decision.' }]
}
