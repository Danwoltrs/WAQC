# SS / PSS / SS+PSS Unified Report Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two drifting period-report templates with one unified engine that powers three reports (SS, PSS, SS+PSS), fixing the big-bag count bug, the split-chart pagination bug, and the single-importer chart waste.

**Architecture:** One data fetcher (`performance-data.ts`) parameterized by sample-type buckets, one PDF template (`performance-report.tsx`) rendering a two-page pair per bucket, one generator + shared route handlers behind the existing API URLs plus a new `/api/reports/pss` pair. The bags/MT fix lands once in the shared row mapper (`report-data.ts`) so every report inherits it.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@react-pdf/renderer` (PDF), Supabase JS, vitest (`npm run test:run`).

**Spec:** `docs/superpowers/specs/2026-07-06-report-restructure-design.md`

## Global Constraints

- No database migration — everything is TypeScript-side. `report_recipients.report_type` is plain TEXT (no CHECK constraint), only the app-side allowlist changes.
- No emojis in the UI. No mock data.
- Colors: green `#556b2f`, red `#ef4444`, dark-green total row `#2f6b21`, border `#e3e3e3` (match existing PDF components).
- Old API URLs must keep working: `/api/reports/weekly-ss` (+`/send`) and `/api/reports/biweekly` (+`/send`). The Annual report (`/api/reports/annual`) is untouched.
- Keep files under ~2000 lines.
- Tests: vitest — run with `npx vitest run <file>` per task, `npm run test:run` for the suite.
- Build must stay green after every task: old files are kept alive until Task 7 (cleanup) deletes them.

---

### Task 1: Bags/MT rule in the shared row mapper

The bug: `mapCertRowToReportRow` in `src/lib/report-data.ts:91` computes `bag_count ?? equivalent_60kg_bags`, so a 20-big-bag contract reports 20 bags instead of ~333. Fix with a kg-first rule and add an `mt` field to every report row.

**Files:**
- Create: `src/lib/report-data.test.ts`
- Modify: `src/lib/report-data.ts` (add `computeBagsAndMt`, `bag_weight_kg` in `RawCertSampleRow` + query, `mt` on `WeeklySSCertRow`, use in `mapCertRowToReportRow`)
- Modify: `src/lib/reports/biweekly-data.ts` (add `bag_weight_kg` to its query select — its row factory type gains `mt` transitively)
- Modify: `src/lib/reports/biweekly-data.test.ts` (fixture gains `mt`)
- Modify: `src/components/pdf/reports/ss-cert-appendix-table.test.ts` (fixture gains `mt`)

**Interfaces:**
- Produces: `computeBagsAndMt(s: { bag_count: number | null; bag_weight_kg: number | null; equivalent_60kg_bags: number | null; bags_quantity_mt: number | null }): { bags: number | null; mt: number | null }` exported from `@/lib/report-data`.
- Produces: `WeeklySSCertRow` gains required field `mt: number | null`. All later tasks rely on `row.bags` (60kg equivalent, integer) and `row.mt` (metric tons, 1 decimal).

- [ ] **Step 1: Write the failing test**

Create `src/lib/report-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeBagsAndMt } from './report-data'

const base = { bag_count: null, bag_weight_kg: null, equivalent_60kg_bags: null, bags_quantity_mt: null }

describe('computeBagsAndMt', () => {
  it('prefers stored equivalent_60kg_bags', () => {
    expect(computeBagsAndMt({ ...base, equivalent_60kg_bags: 333, bag_count: 20 }))
      .toEqual({ bags: 333, mt: 20.0 })
  })
  it('derives from bag_count x bag_weight_kg — 1000 kg big bags', () => {
    expect(computeBagsAndMt({ ...base, bag_count: 20, bag_weight_kg: 1000 }))
      .toEqual({ bags: 333, mt: 20.0 })
  })
  it('derives from bag_count x bag_weight_kg — 59 kg bags', () => {
    expect(computeBagsAndMt({ ...base, bag_count: 300, bag_weight_kg: 59 }))
      .toEqual({ bags: 295, mt: 17.7 })
  })
  it('derives from bags_quantity_mt when weights are missing', () => {
    expect(computeBagsAndMt({ ...base, bags_quantity_mt: 19.2 }))
      .toEqual({ bags: 320, mt: 19.2 })
  })
  it('falls back to bag_count assuming 60 kg', () => {
    expect(computeBagsAndMt({ ...base, bag_count: 320 }))
      .toEqual({ bags: 320, mt: 19.2 })
  })
  it('returns nulls when no quantity data exists', () => {
    expect(computeBagsAndMt(base)).toEqual({ bags: null, mt: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report-data.test.ts`
Expected: FAIL — `computeBagsAndMt` is not exported.

- [ ] **Step 3: Implement in `src/lib/report-data.ts`**

3a. Add the function directly above `mapCertRowToReportRow`:

```ts
/**
 * Best-available total weight → 60kg-equivalent bags + metric tons.
 *
 * Fixes the big-bag bug: a 20 x 1000kg contract must report ~333 bags,
 * not 20. Priority: stored 60kg equivalent → physical count x actual
 * bag weight (handles 59kg and 1000kg bags) → stored MT → assume 60kg.
 */
export function computeBagsAndMt(s: {
  bag_count: number | null
  bag_weight_kg: number | null
  equivalent_60kg_bags: number | null
  bags_quantity_mt: number | null
}): { bags: number | null; mt: number | null } {
  const kg =
    s.equivalent_60kg_bags != null ? s.equivalent_60kg_bags * 60
    : s.bag_count != null && s.bag_weight_kg != null ? s.bag_count * s.bag_weight_kg
    : s.bags_quantity_mt != null ? s.bags_quantity_mt * 1000
    : s.bag_count != null ? s.bag_count * 60
    : null
  if (kg == null) return { bags: null, mt: null }
  return { bags: Math.round(kg / 60), mt: Math.round(kg / 100) / 10 }
}
```

3b. In `RawCertSampleRow.sample`, add after `bag_count`:

```ts
    bag_weight_kg: number | null
```

3c. In `WeeklySSCertRow`, add after `bags: number | null`:

```ts
  mt: number | null               // metric tons, 1 decimal (same source as bags)
```

3d. In `mapCertRowToReportRow`, replace

```ts
  const bagsRaw = s.bag_count ?? s.equivalent_60kg_bags ?? null
  const bags = typeof bagsRaw === 'number' ? Math.round(bagsRaw) : null
```

with

```ts
  const { bags, mt } = computeBagsAndMt({
    bag_count: s.bag_count ?? null,
    bag_weight_kg: s.bag_weight_kg ?? null,
    equivalent_60kg_bags: s.equivalent_60kg_bags ?? null,
    bags_quantity_mt: s.bags_quantity_mt ?? null,
  })
```

and add `mt,` to the returned object right after `bags,`.

3e. In `getWeeklySSCertReportData`'s query select (the `sample:samples!...` block, `src/lib/report-data.ts:208-223`), add `bag_weight_kg,` on the line after `bag_count,`.

- [ ] **Step 4: Fix the two existing fixtures that now miss `mt`**

In `src/lib/reports/biweekly-data.ts`, the certificates query select (line ~230): add `bag_weight_kg,` after `bag_count,` (the line reads `bag_count, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,` — make it `bag_count, bag_weight_kg, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,`).

In `src/lib/reports/biweekly-data.test.ts`, the `row` factory: add `mt: 20.0,` after `bags: 333,`.

In `src/components/pdf/reports/ss-cert-appendix-table.test.ts`, the `row` constant: add `mt: 20.0,` after `bags: 333,`.

- [ ] **Step 5: Run all report tests + typecheck**

Run: `npx vitest run src/lib/report-data.test.ts src/lib/reports/biweekly-data.test.ts src/components/pdf/reports/ss-cert-appendix-table.test.ts && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/report-data.ts src/lib/report-data.test.ts src/lib/reports/biweekly-data.ts src/lib/reports/biweekly-data.test.ts src/components/pdf/reports/ss-cert-appendix-table.test.ts
git commit -m "fix(reports): 60kg-equivalent bags + MT via kg-first rule (big-bag fix)"
```

---

### Task 2: Performance data layer (bucket-parameterized fetcher)

Generalize `biweekly-data.ts` into `performance-data.ts`. Old file stays alive (biweekly generator still imports it) until Task 7 deletes it.

**Files:**
- Create: `src/lib/reports/performance-data.ts`
- Create: `src/lib/reports/performance-data.test.ts`

**Interfaces:**
- Consumes: `mapCertRowToReportRow`, `categorizeViolation`, `buildSankey`, `WeeklySSCertRow` (with `mt`), `RawCertSampleRow`, `ClientSankeyType` from `@/lib/report-data`.
- Produces (used by Tasks 4–5):

```ts
export type ReportBucketKey = 'pss' | 'ss'
export type PerformanceRow = WeeklySSCertRow & { region: string | null }
export interface BucketTotals { evaluated: number; approved: number; rejected: number; rejectionRate: number; bagsApproved: number; mtApproved: number }
export interface GroupPerf { name: string; approvedCount: number; rejectedCount: number; approvedBags: number; rejectedBags: number; rejectionRate: number }
export interface RegionRow { region: string; count: number; bags: number; pct: number }
export interface BucketAggregate { totals: BucketTotals; byImporter: GroupPerf[]; byExporter: GroupPerf[]; rejectionReasons: RejectionReasonRow[]; approvedByRegion: RegionRow[]; rejectedByRegion: RegionRow[] }
export interface PerformanceBucket extends BucketAggregate { rows: PerformanceRow[] }  // ALL certs, chronological
export interface PerformanceReportData {
  client: { id: string; name: string; logo_url: string | null; is_roaster: boolean; sankey_type: ClientSankeyType }
  period: { start_date: string; end_date: string; issued_at: string }
  origin: string | null
  pss: PerformanceBucket | null
  ss: PerformanceBucket | null
  sankey: SankeyLayoutResult | null   // only when ss requested
  sankeyColumns: string[]
  showSankey: boolean
}
export function aggregateBucket(rows: PerformanceRow[], metric: 'count' | 'bags'): BucketAggregate
export async function getPerformanceReportData(supabase: SupabaseClient, params: { clientId: string; startDate: string; endDate: string; buckets: ReportBucketKey[] }): Promise<PerformanceReportData | null>
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/performance-data.test.ts` — port of `biweekly-data.test.ts` plus MT assertions:

