# Mobile Certificate Page Rebuild Implementation Plan (Phase 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public certificate page around the verdict — what a scanner in a warehouse actually needs — replacing the radar chart with readable rails and showing, for the first time, *why* a lot was rejected.

**Architecture:** `page.tsx` stays a server component: it fetches, calls `evaluateSampleCompliance` from Phase 1, and folds the criteria into display rows via a pure `certificate-checklist.ts`. Six presentational components render the result; only the footer is a client component, for the modal and Web Share.

**Tech Stack:** Next.js 14 App Router (server components), TypeScript, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-mobile-certificate-page-design.md`
**Mockup:** `docs/prompts/sleeve_qr/waqc-cert-mobile.html` — structure and hierarchy, not a pixel spec.

**Prerequisite:** `docs/superpowers/plans/2026-08-06-certificate-compliance-core.md` must be committed and green. This plan imports `evaluateSampleCompliance` and `ComplianceCriterion` from it.

## Global Constraints

- Mobile-first, centred column capped at **420px**. No separate wide layout.
- **Dark theme only.** Fixed colours, no `dark:` variants. Tokens: bg `#262625`, card `#333331`, card-2 `#3b3b39`, line `#4a4a47`, line-soft `#3f3f3c`, ink `#f2efe6`, ink-2 `#a8a69d`, ink-3 `#7c7a73`, olive `#6d7f37`, olive-dim `#4e5a2b`, amber `#c98a2e`, red `#d9534f`, red-bg `#43221f`, green `#5fae63`.
- Full-bleed blocks with hairline rules, **not** floating rounded cards. Section labels inset at 16px.
- `font-variant-numeric: tabular-nums` on every figure — Tailwind `tabular-nums`.
- **The internal `SAN-` reference must not appear** in visible text, `alt` text, `<title>`, OpenGraph, or the download filename. Always use `publicReference.reference`.
- **Passing values are muted, never green.** Green on every row makes a rejected certificate read as fine.
- On approval, the verdict shows the badge and nothing else — no green failure equivalent, no "0 issues found" row.
- The verdict's failure lines and the checklist are built from **one** list, so they can never disagree.
- Responsive to 320px with no horizontal scroll. Visible keyboard focus on both buttons and both `<summary>` elements. `prefers-reduced-motion` respected. Status conveyed by text and icon, never colour alone.
- No cupping data → hide the rail section and the cupping checklist rows rather than showing zeros.
- Run tests with `npx vitest run <path>`. **Never `npm test`** — watch mode, hangs.
- Stage only your own files; **never `git add -A`**, never `git stash`.
- Keep files under ~2000 lines.

---

### Task 1: Fold criteria into display rows

**Files:**
- Create: `src/lib/certificate-checklist.ts`
- Test: `src/lib/certificate-checklist.test.ts`

**Interfaces:**
- Consumes: `ComplianceCriterion` from `@/lib/compliance-criteria` (Phase 1, Task 3).
- Produces:
  - `interface ChecklistRow { key: string; label: string; sublabel: string | null; actual: string; operator: '>' | '<' | 'outside' | null; limit: string | null; passed: boolean; hasThreshold: boolean }`
  - `buildChecklistRows(criteria: ComplianceCriterion[], cup: { cleanCup: boolean | null; uniformCup: boolean | null }): ChecklistRow[]`
  - `verdictFailures(rows: ChecklistRow[]): ChecklistRow[]`

The core emits one criterion per individual check — seven separate cupping attributes, a taint count, a fault count, an intensity per named defect. Rendering all of those verbatim would bury the four things a scanner cares about. This groups them: every cupping attribute folds into one row, and every taint/fault/intensity check folds into Cup integrity. Defect counts, screens, moisture and quakers pass through as their own rows.

The verdict block is built from this same list via `verdictFailures`, which is what stops the two from disagreeing.

