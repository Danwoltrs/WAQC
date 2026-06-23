# Annual Quality Performance Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Annual Quality Performance Review — a once-a-year, per-QC-client supplier-performance PDF (cross-lab, cross-origin) rendered in a clean Scandinavian style, with hero numbers, per-exporter PSS/SS performance, top rejection reasons, importer/seller/origin/lab breakdowns, a 12-month trend, and a full-page landscape whole-year Sankey.

**Architecture:** Approach A — reuse the live Bi-Weekly engine. The data layer wraps `aggregateBucket` over a full-calendar-year window and adds only what is new (seller breakdown, 12-month trend, by-origin, by-lab, whole-year Sankey). The visual layer is a brand-new bespoke `@react-pdf` document; the GET + send API routes clone the Bi-Weekly routes with `report_type = 'annual'`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (server client), `@react-pdf/renderer`, Vitest. Reuses `src/lib/report-data.ts` (`buildSankey`, `mapCertRowToReportRow`, `categorizeViolation`), `src/lib/reports/biweekly-data.ts` (`aggregateBucket` + helpers), and `src/components/pdf/charts/*`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-22-annual-performance-report-design.md` — every task implicitly inherits its locked decisions.
- **Per QC client, across ALL labs and ALL origins.** Query filters on `client_id` + year window only — NEVER on `laboratory_id` or `origin`.
- **PSS aggregates on `'count'`, SS aggregates on `'bags'`** (matches `Performance Year 2025.xlsx`).
- **No DB migration** — `annual` is already in `VALID_REPORT_TYPES` (`src/lib/reports/recipients.ts:12`); recipients key on `(client_id, 'annual')`.
- **Aesthetic = Scandinavian:** white background, near-black text, ONE accent = olive `#556b2f`, beige `#efe4d4` only as a faint wash, warm grays for hairlines. Validation green/red ONLY for approved/rejected. Inter font. Generous whitespace. Restrained monochrome charts. **Bespoke — not a reskin of the Bi-Weekly PDF.**
- **YoY deltas OUT of v1.** Single-year only.
- **No emojis in UI. No mock data in app code** (synthetic data is for tests/smoke only).
- **File-size ceiling ~2000 lines.** Keep Annual logic in its own `annual-*.ts(x)` modules; do not grow `report-data.ts`.
- **Tests:** `npx vitest run`. **Typecheck:** `npx tsc --noEmit`. Commit after each task.
- **Single repo (WAQC).** Commit code + docs here. Push only when the user asks.

---

## File Structure

- **Create** `src/lib/reports/annual-data.ts` — fetch + aggregate; exports `AnnualPerformanceReportData`, `MonthlyPoint`, `MonthlySeries`, the pure aggregation helpers, and `getAnnualPerformanceReportData()`.
- **Create** `src/lib/reports/annual-data.test.ts` — Vitest unit tests for the pure aggregation.
- **Create** `src/components/pdf/reports/annual-performance-report.tsx` — the bespoke Scandinavian `@react-pdf` document (pages 1–11; page 10 landscape).
- **Create** `src/lib/reports/annual-generator.ts` — asset loading + `renderToBuffer` + filename (clone of `biweekly-generator.ts`).
- **Create** `src/app/api/reports/annual/route.ts` — GET (download/preview PDF).
- **Create** `src/app/api/reports/annual/send/route.ts` — POST (email send).
- **Modify** `src/lib/reports/biweekly-data.ts` — add `export` to `groupBy` and `scorecardFromExporters` (additive; no behavior change) so the Annual can reuse them.
- **Modify** `src/components/reports/preview-report-modal.tsx` — add `ANNUAL_KIND`, widen `reportType` union, support landscape note.
- **Modify** `src/app/dashboard/reports/page.tsx` — add a 3rd card with a year picker.

---

## Task 1: Export reusable helpers from the Bi-Weekly engine

**Files:**
- Modify: `src/lib/reports/biweekly-data.ts:85` (`groupBy`), `src/lib/reports/biweekly-data.ts:183` (`scorecardFromExporters`)
- Test: `src/lib/reports/biweekly-data.test.ts` (existing — add one import-surface test, or create if absent)

**Interfaces:**
- Produces: `export function groupBy(rows: BiweeklyRow[], keyOf: (r: BiweeklyRow) => string | null): GroupPerf[]` and `export function scorecardFromExporters(perf: GroupPerf[]): SupplierScorecardRow[]` — consumed by Task 2.

- [ ] **Step 1: Add the `export` keyword to both helpers**

In `src/lib/reports/biweekly-data.ts`, change:
```typescript
function groupBy(
```
to:
```typescript
export function groupBy(
```
and change:
```typescript
function scorecardFromExporters(perf: GroupPerf[]): SupplierScorecardRow[] {
```
to:
```typescript
export function scorecardFromExporters(perf: GroupPerf[]): SupplierScorecardRow[] {
```
(`SupplierScorecardRow` is already imported at the top of the file from `@/lib/report-data`.)

- [ ] **Step 2: Verify the existing suite still passes (no behavior change)**

