# Approval With Comments (Tolerance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a lab user approve a sample that misses a screen, pan or defect limit by a small margin, issuing in-spec values to the buyer while the seller receives the real numbers, the gap and the required action.

**Architecture:** Four pure functions (`evaluateTolerance`, `normalizeDistribution`, `normalizeDefects`, `computeIssuedValues`) sit on top of the existing `evaluateCompliance()` gate — tolerance is judged from the gate's own criteria and issued values are proven by re-running the gate over them. The decision is stored as an append-only audit row plus a boolean flag; `status` stays `'approved'` so certificate minting, billing and the portal are untouched. Buyer-facing render paths resolve issued values through one shared helper.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), vitest, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-10-tolerance-approval-design.md`

## Global Constraints

- Tolerances are two constants, **not** per-template columns: `SCREEN_TOLERANCE_PP = 5` (percentage points), `DEFECT_TOLERANCE_EQ = 5` (full-defect equivalents).
- `sample_status` gains **no** new enum value. `status` stays `'approved'`; `samples.approved_with_comments` carries the qualifier.
- Raw `green_bean_data` is **never** overwritten. Issued values live only in `sample_tolerance_approvals.issued_values`.
- The tolerable set is an **allowlist keyed on criterion key**. Anything not listed is non-tolerable by default.
- Primary defects are never reduced; a failing `primary_defects` criterion is never tolerable.
- All tolerance decisions are keyed on the **lab-source** sample (`resolveLabSourceId`); the flag is written across the whole group.
- Migrations go in `database/migrations/`, are **written but never run** — Daniel applies them manually.
- No emojis in UI. No mock data.
- Run tests with `npx vitest run <path>`; typecheck with `npx tsc --noEmit`.

---

## File Structure

**Create**
- `src/lib/tolerance/limits.ts` — the two constants and the pan-name helper.
- `src/lib/tolerance/types.ts` — shared result types.
- `src/lib/tolerance/evaluate.ts` — `evaluateTolerance` over compliance criteria.
- `src/lib/tolerance/normalize-distribution.ts` — screen/pan adjustment.
- `src/lib/tolerance/normalize-defects.ts` — defect count reduction.
- `src/lib/tolerance/issued-values.ts` — orchestrator + compliance safety net.
- `src/lib/tolerance/comments.ts` — Portuguese prefill lines.
- `src/lib/tolerance/fetch.ts` — read the stored decision for a sample.
- `src/lib/approval-notification/tolerance-comment-block.ts` — seller email block.
- `src/components/grading/tolerance-banner.tsx`
- `src/components/grading/tolerance-confirm-dialog.tsx`
- `src/app/api/samples/[id]/approve-with-comments/route.ts`
- `database/migrations/20260911000000_tolerance_approval.sql`

**Modify**
- `src/lib/compliance.ts` — `values: 'actual' | 'issued'` option.
- `src/lib/certificate-data.ts` — fetch the decision, return resolved percentages.
- `src/components/pdf/certificate/quality-certificate.tsx` — consume resolved percentages.
- `src/app/certificate/[...path]/page.tsx` — consume the same helper.
- `src/app/grading/page.tsx` — wire banner + dialog only.
- `src/lib/approval-notification/quality-summary.ts` — call the comment block builder.

---

### Task 1: Tolerance constants and `evaluateTolerance`

**Files:**
- Create: `src/lib/tolerance/limits.ts`, `src/lib/tolerance/types.ts`, `src/lib/tolerance/evaluate.ts`
- Test: `src/lib/tolerance/evaluate.test.ts`

**Interfaces:**
- Consumes: `ComplianceCriterion` from `@/lib/compliance-criteria`.
- Produces: `SCREEN_TOLERANCE_PP`, `DEFECT_TOLERANCE_EQ`, `isPanScreen(size: string): boolean`, `ToleranceItem`, `ToleranceAssessment`, `evaluateTolerance(criteria: ComplianceCriterion[]): ToleranceAssessment`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tolerance/evaluate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluateTolerance } from './evaluate'
import type { ComplianceCriterion } from '@/lib/compliance-criteria'

const pass = (key: string): ComplianceCriterion => ({
  key, label: key, actual: 1, operator: null, limit: 1, passed: true,
})
const fail = (
  key: string, actual: number, limit: number, operator: '>' | '<',
): ComplianceCriterion => ({ key, label: key, actual, operator, limit, passed: false })

