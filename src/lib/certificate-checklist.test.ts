import { describe, it, expect } from 'vitest'
import {
  buildChecklistRows,
  verdictFailures,
  resolveVerdictReasons,
  parseComplianceViolations,
  type ChecklistRow,
} from './certificate-checklist'
import type { ComplianceCriterion } from './compliance-criteria'

const cup = { cleanCup: true, uniformCup: true }

function criterion(over: Partial<ComplianceCriterion>): ComplianceCriterion {
  return {
    key: 'k', label: 'L', actual: 0, operator: null, limit: null, passed: true, ...over,
  }
}

describe('buildChecklistRows', () => {
  it('passes defect counts through as their own rows, in order', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'total_defects', label: 'Total defects', sublabel: '1 primary + 21 secondary · max 21', actual: 22, operator: '>', limit: 21, passed: false }),
      criterion({ key: 'primary_defects', label: 'Primary defects', sublabel: 'max 1', actual: 1, limit: 1 }),
      criterion({ key: 'secondary_defects', label: 'Secondary defects', sublabel: 'max 21', actual: 21, limit: 21 }),
    ], cup)

    expect(rows.map(r => r.key)).toEqual(['primary_defects', 'secondary_defects', 'total_defects'])
    expect(rows[2]).toMatchObject({ actual: '22', limit: '21 max', passed: false })
  })

  it('folds every cupping attribute into one row', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'cupping_Body', label: 'Body', actual: 4, limit: '3–5' }),
      criterion({ key: 'cupping_Acidity', label: 'Acidity', actual: 2, limit: '3–5', operator: 'outside', passed: false }),
      criterion({ key: 'cupping_Balance', label: 'Balance', actual: 4, limit: '3–5' }),
    ], cup)

    const row = rows.find(r => r.key === 'cupping_attributes')
    expect(row).toMatchObject({
      label: 'Cupping attributes',
      sublabel: '2 of 3 inside target range',
      actual: 'Fail',
      passed: false,
    })
    expect(rows.some(r => r.key === 'cupping_Body')).toBe(false)
  })

  it('reports all attributes passing', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'cupping_Body', label: 'Body', actual: 4, limit: '3–5' }),
      criterion({ key: 'cupping_Acidity', label: 'Acidity', actual: 4, limit: '3–5' }),
    ], cup)
    expect(rows.find(r => r.key === 'cupping_attributes')).toMatchObject({
      sublabel: '2 of 2 inside target range', actual: 'Pass', passed: true,
    })
  })

  it('folds taints, faults and intensities into cup integrity', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'cupping_taints', label: 'Cupping taints', actual: 2, limit: 1, operator: '>', passed: false }),
      criterion({ key: 'cupping_faults', label: 'Cupping faults', actual: 0, limit: 0 }),
      criterion({ key: 'intensity_taint_fermented', label: 'Taint: Fermented', actual: 4, limit: 2 }),
    ], cup)

    const row = rows.find(r => r.key === 'cup_integrity')
    expect(row).toMatchObject({
      label: 'Cup integrity',
      sublabel: 'Clean and uniform · 2 taints, 0 faults',
      actual: 'Fail',
      passed: false,
    })
    expect(rows.some(r => r.key === 'cupping_taints')).toBe(false)
  })

  it('names an unclean or non-uniform cup in the integrity sub-line', () => {
    const rows = buildChecklistRows(
      [criterion({ key: 'cupping_taints', label: 'Cupping taints', actual: 1, limit: 2 })],
      { cleanCup: false, uniformCup: true },
    )
    expect(rows.find(r => r.key === 'cup_integrity')?.sublabel)
      .toBe('Not clean · 1 taints, 0 faults')
  })

  it('omits cup integrity entirely when nothing about the cup was judged', () => {
    const rows = buildChecklistRows(
      [criterion({ key: 'total_defects', label: 'Total defects', actual: 5, limit: 10 })],
      { cleanCup: null, uniformCup: null },
    )
    expect(rows.some(r => r.key === 'cup_integrity')).toBe(false)
  })

  it('formats screen rows as percentages', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'screen_16', label: 'Screen 16', sublabel: 'min 90%', actual: 96, operator: null, limit: 90 }),
    ], cup)
    expect(rows[0]).toMatchObject({ actual: '96.0%', limit: 'min 90%', passed: true })
  })

  // Finding 1 — exact-constraint screens (`screen_<size>_exact`) were falling
  // through to the max-type branch and rendering as "N% max". The direction
  // must be read from the key suffix, in both the passing and failing case.
  it('labels an exact screen constraint as an equality, passing and failing', () => {
    const passing = buildChecklistRows([
      criterion({ key: 'screen_18_exact', label: 'Screen 18', sublabel: 'exactly 50%', actual: 50, operator: null, limit: 50 }),
    ], cup)
    expect(passing[0]).toMatchObject({ actual: '50.0%', limit: 'exactly 50%', passed: true })

    const failing = buildChecklistRows([
      criterion({ key: 'screen_18_exact', label: 'Screen 18', sublabel: 'exactly 50%', actual: 48, operator: 'outside', limit: 50, passed: false }),
    ], cup)
    expect(failing[0]).toMatchObject({ actual: '48.0%', limit: 'exactly 50%', passed: false })
  })

  // A duplicate screen key gets a `__N` uniqueness suffix appended to the ROW
  // key after the limit/label are computed from the original criterion key —
  // the suffix must never leak into direction detection.
  it('labels a duplicate screen row correctly even after its key gets a uniqueness suffix', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'screen_16_max', label: 'Screen 16', sublabel: 'max 99%', actual: 96, limit: 99 }),
      criterion({ key: 'screen_16_max', label: 'Screen 16', sublabel: 'max 98%', actual: 96, limit: 98 }),
    ], cup)
    expect(rows[0]).toMatchObject({ key: 'screen_16_max', limit: '99% max' })
    expect(rows[1]).toMatchObject({ key: 'screen_16_max__1', limit: '98% max' })
  })

  it('marks a criterion with no threshold so the icon can be omitted', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'cupping_taints', label: 'Cupping taints', actual: 0, limit: null }),
    ], cup)
    expect(rows.find(r => r.key === 'cup_integrity')?.hasThreshold).toBe(false)
  })

  // Finding 3 — the engine's default-reject taint rule emits `limit: null` on
  // purpose (no tolerance was configured), but the row must still show a fail
  // marker when it actually failed — a threshold-less grey row contradicts a
  // verdict block that names it as the reason.
  it('shows the fail marker for a failing criterion even with no configured limit', () => {
    const rows = buildChecklistRows([
      criterion({
        key: 'cupping_taints',
        label: 'Cupping taints',
        sublabel: 'no tolerance configured',
        actual: 2,
        operator: '>',
        limit: null,
        passed: false,
      }),
    ], cup)
    const row = rows.find(r => r.key === 'cup_integrity')
    expect(row?.hasThreshold).toBe(true)
    expect(row?.passed).toBe(false)
  })

  it('returns nothing for no criteria', () => {
    expect(buildChecklistRows([], { cleanCup: null, uniformCup: null })).toEqual([])
  })

  // F3 — the engine's screen keys collide when a template carries both the
  // legacy and constraint formats: both emit `screen_<size>_max`.
  it('never emits two rows with the same key', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'screen_16', label: 'Screen 16', sublabel: 'min 90%', actual: 96, limit: 90 }),
      criterion({ key: 'screen_16_max', label: 'Screen 16', sublabel: 'max 99%', actual: 96, limit: 99 }),
      criterion({ key: 'screen_16_max', label: 'Screen 16', sublabel: 'max 98%', actual: 96, limit: 98 }),
    ], cup)
    const keys = rows.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(rows).toHaveLength(3)
  })

  // F4 — two cuppers flagging the same taint emit the same intensity key.
  // `cup_integrity` is a single aggregated row by construction, so a bare
  // "only one cup_integrity row" assertion can never fail. What actually
  // needs pinning: the duplicate intensity criteria never surface as their
  // own row (which is what would produce the key collision), and the
  // failing intensity still fails the aggregate.
  it('absorbs duplicate intensity criteria into cup integrity rather than surfacing them as rows', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'intensity_taint_phenol', label: 'Taint: Phenol', actual: 4, limit: 2, operator: '>', passed: false }),
      criterion({ key: 'intensity_taint_phenol', label: 'Taint: Phenol', actual: 4, limit: 2, operator: '>', passed: false }),
      criterion({ key: 'cupping_taints', label: 'Cupping taints', actual: 1, limit: 2 }),
    ], cup)
    expect(rows.some(r => r.key === 'intensity_taint_phenol')).toBe(false)
    expect(rows.filter(r => r.key === 'cup_integrity')).toHaveLength(1)
    expect(rows.find(r => r.key === 'cup_integrity')?.passed).toBe(false)
    const keys = rows.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('verdictFailures', () => {
  function row(over: Partial<ChecklistRow>): ChecklistRow {
    return {
      key: 'k', label: 'L', sublabel: null, actual: '0',
      operator: null, limit: null, hasThreshold: true, passed: true, ...over,
    }
  }

  it('shows total defects when it is the only defect failure', () => {
    // 1 primary (max 2) and 25 secondary (max 25) each pass; the sum of 26
    // breaks a total limit of 25. Total is the only thing to report.
    const failures = verdictFailures([
      row({ key: 'primary_defects' }),
      row({ key: 'secondary_defects' }),
      row({ key: 'total_defects', passed: false }),
    ])
    expect(failures.map(f => f.key)).toEqual(['total_defects'])
  })

  it('suppresses total defects when secondary already failed', () => {
    const failures = verdictFailures([
      row({ key: 'primary_defects' }),
      row({ key: 'secondary_defects', passed: false }),
      row({ key: 'total_defects', passed: false }),
    ])
    expect(failures.map(f => f.key)).toEqual(['secondary_defects'])
  })

  it('suppresses total defects when primary already failed', () => {
    const failures = verdictFailures([
      row({ key: 'primary_defects', passed: false }),
      row({ key: 'total_defects', passed: false }),
    ])
    expect(failures.map(f => f.key)).toEqual(['primary_defects'])
  })

  it('keeps both primary and secondary when both failed', () => {
    const failures = verdictFailures([
      row({ key: 'primary_defects', passed: false }),
      row({ key: 'secondary_defects', passed: false }),
      row({ key: 'total_defects', passed: false }),
    ])
    expect(failures.map(f => f.key)).toEqual(['primary_defects', 'secondary_defects'])
  })

  it('keeps total defects when the other failure is not a defect count', () => {
    const failures = verdictFailures([
      row({ key: 'primary_defects' }),
      row({ key: 'secondary_defects' }),
      row({ key: 'total_defects', passed: false }),
      row({ key: 'cup_integrity', passed: false }),
    ])
    expect(failures.map(f => f.key)).toEqual(['total_defects', 'cup_integrity'])
  })

  it('never suppresses a non-defect failure', () => {
    const failures = verdictFailures([
      row({ key: 'primary_defects', passed: false }),
      row({ key: 'total_defects', passed: false }),
      row({ key: 'cup_integrity', passed: false }),
      row({ key: 'screen_16', passed: false }),
    ])
    expect(failures.map(f => f.key)).toEqual(['primary_defects', 'cup_integrity', 'screen_16'])
  })

  it('returns nothing when everything passed', () => {
    expect(verdictFailures([row({ key: 'total_defects' })])).toEqual([])
  })
})