```ts
import { describe, it, expect } from 'vitest'
import { aggregateBucket, type PerformanceRow } from './performance-data'

const row = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
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
  mt: 20.0,
  is_rejected: false,
  region: 'Cerrado',
  ...over,
})

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
    expect(agg.totals.rejectionRate).toBe(33)
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
    expect(cerrado.pct).toBe(100)
  })
})

describe('aggregateBucket — bags + MT (SS)', () => {
  const rows = [
    row({ bags: 3334, mt: 200.0, region: 'Cerrado/South Of Minas', is_rejected: false }),
    row({ bags: 2667, mt: 160.0, region: 'Cerrado/Mogiana', is_rejected: false }),
    row({ bags: 333, mt: 20.0, is_rejected: true }),   // rejected — excluded from approved sums
  ]
  it('sums approved bags and MT only', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.totals.bagsApproved).toBe(6001)
    expect(agg.totals.mtApproved).toBe(360.0)
    const a = agg.approvedByRegion.find(r => r.region === 'Cerrado/South Of Minas')!
    expect(a.bags).toBe(3334)
    expect(a.pct).toBe(56)
  })
  it('rounds mtApproved to 1 decimal', () => {
    const agg = aggregateBucket([row({ mt: 17.7 }), row({ mt: 19.24 })], 'bags')
    expect(agg.totals.mtApproved).toBe(36.9)
  })
})

describe('aggregateBucket — empty', () => {
  it('handles no rows without dividing by zero', () => {
    const agg = aggregateBucket([], 'count')
    expect(agg.totals.evaluated).toBe(0)
    expect(agg.totals.rejectionRate).toBe(0)
    expect(agg.totals.mtApproved).toBe(0)
    expect(agg.byImporter).toEqual([])
    expect(agg.approvedByRegion).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/performance-data.test.ts`
Expected: FAIL — module `./performance-data` not found.

- [ ] **Step 3: Create `src/lib/reports/performance-data.ts`**

Full file:

```ts
/**
 * Performance report data (SS / PSS / SS+PSS).
 *
 * Pulls every certificate (approved + rejected) created in the window for
 * one QC client, for the requested sample-type buckets, and aggregates each
 * bucket into per-importer / per-exporter / per-region performance plus
 * rejection reasons. Reuses the shared row mapper, violation categorizer,
 * and Sankey builder from report-data so the three reports cannot drift.
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

export type ReportBucketKey = 'pss' | 'ss'

/** A report row carrying its region (micro_origin) for grouping. */
export type PerformanceRow = WeeklySSCertRow & { region: string | null }

export interface BucketTotals {
  evaluated: number
  approved: number
  rejected: number
  rejectionRate: number // 0-100, rounded
  bagsApproved: number
  mtApproved: number    // metric tons (approved only), 1 decimal
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

/** A bucket's aggregates plus every cert row (approved + rejected),
 *  chronological — the appendix table renders these directly. */
export interface PerformanceBucket extends BucketAggregate {
  rows: PerformanceRow[]
}

export interface PerformanceReportData {
  client: {
    id: string
    name: string
    logo_url: string | null
    is_roaster: boolean
    sankey_type: ClientSankeyType
  }
  period: { start_date: string; end_date: string; issued_at: string }
  origin: string | null
  pss: PerformanceBucket | null
  ss: PerformanceBucket | null
  /** Built from approved SS rows; null when the SS bucket wasn't requested. */
  sankey: SankeyLayoutResult | null
  sankeyColumns: string[]
  showSankey: boolean
}

const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

function emptyGroup(name: string): GroupPerf {
  return { name, approvedCount: 0, rejectedCount: 0, approvedBags: 0, rejectedBags: 0, rejectionRate: 0 }
}

export function groupBy(
  rows: PerformanceRow[],
  keyOf: (r: PerformanceRow) => string | null,
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

function regionBreakdown(rows: PerformanceRow[], metric: 'count' | 'bags'): RegionRow[] {
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

export function aggregateBucket(rows: PerformanceRow[], metric: 'count' | 'bags'): BucketAggregate {
  const approved = rows.filter(r => !r.is_rejected)
  const rejected = rows.filter(r => r.is_rejected)

  const totals: BucketTotals = {
    evaluated: rows.length,
    approved: approved.length,
    rejected: rejected.length,
    rejectionRate: pct(rejected.length, rows.length),
    bagsApproved: approved.reduce((s, r) => s + (r.bags ?? 0), 0),
    mtApproved: Math.round(approved.reduce((s, r) => s + (r.mt ?? 0), 0) * 10) / 10,
  }

  const reasonCounts = new Map<string, number>()
  for (const r of rejected) {
    // compliance_violations is not on the row; reasons are attached by the
    // fetcher via the `_violations` carrier. Optional so pure tests can omit.
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

/** Map a raw cert row → a PerformanceRow, carrying region + raw violations. */
function toPerformanceRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
): PerformanceRow {
  const base = mapCertRowToReportRow(c, ctx)
  const enriched = base as PerformanceRow & { _violations?: string[] }
  enriched.region = c.sample?.micro_origin ?? null
  enriched._violations = c.compliance_violations ?? []
  return enriched
}

export function scorecardFromExporters(perf: GroupPerf[]): SupplierScorecardRow[] {
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

export async function getPerformanceReportData(
  supabase: SupabaseClient,
  params: { clientId: string; startDate: string; endDate: string; buckets: ReportBucketKey[] },
): Promise<PerformanceReportData | null> {
  const { clientId, startDate, endDate, buckets } = params

  const { data: client, error: clientError } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, logo_url, company_types, trading_roles')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[performance-data] client not found:', clientId, clientError)
    return null
  }
  const companyTypes: string[] = client.company_types ?? []
  const tradingRoles: string[] = client.trading_roles ?? []
  const clientIsRoaster = companyTypes.some(t => typeof t === 'string' && t.toLowerCase() === 'roaster')
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'

  // NOTE: select must include sample.micro_origin (region) + bag_weight_kg
  // (bags/MT rule).
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      certificate_number,
      created_at,
      is_rejected,
      compliance_violations,
      sample:samples!certificates_sample_id_fkey(
        id, sample_type, client_id, origin, micro_origin, container_nr, ico_number,
        bag_count, bag_weight_kg, equivalent_60kg_bags, bags_quantity_mt, buyer_contract_nr,
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
    console.error('[performance-data] certificates query failed:', certsError)
    return null
  }

  const forClient = (certs || []).filter((c: any) => c.sample && c.sample.client_id === clientId)

  const bucketRows = (type: ReportBucketKey): PerformanceRow[] =>
    forClient
      .filter((c: any) => c.sample.sample_type === type)
      .map((c: any) => toPerformanceRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))

  const pssRows = buckets.includes('pss') ? bucketRows('pss') : null
  const ssRows = buckets.includes('ss') ? bucketRows('ss') : null

  const pss: PerformanceBucket | null = pssRows
    ? { ...aggregateBucket(pssRows, 'count'), rows: pssRows }
    : null
  const ss: PerformanceBucket | null = ssRows
    ? { ...aggregateBucket(ssRows, 'bags'), rows: ssRows }
    : null

  // Dominant origin across the REQUESTED buckets (header flag).
  const requestedTypes = new Set(buckets)
  const originCounts = new Map<string, number>()
  for (const c of forClient as any[]) {
    if (!requestedTypes.has(c.sample?.sample_type)) continue
    const o = c.sample?.origin
    if (o) originCounts.set(o, (originCounts.get(o) ?? 0) + 1)
  }
  const origin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Sankey from approved SS rows; shown only when >2 companies (3+ columns).
  let sankey: SankeyLayoutResult | null = null
  let sankeyColumns: string[] = []
  if (ss && ssRows) {
    const approved = ssRows.filter(r => !r.is_rejected)
    const built = buildSankey(approved, scorecardFromExporters(ss.byExporter), sankeyType, clientDisplay)
    sankey = built.layout
    sankeyColumns = built.columns
  }

  return {
    client: { id: client.id, name: clientDisplay, logo_url: client.logo_url ?? null, is_roaster: clientIsRoaster, sankey_type: sankeyType },
    period: { start_date: startDate, end_date: endDate, issued_at: new Date().toISOString() },
    origin,
    pss,
    ss,
    sankey,
    sankeyColumns,
    showSankey: sankeyColumns.length > 2,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reports/performance-data.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/performance-data.ts src/lib/reports/performance-data.test.ts
git commit -m "feat(reports): bucket-parameterized performance data fetcher"
```

---

### Task 3: Cert appendix table with Status + MT columns

New `cert-appendix-table.tsx` replacing `ss-cert-appendix-table.tsx` (old file deleted in Task 7). Dynamic column list so the Roaster (Ahold-style clients) and Container (PSS) columns can drop out with widths renormalized.

**Files:**
- Create: `src/components/pdf/reports/cert-appendix-table.tsx`
- Create: `src/components/pdf/reports/cert-appendix-table.test.ts`

**Interfaces:**
- Consumes: `WeeklySSCertRow` (with `mt`) from `@/lib/report-data`.
- Produces (used by Task 4):

```ts
export function visibleCols(hideRoasterCol: boolean, hideContainerCol: boolean): Array<{ key: string; label: string; weight: number; width: string; align?: 'right' | 'center' }>
export function CertAppendixTable(props: {
  rows: WeeklySSCertRow[]                 // ALL certs, chronological (approved + rejected)
  totals: { certificate_count: number; bag_count: number; mt: number }  // approved-only sums
  hideRoasterCol: boolean
  hideContainerCol?: boolean              // true for the PSS bucket
  emptyMessage?: string
}): JSX.Element
```

- [ ] **Step 1: Write the failing test**