Run: `npx vitest run src/lib/reports/biweekly-data.test.ts`
Expected: PASS (same tests as before — exporting a symbol changes nothing at runtime). If the file does not exist, skip to Step 3.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/reports/biweekly-data.ts
git commit -m "refactor(reports): export groupBy + scorecardFromExporters for Annual reuse"
```

---

## Task 2: Annual data layer — types + pure aggregation

Build `annual-data.ts` with the pure, fully-testable pieces: the return types, the hero computation, the seller/origin/lab breakdowns, and the 12-month series. The Supabase fetch is added in Task 3.

**Files:**
- Create: `src/lib/reports/annual-data.ts`
- Test: `src/lib/reports/annual-data.test.ts`

**Interfaces:**
- Consumes: `aggregateBucket`, `groupBy`, `scorecardFromExporters`, `BiweeklyRow`, `GroupPerf`, `BucketAggregate` from `@/lib/reports/biweekly-data`; `buildSankey`, `ClientSankeyType` from `@/lib/report-data`; `SankeyLayoutResult` from `@/lib/charts/sankey-layout`.
- Produces (consumed by Tasks 3–4):
  - `interface MonthlyPoint { month: number; label: string; evaluated: number; approved: number; rejected: number; approvalRate: number; bagsApproved: number }`
  - `type MonthlySeries = MonthlyPoint[]` (always length 12)
  - `interface AnnualPerformanceReportData { … }` (full shape below)
  - `function buildMonthlySeries(pssRows: BiweeklyRow[], ssRows: BiweeklyRow[]): MonthlySeries`
  - `function computeHero(pss: BucketAggregate, ss: BucketAggregate): AnnualHero`
  - `function buildAnnualAggregates(pssRows, ssRows, opts): AnnualAggregates` (the pure core that Task 3's fetch calls)

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/annual-data.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  buildMonthlySeries,
  computeHero,
  buildAnnualAggregates,
} from './annual-data'
import type { BiweeklyRow } from './biweekly-data'

// Minimal row factory — only the fields the aggregation reads.
function row(p: Partial<BiweeklyRow> & { is_rejected: boolean }): BiweeklyRow {
  return {
    certificate_number: 'X',
    is_rejected: p.is_rejected,
    bags: p.bags ?? 0,
    exporter_name: p.exporter_name ?? null,
    seller_name: p.seller_name ?? null,
    importer_name: p.importer_name ?? null,
    region: p.region ?? null,
    created_at: p.created_at ?? '2025-01-15T00:00:00Z',
    origin: (p as any).origin ?? null,
    laboratory_name: (p as any).laboratory_name ?? null,
  } as unknown as BiweeklyRow
}

describe('computeHero', () => {
  it('combines PSS + SS totals and rates', () => {
    const pssRows = [row({ is_rejected: false }), row({ is_rejected: true })]
    const ssRows = [row({ is_rejected: false, bags: 600 }), row({ is_rejected: false, bags: 400 })]
    // aggregateBucket is imported inside annual-data; here we feed its outputs:
    const hero = computeHero(
      { totals: { evaluated: 2, approved: 1, rejected: 1, rejectionRate: 50, bagsApproved: 0 } } as any,
      { totals: { evaluated: 2, approved: 2, rejected: 0, rejectionRate: 0, bagsApproved: 1000 } } as any,
    )
    expect(hero.samplesEvaluated).toBe(4)
    expect(hero.rejections).toBe(1)
    expect(hero.bagsCleared).toBe(1000)
    expect(hero.overallApprovalRate).toBe(75)   // 3 approved / 4 evaluated
    expect(hero.overallRejectionRate).toBe(25)
  })

  it('is zero-safe with no samples', () => {
    const hero = computeHero(
      { totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0 } } as any,
      { totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0 } } as any,
    )
    expect(hero.overallApprovalRate).toBe(0)
    expect(hero.samplesEvaluated).toBe(0)
  })
})

describe('buildMonthlySeries', () => {
  it('always returns 12 zero-filled months in order', () => {
    const series = buildMonthlySeries([], [])
    expect(series).toHaveLength(12)
    expect(series[0]).toMatchObject({ month: 1, label: 'Jan', evaluated: 0, approvalRate: 0 })
    expect(series[11].label).toBe('Dec')
  })

  it('buckets rows by UTC month and computes rate + bags', () => {
    const pssRows = [
      row({ is_rejected: false, created_at: '2025-03-10T00:00:00Z' }),
      row({ is_rejected: true, created_at: '2025-03-20T00:00:00Z' }),
    ]
    const ssRows = [
      row({ is_rejected: false, bags: 500, created_at: '2025-03-05T00:00:00Z' }),
    ]
    const series = buildMonthlySeries(pssRows, ssRows)
    const mar = series[2] // March
    expect(mar.evaluated).toBe(3)        // 2 PSS + 1 SS
    expect(mar.approved).toBe(2)
    expect(mar.rejected).toBe(1)
    expect(mar.approvalRate).toBe(67)    // round(2/3*100)
    expect(mar.bagsApproved).toBe(500)   // SS approved bags only
  })
})

describe('buildAnnualAggregates', () => {
  const pssRows = [
    row({ is_rejected: false, exporter_name: 'Comexim', seller_name: 'Comexim', importer_name: 'Imp A', origin: 'Brazil', laboratory_name: 'Santos' }),
    row({ is_rejected: true, exporter_name: 'Eisa', seller_name: null, importer_name: 'Imp A', origin: 'Brazil', laboratory_name: 'Santos' }),
  ]
  const ssRows = [
    row({ is_rejected: false, bags: 1200, exporter_name: 'Comexim', seller_name: 'Comexim', importer_name: 'Imp A', origin: 'Colombia', laboratory_name: 'Buenaventura' }),
  ]

  it('produces per-exporter PSS (count) and SS (bags) buckets', () => {
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co' })
    expect(agg.pss.totals.evaluated).toBe(2)
    expect(agg.ss.totals.bagsApproved).toBe(1200)
    expect(agg.pss.byExporter.map(g => g.name)).toContain('Comexim')
  })

  it('builds a seller breakdown labelling unset sellers Unspecified', () => {
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co' })
    const names = agg.bySellerPss.map(g => g.name)
    expect(names).toContain('Comexim')
    expect(names).toContain('Unspecified')   // Eisa row had seller_name: null
  })

  it('builds by-origin and by-lab from combined rows', () => {
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co' })
    expect(agg.byOrigin.map(g => g.name).sort()).toEqual(['Brazil', 'Colombia'])
    expect(agg.byLab.map(g => g.name).sort()).toEqual(['Buenaventura', 'Santos'])
    expect(agg.labsCovered.sort()).toEqual(['Buenaventura', 'Santos'])
    expect(agg.originsCovered.sort()).toEqual(['Brazil', 'Colombia'])
  })

  it('sets showSankey false when fewer than 3 columns resolve', () => {
    // single counterparty → not enough columns for a meaningful flow
    const thin = [row({ is_rejected: false, bags: 100, exporter_name: 'Comexim', importer_name: null })]
    const agg = buildAnnualAggregates([], thin, { sankeyType: 'importer', clientDisplay: 'Test Co' })
    expect(typeof agg.showSankey).toBe('boolean')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/reports/annual-data.test.ts`
Expected: FAIL — `annual-data.ts` does not export these yet (module/exports not found).

- [ ] **Step 3: Implement the pure aggregation in `annual-data.ts`**

