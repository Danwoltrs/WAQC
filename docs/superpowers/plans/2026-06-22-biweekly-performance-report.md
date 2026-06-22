# Bi-Weekly Performance Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second client-facing PDF report — the Bi-Weekly Performance Report — splitting a ~15-day window into PSS and SS sections (approved + rejected), with per-importer/exporter/region breakdowns, rejection reasons, a conditional supply-chain Sankey, and the Weekly's approved-SS certificate appendix.

**Architecture:** Reuse the proven Weekly pipeline (`certificates ⋈ samples` query → `@react-pdf/renderer` template → generator → API routes → preview/send modals). The novel logic — bi-weekly bucket aggregation and a vertical grouped bar chart — is built as **pure, unit-tested functions**; the async fetcher, PDF template, generator, and routes are thin glue gated by typecheck + render-smoke tests. The recipients/preview/send plumbing is parameterized to serve both report types.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@react-pdf/renderer`, Supabase (server client), Vitest, Tailwind/shadcn (reports page UI).

## Global Constraints

- Keep files under ~2000 lines (split if a file approaches it). — from CLAUDE.md
- No mock data in the product; no emojis in the UI. — from CLAUDE.md
- Chart colors: approved/valid `#556b2f`, rejected/invalid `#ef4444`; Wolthers green `#556b2f`; font `Inter`. — from CLAUDE.md design guidelines
- `equivalent_60kg_bags` / bag counts display as integers (no decimals). — from project memory
- Report-type key for this report is exactly `biweekly` (already in `VALID_REPORT_TYPES`). — from spec
- Run from repo root `/Users/danielwolthers/Documents/GitHub/WAQC`. Test runner: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`.
- Trunk-based: work on `main`; do NOT push (commits are local until the user asks to push). — from project memory

---

## File Structure

**New**
- `src/lib/reports/biweekly-data.ts` — bi-weekly types, pure aggregation functions, and the async `getBiweeklyPerformanceReportData` fetcher.
- `src/lib/reports/biweekly-data.test.ts` — unit tests for the pure aggregators.
- `src/lib/reports/periods.ts` — pure half-month period helpers.
- `src/lib/reports/periods.test.ts` — unit tests for the period helpers.
- `src/components/pdf/charts/vertical-grouped-bar-chart.tsx` — new PDF chart + `niceAxisMax` helper.
- `src/components/pdf/charts/vertical-grouped-bar-chart.test.ts` — unit test for `niceAxisMax`.
- `src/components/pdf/reports/ss-cert-appendix-table.tsx` — appendix table extracted from the Weekly template.
- `src/components/pdf/reports/biweekly-performance-report.tsx` — the bi-weekly PDF document.
- `src/lib/reports/biweekly-generator.ts` — PDF generation glue (mirror of `weekly-ss-generator.ts`).
- `src/app/api/reports/biweekly/route.ts` — GET (preview/download).
- `src/app/api/reports/biweekly/send/route.ts` — POST (email).

**Modified**
- `src/lib/report-data.ts` — export `categorizeViolation` and `buildSankey`; extract + export `mapCertRowToReportRow`; Weekly fetcher uses the extracted mapper.
- `src/components/pdf/reports/weekly-ss-certs-report.tsx` — render the extracted appendix table instead of inline markup.
- `src/components/reports/preview-report-modal.tsx` — accept a `ReportKind` config.
- `src/components/reports/send-report-modal.tsx` — accept a `ReportKind` config.
- `src/app/dashboard/reports/page.tsx` — two-card grid; bi-weekly form with half-month presets; pass `ReportKind` to the modal.

---

## Task 1: Extract shared cert helpers in report-data.ts (refactor, no behavior change)

Make the row-mapper, violation categorizer, and Sankey builder reusable by the bi-weekly fetcher without duplicating logic or risking drift. Pure refactor — the Weekly report's output must not change.

**Files:**
- Modify: `src/lib/report-data.ts`
- Test: `src/lib/report-data.test.ts` (Create)

**Interfaces:**
- Produces (newly exported, consumed by Task 3):
  - `export interface RawCertSampleRow` — the joined row shape the query returns (fields used below).
  - `export function mapCertRowToReportRow(c: RawCertSampleRow, ctx: { sankeyType: ClientSankeyType; clientDisplay: string }): WeeklySSCertRow`
  - `export function categorizeViolation(v: string): string`
  - `export function buildSankey(approvedRows: WeeklySSCertRow[], scorecard: SupplierScorecardRow[], type: ClientSankeyType, clientName: string): { layout: SankeyLayoutResult; columns: string[] }`
  - Existing exported types reused: `WeeklySSCertRow`, `RejectionReasonRow`, `SupplierScorecardRow`, `ClientSankeyType`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/report-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapCertRowToReportRow, categorizeViolation, type RawCertSampleRow } from './report-data'

const raw = (over: Partial<RawCertSampleRow> = {}): RawCertSampleRow => ({
  certificate_number: 'BR-000001/26',
  created_at: '2026-01-05T00:00:00Z',
  is_rejected: false,
  compliance_violations: null,
  sample: {
    id: 's1',
    sample_type: 'ss',
    client_id: 'client-1',
    origin: 'Brazil',
    micro_origin: 'Cerrado',
    container_nr: 'ABCD1234567',
    ico_number: '001/2075',
    bag_count: 333,
    equivalent_60kg_bags: 333,
    bags_quantity_mt: null,
    buyer_contract_nr: 'IR0005918-1',
    exporter: { name: 'Cooxupe' },
    seller: { name: 'Cooxupe' },
    importer: { name: 'Coffee America' },
    roaster: { name: 'Unsold' },
  },
  ...over,
})

describe('mapCertRowToReportRow', () => {
  it('maps joined cert/sample fields to a report row', () => {
    const row = mapCertRowToReportRow(raw(), { sankeyType: 'final_buyer', clientDisplay: 'Dunkin' })
    expect(row.certificate_number).toBe('BR-000001/26')
    expect(row.exporter_name).toBe('Cooxupe')
    expect(row.importer_name).toBe('Coffee America')
    expect(row.importer_contract_nr).toBe('IR0005918-1')
    expect(row.bags).toBe(333)
    expect(row.is_rejected).toBe(false)
  })

  it('falls back importer to the client name for roaster-type clients with no importer', () => {
    const row = mapCertRowToReportRow(
      raw({ sample: { ...raw().sample, importer: null } }),
      { sankeyType: 'roaster', clientDisplay: 'Ahold' },
    )
    expect(row.importer_name).toBe('Ahold')
  })
})

describe('categorizeViolation', () => {
  it('renders a cup-attribute below-minimum as "<attr> below min"', () => {
    expect(categorizeViolation('Balance: 2.50 is below minimum (3)')).toBe('Balance below min')
  })
  it('buckets total defects', () => {
    expect(categorizeViolation('Total defects: 12 exceeds maximum (8)')).toBe('Total defects')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report-data.test.ts`
Expected: FAIL — `mapCertRowToReportRow` / `RawCertSampleRow` not exported.

- [ ] **Step 3: Refactor report-data.ts**

In `src/lib/report-data.ts`:

1. Add the exported raw-row type (place near the other interfaces):

```ts
/** Shape of a `certificates ⋈ samples` row from the report query. */
export interface RawCertSampleRow {
  certificate_number: string
  created_at: string
  is_rejected: boolean | null
  compliance_violations: string[] | null
  sample: {
    id: string
    sample_type: string | null
    client_id: string | null
    origin: string | null
    micro_origin: string | null
    container_nr: string | null
    ico_number: string | null
    bag_count: number | null
    equivalent_60kg_bags: number | null
    bags_quantity_mt: number | null
    buyer_contract_nr: string | null
    exporter: { name: string | null } | null
    seller: { name: string | null } | null
    importer: { name: string | null } | null
    roaster: { name: string | null } | null
  } | null
}
```