Create `src/components/pdf/reports/cert-appendix-table.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { CertAppendixTable, visibleCols } from './cert-appendix-table'
import type { WeeklySSCertRow } from '@/lib/report-data'

const row = (over: Partial<WeeklySSCertRow> = {}): WeeklySSCertRow => ({
  approval_date: '2026-02-26T00:00:00Z', certificate_number: '36.686/26',
  exporter_name: 'Cooxupe', seller_name: 'Cooxupe', importer_name: 'Coffee America',
  importer_contract_nr: 'P07113.000', roaster_name: 'Unsold', container_nr: 'TCKU 186.924-2',
  ico_marks: '002/4600/1551', bags: 333, mt: 20.0, is_rejected: false,
  ...over,
})

describe('visibleCols', () => {
  it('full SS layout has 11 columns summing to ~100%', () => {
    const cols = visibleCols(false, false)
    expect(cols.map(c => c.key)).toEqual([
      'date', 'cert', 'shipper', 'importer', 'contract', 'roaster',
      'container', 'ico', 'bags', 'mt', 'status',
    ])
    const sum = cols.reduce((s, c) => s + parseFloat(c.width), 0)
    expect(sum).toBeGreaterThan(99.9)
    expect(sum).toBeLessThan(100.1)
  })
  it('drops roaster and container columns on demand, widths renormalized', () => {
    const cols = visibleCols(true, true)
    expect(cols.find(c => c.key === 'roaster')).toBeUndefined()
    expect(cols.find(c => c.key === 'container')).toBeUndefined()
    const sum = cols.reduce((s, c) => s + parseFloat(c.width), 0)
    expect(sum).toBeGreaterThan(99.9)
    expect(sum).toBeLessThan(100.1)
  })
})

describe('CertAppendixTable', () => {
  it('renders approved + rejected rows to a non-empty PDF', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row(), row({ certificate_number: '36.687/26', is_rejected: true })],
        totals: { certificate_count: 1, bag_count: 333, mt: 20.0 },
        hideRoasterCol: false,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders the PSS variant (no container column)', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row({ container_nr: null })],
        totals: { certificate_count: 1, bag_count: 333, mt: 20.0 },
        hideRoasterCol: true,
        hideContainerCol: true,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/reports/cert-appendix-table.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/pdf/reports/cert-appendix-table.tsx`**

Full file:

```tsx
/**
 * Certificate appendix table shared by the SS / PSS / SS+PSS reports.
 * One chronological table of ALL certs in a bucket with a green/red Status
 * column, Bags (60kg equivalent) + MT columns, and an approved-only totals
 * row. Roaster and Container columns drop out per client/bucket with the
 * remaining widths renormalized.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { WeeklySSCertRow } from '@/lib/report-data'

const GREEN = '#556b2f'
const GREEN_DARK = '#2f6b21'
const RED = '#ef4444'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

type ColKey =
  | 'date' | 'cert' | 'shipper' | 'importer' | 'contract' | 'roaster'
  | 'container' | 'ico' | 'bags' | 'mt' | 'status'

interface ColDef { key: ColKey; label: string; weight: number; align?: 'right' | 'center' }

const ALL_COLS: ColDef[] = [
  { key: 'date', label: 'Approval date', weight: 9 },
  { key: 'cert', label: 'Certificate #', weight: 12 },
  { key: 'shipper', label: 'Shipper', weight: 13 },
  { key: 'importer', label: 'Importer', weight: 14 },
  { key: 'contract', label: 'Importer contract', weight: 13 },
  { key: 'roaster', label: 'Roaster destination', weight: 12 },
  { key: 'container', label: 'Container', weight: 10 },
  { key: 'ico', label: 'ICO marks', weight: 10 },
  { key: 'bags', label: 'Bags', weight: 6, align: 'right' },
  { key: 'mt', label: 'MT', weight: 6, align: 'right' },
  { key: 'status', label: 'Status', weight: 7, align: 'center' },
]

/** Visible columns with widths renormalized to sum to 100%. */
export function visibleCols(
  hideRoasterCol: boolean,
  hideContainerCol: boolean,
): Array<ColDef & { width: string }> {
  const cols = ALL_COLS.filter(c =>
    (c.key !== 'roaster' || !hideRoasterCol) &&
    (c.key !== 'container' || !hideContainerCol),
  )
  const total = cols.reduce((s, c) => s + c.weight, 0)
  return cols.map(c => ({ ...c, width: `${((c.weight / total) * 100).toFixed(2)}%` }))
}

const styles = StyleSheet.create({
  table: { borderTopWidth: 1, borderTopColor: GRAY_BORDER },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: GREEN },
  tableHeaderCell: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: 700,
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: '#FFFFFF',
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  tableCell: {
    fontSize: 8,
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: GRAY_BORDER,
    color: '#222',
  },
  totalRow: { flexDirection: 'row', backgroundColor: GREEN_DARK },
  totalCell: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 700,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: GREEN_DARK,
  },
})

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

function cellText(r: WeeklySSCertRow, key: ColKey): string {
  switch (key) {
    case 'date': return formatDate(r.approval_date)
    case 'cert': return r.certificate_number
    case 'shipper': return r.exporter_name || '—'
    case 'importer': return r.importer_name || '—'
    case 'contract': return r.importer_contract_nr || '—'
    case 'roaster': return r.roaster_name || '—'
    case 'container': return r.container_nr || '—'
    case 'ico': return r.ico_marks || '—'
    case 'bags': return r.bags != null ? r.bags.toLocaleString('en-US') : '—'
    case 'mt': return r.mt != null ? r.mt.toFixed(1) : '—'
    case 'status': return r.is_rejected ? 'Rejected' : 'Approved'
  }
}

function totalText(
  key: ColKey,
  totals: { certificate_count: number; bag_count: number; mt: number },
): string {
  switch (key) {
    case 'date': return 'Total'
    case 'cert': return String(totals.certificate_count)
    case 'bags': return totals.bag_count.toLocaleString('en-US')
    case 'mt': return totals.mt.toFixed(1)
    default: return ''
  }
}

export function CertAppendixTable({
  rows,
  totals,
  hideRoasterCol,
  hideContainerCol = false,
  emptyMessage = 'No certificates issued in this period.',
}: {
  rows: WeeklySSCertRow[]
  /** Approved-only sums — matches the KPI band. */
  totals: { certificate_count: number; bag_count: number; mt: number }
  hideRoasterCol: boolean
  hideContainerCol?: boolean
  emptyMessage?: string
}) {
  const cols = visibleCols(hideRoasterCol, hideContainerCol)
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow} fixed>
        {cols.map(c => (
          <Text
            key={c.key}
            style={[styles.tableHeaderCell, { width: c.width }, c.align ? { textAlign: c.align } : {}]}
          >
            {c.label}
          </Text>
        ))}
      </View>

      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', color: '#888' }]}>
            {emptyMessage}
          </Text>
        </View>
      ) : (
        rows.map((r, idx) => (
          <View
            key={`${r.certificate_number}-${idx}`}
            style={[styles.tableRow, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#FFFFFF' }]}
            wrap={false}
          >
            {cols.map(c => (
              <Text
                key={c.key}
                style={[
                  styles.tableCell,
                  { width: c.width },
                  c.align ? { textAlign: c.align } : {},
                  c.key === 'status'
                    ? { color: r.is_rejected ? RED : GREEN, fontWeight: 700 }
                    : {},
                ]}
              >
                {cellText(r, c.key)}
              </Text>
            ))}
          </View>
        ))
      )}

      {rows.length > 0 ? (
        <View style={styles.totalRow}>
          {cols.map(c => (
            <Text
              key={c.key}
              style={[styles.totalCell, { width: c.width }, c.align ? { textAlign: c.align } : {}]}
            >
              {totalText(c.key, totals)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/pdf/reports/cert-appendix-table.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pdf/reports/cert-appendix-table.tsx src/components/pdf/reports/cert-appendix-table.test.ts
git commit -m "feat(reports): cert appendix table with Status + MT columns, PSS variant"
```

---

### Task 4: Unified performance report PDF template

The two-page-per-bucket template with adaptive donut layout. Chart panels are `wrap={false}` so react-pdf can never split one across pages (kills the double-pagination bug); the footer uses react-pdf's `pageNumber`/`totalPages` render prop so appendix overflow pages number correctly.

**Files:**
- Create: `src/components/pdf/reports/performance-report.tsx`
- Create: `src/components/pdf/reports/performance-report.test.ts`

**Interfaces:**
- Consumes: `PerformanceReportData`, `PerformanceBucket`, `RegionRow` from `@/lib/reports/performance-data`; `CertAppendixTable` from `./cert-appendix-table`; existing charts (`DonutChart`, `VerticalGroupedBarChart`, `HorizontalBarChart`, `SankeyChart`).
- Produces (used by Task 5):

```ts
export function chartRowLayout(importerCount: number, exporterCount: number): { importer: 'donut' | 'bars' | 'none'; exporter: 'donut' | 'bars'; reasonsInRow: boolean }
export function PerformanceReport(props: { data: PerformanceReportData; wolthersLogoBase64?: string; clientLogoBase64?: string; flagBase64?: string }): JSX.Element
```

The template renders pages for whichever buckets are non-null on `data` (`pss` first, then `ss`).

- [ ] **Step 1: Write the failing test**

