# Compliance Core Extraction Implementation Plan (Phase 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the quality-compliance rules out of their database queries so the public certificate page and the approval gate judge a lot with one shared rule set, and fix the grams-rendered-as-percent bug on three public surfaces.

**Architecture:** Two new pure modules — `quality-resolvers.ts` (turns stored shapes into numbers) and `compliance-criteria.ts` (applies thresholds, returns a structured pass/fail list). `evaluateQualityCompliance` keeps its exact signature and its four queries, but delegates the deciding and rebuilds its `violations` strings from the structured list. Characterization tests pin the gate's current output before anything moves.

**Tech Stack:** TypeScript, Next.js 14 App Router, Supabase, vitest (jsdom, globals, colocated `*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-08-06-mobile-certificate-page-design.md`

Phase 2 (`2026-08-06-certificate-page-rebuild.md`) consumes what this plan produces. Do not start it until this plan's Task 5 is committed and green.

## Global Constraints

- `evaluateQualityCompliance` keeps its **exact** signature and return type. Nothing that calls it may need to change.
- Its `violations` strings must stay **byte-identical**. They are asserted character for character in Task 1 and re-asserted in Task 4.
- **Total defects is always `primary + secondary`, computed.** `green_bean_data.defects.total` is never read. Primary, secondary and total are three independent checks.
- Where the page and the gate read a field differently, **the gate's reading wins** and the page moves to it. This plan does not change any approval outcome.
- `green_bean_data.screen_sizes` stores **grams**. Percentages are derived, never stored.
- Run tests with `npx vitest run <path>`. **Never `npm test`** — it starts watch mode and hangs the session.
- The repo has no Supabase mock harness and this plan does not add a general one. Task 1's fake client lives in its own test file and is used by that file only.
- The working tree may carry unrelated changes and concurrent commits from other sessions. Stage only your own files; **never `git add -A`**, never `git stash`.
- Keep files under ~2000 lines.

---

### Task 1: Pin the gate's current behaviour

**Files:**
- Test: `src/lib/compliance.characterization.test.ts` (create)

**Interfaces:**
- Consumes: `evaluateQualityCompliance(supabase, sampleId, qualitySpecId, assignedCupperIds?)` from `@/lib/compliance`, unchanged.
- Produces: nothing importable. This file is the safety net for Task 4.

`compliance.ts` has no tests and gates real approvals. Before restructuring it, capture exactly what it outputs today. **These tests describe current behaviour, not desired behaviour.** If an assertion fails in this task, the code's actual output is correct by definition — update the test to match it. Do not change `compliance.ts` in this task.

- [ ] **Step 1: Write the fake Supabase client and the first tests**

Create `src/lib/compliance.characterization.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateQualityCompliance } from './compliance'

/**
 * A minimal stand-in for the Supabase client, covering only the four query
 * shapes compliance.ts uses. Every builder method returns the same chainable
 * object; awaiting it, or calling .single()/.maybeSingle(), yields whatever was
 * configured for that table.
 *
 * This is deliberately local to this file. The repo tests pure functions and
 * has no shared Supabase mock; adding one would invite route tests that mock
 * the database instead of extracting the logic — which is exactly what this
 * plan is undoing.
 */
type TableResult = { data: unknown; error?: unknown }

function fakeSupabase(tables: Record<string, TableResult>) {
  const build = (table: string) => {
    const result: TableResult = tables[table] ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'contains', 'order', 'limit']) {
      chain[method] = () => chain
    }
    chain.single = async () => result
    chain.maybeSingle = async () => result
    // compliance.ts awaits the cupping_scores builder directly, without a
    // terminal method, so the chain has to be thenable.
    chain.then = (resolve: (v: TableResult) => unknown) => resolve(result)
    return chain
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => build(table) } as any
}

/** A template row with no thresholds set. Spread and override per test. */
const emptyTemplate = {
  id: 'tpl-1',
  name: 'Test',
  parameters: {},
  defect_thresholds_primary: null,
  defect_thresholds_secondary: null,
  max_taints_allowed: null,
  max_faults_allowed: null,
  screen_size_requirements: null,
}

function specRow(template: Record<string, unknown>) {
  return { data: { id: 'spec-1', custom_name: 'Test', template }, error: null }
}

describe('evaluateQualityCompliance — characterization', () => {
  it('auto-approves when there is no quality spec', async () => {
    const result = await evaluateQualityCompliance(fakeSupabase({}), 'sample-1', null)
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it('auto-approves when the spec has no template', async () => {
    const supabase = fakeSupabase({ client_qualities: { data: { id: 'spec-1' }, error: null } })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it('approves a lot with no data to judge', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow(emptyTemplate),
      cupping_scores: { data: [] },
      quality_assessments: { data: null },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })
})
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/lib/compliance.characterization.test.ts`
Expected: PASS, 3 tests. If any fail, the expectation is wrong — read the actual output and correct the test.

- [ ] **Step 3: Pin the defect-count rules**

Append to the same file. Note the worked example from the spec: primary and secondary each pass their own limit while the computed total fails.

```ts
describe('evaluateQualityCompliance — defect counts', () => {
  const template = {
    ...emptyTemplate,
    defect_thresholds_primary: 1,
    defect_thresholds_secondary: 21,
    parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
  }

  function withDefects(primary: number, secondary: number) {
    return fakeSupabase({
      client_qualities: specRow(template),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { defects: { primary, secondary } } } },
    })
  }

  it('rejects on the computed total while primary and secondary each pass', async () => {
    const result = await evaluateQualityCompliance(withDefects(1, 21), 'sample-1', 'spec-1')
    expect(result.approved).toBe(false)
    expect(result.violations).toEqual(['Total defects: 22 exceeds limit (21)'])
  })

  it('approves when every count is inside its limit', async () => {
    const result = await evaluateQualityCompliance(withDefects(0, 21), 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it('reports primary, secondary and total independently', async () => {
    const result = await evaluateQualityCompliance(withDefects(5, 30), 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Primary defects: 5 exceeds limit (1)',
      'Secondary defects: 30 exceeds limit (21)',
      'Total defects: 35 exceeds limit (21)',
    ])
  })

  it('ignores a stored defects.total that disagrees with the sum', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow(template),
      cupping_scores: { data: [] },
      quality_assessments: {
        data: { green_bean_data: { defects: { primary: 1, secondary: 21, total: 5 } } },
      },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Total defects: 22 exceeds limit (21)'])
  })
})
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/lib/compliance.characterization.test.ts`
Expected: PASS, 7 tests. Correct any expectation that does not match actual output.

- [ ] **Step 5: Pin the screen-size rules, both formats**

Append. The input is **grams**; the engine normalises to percent, which is why 750g of 1000g reads as 75.0%.

```ts
describe('evaluateQualityCompliance — screen sizes', () => {
  const grams = { '16': 750, '15': 200, '14': 50 }

  it('normalises grams to percent (legacy template format)', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        screen_size_requirements: { '16': { min_percent: 80 } },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 16: 75.0% is below minimum (80%)'])
  })

  it('applies constraint-format minimums', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        parameters: {
          screen_size_requirements: {
            constraints: [{ screen_size: '16', constraint_type: 'minimum', min_value: 80 }],
          },
        },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 16: 75.0% is below minimum (80%)'])
  })

  it('applies constraint-format maximums', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        parameters: {
          screen_size_requirements: {
            constraints: [{ screen_size: '14', constraint_type: 'maximum', max_value: 2 }],
          },
        },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 14: 5.0% exceeds maximum (2%)'])
  })

  it('treats a screen absent from the data as 0%', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        screen_size_requirements: { '18': { min_percent: 10 } },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 18: 0.0% is below minimum (10%)'])
  })
})
```

- [ ] **Step 6: Run them**

Run: `npx vitest run src/lib/compliance.characterization.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 7: Pin the cupping-attribute rules, both template formats**

Append. `cupping_attributes` arrives as an array on newer templates and an object on older ones, and scores resolve master-cupper-first then mean.

```ts
describe('evaluateQualityCompliance — cupping attributes', () => {
  function withScores(
    parameters: Record<string, unknown>,
    scores: Array<{ cupper_id: string | null; scores: Record<string, number>; defects?: unknown }>,
    masterCupperId: string | null = null,
  ) {
    return fakeSupabase({
      client_qualities: specRow({ ...emptyTemplate, parameters }),
      cupping_scores: { data: scores },
      quality_assessments: { data: null },
      cupping_sessions: { data: masterCupperId ? { master_cupper_id: masterCupperId } : null },
    })
  }

  const arrayFormat = {
    cupping_attributes: [
      { attribute: 'Body', validation_rule: { min_value: 3, max_value: 5 } },
    ],
  }

  it('flags a score below the minimum (array template format)', async () => {
    const supabase = withScores(arrayFormat, [{ cupper_id: 'c1', scores: { Body: 2 } }])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 2.00 is below minimum (3)'])
  })

  it('flags a score above the maximum (array template format)', async () => {
    const supabase = withScores(arrayFormat, [{ cupper_id: 'c1', scores: { Body: 6 } }])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 6.00 is above maximum (5)'])
  })

  it('accepts the object template format', async () => {
    const supabase = withScores(
      { cupping_attributes: { Body: { min: 3, max: 5 } } },
      [{ cupper_id: 'c1', scores: { Body: 2 } }],
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 2.00 is below minimum (3)'])
  })

  it('averages across cuppers when no master cupper is designated', async () => {
    const supabase = withScores(arrayFormat, [
      { cupper_id: 'c1', scores: { Body: 2 } },
      { cupper_id: 'c2', scores: { Body: 4 } },
    ])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it("uses the master cupper's score instead of the mean", async () => {
    const supabase = withScores(
      arrayFormat,
      [
        { cupper_id: 'master', scores: { Body: 2 } },
        { cupper_id: 'c2', scores: { Body: 5 } },
      ],
      'master',
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 2.00 is below minimum (3)'])
  })

  it('ignores attributes the template does not configure', async () => {
    const supabase = withScores(arrayFormat, [{ cupper_id: 'c1', scores: { Acidity: 0 } }])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })
})
```

- [ ] **Step 8: Run them**

Run: `npx vitest run src/lib/compliance.characterization.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 9: Pin the taint/fault, intensity, moisture and quaker rules**

Append. Note the final case: with no tolerance configured at all, any taint rejects.

```ts
describe('evaluateQualityCompliance — taints, faults and physicals', () => {
  function withDefectScores(
    parameters: Record<string, unknown>,
    templateExtra: Record<string, unknown>,
    defects: unknown,
    masterCupperId: string | null = null,
  ) {
    return fakeSupabase({
      client_qualities: specRow({ ...emptyTemplate, ...templateExtra, parameters }),
      cupping_scores: { data: [{ cupper_id: 'c1', scores: {}, defects }] },
      quality_assessments: { data: null },
      cupping_sessions: { data: masterCupperId ? { master_cupper_id: masterCupperId } : null },
    })
  }

  it('rejects any taint when no tolerance is configured', async () => {
    const supabase = withDefectScores({}, {}, { taints: [{ name: 'Fermented' }], faults: [] })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Cupping taints detected: 1 (no tolerance configured, rejecting by default)',
    ])
  })

  it('honours a configured taint limit', async () => {
    const supabase = withDefectScores(
      { taint_fault_configuration: { rules: { max_taints: 2 } } },
      {},
      { taints: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], faults: [] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Cupping taints: 3 exceeds limit (2)'])
  })

  it('honours zero tolerance', async () => {
    const supabase = withDefectScores(
      { taint_fault_configuration: { rules: { zero_tolerance: true } } },
      {},
      { taints: [{ name: 'a' }], faults: [{ name: 'b' }] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Zero tolerance: 1 taint(s) and 1 fault(s) detected'])
  })

  it('honours a combined limit', async () => {
    const supabase = withDefectScores(
      { taint_fault_configuration: { rules: { max_combined: 1 } } },
      {},
      { taints: [{ name: 'a' }], faults: [{ name: 'b' }] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Cupping defects combined: 2 exceeds limit (1)'])
  })

  it('falls back to the template column limits', async () => {
    const supabase = withDefectScores(
      {},
      { max_taints_allowed: 1, max_faults_allowed: 0 },
      { taints: [{ name: 'a' }, { name: 'b' }], faults: [{ name: 'c' }] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Cupping taints: 2 exceeds limit (1)',
      'Cupping faults: 1 exceeds limit (0)',
    ])
  })

  it('flags a defect intensity above its configured level', async () => {
    const supabase = withDefectScores(
      {
        defect_limits: { fermented: { max_level: 2 } },
        taint_fault_configuration: { rules: { max_taints: 5 } },
      },
      {},
      { taints: [{ name: 'Fermented', intensity: 4 }], faults: [] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Taint "Fermented": Intensity 4 exceeds maximum (2)',
    ])
  })

  it('flags moisture outside its band', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        parameters: { moisture_min: 10, moisture_max: 12 },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { moisture_percentage: 13.4 } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Moisture: 13.4% exceeds maximum (12%)'])
  })

  it('flags quakers above the maximum', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({ ...emptyTemplate, parameters: { max_quakers: 5 } }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { quakers: 9 } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Quakers: 9 exceeds maximum (5)'])
  })
})
```

- [ ] **Step 10: Run the whole file**

Run: `npx vitest run src/lib/compliance.characterization.test.ts`
Expected: PASS, 25 tests. Every expectation must match real output — correct the test, never the source, in this task.

- [ ] **Step 11: Commit**

```bash
git add src/lib/compliance.characterization.test.ts
git commit -m "test(compliance): pin the approval gate's current output

evaluateQualityCompliance gates every approval and had no tests. These
characterize what it does today across all nine categories so the
extraction that follows can be proven not to change any verdict."
```

---

### Task 2: Shared resolvers

**Files:**
- Create: `src/lib/quality-resolvers.ts`
- Test: `src/lib/quality-resolvers.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface CuppingDefects { taints?: Array<{ name?: string; intensity?: number }>; faults?: Array<{ name?: string; intensity?: number }> }`
  - `interface CuppingScoreRow { cupper_id: string | null; scores: Record<string, unknown> | null; defects: CuppingDefects | null }`
  - `interface DefectCounts { primary: number; secondary: number; total: number }`
  - `screenGramsToPercent(raw: Record<string, number> | null | undefined): Record<string, number> | null`
  - `resolveDefectCounts(defects: unknown): DefectCounts | null`
  - `resolveTaintFaultCounts(scores: CuppingScoreRow[], masterCupperId: string | null): { taints: number; faults: number }`
  - `resolveFinalScores(scores: CuppingScoreRow[], masterCupperId: string | null): Record<string, number>`

The spec called this module `certificate-public-data.ts`. It is named `quality-resolvers.ts` because it serves the approval gate as well as the page, and a certificate-flavoured name would make importing it from `compliance.ts` look wrong.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/quality-resolvers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  screenGramsToPercent,
  resolveDefectCounts,
  resolveTaintFaultCounts,
  resolveFinalScores,
  type CuppingScoreRow,
} from './quality-resolvers'

describe('screenGramsToPercent', () => {
  it('converts grams to percentages of the sieved total', () => {
    expect(screenGramsToPercent({ '16': 750, '15': 200, '14': 50 })).toEqual({
      '16': 75, '15': 20, '14': 5,
    })
  })

  it('returns null when there is nothing to divide by', () => {
    expect(screenGramsToPercent(null)).toBeNull()
    expect(screenGramsToPercent(undefined)).toBeNull()
    expect(screenGramsToPercent({})).toBeNull()
    expect(screenGramsToPercent({ '16': 0, '15': 0 })).toBeNull()
  })

  it('treats non-numeric entries as zero rather than poisoning the total', () => {
    expect(screenGramsToPercent({ '16': 75, '15': 25, Pan: NaN })).toEqual({
      '16': 75, '15': 25, Pan: 0,
    })
  })
})

describe('resolveDefectCounts', () => {
  it('reads the shape grading writes', () => {
    expect(resolveDefectCounts({ primary: 1, secondary: 21 })).toEqual({
      primary: 1, secondary: 21, total: 22,
    })
  })

  it('falls back to the total_* shape when the plain keys are absent', () => {
    expect(resolveDefectCounts({ total_primary: 3, total_secondary: 4 })).toEqual({
      primary: 3, secondary: 4, total: 7,
    })
  })

  it('prefers the plain keys when both shapes are present', () => {
    // The approval gate reads defects.primary. Preferring the other key here
    // would silently change verdicts on any row carrying both.
    expect(resolveDefectCounts({ primary: 1, total_primary: 9, secondary: 2 })).toEqual({
      primary: 1, secondary: 2, total: 3,
    })
  })

  it('always computes the total, ignoring a stored one', () => {
    expect(resolveDefectCounts({ primary: 1, secondary: 21, total: 5 }).total).toBe(22)
  })

  it('treats a missing count as zero', () => {
    expect(resolveDefectCounts({ primary: 4 })).toEqual({ primary: 4, secondary: 0, total: 4 })
  })

  it('returns null when there is no defect record at all', () => {
    expect(resolveDefectCounts(null)).toBeNull()
    expect(resolveDefectCounts(undefined)).toBeNull()
    expect(resolveDefectCounts('nope')).toBeNull()
  })
})

describe('resolveTaintFaultCounts', () => {
  const rows: CuppingScoreRow[] = [
    { cupper_id: 'master', scores: null, defects: { taints: [{ name: 'a' }], faults: [] } },
    { cupper_id: 'c2', scores: null, defects: { taints: [{ name: 'a' }, { name: 'b' }], faults: [{ name: 'x' }] } },
  ]

  it("uses only the master cupper's defects when one is designated", () => {
    expect(resolveTaintFaultCounts(rows, 'master')).toEqual({ taints: 1, faults: 0 })
  })

  it('takes the maximum across cuppers when there is no master', () => {
    // Max, not sum: two cuppers flagging the same taint is one taint.
    expect(resolveTaintFaultCounts(rows, null)).toEqual({ taints: 2, faults: 1 })
  })

  it('returns zeros for no scores', () => {
    expect(resolveTaintFaultCounts([], null)).toEqual({ taints: 0, faults: 0 })
  })

  it('returns zeros when the designated master filed no scores', () => {
    expect(resolveTaintFaultCounts(rows, 'absent')).toEqual({ taints: 0, faults: 0 })
  })
})

describe('resolveFinalScores', () => {
  const rows: CuppingScoreRow[] = [
    { cupper_id: 'master', scores: { Body: 2 }, defects: null },
    { cupper_id: 'c2', scores: { Body: 5, Acidity: 3 }, defects: null },
  ]

  it("prefers the master cupper's score", () => {
    expect(resolveFinalScores(rows, 'master').Body).toBe(2)
  })

  it('fills attributes the master did not score with the mean', () => {
    expect(resolveFinalScores(rows, 'master').Acidity).toBe(3)
  })

  it('averages every attribute when there is no master', () => {
    expect(resolveFinalScores(rows, null)).toEqual({ Body: 3.5, Acidity: 3 })
  })

  it('ignores non-numeric score values', () => {
    const withText: CuppingScoreRow[] = [
      { cupper_id: 'c1', scores: { Body: 4, Flavor_descriptor: 'nutty' }, defects: null },
    ]
    expect(resolveFinalScores(withText, null)).toEqual({ Body: 4 })
  })

  it('returns nothing for no scores', () => {
    expect(resolveFinalScores([], null)).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/quality-resolvers.test.ts`
Expected: FAIL — `Failed to resolve import "./quality-resolvers"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/quality-resolvers.ts`:

```ts
/**
 * Turning stored quality shapes into numbers.
 *
 * Both the approval gate (src/lib/compliance.ts) and the public certificate
 * page read these fields. They used to read them differently — the page showed
 * screen grams as percentages and preferred a stored defect total the gate
 * ignored — which meant a public page could describe a lot the gate had judged
 * on other numbers. One module, one reading.
 */

export interface CuppingDefects {
  taints?: Array<{ name?: string; intensity?: number }>
  faults?: Array<{ name?: string; intensity?: number }>
}

export interface CuppingScoreRow {
  cupper_id: string | null
  scores: Record<string, unknown> | null
  defects: CuppingDefects | null
}

export interface DefectCounts {
  primary: number
  secondary: number
  total: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * green_bean_data.screen_sizes holds GRAMS off the sieve stack, not percentages
 * — see the grading form, which keeps a separate screen_sizes_percentages for
 * display and never persists it. Percentages are always derived here.
 *
 * Returns null when nothing was sieved, so callers can hide the section rather
 * than divide by zero.
 */
export function screenGramsToPercent(
  raw: Record<string, number> | null | undefined,
): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null
  const totalGrams = Object.values(raw).reduce<number>((sum, g) => sum + num(g), 0)
  if (totalGrams <= 0) return null

  const percentages: Record<string, number> = {}
  for (const [size, grams] of Object.entries(raw)) {
    percentages[size] = (num(grams) / totalGrams) * 100
  }
  return percentages
}

/**
 * Primary and secondary counts, and the total.
 *
 * The total is ALWAYS the sum. A quality allowing 1 primary, 21 secondary and
 * 21 total rejects a lot with 1 primary and 21 secondary: each individual limit
 * is met, but the total is 22. A stored defects.total is never trusted.
 *
 * Grading writes { primary, secondary }; certificate-data.ts writes
 * { total_primary, total_secondary }. The plain keys win where both exist,
 * because that is what the approval gate has always read.
 */
export function resolveDefectCounts(defects: unknown): DefectCounts | null {
  if (!defects || typeof defects !== 'object') return null
  const d = defects as Record<string, unknown>
  const primary = num(d.primary ?? d.total_primary)
  const secondary = num(d.secondary ?? d.total_secondary)
  return { primary, secondary, total: primary + secondary }
}

/**
 * How many taints and faults this lot carries.
 *
 * A designated master cupper's record is authoritative. Without one, take the
 * maximum across cuppers rather than the sum — two cuppers flagging the same
 * taint is one taint, not two.
 */
export function resolveTaintFaultCounts(
  scores: CuppingScoreRow[],
  masterCupperId: string | null,
): { taints: number; faults: number } {
  const count = (arr: unknown): number => (Array.isArray(arr) ? arr.length : 0)

  if (masterCupperId) {
    const master = scores.find(s => s.cupper_id === masterCupperId)
    if (master?.defects && typeof master.defects === 'object') {
      return { taints: count(master.defects.taints), faults: count(master.defects.faults) }
    }
    return { taints: 0, faults: 0 }
  }

  let taints = 0
  let faults = 0
  for (const score of scores) {
    if (!score.defects || typeof score.defects !== 'object') continue
    taints = Math.max(taints, count(score.defects.taints))
    faults = Math.max(faults, count(score.defects.faults))
  }
  return { taints, faults }
}

/**
 * The score each attribute is judged on: the master cupper's where they scored
 * it, the mean across cuppers everywhere else.
 */
export function resolveFinalScores(
  scores: CuppingScoreRow[],
  masterCupperId: string | null,
): Record<string, number> {
  const final: Record<string, number> = {}

  if (masterCupperId) {
    const master = scores.find(s => s.cupper_id === masterCupperId)
    if (master?.scores && typeof master.scores === 'object') {
      for (const [attr, value] of Object.entries(master.scores)) {
        if (typeof value === 'number') final[attr] = value
      }
    }
  }

  for (const score of scores) {
    if (!score.scores || typeof score.scores !== 'object') continue
    for (const [attr, value] of Object.entries(score.scores)) {
      if (typeof value !== 'number' || final[attr] !== undefined) continue
      let sum = 0
      let count = 0
      for (const other of scores) {
        const v = other.scores?.[attr]
        if (typeof v === 'number') {
          sum += v
          count++
        }
      }
      final[attr] = count > 0 ? sum / count : value
    }
  }

  return final
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/quality-resolvers.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quality-resolvers.ts src/lib/quality-resolvers.test.ts
git commit -m "feat(quality): one reading of screens, defects and cupper scores

The approval gate and the public certificate page read the same stored
fields differently — grams as percentages on one side, a stored defect
total the other side ignored. These resolvers are the single reading both
will use."
```

---

### Task 3: The pure compliance core

**Files:**
- Create: `src/lib/compliance-criteria.ts`
- Test: `src/lib/compliance-criteria.test.ts`

**Interfaces:**
- Consumes: `resolveFinalScores`, `resolveTaintFaultCounts`, `resolveDefectCounts`, `screenGramsToPercent`, `CuppingScoreRow` (Task 2).
- Produces:
  - `interface ComplianceCriterion { key, label, sublabel?, actual, operator, limit, passed, violation? }` — exact shape in Step 3.
  - `interface ComplianceInputs { parameters, template, cuppingScores, masterCupperId, greenBean }` — exact shape in Step 3.
  - `evaluateCompliance(inputs: ComplianceInputs): ComplianceCriterion[]`
  - `criteriaToViolations(criteria: ComplianceCriterion[]): string[]`

Criteria must be produced in the order the current engine pushes violations — cupping attributes, defect intensities, defect counts, screens (legacy then constraints), moisture, quakers, taint/fault counts — because Task 4 rebuilds `violations` by walking this list, and the strings must stay byte-identical.

Each failing criterion carries the exact legacy sentence in `violation`. Re-deriving those sentences from the structured fields would be elegant and would also be the one place a stray space or a `toFixed` could silently change the gate's output. Carrying the string is deliberate.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/compliance-criteria.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateCompliance, criteriaToViolations, type ComplianceInputs } from './compliance-criteria'

const base: ComplianceInputs = {
  parameters: {},
  template: {
    defect_thresholds_primary: null,
    defect_thresholds_secondary: null,
    max_taints_allowed: null,
    max_faults_allowed: null,
    screen_size_requirements: null,
  },
  cuppingScores: [],
  masterCupperId: null,
  greenBean: null,
}

const find = (criteria: ReturnType<typeof evaluateCompliance>, key: string) =>
  criteria.find(c => c.key === key)

describe('evaluateCompliance — defect counts', () => {
  const inputs: ComplianceInputs = {
    ...base,
    template: { ...base.template, defect_thresholds_primary: 1, defect_thresholds_secondary: 21 },
    parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
    greenBean: { defects: { primary: 1, secondary: 21 } },
  }

  it('emits a row for each configured threshold, passing or failing', () => {
    const criteria = evaluateCompliance(inputs)
    expect(find(criteria, 'primary_defects')).toMatchObject({ actual: 1, limit: 1, passed: true })
    expect(find(criteria, 'secondary_defects')).toMatchObject({ actual: 21, limit: 21, passed: true })
    expect(find(criteria, 'total_defects')).toMatchObject({ actual: 22, limit: 21, passed: false })
  })

  it('describes the total as its composition', () => {
    expect(find(evaluateCompliance(inputs), 'total_defects')?.sublabel)
      .toBe('1 primary + 21 secondary · max 21')
  })

  it('emits no row for a threshold the template does not set', () => {
    const criteria = evaluateCompliance({
      ...base,
      parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
      greenBean: { defects: { primary: 1, secondary: 21 } },
    })
    expect(find(criteria, 'primary_defects')).toBeUndefined()
    expect(find(criteria, 'total_defects')).toBeDefined()
  })

  it('emits nothing when there is no defect record', () => {
    expect(evaluateCompliance({ ...base, greenBean: {} })).toEqual([])
  })
})

describe('evaluateCompliance — screens', () => {
  it('judges the percentage, not the grams', () => {
    const criteria = evaluateCompliance({
      ...base,
      template: { ...base.template, screen_size_requirements: { '16': { min_percent: 80 } } },
      greenBean: { screen_sizes: { '16': 750, '15': 250 } },
    })
    expect(find(criteria, 'screen_16')).toMatchObject({ actual: 75, limit: 80, passed: false })
  })
})

describe('evaluateCompliance — cupping attributes', () => {
  it('passes a score inside its band and fails one outside', () => {
    const inputs: ComplianceInputs = {
      ...base,
      parameters: {
        cupping_attributes: [
          { attribute: 'Body', validation_rule: { min_value: 3, max_value: 5 } },
          { attribute: 'Acidity', validation_rule: { min_value: 3, max_value: 5 } },
        ],
      },
      cuppingScores: [{ cupper_id: 'c1', scores: { Body: 4, Acidity: 2 }, defects: null }],
    }
    const criteria = evaluateCompliance(inputs)
    expect(find(criteria, 'cupping_Body')).toMatchObject({ passed: true })
    expect(find(criteria, 'cupping_Acidity')).toMatchObject({ passed: false, operator: 'outside' })
  })
})

describe('evaluateCompliance — taints and faults', () => {
  it('rejects any taint when no tolerance is configured', () => {
    const criteria = evaluateCompliance({
      ...base,
      cuppingScores: [{ cupper_id: 'c1', scores: null, defects: { taints: [{ name: 'a' }], faults: [] } }],
    })
    expect(find(criteria, 'cupping_taints')).toMatchObject({ passed: false, limit: null })
  })

  it('passes within a configured limit', () => {
    const criteria = evaluateCompliance({
      ...base,
      parameters: { taint_fault_configuration: { rules: { max_taints: 2, max_faults: 0 } } },
      cuppingScores: [{ cupper_id: 'c1', scores: null, defects: { taints: [{ name: 'a' }], faults: [] } }],
    })
    expect(find(criteria, 'cupping_taints')).toMatchObject({ actual: 1, limit: 2, passed: true })
    expect(find(criteria, 'cupping_faults')).toMatchObject({ actual: 0, limit: 0, passed: true })
  })
})

describe('criteriaToViolations', () => {
  it('returns the legacy sentence for each failure, in order', () => {
    const criteria = evaluateCompliance({
      ...base,
      template: { ...base.template, defect_thresholds_primary: 1 },
      parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
      greenBean: { defects: { primary: 5, secondary: 21 } },
    })
    expect(criteriaToViolations(criteria)).toEqual([
      'Primary defects: 5 exceeds limit (1)',
      'Total defects: 26 exceeds limit (21)',
    ])
  })

  it('returns nothing when everything passed', () => {
    const criteria = evaluateCompliance({
      ...base,
      template: { ...base.template, defect_thresholds_primary: 10 },
      greenBean: { defects: { primary: 1, secondary: 2 } },
    })
    expect(criteriaToViolations(criteria)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/compliance-criteria.test.ts`
Expected: FAIL — `Failed to resolve import "./compliance-criteria"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/compliance-criteria.ts`. This is the whole rule set, lifted from `compliance.ts` with the queries removed and passes recorded alongside failures:

```ts
import {
  resolveFinalScores,
  resolveTaintFaultCounts,
  resolveDefectCounts,
  screenGramsToPercent,
  type CuppingScoreRow,
} from '@/lib/quality-resolvers'

/**
 * One thing a lot was judged on.
 *
 * `violation` carries the exact sentence the approval gate has always emitted
 * for this failure. compliance.ts rebuilds its violations[] by collecting them,
 * so the strings stay byte-identical through the extraction — re-deriving them
 * from the structured fields would put a stray space or a toFixed between the
 * gate and its own history.
 */
export interface ComplianceCriterion {
  key: string
  label: string
  sublabel?: string
  actual: number | string
  operator: '>' | '<' | 'outside' | null
  limit: number | string | null
  passed: boolean
  violation?: string
}

export interface QualityTemplateParameters {
  cupping_attributes?:
    | Array<{ attribute: string; validation_rule?: { min_value?: number; max_value?: number } }>
    | Record<string, { min?: number; max?: number }>
  defect_limits?: Record<string, { max_level?: number }>
  defect_configuration?: {
    thresholds?: { max_primary?: number; max_secondary?: number; max_total?: number }
  }
  defect_thresholds_total?: number
  screen_size_requirements?: {
    constraints?: Array<{
      screen_size: string
      constraint_type: 'minimum' | 'maximum' | 'range' | 'exact'
      min_value?: number
      max_value?: number
    }>
  }
  taint_fault_configuration?: {
    rules?: {
      max_taints?: number
      max_faults?: number
      max_combined?: number
      zero_tolerance?: boolean
    }
  }
  moisture_min?: number
  moisture_max?: number
  max_quakers?: number
}

export interface TemplateThresholds {
  defect_thresholds_primary?: number | null
  defect_thresholds_secondary?: number | null
  max_taints_allowed?: number | null
  max_faults_allowed?: number | null
  screen_size_requirements?: Record<string, { min_percent?: number; max_percent?: number }> | null
}

export interface GreenBeanData {
  defects?: unknown
  screen_sizes?: Record<string, number> | null
  moisture_percentage?: number | null
  quakers?: number | null
  quaker_count?: number | null
}

export interface ComplianceInputs {
  parameters: QualityTemplateParameters
  template: TemplateThresholds
  cuppingScores: CuppingScoreRow[]
  masterCupperId: string | null
  greenBean: GreenBeanData | null
}

/**
 * Judge a lot against its quality template.
 *
 * Returns every criterion the template configures, passing and failing alike —
 * the certificate page renders the full list, and the approval gate reads only
 * the failures. Criteria come back in the order the gate has always reported
 * violations, which is what keeps criteriaToViolations byte-identical.
 */
export function evaluateCompliance(inputs: ComplianceInputs): ComplianceCriterion[] {
  const { parameters, template, cuppingScores, masterCupperId, greenBean } = inputs
  const criteria: ComplianceCriterion[] = []

  // 1. Cupping attributes
  if (cuppingScores.length > 0 && parameters.cupping_attributes) {
    const finalScores = resolveFinalScores(cuppingScores, masterCupperId)
    const validationMap: Record<string, { min?: number; max?: number }> = {}

    if (Array.isArray(parameters.cupping_attributes)) {
      for (const config of parameters.cupping_attributes) {
        if (config.attribute && config.validation_rule) {
          validationMap[config.attribute] = {
            min: config.validation_rule.min_value,
            max: config.validation_rule.max_value,
          }
        }
      }
    } else {
      for (const [attr, limits] of Object.entries(parameters.cupping_attributes)) {
        if (limits && typeof limits === 'object') {
          validationMap[attr] = { min: limits.min, max: limits.max }
        }
      }
    }

    for (const [attr, score] of Object.entries(finalScores)) {
      let limits = validationMap[attr]
      if (!limits) {
        const lower = attr.toLowerCase()
        for (const [key, value] of Object.entries(validationMap)) {
          if (key.toLowerCase() === lower) {
            limits = value
            break
          }
        }
      }
      if (!limits) continue

      const belowMin = limits.min !== undefined && score < limits.min
      const aboveMax = limits.max !== undefined && score > limits.max
      const range =
        limits.min !== undefined && limits.max !== undefined
          ? `${limits.min}–${limits.max}`
          : limits.min !== undefined
            ? `min ${limits.min}`
            : `max ${limits.max}`

      criteria.push({
        key: `cupping_${attr}`,
        label: attr,
        sublabel: range,
        actual: Math.round(score * 100) / 100,
        operator: belowMin || aboveMax ? 'outside' : null,
        limit: range,
        passed: !belowMin && !aboveMax,
        violation: belowMin
          ? `${attr}: ${score.toFixed(2)} is below minimum (${limits.min})`
          : aboveMax
            ? `${attr}: ${score.toFixed(2)} is above maximum (${limits.max})`
            : undefined,
      })
    }
  }

  // 2. Defect intensity levels
  if (cuppingScores.length > 0 && parameters.defect_limits) {
    const scoresToCheck = masterCupperId
      ? cuppingScores.filter(s => s.cupper_id === masterCupperId)
      : cuppingScores

    for (const score of scoresToCheck) {
      if (!score.defects || typeof score.defects !== 'object') continue

      const check = (
        list: Array<{ name?: string; intensity?: number }> | undefined,
        kind: 'Taint' | 'Fault',
      ) => {
        if (!Array.isArray(list)) return
        for (const defect of list) {
          const name = defect.name?.toLowerCase()
          if (!name) continue
          const intensity = defect.intensity || 0
          const limit = parameters.defect_limits?.[name]
          if (limit?.max_level === undefined) continue
          const passed = intensity <= limit.max_level
          criteria.push({
            key: `intensity_${kind.toLowerCase()}_${name}`,
            label: `${kind}: ${defect.name}`,
            sublabel: `max intensity ${limit.max_level}`,
            actual: intensity,
            operator: passed ? null : '>',
            limit: limit.max_level,
            passed,
            violation: passed
              ? undefined
              : `${kind} "${defect.name}": Intensity ${intensity} exceeds maximum (${limit.max_level})`,
          })
        }
      }

      check(score.defects.taints, 'Taint')
      check(score.defects.faults, 'Fault')
    }
  }

  if (greenBean) {
    // 3, 4, 5. Defect counts
    const counts = resolveDefectCounts(greenBean.defects)
    if (counts) {
      const defectConfig = parameters.defect_configuration
      const maxPrimary = template.defect_thresholds_primary ?? defectConfig?.thresholds?.max_primary ?? null
      const maxSecondary = template.defect_thresholds_secondary ?? defectConfig?.thresholds?.max_secondary ?? null
      const maxTotal = parameters.defect_thresholds_total ?? defectConfig?.thresholds?.max_total ?? null

      if (maxPrimary !== null) {
        const passed = counts.primary <= maxPrimary
        criteria.push({
          key: 'primary_defects',
          label: 'Primary defects',
          sublabel: `max ${maxPrimary}`,
          actual: counts.primary,
          operator: passed ? null : '>',
          limit: maxPrimary,
          passed,
          violation: passed ? undefined : `Primary defects: ${counts.primary} exceeds limit (${maxPrimary})`,
        })
      }
      if (maxSecondary !== null) {
        const passed = counts.secondary <= maxSecondary
        criteria.push({
          key: 'secondary_defects',
          label: 'Secondary defects',
          sublabel: `max ${maxSecondary}`,
          actual: counts.secondary,
          operator: passed ? null : '>',
          limit: maxSecondary,
          passed,
          violation: passed ? undefined : `Secondary defects: ${counts.secondary} exceeds limit (${maxSecondary})`,
        })
      }
      if (maxTotal !== null) {
        const passed = counts.total <= maxTotal
        criteria.push({
          key: 'total_defects',
          label: 'Total defects',
          sublabel: `${counts.primary} primary + ${counts.secondary} secondary · max ${maxTotal}`,
          actual: counts.total,
          operator: passed ? null : '>',
          limit: maxTotal,
          passed,
          violation: passed ? undefined : `Total defects: ${counts.total} exceeds limit (${maxTotal})`,
        })
      }
    }

    const screenPercentages = screenGramsToPercent(greenBean.screen_sizes)

    // 6. Screens, legacy template format
    if (screenPercentages && template.screen_size_requirements) {
      for (const [size, req] of Object.entries(template.screen_size_requirements)) {
        const actual = screenPercentages[size] || 0
        if (req.min_percent !== undefined) {
          const passed = actual >= req.min_percent
          criteria.push({
            key: `screen_${size}`,
            label: `Screen ${size}`,
            sublabel: `min ${req.min_percent}%`,
            actual: Math.round(actual * 10) / 10,
            operator: passed ? null : '<',
            limit: req.min_percent,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% is below minimum (${req.min_percent}%)`,
          })
        }
        if (req.max_percent !== undefined) {
          const passed = actual <= req.max_percent
          criteria.push({
            key: `screen_${size}_max`,
            label: `Screen ${size}`,
            sublabel: `max ${req.max_percent}%`,
            actual: Math.round(actual * 10) / 10,
            operator: passed ? null : '>',
            limit: req.max_percent,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% exceeds maximum (${req.max_percent}%)`,
          })
        }
      }
    }

    // 6b. Screens, constraint format
    if (screenPercentages && parameters.screen_size_requirements?.constraints) {
      for (const constraint of parameters.screen_size_requirements.constraints) {
        const actual = screenPercentages[constraint.screen_size] || 0
        const size = constraint.screen_size
        const rounded = Math.round(actual * 10) / 10

        const pushMin = (min: number) => {
          const passed = actual >= min
          criteria.push({
            key: `screen_${size}_min`,
            label: `Screen ${size}`,
            sublabel: `min ${min}%`,
            actual: rounded,
            operator: passed ? null : '<',
            limit: min,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% is below minimum (${min}%)`,
          })
        }
        const pushMax = (max: number) => {
          const passed = actual <= max
          criteria.push({
            key: `screen_${size}_max`,
            label: `Screen ${size}`,
            sublabel: `max ${max}%`,
            actual: rounded,
            operator: passed ? null : '>',
            limit: max,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% exceeds maximum (${max}%)`,
          })
        }

        switch (constraint.constraint_type) {
          case 'minimum':
            if (constraint.min_value !== undefined) pushMin(constraint.min_value)
            break
          case 'maximum':
            if (constraint.max_value !== undefined) pushMax(constraint.max_value)
            break
          case 'range':
            if (constraint.min_value !== undefined) pushMin(constraint.min_value)
            if (constraint.max_value !== undefined) pushMax(constraint.max_value)
            break
          case 'exact':
            if (constraint.min_value !== undefined) {
              const passed = actual === constraint.min_value
              criteria.push({
                key: `screen_${size}_exact`,
                label: `Screen ${size}`,
                sublabel: `exactly ${constraint.min_value}%`,
                actual: rounded,
                operator: passed ? null : 'outside',
                limit: constraint.min_value,
                passed,
                violation: passed
                  ? undefined
                  : `Screen ${size}: ${actual.toFixed(1)}% does not match expected (${constraint.min_value}%)`,
              })
            }
            break
        }
      }
    }

    // 7. Moisture
    if (greenBean.moisture_percentage !== undefined && greenBean.moisture_percentage !== null) {
      const moisture = greenBean.moisture_percentage
      const { moisture_min: min, moisture_max: max } = parameters
      if (min !== undefined || max !== undefined) {
        const belowMin = min !== undefined && moisture < min
        const aboveMax = max !== undefined && moisture > max
        const band =
          min !== undefined && max !== undefined
            ? `${min}–${max}%`
            : min !== undefined
              ? `min ${min}%`
              : `max ${max}%`
        criteria.push({
          key: 'moisture',
          label: 'Moisture',
          sublabel: band,
          actual: `${moisture}%`,
          operator: belowMin || aboveMax ? 'outside' : null,
          limit: band,
          passed: !belowMin && !aboveMax,
          violation: belowMin
            ? `Moisture: ${moisture}% is below minimum (${min}%)`
            : aboveMax
              ? `Moisture: ${moisture}% exceeds maximum (${max}%)`
              : undefined,
        })
      }
    }

    // 8. Quakers
    if (parameters.max_quakers !== undefined) {
      const quakers = greenBean.quakers ?? greenBean.quaker_count ?? 0
      const passed = quakers <= parameters.max_quakers
      criteria.push({
        key: 'quakers',
        label: 'Quakers',
        sublabel: `max ${parameters.max_quakers}`,
        actual: quakers,
        operator: passed ? null : '>',
        limit: parameters.max_quakers,
        passed,
        violation: passed
          ? undefined
          : `Quakers: ${quakers} exceeds maximum (${parameters.max_quakers})`,
      })
    }
  }

  // 9. Taint and fault counts
  if (cuppingScores.length > 0) {
    const { taints, faults } = resolveTaintFaultCounts(cuppingScores, masterCupperId)
    const rules = parameters.taint_fault_configuration?.rules

    const hasConfiguredRules = Boolean(
      rules &&
        (rules.zero_tolerance === true ||
          typeof rules.max_taints === 'number' ||
          typeof rules.max_faults === 'number' ||
          typeof rules.max_combined === 'number'),
    )

    if (hasConfiguredRules && rules!.zero_tolerance) {
      const passed = taints === 0 && faults === 0
      criteria.push({
        key: 'zero_tolerance',
        label: 'Cup integrity',
        sublabel: 'no taints or faults permitted',
        actual: `${taints} taints, ${faults} faults`,
        operator: passed ? null : '>',
        limit: 0,
        passed,
        violation: passed
          ? undefined
          : `Zero tolerance: ${taints} taint(s) and ${faults} fault(s) detected`,
      })
    } else if (hasConfiguredRules) {
      if (typeof rules!.max_taints === 'number') {
        const passed = taints <= rules!.max_taints
        criteria.push({
          key: 'cupping_taints',
          label: 'Cupping taints',
          sublabel: `max ${rules!.max_taints}`,
          actual: taints,
          operator: passed ? null : '>',
          limit: rules!.max_taints,
          passed,
          violation: passed ? undefined : `Cupping taints: ${taints} exceeds limit (${rules!.max_taints})`,
        })
      }
      if (typeof rules!.max_faults === 'number') {
        const passed = faults <= rules!.max_faults
        criteria.push({
          key: 'cupping_faults',
          label: 'Cupping faults',
          sublabel: `max ${rules!.max_faults}`,
          actual: faults,
          operator: passed ? null : '>',
          limit: rules!.max_faults,
          passed,
          violation: passed ? undefined : `Cupping faults: ${faults} exceeds limit (${rules!.max_faults})`,
        })
      }
      if (typeof rules!.max_combined === 'number') {
        const passed = taints + faults <= rules!.max_combined
        criteria.push({
          key: 'cupping_combined',
          label: 'Cupping defects combined',
          sublabel: `max ${rules!.max_combined}`,
          actual: taints + faults,
          operator: passed ? null : '>',
          limit: rules!.max_combined,
          passed,
          violation: passed
            ? undefined
            : `Cupping defects combined: ${taints + faults} exceeds limit (${rules!.max_combined})`,
        })
      }
    } else {
      const maxTaints = typeof template.max_taints_allowed === 'number' ? template.max_taints_allowed : null
      const maxFaults = typeof template.max_faults_allowed === 'number' ? template.max_faults_allowed : null

      if (maxTaints !== null) {
        const passed = taints <= maxTaints
        criteria.push({
          key: 'cupping_taints',
          label: 'Cupping taints',
          sublabel: `max ${maxTaints}`,
          actual: taints,
          operator: passed ? null : '>',
          limit: maxTaints,
          passed,
          violation: passed ? undefined : `Cupping taints: ${taints} exceeds limit (${maxTaints})`,
        })
      }
      if (maxFaults !== null) {
        const passed = faults <= maxFaults
        criteria.push({
          key: 'cupping_faults',
          label: 'Cupping faults',
          sublabel: `max ${maxFaults}`,
          actual: faults,
          operator: passed ? null : '>',
          limit: maxFaults,
          passed,
          violation: passed ? undefined : `Cupping faults: ${faults} exceeds limit (${maxFaults})`,
        })
      }
      // No tolerance configured anywhere: any taint rejects. The limit is null
      // so the page renders the count without inventing a threshold.
      if (maxTaints === null) {
        const passed = taints === 0
        criteria.push({
          key: 'cupping_taints',
          label: 'Cupping taints',
          sublabel: 'no tolerance configured',
          actual: taints,
          operator: passed ? null : '>',
          limit: null,
          passed,
          violation: passed
            ? undefined
            : `Cupping taints detected: ${taints} (no tolerance configured, rejecting by default)`,
        })
      }
    }
  }

  return criteria
}

/** The approval gate's failure sentences, in their historical order. */
export function criteriaToViolations(criteria: ComplianceCriterion[]): string[] {
  return criteria.filter(c => !c.passed && c.violation).map(c => c.violation as string)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/compliance-criteria.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Confirm nothing else broke**

Run: `npx vitest run src/lib/`
Expected: PASS. The characterization tests still exercise the untouched `compliance.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compliance-criteria.ts src/lib/compliance-criteria.test.ts
git commit -m "feat(compliance): pure rule engine returning passes and failures

Every threshold rule from evaluateQualityCompliance, with the database
queries removed and passing criteria recorded alongside failures. The
certificate page needs the passes; the gate needs the failures. Failing
criteria carry the gate's exact legacy sentence so the strings survive."
```

---

### Task 4: The gate delegates

**Files:**
- Modify: `src/lib/compliance.ts`

**Interfaces:**
- Consumes: `evaluateCompliance`, `criteriaToViolations`, `ComplianceInputs` (Task 3); `CuppingScoreRow` (Task 2).
- Produces: `evaluateQualityCompliance` — **unchanged** signature and return type. Also newly exports `evaluateSampleCompliance(supabase, sampleId, qualitySpecId, assignedCupperIds?): Promise<ComplianceCriterion[]>` so Phase 2 can fetch and evaluate in one call.

This is the task the characterization tests exist for. The four queries stay exactly as they are; only the code between them changes.

- [ ] **Step 1: Replace the body of the rules**

In `src/lib/compliance.ts`, add to the imports at the top of the file:

```ts
import {
  evaluateCompliance,
  criteriaToViolations,
  type ComplianceCriterion,
  type ComplianceInputs,
  type QualityTemplateParameters,
  type TemplateThresholds,
  type GreenBeanData,
} from '@/lib/compliance-criteria'
import type { CuppingScoreRow } from '@/lib/quality-resolvers'
```

Delete the local `QualityTemplateParameters` and `CuppingAttributeConfig` interface declarations (lines 8–57) — they now live in `compliance-criteria.ts`.

Then replace everything from `// 1. Check cupping attributes against thresholds` down to the closing `return { approved: ..., violations }` with the delegation. The function becomes:

```ts
/**
 * Evaluate quality compliance against quality specifications.
 *
 * Fetches what the rules need, then hands off to evaluateCompliance. The rules
 * themselves live in compliance-criteria.ts so the public certificate page can
 * apply exactly the same ones — a page that says "passes" over a certificate
 * this gate rejected is the worst bug available here.
 */
export async function evaluateQualityCompliance(
  supabase: SupabaseClient,
  sampleId: string,
  qualitySpecId: string | null,
  assignedCupperIds?: string[]
): Promise<QualityComplianceResult> {
  const criteria = await evaluateSampleCompliance(supabase, sampleId, qualitySpecId, assignedCupperIds)
  const violations = criteriaToViolations(criteria)
  return { approved: violations.length === 0, violations }
}

/**
 * The same evaluation, returning every criterion rather than only the failures.
 * The public certificate page renders the full list.
 */
export async function evaluateSampleCompliance(
  supabase: SupabaseClient,
  sampleId: string,
  qualitySpecId: string | null,
  assignedCupperIds?: string[]
): Promise<ComplianceCriterion[]> {
  // No quality spec means no thresholds to check.
  if (!qualitySpecId) {
    console.log('No quality spec assigned, auto-approving')
    return []
  }

  const { data: qualitySpec, error: specError } = await supabase
    .from('client_qualities')
    .select(`
      id,
      custom_name,
      template:quality_templates(
        id,
        name,
        parameters,
        defect_thresholds_primary,
        defect_thresholds_secondary,
        max_taints_allowed,
        max_faults_allowed,
        screen_size_requirements
      )
    `)
    .eq('id', qualitySpecId)
    .single()

  if (specError || !qualitySpec?.template) {
    console.log('Quality spec or template not found, auto-approving')
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template = qualitySpec.template as any
  const parameters = (template.parameters as QualityTemplateParameters) || {}

  let scoreQuery = supabase
    .from('cupping_scores')
    .select('scores, defects, cupper_id, session_id')
    .eq('sample_id', sampleId)

  if (assignedCupperIds && assignedCupperIds.length > 0) {
    scoreQuery = scoreQuery.in('cupper_id', assignedCupperIds)
  }

  const { data: cuppingScores } = await scoreQuery

  const { data: qualityAssessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // The master cupper's record overrides the others wherever it exists.
  let masterCupperId: string | null = null
  if (cuppingScores && cuppingScores.length > 0) {
    const { data: sampleSession } = await supabase
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [sampleId])
      .in('status', ['setup', 'active', 'review', 'completed', 'finalized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    masterCupperId = sampleSession?.master_cupper_id || null
  }

  const inputs: ComplianceInputs = {
    parameters,
    template: {
      defect_thresholds_primary: template.defect_thresholds_primary ?? null,
      defect_thresholds_secondary: template.defect_thresholds_secondary ?? null,
      max_taints_allowed: template.max_taints_allowed ?? null,
      max_faults_allowed: template.max_faults_allowed ?? null,
      screen_size_requirements: template.screen_size_requirements ?? null,
    } satisfies TemplateThresholds,
    cuppingScores: (cuppingScores || []) as unknown as CuppingScoreRow[],
    masterCupperId,
    greenBean: (qualityAssessment?.green_bean_data as GreenBeanData) ?? null,
  }

  return evaluateCompliance(inputs)
}
```

Leave `checkHasValidationRules` at the bottom of the file untouched.

- [ ] **Step 2: Run the characterization tests — this is the gate**

Run: `npx vitest run src/lib/compliance.characterization.test.ts`
Expected: PASS, 25 tests, unchanged.

**If any test fails, the extraction changed an approval outcome.** Do not update the test to match the new output — that would erase the whole point of Task 1. Fix `compliance-criteria.ts` until the original strings come back.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "compliance|quality-resolvers"`
Expected: no output.

- [ ] **Step 4: Confirm the callers still typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "cupping/finalize|quality-assessment|quality-summary"`
Expected: no output. These three call `evaluateQualityCompliance` and must not have needed a change.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS. Report the file and test totals.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compliance.ts
git commit -m "refactor(compliance): fetch here, decide in compliance-criteria

evaluateQualityCompliance keeps its signature and its four queries but
delegates the rules, rebuilding violations[] from the structured result.
The characterization tests confirm every sentence is byte-identical.

Adds evaluateSampleCompliance for callers that want the passing criteria
too — the public certificate page renders the full checklist."
```

---

### Task 5: Fix the screen percentages on the public surfaces

**Files:**
- Modify: `src/app/certificate/[slug]/page.tsx` (the `buildScreenSummary` call site)
- Modify: `src/app/certificate/[slug]/opengraph-image.tsx:79`
- Modify: `src/app/api/certificate/[slug]/route.ts:102`

**Interfaces:**
- Consumes: `screenGramsToPercent` (Task 2).
- Produces: nothing. Phase 2 rewrites `page.tsx` around this; the fix lands here so it ships without waiting for the rebuild.

`green_bean_data.screen_sizes` is grams. All three of these render it as though it were already a percentage, so a 71g screen reads "71.0%" to anyone who scans a tin. One-line fix in each.

- [ ] **Step 1: Fix the page's summary**

In `src/app/certificate/[slug]/page.tsx`, add to the imports:

```ts
import { screenGramsToPercent } from '@/lib/quality-resolvers'
```

Find:

```ts
  const screenSizes = greenBean?.screen_sizes || null
```

Replace with:

```ts
  // screen_sizes is stored in GRAMS; every display surface needs percentages.
  const screenSizes = screenGramsToPercent(greenBean?.screen_sizes)
```

- [ ] **Step 2: Fix the OpenGraph image**

In `src/app/certificate/[slug]/opengraph-image.tsx`, add the same import, then find:

```ts
  const screenSizes = greenBean?.screen_sizes as Record<string, number> | null
```

Replace with:

```ts
  // Stored in grams, rendered as percentages.
  const screenSizes = screenGramsToPercent(greenBean?.screen_sizes as Record<string, number> | null)
```

- [ ] **Step 3: Fix the public JSON**

In `src/app/api/certificate/[slug]/route.ts`, add the same import, then find:

```ts
  const screenSizes = greenBean?.screen_sizes || null
```

Replace with:

```ts
  // Stored in grams. This endpoint has always published them as percentages,
  // so the numbers it returns change here — from raw grams to real percentages.
  const screenSizes = screenGramsToPercent(greenBean?.screen_sizes)
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "certificate/\[slug\]|api/certificate"`
Expected: no output.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS. Report the totals.

- [ ] **Step 6: Verify by hand**

With the dev server running, open a certificate page for a sample that has grading data. The screen distribution percentages must now sum to roughly 100. Before this change they were raw gram weights — typically summing to 300, 350 or whatever the sieve sample weighed.

- [ ] **Step 7: Commit**

```bash
git add "src/app/certificate/[slug]/page.tsx" \
  "src/app/certificate/[slug]/opengraph-image.tsx" \
  "src/app/api/certificate/[slug]/route.ts"
git commit -m "fix(certificate): screen sizes are grams, publish them as percent

green_bean_data.screen_sizes stores gram weights off the sieve stack. The
public page, the OpenGraph description and the public JSON all rendered
them as percentages, so a 71g screen read as 71.0% to anyone scanning a
tin. All three now share the resolver the approval gate uses."
```

---

## Verification before moving to Phase 2

- [ ] `npx vitest run` — full suite green; report file and test counts.
- [ ] `npx tsc --noEmit -p tsconfig.json` — 0 errors.
- [ ] `npx vitest run src/lib/compliance.characterization.test.ts` — 25 tests, unchanged from Task 1.
- [ ] Approve and reject one sample through the app. The verdicts and the recorded rejection reasons must be exactly what they were before this plan.
- [ ] A certificate page's screen percentages sum to ~100.

## Follow-on

Phase 2, `docs/superpowers/plans/2026-08-06-certificate-page-rebuild.md`, builds the page itself on top of `evaluateSampleCompliance`.

## Deliberately not done here

- **`resolved_defects` is still not read by the gate.** The certificate page resolves taints and faults from `quality_assessments.resolved_defects` — the validator's authoritative cleanup — while the gate uses the master cupper's raw counts. Phase 2 moves the page onto the gate's reading so the page cannot contradict its own verdict. Whether the *gate* should honour `resolved_defects` is a real question and a separate decision; it would change approval outcomes and does not belong in a display rebuild.
- **The unescaped `%` in `resolveSampleIdForSlug`'s `ilike`.** Pre-existing, tracked in the spec's open items.