2. Extract the inline row mapping (currently `filtered.map(...)` at lines ~183-208) into an exported function:

```ts
export function mapCertRowToReportRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): WeeklySSCertRow {
  const s = c.sample!
  const bagsRaw = s.bag_count ?? s.equivalent_60kg_bags ?? null
  const bags = typeof bagsRaw === 'number' ? Math.round(bagsRaw) : null
  const importerName = s.importer?.name
    ?? (ctx.sankeyType === 'roaster' ? ctx.clientDisplay : null)
  return {
    approval_date: c.created_at,
    certificate_number: c.certificate_number,
    exporter_name: s.exporter?.name ?? null,
    seller_name: s.seller?.name ?? null,
    importer_name: importerName,
    importer_contract_nr: s.buyer_contract_nr ?? null,
    roaster_name: s.roaster?.name ?? 'Unsold',
    container_nr: s.container_nr ?? null,
    ico_marks: s.ico_number ?? null,
    bags,
    is_rejected: !!c.is_rejected,
  }
}
```

3. Replace the inline `.map` in `getWeeklySSCertReportData` with:

```ts
  const rows: WeeklySSCertRow[] = filtered.map((c: any) =>
    mapCertRowToReportRow(c as RawCertSampleRow, { sankeyType, clientDisplay }),
  )
```

4. Change `function categorizeViolation` → `export function categorizeViolation` and `function buildSankey` → `export function buildSankey` (signatures unchanged).

- [ ] **Step 4: Run the new test + the full suite**

Run: `npx vitest run src/lib/report-data.test.ts`
Expected: PASS (4 tests).

Run: `npx vitest run`
Expected: PASS — all previously-green tests still pass (no behavior change).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report-data.ts src/lib/report-data.test.ts
git commit -m "refactor(reports): extract shared cert-row mapper + export sankey/violation helpers"
```

---

## Task 2: Half-month period helpers

Pure date helpers for the bi-weekly period UI: first half (1–15), second half (16–end), and "most recently completed half-month".

**Files:**
- Create: `src/lib/reports/periods.ts`
- Test: `src/lib/reports/periods.test.ts`

**Interfaces:**
- Produces (consumed by Task 9):
  - `export function firstHalf(year: number, monthIndex0: number): { start: string; end: string }` — `monthIndex0` is 0-based; returns `YYYY-MM-DD` strings for day 1 and day 15.
  - `export function secondHalf(year: number, monthIndex0: number): { start: string; end: string }` — day 16 to last day of month.
  - `export function previousHalfMonth(today: Date): { start: string; end: string }` — the most recently *completed* half-month relative to `today`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/periods.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { firstHalf, secondHalf, previousHalfMonth } from './periods'

describe('firstHalf / secondHalf', () => {
  it('first half is the 1st through the 15th', () => {
    expect(firstHalf(2026, 0)).toEqual({ start: '2026-01-01', end: '2026-01-15' })
  })
  it('second half runs 16th to last day (31 in Jan)', () => {
    expect(secondHalf(2026, 0)).toEqual({ start: '2026-01-16', end: '2026-01-31' })
  })
  it('second half handles February length (28 in 2026)', () => {
    expect(secondHalf(2026, 1)).toEqual({ start: '2026-02-16', end: '2026-02-28' })
  })
})

describe('previousHalfMonth', () => {
  it('mid-month today (Jan 20) → previous completed half = Jan 1-15', () => {
    expect(previousHalfMonth(new Date('2026-01-20T12:00:00Z'))).toEqual({
      start: '2026-01-01', end: '2026-01-15',
    })
  })
  it('early-month today (Jan 10) → previous completed half = prior month 2nd half (Dec 16-31)', () => {
    expect(previousHalfMonth(new Date('2026-01-10T12:00:00Z'))).toEqual({
      start: '2025-12-16', end: '2025-12-31',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/periods.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement periods.ts**

```ts
/**
 * Half-month period helpers for the Bi-Weekly report.
 * All functions return YYYY-MM-DD strings (the format <input type="date"> uses).
 * "Half-month" = 1st–15th (first half) or 16th–end (second half).
 */