Create `src/components/pdf/reports/performance-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { PerformanceReport, chartRowLayout } from './performance-report'
import type { PerformanceReportData, PerformanceBucket } from '@/lib/reports/performance-data'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'

describe('chartRowLayout', () => {
  it('single importer → donut + reasons join the row', () => {
    expect(chartRowLayout(1, 5)).toEqual({ importer: 'donut', exporter: 'bars', reasonsInRow: true })
  })
  it('single exporter → exporter donut', () => {
    expect(chartRowLayout(4, 1)).toEqual({ importer: 'bars', exporter: 'donut', reasonsInRow: true })
  })
  it('both multi → 2-up bars, reasons full-width below', () => {
    expect(chartRowLayout(3, 4)).toEqual({ importer: 'bars', exporter: 'bars', reasonsInRow: false })
  })
  it('both single → one combined donut (no duplicate)', () => {
    expect(chartRowLayout(1, 1)).toEqual({ importer: 'none', exporter: 'donut', reasonsInRow: true })
  })
})

const bucket = (over: Partial<PerformanceBucket> = {}): PerformanceBucket => ({
  totals: { evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33, bagsApproved: 666, mtApproved: 40.0 },
  byImporter: [{ name: 'Ahold', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, rejectionRate: 33 }],
  byExporter: [
    { name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, rejectionRate: 50 },
    { name: 'Ofi', approvedCount: 1, rejectedCount: 0, approvedBags: 333, rejectedBags: 0, rejectionRate: 0 },
  ],
  rejectionReasons: [{ category: 'Cupping faults', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 2, bags: 666, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 333, pct: 100 }],
  rows: [
    {
      approval_date: '2026-06-02T00:00:00Z', certificate_number: 'SAX-011690/26',
      exporter_name: 'Cooxupe', seller_name: 'Cooxupe', importer_name: 'Ahold',
      importer_contract_nr: 'IR0007351-1', roaster_name: 'Unsold', container_nr: 'MSBU 286.641-9',
      ico_marks: '002/1848/1751', bags: 333, mt: 20.0, is_rejected: false, region: 'Cerrado',
    },
    {
      approval_date: '2026-06-03T00:00:00Z', certificate_number: 'SAX-011691/26',
      exporter_name: 'Ofi', seller_name: 'Ofi', importer_name: 'Ahold',
      importer_contract_nr: 'IR0007352-1', roaster_name: 'Unsold', container_nr: null,
      ico_marks: null, bags: 333, mt: 20.0, is_rejected: true, region: 'Cerrado',
    },
  ],
  ...over,
})

const base = (over: Partial<PerformanceReportData> = {}): PerformanceReportData => ({
  client: { id: 'c', name: 'Ahold', logo_url: null, is_roaster: true, sankey_type: 'roaster' },
  period: { start_date: '2026-06-01T00:00:00Z', end_date: '2026-07-01T00:00:00Z', issued_at: '2026-07-06T00:00:00Z' },
  origin: 'Brazil',
  pss: bucket(),
  ss: bucket(),
  sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
  sankeyColumns: ['Shipper', 'Seller', 'Importer'],
  showSankey: true,
  ...over,
})

describe('PerformanceReport', () => {
  it('renders SS+PSS (4 pages) with Sankey', async () => {
    const buf = await renderToBuffer(React.createElement(PerformanceReport, { data: base() }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders PSS-only', async () => {
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ ss: null, sankey: null, sankeyColumns: [], showSankey: false }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders SS-only with an empty bucket', async () => {
    const empty = bucket({
      totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0, mtApproved: 0 },
      byImporter: [], byExporter: [], rejectionReasons: [], approvedByRegion: [], rejectedByRegion: [], rows: [],
    })
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ pss: null, ss: empty, showSankey: false }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/reports/performance-report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/pdf/reports/performance-report.tsx`**

Full file:

```tsx
/**
 * Unified performance report — A4 landscape. Renders a two-page pair per
 * requested bucket (PSS first, then SS):
 *   Page A: KPI band + charts. Adaptive: when a side (importer/exporter)
 *           has exactly one company it collapses to a compact donut and
 *           Rejection Reasons joins the row 3-up. Chart panels never wrap.
 *   Page B: approved/rejected by-region tables, conditional SS Sankey,
 *           and the all-certs appendix (Status + Bags + MT columns).
 * Powers the SS, PSS and SS+PSS reports.
 *
 * Inter font is registered globally by certificate-styles.ts.
 */
import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { PerformanceReportData, PerformanceBucket, RegionRow } from '@/lib/reports/performance-data'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { DonutChart } from '@/components/pdf/charts/donut-chart'
import { VerticalGroupedBarChart, type GroupedBarCategory } from '@/components/pdf/charts/vertical-grouped-bar-chart'
import { CertAppendixTable } from './cert-appendix-table'

const GREEN = '#556b2f'
const RED = '#ef4444'
const GRAY_BORDER = '#e3e3e3'

export type BucketKind = 'PSS' | 'SS'

export interface ChartRowLayout {
  importer: 'donut' | 'bars' | 'none'
  exporter: 'donut' | 'bars'
  reasonsInRow: boolean
}

/**
 * Decide the Page-A chart row shape. A side with exactly one company is a
 * redundant single bar pair → compact donut. When BOTH sides are single the
 * two donuts would be identical, so only one combined donut renders.
 */
export function chartRowLayout(importerCount: number, exporterCount: number): ChartRowLayout {
  const importerDonut = importerCount === 1
  const exporterDonut = exporterCount === 1
  if (importerDonut && exporterDonut) {
    return { importer: 'none', exporter: 'donut', reasonsInRow: true }
  }
  return {
    importer: importerDonut ? 'donut' : 'bars',
    exporter: exporterDonut ? 'donut' : 'bars',
    reasonsInRow: importerDonut || exporterDonut,
  }
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, padding: 24, paddingBottom: 32, backgroundColor: '#FFFFFF' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, minHeight: 50 },
  headerLeft: { width: '20%', justifyContent: 'center', alignItems: 'flex-start' },
  headerCenter: { width: '60%', justifyContent: 'center', alignItems: 'center' },
  headerRight: { width: '20%', justifyContent: 'center', alignItems: 'flex-end' },
  flagImage: { width: 56, height: 38, objectFit: 'contain' },
  wolthersLogo: { width: 130, height: 26, objectFit: 'contain' },
  clientLogo: { maxWidth: 100, maxHeight: 36, objectFit: 'contain' },
  generationDate: { fontSize: 8, color: '#666', marginTop: 4 },
  titleBar: {
    backgroundColor: GREEN, color: '#FFFFFF', paddingVertical: 6, paddingHorizontal: 10,
    fontWeight: 700, fontSize: 10, marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: '#222', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, marginTop: 4,
  },
  kpiBand: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F2',
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, marginBottom: 12,
  },
  kpiItem: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  kpiValue: { fontSize: 13, fontWeight: 700, color: '#222' },
  kpiLabel: { fontSize: 7.5, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3 },
  kpiDivider: { width: 1, height: 16, backgroundColor: '#D9D9D6' },
  pageFooter: {
    position: 'absolute', bottom: 12, left: 24, right: 24,
    flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#999',
  },
  panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 12, marginBottom: 12 },
  chartsRow: { flexDirection: 'row', gap: 16 },
  chartFlex: { flex: 1 },
  donutSlot: { width: 150, alignItems: 'center' },
  twoCol: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  regionPanel: { flex: 1, borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 10 },
  regionHead: { flexDirection: 'row', backgroundColor: '#F4F4F2', paddingVertical: 4, paddingHorizontal: 6 },
  regionRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  regionTotal: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#F4F4F2' },
  rCell: { fontSize: 8, color: '#222' },
  rHeadCell: { fontSize: 7.5, fontWeight: 700, color: '#555', textTransform: 'uppercase' },
})

function metricCats(groups: PerformanceBucket['byImporter'], metric: 'count' | 'bags'): GroupedBarCategory[] {
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
          <Text style={[styles.rCell, { flex: 1 }]}>{r.count} - {r.region}</Text>
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
  data: PerformanceReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

export function PerformanceReport({ data, wolthersLogoBase64, clientLogoBase64, flagBase64 }: Props) {
  const formatShortDate = (iso: string) => { const d = new Date(iso); return `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')}` }
  const formatIssuedAt = (iso: string) => { const d = new Date(iso); return `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}` }
  const displayEnd = new Date(new Date(data.period.end_date).getTime() - 86400000)
  const range = `${formatShortDate(data.period.start_date)} – ${formatShortDate(displayEnd.toISOString())}`

  const Header = (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        {flagBase64 ? <Image src={flagBase64} style={styles.flagImage} /> : null}
      </View>
      <View style={styles.headerCenter}>
        {wolthersLogoBase64 ? (
          <Image src={wolthersLogoBase64} style={styles.wolthersLogo} />
        ) : (
          <Text style={{ fontSize: 14, fontWeight: 700 }}>WOLTHERS ASSOCIATES</Text>
        )}
      </View>
      <View style={styles.headerRight}>
        {clientLogoBase64 ? (
          <Image src={clientLogoBase64} style={styles.clientLogo} />
        ) : (
          <Text style={{ fontSize: 12, fontWeight: 700 }}>{data.client.name}</Text>
        )}
        <Text style={styles.generationDate}>{formatIssuedAt(data.period.issued_at)}</Text>
      </View>
    </View>
  )

  const Footer = (sectionLabel: string) => (
    <View style={styles.pageFooter} fixed>
      <Text>Wolthers & Associates · Quality Control</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} · ${sectionLabel}`} />
      <Text>Generated {formatIssuedAt(data.period.issued_at)}</Text>
    </View>
  )

  const rateColor = (r: number) => (r === 0 ? GREEN : r <= 10 ? '#a9a454' : RED)
  const reasonRows = (b: PerformanceBucket) =>
    b.rejectionReasons.filter(r => r.category !== 'Other').map(r => ({ label: r.category, value: r.count }))

  const KpiBand = ({ b, kind }: { b: PerformanceBucket; kind: BucketKind }) => {
    const items: { label: string; value: string | number; color?: string }[] = [
      { label: 'Certs', value: b.totals.evaluated },
      { label: 'Approved', value: b.totals.approved, color: GREEN },
      { label: 'Rejected', value: b.totals.rejected, color: b.totals.rejected > 0 ? RED : '#222' },
      { label: 'Rej. rate', value: `${b.totals.rejectionRate}%`, color: rateColor(b.totals.rejectionRate) },
    ]
    if (kind === 'SS') {
      items.push({ label: 'Bags', value: b.totals.bagsApproved.toLocaleString('en-US') })
      items.push({ label: 'MT', value: b.totals.mtApproved.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
    }
    return (
      <View style={styles.kpiBand}>
        {items.map((it, i) => (
          <React.Fragment key={it.label}>
            {i > 0 && <View style={styles.kpiDivider} />}
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiValue, it.color ? { color: it.color } : {}]}>{it.value}</Text>
              <Text style={styles.kpiLabel}>{it.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    )
  }

  const StatusDonut = ({ b, title }: { b: PerformanceBucket; title: string }) => (
    <View style={styles.donutSlot}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <DonutChart
        slices={[
          { label: 'Approved', value: b.totals.approved, color: GREEN },
          { label: 'Rejected', value: b.totals.rejected, color: RED },
        ]}
        size={100}
        centerValue={`${b.totals.rejectionRate}%`}
        centerLabel="REJ. RATE"
      />
    </View>
  )

  // Page A: KPI band + adaptive chart row. Panels never wrap across pages.
  const ChartsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => {
    const layout = chartRowLayout(b.byImporter.length, b.byExporter.length)
    const barWidth = layout.reasonsInRow ? 330 : 360
    return (
      <>
        <KpiBand b={b} kind={kind} />
        <View style={styles.panel} wrap={false}>
          <View style={styles.chartsRow}>
            {layout.importer === 'donut' && (
              <StatusDonut b={b} title={`Importer ${kind} · ${b.byImporter[0]?.name ?? ''}`} />
            )}
            {layout.importer === 'bars' && (
              <View style={styles.chartFlex}>
                <Text style={styles.sectionLabel}>Importer {kind}</Text>
                <VerticalGroupedBarChart categories={metricCats(b.byImporter, metric)} metric={metric} width={barWidth} />
              </View>
            )}
            {layout.exporter === 'donut' ? (
              <StatusDonut
                b={b}
                title={layout.importer === 'none' ? `Total ${kind}` : `Exporter ${kind} · ${b.byExporter[0]?.name ?? ''}`}
              />
            ) : (
              <View style={styles.chartFlex}>
                <Text style={styles.sectionLabel}>Exporter {kind}</Text>
                <VerticalGroupedBarChart categories={metricCats(b.byExporter, metric)} metric={metric} width={barWidth} />
              </View>
            )}
            {layout.reasonsInRow && reasonRows(b).length > 0 && (
              <View style={styles.chartFlex}>
                <Text style={styles.sectionLabel}>Rejection reasons</Text>
                <HorizontalBarChart rows={reasonRows(b)} labelWidth={90} trackWidth={130} limit={6} chartColor={RED} />
              </View>
            )}
          </View>
        </View>
        {!layout.reasonsInRow && reasonRows(b).length > 0 && (
          <View style={styles.panel} wrap={false}>
            <Text style={styles.sectionLabel}>Rejection reasons</Text>
            <HorizontalBarChart rows={reasonRows(b)} labelWidth={140} trackWidth={420} limit={10} chartColor={RED} />
          </View>
        )}
      </>
    )
  }

  // Page B: region tables (+ SS Sankey) + all-certs appendix.
  const CertsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => (
    <>
      <View style={styles.twoCol}>
        <RegionTable title="Approved certificates" rows={b.approvedByRegion} metric={metric} accent={GREEN} />
        <RegionTable title="Rejected certificates" rows={b.rejectedByRegion} metric={metric} accent={RED} />
      </View>
      {kind === 'SS' && data.showSankey && data.sankey && (
        <View style={styles.panel} wrap={false}>
          <Text style={styles.sectionLabel}>Supply chain flow</Text>
          <SankeyChart layout={data.sankey} columnLabels={data.sankeyColumns} />
        </View>
      )}
      <CertAppendixTable
        rows={b.rows}
        totals={{ certificate_count: b.totals.approved, bag_count: b.totals.bagsApproved, mt: b.totals.mtApproved }}
        hideRoasterCol={data.client.is_roaster}
        hideContainerCol={kind === 'PSS'}
        emptyMessage={`No ${kind} certificates issued in this period.`}
      />
    </>
  )

  const BucketPages = ({ b, kind }: { b: PerformanceBucket; kind: BucketKind }) => {
    const metric: 'count' | 'bags' = kind === 'SS' ? 'bags' : 'count'
    const title = kind === 'PSS' ? 'Pre-Shipment Samples' : 'Shipment Samples'
    return (
      <>
        <Page size="A4" orientation="landscape" style={styles.page}>
          {Header}
          <Text style={styles.titleBar}>{title} · {range}</Text>
          <ChartsPage b={b} metric={metric} kind={kind} />
          {Footer(`${title}`)}
        </Page>
        <Page size="A4" orientation="landscape" style={styles.page}>
          {Header}
          <Text style={styles.titleBar}>{title} · Certificates · {range}</Text>
          <CertsPage b={b} metric={metric} kind={kind} />
          {Footer(`${title} · Certificates`)}
        </Page>
      </>
    )
  }

  return (
    <Document>
      {data.pss && <BucketPages b={data.pss} kind="PSS" />}
      {data.ss && <BucketPages b={data.ss} kind="SS" />}
    </Document>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/pdf/reports/performance-report.test.ts && npx tsc --noEmit`
