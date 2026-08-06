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
 * "21 max", "min 90%", or null when there is no threshold to state.
 *
 * A passing criterion always carries `operator: null` (the engine only sets
 * '<'/'>' on the failing side of a check), so operator alone cannot tell a
 * passing min-type screen from a passing max-type one — both would otherwise
 * collapse into "N max". The sublabel the engine attaches ("min 90%" / "max
 * 90%") is the only surviving signal for that case, so it is consulted as a
 * fallback. Screens are also the only percentage-valued criteria, so they are
 * the only ones that need the '%' suffix `formatActual` already adds to the
 * actual value.
 */
function formatLimit(c: ComplianceCriterion): string | null {
  if (c.limit === null || c.limit === undefined) return null
  if (typeof c.limit === 'string') return c.limit
  const suffix = isScreen(c) ? '%' : ''
  const isMin = c.operator === '<' || (c.operator === null && c.sublabel?.startsWith('min'))
  return isMin ? `min ${c.limit}${suffix}` : `${c.limit}${suffix} max`
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
      hasThreshold: integrity.some(c => c.limit !== null && c.limit !== undefined),
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