function iso(year: number, monthIndex0: number, day: number): string {
  const mm = String(monthIndex0 + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

export function firstHalf(year: number, monthIndex0: number): { start: string; end: string } {
  return { start: iso(year, monthIndex0, 1), end: iso(year, monthIndex0, 15) }
}

export function secondHalf(year: number, monthIndex0: number): { start: string; end: string } {
  return { start: iso(year, monthIndex0, 16), end: iso(year, monthIndex0, lastDayOfMonth(year, monthIndex0)) }
}

export function previousHalfMonth(today: Date): { start: string; end: string } {
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  if (d <= 15) {
    // First half is still in progress → previous completed half is the prior month's 2nd half.
    const prevMonth = m === 0 ? 11 : m - 1
    const prevYear = m === 0 ? y - 1 : y
    return secondHalf(prevYear, prevMonth)
  }
  // We're in the 2nd half → previous completed half is this month's 1st half.
  return firstHalf(y, m)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reports/periods.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/periods.ts src/lib/reports/periods.test.ts
git commit -m "feat(reports): add half-month period helpers for bi-weekly report"
```

---

## Task 3: Bi-weekly data module (pure aggregation + async fetcher)

The analytical heart. Pure functions aggregate joined rows into the bi-weekly shape (TDD'd); a thin async fetcher runs the Supabase query and calls them.

**Files:**
- Create: `src/lib/reports/biweekly-data.ts`
- Test: `src/lib/reports/biweekly-data.test.ts`

**Interfaces:**
- Consumes (from Task 1): `mapCertRowToReportRow`, `categorizeViolation`, `buildSankey`, `RawCertSampleRow`, `WeeklySSCertRow`, `RejectionReasonRow`, `SupplierScorecardRow`, `ClientSankeyType` (all from `@/lib/report-data`).
- Produces (consumed by Tasks 6 + 7):
  - Types: `BucketTotals`, `GroupPerf`, `RegionRow`, `BucketAggregate`, `BiweeklyPerformanceReportData`.
  - `export function aggregateBucket(rows: WeeklySSCertRow[], metric: 'count' | 'bags'): BucketAggregate`
  - `export async function getBiweeklyPerformanceReportData(supabase, params: { clientId; startDate; endDate }): Promise<BiweeklyPerformanceReportData | null>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/biweekly-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { aggregateBucket } from './biweekly-data'
import type { WeeklySSCertRow } from '@/lib/report-data'

const row = (over: Partial<WeeklySSCertRow> = {}): WeeklySSCertRow => ({
  approval_date: '2026-01-05T00:00:00Z',
  certificate_number: 'BR-000001/26',
  exporter_name: 'Cooxupe',
  seller_name: 'Cooxupe',
  importer_name: 'Coffee America',
  importer_contract_nr: 'IR1',
  roaster_name: 'Unsold',
  container_nr: 'C1',
  ico_marks: '001',
  bags: 333,
  is_rejected: false,
  // micro_origin is carried on the row for region grouping (added in fetcher)
  region: 'Cerrado',
} as any)

describe('aggregateBucket — counts (PSS)', () => {
  const rows = [
    row({ exporter_name: 'Ofi', importer_name: 'Ofi', is_rejected: false }),
    row({ exporter_name: 'Ofi', importer_name: 'Ofi', is_rejected: false }),
    row({ exporter_name: 'Cocatrel', importer_name: 'American Coffee', is_rejected: true }),
  ]

  it('totals approved/rejected and rejection rate', () => {
    const agg = aggregateBucket(rows, 'count')
    expect(agg.totals.evaluated).toBe(3)
    expect(agg.totals.approved).toBe(2)
    expect(agg.totals.rejected).toBe(1)
    expect(agg.totals.rejectionRate).toBe(33) // round(1/3*100)
  })

  it('per-exporter approved/rejected with rate', () => {
    const agg = aggregateBucket(rows, 'count')
    const ofi = agg.byExporter.find(e => e.name === 'Ofi')!
    const coc = agg.byExporter.find(e => e.name === 'Cocatrel')!
    expect(ofi.approvedCount).toBe(2)
    expect(ofi.rejectionRate).toBe(0)
    expect(coc.rejectedCount).toBe(1)
    expect(coc.rejectionRate).toBe(100)
  })

  it('approved-by-region uses counts and percentages', () => {
    const agg = aggregateBucket(rows, 'count')
    const cerrado = agg.approvedByRegion.find(r => r.region === 'Cerrado')!
    expect(cerrado.count).toBe(2)
    expect(cerrado.pct).toBe(100) // both approved rows are Cerrado
  })
})

describe('aggregateBucket — bags (SS)', () => {
  const rows = [
    row({ importer_name: 'Coffee America', bags: 3334, region: 'Cerrado/South Of Minas', is_rejected: false }),
    row({ importer_name: 'Coffee America', bags: 2667, region: 'Cerrado/Mogiana', is_rejected: false }),
  ]
  it('approved-by-region uses bags and bag-percentages', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.totals.bagsApproved).toBe(6001)
    const a = agg.approvedByRegion.find(r => r.region === 'Cerrado/South Of Minas')!
    expect(a.bags).toBe(3334)
    expect(a.pct).toBe(56) // round(3334/6001*100)
  })
})

describe('aggregateBucket — empty', () => {
  it('handles no rows without dividing by zero', () => {
    const agg = aggregateBucket([], 'count')
    expect(agg.totals.evaluated).toBe(0)
    expect(agg.totals.rejectionRate).toBe(0)
    expect(agg.byImporter).toEqual([])
    expect(agg.approvedByRegion).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/biweekly-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement biweekly-data.ts**

```ts
/**
 * Bi-Weekly Performance report data.
 *
 * Pulls every certificate (approved + rejected) created in the window for one
 * QC client — both PSS and SS — and aggregates each sample-type bucket into
 * per-importer / per-exporter / per-region performance plus rejection reasons.
 * Reuses the Weekly report's row mapper, violation categorizer, and Sankey
 * builder so the two reports cannot drift.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  mapCertRowToReportRow,
  categorizeViolation,
  buildSankey,
  type RawCertSampleRow,
  type WeeklySSCertRow,
  type RejectionReasonRow,
  type SupplierScorecardRow,
  type ClientSankeyType,
} from '@/lib/report-data'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'

/** A report row carrying its region (micro_origin) for grouping. */
export type BiweeklyRow = WeeklySSCertRow & { region: string | null }

export interface BucketTotals {
  evaluated: number
  approved: number
  rejected: number
  rejectionRate: number // 0-100, rounded
  bagsApproved: number
}

export interface GroupPerf {
  name: string
  approvedCount: number
  rejectedCount: number
  approvedBags: number
  rejectedBags: number
  rejectionRate: number // by count, 0-100
}

export interface RegionRow {
  region: string
  count: number
  bags: number
  pct: number // 0-100 of the side total; basis = the bucket metric
}

export interface BucketAggregate {
  totals: BucketTotals
  byImporter: GroupPerf[]
  byExporter: GroupPerf[]
  rejectionReasons: RejectionReasonRow[]
  approvedByRegion: RegionRow[]
  rejectedByRegion: RegionRow[]
}

export interface BiweeklyPerformanceReportData {
  client: {
    id: string
    name: string
    logo_url: string | null
    is_roaster: boolean
    sankey_type: ClientSankeyType
  }
  period: { start_date: string; end_date: string; issued_at: string }
  origin: string | null
  pss: BucketAggregate
  ss: BucketAggregate
  ssApprovedRows: WeeklySSCertRow[]
  sankey: SankeyLayoutResult
  sankeyColumns: string[]
  showSankey: boolean
}

const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

function emptyGroup(name: string): GroupPerf {
  return { name, approvedCount: 0, rejectedCount: 0, approvedBags: 0, rejectedBags: 0, rejectionRate: 0 }
}

function groupBy(
  rows: BiweeklyRow[],
  keyOf: (r: BiweeklyRow) => string | null,
): GroupPerf[] {
  const map = new Map<string, GroupPerf>()
  for (const r of rows) {
    const name = keyOf(r)
    if (!name) continue
    const g = map.get(name) ?? emptyGroup(name)
    const bags = r.bags ?? 0
    if (r.is_rejected) {
      g.rejectedCount += 1
      g.rejectedBags += bags
    } else {
      g.approvedCount += 1
      g.approvedBags += bags
    }
    map.set(name, g)
  }
  for (const g of map.values()) {
    const total = g.approvedCount + g.rejectedCount
    g.rejectionRate = pct(g.rejectedCount, total)
  }
  return [...map.values()].sort((a, b) =>
    (b.approvedCount + b.rejectedCount) - (a.approvedCount + a.rejectedCount),
  )
}

function regionBreakdown(rows: BiweeklyRow[], metric: 'count' | 'bags'): RegionRow[] {
  const map = new Map<string, { count: number; bags: number }>()
  for (const r of rows) {
    const region = (r.region && r.region.trim()) || 'Unspecified'
    const cur = map.get(region) ?? { count: 0, bags: 0 }
    cur.count += 1
    cur.bags += r.bags ?? 0
    map.set(region, cur)
  }
  const totalCount = rows.length
  const totalBags = rows.reduce((s, r) => s + (r.bags ?? 0), 0)
  const whole = metric === 'bags' ? totalBags : totalCount
  return [...map.entries()]
    .map(([region, v]) => ({
      region,
      count: v.count,
      bags: v.bags,
      pct: pct(metric === 'bags' ? v.bags : v.count, whole),
    }))
    .sort((a, b) => (metric === 'bags' ? b.bags - a.bags : b.count - a.count))
}

export function aggregateBucket(rows: BiweeklyRow[], metric: 'count' | 'bags'): BucketAggregate {
  const approved = rows.filter(r => !r.is_rejected)
  const rejected = rows.filter(r => r.is_rejected)

  const totals: BucketTotals = {
    evaluated: rows.length,
    approved: approved.length,
    rejected: rejected.length,
    rejectionRate: pct(rejected.length, rows.length),
    bagsApproved: approved.reduce((s, r) => s + (r.bags ?? 0), 0),
  }

  const reasonCounts = new Map<string, number>()
  for (const r of rejected) {
    // compliance_violations is not on the row; reasons are attached by the fetcher
    // via the `_violations` carrier. Kept optional so pure tests can omit it.
    const violations = ((r as any)._violations as string[] | undefined) ?? []
    for (const v of violations) {
      const cat = categorizeViolation(v)
      reasonCounts.set(cat, (reasonCounts.get(cat) ?? 0) + 1)
    }
  }
  const rejectionReasons: RejectionReasonRow[] = [...reasonCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totals,
    byImporter: groupBy(rows, r => r.importer_name),
    byExporter: groupBy(rows, r => r.exporter_name),
    rejectionReasons,
    approvedByRegion: regionBreakdown(approved, metric),
    rejectedByRegion: regionBreakdown(rejected, metric),
  }
}

/** Map a raw cert row → a BiweeklyRow, carrying region + raw violations. */
function toBiweeklyRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): BiweeklyRow {
  const base = mapCertRowToReportRow(c, ctx)
  const enriched = base as BiweeklyRow & { _violations?: string[] }
  enriched.region = c.sample?.micro_origin ?? null
  enriched._violations = c.compliance_violations ?? []
  return enriched
}

function scorecardFromExporters(perf: GroupPerf[]): SupplierScorecardRow[] {
  return perf.map(g => {
    const total = g.approvedCount + g.rejectedCount
    return {
      exporter_name: g.name,
      total,
      approved: g.approvedCount,
      rejected: g.rejectedCount,
      approval_rate: total > 0 ? round((g.approvedCount / total) * 100) : 0,
      bags: g.approvedBags,
    }
  })
}

export async function getBiweeklyPerformanceReportData(
  supabase: SupabaseClient,
  params: { clientId: string; startDate: string; endDate: string },
): Promise<BiweeklyPerformanceReportData | null> {
  const { clientId, startDate, endDate } = params

  const { data: client, error: clientError } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, logo_url, company_types, trading_roles')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[biweekly-data] client not found:', clientId, clientError)
    return null
  }
  const companyTypes: string[] = client.company_types ?? []
  const tradingRoles: string[] = client.trading_roles ?? []
  const clientIsRoaster = companyTypes.some(t => typeof t === 'string' && t.toLowerCase() === 'roaster')
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'

  // NOTE: select MUST include sample.micro_origin (region) — the Weekly query omits it.
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id, sample_type, client_id, origin, micro_origin, container_nr, ico_number,
        bag_count, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,
        exporter:companies!samples_exporter_id_fkey(name),
        seller:companies!samples_seller_id_fkey(name),
        importer:companies!samples_importer_id_fkey(name),
        roaster:companies!samples_roaster_id_fkey(name)
      )
    `)
    .is('sample_contract_id', null)
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (certsError) {
    console.error('[biweekly-data] certificates query failed:', certsError)
    return null
  }

  const forClient = (certs || []).filter((c: any) => c.sample && c.sample.client_id === clientId)
  const pssRows = forClient
    .filter((c: any) => c.sample.sample_type === 'pss')
    .map((c: any) => toBiweeklyRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))
  const ssRows = forClient
    .filter((c: any) => c.sample.sample_type === 'ss')
    .map((c: any) => toBiweeklyRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))

  const pss = aggregateBucket(pssRows, 'count')
  const ss = aggregateBucket(ssRows, 'bags')

  // Dominant origin across both buckets (for the header flag).
  const originCounts = new Map<string, number>()
  for (const c of forClient as any[]) {
    const o = c.sample?.origin
    if (o) originCounts.set(o, (originCounts.get(o) ?? 0) + 1)
  }
  const origin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Sankey from approved SS rows; shown only when >2 companies (3+ columns).
  const ssApprovedRows = ssRows.filter(r => !r.is_rejected)
  const { layout: sankey, columns: sankeyColumns } = buildSankey(
    ssApprovedRows, scorecardFromExporters(ss.byExporter), sankeyType, clientDisplay,
  )

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { start_date: startDate, end_date: endDate, issued_at: new Date().toISOString() },
    origin,
    pss,
    ss,
    ssApprovedRows,
    sankey,
    sankeyColumns,
    showSankey: sankeyColumns.length > 2,
  }
}
```

Note for the implementer: the test's `row()` helper sets `region` directly and omits `_violations`; the rejection-reason loop tolerates a missing `_violations`. The fetcher attaches both. This keeps `aggregateBucket` purely unit-testable.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reports/biweekly-data.test.ts`
Expected: PASS (6 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/biweekly-data.ts src/lib/reports/biweekly-data.test.ts
git commit -m "feat(reports): bi-weekly data aggregation + fetcher (PSS/SS buckets)"
```

---

## Task 4: Vertical grouped bar chart (PDF)

The one new rendering primitive: vertical Approved/Rejected bars per category + the stats grid beneath. Includes a tested pure `niceAxisMax` helper.

**Files:**
- Create: `src/components/pdf/charts/vertical-grouped-bar-chart.tsx`
- Test: `src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`

**Interfaces:**
- Produces (consumed by Task 6):
  - `export function niceAxisMax(max: number): number`
  - `export interface GroupedBarCategory { label: string; approved: number; rejected: number; rejectionRate: number }`
  - `export function VerticalGroupedBarChart(props: { categories: GroupedBarCategory[]; metric: 'count' | 'bags'; width?: number; height?: number }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { niceAxisMax } from './vertical-grouped-bar-chart'

describe('niceAxisMax', () => {
  it('rounds a small count up to a clean tick', () => {
    expect(niceAxisMax(8)).toBe(9)   // small integers: max+1 headroom
    expect(niceAxisMax(2)).toBe(3)
  })
  it('rounds large bag counts up to a clean magnitude', () => {
    expect(niceAxisMax(6001)).toBe(7000)
  })
  it('returns a positive axis even for all-zero data', () => {
    expect(niceAxisMax(0)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
/**
 * Vertical grouped bar chart for PDF reports (@react-pdf/renderer).
 * One group per category with Approved (green) + Rejected (red) bars, and a
 * stats grid beneath (Rejection rate / Rejected / Approved). Used by the
 * Bi-Weekly report for Importer/Exporter performance, in counts (PSS) or
 * bags (SS).
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'

const GREEN = '#556b2f'
const RED = '#ef4444'
const BORDER = '#e3e3e3'

export interface GroupedBarCategory {
  label: string
  approved: number
  rejected: number
  rejectionRate: number // 0-100
}

/** Round an axis maximum up to a clean tick value. */
export function niceAxisMax(max: number): number {
  if (max <= 0) return 1
  if (max <= 10) return max + 1
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil(max / pow) * pow
}

const fmt = (n: number, metric: 'count' | 'bags') =>
  metric === 'bags' ? n.toLocaleString('en-US') : String(n)

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  plot: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: BORDER },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: '100%' },
  bar: { width: 16 },
  grid: { borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  gridLabel: { width: 80, fontSize: 7, color: '#555', padding: 3, borderRightWidth: 1, borderRightColor: BORDER },
  gridCell: { flex: 1, fontSize: 7.5, color: '#222', padding: 3, textAlign: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  catLabel: { flex: 1, fontSize: 7.5, fontWeight: 700, color: '#333', padding: 3, textAlign: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  legend: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  swatch: { width: 8, height: 8 },
  legendText: { fontSize: 7, color: '#555' },
})

export function VerticalGroupedBarChart({
  categories,
  metric,
  width = 520,
  height = 120,
}: {
  categories: GroupedBarCategory[]
  metric: 'count' | 'bags'
  width?: number
  height?: number
}) {
  const max = niceAxisMax(Math.max(0, ...categories.flatMap(c => [c.approved, c.rejected])))
  const h = (v: number) => (max > 0 ? (v / max) * height : 0)
  const dash = (v: number) => (v > 0 ? v : '-')

  return (
    <View style={[styles.wrap, { width }]}>
      <View style={[styles.plot, { height }]}>
        {categories.map(c => (
          <View key={c.label} style={styles.col}>
            <View style={styles.bars}>
              <View style={[styles.bar, { height: h(c.approved), backgroundColor: GREEN }]} />
              <View style={[styles.bar, { height: h(c.rejected), backgroundColor: RED }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}></Text>
          {categories.map(c => <Text key={c.label} style={styles.catLabel}>{c.label}</Text>)}
        </View>
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}>Rejection rate</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{c.rejectionRate > 0 ? `${c.rejectionRate}%` : '-'}</Text>)}
        </View>
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}>Rejected</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{dash(c.rejected) === '-' ? '-' : fmt(c.rejected, metric)}</Text>)}
        </View>
        <View style={[styles.gridRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.gridLabel}>Approved</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{dash(c.approved) === '-' ? '-' : fmt(c.approved, metric)}</Text>)}
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: GREEN }]} /><Text style={styles.legendText}>Approved</Text></View>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: RED }]} /><Text style={styles.legendText}>Rejected</Text></View>
      </View>
    </View>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`
Expected: PASS (3 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/pdf/charts/vertical-grouped-bar-chart.tsx src/components/pdf/charts/vertical-grouped-bar-chart.test.ts
git commit -m "feat(reports): vertical grouped bar chart for PDF (counts + bags)"
```