Expected: PASS. If react-pdf rejects `<BucketPages>` as a Document child (it requires Page children and may not resolve custom components/fragments), inline the pages instead: change the `Document` return to call `BucketPages` as a plain function returning a fragment — `{data.pss && BucketPages({ b: data.pss, kind: 'PSS' })}` — which yields `<Page>` elements directly.

- [ ] **Step 5: Commit**

```bash
git add src/components/pdf/reports/performance-report.tsx src/components/pdf/reports/performance-report.test.ts
git commit -m "feat(reports): unified performance PDF template with adaptive donut layout"
```

---

### Task 5: Generator, shared route handlers, and the six API routes

One generator + two shared handlers replace the per-report route bodies. Existing URLs keep working; `/api/reports/pss` is new.

**Files:**
- Create: `src/lib/reports/performance-generator.ts`
- Create: `src/lib/reports/report-routes.ts`
- Create: `src/app/api/reports/pss/route.ts`
- Create: `src/app/api/reports/pss/send/route.ts`
- Modify: `src/app/api/reports/weekly-ss/route.ts` (replace body)
- Modify: `src/app/api/reports/weekly-ss/send/route.ts` (replace body)
- Modify: `src/app/api/reports/biweekly/route.ts` (replace body)
- Modify: `src/app/api/reports/biweekly/send/route.ts` (replace body)
- Modify: `src/lib/reports/recipients.ts` (add `'pss'` to `VALID_REPORT_TYPES`)

**Interfaces:**
- Consumes: `getPerformanceReportData`, `PerformanceReportData`, `ReportBucketKey` from `@/lib/reports/performance-data`; `PerformanceReport` from `@/components/pdf/reports/performance-report`; `sendMail`, `GraphSendError` from `@/lib/graph/send`; `saveRecipients` from `@/lib/reports/recipients`; `composeBodyHtml` from `@/lib/email/compose-html`; `getCountryCodeFromOrigin`, `getFlagPath` from `@/lib/country-flags`.
- Produces:

```ts
// performance-generator.ts
export interface GeneratedPerformanceReport { pdfBuffer: Buffer; filename: string; data: PerformanceReportData }
export async function generatePerformanceReport(supabase: SupabaseClient, params: { clientId: string; startDate: string; endDate: string; buckets: ReportBucketKey[]; filenameLabel: string }): Promise<GeneratedPerformanceReport | null>

// report-routes.ts
export interface ReportRouteConfig { buckets: ReportBucketKey[]; filenameLabel: string; reportType: string; subjectLabel: string }
export async function handleReportGet(request: NextRequest, config: ReportRouteConfig): Promise<NextResponse>
export async function handleReportSend(request: NextRequest, config: ReportRouteConfig): Promise<NextResponse>
```

- [ ] **Step 1: Create `src/lib/reports/performance-generator.ts`**

Full file (asset loading copied from the biweekly generator — same logo/flag/client-logo pipeline):

```ts
/**
 * Performance report generator (SS / PSS / SS+PSS).
 *
 * Shared by the download endpoints (inline PDF) and the email-send endpoints
 * (Graph attachment) so routes can't drift on asset loading, filename format,
 * or data fetching.
 */

import React from 'react'
import fs from 'fs'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PerformanceReport } from '@/components/pdf/reports/performance-report'
import {
  getPerformanceReportData,
  type PerformanceReportData,
  type ReportBucketKey,
} from '@/lib/reports/performance-data'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'

export interface GeneratedPerformanceReport {
  pdfBuffer: Buffer
  filename: string
  data: PerformanceReportData
}

export async function generatePerformanceReport(
  supabase: SupabaseClient,
  params: {
    clientId: string
    startDate: string
    endDate: string
    buckets: ReportBucketKey[]
    /** Filename prefix: 'SS' | 'PSS' | 'SS-PSS'. */
    filenameLabel: string
  },
): Promise<GeneratedPerformanceReport | null> {
  const data = await getPerformanceReportData(supabase, {
    clientId: params.clientId,
    startDate: params.startDate,
    endDate: params.endDate,
    buckets: params.buckets,
  })
  if (!data) return null

  // Wolthers logo — read from public/ at request time.
  let wolthersLogoBase64: string | undefined
  try {
    const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
    const logoBuffer = fs.readFileSync(logoPath)
    wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
  } catch (err) {
    console.error('[report] Failed to load Wolthers logo:', err)
  }

  // Country flag for the dominant origin. Missing flag is non-fatal.
  let flagBase64: string | undefined
  const countryCode = data.origin ? getCountryCodeFromOrigin(data.origin) : null
  if (countryCode) {
    try {
      const flagRelativePath = getFlagPath(countryCode)
      const flagPath = path.join(process.cwd(), 'public', flagRelativePath)
      const flagBuffer = fs.readFileSync(flagPath)
      flagBase64 = `data:image/png;base64,${flagBuffer.toString('base64')}`
    } catch (err) {
      console.error('[report] Failed to load flag:', err)
    }
  }

  // Client logo from their hosted URL (Supabase storage usually).
  let clientLogoBase64: string | undefined
  if (data.client.logo_url) {
    try {
      const res = await fetch(data.client.logo_url)
      if (res.ok) {
        const arr = await res.arrayBuffer()
        const ct = res.headers.get('content-type') || 'image/png'
        clientLogoBase64 = `data:${ct};base64,${Buffer.from(arr).toString('base64')}`
      }
    } catch (err) {
      console.error('[report] Failed to load client logo:', err)
    }
  }

  const element = React.createElement(PerformanceReport, {
    data,
    wolthersLogoBase64,
    clientLogoBase64,
    flagBase64,
  })
  const pdfBuffer = await renderToBuffer(element as any)

  // Filename: "{LABEL}-Report_{Client}_{YYYY-MM-DD}_to_{YYYY-MM-DD}.pdf"
  const sanitize = (s: string) => s.replace(/[^\w-]/g, '_').replace(/_+/g, '_')
  const clientSlug = sanitize(data.client.name)
  const startSlug = params.startDate.slice(0, 10)
  const endSlug = params.endDate.slice(0, 10)
  const filename = `${params.filenameLabel}-Report_${clientSlug}_${startSlug}_to_${endSlug}.pdf`

  return { pdfBuffer: Buffer.from(pdfBuffer), filename, data }
}
```

- [ ] **Step 2: Create `src/lib/reports/report-routes.ts`**

Full file — the GET body is ported from `src/app/api/reports/biweekly/route.ts`, the send body from `src/app/api/reports/biweekly/send/route.ts`, both parameterized:

```ts
/**
 * Shared HTTP handlers for the SS / PSS / SS+PSS report routes.
 *
 * Kept in lib/ because Next.js route files may only export HTTP verbs.
 * Each route file calls these with its ReportRouteConfig, so the six
 * period-report endpoints share one implementation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generatePerformanceReport } from '@/lib/reports/performance-generator'
import type { ReportBucketKey } from '@/lib/reports/performance-data'
import { sendMail, GraphSendError } from '@/lib/graph/send'
import { saveRecipients } from '@/lib/reports/recipients'
import { composeBodyHtml } from '@/lib/email/compose-html'

export interface ReportRouteConfig {
  buckets: ReportBucketKey[]
  /** Filename prefix: 'SS' | 'PSS' | 'SS-PSS'. */
  filenameLabel: string
  /** report_recipients key: 'weekly_ss' | 'pss' | 'biweekly'. */
  reportType: string
  /** Human label for subjects/cover notes: 'SS Report' | 'PSS Report' | 'SS+PSS Report'. */
  subjectLabel: string
}

const DEFAULT_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX ?? 'qualitycontrol@wolthers.com'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmails(input: unknown, field: string): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, emails: [] }
  if (!Array.isArray(input)) return { ok: false, error: `${field} must be an array of email strings` }
  const emails: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') return { ok: false, error: `${field} entries must be strings` }
    const trimmed = v.trim()
    if (!trimmed) continue
    if (!EMAIL_RE.test(trimmed)) return { ok: false, error: `Invalid email in ${field}: ${trimmed}` }
    emails.push(trimmed)
  }
  return { ok: true, emails }
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

/** GET ?client_id&start_date&end_date → inline PDF stream. */
export async function handleReportGet(request: NextRequest, config: ReportRouteConfig): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const clientId = sp.get('client_id')
    const startDate = sp.get('start_date')
    const endDate = sp.get('end_date')

    if (!clientId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'client_id, start_date, end_date are required' },
        { status: 400 }
      )
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (start >= end) {
      return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
    }

    const report = await generatePerformanceReport(supabase, {
      clientId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      buckets: config.buckets,
      filenameLabel: config.filenameLabel,
    })

    if (!report) {
      return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(report.pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${report.filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error(`Error in GET report (${config.reportType}):`, error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Failed to generate report: ${message}` },
      { status: 500 },
    )
  }
}