describe('evaluateTolerance', () => {
  it('offers nothing when every criterion passes', () => {
    const a = evaluateTolerance([pass('screen_18_min'), pass('total_defects')])
    expect(a.offered).toBe(false)
    expect(a.items).toEqual([])
  })

  it('offers a screen minimum inside 5 points', () => {
    const a = evaluateTolerance([fail('screen_18_min', 27.2, 30, '<')])
    expect(a.offered).toBe(true)
    expect(a.items).toHaveLength(1)
    expect(a.items[0]).toMatchObject({
      key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution',
      direction: 'min', actual: 27.2, limit: 30, tolerance: 5,
    })
    expect(a.items[0].gap).toBeCloseTo(2.8)
  })

  it('refuses a screen minimum beyond 5 points', () => {
    const a = evaluateTolerance([fail('screen_18_min', 24, 30, '<')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('screen_18_min')
  })

  it('treats the legacy suffix-less screen key as a minimum', () => {
    const a = evaluateTolerance([fail('screen_18', 27.2, 30, '<')])
    expect(a.offered).toBe(true)
    expect(a.items[0].direction).toBe('min')
  })

  it('offers a pan maximum inside 5 points', () => {
    const a = evaluateTolerance([fail('screen_Pan_max', 7, 5, '>')])
    expect(a.offered).toBe(true)
    expect(a.items[0]).toMatchObject({ direction: 'max', label: 'Pan' })
    expect(a.items[0].gap).toBeCloseTo(2)
  })

  it('offers a total defect count inside 5 equivalents', () => {
    const a = evaluateTolerance([fail('total_defects', 14, 12, '>')])
    expect(a.offered).toBe(true)
    expect(a.items[0]).toMatchObject({
      quadrant: 'defects', direction: 'max', tolerance: 5,
    })
    expect(a.items[0].gap).toBeCloseTo(2)
  })

  it('never offers a primary defect failure', () => {
    const a = evaluateTolerance([fail('primary_defects', 3, 2, '>')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('primary_defects')
  })

  it('never offers an exact screen constraint', () => {
    const a = evaluateTolerance([fail('screen_16_exact', 49, 50, '<')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('screen_16_exact')
  })

  it('blocks when any non-tolerable criterion also fails', () => {
    const a = evaluateTolerance([
      fail('screen_18_min', 29, 30, '<'),
      fail('moisture', 13, 12, '>'),
    ])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('moisture')
  })

  it('blocks an unknown future criterion by default', () => {
    const a = evaluateTolerance([fail('water_activity', 0.7, 0.6, '>')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('water_activity')
  })

  it('blocks a criterion whose actual or limit is not numeric', () => {
    const a = evaluateTolerance([
      { key: 'screen_18_min', label: 's', actual: 'n/a', operator: '<', limit: 30, passed: false },
    ])
    expect(a.offered).toBe(false)
  })

  it('collects several tolerable misses into one assessment', () => {
    const a = evaluateTolerance([
      fail('screen_18_min', 27.2, 30, '<'),
      fail('screen_Pan_max', 7, 5, '>'),
      fail('total_defects', 14, 12, '>'),
    ])
    expect(a.offered).toBe(true)
    expect(a.items).toHaveLength(3)
    expect(a.items.map((i) => i.quadrant)).toEqual(['distribution', 'distribution', 'defects'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tolerance/evaluate.test.ts`
Expected: FAIL — cannot find module `./evaluate`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tolerance/limits.ts`:

```ts
/**
 * The uniform tolerance. Deliberately NOT per-template: one number for screens
 * and pan, one for defects, changed here and nowhere else.
 */
export const SCREEN_TOLERANCE_PP = 5
export const DEFECT_TOLERANCE_EQ = 5

/** Pan sits in the same grams distribution as the screens, under several names. */
export function isPanScreen(size: string): boolean {
  const lower = size.trim().toLowerCase()
  return lower === 'pan' || lower === 'fundo' || lower === 'bottom' || lower.includes('pan')
}
```

Create `src/lib/tolerance/types.ts`:

```ts
export type ToleranceQuadrant = 'distribution' | 'defects'

export interface ToleranceItem {
  /** The compliance criterion key this came from. */
  key: string
  /** Human label, e.g. "Screen 18" or "Total defects". */
  label: string
  quadrant: ToleranceQuadrant
  direction: 'min' | 'max'
  actual: number
  limit: number
  /** Always positive: how far out of spec. */
  gap: number
  /** The tolerance that was applied to this metric. */
  tolerance: number
}

export interface ToleranceAssessment {
  /** True only when at least one criterion failed and every failure is within tolerance. */
  offered: boolean
  items: ToleranceItem[]
  /** Criterion keys that are non-tolerable or beyond tolerance. */
  blockedBy: string[]
}
```

Create `src/lib/tolerance/evaluate.ts`:

```ts
import type { ComplianceCriterion } from '@/lib/compliance-criteria'
import { DEFECT_TOLERANCE_EQ, SCREEN_TOLERANCE_PP, isPanScreen } from './limits'
import type { ToleranceAssessment, ToleranceItem } from './types'

/** Defect criteria that may be issued down. `primary_defects` is deliberately absent. */
const TOLERABLE_DEFECT_KEYS = new Set(['secondary_defects', 'total_defects'])

function toNumber(v: number | string | null): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

/**
 * Classify one failing criterion, or return null when it is not tolerable.
 *
 * This is an ALLOWLIST: a criterion key that does not match one of the shapes
 * below is non-tolerable, so any future quality check added to
 * compliance-criteria.ts fails closed rather than silently becoming approvable.
 */
function classify(c: ComplianceCriterion): Omit<ToleranceItem, 'gap' | 'tolerance'> | null {
  const actual = toNumber(c.actual)
  const limit = toNumber(c.limit)
  if (actual === null || limit === null) return null

  if (TOLERABLE_DEFECT_KEYS.has(c.key)) {
    return {
      key: c.key,
      label: c.label,
      quadrant: 'defects',
      direction: 'max',
      actual,
      limit,
    }
  }

  if (!c.key.startsWith('screen_')) return null
  // `screen_<size>_exact` is never tolerable; an exact requirement has no slack.
  if (c.key.endsWith('_exact')) return null

  let size: string
  let direction: 'min' | 'max'
  if (c.key.endsWith('_max')) {
    size = c.key.slice('screen_'.length, -'_max'.length)
    direction = 'max'
  } else if (c.key.endsWith('_min')) {
    size = c.key.slice('screen_'.length, -'_min'.length)
    direction = 'min'
  } else {
    // Legacy template format pushes a suffix-less key for the minimum.
    size = c.key.slice('screen_'.length)
    direction = 'min'
  }
  if (!size) return null

  return {
    key: c.key,
    label: isPanScreen(size) ? 'Pan' : `Screen ${size}`,
    quadrant: 'distribution',
    direction,
    actual,
    limit,
  }
}

/**
 * Decide whether a lot may be approved with comments.
 *
 * Judged from the approval gate's OWN criteria rather than re-derived, so the
 * banner can never disagree with the decision the gate would make.
 */
export function evaluateTolerance(criteria: ComplianceCriterion[]): ToleranceAssessment {
  const failures = criteria.filter((c) => !c.passed)
  if (failures.length === 0) return { offered: false, items: [], blockedBy: [] }

  const items: ToleranceItem[] = []
  const blockedBy: string[] = []

  for (const c of failures) {
    const base = classify(c)
    if (!base) {
      blockedBy.push(c.key)
      continue
    }
    const gap = base.direction === 'min' ? base.limit - base.actual : base.actual - base.limit
    const tolerance = base.quadrant === 'defects' ? DEFECT_TOLERANCE_EQ : SCREEN_TOLERANCE_PP
    if (gap > tolerance) {
      blockedBy.push(c.key)
      continue
    }
    items.push({ ...base, gap, tolerance })
  }

  return { offered: blockedBy.length === 0 && items.length > 0, items, blockedBy }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tolerance/evaluate.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tolerance/limits.ts src/lib/tolerance/types.ts src/lib/tolerance/evaluate.ts src/lib/tolerance/evaluate.test.ts
git commit -m "feat(tolerance): judge tolerance from the approval gate's own criteria"
```

---

### Task 2: `normalizeDistribution`

**Files:**
- Create: `src/lib/tolerance/normalize-distribution.ts`
- Test: `src/lib/tolerance/normalize-distribution.test.ts`

**Interfaces:**
- Consumes: `isPanScreen` (Task 1), `getScreenSizeOrder` from `@/types/screen-size-constraints`.
- Produces: `ScreenLimit { screen_size: string; min?: number; max?: number }`, `DistributionResult = { ok: true; issued: Record<string, number> } | { ok: false; reason: string }`, `normalizeDistribution(actual: Record<string, number>, limits: ScreenLimit[]): DistributionResult`.

Input percentages, output percentages. The total is preserved exactly.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tolerance/normalize-distribution.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeDistribution, type ScreenLimit } from './normalize-distribution'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

describe('normalizeDistribution', () => {
  it('lifts a short screen by taking from the next smaller one', () => {
    const actual = { '18': 27.2, '15': 68.9, Pan: 3.9 }
    const limits: ScreenLimit[] = [{ screen_size: '18', min: 30 }]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued['18']).toBeCloseTo(30)
    expect(r.issued['15']).toBeCloseTo(66.1)
    expect(r.issued.Pan).toBeCloseTo(3.9)
    expect(sum(r.issued)).toBeCloseTo(sum(actual))
  })

  it('moves pan excess up into the smallest screen above it', () => {
    const actual = { '18': 30, '15': 63, Pan: 7 }
    const limits: ScreenLimit[] = [{ screen_size: 'Pan', max: 5 }]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.Pan).toBeCloseTo(5)
    expect(r.issued['15']).toBeCloseTo(65)
    expect(r.issued['18']).toBeCloseTo(30)
    expect(sum(r.issued)).toBeCloseTo(sum(actual))
  })

  it('does not push a receiving screen past its own maximum', () => {
    const actual = { '18': 30, '15': 63, Pan: 7 }
    const limits: ScreenLimit[] = [
      { screen_size: 'Pan', max: 5 },
      { screen_size: '15', max: 64 },
    ]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued['15']).toBeCloseTo(64)
    expect(r.issued['18']).toBeCloseTo(31)
    expect(r.issued.Pan).toBeCloseTo(5)
  })

  it('handles a pan excess and a short screen in one pass', () => {
    const actual = { '18': 28, '15': 65, Pan: 7 }
    const limits: ScreenLimit[] = [
      { screen_size: '18', min: 30 },
      { screen_size: 'Pan', max: 5 },
    ]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.Pan).toBeCloseTo(5)
    expect(r.issued['18']).toBeCloseTo(30)
    expect(sum(r.issued)).toBeCloseTo(100)
  })

  it('never pulls a donor below its own minimum', () => {
    const actual = { '18': 28, '15': 68, Pan: 4 }
    const limits: ScreenLimit[] = [
      { screen_size: '18', min: 30 },
      { screen_size: '15', min: 67 },
    ]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    // Only 1 point available from 15; the remaining point comes from Pan.
    expect(r.issued['15']).toBeCloseTo(67)
    expect(r.issued.Pan).toBeCloseTo(3)
    expect(r.issued['18']).toBeCloseTo(30)
  })

  it('refuses when donors cannot cover the shortfall', () => {
    const actual = { '18': 28, '15': 68, Pan: 4 }
    const limits: ScreenLimit[] = [
      { screen_size: '18', min: 30 },
      { screen_size: '15', min: 68 },
      { screen_size: 'Pan', min: 4 },
    ]
    const r = normalizeDistribution(actual, limits)
    expect(r.ok).toBe(false)
  })

  it('refuses a non-pan screen over its maximum', () => {
    const actual = { '18': 40, '15': 56, Pan: 4 }
    const limits: ScreenLimit[] = [{ screen_size: '18', max: 35 }]
    const r = normalizeDistribution(actual, limits)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/maximum/i)
  })

  it('returns the input untouched when nothing is out of spec', () => {
    const actual = { '18': 31, '15': 65, Pan: 4 }
    const limits: ScreenLimit[] = [{ screen_size: '18', min: 30 }, { screen_size: 'Pan', max: 5 }]
    const r = normalizeDistribution(actual, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued).toEqual(actual)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tolerance/normalize-distribution.test.ts`
Expected: FAIL — cannot find module `./normalize-distribution`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tolerance/normalize-distribution.ts`:

```ts
import { getScreenSizeOrder } from '@/types/screen-size-constraints'
import { isPanScreen } from './limits'

export interface ScreenLimit {
  screen_size: string
  min?: number
  max?: number
}

export type DistributionResult =
  | { ok: true; issued: Record<string, number> }
  | { ok: false; reason: string }

const EPS = 1e-9

/**
 * Issue an in-spec screen distribution without inventing coffee.
 *
 * Input and output are PERCENTAGES and the total is preserved exactly: every
 * point added to one screen is taken from another. Percentages are derived from
 * grams upstream and always total 100, so a preserved total keeps the issued
 * distribution self-consistent.
 *
 * Order is the spec's: pan excess first, then screen minimums, then a full
 * re-validation. Anything the rules cannot satisfy refuses rather than
 * half-fixing.
 */
export function normalizeDistribution(
  actual: Record<string, number>,
  limits: ScreenLimit[],
): DistributionResult {
  const issued: Record<string, number> = { ...actual }
  const limitOf = new Map(limits.map((l) => [l.screen_size, l]))
  const total = Object.values(actual).reduce((a, b) => a + b, 0)

  // Largest screen first, pan last — getScreenSizeOrder already orders that way.
  const order = Object.keys(issued).sort((a, b) => getScreenSizeOrder(a) - getScreenSizeOrder(b))

  // 1. Pan over its maximum: push the excess up, smallest non-pan screen first.
  for (const size of order) {
    if (!isPanScreen(size)) continue
    const max = limitOf.get(size)?.max
    if (max === undefined || issued[size] <= max + EPS) continue

    let excess = issued[size] - max
    const receivers = order.filter((s) => !isPanScreen(s)).reverse()
    for (const r of receivers) {
      if (excess <= EPS) break
      const rMax = limitOf.get(r)?.max
      const capacity = rMax === undefined ? Infinity : rMax - issued[r]
      if (capacity <= EPS) continue
      const take = Math.min(excess, capacity)
      issued[r] += take
      excess -= take
    }
    if (excess > EPS) {
      return { ok: false, reason: `Pan excess cannot be absorbed by the screens above it` }
    }
    issued[size] = max
  }

  // 2. Screens short of their minimum: take from the next smaller screen and
  //    continue downward. Pan is last in `order`, so it is drawn on last.
  for (let i = 0; i < order.length; i++) {
    const size = order[i]
    const min = limitOf.get(size)?.min
    if (min === undefined) continue
    let need = min - issued[size]
    if (need <= EPS) continue

    for (let j = i + 1; j < order.length; j++) {
      if (need <= EPS) break
      const donor = order[j]
      const donorMin = limitOf.get(donor)?.min ?? 0
      const available = Math.max(0, issued[donor] - donorMin)
      if (available <= EPS) continue
      const take = Math.min(need, available)
      issued[donor] -= take
      need -= take
    }
    if (need > EPS) {
      return { ok: false, reason: `Screen ${size} cannot reach its minimum without breaching another limit` }
    }
    issued[size] = min
  }

  // 3. Re-validate every limit, and the total.
  for (const l of limits) {
    const v = issued[l.screen_size]
    if (v === undefined) continue
    if (l.min !== undefined && v < l.min - EPS) {
      return { ok: false, reason: `Screen ${l.screen_size} is still below its minimum` }
    }
    if (l.max !== undefined && v > l.max + EPS) {
      return { ok: false, reason: `Screen ${l.screen_size} is still above its maximum` }
    }
  }
  const issuedTotal = Object.values(issued).reduce((a, b) => a + b, 0)
  if (Math.abs(issuedTotal - total) > 1e-6) {
    return { ok: false, reason: 'Adjustment did not preserve the distribution total' }
  }

  return { ok: true, issued }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tolerance/normalize-distribution.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tolerance/normalize-distribution.ts src/lib/tolerance/normalize-distribution.test.ts
git commit -m "feat(tolerance): issue an in-spec distribution that preserves the total"
```

---

### Task 3: `normalizeDefects`

**Files:**
- Create: `src/lib/tolerance/normalize-defects.ts`
- Test: `src/lib/tolerance/normalize-defects.test.ts`

**Interfaces:**
- Consumes: `DefectConfig` from `@/types/defect-configuration`.
- Produces: `DefectLimits { max_primary?: number; max_secondary?: number; max_total?: number }`, `IssuedDefects { counts: Record<string, number>; primary: number; secondary: number; total: number }`, `DefectResult = { ok: true; issued: IssuedDefects } | { ok: false; reason: string }`, `normalizeDefects(counts, configs, limits): DefectResult`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tolerance/normalize-defects.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeDefects, type DefectLimits } from './normalize-defects'
import type { DefectConfig } from '@/types/defect-configuration'

const configs: DefectConfig[] = [
  { name: 'Full Black', weight: 1, category: 'primary', display_order: 0 },
  { name: 'Broken', weight: 0.2, category: 'secondary', display_order: 1 },
  { name: 'Shells', weight: 0.34, category: 'secondary', display_order: 2 },
]

describe('normalizeDefects', () => {
  it('reduces secondary counts until the total meets the limit', () => {
    // 2 primary + 60 Broken x 0.2 = 12 secondary -> total 14, max 12
    const r = normalizeDefects({ 'Full Black': 2, Broken: 60 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.total).toBeCloseTo(12)
    expect(r.issued.primary).toBeCloseTo(2)
    expect(r.issued.counts['Full Black']).toBe(2)
    expect(r.issued.counts.Broken).toBe(50)
  })

  it('lands better than the limit when no exact landing exists', () => {
    // 40 Shells x 0.34 = 13.6, max 12. Steps of 0.34 skip 12.0 exactly.
    const r = normalizeDefects({ Shells: 40 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.total).toBeLessThanOrEqual(12)
    expect(r.issued.total).toBeCloseTo(11.9)
    expect(r.issued.counts.Shells).toBe(35)
  })

  it('never reduces a primary category', () => {
    const r = normalizeDefects({ 'Full Black': 6, Broken: 40 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts['Full Black']).toBe(6)
    expect(r.issued.primary).toBeCloseTo(6)
  })

  it('takes from the largest contributing secondary category first', () => {
    // Broken contributes 40x0.2 = 8, Shells 10x0.34 = 3.4 -> Broken is reduced.
    const r = normalizeDefects({ Broken: 40, Shells: 10 }, configs, { max_total: 11 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts.Shells).toBe(10)
    expect(r.issued.counts.Broken).toBeLessThan(40)
  })

  it('satisfies the secondary limit and the total limit together', () => {
    const limits: DefectLimits = { max_secondary: 5, max_total: 12 }
    const r = normalizeDefects({ 'Full Black': 2, Broken: 50 }, configs, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.secondary).toBeLessThanOrEqual(5)
    expect(r.issued.total).toBeLessThanOrEqual(12)
  })

  it('refuses when the primary limit is the failing one', () => {
    const r = normalizeDefects({ 'Full Black': 5 }, configs, { max_primary: 2 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/primary/i)
  })

  it('refuses when secondary categories are exhausted', () => {
    const r = normalizeDefects({ 'Full Black': 20, Broken: 5 }, configs, { max_total: 12 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/exhausted/i)
  })

  it('refuses when the lot has no per-category counts stored', () => {
    const r = normalizeDefects({}, configs, { max_total: 12 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/no per-category/i)
  })

  it('returns the input untouched when nothing is over the limit', () => {
    const r = normalizeDefects({ Broken: 10 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts.Broken).toBe(10)
    expect(r.issued.total).toBeCloseTo(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tolerance/normalize-defects.test.ts`
Expected: FAIL — cannot find module `./normalize-defects`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tolerance/normalize-defects.ts`:

```ts
import type { DefectConfig } from '@/types/defect-configuration'

export interface DefectLimits {
  max_primary?: number
  max_secondary?: number
  max_total?: number
}

export interface IssuedDefects {
  counts: Record<string, number>
  primary: number
  secondary: number
  total: number
}

export type DefectResult =
  | { ok: true; issued: IssuedDefects }
  | { ok: false; reason: string }

const EPS = 1e-9
const round2 = (n: number) => Math.round(n * 100) / 100

function weightedTotal(
  counts: Record<string, number>,
  configs: DefectConfig[],
  category: 'primary' | 'secondary',
): number {
  let total = 0
  for (const c of configs) {
    if (c.category !== category) continue
    total += (counts[c.name] || 0) * c.weight
  }
  return round2(total)
}

/**
 * Issue a defect count that meets every non-primary limit.
 *
 * Limits are expressed in full-defect EQUIVALENTS (count x weight), so removing
 * one bean moves the total by that category's weight — 0.2 or 0.34, not 1. An
 * exact landing on the limit therefore often does not exist, and the rule is to
 * stop at the first achievable total that MEETS the limit: better than required,
 * never worse.
 *
 * Primary defects are never reduced. A lot whose primary limit is the failing one
 * is refused here and is non-tolerable upstream.
 */
export function normalizeDefects(
  counts: Record<string, number>,
  configs: DefectConfig[],
  limits: DefectLimits,
): DefectResult {
  if (!configs.length || Object.keys(counts).length === 0) {
    return { ok: false, reason: 'This lot has no per-category defect counts stored' }
  }

  const issued: Record<string, number> = { ...counts }
  const primary = weightedTotal(issued, configs, 'primary')

  if (limits.max_primary !== undefined && primary > limits.max_primary + EPS) {
    return { ok: false, reason: 'The primary defect limit is exceeded and primary defects are never reduced' }
  }

  const secondaryConfigs = configs.filter((c) => c.category === 'secondary')
  const over = (): boolean => {
    const secondary = weightedTotal(issued, configs, 'secondary')
    const total = round2(primary + secondary)
    if (limits.max_secondary !== undefined && secondary > limits.max_secondary + EPS) return true
    if (limits.max_total !== undefined && total > limits.max_total + EPS) return true
    return false
  }

  while (over()) {
    // The category currently contributing the most weighted equivalents.
    // Ties break on the heavier bean, then on name, so the result is deterministic.
    let pick: DefectConfig | null = null
    let best = -1
    for (const c of secondaryConfigs) {
      const n = issued[c.name] || 0
      if (n <= 0) continue
      const contribution = n * c.weight
      if (
        contribution > best + EPS ||
        (Math.abs(contribution - best) <= EPS &&
          pick !== null &&
          (c.weight > pick.weight || (c.weight === pick.weight && c.name < pick.name)))
      ) {
        best = contribution
        pick = c
      }
    }
    if (!pick) {
      return { ok: false, reason: 'Secondary defect categories are exhausted and the limit is still exceeded' }
    }
    issued[pick.name] = (issued[pick.name] || 0) - 1
  }

  const secondary = weightedTotal(issued, configs, 'secondary')
  return {
    ok: true,
    issued: { counts: issued, primary, secondary, total: round2(primary + secondary) },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tolerance/normalize-defects.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tolerance/normalize-defects.ts src/lib/tolerance/normalize-defects.test.ts
git commit -m "feat(tolerance): reduce secondary defect counts to meet the limit"
```

---

### Task 4: `computeIssuedValues` — orchestrator and safety net

**Files:**
- Create: `src/lib/tolerance/issued-values.ts`
- Test: `src/lib/tolerance/issued-values.test.ts`

**Interfaces:**
- Consumes: `normalizeDistribution`/`ScreenLimit` (Task 2), `normalizeDefects`/`DefectLimits`/`IssuedDefects` (Task 3), `evaluateCompliance`, `ComplianceInputs`, `GreenBeanData` from `@/lib/compliance-criteria`.
- Produces: `IssuedValues { screen_percentages: Record<string, number> | null; defects: IssuedDefects | null }`, `IssuedResult = { ok: true; issued: IssuedValues } | { ok: false; reason: string }`, `buildIssuedGreenBean(greenBean, issued): GreenBeanData`, `computeIssuedValues(args): IssuedResult`.

**Why substituting percentages into the grams slot is exact:** `screenGramsToPercent` divides each value by the sum. Issued percentages sum to 100, so `v / 100 * 100 === v` — the gate reads back precisely the issued percentages.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tolerance/issued-values.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildIssuedGreenBean, computeIssuedValues } from './issued-values'
import type { DefectConfig } from '@/types/defect-configuration'
import type { ComplianceInputs } from '@/lib/compliance-criteria'

const configs: DefectConfig[] = [
  { name: 'Full Black', weight: 1, category: 'primary', display_order: 0 },
  { name: 'Broken', weight: 0.2, category: 'secondary', display_order: 1 },
]

const baseInputs = (): ComplianceInputs => ({
  parameters: {
    screen_size_requirements: {
      constraints: [{ screen_size: '18', constraint_type: 'minimum', min_value: 30 }],
    },
  },
  template: {
    defect_thresholds_primary: null,
    defect_thresholds_secondary: null,
    max_taints_allowed: null,
    max_faults_allowed: null,
    screen_size_requirements: null,
  },
  cuppingScores: [],
  masterCupperId: null,
  greenBean: { screen_sizes: { '18': 272, '15': 689, Pan: 39 } },
})

describe('buildIssuedGreenBean', () => {
  it('writes issued percentages into the grams slot without touching the input', () => {
    const green = { screen_sizes: { '18': 272, '15': 689, Pan: 39 } }
    const out = buildIssuedGreenBean(green, {
      screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 },
      defects: null,
    })
    expect(out.screen_sizes).toEqual({ '18': 30, '15': 66.1, Pan: 3.9 })
    expect(green.screen_sizes['18']).toBe(272)
  })

  it('writes issued defect counts and totals together', () => {
    const out = buildIssuedGreenBean(
      { defects: { counts: { Broken: 60 }, primary: 2, secondary: 12 } } as never,
      { screen_percentages: null, defects: { counts: { Broken: 50 }, primary: 2, secondary: 10, total: 12 } },
    )
    expect(out.defects).toMatchObject({ counts: { Broken: 50 }, primary: 2, secondary: 10 })
  })
})

describe('computeIssuedValues', () => {
  it('issues a distribution that the compliance gate then passes', () => {
    const r = computeIssuedValues({
      inputs: baseInputs(),
      screenPercentages: { '18': 27.2, '15': 68.9, Pan: 3.9 },
      screenLimits: [{ screen_size: '18', min: 30 }],
      defectCounts: null,
      defectConfigs: configs,
      defectLimits: {},
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.screen_percentages?.['18']).toBeCloseTo(30)
  })

  it('refuses when the adjusted values would still violate the gate', () => {
    const inputs = baseInputs()
    inputs.parameters.moisture_max = 11
    inputs.greenBean = { ...inputs.greenBean!, moisture_percentage: 13 }
    const r = computeIssuedValues({
      inputs,
      screenPercentages: { '18': 27.2, '15': 68.9, Pan: 3.9 },
      screenLimits: [{ screen_size: '18', min: 30 }],
      defectCounts: null,
      defectConfigs: configs,
      defectLimits: {},
    })
    expect(r.ok).toBe(false)
  })

  it('propagates a distribution refusal', () => {
    const r = computeIssuedValues({
      inputs: baseInputs(),
      screenPercentages: { '18': 27.2, '15': 68.9, Pan: 3.9 },
      screenLimits: [
        { screen_size: '18', min: 30 },
        { screen_size: '15', min: 68.9 },
        { screen_size: 'Pan', min: 3.9 },
      ],
      defectCounts: null,
      defectConfigs: configs,
      defectLimits: {},
    })
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tolerance/issued-values.test.ts`
Expected: FAIL — cannot find module `./issued-values`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tolerance/issued-values.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tolerance/issued-values.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tolerance/issued-values.ts src/lib/tolerance/issued-values.test.ts
git commit -m "feat(tolerance): prove issued values with the gate that judged the raw ones"
```

---

### Task 5: Migration — flag column and audit table

**Files:**
- Create: `database/migrations/20260911000000_tolerance_approval.sql`

**Interfaces:**
- Produces: `samples.approved_with_comments boolean`, table `sample_tolerance_approvals`.

**DO NOT RUN THIS MIGRATION.** Daniel applies migrations manually.

- [ ] **Step 1: Write the migration**

Create `database/migrations/20260911000000_tolerance_approval.sql`:

```sql
-- Approval with comments: a lot that misses a limit inside tolerance is approved
-- with a record of what was issued to the buyer and what the seller must fix.
--
-- Deliberately NOT a new sample_status value: `status = 'approved'` gates the
-- certificate-minting trigger and qc_billing_feed, so a third enum value would
-- leave these samples with no certificate number and no invoice.

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS approved_with_comments boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN samples.approved_with_comments IS
  'True when this approval carried tolerance comments. Status stays approved; buyer-side audiences see plain Approved.';

CREATE TABLE IF NOT EXISTS sample_tolerance_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The LAB-SOURCE sample: a lot spanning N contracts is N samples rows sharing
  -- one graded lab unit, so the decision is stored once for the whole group.
  sample_id uuid NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  -- Per metric: key, label, actual, limit, gap, tolerance applied.
  metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- { screen_percentages: {...}, defects: { counts, primary, secondary, total } }
  issued_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The seller comment lines exactly as confirmed by the lab user.
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_additional_sample boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sample_tolerance_approvals IS
  'Append-only audit of tolerance approvals. Raw measured values are never overwritten; issued values live here only.';

CREATE INDEX IF NOT EXISTS idx_sample_tolerance_approvals_sample
  ON sample_tolerance_approvals (sample_id, decided_at DESC);

ALTER TABLE sample_tolerance_approvals ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user, matching how samples themselves read.
-- Writes go through the service-role, staff-gated API route only.
DROP POLICY IF EXISTS "tolerance_approvals_read" ON sample_tolerance_approvals;
CREATE POLICY "tolerance_approvals_read" ON sample_tolerance_approvals
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Verify the SQL parses without running it**

Run: `grep -c ";" database/migrations/20260911000000_tolerance_approval.sql`
Expected: a non-zero count. Do **not** execute the file against any database.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/20260911000000_tolerance_approval.sql
git commit -m "feat(db): tolerance approval flag and audit table (not applied)"
```

- [ ] **Step 4: Tell Daniel the migration is ready**

Report that `20260911000000_tolerance_approval.sql` needs applying before the code reaches `main`, since Vercel auto-deploys `main` to production.

---

### Task 6: Read the stored decision, and let compliance judge issued values

**Files:**
- Create: `src/lib/tolerance/fetch.ts`
- Modify: `src/lib/compliance.ts`
- Test: `src/lib/tolerance/fetch.test.ts`

**Interfaces:**
- Consumes: `resolveLabSourceId` from `@/lib/sample-group`, `buildIssuedGreenBean`/`IssuedValues` (Task 4).
- Produces: `ToleranceApproval { issued_values: IssuedValues; metrics: unknown[]; comments: unknown[]; request_additional_sample: boolean; decided_at: string }`, `fetchToleranceApproval(db, sampleId, labSourceId?): Promise<ToleranceApproval | null>` (full row, INTERNAL surfaces only), `fetchIssuedValues(db, sampleId, labSourceId?): Promise<IssuedValues | null>` (issued values only, BUYER-FACING and public surfaces); `evaluateSampleCompliance` and `evaluateQualityCompliance` gain a trailing `options?: { values?: 'actual' | 'issued' }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tolerance/fetch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fetchToleranceApproval } from './fetch'

function db(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  const chain = () => q
  q.select = chain
  q.eq = chain
  q.order = chain
  q.limit = () => Promise.resolve({ data: rows, error: null })
  return {
    from: () => q,
    // resolveLabSourceId reads samples; return the id unchanged.
    _samples: rows,
  } as never
}

describe('fetchToleranceApproval', () => {
  it('returns null when the lot has no decision', async () => {
    const r = await fetchToleranceApproval(db([]), 'lab-1', 'lab-1')
    expect(r).toBeNull()
  })

  it('returns the most recent decision', async () => {
    const r = await fetchToleranceApproval(
      db([
        {
          issued_values: { screen_percentages: { '18': 30 }, defects: null },
          metrics: [], comments: [], request_additional_sample: true,
          decided_at: '2026-09-10T12:00:00Z',
        },
      ]),
      'lab-1',
      'lab-1',
    )
    expect(r?.issued_values.screen_percentages).toEqual({ '18': 30 })
    expect(r?.request_additional_sample).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tolerance/fetch.test.ts`
Expected: FAIL — cannot find module `./fetch`.

- [ ] **Step 3: Write the fetch helper**

Create `src/lib/tolerance/fetch.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLabSourceId } from '@/lib/sample-group'
import type { IssuedValues } from './issued-values'

export interface ToleranceApproval {
  issued_values: IssuedValues
  metrics: unknown[]
  comments: unknown[]
  request_additional_sample: boolean
  decided_at: string
}

/**
 * The tolerance decision for a lot, or null.
 *
 * Decisions are keyed on the LAB-SOURCE sample: a contract sibling has no
 * grading of its own, so reading its own id would show a sibling certificate
 * raw values while the lab unit's certificate showed issued ones.
 *
 * `labSourceId` may be passed when the caller already resolved it, which every
 * certificate path has done by the time it gets here.
 */
export async function fetchToleranceApproval(
  db: SupabaseClient<any>,
  sampleId: string,
  labSourceId?: string,
): Promise<ToleranceApproval | null> {
  const id = labSourceId ?? (await resolveLabSourceId(db, sampleId))
  const { data, error } = await db
    .from('sample_tolerance_approvals')
    .select('issued_values, metrics, comments, request_additional_sample, decided_at')
    .eq('sample_id', id)
    .order('decided_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  const row = data[0] as Record<string, unknown>
  return {
    issued_values: (row.issued_values as IssuedValues) ?? { screen_percentages: null, defects: null },
    metrics: (row.metrics as unknown[]) ?? [],
    comments: (row.comments as unknown[]) ?? [],
    request_additional_sample: !!row.request_additional_sample,
    decided_at: String(row.decided_at ?? ''),
  }
}

/**
 * The issued values ALONE, for buyer-facing and public surfaces.
 *
 * The stored row keeps the seller's comments and the raw out-of-spec metrics
 * beside the buyer-safe issued values. The public certificate page is
 * server-side but UNAUTHENTICATED and queries with the service role, so RLS is
 * no backstop there — anything the query returns is one render mistake away
 * from a buyer. Selecting only `issued_values` makes the feature's central
 * promise (the buyer never sees the comments or the real numbers) a property of
 * the query rather than a discipline in the template.
 *
 * Internal surfaces that legitimately need the comments use
 * fetchToleranceApproval instead.
 */
export async function fetchIssuedValues(
  db: SupabaseClient<any>,
  sampleId: string,
  labSourceId?: string,
): Promise<IssuedValues | null> {
  const id = labSourceId ?? (await resolveLabSourceId(db, sampleId))
  const { data, error } = await db
    .from('sample_tolerance_approvals')
    .select('issued_values')
    .eq('sample_id', id)
    .order('decided_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  const row = data[0] as Record<string, unknown>
  return (row.issued_values as IssuedValues) ?? { screen_percentages: null, defects: null }
}
```

- [ ] **Step 4: Add the `values` option to compliance**

In `src/lib/compliance.ts`, add the import and the option. Change the two exported signatures and the final `evaluateCompliance` call:

```ts
import { fetchIssuedValues } from '@/lib/tolerance/fetch'
import { buildIssuedGreenBean } from '@/lib/tolerance/issued-values'

export interface ComplianceOptions {
  /**
   * Which numbers to judge. 'actual' (the default) is what the approval gate and
   * every internal view use. 'issued' is for BUYER-FACING surfaces — the public
   * QR page, the buyer PDF, the portal — so they render the values printed on the
   * certificate rather than the raw measurements.
   */
  values?: 'actual' | 'issued'
}
```

Give both `evaluateQualityCompliance` and `evaluateSampleCompliance` a trailing `options?: ComplianceOptions` parameter, pass it through from the former to the latter, and in `evaluateSampleCompliance` replace the final block:

```ts
  let greenBean = (qualityAssessment?.green_bean_data as GreenBeanData) ?? null
  if (options?.values === 'issued') {
    const issued = await fetchIssuedValues(supabase, sampleId, sampleId)
    if (issued) greenBean = buildIssuedGreenBean(greenBean, issued)
  }

  const inputs: ComplianceInputs = {
    parameters,
    template: { /* unchanged */ } satisfies TemplateThresholds,
    cuppingScores: (cuppingScores || []) as unknown as CuppingScoreRow[],
    masterCupperId,
    greenBean,
    scoreResolution,
    resolvedDefects,
  }

  return evaluateCompliance(inputs)
```

Note `sampleId` has already been reassigned to the lab-source id earlier in the function, which is why it is passed as both arguments.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/lib/tolerance/ && npx tsc --noEmit`
Expected: all tolerance tests PASS; no type errors. Every existing caller omits `options`, so behaviour is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tolerance/fetch.ts src/lib/tolerance/fetch.test.ts src/lib/compliance.ts
git commit -m "feat(tolerance): let buyer-facing surfaces judge issued values"
```

---

### Task 7: `certificate-data` returns resolved percentages

**Files:**
- Modify: `src/lib/certificate-data.ts` (around the `screen_sizes` assignment at line 717)
- Test: `src/lib/certificate-data-issued.test.ts`

**Interfaces:**
- Consumes: `fetchIssuedValues` (Task 6) — certificate rendering is buyer-facing, so it must NOT pull the seller comments into scope.
- Produces: `GreenBeanAnalysis` gains `screen_percentages: Record<string, number> | null` and `issued: boolean`.

The PDF currently receives grams and converts them itself. Returning resolved percentages moves that conversion to one place so the PDF and the public page cannot drift.

- [ ] **Step 1: Write the failing test**

Create `src/lib/certificate-data-issued.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveScreenPercentages } from './certificate-data'

describe('resolveScreenPercentages', () => {
  it('derives percentages from grams when there is no decision', () => {
    const r = resolveScreenPercentages({ '18': 272, '15': 689, Pan: 39 }, null)
    expect(r?.percentages['18']).toBeCloseTo(27.2)
    expect(r?.percentages['15']).toBeCloseTo(68.9)
    expect(r?.issued).toBe(false)
  })

  it('prefers issued percentages over the grams', () => {
    const r = resolveScreenPercentages(
      { '18': 272, '15': 689, Pan: 39 },
      { screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 }, defects: null },
    )
    expect(r?.percentages['18']).toBeCloseTo(30)
    expect(r?.issued).toBe(true)
  })

  it('returns null when there are no screens', () => {
    expect(resolveScreenPercentages(null, null)).toBeNull()
    expect(resolveScreenPercentages({}, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/certificate-data-issued.test.ts`
Expected: FAIL — `resolveScreenPercentages` is not exported.

- [ ] **Step 3: Add the resolver and use it**

In `src/lib/certificate-data.ts`, export the resolver:

```ts
import type { IssuedValues } from '@/lib/tolerance/issued-values'

/**
 * The screen percentages a certificate should print.
 *
 * One place, so the PDF and the public QR page cannot disagree — they used to
 * derive this separately, which is why an earlier override reached the PDF only.
 */
export function resolveScreenPercentages(
  grams: Record<string, number> | null | undefined,
  issued: IssuedValues | null,
): { percentages: Record<string, number>; issued: boolean } | null {
  if (issued?.screen_percentages && Object.keys(issued.screen_percentages).length > 0) {
    return { percentages: { ...issued.screen_percentages }, issued: true }
  }
  if (!grams || Object.keys(grams).length === 0) return null
  const total = Object.values(grams).reduce((s, g) => s + (typeof g === 'number' ? g : 0), 0)
  if (total <= 0) return null
  const percentages: Record<string, number> = {}
  for (const [size, g] of Object.entries(grams)) {
    percentages[size] = ((typeof g === 'number' ? g : 0) / total) * 100
  }
  return { percentages, issued: false }
}
```

Then in the green-bean assembly (the block containing `screen_sizes: (gbd.screen_sizes as Record<string, number>) || null,` near line 717), fetch the decision and add the two fields alongside the existing `screen_sizes`, leaving the raw grams in place:

```ts
      // Buyer-facing: issued values only. The seller comments never enter scope here.
      const issuedValues = await fetchIssuedValues(supabase, sampleId, labSourceSampleId)
      const resolvedScreens = resolveScreenPercentages(
        gbd.screen_sizes as Record<string, number> | null,
        issuedValues,
      )
      // ... inside the returned green bean analysis object:
      screen_sizes: (gbd.screen_sizes as Record<string, number>) || null,
      screen_percentages: resolvedScreens?.percentages ?? null,
      issued: resolvedScreens?.issued ?? false,
```

Add `screen_percentages: Record<string, number> | null` and `issued: boolean` to the `GreenBeanAnalysis` interface near line 41. Use the lab-source id the function already resolved for its assessment lookup; if it is held in a differently named local, pass that variable instead of `labSourceSampleId`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/certificate-data-issued.test.ts && npx tsc --noEmit`
Expected: PASS, 3 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificate-data.ts src/lib/certificate-data-issued.test.ts
git commit -m "feat(certificate): resolve screen percentages once, issued or raw"
```

---

### Task 8: The buyer PDF prints issued values

**Files:**
- Modify: `src/components/pdf/certificate/quality-certificate.tsx:83-95`
- Modify: `src/lib/certificate-data.ts` (defect rows, same assembly block as Task 7)

**Interfaces:**
- Consumes: `screen_percentages`, `issued` (Task 7).

The PDF must not re-derive percentages, and must not flag an issued value as out of spec.

- [ ] **Step 1: Replace the PDF's own conversion**

In `src/components/pdf/certificate/quality-certificate.tsx`, replace the `screenSizes` block at lines 83-95 with a read of the resolved field:

```tsx
  // Screen percentages are resolved in certificate-data.ts — issued values when
  // the lot was approved with comments, derived from grams otherwise. Deriving
  // them here again is what made the PDF disagree with the public QR page.
  const screenSizes = (() => {
    const resolved = greenBeanAnalysis?.screen_percentages
    if (!resolved) return null
    return Object.entries(resolved).map(([size, percentage]) => ({ size, percentage }))
  })()
```

- [ ] **Step 2: Use issued defect counts for the defect rows**

In the defect assembly in `src/lib/certificate-data.ts` (the `primary`/`secondary` mapping that produces `rawCount` and `weightedCount`), take counts from the decision when present so the category rows and the printed total reconcile:

```ts
      const issuedDefects = issuedValues?.defects ?? null
      const countFor = (name: string, raw: number): number =>
        issuedDefects ? (issuedDefects.counts[name] ?? raw) : raw
```

Apply `countFor(d.name, d.rawCount)` wherever `rawCount` is built, and recompute `weightedCount` as `countFor(...) * d.weight`.

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; the whole suite passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/pdf/certificate/quality-certificate.tsx src/lib/certificate-data.ts
git commit -m "feat(certificate): the buyer PDF prints issued values"
```

---

### Task 9: The public QR page prints the same issued values

**Files:**
- Modify: `src/app/certificate/[...path]/page.tsx:327-425`
- Test: `src/app/certificate/[...path]/issued-parity.test.ts`

**Interfaces:**
- Consumes: `resolveScreenPercentages` (Task 7), `fetchIssuedValues` (Task 6) — this page is PUBLIC, so it must never query the seller comments — and `evaluateSampleCompliance` with `{ values: 'issued' }` (Task 6).

This is the spec's non-negotiable: a buyer scanning the tin must not see different numbers from the PDF.

- [ ] **Step 1: Write the failing parity test**

Create `src/app/certificate/[...path]/issued-parity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveScreenPercentages } from '@/lib/certificate-data'

import { readFileSync } from 'node:fs'

/**
 * The PDF and the public page must print the same numbers.
 *
 * Comparing the shared helper to itself would prove nothing, so this pins two
 * things that can actually break: the helper's concrete output, and the fact
 * that NEITHER render path still derives percentages on its own. The second is
 * the real guard — the old divergence existed precisely because both files
 * carried their own `grams / total * 100`.
 */
describe('issued value parity', () => {
  const grams = { '18': 272, '15': 689, Pan: 39 }
  const issued = { screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 }, defects: null }

  it('derives concrete percentages with no decision on file', () => {
    const r = resolveScreenPercentages(grams, null)
    expect(r?.issued).toBe(false)
    expect(r?.percentages['18']).toBeCloseTo(27.2)
    expect(r?.percentages['15']).toBeCloseTo(68.9)
    expect(r?.percentages.Pan).toBeCloseTo(3.9)
  })

  it('returns the issued percentages verbatim when a decision is on file', () => {
    const r = resolveScreenPercentages(grams, issued)
    expect(r?.issued).toBe(true)
    expect(r?.percentages).toEqual({ '18': 30, '15': 66.1, Pan: 3.9 })
  })

  it.each([
    ['src/components/pdf/certificate/quality-certificate.tsx'],
    ['src/app/certificate/[...path]/page.tsx'],
  ])('%s does not derive screen percentages itself', (file) => {
    const src = readFileSync(file, 'utf8')
    // Both files must read the resolved percentages, never recompute them.
    expect(src).not.toMatch(/totalGrams/)
    expect(src).not.toMatch(/\/\s*total\s*\)\s*\*\s*100/)
  })
})
```

- [ ] **Step 2: Run the test to see the guard fail**

Run: `npx vitest run "src/app/certificate/[...path]/issued-parity.test.ts"`
Expected: the two `resolveScreenPercentages` cases PASS (Task 7 landed them), and **both source-guard cases FAIL** — at this point the PDF and the public page still derive percentages themselves. That failure is the point of the task; Steps 3-4 remove those derivations.

- [ ] **Step 3: Point the page at the shared resolver**

In `src/app/certificate/[...path]/page.tsx`, fetch the decision next to the existing green-bean read and replace the local percentage derivation around lines 327-425:

```tsx
import { resolveScreenPercentages } from '@/lib/certificate-data'
import { fetchIssuedValues } from '@/lib/tolerance/fetch'

// ... alongside the existing sample/assessment fetch.
// This page is PUBLIC and queries with the service role, so RLS is no backstop:
// fetch the issued values ONLY, never the seller comments.
const issuedValues = await fetchIssuedValues(supabase, sampleId)
const resolvedScreens = resolveScreenPercentages(
  greenBeanData?.screen_sizes ?? null,
  issuedValues,
)
```

Then feed the existing pan-grouping and row rendering from `resolvedScreens.percentages` instead of the locally computed map. Keep the existing `isPan` grouping logic and labels exactly as they are — only the source of the percentages changes.

- [ ] **Step 4: Make the checklist and verdict judge issued values**

This page is buyer-facing, so its `spec-checklist` and `verdict` must show the certificate's own numbers as passing. Pass the new option at the page's `evaluateSampleCompliance` call:

```tsx
const criteria = await evaluateSampleCompliance(
  supabase, sampleId, qualitySpecId, assignedCupperIds, { values: 'issued' },
)
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; suite passes.

- [ ] **Step 6: Commit**

```bash
git add "src/app/certificate/[...path]/page.tsx" "src/app/certificate/[...path]/issued-parity.test.ts"
git commit -m "feat(certificate): the QR page and the PDF print the same issued values"
```

---

### Task 10: The approve-with-comments API route

**Files:**
- Create: `src/app/api/samples/[id]/approve-with-comments/route.ts`
- Test: `src/app/api/samples/[id]/approve-with-comments/route.test.ts`

**Interfaces:**
- Consumes: `evaluateSampleCompliance` (Task 6), `evaluateTolerance` (Task 1), `computeIssuedValues` (Task 4), `groupSampleIds`/`resolveLabSourceId` from `@/lib/sample-group`, `isStaffSampleManager` from `@/lib/auth/sample-access`.
- Produces: `POST /api/samples/[id]/approve-with-comments`, body `{ comments: string[]; request_additional_sample: boolean }`; and `GET /api/samples/[id]/tolerance` returning `{ assessment, issued, blocked }`.

**Security:** service-role routes bypass RLS, so `getUser()` alone is an IDOR — a `/portal` client shares the same Supabase auth. Gate with `isStaffSampleManager`, matching `certificates/batch-send/queue/route.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/samples/[id]/approve-with-comments/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDecision } from './route'

describe('buildDecision', () => {
  const items = [
    { key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution' as const,
      direction: 'min' as const, actual: 27.2, limit: 30, gap: 2.8, tolerance: 5 },
  ]

  it('records every metric with its gap and tolerance', () => {
    const d = buildDecision({
      items,
      issued: { screen_percentages: { '18': 30 }, defects: null },
      comments: ['Melhorar peneira 18 para no minimo 30%.'],
      requestAdditionalSample: true,
      userId: 'user-1',
    })
    expect(d.metrics).toHaveLength(1)
    expect(d.metrics[0]).toMatchObject({ key: 'screen_18_min', gap: 2.8, tolerance: 5 })
    expect(d.issued_values.screen_percentages).toEqual({ '18': 30 })
    expect(d.request_additional_sample).toBe(true)
    expect(d.decided_by).toBe('user-1')
  })

  it('drops blank comment lines', () => {
    const d = buildDecision({
      items, issued: { screen_percentages: null, defects: null },
      comments: ['  ', 'Reduzir fundo.'], requestAdditionalSample: false, userId: 'u',
    })
    expect(d.comments).toEqual(['Reduzir fundo.'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/samples/[id]/approve-with-comments/route.test.ts"`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route**

Create `src/app/api/samples/[id]/approve-with-comments/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { evaluateSampleCompliance } from '@/lib/compliance'
import { evaluateTolerance } from '@/lib/tolerance/evaluate'
import { computeIssuedValues, type IssuedValues } from '@/lib/tolerance/issued-values'
import { groupSampleIds, resolveLabSourceId } from '@/lib/sample-group'
import type { ToleranceItem } from '@/lib/tolerance/types'

export interface DecisionRow {
  metrics: ToleranceItem[]
  issued_values: IssuedValues
  comments: string[]
  request_additional_sample: boolean
  decided_by: string
}

/** Pure: shape the audit row. Exported so it can be tested without a database. */
export function buildDecision(args: {
  items: ToleranceItem[]
  issued: IssuedValues
  comments: string[]
  requestAdditionalSample: boolean
  userId: string
}): DecisionRow {
  return {
    metrics: args.items,
    issued_values: args.issued,
    comments: args.comments.map((c) => c.trim()).filter(Boolean),
    request_additional_sample: args.requestAdditionalSample,
    decided_by: args.userId,
  }
}

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Service-role bypasses RLS, so getUser() alone would be an IDOR: a /portal
  // client shares the same Supabase auth.
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const comments: string[] = Array.isArray(body?.comments) ? body.comments : []
  const requestAdditionalSample = body?.request_additional_sample !== false

  const db = admin()
  const labSourceId = await resolveLabSourceId(db, params.id)

  const { data: sample } = await db
    .from('samples').select('id, quality_spec_id').eq('id', labSourceId).single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

  // Recompute server-side. Client-supplied issued values are never trusted.
  const criteria = await evaluateSampleCompliance(db, labSourceId, sample.quality_spec_id)
  const assessment = evaluateTolerance(criteria)
  if (!assessment.offered) {
    return NextResponse.json(
      { error: 'This sample is not within tolerance', blockedBy: assessment.blockedBy },
      { status: 409 },
    )
  }

  const issuedResult = await computeIssuedValuesForSample(db, labSourceId, sample.quality_spec_id)
  if (!issuedResult.ok) {
    return NextResponse.json({ error: issuedResult.reason }, { status: 409 })
  }

  const decision = buildDecision({
    items: assessment.items,
    issued: issuedResult.issued,
    comments,
    requestAdditionalSample,
    userId: user.id,
  })

  const { error: insertError } = await db
    .from('sample_tolerance_approvals')
    .insert({ sample_id: labSourceId, ...decision })
  if (insertError) {
    console.error('[approve-with-comments] insert', insertError)
    return NextResponse.json({ error: 'Could not record the decision' }, { status: 500 })
  }

  // The whole group is approved, exactly as an ordinary approval — which is what
  // lets the certificate trigger, the sys write-back and the billing feed run
  // untouched.
  const groupIds = await groupSampleIds(db, labSourceId)
  const { error: updateError } = await db
    .from('samples')
    .update({ status: 'approved', approved_with_comments: true })
    .in('id', groupIds)
  if (updateError) {
    console.error('[approve-with-comments] update', updateError)
    return NextResponse.json({ error: 'Could not approve the sample' }, { status: 500 })
  }

  return NextResponse.json({ data: { approved: groupIds.length, issued: issuedResult.issued } })
}
```

- [ ] **Step 4: Write the database-to-arguments helper**

Still in `src/app/api/samples/[id]/approve-with-comments/route.ts`, above the `POST` handler. It reads the template the same way `evaluateSampleCompliance` does, so the gate and the adjustment see identical limits:

```ts
import { screenGramsToPercent } from '@/lib/quality-resolvers'
import type { ScreenLimit } from '@/lib/tolerance/normalize-distribution'
import type { DefectLimits } from '@/lib/tolerance/normalize-defects'
import type { DefectConfig } from '@/types/defect-configuration'
import type { IssuedResult } from '@/lib/tolerance/issued-values'
import type { ComplianceInputs, GreenBeanData } from '@/lib/compliance-criteria'

/**
 * Template constraints → the flat {screen_size, min, max} shape the adjuster takes.
 *
 * The gate evaluates the legacy shape and the constraint shape INDEPENDENTLY
 * (criteria 6 and 6b in compliance-criteria.ts) and requires both to pass. So
 * where a size appears in both, the adjuster must satisfy the STRICTER of the
 * two — the highest minimum and the lowest maximum. Letting one format
 * overwrite the other would aim the adjustment at a limit the gate does not
 * enforce, and the proof step would then refuse a decision the banner had
 * already offered.
 */
function toScreenLimits(parameters: Record<string, any>, template: Record<string, any>): ScreenLimit[] {
  const out = new Map<string, ScreenLimit>()
  const tightenMin = (size: string, v: number) => {
    const cur = out.get(size) ?? { screen_size: size }
    out.set(size, { ...cur, min: cur.min === undefined ? v : Math.max(cur.min, v) })
  }
  const tightenMax = (size: string, v: number) => {
    const cur = out.get(size) ?? { screen_size: size }
    out.set(size, { ...cur, max: cur.max === undefined ? v : Math.min(cur.max, v) })
  }

  // Legacy shape: { "18": { min_percent, max_percent } }
  const legacy = template.screen_size_requirements as Record<string, any> | null
  if (legacy && typeof legacy === 'object') {
    for (const [size, req] of Object.entries(legacy)) {
      if (req?.min_percent !== undefined) tightenMin(size, req.min_percent)
      if (req?.max_percent !== undefined) tightenMax(size, req.max_percent)
    }
  }
  // Constraint shape: parameters.screen_size_requirements.constraints[]
  // 'exact' is deliberately skipped: evaluateTolerance never offers an exact
  // constraint, so there is nothing for the adjuster to aim at.
  for (const c of parameters?.screen_size_requirements?.constraints ?? []) {
    if (c.constraint_type === 'minimum' || c.constraint_type === 'range') {
      if (c.min_value !== undefined) tightenMin(c.screen_size, c.min_value)
    }
    if (c.constraint_type === 'maximum' || c.constraint_type === 'range') {
      if (c.max_value !== undefined) tightenMax(c.screen_size, c.max_value)
    }
  }
  return [...out.values()]
}

async function computeIssuedValuesForSample(
  db: ReturnType<typeof admin>,
  labSourceId: string,
  qualitySpecId: string | null,
): Promise<IssuedResult> {
  if (!qualitySpecId) return { ok: false, reason: 'This sample has no quality spec' }

  const { data: spec } = await db
    .from('client_qualities')
    .select(`id, template:quality_templates(
      parameters, defect_thresholds_primary, defect_thresholds_secondary,
      max_taints_allowed, max_faults_allowed, screen_size_requirements
    )`)
    .eq('id', qualitySpecId)
    .single()
  const template = (spec as any)?.template
  if (!template) return { ok: false, reason: 'Quality template not found' }
  const parameters = (template.parameters ?? {}) as Record<string, any>

  const { data: assessment } = await db
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', labSourceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const greenBean = ((assessment as any)?.green_bean_data ?? null) as GreenBeanData | null

  // Precedence MUST match the gate exactly (compliance-criteria.ts, criteria 3-5).
  // The gate reads the template column first for primary/secondary, but reads
  // `parameters.defect_thresholds_total` first for the total — an asymmetry that
  // looks like a typo and is not. Inverting either one would let the adjuster aim
  // at a limit the gate does not enforce, and the proof step would then refuse a
  // decision the banner had already offered.
  const thresholds = parameters?.defect_configuration?.thresholds ?? {}
  const defectLimits: DefectLimits = {
    max_primary: template.defect_thresholds_primary ?? thresholds.max_primary ?? undefined,
    max_secondary: template.defect_thresholds_secondary ?? thresholds.max_secondary ?? undefined,
    max_total: parameters.defect_thresholds_total ?? thresholds.max_total ?? undefined,
  }
  const defectConfigs = (parameters?.defect_configuration?.defects ?? []) as DefectConfig[]
  const defectCounts =
    ((greenBean?.defects as any)?.counts as Record<string, number> | undefined) ?? null

  const inputs: ComplianceInputs = {
    parameters,
    template: {
      defect_thresholds_primary: template.defect_thresholds_primary ?? null,
      defect_thresholds_secondary: template.defect_thresholds_secondary ?? null,
      max_taints_allowed: template.max_taints_allowed ?? null,
      max_faults_allowed: template.max_faults_allowed ?? null,
      screen_size_requirements: template.screen_size_requirements ?? null,
    },
    cuppingScores: [],
    masterCupperId: null,
    greenBean,
  }

  return computeIssuedValues({
    inputs,
    screenPercentages: screenGramsToPercent(greenBean?.screen_sizes),
    screenLimits: toScreenLimits(parameters, template),
    defectCounts,
    defectConfigs,
    defectLimits,
  })
}
```

Note `cuppingScores` is empty here on purpose: the safety net only needs to prove the green-bean criteria the adjustment touched, and the cupping criteria were already proven non-failing by `evaluateTolerance` before this runs.

- [ ] **Step 5: Add the GET companion the grading page reads**

The grading page cannot compute a tolerance assessment itself — it holds only its own
ad-hoc `{errors, violatedScreens}` shape (`page.tsx:206,230`), never
`ComplianceCriterion[]`. Deriving criteria client-side would duplicate the approval
gate, which is the one thing this design exists to avoid. So the same file exposes a
read-only companion, reusing the helpers the POST already uses:

```ts
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = admin()
  const labSourceId = await resolveLabSourceId(db, params.id)
  const { data: sample } = await db
    .from('samples').select('id, quality_spec_id').eq('id', labSourceId).single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

  const criteria = await evaluateSampleCompliance(db, labSourceId, sample.quality_spec_id)
  const assessment = evaluateTolerance(criteria)
  // Only compute the preview when the banner would actually be offered.
  const issued = assessment.offered
    ? await computeIssuedValuesForSample(db, labSourceId, sample.quality_spec_id)
    : null

  return NextResponse.json({
    data: {
      assessment,
      issued: issued?.ok ? issued.issued : null,
      // When the values cannot be issued the banner must not be offered at all.
      blocked: issued && !issued.ok ? issued.reason : null,
    },
  })
}
```

The POST recomputes everything anyway, so this preview is advisory only and can never
widen what is approvable.

- [ ] **Step 6: Run the test and typecheck**

Run: `npx vitest run "src/app/api/samples/[id]/approve-with-comments/route.test.ts" && npx tsc --noEmit`
Expected: PASS, 2 tests; no type errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/samples/[id]/approve-with-comments"
git commit -m "feat(api): approve with comments, recomputed and staff-gated"
```

---

### Task 11: Prefilled Portuguese comment lines

**Files:**
- Create: `src/lib/tolerance/comments.ts`
- Test: `src/lib/tolerance/comments.test.ts`

**Interfaces:**
- Consumes: `ToleranceItem` (Task 1).
- Produces: `prefillComment(item: ToleranceItem): string`, `prefillComments(items: ToleranceItem[]): string[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tolerance/comments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prefillComment, prefillComments } from './comments'
import type { ToleranceItem } from './types'

const item = (over: Partial<ToleranceItem>): ToleranceItem => ({
  key: 'k', label: 'Screen 18', quadrant: 'distribution', direction: 'min',
  actual: 27.2, limit: 30, gap: 2.8, tolerance: 5, ...over,
})

describe('prefillComment', () => {
  it('asks to improve a short screen', () => {
    expect(prefillComment(item({}))).toBe('Melhorar peneira 18 para no mínimo 30%.')
  })

  it('asks to reduce the pan', () => {
    expect(prefillComment(item({ label: 'Pan', direction: 'max', actual: 7, limit: 5 })))
      .toBe('Reduzir fundo para no máximo 5%.')
  })

  it('asks to reduce defects', () => {
    expect(prefillComment(item({
      label: 'Total defects', quadrant: 'defects', direction: 'max', actual: 14, limit: 12,
    }))).toBe('Reduzir defeitos para no máximo 12.')
  })

  it('builds one line per item', () => {
    expect(prefillComments([item({}), item({ label: 'Pan', direction: 'max', limit: 5 })]))
      .toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tolerance/comments.test.ts`
Expected: FAIL — cannot find module `./comments`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tolerance/comments.ts`:

```ts
import type { ToleranceItem } from './types'

const trim = (n: number): string => String(Math.round(n * 10) / 10)

/**
 * The seller-facing line for one out-of-spec metric.
 *
 * Portuguese unconditionally: sellers here are Brazilian exporters, and the line
 * is editable in the confirm dialog, so a per-company language field buys
 * nothing at this stage.
 */
export function prefillComment(item: ToleranceItem): string {
  if (item.quadrant === 'defects') {
    return `Reduzir defeitos para no máximo ${trim(item.limit)}.`
  }
  if (item.label === 'Pan') {
    return `Reduzir fundo para no máximo ${trim(item.limit)}%.`
  }
  const size = item.label.replace(/^Screen\s+/i, '')
  if (item.direction === 'min') {
    return `Melhorar peneira ${size} para no mínimo ${trim(item.limit)}%.`
  }
  return `Reduzir peneira ${size} para no máximo ${trim(item.limit)}%.`
}

export function prefillComments(items: ToleranceItem[]): string[] {
  return items.map(prefillComment)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tolerance/comments.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tolerance/comments.ts src/lib/tolerance/comments.test.ts
git commit -m "feat(tolerance): prefilled Portuguese seller comment lines"
```

---

### Task 12: Grading banner and confirm dialog

**Files:**
- Create: `src/components/grading/tolerance-banner.tsx`, `src/components/grading/tolerance-confirm-dialog.tsx`
- Modify: `src/app/grading/page.tsx`

**Interfaces:**
- Consumes: `ToleranceAssessment`/`ToleranceItem` (Task 1), `prefillComments` (Task 11), `GET /api/samples/[id]/tolerance` and `POST /api/samples/[id]/approve-with-comments` (Task 10).
- Produces: `<ToleranceBanner assessment onApprove />`, `<ToleranceConfirmDialog open assessment issued onConfirm onCancel />`.

`grading/page.tsx` is 1722 lines against a ~2000-line ceiling, so only wiring goes in it.

- [ ] **Step 1: Write the banner**

Create `src/components/grading/tolerance-banner.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import type { ToleranceAssessment, ToleranceQuadrant } from '@/lib/tolerance/types'

interface Props {
  assessment: ToleranceAssessment
  /** Render only the items belonging to this quadrant, or all when omitted. */
  quadrant?: ToleranceQuadrant
  onApprove: () => void
}

const signed = (n: number, direction: 'min' | 'max') =>
  `${direction === 'min' ? '−' : '+'}${Math.round(n * 10) / 10}`

/**
 * One amber banner naming every metric inside tolerance. Misses confined to a
 * single quadrant render inside it; misses spanning both render once above the
 * pair, with `quadrant` omitted.
 */
export function ToleranceBanner({ assessment, quadrant, onApprove }: Props) {
  if (!assessment.offered) return null
  const items = quadrant ? assessment.items.filter((i) => i.quadrant === quadrant) : assessment.items
  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p className="font-semibold text-amber-900 dark:text-amber-200">
        {items.length === 1 ? '1 item within tolerance:' : `${items.length} items within tolerance:`}
      </p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">
        {items.map((i) => (
          `${i.label} — ${Math.round(i.actual * 10) / 10}${i.quadrant === 'distribution' ? '%' : ''}` +
          ` vs ${i.direction} ${i.limit}${i.quadrant === 'distribution' ? '%' : ''}` +
          ` (${signed(i.gap, i.direction)})`
        )).join(' · ')}
      </p>
      <Button type="button" size="sm" className="mt-3" onClick={onApprove}>
        Approve with comments
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Write the confirm dialog**

Create `src/components/grading/tolerance-confirm-dialog.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { prefillComments } from '@/lib/tolerance/comments'
import type { ToleranceAssessment, ToleranceQuadrant } from '@/lib/tolerance/types'
import type { IssuedValues } from '@/lib/tolerance/issued-values'

interface Props {
  open: boolean
  assessment: ToleranceAssessment
  issued: IssuedValues | null
  saving?: boolean
  onConfirm: (comments: string[], requestAdditionalSample: boolean) => void
  onCancel: () => void
}

const QUADRANT_TITLE: Record<ToleranceQuadrant, string> = {
  distribution: 'Screen distribution',
  defects: 'Defects',
}

export function ToleranceConfirmDialog({
  open, assessment, issued, saving, onConfirm, onCancel,
}: Props) {
  const [comments, setComments] = useState<string[]>([])
  const [additional, setAdditional] = useState(true)

  useEffect(() => {
    if (open) {
      setComments(prefillComments(assessment.items))
      setAdditional(true)
    }
  }, [open, assessment])

  const issuedFor = (label: string, quadrant: ToleranceQuadrant): string => {
    if (quadrant === 'defects') return issued?.defects ? String(issued.defects.total) : '—'
    const size = label.replace(/^Screen\s+/i, '')
    const map = issued?.screen_percentages
    const v = map ? (map[size] ?? map[label]) : undefined
    return v === undefined ? '—' : `${Math.round(v * 10) / 10}%`
  }

  const quadrants = (['distribution', 'defects'] as ToleranceQuadrant[]).filter((q) =>
    assessment.items.some((i) => i.quadrant === q),
  )

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Approve with comments</DialogTitle>
        </DialogHeader>

        {quadrants.map((q) => (
          <div key={q} className="mb-4">
            <h4 className="mb-2 text-sm font-semibold">{QUADRANT_TITLE[q]}</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-1 text-left">Metric</th>
                  <th className="py-1 text-right">Actual</th>
                  <th className="py-1 text-right">Issued</th>
                  <th className="py-1 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {assessment.items.filter((i) => i.quadrant === q).map((i) => (
                  <tr key={i.key} className="border-b last:border-0">
                    <td className="py-1.5">{i.label}</td>
                    <td className="py-1.5 text-right">
                      {Math.round(i.actual * 10) / 10}{q === 'distribution' ? '%' : ''}
                    </td>
                    <td className="py-1.5 text-right font-semibold">{issuedFor(i.label, q)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {i.direction === 'min' ? '+' : '−'}{Math.round(i.gap * 10) / 10}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Seller comment</h4>
          {comments.map((c, idx) => (
            <Input
              key={idx}
              value={c}
              onChange={(e) => {
                const next = [...comments]
                next[idx] = e.target.value
                setComments(next)
              }}
            />
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={additional} onCheckedChange={(v) => setAdditional(v === true)} />
          Request additional sample
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(comments, additional)} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Wire both into the grading page**

The page holds only its own ad-hoc `{errors, violatedScreens}` compliance shape
(`page.tsx:206,230`), never `ComplianceCriterion[]`, so it reads the assessment from
the GET endpoint built in Task 10 rather than deriving one. That keeps the approval
gate the single place criteria are computed, and gives the dialog real issued values
to display.

Add the imports and this state near the other sample-level state:

```tsx
import { ToleranceBanner } from '@/components/grading/tolerance-banner'
import { ToleranceConfirmDialog } from '@/components/grading/tolerance-confirm-dialog'
import type { ToleranceAssessment } from '@/lib/tolerance/types'
import type { IssuedValues } from '@/lib/tolerance/issued-values'

const [tolerance, setTolerance] = useState<{
  assessment: ToleranceAssessment
  issued: IssuedValues | null
} | null>(null)
const [toleranceOpen, setToleranceOpen] = useState(false)
const [toleranceSaving, setToleranceSaving] = useState(false)

// Refetched whenever the active sample changes. The server owns the assessment;
// deriving one here would duplicate the approval gate.
useEffect(() => {
  if (!activeSampleId) { setTolerance(null); return }
  let cancelled = false
  ;(async () => {
    try {
      const res = await fetch(`/api/samples/${activeSampleId}/tolerance`)
      if (!res.ok) { if (!cancelled) setTolerance(null); return }
      const { data } = await res.json()
      // `blocked` means the values could not be issued — offer nothing.
      if (!cancelled) {
        setTolerance(data.blocked ? null : { assessment: data.assessment, issued: data.issued })
      }
    } catch {
      if (!cancelled) setTolerance(null)
    }
  })()
  return () => { cancelled = true }
}, [activeSampleId])

const confirmTolerance = async (
  sampleId: string, comments: string[], requestAdditionalSample: boolean,
) => {
  setToleranceSaving(true)
  try {
    const res = await fetch(`/api/samples/${sampleId}/approve-with-comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments, request_additional_sample: requestAdditionalSample }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast({ title: 'Could not approve', description: json.error, variant: 'destructive' })
      return
    }
    setToleranceOpen(false)
    dropSampleFromQueue(sampleId)
    await refetchSamples()
  } finally {
    setToleranceSaving(false)
  }
}
```

Use the page's existing toast and refetch helpers under their real names, and its
existing name for the active sample id if it is not `activeSampleId`.

Render the combined banner above both cards, for the spanning case only:

```tsx
{tolerance && new Set(tolerance.assessment.items.map((i) => i.quadrant)).size > 1 && (
  <ToleranceBanner assessment={tolerance.assessment} onApprove={() => setToleranceOpen(true)} />
)}
```

Inside the Screen Size Distribution card, and again inside the defects card, render
the single-quadrant form — guarded so it stays silent when the combined banner above
is already covering both quadrants:

```tsx
{tolerance && new Set(tolerance.assessment.items.map((i) => i.quadrant)).size === 1 && (
  <ToleranceBanner
    assessment={tolerance.assessment}
    quadrant="distribution"   // "defects" in the defects card
    onApprove={() => setToleranceOpen(true)}
  />
)}
```

and mount the dialog once per page:

```tsx
{tolerance && (
  <ToleranceConfirmDialog
    open={toleranceOpen}
    assessment={tolerance.assessment}
    issued={tolerance.issued}
    saving={toleranceSaving}
    onCancel={() => setToleranceOpen(false)}
    onConfirm={(c, extra) => confirmTolerance(activeSampleId, c, extra)}
  />
)}
```

Exactly one banner is therefore visible in every case: the combined one when the
misses span both quadrants, otherwise the single one inside the affected quadrant.

- [ ] **Step 4: Typecheck and check the file size**

Run: `npx tsc --noEmit && wc -l src/app/grading/page.tsx`
Expected: no type errors; the page stays under 2000 lines. If it exceeds that, report it rather than continuing.

- [ ] **Step 5: Commit**

```bash
git add src/components/grading/tolerance-banner.tsx src/components/grading/tolerance-confirm-dialog.tsx src/app/grading/page.tsx
git commit -m "feat(grading): amber tolerance banner and confirm dialog"
```

---

### Task 13: The seller email carries the comments

**Files:**
- Create: `src/lib/approval-notification/tolerance-comment-block.ts`
- Modify: `src/lib/approval-notification/quality-summary.ts`
- Test: `src/lib/approval-notification/tolerance-comment-block.test.ts`

**Interfaces:**
- Consumes: `ToleranceItem` (Task 1).
- Produces: `buildToleranceBlock(items: ToleranceItem[], comments: string[], requestAdditionalSample: boolean): string` returning HTML.

`quality-summary.ts` is 36 KB; the builder lives in its own module and is called from there.

- [ ] **Step 1: Write the failing test**

Create `src/lib/approval-notification/tolerance-comment-block.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildToleranceBlock } from './tolerance-comment-block'
import type { ToleranceItem } from '@/lib/tolerance/types'

const screen: ToleranceItem = {
  key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution',
  direction: 'min', actual: 27.2, limit: 30, gap: 2.8, tolerance: 5,
}

describe('buildToleranceBlock', () => {
  it('states actual, required and gap for each item', () => {
    const html = buildToleranceBlock([screen], ['Melhorar peneira 18.'], false)
    expect(html).toContain('Screen 18')
    expect(html).toContain('27.2%')
    expect(html).toContain('30%')
    expect(html).toContain('Melhorar peneira 18.')
  })

  it('adds the additional sample request when ticked', () => {
    const html = buildToleranceBlock([screen], [], true)
    expect(html).toMatch(/amostra adicional/i)
  })

  it('omits the additional sample request when not ticked', () => {
    expect(buildToleranceBlock([screen], [], false)).not.toMatch(/amostra adicional/i)
  })

  it('returns an empty string when there is nothing to say', () => {
    expect(buildToleranceBlock([], [], false)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval-notification/tolerance-comment-block.test.ts`
Expected: FAIL — cannot find module `./tolerance-comment-block`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/approval-notification/tolerance-comment-block.ts`:

```ts
import { escapeHtml } from '@/lib/html'
import type { ToleranceItem } from '@/lib/tolerance/types'

const one = (n: number) => Math.round(n * 10) / 10

/**
 * The seller-only block for a lot approved with comments.
 *
 * Seller emails alone carry this: the buyer's copy shows the issued values with
 * no comments and no mention of tolerance. No greeting filler — straight to the
 * result, the way QC writes today.
 */
export function buildToleranceBlock(
  items: ToleranceItem[],
  comments: string[],
  requestAdditionalSample: boolean,
): string {
  if (items.length === 0 && comments.length === 0) return ''

  const unit = (i: ToleranceItem) => (i.quadrant === 'distribution' ? '%' : '')
  const rows = items
    .map(
      (i) => `<tr>
  <td style="padding:4px 8px;">${escapeHtml(i.label)}</td>
  <td style="padding:4px 8px;text-align:right;">${one(i.actual)}${unit(i)}</td>
  <td style="padding:4px 8px;text-align:right;">${i.direction === 'min' ? 'min' : 'max'} ${i.limit}${unit(i)}</td>
  <td style="padding:4px 8px;text-align:right;">${i.direction === 'min' ? '−' : '+'}${one(i.gap)}${unit(i)}</td>
</tr>`,
    )
    .join('\n')

  const lines = comments
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `<li>${escapeHtml(c)}</li>`)
    .join('\n')

  return `
<div style="margin-top:16px;">
  <p style="font-weight:600;margin:0 0 6px;">Aprovado com observações</p>
  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr>
        <th style="padding:4px 8px;text-align:left;">Item</th>
        <th style="padding:4px 8px;text-align:right;">Resultado</th>
        <th style="padding:4px 8px;text-align:right;">Exigido</th>
        <th style="padding:4px 8px;text-align:right;">Diferença</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
${lines ? `  <ul style="margin:10px 0 0;padding-left:18px;font-size:13px;">\n${lines}\n  </ul>` : ''}
${requestAdditionalSample ? '  <p style="margin:10px 0 0;font-size:13px;">Favor enviar uma amostra adicional.</p>' : ''}
</div>`.trim()
}
```

If `@/lib/html` does not export `escapeHtml`, use the escaping helper that file does export and adjust the import.

- [ ] **Step 4: Call it from the seller email**

In `src/lib/approval-notification/quality-summary.ts`, extend the per-sample row type
with the optional decision fields:

```ts
  /** Present only when this lot was approved with comments. Seller emails only. */
  toleranceItems?: ToleranceItem[]
  toleranceComments?: string[]
  requestAdditionalSample?: boolean
```

Then, in the branch already guarded by the `sellerComment` render option, append the
block after the existing note:

```ts
import { buildToleranceBlock } from './tolerance-comment-block'

// Seller emails only — the buyer's copy carries the issued values with no
// comments and no mention of tolerance.
if (opts.sellerComment && s.toleranceItems?.length) {
  html += buildToleranceBlock(
    s.toleranceItems,
    s.toleranceComments ?? [],
    s.requestAdditionalSample ?? false,
  )
}
```

Populate those three fields where the batch queue assembles its rows
(`src/app/api/certificates/batch-send/queue/route.ts`), reading the decision with
`fetchToleranceApproval(db, sampleId)` for samples whose `approved_with_comments` is
true. Leave the buyer branch untouched.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: whole suite passes, including the existing `quality-summary.test.ts` strings; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/approval-notification/tolerance-comment-block.ts src/lib/approval-notification/tolerance-comment-block.test.ts src/lib/approval-notification/quality-summary.ts
git commit -m "feat(email): the seller email carries the tolerance comments"
```

---

### Task 14: Internal views show actual, with issued as a secondary line

**Files:**
- Create: `src/components/samples/approved-with-comments-badge.tsx`
- Modify: `src/app/certificates/page.tsx`
- Test: `src/components/samples/approved-with-comments-badge.test.tsx`

**Interfaces:**
- Consumes: `IssuedValues` (Task 4).
- Produces: `<ApprovedWithCommentsBadge issued />`.

The spec requires internal surfaces to keep showing the real measurements with the
issued figures beneath them — the opposite of the buyer-facing surfaces, and the
reason `values` defaults to `'actual'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/samples/approved-with-comments-badge.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApprovedWithCommentsBadge } from './approved-with-comments-badge'

describe('ApprovedWithCommentsBadge', () => {
  it('names the issued screen values', () => {
    render(
      <ApprovedWithCommentsBadge
        issued={{ screen_percentages: { '18': 30, '15': 66.1 }, defects: null }}
      />,
    )
    expect(screen.getByText(/Approved with comments/i)).toBeTruthy()
    expect(screen.getByText(/Issued: Screen 18 30%/i)).toBeTruthy()
  })

  it('names the issued defect total', () => {
    render(
      <ApprovedWithCommentsBadge
        issued={{ screen_percentages: null, defects: { counts: {}, primary: 2, secondary: 10, total: 12 } }}
      />,
    )
    expect(screen.getByText(/Issued: 12 defects/i)).toBeTruthy()
  })

  it('renders nothing without a decision', () => {
    const { container } = render(<ApprovedWithCommentsBadge issued={null} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/samples/approved-with-comments-badge.test.tsx`
Expected: FAIL — cannot find module `./approved-with-comments-badge`.

- [ ] **Step 3: Write the component**

Create `src/components/samples/approved-with-comments-badge.tsx`:

```tsx
import type { IssuedValues } from '@/lib/tolerance/issued-values'

/**
 * Internal-only. Staff always read the real measurement; this is the secondary
 * line telling them what the buyer's certificate carries instead.
 */
export function ApprovedWithCommentsBadge({ issued }: { issued: IssuedValues | null }) {
  if (!issued) return null

  const parts: string[] = []
  for (const [size, pct] of Object.entries(issued.screen_percentages ?? {})) {
    parts.push(`Screen ${size} ${Math.round(pct * 10) / 10}%`)
  }
  if (issued.defects) parts.push(`${issued.defects.total} defects`)

  return (
    <div className="text-xs">
      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">
        Approved with comments
      </span>
      {parts.length > 0 && (
        <span className="ml-2 text-muted-foreground">Issued: {parts.join(' · ')}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Show it on the certificates list**

Add `approved_with_comments` to that page's sample select, and have the route feeding
the list attach the decision (`fetchToleranceApproval`) for the rows that carry one.
Then, in the status cell:

```tsx
import { ApprovedWithCommentsBadge } from '@/components/samples/approved-with-comments-badge'

{row.approved_with_comments && (
  <ApprovedWithCommentsBadge issued={row.toleranceIssued ?? null} />
)}
```

`row.toleranceIssued` is the `issued_values` object from the decision; name it to match
whatever row type that page already uses.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/components/samples/approved-with-comments-badge.test.tsx && npx tsc --noEmit`
Expected: PASS, 3 tests; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/samples/approved-with-comments-badge.tsx src/components/samples/approved-with-comments-badge.test.tsx src/app/certificates/page.tsx
git commit -m "feat(certificates): internal views show actual with the issued line"
```

---

## Final verification

- [ ] Run the whole suite: `npx vitest run` — everything green.
- [ ] Typecheck: `npx tsc --noEmit` — clean.
- [ ] Confirm `git grep -n "approved_with_comments" -- '*.sql'` shows the migration and that it has **not** been applied.
- [ ] Confirm `wc -l src/app/grading/page.tsx` is under 2000.
- [ ] Report to Daniel: the migration must be applied **before** the code reaches `main`, because Vercel auto-deploys `main` to production.

## Acceptance cases from the spec

Verify each by hand once the migration is applied:

- [ ] ME-1121: banner appears; issued screen 18 = 30.0%; raw stays 27.2%; total unchanged.
- [ ] Pan 7% vs max 5% → issued pan 5%, the smallest screen above receives the excess.
- [ ] Screen short and pan over on the same sample → one banner, one confirm, one pass.
- [ ] Defects over the limit → issued meets it, reduced from the largest secondary categories, primary untouched, categories reconcile to the printed total.
- [ ] Defect limit set on primary defects → no banner.
- [ ] Screen 18 at 24% (gap 6) → no banner, rejection flow.
- [ ] Cupping or moisture also failing → no banner.
- [ ] Lot with no per-category defect counts → no banner.
- [ ] Buyer PDF and public QR page both show 30%; seller email shows 27.2% vs 30%, the gap, the improve request and the additional-sample line.