`verdictFailures` applies one suppression rule, set by the project owner: **total defects is a rejection reason only when it is the sole defect failure.** If primary or secondary also failed, they are the reason and total is redundant noise — a scanner reading "Primary defects 5 > 1 max" does not also need "Total defects 26 > 21 max" saying the same thing twice. Total earns its line only in the case where primary and secondary each pass and the sum still breaks the limit. The checklist keeps showing all three rows regardless; this rule governs the verdict block alone.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/certificate-checklist.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildChecklistRows } from './certificate-checklist'
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

  it('marks a criterion with no threshold so the icon can be omitted', () => {
    const rows = buildChecklistRows([
      criterion({ key: 'cupping_taints', label: 'Cupping taints', actual: 0, limit: null }),
    ], cup)
    expect(rows.find(r => r.key === 'cup_integrity')?.hasThreshold).toBe(false)
  })

  it('returns nothing for no criteria', () => {
    expect(buildChecklistRows([], { cleanCup: null, uniformCup: null })).toEqual([])
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
```

Add `verdictFailures` and `type ChecklistRow` to this file's imports from `./certificate-checklist`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/certificate-checklist.test.ts`
Expected: FAIL — `Failed to resolve import "./certificate-checklist"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/certificate-checklist.ts`:

```ts
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

/** "21 max", "min 90%", or null when there is no threshold to state. */
function formatLimit(c: ComplianceCriterion): string | null {
  if (c.limit === null || c.limit === undefined) return null
  if (typeof c.limit === 'string') return c.limit
  if (c.operator === '<') return `min ${c.limit}`
  return `${c.limit} max`
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

  // 2. Screens, in engine order.
  for (const c of criteria.filter(isScreen)) rows.push(passthrough(c))

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/certificate-checklist.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificate-checklist.ts src/lib/certificate-checklist.test.ts
git commit -m "feat(certificate): fold compliance criteria into display rows

Seven cupping attributes become one row and every taint/fault/intensity
check becomes Cup integrity, while each defect count keeps its own row —
any one of them can reject a lot on its own, so each needs to be visible.
The verdict block filters this same list, so the two cannot disagree."
```

---

### Task 2: Verdict and lot identity

**Files:**
- Create: `src/app/certificate/[slug]/_components/types.ts`
- Create: `src/app/certificate/[slug]/_components/verdict.tsx`
- Create: `src/app/certificate/[slug]/_components/lot-identity.tsx`

**Interfaces:**
- Consumes: `ChecklistRow` (Task 1).
- Produces:
  - `types.ts`: `interface CertificateView { reference, eyebrow, status, qualityName, exporter, origin, quantity, certifiedDate, bagType, rows, screens, attributes, taints, faults, cleanCup, uniformCup, pdfUrl }` — exact shape in Step 1.
  - `<Verdict view={…} />`, `<LotIdentity view={…} />`

All components in this plan are **server components**. Do not add `'use client'` to anything except the footer in Task 5.

- [ ] **Step 1: Define the view model**

Create `src/app/certificate/[slug]/_components/types.ts`:

```ts
import type { ChecklistRow } from '@/lib/certificate-checklist'

/** One attribute's rail: where the band sits and where the score landed. */
export interface AttributeRail {
  attribute: string
  score: number
  min: number | null
  max: number | null
  scaleMin: number
  scaleMax: number
}

/** One screen's bar. */
export interface ScreenBar {
  label: string
  percent: number
  /** below the spec floor → dim olive */
  belowFloor: boolean
}

/**
 * Everything the page renders, resolved server-side.
 *
 * `reference` is always the counterparty's own identifier — container number,
 * exporter sample number or contract number. The internal SAN- lab number never
 * reaches this object.
 */
export interface CertificateView {
  reference: string
  eyebrow: string
  status: 'APPROVED' | 'REJECTED'
  qualityName: string | null
  exporter: string | null
  origin: string | null
  quantity: string | null
  certifiedDate: string | null
  bagType: string | null
  rows: ChecklistRow[]
  screens: ScreenBar[]
  screenSpecNote: string | null
  attributes: AttributeRail[]
  taints: number
  faults: number
  cleanCup: boolean | null
  uniformCup: boolean | null
  pdfUrl: string
}
```

- [ ] **Step 2: Write the verdict**

Create `src/app/certificate/[slug]/_components/verdict.tsx`:

```tsx
import { verdictFailures } from '@/lib/certificate-checklist'
import type { CertificateView } from './types'

/**
 * The answer to the only question a scanner has: is this lot approved, and if
 * not, why not.
 *
 * Failure lines come from the same rows the checklist renders, so the page
 * cannot name a reason the checklist omits. Total defects is suppressed when
 * primary or secondary already failed — see verdictFailures. On approval there
 * are no lines at all: no green mirror of the failure block, no "0 issues
 * found". The badge says everything.
 */
export function Verdict({ view }: { view: CertificateView }) {
  const rejected = view.status === 'REJECTED'
  const failures = verdictFailures(view.rows)

  return (
    <div
      className={`px-4 pt-[18px] pb-[14px] ${
        rejected ? 'bg-gradient-to-b from-[#d9534f1a] to-transparent' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[0.12em] uppercase text-[#7c7a73] font-semibold mb-[3px]">
            {view.eyebrow}
          </div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#f2efe6] m-0 break-words">
            {view.reference}
          </h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-[0.06em] whitespace-nowrap border ${
            rejected
              ? 'bg-[#43221f] text-[#d9534f] border-[#d9534f59]'
              : 'bg-[#26361f] text-[#5fae63] border-[#5fae6359]'
          }`}
        >
          <span aria-hidden="true">{rejected ? '✕' : '✓'}</span>
          {view.status}
        </span>
      </div>

      {rejected && failures.length > 0 && (
        <div className="mt-3 border-l-[3px] border-[#d9534f] pl-[11px]">
          {failures.map(row => (
            <div key={row.key} className="flex items-baseline justify-between gap-3 mt-[5px] first:mt-0">
              <span className="text-sm text-[#f2efe6]">{row.label}</span>
              <span className="text-sm tabular-nums text-[#a8a69d] whitespace-nowrap">
                <b className="text-[15px] font-bold text-[#d9534f]">{row.actual}</b>
                {row.limit && (
                  <>
                    {' '}
                    {row.operator === '<' ? '<' : row.operator === '>' ? '>' : '≠'}{' '}
                    <span className="text-[#7c7a73]">{row.limit}</span>
                  </>
                )}
              </span>
            </div>
          ))}
          {view.qualityName && (
            <div className="text-[#7c7a73] text-[12.5px] mt-1.5">
              Everything else within {view.qualityName} spec.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write the lot identity**

Create `src/app/certificate/[slug]/_components/lot-identity.tsx`:

```tsx
import type { CertificateView } from './types'

/**
 * What is in the tin. Mirrors the printed sleeve label so the scanner can
 * confirm this certificate belongs to the sample in their hand — the whole
 * reason it sits directly under the verdict rather than in the detail section.
 *
 * A field with no value is omitted; an empty labelled cell reads as missing
 * data rather than "not applicable".
 */
export function LotIdentity({ view }: { view: CertificateView }) {
  const cells: Array<{ k: string; v: string }> = []
  if (view.exporter) cells.push({ k: 'Exporter', v: view.exporter })
  if (view.qualityName) cells.push({ k: 'Quality', v: view.qualityName })
  if (view.quantity) cells.push({ k: 'Quantity', v: view.quantity })
  if (view.origin) cells.push({ k: 'Origin', v: view.origin })

  const footParts = [view.certifiedDate, view.bagType].filter(Boolean) as string[]
  if (cells.length === 0 && footParts.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-x-[10px] gap-y-3 px-4 py-[14px] bg-[#333331] border-y border-[#3f3f3c]">
      {cells.map(cell => (
        <div key={cell.k} className="min-w-0">
          <div className="text-[10.5px] tracking-[0.09em] uppercase text-[#7c7a73] mb-0.5">
            {cell.k}
          </div>
          <div className="text-[15px] font-semibold text-[#f2efe6] break-words">{cell.v}</div>
        </div>
      ))}
      {footParts.length > 0 && (
        <div className="col-span-2">
          <div className="text-[10.5px] tracking-[0.09em] uppercase text-[#7c7a73] mb-0.5">
            Certified
          </div>
          <div className="text-[13.5px] font-medium text-[#a8a69d]">
            {footParts.join(' · ')}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "_components"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "src/app/certificate/[slug]/_components/types.ts" \
  "src/app/certificate/[slug]/_components/verdict.tsx" \
  "src/app/certificate/[slug]/_components/lot-identity.tsx"
git commit -m "feat(certificate): verdict block and lot identity

The verdict leads with the reference and the reason, built from the same
rows the checklist renders. Lot identity mirrors the printed label so a
scanner can confirm the certificate matches the tin in their hand."
```

---

### Task 3: Spec checklist

**Files:**
- Create: `src/app/certificate/[slug]/_components/spec-checklist.tsx`

**Interfaces:**
- Consumes: `CertificateView` (Task 2).
- Produces: `<SpecChecklist view={…} />`

- [ ] **Step 1: Write the component**

Create `src/app/certificate/[slug]/_components/spec-checklist.tsx`:

```tsx
import type { CertificateView } from './types'

/**
 * The decision surface: every criterion this lot was judged on.
 *
 * Passing values are muted rather than green. Green on every row makes a
 * rejected certificate read as fine at a glance, which is the failure mode this
 * page exists to fix. A criterion with a value but no configured threshold gets
 * no icon at all rather than an invented limit.
 */
export function SpecChecklist({ view }: { view: CertificateView }) {
  if (view.rows.length === 0) return null

  return (
    <>
      <div className="text-[11px] tracking-[0.1em] uppercase text-[#7c7a73] font-semibold mx-4 mt-[22px] mb-2">
        {view.qualityName ? `Against ${view.qualityName} spec` : 'Against spec'}
      </div>
      <div className="bg-[#333331] border-y border-[#3f3f3c]">
        {view.rows.map(row => (
          <div
            key={row.key}
            className="flex items-center gap-[11px] px-4 py-[13px] border-b border-[#3f3f3c] last:border-b-0"
          >
            {row.hasThreshold ? (
              <div
                className={`flex-none w-5 h-5 rounded-full grid place-items-center text-xs font-bold ${
                  row.passed ? 'bg-[#5fae6326] text-[#5fae63]' : 'bg-[#d9534f26] text-[#d9534f]'
                }`}
              >
                <span aria-hidden="true">{row.passed ? '✓' : '✕'}</span>
                <span className="sr-only">{row.passed ? 'Passed' : 'Failed'}</span>
              </div>
            ) : (
              <div className="flex-none w-5 h-5" aria-hidden="true" />
            )}

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#f2efe6]">{row.label}</div>
              {row.sublabel && (
                <div className="text-xs text-[#7c7a73] mt-px">{row.sublabel}</div>
              )}
            </div>

            <div
              className={`text-sm font-bold tabular-nums whitespace-nowrap ${
                row.hasThreshold && !row.passed ? 'text-[#d9534f]' : 'text-[#a8a69d]'
              }`}
            >
              {row.actual}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "spec-checklist"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/certificate/[slug]/_components/spec-checklist.tsx"
git commit -m "feat(certificate): spec checklist

One row per criterion the template configures. Passing values muted, not
green — green on every row makes a rejected certificate read as fine."
```

---

### Task 4: Screen distribution and cupping rails

**Files:**
- Create: `src/app/certificate/[slug]/_components/certificate-detail.tsx`

**Interfaces:**
- Consumes: `CertificateView`, `ScreenBar`, `AttributeRail` (Task 2).
- Produces: `<CertificateDetail view={…} />`

Both `<details>` blocks live in one file — they share the summary chrome and are never used apart. Native `<details>`; no JavaScript.

- [ ] **Step 1: Write the component**

Create `src/app/certificate/[slug]/_components/certificate-detail.tsx`:

```tsx
import type { CertificateView, AttributeRail } from './types'

/** Where a score sits relative to its band: inside, near an edge, or outside. */
function railState(rail: AttributeRail): 'in' | 'edge' | 'out' {
  const { score, min, max } = rail
  if (min !== null && score < min) return 'out'
  if (max !== null && score > max) return 'out'
  if (min !== null && score - min <= 0.25) return 'edge'
  if (max !== null && max - score <= 0.25) return 'edge'
  return 'in'
}

/** Clamp a value onto the rail as a 0–100 percentage of its scale. */
function railPercent(value: number, rail: AttributeRail): number {
  const span = rail.scaleMax - rail.scaleMin
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((value - rail.scaleMin) / span) * 100))
}

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <summary className="list-none cursor-pointer px-4 py-[14px] flex items-center justify-between text-[13.5px] font-semibold text-[#f2efe6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
      {children}
      <span className="text-[#7c7a73] text-xs" aria-hidden="true">
        &#8964;
      </span>
    </summary>
  )
}

/**
 * Screen distribution and the cupping profile.
 *
 * The radar chart this replaces clipped off-screen on a phone and coloured
 * every attribute the same olive whether it passed or failed. Seven rails read
 * in one downward glance, and a score outside its band is visibly outside it.
 */
export function CertificateDetail({ view }: { view: CertificateView }) {
  const hasScreens = view.screens.length > 0
  const hasAttributes = view.attributes.length > 0
  if (!hasScreens && !hasAttributes) return null

  return (
    <>
      <div className="text-[11px] tracking-[0.1em] uppercase text-[#7c7a73] font-semibold mx-4 mt-[22px] mb-2">
        Detail
      </div>

      {hasScreens && (
        <details className="bg-[#333331] border-t border-b border-[#3f3f3c]">
          <Summary>Screen distribution</Summary>
          <div className="px-4 pt-1 pb-[18px] border-t border-[#3f3f3c]">
            {view.screens.map(screen => (
              <div key={screen.label} className="flex items-center gap-2.5 mt-[11px]">
                <div className="w-[52px] flex-none text-[12.5px] text-[#a8a69d]">
                  {screen.label}
                </div>
                <div className="flex-1 h-2 rounded bg-[#3b3b39] overflow-hidden">
                  <div
                    className={`h-full rounded ${screen.belowFloor ? 'bg-[#4e5a2b]' : 'bg-[#6d7f37]'}`}
                    style={{ width: `${Math.min(100, Math.max(0, screen.percent))}%` }}
                  />
                </div>
                <div className="w-[46px] text-right text-[12.5px] tabular-nums text-[#f2efe6]">
                  {screen.percent.toFixed(1)}%
                </div>
              </div>
            ))}
            {view.screenSpecNote && (
              <div className="mt-[13px] pt-[11px] border-t border-[#3f3f3c] text-xs text-[#7c7a73]">
                {view.screenSpecNote}
              </div>
            )}
          </div>
        </details>
      )}

      {hasAttributes && (
        <details open className="bg-[#333331] border-b border-[#3f3f3c]">
          <Summary>Cupping profile</Summary>
          <div className="px-4 pt-1 pb-[18px] border-t border-[#3f3f3c]">
            {view.attributes.map((rail, index) => {
              const state = railState(rail)
              const bandStart = rail.min !== null ? railPercent(rail.min, rail) : 0
              const bandEnd = rail.max !== null ? railPercent(rail.max, rail) : 100
              const hasBand = rail.min !== null || rail.max !== null

              return (
                <div key={rail.attribute} className="mt-[15px] first:mt-1.5">
                  <div className="flex justify-between items-baseline mb-1.5">
                    <div className="min-w-0">
                      <span className="text-[13.5px] text-[#f2efe6]">{rail.attribute}</span>
                      {hasBand && (
                        <span className="text-[11px] text-[#7c7a73] ml-1.5">
                          {rail.min !== null && rail.max !== null
                            ? `${rail.min.toFixed(1)}–${rail.max.toFixed(1)}`
                            : rail.min !== null
                              ? `min ${rail.min.toFixed(1)}`
                              : `max ${rail.max?.toFixed(1)}`}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[13.5px] font-bold tabular-nums ${
                        state === 'out'
                          ? 'text-[#d9534f]'
                          : state === 'edge'
                            ? 'text-[#c98a2e]'
                            : 'text-[#a8a69d]'
                      }`}
                    >
                      {rail.score.toFixed(2)}
                      {state === 'out' && <span className="sr-only"> — outside target range</span>}
                    </div>
                  </div>

                  <div className="relative h-[22px]">
                    <div className="absolute left-0 right-0 top-[9px] h-1 rounded-sm bg-[#3b3b39]" />
                    {hasBand && (
                      <div
                        className="absolute top-[9px] h-1 rounded-sm bg-[#4e5a2b]"
                        style={{ left: `${bandStart}%`, width: `${Math.max(0, bandEnd - bandStart)}%` }}
                      />
                    )}
                    <div
                      className={`absolute top-[3px] w-[3px] h-4 rounded-sm -translate-x-[1.5px] ${
                        state === 'out'
                          ? 'bg-[#d9534f]'
                          : state === 'edge'
                            ? 'bg-[#c98a2e]'
                            : 'bg-[#f2efe6]'
                      }`}
                      style={{ left: `${railPercent(rail.score, rail)}%` }}
                    />
                  </div>

                  {index === view.attributes.length - 1 && (
                    <div className="flex justify-between text-[10px] text-[#7c7a73] mt-px">
                      <span>{rail.scaleMin}</span>
                      <span>{(rail.scaleMin + rail.scaleMax) / 2}</span>
                      <span>{rail.scaleMax}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "certificate-detail"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/certificate/[slug]/_components/certificate-detail.tsx"
git commit -m "feat(certificate): screen bars and cupping rails replace the radar

The radar clipped off-screen on a phone and coloured every attribute the
same olive whether it passed or failed. Seven rails read in one downward
glance, with the target band drawn and out-of-range scores in red."
```

---

### Task 5: Fixed footer with the certificate modal

**Files:**
- Create: `src/app/certificate/[slug]/_components/certificate-footer.tsx`

**Interfaces:**
- Consumes: `CertificateView` (Task 2).
- Produces: `<CertificateFooter view={…} />`

**This is the only client component in the plan.** It needs state for the modal and `navigator.share` for the share button.

- [ ] **Step 1: Write the component**

Create `src/app/certificate/[slug]/_components/certificate-footer.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { CertificateView } from './types'

/** Counts read neutral at zero and red above it; booleans read green or red. */
function chipClass(value: number | boolean | null): string {
  if (value === true) return 'text-[#5fae63]'
  if (value === false) return 'text-[#d9534f]'
  if (typeof value === 'number' && value > 0) return 'text-[#d9534f]'
  return 'text-[#f2efe6]'
}

/**
 * Cup integrity at a glance, plus the way to the PDF.
 *
 * Pinned to the bottom because these four numbers are what a buyer asks about
 * second, after the verdict. The page reserves scroll padding equal to this
 * footer's height so the last cupping rail is never trapped behind it.
 */
export function CertificateFooter({ view }: { view: CertificateView }) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) openerRef.current?.focus()
  }, [open])

  const handleShare = async () => {
    const url = window.location.href
    const title = `${view.reference} — ${view.status}`
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // The user dismissed the sheet, or the browser refused. Fall through
        // to the clipboard rather than leaving the button feeling dead.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Nothing sensible left to try.
    }
  }

  const chips: Array<{ k: string; v: string; state: number | boolean | null }> = [
    { k: 'Taints', v: String(view.taints), state: view.taints },
    { k: 'Faults', v: String(view.faults), state: view.faults },
    {
      k: 'Clean',
      v: view.cleanCup === null ? '–' : view.cleanCup ? 'Yes' : 'No',
      state: view.cleanCup,
    },
    {
      k: 'Uniform',
      v: view.uniformCup === null ? '–' : view.uniformCup ? 'Yes' : 'No',
      state: view.uniformCup,
    },
  ]

  return (
    <>
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-[#333331] border-t border-[#4a4a47] shadow-[0_-14px_22px_-8px_rgba(0,0,0,0.55)] pb-[env(safe-area-inset-bottom)] z-30">
        <div className="flex items-stretch py-[7px] pr-2">
          {chips.map((chip, i) => (
            <div
              key={chip.k}
              className={`flex-1 min-w-0 px-0.5 py-0.5 text-center flex flex-col justify-center relative ${
                i > 0 ? 'before:content-[""] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-[#3f3f3c]' : ''
              }`}
            >
              <div className="text-[9px] tracking-[0.07em] uppercase text-[#7c7a73] mb-px truncate">
                {chip.k}
              </div>
              <div className={`text-sm font-bold tabular-nums leading-tight ${chipClass(chip.state)}`}>
                {chip.v}
              </div>
            </div>
          ))}
          <button
            ref={openerRef}
            onClick={() => setOpen(true)}
            aria-label="Open certificate"
            className="flex-none ml-2 w-[58px] min-h-[44px] flex flex-col items-center justify-center gap-px bg-[#6d7f37] text-white rounded-[10px] active:bg-[#5d6c2f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
          >
            <span className="text-base leading-none" aria-hidden="true">&#10515;</span>
            <span className="text-[9px] tracking-[0.08em] font-bold">PDF</span>
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/[0.78] flex items-center justify-center p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
          onClick={e => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cert-modal-title"
            className="w-full max-w-[388px] max-h-[88vh] bg-[#333331] border border-[#4a4a47] rounded-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between gap-2.5 px-3.5 py-3 border-b border-[#3f3f3c]">
              <div className="min-w-0">
                <div className="text-[9.5px] tracking-[0.12em] uppercase text-[#7c7a73] font-semibold">
                  {view.eyebrow}
                </div>
                <div id="cert-modal-title" className="text-[17px] font-bold tracking-[-0.01em] text-[#f2efe6] truncate">
                  {view.reference}
                </div>
              </div>
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                aria-label="Close certificate"
                className="flex-none w-8 h-8 rounded-full bg-[#3b3b39] text-[#a8a69d] text-[13px] active:bg-[#4a4a47] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
              >
                <span aria-hidden="true">&#10005;</span>
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#1c1c1b] p-3.5">
              <iframe
                src={view.pdfUrl}
                title={`Certificate ${view.reference}`}
                className="w-full aspect-[1/1.414] bg-[#f6f4ee] rounded"
              />
            </div>

            <div className="flex gap-2.5 px-3.5 py-3 border-t border-[#3f3f3c]">
              <a
                href={view.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 p-3.5 rounded-xl bg-[#6d7f37] text-white text-[15px] font-semibold active:bg-[#5d6c2f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
              >
                <span aria-hidden="true">&#10515;</span> Save PDF
              </a>
              <button
                onClick={handleShare}
                aria-label="Share certificate"
                className="flex-none w-[52px] flex items-center justify-center p-3.5 rounded-xl bg-[#333331] text-[#f2efe6] border border-[#4a4a47] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
              >
                <span aria-hidden="true">&#8599;</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "certificate-footer"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/certificate/[slug]/_components/certificate-footer.tsx"
git commit -m "feat(certificate): fixed integrity footer with PDF modal

Four cup-integrity cells pinned to the bottom, and a PDF button opening a
preview modal with Save and Web Share, falling back to copying the link."
```

---

### Task 6: Assemble the page

**Files:**
- Modify: `src/app/certificate/[slug]/page.tsx`
- Delete: `src/app/certificate/[slug]/certificate-page-client.tsx`

**Interfaces:**
- Consumes: `evaluateSampleCompliance` (Phase 1 Task 4), `buildChecklistRows` (Task 1), `resolveTaintFaultCounts`, `resolveFinalScores`, `screenGramsToPercent` (Phase 1 Task 2), and all five components (Tasks 2–5).
- Produces: the rebuilt page.

The page keeps its existing fetch of the sample, certificate and assessment, and its `generateMetadata`. What changes: it now also resolves the compliance criteria, and it builds a `CertificateView` instead of passing twenty props to a client component.

**The `resolved_defects` block currently at lines 104–172 goes away.** Taints and faults now come from `resolveTaintFaultCounts`, the same reading the approval gate uses — otherwise the footer can show "0 taints" while the checklist reports a taint failure. This is a deliberate, spec'd change; see the spec's *Deliberately not done* note.

- [ ] **Step 1: Add the lot-identity fields to the sample query**

In `src/app/certificate/[slug]/page.tsx`, extend `sampleSelect` with the fields lot identity needs:

```ts
  const sampleSelect = `
    id,
    tracking_number,
    origin,
    workflow_stage,
    status,
    sample_type,
    container_nr,
    exporter_sample_number,
    buyer_contract_nr,
    wolthers_contract_nr,
    quality_spec_id,
    bag_count,
    bag_weight_kg,
    bag_type,
    bags_quantity_mt,
    exporter:companies!samples_exporter_id_fkey(name, fantasy_name),
    seller:companies!samples_seller_id_fkey(name, fantasy_name),
    quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en, parameters))
  `
```

- [ ] **Step 2: Replace the resolution block with the shared resolvers**

Add to the imports at the top of the file:

```ts
import { evaluateSampleCompliance } from '@/lib/compliance'
import {
  screenGramsToPercent,
  resolveTaintFaultCounts,
  resolveFinalScores,
  type CuppingScoreRow,
} from '@/lib/quality-resolvers'
import { resolveCompanyName } from '@/lib/sleeve-label-data'
import { buildChecklistRows } from '@/lib/certificate-checklist'
import type { CertificateView, AttributeRail, ScreenBar } from './_components/types'
```

Delete the entire `=== DEFECT RESOLUTION ===` block (the `resolved_defects` handling, the master-cupper lookup and the max-across-cuppers fallback — everything from the `let totalTaints = 0` declaration down to the end of that `else if` chain), together with the `attributeScoresMap` accumulation loop. Replace with:

```ts
  // Taints and faults come from the same reading the approval gate uses. The
  // page used to prefer quality_assessments.resolved_defects, which could show
  // "0 taints" beside a checklist row failing on taints.
  const scoreRows = (cuppingScores || []) as unknown as CuppingScoreRow[]

  let masterCupperId: string | null = null
  if (scoreRows.length > 0) {
    const { data: session } = await (supabase as any)
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [sample.id])
      .in('status', ['setup', 'active', 'review', 'completed', 'finalized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    masterCupperId = session?.master_cupper_id || null
  }

  const { taints: totalTaints, faults: totalFaults } =
    resolveTaintFaultCounts(scoreRows, masterCupperId)
  const finalScores = resolveFinalScores(scoreRows, masterCupperId)
```

Also delete the `flavorDescriptors` accumulation and the `flavorDescriptor` most-common pick. The rebuilt page does not render a flavour descriptor, and `generateMetadata` never used it.

Then replace the `cuppingAttributes` mapping so it reads from `finalScores` rather than the averaged map, and returns rails:

```ts
  // Boolean cup judgements are not scored attributes and must not get a rail.
  const BOOLEAN_CUP_NAMES = [
    'clean cup', 'cleancup', 'clean_cup',
    'uniform cup', 'uniformcup', 'uniform_cup', 'uniformity',
    'taints', 'taint', 'faults', 'fault',
  ]

  const standardOrder = [
    'Fragrance/Aroma', 'Fragrance', 'Aroma', 'Flavor', 'Aftertaste',
    'Acidity', 'Body', 'Balance', 'Sweetness', 'Overall',
  ]

  const attributes: AttributeRail[] = Object.entries(finalScores)
    .filter(([attr]) => !BOOLEAN_CUP_NAMES.includes(attr.toLowerCase()))
    .sort(([a], [b]) => {
      const ai = standardOrder.findIndex(s => a.toLowerCase().includes(s.toLowerCase()))
      const bi = standardOrder.findIndex(s => b.toLowerCase().includes(s.toLowerCase()))
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    .map(([attr, score]) => {
      const limits = attrLimitsMap[attr.toLowerCase()]
      const scale = attrScaleMap[attr.toLowerCase()]
      return {
        attribute: attr,
        score: Math.round(score * 100) / 100,
        min: limits?.min ?? null,
        max: limits?.max ?? null,
        scaleMin: scale?.scaleMin ?? 0,
        scaleMax: scale?.scaleMax ?? 5,
      }
    })
```

Leave `attrLimitsMap` and `attrScaleMap` exactly as they are — they already read the template correctly.

- [ ] **Step 3: Evaluate compliance and return the view model**

Still inside `getCertificateInfo`, after the attributes block, add:

```ts
  const criteria = await evaluateSampleCompliance(supabase, sample.id, sample.quality_spec_id ?? null)
  const rows = buildChecklistRows(criteria, { cleanCup, uniformCup })

  // Screens: grams in storage, percentages everywhere else. A screen is "below
  // the floor" when a failing minimum criterion names it.
  const screenPercentages = screenGramsToPercent(greenBean?.screen_sizes)
  const failingScreens = new Set(
    criteria.filter(c => c.key.startsWith('screen_') && !c.passed).map(c => c.label),
  )
  const screens: ScreenBar[] = screenPercentages
    ? Object.entries(screenPercentages)
        .sort(([a], [b]) => {
          const pan = (s: string) => ['pan', 'fundo', 'bottom'].includes(s.toLowerCase())
          if (pan(a) !== pan(b)) return pan(a) ? 1 : -1
          return parseInt(b.replace(/\D/g, '') || '0') - parseInt(a.replace(/\D/g, '') || '0')
        })
        .map(([size, percent]) => {
          const isPan = ['pan', 'fundo', 'bottom'].includes(size.toLowerCase())
          return {
            label: isPan ? 'Pan' : `Scr. ${size.replace(/\D/g, '') || size}`,
            percent,
            belowFloor: isPan || failingScreens.has(`Screen ${size}`),
          }
        })
    : []

  const screenCriterion = criteria.find(c => c.key.startsWith('screen_'))
  const screenSpecNote = screenCriterion
    ? `Spec requires ${screenCriterion.sublabel} on ${screenCriterion.label.toLowerCase()}. This lot: ${typeof screenCriterion.actual === 'number' ? screenCriterion.actual.toFixed(1) : screenCriterion.actual}%.`
    : null
```

Then replace the returned object's tail so it carries these alongside what it already returns:

```ts
  return {
    sample,
    publicReference,
    certified: true,
    certificate,
    qualityName,
    screenSizes: screenPercentages,
    totalDefects,
    totalTaints,
    totalFaults,
    cleanCup,
    uniformCup,
    rows,
    screens,
    screenSpecNote,
    attributes,
  }
```

`primaryDefects` and `secondaryDefects` are no longer needed by the page — the checklist rows carry them — but `generateMetadata` still reads `totalDefects`, so keep that one.

- [ ] **Step 4: Build the view and render**

Replace the default export at the bottom of the file:

```tsx
/** "334 bags · 20.0 MT", or whichever half is known. */
function formatQuantity(sample: {
  bag_count?: number | null
  bags_quantity_mt?: number | null
}): string | null {
  const parts: string[] = []
  if (sample.bag_count) parts.push(`${sample.bag_count} bags`)
  if (sample.bags_quantity_mt) parts.push(`${sample.bags_quantity_mt.toFixed(1)} MT`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "60 kg jute bags" */
function formatBagType(sample: {
  bag_weight_kg?: number | null
  bag_type?: string | null
}): string | null {
  const parts: string[] = []
  if (sample.bag_weight_kg) parts.push(`${sample.bag_weight_kg} kg`)
  if (sample.bag_type) parts.push(sample.bag_type.replace(/_/g, ' '))
  return parts.length > 0 ? parts.join(' ') : null
}

export default async function CertificatePage({ params }: PageProps) {
  const { slug } = await params
  const info = await getCertificateInfo(slug)

  if (!info) {
    return (
      <main className="min-h-dvh bg-[#262625] text-[#f2efe6] flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold mb-2">Certificate not found</h1>
          <p className="text-sm text-[#a8a69d]">
            The requested certificate could not be found.
          </p>
        </div>
      </main>
    )
  }

  // Per the spec: surface the samples that reached the page with nothing a
  // counterparty would recognise, so intake can fill the missing field in.
  if (info.publicReference.reference === 'Reference pending') {
    console.warn(`[certificate] no public reference for sample ${info.sample.id} (slug ${slug})`)
  }

  if (!info.certified) {
    return (
      <main className="min-h-dvh bg-[#262625] text-[#f2efe6]">
        <CertificateHeader />
        <div className="mx-auto w-full max-w-[420px] px-4 py-10 text-center">
          <div className="text-[10px] tracking-[0.12em] uppercase text-[#7c7a73] font-semibold mb-1">
            {info.publicReference.eyebrow}
          </div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] mb-4">
            {info.publicReference.reference}
          </h1>
          <p className="text-sm text-[#a8a69d]">
            This sample is still being evaluated. The certificate appears here once
            the quality assessment is complete.
          </p>
        </div>
      </main>
    )
  }

  const sample = info.sample
  const view: CertificateView = {
    reference: info.publicReference.reference,
    eyebrow: info.publicReference.eyebrow,
    status: info.certificate?.is_rejected ? 'REJECTED' : 'APPROVED',
    qualityName: info.qualityName ?? null,
    exporter: resolveCompanyName(sample.seller) || resolveCompanyName(sample.exporter),
    origin: sample.origin || null,
    quantity: formatQuantity(sample),
    certifiedDate: info.certificate?.created_at
      ? new Date(info.certificate.created_at).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : null,
    bagType: formatBagType(sample),
    rows: info.rows,
    screens: info.screens,
    screenSpecNote: info.screenSpecNote,
    attributes: info.attributes,
    taints: info.totalTaints,
    faults: info.totalFaults,
    cleanCup: info.cleanCup,
    uniformCup: info.uniformCup,
    pdfUrl: `/api/certificate/${slug}/pdf`,
  }

  return (
    <main className="min-h-dvh bg-[#262625] text-[#f2efe6]">
      <div className="mx-auto w-full max-w-[420px] pb-[104px]">
        <CertificateHeader />
        <Verdict view={view} />
        <LotIdentity view={view} />
        <SpecChecklist view={view} />
        <CertificateDetail view={view} />
        <CertificateFooter view={view} />
      </div>
    </main>
  )
}
```

`publicReference.eyebrow` already exists — `resolvePublicReference` returns `{ reference, eyebrow }` and emits `'SS · Container'`, `'PSS · Exporter sample'`, `'Container'`, `'Exporter sample'`, `'Contract'`, or `''` for `Reference pending` ([certificate-slug.ts:46-73](../../../src/lib/certificate-slug.ts#L46-L73)). Use it as-is; no change to that module. Note the empty-string case: the eyebrow `<div>` renders empty for a sample with no recognisable reference, which is correct — there is nothing to name.

- [ ] **Step 5: Add the header**

Still in `page.tsx`, above the default export:

```tsx
/** Slim and sticky — the old header ate ~15% of the viewport before any content. */
function CertificateHeader() {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 bg-[#262625] border-b border-[#3f3f3c]">
      <div className="text-[15px] font-bold tracking-[-0.02em] text-[#f2efe6]">
        w<span className="text-[#6d7f37]">o</span>lthers
        <small className="block text-[8px] tracking-[0.28em] text-[#7c7a73] font-semibold mt-px">
          ASSOCIATES
        </small>
      </div>
      <div className="text-[11px] text-[#7c7a73] flex items-center gap-[5px]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#5fae63]" aria-hidden="true" />
        Verified certificate
      </div>
    </div>
  )
}
```

Add the component imports beside the others:

```tsx
import { Verdict } from './_components/verdict'
import { LotIdentity } from './_components/lot-identity'
import { SpecChecklist } from './_components/spec-checklist'
import { CertificateDetail } from './_components/certificate-detail'
import { CertificateFooter } from './_components/certificate-footer'
```

- [ ] **Step 6: Delete the old client component**

```bash
git rm "src/app/certificate/[slug]/certificate-page-client.tsx"
```

Confirm nothing else imports it:

Run: `grep -rn "certificate-page-client" src/`
Expected: no output.

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS. Report the file and test totals.

- [ ] **Step 9: Verify by hand**

With the dev server running, open a rejected certificate on a narrow viewport (375px) and confirm each of these:

1. The header is under 44px and stays put when scrolling.
2. The verdict names the failed criterion with the number in red, and every failure line also appears as a failing row in the checklist.
3. An approved certificate shows the badge and **no** failure block.
4. Lot identity matches the printed sleeve label for the same sample.
5. Screen percentages sum to roughly 100.
6. Cupping rails: the band sits where the template's min/max say, the tick sits on the score, and a score outside the band is red.
7. The footer stays pinned and the last rail is not trapped behind it.
8. The PDF button opens the modal; Escape and the backdrop both close it; focus returns to the PDF button.
9. Nothing anywhere shows a `SAN-` reference — check the page, the tab title, and the share text.
10. At 320px there is no horizontal scroll.

- [ ] **Step 10: Commit**

```bash
git add "src/app/certificate/[slug]/page.tsx"
git commit -m "feat(certificate): rebuild the public page around the verdict

A scan now answers the only question it is asked: is this lot approved,
and if not, why not. The verdict names the failed criteria, the checklist
shows every criterion the template configures, and cupping rails replace
a radar chart that clipped off-screen on a phone.

Taints and faults now use the approval gate's reading rather than
resolved_defects, so the footer cannot contradict the checklist."
```

---

## Verification before shipping

- [ ] `npx vitest run` — full suite green; report counts.
- [ ] `npx tsc --noEmit -p tsconfig.json` — 0 errors.
- [ ] All ten manual checks in Task 6 Step 9.
- [ ] Scan a real printed tin with a phone and confirm the page it opens is this one.
- [ ] A sample with no cupping data renders without the rail section and without cupping checklist rows — no zeros, no empty block.

## Open items carried forward

- **Thresholds.** Confirm the real Dunkin values with Gabriel. Everything resolves from the template at runtime, so this is a data check.
- **Should the approval gate honour `resolved_defects`?** The page now matches the gate. Whether the gate should adopt the validator's cleanup is a separate decision that changes approval outcomes.
- **Public certificate enumerability.** `resolveSampleIdForSlug` passes the slug into `.ilike` without escaping `%`. Pre-existing, not a regression.