/** POST { client_id, start_date, end_date, to, cc?, bcc?, subject?, body? } → Graph email. */
export async function handleReportSend(request: NextRequest, config: ReportRouteConfig): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { client_id, start_date, end_date, subject: subjectIn, body: bodyIn } = body

    if (!client_id || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'client_id, start_date, end_date are required' },
        { status: 400 }
      )
    }

    const start = new Date(start_date)
    const end = new Date(end_date)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    const toResult = validateEmails(body.to, 'to')
    if (!toResult.ok) return NextResponse.json({ error: toResult.error }, { status: 400 })
    if (toResult.emails.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required in "to"' }, { status: 400 })
    }
    const ccResult = validateEmails(body.cc, 'cc')
    if (!ccResult.ok) return NextResponse.json({ error: ccResult.error }, { status: 400 })
    const bccResult = validateEmails(body.bcc, 'bcc')
    if (!bccResult.ok) return NextResponse.json({ error: bccResult.error }, { status: 400 })

    // Sender profile → "on behalf of" + signature.
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name, email, email_signature_html')
      .eq('id', user.id)
      .single()

    const senderEmail = profile?.email || user.email || undefined
    const senderName = profile?.full_name || senderEmail || undefined
    const signatureHtml: string | null = profile?.email_signature_html ?? null

    const report = await generatePerformanceReport(supabase, {
      clientId: client_id,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      buckets: config.buckets,
      filenameLabel: config.filenameLabel,
    })
    if (!report) {
      return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })
    }

    const periodLabel = `${formatDateLabel(start.toISOString())} – ${formatDateLabel(new Date(end.getTime() - 86400000).toISOString())}`
    const subject = (typeof subjectIn === 'string' && subjectIn.trim().length > 0)
      ? subjectIn.trim()
      : `${report.data.client.name} · ${config.subjectLabel} · ${periodLabel}`
    const bodyText = (typeof bodyIn === 'string' && bodyIn.trim().length > 0)
      ? bodyIn
      : `Hello,\n\nPlease find attached the ${config.subjectLabel} for ${report.data.client.name} covering ${periodLabel}.\n\nBest regards,\n${senderName ?? 'Quality Control'}\nWolthers & Associates`

    // Always auto-CC the mailbox (LOCKED house rule); dedup case-insensitively.
    const userCcLower = new Set(ccResult.emails.map(e => e.toLowerCase()))
    const ccWithMailbox = userCcLower.has(DEFAULT_MAILBOX.toLowerCase())
      ? ccResult.emails
      : [...ccResult.emails, DEFAULT_MAILBOX]

    const bodyHtml = composeBodyHtml(bodyText, signatureHtml)

    try {
      await sendMail({
        mailbox: DEFAULT_MAILBOX,
        to: toResult.emails,
        cc: ccWithMailbox,
        bcc: bccResult.emails.length > 0 ? bccResult.emails : undefined,
        subject,
        bodyText,
        bodyHtml,
        senderEmail,
        senderName,
        attachments: [
          {
            name: report.filename,
            contentType: 'application/pdf',
            bytes: new Uint8Array(report.pdfBuffer),
          },
        ],
      })
    } catch (err) {
      if (err instanceof GraphSendError) {
        console.error('[reports.send] Graph send failed:', err.status, err.graphCode, err.details)
        return NextResponse.json(
          { error: 'Email send failed', details: err.message, graph_code: err.graphCode },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
        )
      }
      throw err
    }

    // Persist the chosen recipients (not the auto-CC mailbox). Non-fatal.
    await saveRecipients(supabase, {
      clientId: client_id,
      reportType: config.reportType,
      userId: user.id,
      to: toResult.emails,
      cc: ccResult.emails,
      bcc: bccResult.emails,
    })

    return NextResponse.json({
      success: true,
      sent_to: toResult.emails,
      cc: ccWithMailbox,
      bcc: bccResult.emails,
      filename: report.filename,
      mailbox: DEFAULT_MAILBOX,
      sender: senderEmail,
    })
  } catch (error) {
    console.error(`Error in POST report send (${config.reportType}):`, error)
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Rewrite the four existing route files and create the two PSS routes**

Replace the ENTIRE content of `src/app/api/reports/weekly-ss/route.ts`:

```ts
/**
 * GET /api/reports/weekly-ss?client_id=...&start_date=...&end_date=...
 * Streams the SS Report PDF (SS bucket of the unified performance engine).
 * URL kept for backwards compatibility with saved links.
 */
import { NextRequest } from 'next/server'
import { handleReportGet } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['ss' as const], filenameLabel: 'SS', reportType: 'weekly_ss', subjectLabel: 'SS Report' }

export async function GET(request: NextRequest) {
  return handleReportGet(request, CONFIG)
}
```

Replace the ENTIRE content of `src/app/api/reports/weekly-ss/send/route.ts`:

```ts
/**
 * POST /api/reports/weekly-ss/send — emails the SS Report PDF via Graph.
 */
import { NextRequest } from 'next/server'
import { handleReportSend } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['ss' as const], filenameLabel: 'SS', reportType: 'weekly_ss', subjectLabel: 'SS Report' }

export async function POST(request: NextRequest) {
  return handleReportSend(request, CONFIG)
}
```

Replace the ENTIRE content of `src/app/api/reports/biweekly/route.ts`:

```ts
/**
 * GET /api/reports/biweekly?client_id=...&start_date=...&end_date=...
 * Streams the SS+PSS Report PDF (both buckets of the unified engine).
 * URL kept for backwards compatibility with saved links.
 */
import { NextRequest } from 'next/server'
import { handleReportGet } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const, 'ss' as const], filenameLabel: 'SS-PSS', reportType: 'biweekly', subjectLabel: 'SS+PSS Report' }

export async function GET(request: NextRequest) {
  return handleReportGet(request, CONFIG)
}
```

Replace the ENTIRE content of `src/app/api/reports/biweekly/send/route.ts`:

```ts
/**
 * POST /api/reports/biweekly/send — emails the SS+PSS Report PDF via Graph.
 */
import { NextRequest } from 'next/server'
import { handleReportSend } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const, 'ss' as const], filenameLabel: 'SS-PSS', reportType: 'biweekly', subjectLabel: 'SS+PSS Report' }

export async function POST(request: NextRequest) {
  return handleReportSend(request, CONFIG)
}
```

Create `src/app/api/reports/pss/route.ts`:

```ts
/**
 * GET /api/reports/pss?client_id=...&start_date=...&end_date=...
 * Streams the PSS Report PDF (PSS bucket of the unified engine).
 */
import { NextRequest } from 'next/server'
import { handleReportGet } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const], filenameLabel: 'PSS', reportType: 'pss', subjectLabel: 'PSS Report' }

export async function GET(request: NextRequest) {
  return handleReportGet(request, CONFIG)
}
```

Create `src/app/api/reports/pss/send/route.ts`:

```ts
/**
 * POST /api/reports/pss/send — emails the PSS Report PDF via Graph.
 */
import { NextRequest } from 'next/server'
import { handleReportSend } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const], filenameLabel: 'PSS', reportType: 'pss', subjectLabel: 'PSS Report' }

export async function POST(request: NextRequest) {
  return handleReportSend(request, CONFIG)
}
```

- [ ] **Step 4: Allow `pss` as a recipients report type**

In `src/lib/reports/recipients.ts` change:

```ts
export const VALID_REPORT_TYPES = new Set(['weekly_ss', 'biweekly', 'monthly', 'annual'])
```

to:

```ts
export const VALID_REPORT_TYPES = new Set(['weekly_ss', 'pss', 'biweekly', 'monthly', 'annual'])
```

- [ ] **Step 5: Typecheck + full test run**

Run: `npx tsc --noEmit && npm run test:run`
Expected: no type errors, all tests pass (old weekly/biweekly modules still compile — they're deleted in Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/performance-generator.ts src/lib/reports/report-routes.ts src/app/api/reports/pss src/app/api/reports/weekly-ss src/app/api/reports/biweekly src/lib/reports/recipients.ts
git commit -m "feat(reports): unified generator + shared route handlers, new /api/reports/pss"
```

---

### Task 6: Reports page UI — four cards, shared presets, PSS kind

**Files:**
- Modify: `src/lib/reports/periods.ts` (move work-week helpers here from the page)
- Modify: `src/lib/reports/periods.test.ts` (cover the moved helpers)
- Create: `src/components/reports/period-report-card.tsx`
- Modify: `src/components/reports/preview-report-modal.tsx` (add `PSS_KIND`, relabel, extend `reportType` union)
- Modify: `src/app/dashboard/reports/page.tsx` (rewrite with 4 cards)

**Interfaces:**
- Consumes: `firstHalf`, `secondHalf`, `previousHalfMonth` from `@/lib/reports/periods`; `ReportKind` from `preview-report-modal`.
- Produces:

```ts
// periods.ts additions — `today` injectable for deterministic tests
export function getCurrentWorkWeek(today?: Date): { start: string; end: string }
export function getPreviousWorkWeek(today?: Date): { start: string; end: string }

// period-report-card.tsx
export function PeriodReportCard(props: {
  title: string
  description: string
  defaultStart: string
  defaultEnd: string
  disabled: boolean
  onPreview: (start: string, end: string) => void
}): JSX.Element

// preview-report-modal.tsx additions
export const PSS_KIND: ReportKind  // { reportType: 'pss', previewEndpoint: '/api/reports/pss', sendEndpoint: '/api/reports/pss/send', label: 'PSS Report' }
```

- [ ] **Step 1: Write the failing test for the moved period helpers**

Append to `src/lib/reports/periods.test.ts` (existing file — keep its current tests):

```ts
import { getCurrentWorkWeek, getPreviousWorkWeek } from './periods'

describe('work-week helpers', () => {
  // Wed Jul 1 2026, noon UTC — deterministic regardless of runner clock.
  const wednesday = new Date('2026-07-01T12:00:00Z')

  it('current work week is the surrounding Mon–Fri', () => {
    expect(getCurrentWorkWeek(wednesday)).toEqual({ start: '2026-06-29', end: '2026-07-03' })
  })
  it('previous work week is the Mon–Fri before', () => {
    expect(getPreviousWorkWeek(wednesday)).toEqual({ start: '2026-06-22', end: '2026-06-26' })
  })
  it('Sunday belongs to the week that started the previous Monday', () => {
    const sunday = new Date('2026-07-05T12:00:00Z')
    expect(getCurrentWorkWeek(sunday)).toEqual({ start: '2026-06-29', end: '2026-07-03' })
  })
})
```

(Adjust the top of the file so `describe/it/expect` imports from vitest cover the appended block — they already do.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/periods.test.ts`
Expected: FAIL — `getCurrentWorkWeek` not exported.

- [ ] **Step 3: Move the work-week helpers into `src/lib/reports/periods.ts`**

Append to `periods.ts` (moved from `src/app/dashboard/reports/page.tsx:345-369` with an injectable `today` for deterministic tests; UTC date math so the result can't drift across the runner's timezone/midnight):

```ts
// --- Work-week helpers ---
// "Work week" = Monday through Friday — the weekly reports were always cut
// on Friday for the just-completed Mon–Fri block. `today` is injectable for
// tests; date math is done in UTC on the ISO date so results are stable
// across timezones.

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getCurrentWorkWeek(today: Date = new Date()): { start: string; end: string } {
  const d = new Date(today)
  const day = d.getUTCDay() // 0=Sun, 1=Mon, ...
  const offsetToMonday = day === 0 ? -6 : -(day - 1)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + offsetToMonday)
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)
  return { start: toIsoDate(monday), end: toIsoDate(friday) }
}

export function getPreviousWorkWeek(today: Date = new Date()): { start: string; end: string } {
  const { start } = getCurrentWorkWeek(today)
  const thisMonday = new Date(start)
  const prevMonday = new Date(thisMonday)
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7)
  const prevFriday = new Date(prevMonday)
  prevFriday.setUTCDate(prevMonday.getUTCDate() + 4)
  return { start: toIsoDate(prevMonday), end: toIsoDate(prevFriday) }
}
```

Run: `npx vitest run src/lib/reports/periods.test.ts` — Expected: PASS.

- [ ] **Step 4: Create `src/components/reports/period-report-card.tsx`**

Full file:

```tsx
'use client'

/**
 * One period-report generator card (SS / PSS / SS+PSS). Owns its own
 * start/end date pair and shows the four shared presets: Last week,
 * This week (Mon–Fri), 1st half (1–15), 2nd half (16–end).
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { FileText, Calendar, Eye } from 'lucide-react'
import {
  firstHalf,
  secondHalf,
  getCurrentWorkWeek,
  getPreviousWorkWeek,
} from '@/lib/reports/periods'

interface PeriodReportCardProps {
  title: string
  description: string
  defaultStart: string
  defaultEnd: string
  /** True while no client is selected — disables the preview button. */
  disabled: boolean
  onPreview: (start: string, end: string) => void
}

export function PeriodReportCard({
  title,
  description,
  defaultStart,
  defaultEnd,
  disabled,
  onPreview,
}: PeriodReportCardProps) {
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)

  const applyRange = (r: { start: string; end: string }) => {
    setStart(r.start)
    setEnd(r.end)
  }
  // Half-month presets operate on the month of the card's current start date.
  const applyHalf = (half: typeof firstHalf) => {
    const d = new Date(start)
    applyRange(half(d.getFullYear(), d.getMonth()))
  }

  return (
    <Card className="rounded-[20px]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[12px] bg-[#556b2f]/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-[#556b2f]" />
          </div>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs mb-2 block">Start date</Label>
            <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs mb-2 block">End date</Label>
            <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => applyRange(getPreviousWorkWeek())}>
            <Calendar className="w-3 h-3 mr-1" />
            Last week (Mon–Fri)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyRange(getCurrentWorkWeek())}>
            <Calendar className="w-3 h-3 mr-1" />
            This week (Mon–Fri)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyHalf(firstHalf)}>
            <Calendar className="w-3 h-3 mr-1" />
            1st half (1–15)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyHalf(secondHalf)}>
            <Calendar className="w-3 h-3 mr-1" />
            2nd half (16–end)
          </Button>
        </div>

        <div className="flex justify-end pt-2 border-t border-border/50">
          <Button
            onClick={() => onPreview(start, end)}
            disabled={disabled || !start || !end}
            className="bg-[#556b2f] hover:bg-[#556b2f]/90"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview report
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Add `PSS_KIND` + relabels in `src/components/reports/preview-report-modal.tsx`**

5a. Extend the `ReportKind` union (line 27):

```ts
  reportType: 'weekly_ss' | 'pss' | 'biweekly' | 'annual'
```

5b. Relabel and add the new kind — replace the three existing KIND constants block with:

```ts
export const WEEKLY_SS_KIND: ReportKind = {
  reportType: 'weekly_ss',
  previewEndpoint: '/api/reports/weekly-ss',
  sendEndpoint: '/api/reports/weekly-ss/send',
  label: 'SS Report',
}

export const PSS_KIND: ReportKind = {
  reportType: 'pss',
  previewEndpoint: '/api/reports/pss',
  sendEndpoint: '/api/reports/pss/send',
  label: 'PSS Report',
}

export const BIWEEKLY_KIND: ReportKind = {
  reportType: 'biweekly',
  previewEndpoint: '/api/reports/biweekly',
  sendEndpoint: '/api/reports/biweekly/send',
  label: 'SS+PSS Report',
}

export const ANNUAL_KIND: ReportKind = {
  reportType: 'annual',
  previewEndpoint: '/api/reports/annual',
  sendEndpoint: '/api/reports/annual/send',
  label: 'Annual Performance Review',
}
```

- [ ] **Step 6: Rewrite `src/app/dashboard/reports/page.tsx`**

Full replacement:

```tsx
'use client'

/**
 * Reports landing page.
 *
 * Four generator cards sharing one client picker: SS Report, PSS Report,
 * SS+PSS Report (each a PeriodReportCard with its own date range + the four
 * shared presets) and the Annual Performance Review. Preview opens a single
 * full-screen modal driven by the active card's ReportKind. No server-side
 * persistence — every generation runs fresh from the current DB state.
 */

import { useEffect, useState, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { FileText, Loader2, Eye } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  PreviewReportModal,
  WEEKLY_SS_KIND,
  PSS_KIND,
  BIWEEKLY_KIND,
  ANNUAL_KIND,
  type ReportKind,
} from '@/components/reports/preview-report-modal'
import { PeriodReportCard } from '@/components/reports/period-report-card'
import { previousHalfMonth, getPreviousWorkWeek } from '@/lib/reports/periods'

interface ActivePreview {
  kind: ReportKind
  start: string
  end: string
}

export default function ReportsPage() {
  const { toast } = useToast()

  // SS + PSS default to the previous Mon–Fri; SS+PSS to the last half-month.
  const defaultWeek = useMemo(() => getPreviousWorkWeek(), [])
  const defaultHalf = useMemo(() => previousHalfMonth(new Date()), [])

  const [clients, setClients] = useState<SearchableSelectOption[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [loadingClients, setLoadingClients] = useState(true)
  const [active, setActive] = useState<ActivePreview | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [annualYear, setAnnualYear] = useState<number>(new Date().getFullYear() - 1)
  const [activeAnnualYear, setActiveAnnualYear] = useState<number>(new Date().getFullYear() - 1)

  useEffect(() => {
    let cancelled = false
    async function loadClients() {
      try {
        const res = await fetch('/api/clients?is_qc_client=true&limit=500')
        if (!res.ok) throw new Error('Failed to load clients')
        const json = await res.json()
        const opts: SearchableSelectOption[] = (json.clients || [])
          .map((c: any) => ({
            value: c.id,
            label: c.fantasy_name || c.company || c.name || c.id,
          }))
          .sort((a: SearchableSelectOption, b: SearchableSelectOption) =>
            a.label.localeCompare(b.label)
          )
        if (!cancelled) setClients(opts)
      } catch (err) {
        console.error(err)
        toast({
          title: 'Could not load clients',
          description: 'Please refresh and try again.',
          variant: 'destructive',
        })
      } finally {
        if (!cancelled) setLoadingClients(false)
      }
    }
    loadClients()
    return () => {
      cancelled = true
    }
  }, [toast])

  const openPreview = (kind: ReportKind) => (start: string, end: string) => {
    if (!clientId) {
      toast({ title: 'Pick a client', variant: 'destructive' })
      return
    }
    if (!start || !end) {
      toast({ title: 'Pick a date range', variant: 'destructive' })
      return
    }
    if (start > end) {
      toast({ title: 'Start date must be before end date', variant: 'destructive' })
      return
    }
    setActive({ kind, start, end })
    setPreviewOpen(true)
  }

  const clientName = clients.find(c => c.value === clientId)?.label || 'Client'

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-sm font-semibold tracking-tight">Reports</h1>
          <p className="text-xs text-muted-foreground">
            Client-facing periodic reports. Generated on demand; no scheduled delivery yet.
          </p>
        </div>

        {/* Shared client picker — one selection drives all report cards. */}
        <Card className="rounded-[20px]">
          <CardContent className="pt-6">
            <Label className="text-xs mb-2 block">Client</Label>
            {loadingClients ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading clients…
              </div>
            ) : (
              <SearchableSelect
                options={clients}
                value={clientId}
                onValueChange={setClientId}
                placeholder="Select a QC client"
                searchPlaceholder="Search clients…"
                emptyMessage="No QC clients found"
              />
            )}
          </CardContent>
        </Card>

        {/* Report cards — three period reports + Annual. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PeriodReportCard
            title="SS Report"
            description="Shipment Sample performance — approvals, rejections, regions, and the full certificate list."
            defaultStart={defaultWeek.start}
            defaultEnd={defaultWeek.end}
            disabled={!clientId}
            onPreview={openPreview(WEEKLY_SS_KIND)}
          />
          <PeriodReportCard
            title="PSS Report"
            description="Pre-Shipment Sample performance — approvals, rejections, rejection reasons, and the full certificate list."
            defaultStart={defaultWeek.start}
            defaultEnd={defaultWeek.end}
            disabled={!clientId}
            onPreview={openPreview(PSS_KIND)}
          />
          <PeriodReportCard
            title="SS+PSS Report"
            description="Combined Pre-Shipment + Shipment Sample performance over the selected window."
            defaultStart={defaultHalf.start}
            defaultEnd={defaultHalf.end}
            disabled={!clientId}
            onPreview={openPreview(BIWEEKLY_KIND)}
          />

          {/* Annual Performance Review — unchanged flow. */}
          <Card className="rounded-[20px]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-[#556b2f]/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-[#556b2f]" />
                </div>
                <div>
                  <CardTitle className="text-sm">Annual Performance Review</CardTitle>
                  <CardDescription className="text-xs">
                    Full-year supplier performance, all labs and origins.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground">Year</Label>
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-background"
                  value={annualYear}
                  onChange={(e) => setAnnualYear(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((d) => {
                    const y = new Date().getFullYear() - d
                    return <option key={y} value={y}>{y}</option>
                  })}
                </select>
              </div>

              <div className="flex justify-end pt-2 border-t border-border/50">
                <Button
                  onClick={() => {
                    if (!clientId) {
                      toast({ title: 'Pick a client', variant: 'destructive' })
                      return
                    }
                    setActive({ kind: ANNUAL_KIND, start: '', end: '' })
                    setActiveAnnualYear(annualYear)
                    setPreviewOpen(true)
                  }}
                  disabled={!clientId}
                  className="bg-[#556b2f] hover:bg-[#556b2f]/90"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Single full-screen preview modal, fed by whichever card is active. */}
      {active && clientId ? (
        <PreviewReportModal
          open={previewOpen}
          onOpenChange={(o) => { setPreviewOpen(o); if (!o) setActive(null) }}
          kind={active.kind}
          clientId={clientId}
          clientName={clientName}
          startDate={active.start}
          endDate={active.end}
          year={active.kind.reportType === 'annual' ? activeAnnualYear : undefined}
        />
      ) : null}
    </MainLayout>
  )
}
```

- [ ] **Step 7: Typecheck + tests**

Run: `npx tsc --noEmit && npm run test:run`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/reports/periods.ts src/lib/reports/periods.test.ts src/components/reports/period-report-card.tsx src/components/reports/preview-report-modal.tsx src/app/dashboard/reports/page.tsx
git commit -m "feat(reports): four report cards with shared presets, PSS report kind"
```

---

### Task 7: Delete superseded files and the weekly fetcher

Nothing imports the old modules anymore (routes were re-pointed in Task 5). Remove them and the now-dead weekly fetch path.

**Files:**
- Delete: `src/components/pdf/reports/weekly-ss-certs-report.tsx`
- Delete: `src/lib/reports/weekly-ss-generator.ts`
- Delete: `src/lib/reports/biweekly-generator.ts`
- Delete: `src/lib/reports/biweekly-data.ts`
- Delete: `src/lib/reports/biweekly-data.test.ts`
- Delete: `src/components/pdf/reports/biweekly-performance-report.tsx`
- Delete: `src/components/pdf/reports/biweekly-performance-report.test.ts`
- Delete: `src/components/pdf/reports/ss-cert-appendix-table.tsx`
- Delete: `src/components/pdf/reports/ss-cert-appendix-table.test.ts`
- Modify: `src/lib/report-data.ts` (remove `getWeeklySSCertReportData` + `WeeklySSCertReportData`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `report-data.ts` keeps exporting `computeBagsAndMt`, `mapCertRowToReportRow`, `categorizeViolation`, `buildSankey`, `WeeklySSCertRow`, `RawCertSampleRow`, `RejectionReasonRow`, `SupplierScorecardRow`, `ClientSankeyType` — everything the performance engine imports.

- [ ] **Step 1: Verify nothing else imports the doomed modules**

Run:

```bash
grep -rn "weekly-ss-certs-report\|weekly-ss-generator\|biweekly-generator\|biweekly-data\|ss-cert-appendix-table\|biweekly-performance-report\|getWeeklySSCertReportData\|WeeklySSCertReportData" src --include="*.ts" --include="*.tsx" | grep -v "src/lib/reports/biweekly\|src/lib/reports/weekly-ss-generator\|src/components/pdf/reports/weekly-ss-certs-report\|src/components/pdf/reports/biweekly-performance-report\|src/components/pdf/reports/ss-cert-appendix-table\|src/lib/report-data.ts"
```

Expected: no output (only the files being deleted reference each other). If anything else shows up, fix that import first.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/pdf/reports/weekly-ss-certs-report.tsx \
       src/lib/reports/weekly-ss-generator.ts \
       src/lib/reports/biweekly-generator.ts \
       src/lib/reports/biweekly-data.ts \
       src/lib/reports/biweekly-data.test.ts \
       src/components/pdf/reports/biweekly-performance-report.tsx \
       src/components/pdf/reports/biweekly-performance-report.test.ts \
       src/components/pdf/reports/ss-cert-appendix-table.tsx \
       src/components/pdf/reports/ss-cert-appendix-table.test.ts
```

- [ ] **Step 3: Remove the dead weekly fetcher from `src/lib/report-data.ts`**

Delete the `WeeklySSCertReportData` interface (lines ~112-150), the `SANKEY_WIDTH`/`SANKEY_HEIGHT` consts IF only used by the deleted function (they are also used by `buildSankey` — KEEP them), and the entire `getWeeklySSCertReportData` function (lines ~155-371). Keep everything else (`computeBagsAndMt`, `mapCertRowToReportRow`, `categorizeViolation`, `buildSankey` and all exported types).

- [ ] **Step 4: Typecheck + full suite + build**

Run: `npx tsc --noEmit && npm run test:run && npm run build`
Expected: all green. The build proves no route or page still references a deleted module.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reports): delete superseded weekly/biweekly templates and fetchers"
```

---

### Task 8: End-to-end verification (manual, dev server)

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Open `http://localhost:3000/dashboard/reports`.

- [ ] **Step 2: Verify the page**

- Four cards render: SS Report, PSS Report, SS+PSS Report, Annual Performance Review.
- Each period card shows the four presets; clicking each updates the date inputs correctly.

- [ ] **Step 3: Verify the three PDFs for Ahold (single-importer + big-bag path)**

For the client "Ahold" with a June window (matches the screenshots that motivated this work):

- **PSS Report**: page 1 = KPI band + 3-up row (Importer donut labeled with Ahold, Exporter bars, Rejection reasons); page 2 = region tables + all-certs table with Status column, no Container column. Rejected rows show red "Rejected".
- **SS Report**: page 1 charts; page 2 = region tables (+ Sankey if 3+ columns) + appendix with Container, Bags, MT columns. For any big-bag contract, Bags shows the ~60kg equivalent (e.g. 333, not 20) and MT shows tonnage.
- **SS+PSS Report**: 4 pages in order PSS-charts, PSS-certs, SS-charts, SS-certs. No chart is ever split across a page boundary. Footer page numbers are continuous and correct.

- [ ] **Step 4: Verify a multi-importer client**

Pick a client with 2+ importers (e.g. Dunkin): page 1 shows the 2-up bar layout with full-width Rejection reasons below — no donut.

- [ ] **Step 5: Verify send modal plumbing (no need to actually send)**

Open "Send by email" from a PSS preview — the recipients GET must hit `/api/reports/recipients?...report_type=pss` and return 200 with empty arrays (first use).

- [ ] **Step 6: Final commit if any fixes were needed, then report status to Daniel**

---

## Self-Review (completed)

- **Spec coverage:** lineup + presets (Task 6), unified template two-page pairs + donut + `wrap={false}` (Task 4), all-certs appendix with Status/MT + PSS no-container (Task 3), bags/MT kg-first rule + `bag_weight_kg` in queries (Tasks 1–2), routes preserved + `/api/reports/pss` + recipients type (Task 5), deletions + dead weekly fetcher removal (Task 7), empty-bucket rendering (Task 4 test 3), manual verification incl. big-bag and multi-importer paths (Task 8). No gaps found.
- **Placeholder scan:** none.
- **Type consistency:** `PerformanceRow`/`PerformanceBucket`/`ReportBucketKey` names match across Tasks 2, 4, 5; `computeBagsAndMt` signature matches between Tasks 1 and 2's query fields; `CertAppendixTable` props match between Tasks 3 and 4; `totals.mt`/`mtApproved` wiring consistent.