Create `src/lib/reports/annual-data.ts`:
```typescript
/**
 * Annual Quality Performance Review — data layer.
 *
 * Reuses the Bi-Weekly engine (aggregateBucket + helpers) over a full
 * calendar-year window for ONE QC client, across ALL labs and ALL origins.
 * Adds the pieces the Bi-Weekly lacks: a seller breakdown, by-origin and
 * by-lab breakdowns, a 12-month trend series, and a whole-year Sankey.
 *
 * The Supabase fetch lives in getAnnualPerformanceReportData (below); the pure
 * functions above it are unit-tested in isolation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aggregateBucket,
  groupBy,
  scorecardFromExporters,
  type BiweeklyRow,
  type GroupPerf,
  type BucketAggregate,
} from '@/lib/reports/biweekly-data'
import {
  buildSankey,
  mapCertRowToReportRow,
  type ClientSankeyType,
  type RawCertSampleRow,
} from '@/lib/report-data'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

/** A BiweeklyRow extended with the fields the Annual groups on. */
export type AnnualRow = BiweeklyRow & { origin: string | null; laboratory_name: string | null }

export interface MonthlyPoint {
  month: number          // 1-12
  label: string          // 'Jan' … 'Dec'
  evaluated: number      // PSS + SS samples assessed that month
  approved: number
  rejected: number
  approvalRate: number   // 0-100, rounded; 0 when evaluated === 0
  bagsApproved: number   // SS approved bags that month
}
export type MonthlySeries = MonthlyPoint[]

export interface AnnualHero {
  samplesEvaluated: number
  overallApprovalRate: number   // 0-100
  bagsCleared: number           // SS approved bags
  rejections: number
  overallRejectionRate: number  // 0-100
}

export interface AnnualAggregates {
  hero: AnnualHero
  pss: BucketAggregate          // basis: count
  ss: BucketAggregate           // basis: bags
  bySellerPss: GroupPerf[]
  bySellerSs: GroupPerf[]
  byOrigin: GroupPerf[]
  byLab: GroupPerf[]
  labsCovered: string[]
  originsCovered: string[]
  monthly: MonthlySeries
  sankey: SankeyLayoutResult
  sankeyColumns: string[]
  showSankey: boolean
}

export interface AnnualPerformanceReportData {
  client: { id: string; name: string; logo_url: string | null; is_roaster: boolean; sankey_type: ClientSankeyType }
  period: { year: number; issued_at: string }
  origin: string | null         // dominant origin, for the header flag
  agg: AnnualAggregates
}

export function computeHero(pss: BucketAggregate, ss: BucketAggregate): AnnualHero {
  const evaluated = pss.totals.evaluated + ss.totals.evaluated
  const approved = pss.totals.approved + ss.totals.approved
  const rejected = pss.totals.rejected + ss.totals.rejected
  return {
    samplesEvaluated: evaluated,
    overallApprovalRate: pct(approved, evaluated),
    bagsCleared: ss.totals.bagsApproved,
    rejections: rejected,
    overallRejectionRate: pct(rejected, evaluated),
  }
}

export function buildMonthlySeries(pssRows: BiweeklyRow[], ssRows: BiweeklyRow[]): MonthlySeries {
  const series: MonthlySeries = MONTH_LABELS.map((label, i) => ({
    month: i + 1, label, evaluated: 0, approved: 0, rejected: 0, approvalRate: 0, bagsApproved: 0,
  }))
  const add = (rows: BiweeklyRow[], countBags: boolean) => {
    for (const r of rows) {
      const created = (r as any).created_at as string | undefined
      if (!created) continue
      const m = new Date(created).getUTCMonth() // 0-11
      const p = series[m]
      p.evaluated += 1
      if (r.is_rejected) p.rejected += 1
      else {
        p.approved += 1
        if (countBags) p.bagsApproved += r.bags ?? 0
      }
    }
  }
  add(pssRows, false)   // PSS contributes to counts only
  add(ssRows, true)     // SS contributes counts + approved bags
  for (const p of series) p.approvalRate = pct(p.approved, p.evaluated)
  return series
}

export function buildAnnualAggregates(
  pssRows: BiweeklyRow[],
  ssRows: BiweeklyRow[],
  opts: { sankeyType: ClientSankeyType; clientDisplay: string },
): AnnualAggregates {
  const pss = aggregateBucket(pssRows, 'count')
  const ss = aggregateBucket(ssRows, 'bags')

  const allRows = [...pssRows, ...ssRows] as AnnualRow[]
  const bySellerPss = groupBy(pssRows, r => r.seller_name ?? 'Unspecified')
  const bySellerSs = groupBy(ssRows, r => r.seller_name ?? 'Unspecified')
  const byOrigin = groupBy(allRows, r => (r.origin && r.origin.trim()) || 'Unspecified')
  const byLab = groupBy(allRows, r => (r.laboratory_name && r.laboratory_name.trim()) || 'Unspecified')

  const labsCovered = [...new Set(allRows.map(r => r.laboratory_name).filter((x): x is string => !!x))]
  const originsCovered = [...new Set(allRows.map(r => r.origin).filter((x): x is string => !!x))]

  // Whole-year Sankey from approved SS rows (trade-relevant flow), same basis
  // the Bi-Weekly uses.
  const ssApproved = ssRows.filter(r => !r.is_rejected)
  const { layout: sankey, columns: sankeyColumns } = buildSankey(
    ssApproved, scorecardFromExporters(ss.byExporter), opts.sankeyType, opts.clientDisplay,
  )

  return {
    hero: computeHero(pss, ss),
    pss, ss,
    bySellerPss, bySellerSs,
    byOrigin, byLab,
    labsCovered, originsCovered,
    monthly: buildMonthlySeries(pssRows, ssRows),
    sankey, sankeyColumns,
    showSankey: sankeyColumns.length > 2,
  }
}
```
(Note: `groupBy`'s callback returns `string | null`; returning `'Unspecified'` instead of `null` is intentional so unset sellers/origins/labs appear as their own group rather than being dropped.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/reports/annual-data.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `BiweeklyRow` lacks `created_at`/`origin`/`laboratory_name` in its type, the `as any` casts in `buildMonthlySeries`/`AnnualRow` cover it — the fields are present at runtime from the fetch in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/annual-data.ts src/lib/reports/annual-data.test.ts
git commit -m "feat(reports): Annual data layer — hero, monthly series, seller/origin/lab breakdowns, year Sankey"
```

---

## Task 3: Annual data fetch — `getAnnualPerformanceReportData`

Wire the pure aggregation to a Supabase query cloned from `getBiweeklyPerformanceReportData`, widened to a year window, with NO lab/origin filter, plus `laboratory` name resolution.

**Files:**
- Modify: `src/lib/reports/annual-data.ts` (append the fetch function + a row-shaping helper)
- Test: `src/lib/reports/annual-data.test.ts` (add a test for the pure row-shaping helper)

**Interfaces:**
- Consumes: `mapCertRowToReportRow`, `RawCertSampleRow` from `@/lib/report-data`.
- Produces: `function getAnnualPerformanceReportData(supabase, { clientId: string; year: number }): Promise<AnnualPerformanceReportData | null>` (consumed by Task 4) and `function toAnnualRow(c: RawCertSampleRow, ctx, labName: string | null): AnnualRow`.

- [ ] **Step 1: Write the failing test for the pure row-shaper**

Append to `src/lib/reports/annual-data.test.ts`:
```typescript
import { toAnnualRow } from './annual-data'

describe('toAnnualRow', () => {
  it('carries origin, region (micro_origin), lab name, and violations', () => {
    const raw = {
      certificate_number: 'BR-1/25',
      created_at: '2025-06-01T00:00:00Z',
      is_rejected: false,
      compliance_violations: ['moisture'],
      sample: {
        id: 's1', sample_type: 'ss', client_id: 'c1',
        origin: 'Brazil', micro_origin: 'Cerrado',
        bag_count: 320, equivalent_60kg_bags: 320,
        exporter: { name: 'Comexim', fantasy_name: null },
        seller: { name: 'Comexim', fantasy_name: null },
        importer: { name: 'Imp A', fantasy_name: null },
        roaster: null,
      },
    } as any
    const r = toAnnualRow(raw, { sankeyType: 'importer', clientDisplay: 'Test Co' }, 'Santos')
    expect(r.origin).toBe('Brazil')
    expect(r.region).toBe('Cerrado')
    expect(r.laboratory_name).toBe('Santos')
    expect((r as any)._violations).toEqual(['moisture'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/reports/annual-data.test.ts -t toAnnualRow`
Expected: FAIL — `toAnnualRow` not exported.

- [ ] **Step 3: Implement `toAnnualRow` + `getAnnualPerformanceReportData`**

Append to `src/lib/reports/annual-data.ts`:
```typescript
/** Map a raw cert row → an AnnualRow, carrying region, origin, lab name, violations. */
export function toAnnualRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
  labName: string | null,
): AnnualRow {
  const base = mapCertRowToReportRow(c, ctx)
  const enriched = base as AnnualRow & { _violations?: string[]; created_at?: string }
  enriched.region = c.sample?.micro_origin ?? null
  enriched.origin = c.sample?.origin ?? null
  enriched.laboratory_name = labName
  enriched.created_at = (c as any).created_at
  enriched._violations = (c as any).compliance_violations ?? []
  return enriched
}

export async function getAnnualPerformanceReportData(
  supabase: SupabaseClient,
  params: { clientId: string; year: number },
): Promise<AnnualPerformanceReportData | null> {
  const { clientId, year } = params
  const startDate = `${year}-01-01T00:00:00.000Z`
  const endDate = `${year + 1}-01-01T00:00:00.000Z`

  const { data: client, error: clientError } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, logo_url, company_types, trading_roles')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[annual-data] client not found:', clientId, clientError)
    return null
  }
  const companyTypes: string[] = client.company_types ?? []
  const tradingRoles: string[] = client.trading_roles ?? []
  const clientIsRoaster = companyTypes.some(t => typeof t === 'string' && t.toLowerCase() === 'roaster')
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'

  // Lab id → name lookup (small table; load once). Cross-lab is intentional —
  // we DO NOT filter by laboratory_id.
  const { data: labs } = await (supabase as any).from('laboratories').select('id, name')
  const labNameById = new Map<string, string>((labs ?? []).map((l: any) => [l.id, l.name]))

  // Same query shape as the Bi-Weekly, plus sample.laboratory_id. NO lab/origin filter.
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id, sample_type, client_id, origin, micro_origin, laboratory_id, container_nr, ico_number,
        bag_count, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,
        exporter:companies!samples_exporter_id_fkey(name,fantasy_name),
        seller:companies!samples_seller_id_fkey(name,fantasy_name),
        importer:companies!samples_importer_id_fkey(name,fantasy_name),
        roaster:companies!samples_roaster_id_fkey(name,fantasy_name)
      )
    `)
    .is('sample_contract_id', null)
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (certsError) {
    console.error('[annual-data] certificates query failed:', certsError)
    return null
  }

  const forClient = (certs || []).filter((c: any) => c.sample && c.sample.client_id === clientId)
  const shape = (c: any) =>
    toAnnualRow(c as RawCertSampleRow, { sankeyType, clientDisplay }, labNameById.get(c.sample.laboratory_id) ?? null)
  const pssRows = forClient.filter((c: any) => c.sample.sample_type === 'pss').map(shape)
  const ssRows = forClient.filter((c: any) => c.sample.sample_type === 'ss').map(shape)

  // Dominant origin across both buckets (header flag).
  const originCounts = new Map<string, number>()
  for (const c of forClient as any[]) {
    const o = c.sample?.origin
    if (o) originCounts.set(o, (originCounts.get(o) ?? 0) + 1)
  }
  const origin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType, clientDisplay })

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { year, issued_at: new Date().toISOString() },
    origin,
    agg,
  }
}
```

- [ ] **Step 4: Run the full data-layer test**

Run: `npx vitest run src/lib/reports/annual-data.test.ts`
Expected: PASS (incl. the new `toAnnualRow` test).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/annual-data.ts src/lib/reports/annual-data.test.ts
git commit -m "feat(reports): Annual data fetch — per-client, cross-lab, cross-origin year window"
```

---

## Task 4: Annual PDF document — Scandinavian generator component

Build the bespoke `@react-pdf` document (pages 1–11; page 10 landscape). This is presentation code — verified by smoke render in Task 7, not unit tests. Reuse the existing chart components (`HorizontalBarChart`, `SankeyChart`).

**Files:**
- Create: `src/components/pdf/reports/annual-performance-report.tsx`

**Interfaces:**
- Consumes: `AnnualPerformanceReportData` from `@/lib/reports/annual-data`; `HorizontalBarChart` from `@/components/pdf/charts/horizontal-bar-chart`; `SankeyChart` from `@/components/pdf/charts/sankey-chart`.
- Produces: `export function AnnualPerformanceReport(props: { data: AnnualPerformanceReportData; wolthersLogoBase64?: string; clientLogoBase64?: string; flagBase64?: string }): JSX.Element` (consumed by Task 5).

- [ ] **Step 1: Create the document component**

Create `src/components/pdf/reports/annual-performance-report.tsx`. Use a restrained Scandinavian stylesheet (white bg, olive accent `#556b2f`, beige `#efe4d4` wash, warm-gray hairlines `#e3e3e3`, near-black `#1a1a1a` text). Portrait A4 for all pages EXCEPT the Sankey page, which is `orientation="landscape"`. Structure each page per the spec's spine. Skeleton with the real page set:

```tsx
/**
 * Annual Quality Performance Review — bespoke Scandinavian layout.
 * A4 portrait pages 1–9 + 11; page 10 (year Sankey) is A4 LANDSCAPE.
 * Reuses Inter (registered by certificate-styles) + the shared PDF charts.
 */
import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import type { GroupPerf } from '@/lib/reports/biweekly-data'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'

const OLIVE = '#556b2f'
const BEIGE = '#efe4d4'
const HAIR = '#e3e3e3'
const INK = '#1a1a1a'
const MUTED = '#6b6b6b'
const RED = '#ef4444'

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 11, color: INK, backgroundColor: '#FFFFFF', paddingVertical: 56, paddingHorizontal: 56 },
  cover: { fontFamily: 'Inter', backgroundColor: '#FFFFFF', padding: 56, height: '100%', justifyContent: 'space-between' },
  coverTitle: { fontSize: 30, fontWeight: 700, color: INK, marginBottom: 8 },
  coverYear: { fontSize: 44, fontWeight: 700, color: OLIVE },
  coverSub: { fontSize: 13, color: MUTED },
  rule: { height: 2, backgroundColor: OLIVE, width: 64, marginVertical: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 },
  sectionWash: { backgroundColor: BEIGE, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginBottom: 16 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 24 },
  heroCell: { width: '45%' },
  heroNum: { fontSize: 40, fontWeight: 700, color: OLIVE },
  heroCap: { fontSize: 11, color: MUTED, marginTop: 4 },
  table: { marginTop: 12 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: HAIR, paddingVertical: 4 },
  trTotal: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: INK, paddingVertical: 5 },
  th: { fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  cellName: { flex: 3 },
  cellNum: { flex: 1, textAlign: 'right' },
  semibold: { fontWeight: 700 },
  footer: { position: 'absolute', bottom: 24, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED, borderTopWidth: 0.5, borderTopColor: HAIR, paddingTop: 6 },
})

interface Props {
  data: AnnualPerformanceReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

function Footer({ year }: { year: number }) {
  return (
    <View style={s.footer} fixed>
      <Text>Wolthers — Annual Quality Performance Review {year}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

// A reusable performance table: Exporter | APP | REJ | TOTAL | %APP | %REJ + TOTAL GERAL.
function PerfTable({ rows, basisLabel }: { rows: GroupPerf[]; basisLabel: 'count' | 'bags' }) {
  const val = (g: GroupPerf, kind: 'app' | 'rej' | 'tot') => {
    const app = basisLabel === 'bags' ? g.approvedBags : g.approvedCount
    const rej = basisLabel === 'bags' ? g.rejectedBags : g.rejectedCount
    return kind === 'app' ? app : kind === 'rej' ? rej : app + rej
  }
  const tot = rows.reduce((a, g) => ({ app: a.app + val(g, 'app'), rej: a.rej + val(g, 'rej') }), { app: 0, rej: 0 })
  const grand = tot.app + tot.rej
  const p = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  return (
    <View style={s.table}>
      <View style={s.tr}>
        <Text style={[s.th, s.cellName]}>Exporter</Text>
        <Text style={[s.th, s.cellNum]}>APP</Text>
        <Text style={[s.th, s.cellNum]}>REJ</Text>
        <Text style={[s.th, s.cellNum]}>TOTAL</Text>
        <Text style={[s.th, s.cellNum]}>%APP</Text>
        <Text style={[s.th, s.cellNum]}>%REJ</Text>
      </View>
      {rows.map((g) => {
        const a = val(g, 'app'), r = val(g, 'rej'), t = a + r
        return (
          <View style={s.tr} key={g.name}>
            <Text style={s.cellName}>{g.name}</Text>
            <Text style={s.cellNum}>{a}</Text>
            <Text style={s.cellNum}>{r}</Text>
            <Text style={s.cellNum}>{t}</Text>
            <Text style={s.cellNum}>{p(a, t)}%</Text>
            <Text style={s.cellNum}>{p(r, t)}%</Text>
          </View>
        )
      })}
      <View style={s.trTotal}>
        <Text style={[s.cellName, s.semibold]}>TOTAL GERAL</Text>
        <Text style={[s.cellNum, s.semibold]}>{tot.app}</Text>
        <Text style={[s.cellNum, s.semibold]}>{tot.rej}</Text>
        <Text style={[s.cellNum, s.semibold]}>{grand}</Text>
        <Text style={[s.cellNum, s.semibold]}>{p(tot.app, grand)}%</Text>
        <Text style={[s.cellNum, s.semibold]}>{p(tot.rej, grand)}%</Text>
      </View>
    </View>
  )
}

export function AnnualPerformanceReport({ data, wolthersLogoBase64, clientLogoBase64, flagBase64 }: Props) {
  const { client, period, agg } = data
  const hero = agg.hero
  return (
    <Document>
      {/* 1 — Cover */}
      <Page size="A4" style={s.cover}>
        <View>
          {wolthersLogoBase64 ? <Image src={wolthersLogoBase64} style={{ width: 150, height: 30, objectFit: 'contain' }} /> : null}
        </View>
        <View>
          <Text style={s.coverSub}>{client.name}</Text>
          <Text style={s.coverTitle}>Annual Quality Performance Review</Text>
          <View style={s.rule} />
          <Text style={s.coverYear}>{period.year}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {clientLogoBase64 ? <Image src={clientLogoBase64} style={{ maxWidth: 120, maxHeight: 40, objectFit: 'contain' }} /> : <View />}
          {flagBase64 ? <Image src={flagBase64} style={{ width: 48, height: 32, objectFit: 'contain' }} /> : <View />}
        </View>
      </Page>

      {/* 2 — Year at a Glance */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>The Year at a Glance</Text>
        <View style={s.heroRow}>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.samplesEvaluated}</Text><Text style={s.heroCap}>Samples QC'd</Text></View>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.overallApprovalRate}%</Text><Text style={s.heroCap}>Overall approval rate</Text></View>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.bagsCleared.toLocaleString('en-US')}</Text><Text style={s.heroCap}>Bags cleared (SS approved)</Text></View>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.rejections}</Text><Text style={s.heroCap}>Rejections ({hero.overallRejectionRate}%)</Text></View>
        </View>
        <Footer year={period.year} />
      </Page>

      {/* 3 — PSS performance (count) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Pre-Shipment (PSS) Performance · by sample</Text></View>
        <PerfTable rows={agg.pss.byExporter} basisLabel="count" />
        <Footer year={period.year} />
      </Page>

      {/* 4 — SS performance (bags) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Shipment (SS) Performance · by bags</Text></View>
        <PerfTable rows={agg.ss.byExporter} basisLabel="bags" />
        <Footer year={period.year} />
      </Page>

      {/* 5 — Top rejection reasons (PSS / SS) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Top Rejection Reasons</Text></View>
        <View style={{ flexDirection: 'row', gap: 24 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.th}>Pre-Shipment (PSS)</Text>
            {agg.pss.rejectionReasons.map(r => (
              <View style={s.tr} key={`p-${r.category}`}><Text style={s.cellName}>{r.category}</Text><Text style={s.cellNum}>{r.count}</Text></View>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.th}>Shipment (SS)</Text>
            {agg.ss.rejectionReasons.map(r => (
              <View style={s.tr} key={`s-${r.category}`}><Text style={s.cellName}>{r.category}</Text><Text style={s.cellNum}>{r.count}</Text></View>
            ))}
          </View>
        </View>
        <Footer year={period.year} />
      </Page>

      {/* 6 — Counterparty breakdowns */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Counterparty Breakdowns</Text></View>
        <BreakdownBlock title="By Importer" rows={agg.ss.byImporter} />
        <BreakdownBlock title="By Seller" rows={agg.bySellerSs} />
        <BreakdownBlock title="By Exporter / Shipper" rows={agg.ss.byExporter} />
        <Footer year={period.year} />
      </Page>

      {/* 7 — Origin */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Where the Coffee Came From</Text></View>
        <BreakdownBlock title="By Origin" rows={agg.byOrigin} />
        <Footer year={period.year} />
      </Page>

      {/* 8 — Assessed by lab (only when >1 lab) */}
      {agg.byLab.length > 1 ? (
        <Page size="A4" style={s.page}>
          <View style={s.sectionWash}><Text style={s.sectionTitle}>Assessed by Lab</Text></View>
          <BreakdownBlock title="By Laboratory" rows={agg.byLab} />
          <Footer year={period.year} />
        </Page>
      ) : null}

      {/* 9 — The year in motion (monthly) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>The Year in Motion</Text></View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cellName]}>Month</Text>
            <Text style={[s.th, s.cellNum]}>Evaluated</Text>
            <Text style={[s.th, s.cellNum]}>Approved</Text>
            <Text style={[s.th, s.cellNum]}>%APP</Text>
            <Text style={[s.th, s.cellNum]}>Bags</Text>
          </View>
          {agg.monthly.map(m => (
            <View style={s.tr} key={m.month}>
              <Text style={s.cellName}>{m.label}</Text>
              <Text style={s.cellNum}>{m.evaluated}</Text>
              <Text style={s.cellNum}>{m.approved}</Text>
              <Text style={s.cellNum}>{m.approvalRate}%</Text>
              <Text style={s.cellNum}>{m.bagsApproved.toLocaleString('en-US')}</Text>
            </View>
          ))}
        </View>
        <Footer year={period.year} />
      </Page>

      {/* 10 — Year flow Sankey (LANDSCAPE) */}
      {agg.showSankey ? (
        <Page size="A4" orientation="landscape" style={s.page}>
          <View style={s.sectionWash}><Text style={s.sectionTitle}>Year Flow · {agg.sankeyColumns.join(' → ')}</Text></View>
          <SankeyChart layout={agg.sankey} />
          <Footer year={period.year} />
        </Page>
      ) : null}

      {/* 11 — Methodology */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Methodology</Text></View>
        <Text style={{ fontSize: 10, color: MUTED, lineHeight: 1.6 }}>
          This report covers all samples assessed for {client.name} between 1 January and 31 December {period.year}, across all
          Wolthers laboratories{agg.labsCovered.length ? ` (${agg.labsCovered.join(', ')})` : ''} and all origins
          {agg.originsCovered.length ? ` (${agg.originsCovered.join(', ')})` : ''}. Pre-shipment (PSS) figures are counted by
          sample; shipment (SS) figures are counted by 60-kg-equivalent bags. Approval and rejection rates are computed as a
          share of evaluated samples in each group.
        </Text>
        <Footer year={period.year} />
      </Page>
    </Document>
  )
}

// Compact ranked block: name + volume + approval-rate trailing label.
function BreakdownBlock({ title, rows }: { title: string; rows: GroupPerf[] }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.th}>{title}</Text>
      {rows.map(g => {
        const total = g.approvedCount + g.rejectedCount
        const rate = total > 0 ? Math.round((g.approvedCount / total) * 100) : 0
        return (
          <View style={s.tr} key={g.name}>
            <Text style={s.cellName}>{g.name}</Text>
            <Text style={s.cellNum}>{g.approvedBags > 0 ? `${g.approvedBags.toLocaleString('en-US')} bags` : `${total}`}</Text>
            <Text style={[s.cellNum, { color: rate >= 90 ? OLIVE : rate >= 70 ? INK : RED }]}>{rate}%</Text>
          </View>
        )
      })}
    </View>
  )
}
```
**Important:** check `HorizontalBarChart` and `SankeyChart` prop names before relying on them. `SankeyChart` (`src/components/pdf/charts/sankey-chart.tsx`) takes a layout prop — confirm whether it is `layout`, `data`, or positional, and match it. If `SankeyChart` needs `columns` too, pass `columns={agg.sankeyColumns}`. The `HorizontalBarChart` import is included for the optional bar charts beside the PSS/SS tables — wire it in only after confirming its props (or omit the bars for v1 and keep the tables, which are the spec's required content).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any prop-name mismatches against the real `SankeyChart`/`HorizontalBarChart` signatures.

- [ ] **Step 3: Commit**

```bash
git add src/components/pdf/reports/annual-performance-report.tsx
git commit -m "feat(reports): Annual PDF document — Scandinavian layout, 11 pages, landscape Sankey"
```

---

## Task 5: Annual generator + API routes

Clone the Bi-Weekly generator and the GET/send routes, swapping in the Annual data fetch, the year param, and `report_type = 'annual'`.

**Files:**
- Create: `src/lib/reports/annual-generator.ts`
- Create: `src/app/api/reports/annual/route.ts`
- Create: `src/app/api/reports/annual/send/route.ts`

**Interfaces:**
- Consumes: `AnnualPerformanceReport` (Task 4), `getAnnualPerformanceReportData` (Task 3).
- Produces: `generateAnnualReport(supabase, { clientId: string; year: number }): Promise<{ pdfBuffer: Buffer; filename: string; data: AnnualPerformanceReportData } | null>`; `GET /api/reports/annual?client_id&year`; `POST /api/reports/annual/send`.

- [ ] **Step 1: Create the generator** (clone `biweekly-generator.ts`, swap data source + filename)

Create `src/lib/reports/annual-generator.ts`:
```typescript
/** Annual report generator — mirrors biweekly-generator (asset loading, renderToBuffer). */
import React from 'react'
import fs from 'fs'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AnnualPerformanceReport } from '@/components/pdf/reports/annual-performance-report'
import { getAnnualPerformanceReportData, type AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'

export interface GeneratedAnnualReport {
  pdfBuffer: Buffer
  filename: string
  data: AnnualPerformanceReportData
}

export async function generateAnnualReport(
  supabase: SupabaseClient,
  params: { clientId: string; year: number },
): Promise<GeneratedAnnualReport | null> {
  const data = await getAnnualPerformanceReportData(supabase, params)
  if (!data) return null

  let wolthersLogoBase64: string | undefined
  try {
    const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
    wolthersLogoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  } catch (err) { console.error('[annual] Failed to load Wolthers logo:', err) }

  let flagBase64: string | undefined
  const countryCode = data.origin ? getCountryCodeFromOrigin(data.origin) : null
  if (countryCode) {
    try {
      const flagPath = path.join(process.cwd(), 'public', getFlagPath(countryCode))
      flagBase64 = `data:image/png;base64,${fs.readFileSync(flagPath).toString('base64')}`
    } catch (err) { console.error('[annual] Failed to load flag:', err) }
  }

  let clientLogoBase64: string | undefined
  if (data.client.logo_url) {
    try {
      const res = await fetch(data.client.logo_url)
      if (res.ok) {
        const arr = await res.arrayBuffer()
        const ct = res.headers.get('content-type') || 'image/png'
        clientLogoBase64 = `data:${ct};base64,${Buffer.from(arr).toString('base64')}`
      }
    } catch (err) { console.error('[annual] Failed to load client logo:', err) }
  }

  const element = React.createElement(AnnualPerformanceReport, { data, wolthersLogoBase64, clientLogoBase64, flagBase64 })
  const pdfBuffer = await renderToBuffer(element as any)

  const sanitize = (s: string) => s.replace(/[^\w-]/g, '_').replace(/_+/g, '_')
  const filename = `${sanitize(data.client.name)}_Annual_${params.year}.pdf`

  return { pdfBuffer: Buffer.from(pdfBuffer), filename, data }
}
```

- [ ] **Step 2: Create the GET route** (clone `biweekly/route.ts`, swap year for date range)

Create `src/app/api/reports/annual/route.ts`:
```typescript
/** GET /api/reports/annual?client_id=...&year=... — streams the Annual PDF. Auth-gated. */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generateAnnualReport } from '@/lib/reports/annual-generator'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const clientId = sp.get('client_id')
    const yearStr = sp.get('year')
    if (!clientId || !yearStr) {
      return NextResponse.json({ error: 'client_id and year are required' }, { status: 400 })
    }
    const year = Number(yearStr)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    }

    const report = await generateAnnualReport(supabase, { clientId, year })
    if (!report) return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })

    return new NextResponse(new Uint8Array(report.pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${report.filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/reports/annual:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to generate report: ${message}` }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create the send route** (clone `biweekly/send/route.ts`; year param, `REPORT_TYPE='annual'`)

Create `src/app/api/reports/annual/send/route.ts` — copy `src/app/api/reports/biweekly/send/route.ts` verbatim, then apply exactly these changes:
  1. `import { generateBiweeklyReport }` → `import { generateAnnualReport } from '@/lib/reports/annual-generator'`.
  2. `const REPORT_TYPE = 'biweekly'` → `const REPORT_TYPE = 'annual'`.
  3. Replace the `start_date`/`end_date` parsing block with a `year` parse:
```typescript
const { client_id, year: yearIn, subject: subjectIn, body: bodyIn } = body
if (!client_id || yearIn === undefined) {
  return NextResponse.json({ error: 'client_id and year are required' }, { status: 400 })
}
const year = Number(yearIn)
if (!Number.isInteger(year) || year < 2000 || year > 2100) {
  return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
}
```
  4. The `generateBiweeklyReport(supabase, { clientId, startDate, endDate })` call → `generateAnnualReport(supabase, { clientId: client_id, year })`.
  5. The period label + default subject/body:
```typescript
const periodLabel = String(year)
const subject = (typeof subjectIn === 'string' && subjectIn.trim().length > 0)
  ? subjectIn.trim()
  : `${report.data.client.name} · Annual Performance Review · ${periodLabel}`
const bodyText = (typeof bodyIn === 'string' && bodyIn.trim().length > 0)
  ? bodyIn
  : `Hello,\n\nPlease find attached the Annual Quality Performance Review for ${report.data.client.name} covering ${periodLabel}.\n\nBest regards,\n${senderName ?? 'Quality Control'}\nWolthers & Associates`
```
  6. `saveRecipients` call: keep as-is but it now passes `reportType: REPORT_TYPE` (= `'annual'`). The auto-CC mailbox logic, email validation, Graph send, and signature handling are unchanged — keep them verbatim.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/annual-generator.ts src/app/api/reports/annual/route.ts src/app/api/reports/annual/send/route.ts
git commit -m "feat(reports): Annual generator + GET/send API routes (report_type=annual)"
```

---

## Task 6: UI — preview kind + dashboard card with year picker

**Files:**
- Modify: `src/components/reports/preview-report-modal.tsx` (add `ANNUAL_KIND`, widen union)
- Modify: `src/app/dashboard/reports/page.tsx` (3rd card + year picker)

**Interfaces:**
- Consumes: `ANNUAL_KIND` (new) in the reports page.
- Produces: `export const ANNUAL_KIND: ReportKind` and a widened `ReportKind.reportType` union.

- [ ] **Step 1: Widen `ReportKind` and add `ANNUAL_KIND`**

In `src/components/reports/preview-report-modal.tsx`:
  - Change the union at line ~27 from `reportType: 'weekly_ss' | 'biweekly'` to `reportType: 'weekly_ss' | 'biweekly' | 'annual'`.
  - After `BIWEEKLY_KIND` (line ~40), add:
```typescript
export const ANNUAL_KIND: ReportKind = {
  reportType: 'annual',
  previewEndpoint: '/api/reports/annual',
  sendEndpoint: '/api/reports/annual/send',
  // ...match the other kinds' remaining fields (title/description/etc.) exactly as they appear on BIWEEKLY_KIND
}
```
**Read `BIWEEKLY_KIND`'s full field set first** and replicate every field (the snippet above shows only the three that change). The modal builds its preview/send query from `previewEndpoint`/`sendEndpoint`; the Annual passes `client_id` + `year` instead of `start_date`/`end_date` — see Step 2 for how the page supplies the year. If the modal currently hardcodes `start_date`/`end_date` query params, add a branch: when `kind.reportType === 'annual'`, send `?client_id=...&year=...` (and POST `{ client_id, year }`) instead of the date-range params.

- [ ] **Step 2: Add the Annual card + year picker to the reports page**

In `src/app/dashboard/reports/page.tsx`:
  - Import `ANNUAL_KIND` alongside the existing kinds.
  - Add year state: `const [annualYear, setAnnualYear] = useState<number>(new Date().getFullYear() - 1)` (default to the most recent complete year).
  - Change the grid wrapper from `lg:grid-cols-2` to `lg:grid-cols-3` so three cards fit.
  - Add a 3rd `<Card>` mirroring the Bi-Weekly card's structure, titled **"Annual Performance Review"**, description "Full-year supplier performance, all labs and origins." Replace its date-range presets with a year `<select>` (offer e.g. the last 5 years: `[0,1,2,3,4].map(d => new Date().getFullYear() - d)`).
  - Its generate button calls a year-aware open. Since `openPreview(kind, start, end)` is date-based, add an `openAnnual(year: number)` that sets `activeKind = ANNUAL_KIND` and stashes the year, OR generalize `openPreview` to accept the year. Then in the `PreviewReportModal` render, pass the year through (the modal change in Step 1 reads it). Concretely:
```tsx
{/* Annual Performance Review */}
<Card className="rounded-[20px]">
  <CardHeader>
    <CardTitle className="text-sm">Annual Performance Review</CardTitle>
    <CardDescription className="text-xs">Full-year supplier performance · all labs &amp; origins</CardDescription>
  </CardHeader>
  <CardContent className="space-y-5">
    <div className="flex items-center gap-3">
      <label className="text-xs text-muted-foreground">Year</label>
      <select
        className="border rounded-md px-2 py-1 text-sm"
        value={annualYear}
        onChange={(e) => setAnnualYear(Number(e.target.value))}
      >
        {[0, 1, 2, 3, 4].map((d) => {
          const y = new Date().getFullYear() - d
          return <option key={y} value={y}>{y}</option>
        })}
      </select>
    </div>
    <Button
      disabled={!selectedClientId}
      onClick={() => { setActiveKind(ANNUAL_KIND); setActiveAnnualYear(annualYear); setPreviewOpen(true) }}
    >
      Generate
    </Button>
  </CardContent>
</Card>
```
  Wire `activeAnnualYear` into the `<PreviewReportModal>` props (add an optional `year?: number` prop to the modal and pass `activeKind.reportType === 'annual' ? activeAnnualYear : undefined`). Match the existing client-picker gating (`selectedClientId`) the other two cards use — read the file to see the exact state variable names and reuse them rather than inventing new ones.

- [ ] **Step 3: Typecheck + build the page**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx vitest run`
Expected: full suite green (no UI unit tests are required for this task, but nothing should regress).

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/preview-report-modal.tsx src/app/dashboard/reports/page.tsx
git commit -m "feat(reports): Annual report card + year picker + ANNUAL_KIND preview"
```

---

## Task 7: End-to-end smoke + spreadsheet cross-check

Verify the whole pipeline renders and the numbers match the reference spreadsheet. This is a manual/scripted verification task, not a committed test.

**Files:**
- (none committed) — a throwaway smoke script under `/tmp`.

- [ ] **Step 1: Render synthetic data to a PDF**

Write a throwaway script (e.g. `/tmp/annual-smoke.mjs` or a one-off vitest) that imports `AnnualPerformanceReport`, feeds it a synthetic `AnnualPerformanceReportData` (≥2 exporters, ≥2 origins, ≥2 labs, a multi-month spread, and a Sankey with ≥3 columns so `showSankey` is true), and writes `renderToBuffer` output to `/tmp/annual-smoke.pdf`. Reuse the row/agg factories from `annual-data.test.ts`.

- [ ] **Step 2: Rasterize and eyeball the layout**

Run: `pdftoppm -png /tmp/annual-smoke.pdf /tmp/annual-smoke && ls /tmp/annual-smoke*.png`
Expected: one PNG per page. Confirm: cover reads cleanly; hero numbers are large; PSS/SS tables show a `TOTAL GERAL` row; the rejection page has PSS/SS columns; the Sankey page is **landscape** (wider than tall) while the others are portrait; the lab page appears (synthetic data has >1 lab). Text glyphs may not rasterize offline — verify **layout**, not copy.

- [ ] **Step 3: Cross-check the math against the spreadsheet**

Using the real values from `docs/report_examples/Performance Year 2025.xlsx` (e.g. PSS `TOTAL GERAL` = 133 app / 71 rej / 204 / 65% / 35%; SS bags `TOTAL GERAL` = 124,702 / 5,600 / 130,302 / 96% / 4%), construct a synthetic dataset that reproduces a couple of exporter rows and assert (in a scratch test) that `PerfTable`/`buildAnnualAggregates` produce the same APP/REJ/TOTAL/%APP/%REJ and grand totals. This confirms the basis (PSS=count, SS=bags) and the rounding match the reference.

- [ ] **Step 4: Live sanity (optional, requires a dev server + real auth)**

With the app running, hit `GET /api/reports/annual?client_id=<a real QC client>&year=2025` while authenticated and confirm a PDF streams. Then exercise the dashboard card → preview → send path for one recipient (the house CC is auto-added server-side).

- [ ] **Step 5: Final full-suite gate**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

---

## Self-Review

**Spec coverage:**
- Output = designed PDF on `@react-pdf` → Tasks 4–5. ✓
- Per-client, cross-lab, cross-origin (no lab/origin filter) → Task 3 query. ✓
- Hero numbers first, then monthly → Task 2 (`computeHero`, `buildMonthlySeries`), Task 4 pages 2 + 9. ✓
- Breakdowns importer/seller/exporter/region + per-lab → Task 2 (`buildAnnualAggregates`), Task 4 pages 6–8. ✓
- Top rejection reasons (PSS/SS split) → reused `aggregateBucket().rejectionReasons`, Task 4 page 5. ✓
- Whole-year landscape Sankey → Task 2 (`buildSankey` reuse), Task 4 page 10 (`orientation="landscape"`, `showSankey` gate). ✓
- Scandinavian visual system → Task 4 stylesheet. ✓
- No migration; `annual` recipients reuse → Task 5 send route `REPORT_TYPE='annual'` + existing `saveRecipients`. ✓
- UI 3rd card + year picker + `ANNUAL_KIND` preview → Task 6. ✓
- YoY out of scope → not implemented anywhere. ✓
- Cross-check vs spreadsheet + landscape/portrait verification → Task 7. ✓

**Placeholder scan:** No "TBD/TODO/implement later". The two spots that say "read the file first" (Task 4 `SankeyChart` props; Task 6 `ReportKind` field set + page state names) are deliberate: they point at concrete existing code whose exact shape must be matched, and give the fallback (omit bars / add a branch) — not deferred work.

**Type consistency:** `AnnualPerformanceReportData` (Task 2/3) → consumed by Task 4 (`data.agg.hero`, `data.agg.pss.byExporter`, etc.) and Task 5 (`report.data.client.name`). `generateAnnualReport` return `{ pdfBuffer, filename, data }` matches the route usage. `GroupPerf` fields (`approvedCount`/`rejectedCount`/`approvedBags`/`rejectedBags`/`name`) used consistently in `PerfTable`/`BreakdownBlock`. `buildSankey` called with the exact `(approvedRows, scorecard, type, clientName)` signature confirmed in `report-data.ts:432`.