describe('parseComplianceViolations', () => {
  it('passes through an array of strings', () => {
    expect(parseComplianceViolations(['Total defects: 22 exceeds limit (21)'])).toEqual([
      'Total defects: 22 exceeds limit (21)',
    ])
  })

  it('drops blank and non-string entries', () => {
    expect(parseComplianceViolations(['ok', '', '   ', 42, null, { x: 1 }])).toEqual(['ok'])
  })

  it('treats a non-array value as absent', () => {
    expect(parseComplianceViolations('not an array')).toEqual([])
    expect(parseComplianceViolations({ some: 'object' })).toEqual([])
    expect(parseComplianceViolations(null)).toEqual([])
    expect(parseComplianceViolations(undefined)).toEqual([])
  })
})

// Finding 1 — a manually overridden or template-edited-since-certification
// rejection must never leave the verdict block empty. These four branches are
// the precedence in order.
describe('resolveVerdictReasons', () => {
  function row(over: Partial<ChecklistRow>): ChecklistRow {
    return {
      key: 'k', label: 'L', sublabel: null, actual: '0',
      operator: null, limit: null, hasThreshold: true, passed: true, ...over,
    }
  }

  it('1. prefers live failing rows when present', () => {
    const reasons = resolveVerdictReasons(
      [row({ key: 'total_defects', passed: false })],
      ['Total defects: 22 exceeds limit (21)'],
      'Some override comment',
    )
    expect(reasons).toEqual([{ kind: 'row', row: expect.objectContaining({ key: 'total_defects' }) }])
  })

  it('2. falls back to stored compliance_violations when no live row fails', () => {
    const reasons = resolveVerdictReasons(
      [row({ key: 'total_defects', passed: true })],
      ['Total defects: 22 exceeds limit (21)', 'Moisture: 13.2% exceeds maximum (13%)'],
      null,
    )
    expect(reasons).toEqual([
      { kind: 'text', text: 'Total defects: 22 exceeds limit (21)' },
      { kind: 'text', text: 'Moisture: 13.2% exceeds maximum (13%)' },
    ])
  })

  it('3. falls back to the override comment when there are no stored violations', () => {
    const reasons = resolveVerdictReasons([row({ passed: true })], null, 'Buyer requested rejection')
    expect(reasons).toEqual([{ kind: 'text', text: 'Laboratory decision: Buyer requested rejection' }])
  })

  it('4. falls back to a bare acknowledgement when nothing else is available', () => {
    const reasons = resolveVerdictReasons([row({ passed: true })], null, null)
    expect(reasons).toEqual([{ kind: 'text', text: 'Rejected by laboratory decision.' }])
  })

  it('treats a malformed compliance_violations value as absent and keeps falling back', () => {
    const reasons = resolveVerdictReasons([row({ passed: true })], { not: 'an array' }, 'Staff note')
    expect(reasons).toEqual([{ kind: 'text', text: 'Laboratory decision: Staff note' }])
  })

  it('treats an override comment of only whitespace as absent', () => {
    const reasons = resolveVerdictReasons([row({ passed: true })], null, '   ')
    expect(reasons).toEqual([{ kind: 'text', text: 'Rejected by laboratory decision.' }])
  })
})