---

## Task 5: Extract the SS certificate appendix table (refactor, no behavior change)

Lift the Weekly's per-certificate appendix table into a shared component so the Bi-Weekly's page 3 reuses it verbatim. The Weekly PDF must render identically afterward.

**Files:**
- Create: `src/components/pdf/reports/ss-cert-appendix-table.tsx`
- Modify: `src/components/pdf/reports/weekly-ss-certs-report.tsx`
- Test: `src/components/pdf/reports/ss-cert-appendix-table.test.ts` (render smoke)

**Interfaces:**
- Produces (consumed by Task 6 + the Weekly report):
  - `export function SSCertAppendixTable(props: { rows: WeeklySSCertRow[]; totals: { certificate_count: number; bag_count: number }; hideRoasterCol: boolean }): JSX.Element`

- [ ] **Step 1: Create the component by moving existing markup**

Create `src/components/pdf/reports/ss-cert-appendix-table.tsx`. Move the appendix `<View style={styles.table}>…</View>` block (currently `weekly-ss-certs-report.tsx` lines ~524-590) plus the column-width constants (`COLS_WITH_ROASTER`, `COLS_NO_ROASTER`, lines ~201-221) and the table-related styles (`table`, `tableHeaderRow`, `tableHeaderCell`, `tableRow`, `tableCell`, `totalRow`, `totalCell`, `ZEBRA`, `GREEN`, `GREEN_DARK`, `GRAY_BORDER`) into it. Wrap as:

```tsx
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { WeeklySSCertRow } from '@/lib/report-data'

const GREEN = '#556b2f'
const GREEN_DARK = '#2f6b21'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

// ...COLS_WITH_ROASTER / COLS_NO_ROASTER and styles moved here verbatim...

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

export function SSCertAppendixTable({
  rows, totals, hideRoasterCol,
}: {
  rows: WeeklySSCertRow[]
  totals: { certificate_count: number; bag_count: number }
  hideRoasterCol: boolean
}) {
  const COLS = hideRoasterCol ? COLS_NO_ROASTER : COLS_WITH_ROASTER
  return (
    // ...the moved <View style={styles.table}> … </View> block, using `rows`,
    //    `totals`, `hideRoasterCol`, `COLS`, `formatDate` …
  )
}
```

- [ ] **Step 2: Rewire the Weekly report to use it**

In `weekly-ss-certs-report.tsx`, replace the inline appendix block on page 3 with:

```tsx
import { SSCertAppendixTable } from './ss-cert-appendix-table'
// ...
        <SSCertAppendixTable
          rows={data.rows}
          totals={{ certificate_count: data.totals.certificate_count, bag_count: data.totals.bag_count }}
          hideRoasterCol={data.client.is_roaster}
        />
```

Remove the now-unused `COLS_*` constants, `formatDate`, `hideRoasterCol`/`COLS` locals, and table-only styles from the Weekly file (leave styles still used by pages 1–2).

- [ ] **Step 3: Write a render-smoke test**

Create `src/components/pdf/reports/ss-cert-appendix-table.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { SSCertAppendixTable } from './ss-cert-appendix-table'
import type { WeeklySSCertRow } from '@/lib/report-data'

const row: WeeklySSCertRow = {
  approval_date: '2026-02-26T00:00:00Z', certificate_number: '36.686/26',
  exporter_name: 'Cooxupe', seller_name: 'Cooxupe', importer_name: 'Coffee America',
  importer_contract_nr: 'P07113.000', roaster_name: 'Unsold', container_nr: 'TCKU 186.924-2',
  ico_marks: '002/4600/1551', bags: 333, is_rejected: false,
}

describe('SSCertAppendixTable', () => {
  it('renders a non-empty PDF', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(SSCertAppendixTable, { rows: [row], totals: { certificate_count: 1, bag_count: 333 }, hideRoasterCol: false }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 4: Run tests + full suite**

Run: `npx vitest run src/components/pdf/reports/ss-cert-appendix-table.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: all green.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check — Weekly report unchanged**

Run: `npm run dev`, open `/dashboard/reports`, generate the Weekly SS report for a known client, and confirm the certificate appendix (page 3) looks exactly as before.
Expected: identical layout/columns/totals.

- [ ] **Step 6: Commit**

```bash
git add src/components/pdf/reports/ss-cert-appendix-table.tsx src/components/pdf/reports/ss-cert-appendix-table.test.ts src/components/pdf/reports/weekly-ss-certs-report.tsx
git commit -m "refactor(reports): extract shared SS certificate appendix table"
```

---

## Task 6: Bi-Weekly PDF template

Assemble the 3-page document: PSS page, SS page (with conditional Sankey), and the shared SS appendix.

**Files:**
- Create: `src/components/pdf/reports/biweekly-performance-report.tsx`
- Test: `src/components/pdf/reports/biweekly-performance-report.test.ts` (render smoke)

**Interfaces:**
- Consumes: `BiweeklyPerformanceReportData` (Task 3), `VerticalGroupedBarChart` + `GroupedBarCategory` (Task 4), `SSCertAppendixTable` (Task 5), `KpiCard`, `HorizontalBarChart`, `SankeyChart` (existing).
- Produces (consumed by Task 7):
  - `export function BiweeklyPerformanceReport(props: { data: BiweeklyPerformanceReportData; wolthersLogoBase64?: string; clientLogoBase64?: string; flagBase64?: string }): JSX.Element`

- [ ] **Step 1: Implement the template**

Create `src/components/pdf/reports/biweekly-performance-report.tsx`. Reuse the Weekly template's visual system: copy the **shared style block** and the `Header`/`Footer`/date-formatter helpers from `weekly-ss-certs-report.tsx` (lines ~35-196 styles, ~236-300 helpers), then add the region-table styles below. Map data → components per panel.

Full component skeleton (every panel wired; fill the copied styles/helpers as noted):

```tsx
/**
 * Bi-Weekly Performance Report — A4 landscape, 3 pages:
 *   1. Pre-Shipment Samples (PSS) — KPI strip, Importer + Exporter bars (counts),
 *      rejection reasons, approved/rejected by region (counts).
 *   2. Shipment Samples (SS) — KPI strip (+ bags), Importer + Exporter bars (bags),
 *      conditional supply-chain Sankey, rejection reasons, by region (bags).
 *   3. SS certificate appendix (approved) — shared with the Weekly report.
 */
import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { BiweeklyPerformanceReportData, BucketAggregate, RegionRow } from '@/lib/reports/biweekly-data'
import { KpiCard } from '@/components/pdf/charts/kpi-card'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { VerticalGroupedBarChart, type GroupedBarCategory } from '@/components/pdf/charts/vertical-grouped-bar-chart'
import { SSCertAppendixTable } from './ss-cert-appendix-table'

const GREEN = '#556b2f'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

// COPY the `styles` StyleSheet + sectionLabel/titleBar/kpiStrip/headerRow styles
// from weekly-ss-certs-report.tsx, then extend with the region-table styles:
const styles = StyleSheet.create({
  // ...copied base styles...
  panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 12, marginBottom: 12 },
  twoCol: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  regionPanel: { flex: 1, borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 10 },
  regionHead: { flexDirection: 'row', backgroundColor: '#F4F4F2', paddingVertical: 4, paddingHorizontal: 6 },
  regionRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  regionTotal: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#F4F4F2' },
  rCell: { fontSize: 8, color: '#222' },
  rHeadCell: { fontSize: 7.5, fontWeight: 700, color: '#555', textTransform: 'uppercase' },
})

const toCats = (groups: BucketAggregate['byImporter']): GroupedBarCategory[] =>
  groups.slice(0, 6).map(g => ({
    label: g.name,
    approved: 0, // filled per metric below via metricCats()
    rejected: 0,
    rejectionRate: g.rejectionRate,
  }))

// Map GroupPerf → chart categories for the chosen metric.
function metricCats(groups: BucketAggregate['byImporter'], metric: 'count' | 'bags'): GroupedBarCategory[] {
  return groups.slice(0, 6).map(g => ({
    label: g.name,
    approved: metric === 'bags' ? g.approvedBags : g.approvedCount,
    rejected: metric === 'bags' ? g.rejectedBags : g.rejectedCount,
    rejectionRate: g.rejectionRate,
  }))
}

interface RegionTableProps { title: string; rows: RegionRow[]; metric: 'count' | 'bags'; accent: string }
function RegionTable({ title, rows, metric, accent }: RegionTableProps) {
  const total = rows.reduce((s, r) => s + (metric === 'bags' ? r.bags : r.count), 0)
  return (
    <View style={styles.regionPanel}>
      <Text style={[styles.rHeadCell, { color: accent, marginBottom: 4 }]}>{title}</Text>
      <View style={styles.regionHead}>
        <Text style={[styles.rHeadCell, { flex: 1 }]}>Region</Text>
        {metric === 'bags' && <Text style={[styles.rHeadCell, { width: 50, textAlign: 'right' }]}>Bags</Text>}
        <Text style={[styles.rHeadCell, { width: 36, textAlign: 'right' }]}>%</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.regionRow}><Text style={[styles.rCell, { color: '#888' }]}>None</Text></View>
      ) : rows.map(r => (
        <View key={r.region} style={styles.regionRow}>
          <Text style={[styles.rCell, { flex: 1 }]}>{(metric === 'bags' ? r.count : r.count)} - {r.region}</Text>
          {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right' }]}>{r.bags.toLocaleString('en-US')}</Text>}
          <Text style={[styles.rCell, { width: 36, textAlign: 'right' }]}>{r.pct}%</Text>
        </View>
      ))}
      <View style={styles.regionTotal}>
        <Text style={[styles.rCell, { flex: 1, fontWeight: 700 }]}>Total</Text>
        {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right', fontWeight: 700 }]}>{total.toLocaleString('en-US')}</Text>}
        <Text style={[styles.rCell, { width: 36, textAlign: 'right', fontWeight: 700 }]}>100%</Text>
      </View>
    </View>
  )
}

interface Props {
  data: BiweeklyPerformanceReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

export function BiweeklyPerformanceReport({ data, wolthersLogoBase64, clientLogoBase64, flagBase64 }: Props) {
  // COPY formatShortDate / formatIssuedAt from the Weekly template.
  const formatShortDate = (iso: string) => { const d = new Date(iso); return `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')}` }
  const formatIssuedAt = (iso: string) => { const d = new Date(iso); return `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}` }
  const displayEnd = new Date(new Date(data.period.end_date).getTime() - 86400000)
  const range = `${formatShortDate(data.period.start_date)} – ${formatShortDate(displayEnd.toISOString())}`

  // COPY the Header + Footer JSX from the Weekly template (uses the three logo props).
  const Header = (/* ...copied... */ <View />)
  const Footer = (label: string) => (/* ...copied... */ <View />)

  const rateColor = (r: number) => (r === 0 ? GREEN : r <= 10 ? '#a9a454' : '#ef4444')
  const reasonRows = (b: BucketAggregate) => b.rejectionReasons.filter(r => r.category !== 'Other').map(r => ({ label: r.category, value: r.count }))

  const Bucket = ({ b, metric, kind }: { b: BucketAggregate; metric: 'count' | 'bags'; kind: 'PSS' | 'SS' }) => (
    <>
      <View style={styles.kpiStrip}>
        <KpiCard label="Certificates" value={b.totals.evaluated} sublabel={`${b.totals.approved} approved · ${b.totals.rejected} rejected`} />
        <KpiCard label="Approved" value={b.totals.approved} />
        <KpiCard label="Rejected" value={b.totals.rejected} valueColor={b.totals.rejected > 0 ? '#ef4444' : GREEN} />
        <KpiCard label="Rejection rate" value={`${b.totals.rejectionRate}%`} valueColor={rateColor(b.totals.rejectionRate)} />
        {kind === 'SS' && <KpiCard label="Bags approved" value={b.totals.bagsApproved} sublabel="60 kg equivalent" />}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Importer {kind}</Text>
        <VerticalGroupedBarChart categories={metricCats(b.byImporter, metric)} metric={metric} />
      </View>
      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Exporter {kind}</Text>
        <VerticalGroupedBarChart categories={metricCats(b.byExporter, metric)} metric={metric} />
      </View>

      {reasonRows(b).length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Rejection reasons</Text>
          <HorizontalBarChart rows={reasonRows(b)} labelWidth={140} trackWidth={420} limit={10} chartColor="#ef4444" />
        </View>
      )}

      <View style={styles.twoCol}>
        <RegionTable title="Approved certificates" rows={b.approvedByRegion} metric={metric} accent={GREEN} />
        <RegionTable title="Rejected certificates" rows={b.rejectedByRegion} metric={metric} accent="#ef4444" />
      </View>
    </>
  )

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>Pre-Shipment Samples · {range}</Text>
        <Bucket b={data.pss} metric="count" kind="PSS" />
        {Footer('Page 1 of 3 · Pre-Shipment Samples')}
      </Page>

      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>Shipment Samples · {range}</Text>
        <Bucket b={data.ss} metric="bags" kind="SS" />
        {data.showSankey && (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Supply chain flow</Text>
            <SankeyChart layout={data.sankey} columnLabels={data.sankeyColumns} />
          </View>
        )}
        {Footer('Page 2 of 3 · Shipment Samples')}
      </Page>

      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>SS certificate appendix · {data.ss.totals.approved} approved</Text>
        <SSCertAppendixTable
          rows={data.ssApprovedRows}
          totals={{ certificate_count: data.ss.totals.approved, bag_count: data.ss.totals.bagsApproved }}
          hideRoasterCol={data.client.is_roaster}
        />
        {Footer('Page 3 of 3 · Appendix')}
      </Page>
    </Document>
  )
}
```

Implementer notes:
- The `toCats` stub above is unused — delete it; use `metricCats` only. (Kept out of the final file.)
- For PSS region rows the leading number is the cert count (`{r.count} - {region}`); this matches the example ("8 - Cerrado", "11 - Total").
- Copy `styles.page`, `styles.titleBar`, `styles.sectionLabel`, `styles.kpiStrip`, header/footer styles from the Weekly template so the look matches.

- [ ] **Step 2: Write a render-smoke test (Sankey shown + hidden)**

Create `src/components/pdf/reports/biweekly-performance-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { BiweeklyPerformanceReport } from './biweekly-performance-report'
import type { BiweeklyPerformanceReportData, BucketAggregate } from '@/lib/reports/biweekly-data'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'

const emptyBucket: BucketAggregate = {
  totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0 },
  byImporter: [], byExporter: [], rejectionReasons: [], approvedByRegion: [], rejectedByRegion: [],
}
const filledBucket: BucketAggregate = {
  totals: { evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33, bagsApproved: 666 },
  byImporter: [{ name: 'Ofi', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, rejectionRate: 33 }],
  byExporter: [{ name: 'Cooxupe', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, rejectionRate: 33 }],
  rejectionReasons: [{ category: 'Balance below min', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 2, bags: 666, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 333, pct: 100 }],
}
const base = (showSankey: boolean): BiweeklyPerformanceReportData => ({
  client: { id: 'c', name: 'Dunkin', logo_url: null, is_roaster: false, sankey_type: showSankey ? 'final_buyer' : 'importer' },
  period: { start_date: '2026-01-01T00:00:00Z', end_date: '2026-01-16T00:00:00Z', issued_at: '2026-01-19T00:00:00Z' },
  origin: 'Brazil',
  pss: filledBucket, ss: filledBucket, ssApprovedRows: [],
  sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
  sankeyColumns: showSankey ? ['Shipper', 'Seller', 'Importer', 'Roaster'] : ['Shipper', 'Seller'],
  showSankey,
})

describe('BiweeklyPerformanceReport', () => {
  it('renders with Sankey (final_buyer, >2 companies)', async () => {
    const buf = await renderToBuffer(React.createElement(BiweeklyPerformanceReport, { data: base(true) }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders without Sankey (importer, 2 companies) and with an empty bucket', async () => {
    const data = { ...base(false), pss: emptyBucket }
    const buf = await renderToBuffer(React.createElement(BiweeklyPerformanceReport, { data }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/pdf/reports/biweekly-performance-report.test.ts`
Expected: PASS (2 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pdf/reports/biweekly-performance-report.tsx src/components/pdf/reports/biweekly-performance-report.test.ts
git commit -m "feat(reports): bi-weekly performance PDF template (PSS/SS + conditional sankey)"
```

---

## Task 7: Generator + API routes

Thin glue: a generator mirroring the Weekly one, plus GET (preview/download) and POST (send) routes.

**Files:**
- Create: `src/lib/reports/biweekly-generator.ts`
- Create: `src/app/api/reports/biweekly/route.ts`
- Create: `src/app/api/reports/biweekly/send/route.ts`

**Interfaces:**
- Consumes: `getBiweeklyPerformanceReportData` (Task 3), `BiweeklyPerformanceReport` (Task 6), `getCountryCodeFromOrigin`/`getFlagPath` (existing), `sendMail`/`GraphSendError`/`saveRecipients`/`composeBodyHtml` (existing).
- Produces (consumed by Task 8 via HTTP): `GET /api/reports/biweekly`, `POST /api/reports/biweekly/send`.
  - `export async function generateBiweeklyReport(supabase, params): Promise<{ pdfBuffer: Buffer; filename: string; data: BiweeklyPerformanceReportData } | null>`

- [ ] **Step 1: Implement the generator**

Create `src/lib/reports/biweekly-generator.ts` — copy `weekly-ss-generator.ts` and change: import `getBiweeklyPerformanceReportData` + `BiweeklyPerformanceReport`; the data's flag origin is `data.origin` (same field name); filename:

```ts
  const filename = `${clientSlug}_BiWeekly_${startSlug}_to_${endSlug}.pdf`
```

The logo/flag/client-logo loading and `renderToBuffer(React.createElement(BiweeklyPerformanceReport, {...}))` are identical in shape to the Weekly generator. `data.client.logo_url` and `data.origin` exist on the bi-weekly data type (verified in Task 3).

- [ ] **Step 2: Implement the GET route**

Create `src/app/api/reports/biweekly/route.ts` — copy `src/app/api/reports/weekly-ss/route.ts`, swap the import + call to `generateBiweeklyReport`. Everything else (auth, param validation, PDF streaming headers) is identical.

- [ ] **Step 3: Implement the send route**

Create `src/app/api/reports/biweekly/send/route.ts` — copy `src/app/api/reports/weekly-ss/send/route.ts` and change exactly these:

```ts
import { generateBiweeklyReport } from '@/lib/reports/biweekly-generator'
const REPORT_TYPE = 'biweekly'
// ...
const report = await generateBiweeklyReport(supabase, { clientId: client_id, startDate: start.toISOString(), endDate: end.toISOString() })
// subject default:
`${report.data.client.name} · Bi-Weekly Performance · ${periodLabel}`
// body default cover line: "...the Bi-Weekly Performance report for ${report.data.client.name} covering ${periodLabel}."
```

- [ ] **Step 4: Typecheck + manual smoke**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev`. With a logged-in session, open in the browser:
`/api/reports/biweekly?client_id=<DUNKIN_UUID>&start_date=2026-01-01T00:00:00.000Z&end_date=2026-01-16T00:00:00.000Z`
Expected: a PDF renders inline with PSS (page 1), SS (page 2, Sankey present for Dunkin), and the SS appendix (page 3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/biweekly-generator.ts src/app/api/reports/biweekly/route.ts src/app/api/reports/biweekly/send/route.ts
git commit -m "feat(reports): bi-weekly generator + GET/send API routes"
```

---

## Task 8: Parameterize the preview + send modals

Make both modals serve any report type via a `ReportKind` config, defaulting to current Weekly behavior.

**Files:**
- Modify: `src/components/reports/preview-report-modal.tsx`
- Modify: `src/components/reports/send-report-modal.tsx`

**Interfaces:**
- Produces (consumed by Task 9):
  - `export interface ReportKind { reportType: 'weekly_ss' | 'biweekly'; previewEndpoint: string; sendEndpoint: string; label: string }`
  - `export const WEEKLY_SS_KIND: ReportKind` and `export const BIWEEKLY_KIND: ReportKind` (exported from `preview-report-modal.tsx`).
  - `PreviewReportModalProps` and `SendReportModalProps` each gain `kind: ReportKind`.

- [ ] **Step 1: Add the ReportKind type + constants and thread through the preview modal**

In `src/components/reports/preview-report-modal.tsx`:

```tsx
export interface ReportKind {
  reportType: 'weekly_ss' | 'biweekly'
  previewEndpoint: string  // GET, streams the PDF
  sendEndpoint: string     // POST, emails it
  label: string            // human label for titles/subjects
}
export const WEEKLY_SS_KIND: ReportKind = {
  reportType: 'weekly_ss', previewEndpoint: '/api/reports/weekly-ss',
  sendEndpoint: '/api/reports/weekly-ss/send', label: 'Weekly SS Certificates',
}
export const BIWEEKLY_KIND: ReportKind = {
  reportType: 'biweekly', previewEndpoint: '/api/reports/biweekly',
  sendEndpoint: '/api/reports/biweekly/send', label: 'Bi-Weekly Performance',
}
```

- Add `kind: ReportKind` to `PreviewReportModalProps`.
- Replace `fetch(\`/api/reports/weekly-ss?${params}\`)` with `fetch(\`${kind.previewEndpoint}?${params}\`)`.
- Replace the hardcoded title `Weekly SS Certificates · {clientName}` with `{kind.label} · {clientName}`.
- Pass `kind` down to `<SendReportModal kind={kind} … />`.

- [ ] **Step 2: Thread through the send modal**

In `src/components/reports/send-report-modal.tsx`:
- Add `kind: ReportKind` to `SendReportModalProps` (import the type from `./preview-report-modal`).
- Remove the module-level `const REPORT_TYPE = 'weekly_ss'`; use `kind.reportType` in the recipients fetch (`report_type: kind.reportType`).
- Replace the POST URL `'/api/reports/weekly-ss/send'` with `kind.sendEndpoint`.
- Replace label strings: default subject `${clientName} · ${kind.label} · ${start} – ${end}`; dialog title `Send ${kind.label} Report`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY at the `ReportsPage` call site (missing `kind` prop) — fixed in Task 9. If any other file errors, fix the modal wiring.

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/preview-report-modal.tsx src/components/reports/send-report-modal.tsx
git commit -m "refactor(reports): parameterize preview/send modals by report kind"
```

---

## Task 9: Reports page — two-card grid + bi-weekly form

Turn the single hardcoded card into a two-card grid; add the bi-weekly form with half-month presets; pass the right `ReportKind` to the preview modal.

**Files:**
- Modify: `src/app/dashboard/reports/page.tsx`

**Interfaces:**
- Consumes: `WEEKLY_SS_KIND`, `BIWEEKLY_KIND`, `ReportKind` (Task 8); `firstHalf`, `secondHalf`, `previousHalfMonth` (Task 2).

- [ ] **Step 1: Add bi-weekly state, presets, and the second card**

In `src/app/dashboard/reports/page.tsx`:

1. Import the kinds + period helpers:

```tsx
import { WEEKLY_SS_KIND, BIWEEKLY_KIND, type ReportKind } from '@/components/reports/preview-report-modal'
import { firstHalf, secondHalf, previousHalfMonth } from '@/lib/reports/periods'
```

2. Track which report's preview is open via the active kind:

```tsx
const [activeKind, setActiveKind] = useState<ReportKind | null>(null)
```

3. Default the bi-weekly window to the most recently completed half-month:

```tsx
const defaultBiweekly = useMemo(() => previousHalfMonth(new Date()), [])
const [bwStart, setBwStart] = useState(defaultBiweekly.start)
const [bwEnd, setBwEnd] = useState(defaultBiweekly.end)
```

4. Half-month preset handlers (operate on the month of the current `bwStart`):

```tsx
const presetFirstHalf = () => { const d = new Date(bwStart); const h = firstHalf(d.getFullYear(), d.getMonth()); setBwStart(h.start); setBwEnd(h.end) }
const presetSecondHalf = () => { const d = new Date(bwStart); const h = secondHalf(d.getFullYear(), d.getMonth()); setBwStart(h.start); setBwEnd(h.end) }
```

5. Wrap the existing Weekly card and a new Bi-Weekly card in a responsive grid (`grid grid-cols-1 lg:grid-cols-2 gap-4`). The Weekly card's existing "Preview" handler sets `setActiveKind(WEEKLY_SS_KIND)` then `setPreviewOpen(true)`. The Bi-Weekly card mirrors the Weekly card (same client picker; `bwStart`/`bwEnd` date inputs; "1st half"/"2nd half" preset buttons; copy: title "Bi-Weekly Performance", description "PSS + SS performance for one QC client over a ~15-day window — approvals, rejections, and rejection reasons.") and its Preview handler sets `setActiveKind(BIWEEKLY_KIND)` then `setPreviewOpen(true)`.

6. Render ONE `PreviewReportModal`, fed by whichever card is active:

```tsx
{activeKind && clientId && (
  <PreviewReportModal
    open={previewOpen}
    onOpenChange={(o) => { setPreviewOpen(o); if (!o) setActiveKind(null) }}
    kind={activeKind}
    clientId={clientId}
    clientName={clients.find(c => c.value === clientId)?.label || 'Client'}
    startDate={activeKind.reportType === 'biweekly' ? bwStart : startDate}
    endDate={activeKind.reportType === 'biweekly' ? bwEnd : endDate}
  />
)}
```

Keep the existing Weekly client picker shared between both cards (a single `clientId` selection is fine; each card has its own date range). Validate the bi-weekly range with the same guards the Weekly card uses (client chosen, start < end).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors (the Task 8 call-site error is now resolved).

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual end-to-end**

Run: `npm run dev`, open `/dashboard/reports`:
- Two cards show (Weekly SS · Bi-Weekly Performance).
- Weekly card still previews/downloads/sends exactly as before.
- Bi-Weekly card: pick Dunkin, click "1st half", Preview → 3-page PDF (PSS, SS with Sankey, appendix). Download works. Send opens the modal titled "Send Bi-Weekly Performance Report", pre-fills saved recipients for `report_type=biweekly` (empty on first use), and sends.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/reports/page.tsx
git commit -m "feat(reports): two-card reports page with bi-weekly performance report"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full test suite + typecheck + build**

Run: `npx vitest run`
Expected: all green (including the new period, aggregation, chart, and render-smoke tests).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2: Cross-check against the example**

Generate the Bi-Weekly for Dunkin over a window with known PSS+SS data and compare against `docs/report_examples/Brazil_Report_week_4_15_days.pdf`:
- PSS: importer/exporter approved+rejected counts and rejection rates match.
- SS: importer/exporter bag totals and "Bags approved" KPI match.
- Region tables: regions, counts/bags, and percentages match.
- Rejection reasons reflect the actual `compliance_violations`.

- [ ] **Step 3: Report results to the user**

Summarize: tests/typecheck/build status, and the example cross-check. Do NOT push — wait for the user to ask.

---

## Self-Review

**Spec coverage:**
- §2 semantics / field mapping → Tasks 1, 3 (mapper carries buyer_contract_nr, region via micro_origin, bags; categorizeViolation reused).
- §3 one-query-split-in-memory approach → Task 3 fetcher.
- §4 VerticalGroupedBarChart (metric count/bags) → Task 4.
- §5 PDF structure (PSS page, SS page, appendix) → Task 6 (+ Task 5 appendix extraction).
- §6 conditional Sankey (`sankeyColumns.length > 2`) → Task 3 (`showSankey`) + Task 6 (render guard).
- §7 generator + routes → Task 7.
- §8 modal parameterization → Task 8.
- §9 two-card page → Task 9.
- §10 half-month period UI → Tasks 2 + 9.
- §12 testing (unit aggregators, render smoke, manual cross-check) → Tasks 2,3,4,6,10.

**Placeholder scan:** No "TBD/TODO/handle edge cases" in steps; the only deferred item is the out-of-scope annual report (§13). Copied-from-Weekly blocks (styles, Header/Footer, route bodies) name exact source files + line ranges rather than re-pasting ~300 lines verbatim — DRY, and the source is in-repo.

**Type consistency:** `BiweeklyPerformanceReportData`, `BucketAggregate`, `GroupPerf`, `RegionRow` defined in Task 3 are consumed with the same field names in Tasks 6 (`approvedBags`/`rejectedBags`/`approvedCount`/`rejectedCount`/`rejectionRate`, `approvedByRegion`/`rejectedByRegion`, `totals.bagsApproved`) and 7. `GroupedBarCategory` (Task 4) matches `metricCats` output (Task 6). `ReportKind` (Task 8) matches the props consumed in Task 9. `generateBiweeklyReport` (Task 7) returns `{ pdfBuffer, filename, data }` consumed by both routes.
