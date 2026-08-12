# Reports: Contracts/FCL, Sellers, Sankey, YTD Ratings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the coffee quality to the daily-results email, and rework the performance + annual PDF reports to count contracts/FCL/MT, show seller alongside shipper, render the Sankey flow that is currently suppressed, and print a year-to-date supplier rating.

**Architecture:** All aggregation stays in the pure functions of `src/lib/report-data.ts` and `src/lib/reports/*.ts`; the `@react-pdf/renderer` templates under `src/components/pdf/reports/` remain presentation-only. One new pure module (`supplier-ratings.ts`) and one new PDF component (`supplier-rating-table.tsx`) are added. The single client-type helper `resolveClientSankeyType` replaces two duplicated inline blocks and carries the roaster-precedence fix that restores the missing Sankey.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/supabase-js`), `@react-pdf/renderer`, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-reports-contracts-sellers-sankey-design.md`. Read it before starting.
- Test runner is vitest. Run a single file with `npx vitest run <path>`; run everything with `npm run test:run`.
- There is **no** `typecheck` script. Where a task changes an exported type, verify with `npx tsc --noEmit`.
- Inter is registered by `certificate-styles.ts` in weights **400/600/700 only, no italic**. Never set `fontStyle: 'italic'` in a report component — `@react-pdf/renderer` throws "Could not resolve font" and aborts the whole render.
- Chart/report palette: green `#556b2f`, red `#ef4444`, dark-green totals `#2f6b21`, hairline `#e3e3e3`, zebra `#f7f7f5`. Use these exact values.
- No emojis in any UI or PDF output.
- Repo works trunk-based on `main`; commit after every task, do not open branches.
- MT values are always rendered to exactly one decimal (`toFixed(1)`). Bag counts are always integers formatted with `toLocaleString('en-US')`.
- `endDate` in the report fetchers is **exclusive** (`.lt('created_at', endDate)`).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/approval-notification/quality-summary.ts` | Daily-results email: quality name resolution + Quality column | 1 |
| `src/lib/report-data.ts` | Shared row mapper, Sankey builder, **new** `isRoasterCompany` / `resolveClientSankeyType` | 2 |
| `src/lib/reports/performance-data.ts` | Bucket aggregation: MT rollups, contracts/FCL, `bySeller`, region MT, per-bucket Sankey, widened YTD fetch | 3, 4, 5 |
| `src/lib/reports/supplier-ratings.ts` *(new)* | Pure YTD supplier ranking | 4 |
| `src/components/pdf/reports/cert-appendix-table.tsx` | Seller column + dual totals rows | 6 |
| `src/components/pdf/charts/vertical-grouped-bar-chart.tsx` | MT row in the stats grid | 7 |
| `src/components/pdf/reports/supplier-rating-table.tsx` *(new)* | Paired shipper/seller rating tables | 8 |
| `src/components/pdf/reports/performance-report.tsx` | KPI band, seller chart swap, Page-B layout, appendix wiring | 9 |
| `src/components/pdf/reports/annual-performance-report.tsx` | Seller pages, MT columns | 10 |
| `src/lib/reports/annual-data.ts` | Adopt `resolveClientSankeyType` | 2 |

---

## Task 1: Quality column in the daily-results email

**Files:**
- Modify: `src/lib/approval-notification/quality-summary.ts`
- Test: `src/lib/approval-notification/quality-summary.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `resolveQualityName(sampleQualityName, specCustomName, templateName): string | null`; `QualitySampleSummary.qualityName: string | null`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/approval-notification/quality-summary.test.ts`. Add `resolveQualityName` to the existing import block at the top of the file, and add `qualityName: null,` to the `sample()` factory's defaults (right after `sampleType: 'ss',`).

```ts
describe('resolveQualityName', () => {
  it('prefers the sample override over the spec', () => {
    expect(resolveQualityName('Custom Santos 17/18', 'Ahold Standard', 'Brazil Base')).toBe('Custom Santos 17/18')
  })
  it('falls back to the client quality custom name', () => {
    expect(resolveQualityName(null, 'Ahold Standard', 'Brazil Base')).toBe('Ahold Standard')
  })
  it('falls back to the template name', () => {
    expect(resolveQualityName('  ', '', 'Brazil Base')).toBe('Brazil Base')
  })
  it('returns null when nothing is set', () => {
    expect(resolveQualityName(null, null, null)).toBeNull()
  })
})

describe('quality column', () => {
  const s = sample({ qualityName: 'Brazil Santos 17/18 FC', decision: 'approved' })

  it('renders a Quality header and value in the HTML table', () => {
    const html = buildQualitySummaryHtml([{ heading: 'Ahold', samples: [s] }], { audience: 'buyer' })
    expect(html).toContain('>Quality<')
    expect(html).toContain('Brazil Santos 17/18 FC')
  })
  it('renders the quality in the plain-text form', () => {
    const text = buildQualitySummaryText([{ heading: 'Ahold', samples: [s] }], { audience: 'buyer' })
    expect(text).toContain('Quality: Brazil Santos 17/18 FC')
  })
  it('renders an em dash when no quality is known', () => {
    const html = buildQualitySummaryHtml(
      [{ heading: 'Ahold', samples: [sample({ qualityName: null })] }],
      { audience: 'seller' },
    )
    expect(html).toContain('>Quality<')
  })
  it('a split inherits the mother quality', () => {
    const split = buildSubContractSummary(s, { id: 'sc1' }, 'BR-2/26', 'Ahold', null)
    expect(split.qualityName).toBe('Brazil Santos 17/18 FC')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval-notification/quality-summary.test.ts`
Expected: FAIL — `resolveQualityName is not a function`.

- [ ] **Step 3: Add the field and the resolver**

In `src/lib/approval-notification/quality-summary.ts`, add to the `QualitySampleSummary` interface, immediately after the `sampleType` line:

```ts
  /** Coffee quality/grade name — sample override, else the client quality, else
   *  the template. Same precedence the certificate PDF renders. */
  qualityName: string | null
```

Then, immediately **after** the existing `const nonBlank = …` declaration (it is a `const`, so anything referencing it must be declared later in the file), add:

```ts
/**
 * The quality name shown to buyers and sellers. `samples.quality_name` is a
 * per-sample override (commonly used for type samples); otherwise the client
 * quality's custom name, otherwise the underlying template name.
 */
export function resolveQualityName(
  sampleQualityName: string | null | undefined,
  specCustomName: string | null | undefined,
  templateName: string | null | undefined,
): string | null {
  return nonBlank(sampleQualityName) ?? nonBlank(specCustomName) ?? nonBlank(templateName)
}
```

- [ ] **Step 4: Add the column**

In `refColumns()`, add the column definition just before the `const audienceCols` declaration:

```ts
  // The coffee quality/grade the sample was assessed against — requested by
  // buyers, who otherwise cannot tell which spec the OK/FAIL verdicts are against.
  const quality: RefColumn = {
    header: 'Quality',
    value: (s) => s.qualityName ?? '—',
  }
```

and change the final return from `return [...audienceCols, container]` to:

```ts
  return [...audienceCols, quality, container]
```

No other rendering change is needed: `buildQualitySummaryHtml` derives `colCount` from `refCols.length`, and both builders iterate `refCols`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/approval-notification/quality-summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Populate the field from the database**

In `fetchQualitySampleSummaries`, change the `samples` select string (currently starting `'id, exporter_sample_number, …'`) to include `quality_name` — insert it directly after `sample_type`:

```ts
      'id, exporter_sample_number, seller_contract_nr, wolthers_contract_nr, buyer_contract_nr, container_nr, ico_number, sample_type, quality_name, client_id, seller_id, status, quality_spec_id, contract_id',
```

Then, immediately after the `nameById` company lookup block (the one that ends with the `for (const c of (comps ?? []) …)` loop), add the spec lookup:

```ts
  // Quality names for the samples that reference a client quality. One IN-query;
  // the template name is the last-resort label.
  const specIds = [
    ...new Set(rows.map((r) => r.quality_spec_id).filter((x): x is string => !!x)),
  ]
  const specNameById = new Map<string, { custom: string | null; template: string | null }>()
  if (specIds.length > 0) {
    const { data: specs } = await admin
      .from('client_qualities')
      .select('id, custom_name, template:quality_templates(name)')
      .in('id', specIds)
    for (const q of (specs ?? []) as Array<Record<string, unknown>>) {
      specNameById.set(q.id as string, {
        custom: (q.custom_name as string) ?? null,
        template: ((q.template as { name?: string } | null)?.name as string) ?? null,
      })
    }
  }
```

Finally, in the `mother` object literal, add the field directly after `sampleType`:

```ts
      qualityName: resolveQualityName(
        s.quality_name as string | null,
        s.quality_spec_id ? specNameById.get(s.quality_spec_id as string)?.custom : null,
        s.quality_spec_id ? specNameById.get(s.quality_spec_id as string)?.template : null,
      ),
```

`buildSubContractSummary` spreads the mother, so splits inherit it with no change.

- [ ] **Step 7: Verify types and full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/approval-notification/quality-summary.ts src/lib/approval-notification/quality-summary.test.ts
git commit -m "feat(qc email): show the coffee quality in the daily results table"
```

---

## Task 2: Shared client-type helper with roaster precedence

**Files:**
- Modify: `src/lib/report-data.ts`
- Modify: `src/lib/reports/performance-data.ts:272-277`
- Modify: `src/lib/reports/annual-data.ts:187-192`
- Test: `src/lib/report-data.test.ts`

**Interfaces:**
- Consumes: `ClientSankeyType` (already exported from `report-data.ts`).
- Produces: `isRoasterCompany(companyTypes): boolean`, `resolveClientSankeyType(companyTypes, tradingRoles): ClientSankeyType`.

**Why:** Ahold is typed both roaster and buyer. The current `buyer`-first ternary yields `'importer'`, whose Sankey column list is `['Shipper', 'Seller']` — two columns, below the `showSankey = columns.length > 2` threshold, so no flow renders at all.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/report-data.test.ts`, and add `isRoasterCompany, resolveClientSankeyType,` to the existing import block.

```ts
describe('resolveClientSankeyType', () => {
  it('roaster wins over buyer (Ahold is typed as both)', () => {
    expect(resolveClientSankeyType(['roaster'], ['buyer'])).toBe('roaster')
  })
  it('is case-insensitive on company_types', () => {
    expect(resolveClientSankeyType(['Roaster'], [])).toBe('roaster')
  })
  it('buyer alone is an importer', () => {
    expect(resolveClientSankeyType(['importer'], ['buyer'])).toBe('importer')
  })
  it('neither is a final buyer', () => {
    expect(resolveClientSankeyType([], [])).toBe('final_buyer')
    expect(resolveClientSankeyType(null, null)).toBe('final_buyer')
  })
  it('ignores non-string entries', () => {
    expect(resolveClientSankeyType([null, 42], ['buyer'])).toBe('importer')
  })
})

describe('isRoasterCompany', () => {
  it('detects the roaster type regardless of case', () => {
    expect(isRoasterCompany(['ROASTER'])).toBe(true)
    expect(isRoasterCompany(['exporter'])).toBe(false)
    expect(isRoasterCompany(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report-data.test.ts`
Expected: FAIL — `resolveClientSankeyType is not a function`.

- [ ] **Step 3: Implement the helpers**

In `src/lib/report-data.ts`, directly below the `export type ClientSankeyType` declaration, add:

```ts
/** True when the company is typed as a roaster (case-insensitive). */
export function isRoasterCompany(companyTypes: unknown[] | null | undefined): boolean {
  return (companyTypes ?? []).some(
    (t) => typeof t === 'string' && t.trim().toLowerCase() === 'roaster',
  )
}

/**
 * Which Sankey shape a QC client gets.
 *
 * ROASTER WINS OVER BUYER. Ahold Delhaize Coffee Company carries both
 * `company_types: ['roaster']` and `trading_roles: ['buyer']`; when `buyer` won,
 * the flow collapsed to a 2-column Shipper → Seller chain, which the
 * `columns.length > 2` gate then hid — so the report shipped with no supply-chain
 * flow at all. Roaster-first yields Shipper → Seller → Importer.
 */
export function resolveClientSankeyType(
  companyTypes: unknown[] | null | undefined,
  tradingRoles: unknown[] | null | undefined,
): ClientSankeyType {
  if (isRoasterCompany(companyTypes)) return 'roaster'
  const isBuyer = (tradingRoles ?? []).some(
    (r) => typeof r === 'string' && r.trim().toLowerCase() === 'buyer',
  )
  return isBuyer ? 'importer' : 'final_buyer'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Adopt the helper at both call sites**

In `src/lib/reports/performance-data.ts`, replace these four lines inside `getPerformanceReportData`:

```ts
  const clientIsRoaster = companyTypes.some(t => typeof t === 'string' && t.toLowerCase() === 'roaster')
  const clientIsImporter = tradingRoles.includes('buyer')
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'
```

with:

```ts
  const clientIsRoaster = isRoasterCompany(companyTypes)
  const clientDisplay = client.fantasy_name || client.name
  const sankeyType: ClientSankeyType = resolveClientSankeyType(companyTypes, tradingRoles)
```

Add `isRoasterCompany,` and `resolveClientSankeyType,` to the existing `from '@/lib/report-data'` import block in that file. The now-unused `clientIsImporter` local is removed.

Make the identical replacement in `src/lib/reports/annual-data.ts` inside `getAnnualPerformanceReportData`, adding both names to its existing `from '@/lib/report-data'` import block.

- [ ] **Step 6: Verify types and full suite**

Run: `npx tsc --noEmit`
Expected: no errors (note: `ClientSankeyType` may now be imported only as a type in one file — if `tsc` reports it unused, leave the import, it is still used in the annotation).

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/report-data.ts src/lib/report-data.test.ts src/lib/reports/performance-data.ts src/lib/reports/annual-data.ts
git commit -m "fix(reports): roaster beats buyer when typing a client, restoring the Sankey"
```

---

## Task 3: Contracts, FCL, MT rollups and the seller breakdown

**Files:**
- Modify: `src/lib/reports/performance-data.ts`
- Test: `src/lib/reports/performance-data.test.ts`
- Modify (fixtures only): `src/components/pdf/reports/performance-report.test.ts`

**Interfaces:**
- Consumes: `resolveClientSankeyType` from Task 2.
- Produces:
  - `countContracts(rows: PerformanceRow[]): number`
  - `countFcl(rows: PerformanceRow[]): number`
  - `GroupPerf` gains `approvedMt: number`, `rejectedMt: number`
  - `BucketTotals` gains `contracts: number`, `fcl: number`, `bagsRejected: number`, `mtRejected: number`
  - `BucketAggregate` gains `bySeller: GroupPerf[]`
  - `RegionRow` gains `mt: number`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/reports/performance-data.test.ts`, adding `countContracts, countFcl,` to the existing import block.

```ts
describe('countContracts', () => {
  it('counts distinct importer contract numbers', () => {
    expect(countContracts([
      row({ importer_contract_nr: 'IR0007919-1' }),
      row({ importer_contract_nr: 'IR0007919-1' }),
      row({ importer_contract_nr: 'IR0007920-1' }),
    ])).toBe(2)
  })
  it('trims and ignores case-identical whitespace variants', () => {
    expect(countContracts([
      row({ importer_contract_nr: ' IR1 ' }),
      row({ importer_contract_nr: 'IR1' }),
    ])).toBe(1)
  })
  it('counts each certificate with no contract number as its own contract', () => {
    expect(countContracts([
      row({ importer_contract_nr: 'IR1' }),
      row({ importer_contract_nr: null }),
      row({ importer_contract_nr: '  ' }),
    ])).toBe(3)
  })
})

describe('countFcl', () => {
  it('counts distinct containers', () => {
    expect(countFcl([
      row({ container_nr: 'MSNU 315.234-7' }),
      row({ container_nr: 'MSNU 315.234-7' }),
      row({ container_nr: 'MSMU 386.677-8' }),
    ])).toBe(2)
  })
  it('is zero when no row carries a container (PSS)', () => {
    expect(countFcl([row({ container_nr: null }), row({ container_nr: '' })])).toBe(0)
  })
})

describe('aggregateBucket — contracts, FCL, MT', () => {
  const rows = [
    row({ importer_contract_nr: 'IR1', container_nr: 'C1', bags: 350, mt: 21.0, is_rejected: false }),
    row({ importer_contract_nr: 'IR1', container_nr: 'C2', bags: 350, mt: 21.0, is_rejected: false }),
    row({ importer_contract_nr: 'IR2', container_nr: 'C3', bags: 360, mt: 21.6, is_rejected: true }),
  ]
  it('reports contracts and FCL on the totals', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.totals.contracts).toBe(2)
    expect(agg.totals.fcl).toBe(3)
  })
  it('sums rejected bags and MT separately from approved', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.totals.bagsApproved).toBe(700)
    expect(agg.totals.mtApproved).toBe(42.0)
    expect(agg.totals.bagsRejected).toBe(360)
    expect(agg.totals.mtRejected).toBe(21.6)
  })
  it('carries approved and rejected MT on each group', () => {
    const agg = aggregateBucket(rows, 'bags')
    const g = agg.byExporter.find(e => e.name === 'Cooxupe')!
    expect(g.approvedMt).toBe(42.0)
    expect(g.rejectedMt).toBe(21.6)
  })
  it('carries MT on each region row', () => {
    const agg = aggregateBucket(rows, 'bags')
    expect(agg.approvedByRegion.find(r => r.region === 'Cerrado')!.mt).toBe(42.0)
  })
})

describe('aggregateBucket — bySeller', () => {
  it('groups on the seller, falling back to the shipper when unset', () => {
    const agg = aggregateBucket([
      row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH' }),
      row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH' }),
      row({ exporter_name: 'Veloso Green Coffee', seller_name: null }),
    ], 'count')
    expect(agg.bySeller.map(g => g.name)).toEqual(['Volcafe CH', 'Veloso Green Coffee'])
    expect(agg.bySeller.find(g => g.name === 'Volcafe CH')!.approvedCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/performance-data.test.ts`
Expected: FAIL — `countContracts is not a function`.

- [ ] **Step 3: Extend the types**

In `src/lib/reports/performance-data.ts`, replace the `BucketTotals`, `GroupPerf` and `RegionRow` interfaces with:

```ts
export interface BucketTotals {
  evaluated: number
  approved: number
  rejected: number
  rejectionRate: number // 0-100, rounded
  bagsApproved: number
  mtApproved: number    // metric tons (approved only), 1 decimal
  bagsRejected: number
  mtRejected: number    // metric tons (rejected only), 1 decimal
  /** Distinct importer contract numbers; a certificate with none counts as its
   *  own contract, so this can never under-report. One contract carries several
   *  containers (FCL), each with its own certificate. */
  contracts: number
  /** Distinct containers. Zero for PSS, which carries no container. */
  fcl: number
}

export interface GroupPerf {
  name: string
  approvedCount: number
  rejectedCount: number
  approvedBags: number
  rejectedBags: number
  approvedMt: number    // 1 decimal
  rejectedMt: number    // 1 decimal
  rejectionRate: number // by count, 0-100
}

export interface RegionRow {
  region: string
  count: number
  bags: number
  mt: number // 1 decimal
  pct: number // 0-100 of the side total; basis = the bucket metric
}
```

- [ ] **Step 4: Implement the counters and the rollups**

Replace `emptyGroup` with:

```ts
function emptyGroup(name: string): GroupPerf {
  return {
    name, approvedCount: 0, rejectedCount: 0,
    approvedBags: 0, rejectedBags: 0, approvedMt: 0, rejectedMt: 0,
    rejectionRate: 0,
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10
```

In `groupBy`, inside the row loop replace the `if (r.is_rejected) { … } else { … }` block with:

```ts
    const mt = r.mt ?? 0
    if (r.is_rejected) {
      g.rejectedCount += 1
      g.rejectedBags += bags
      g.rejectedMt += mt
    } else {
      g.approvedCount += 1
      g.approvedBags += bags
      g.approvedMt += mt
    }
```

and in the trailing normalization loop add the rounding (rounding once at the end, never per row):

```ts
  for (const g of map.values()) {
    const total = g.approvedCount + g.rejectedCount
    g.rejectionRate = pct(g.rejectedCount, total)
    g.approvedMt = round1(g.approvedMt)
    g.rejectedMt = round1(g.rejectedMt)
  }
```

Add the two counters just above `regionBreakdown`:

```ts
/**
 * How many commercial contracts the bucket covers. One contract carries several
 * containers, each with its own certificate, so this is the distinct count of
 * importer contract numbers. A certificate with no importer reference is counted
 * as its own contract — the figure degrades toward the certificate count rather
 * than silently collapsing rows together.
 */
export function countContracts(rows: PerformanceRow[]): number {
  const seen = new Set<string>()
  let unreferenced = 0
  for (const r of rows) {
    const v = r.importer_contract_nr?.trim()
    if (v) seen.add(v)
    else unreferenced += 1
  }
  return seen.size + unreferenced
}

/** Full container loads = distinct containers. Zero on PSS (no container). */
export function countFcl(rows: PerformanceRow[]): number {
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r.container_nr?.trim()
    if (v) seen.add(v)
  }
  return seen.size
}
```

In `regionBreakdown`, change the accumulator to carry MT:

```ts
function regionBreakdown(rows: PerformanceRow[], metric: 'count' | 'bags'): RegionRow[] {
  const map = new Map<string, { count: number; bags: number; mt: number }>()
  for (const r of rows) {
    const region = (r.region && r.region.trim()) || 'Unspecified'
    const cur = map.get(region) ?? { count: 0, bags: 0, mt: 0 }
    cur.count += 1
    cur.bags += r.bags ?? 0
    cur.mt += r.mt ?? 0
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
      mt: round1(v.mt),
      pct: pct(metric === 'bags' ? v.bags : v.count, whole),
    }))
    .sort((a, b) => (metric === 'bags' ? b.bags - a.bags : b.count - a.count))
}
```

- [ ] **Step 5: Wire them into `aggregateBucket`**

In `aggregateBucket`, replace the `totals` literal with:

```ts
  const totals: BucketTotals = {
    evaluated: rows.length,
    approved: approved.length,
    rejected: rejected.length,
    rejectionRate: pct(rejected.length, rows.length),
    bagsApproved: approved.reduce((s, r) => s + (r.bags ?? 0), 0),
    mtApproved: round1(approved.reduce((s, r) => s + (r.mt ?? 0), 0)),
    bagsRejected: rejected.reduce((s, r) => s + (r.bags ?? 0), 0),
    mtRejected: round1(rejected.reduce((s, r) => s + (r.mt ?? 0), 0)),
    contracts: countContracts(rows),
    fcl: countFcl(rows),
  }
```

and add `bySeller` to the returned object, directly after `byImporter`:

```ts
    // Seller and shipper are frequently different companies (Grano ships, Volcafe
    // sells). Fall back to the shipper when no seller is recorded — the same
    // fallback `buildSankey` applies, so chart and flow name the same companies.
    bySeller: groupBy(rows, r => r.seller_name?.trim() || r.exporter_name?.trim() || null),
```

Add `bySeller: GroupPerf[]` to the `BucketAggregate` interface, directly after `byImporter`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/reports/performance-data.test.ts`
Expected: PASS.

- [ ] **Step 7: Update the PDF test fixtures for the new required fields**

In `src/components/pdf/reports/performance-report.test.ts`, replace the `bucket()` factory's `totals`, `byImporter`, `byExporter`, `approvedByRegion` and `rejectedByRegion` entries with:

```ts
  totals: {
    evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33,
    bagsApproved: 666, mtApproved: 40.0, bagsRejected: 333, mtRejected: 20.0,
    contracts: 2, fcl: 1,
  },
  byImporter: [{ name: 'Ahold', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, approvedMt: 40.0, rejectedMt: 20.0, rejectionRate: 33 }],
  bySeller: [
    { name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 },
    { name: 'Ofi', approvedCount: 1, rejectedCount: 0, approvedBags: 333, rejectedBags: 0, approvedMt: 20.0, rejectedMt: 0, rejectionRate: 0 },
  ],
  byExporter: [
    { name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 },
    { name: 'Ofi', approvedCount: 1, rejectedCount: 0, approvedBags: 333, rejectedBags: 0, approvedMt: 20.0, rejectedMt: 0, rejectionRate: 0 },
  ],
  rejectionReasons: [{ category: 'Cupping faults', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 2, bags: 666, mt: 40.0, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 333, mt: 20.0, pct: 100 }],
```

- [ ] **Step 8: Verify types and full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/reports/performance-data.ts src/lib/reports/performance-data.test.ts src/components/pdf/reports/performance-report.test.ts
git commit -m "feat(reports): count contracts and FCL, roll up MT, add the seller breakdown"
```

---

## Task 4: Year-to-date supplier ratings

**Files:**
- Create: `src/lib/reports/supplier-ratings.ts`
- Create: `src/lib/reports/supplier-ratings.test.ts`
- Modify: `src/lib/reports/performance-data.ts`

**Interfaces:**
- Consumes: `PerformanceRow` from Task 3.
- Produces:
  - `SupplierRatingRow { rank: number; name: string; total: number; pss: number; ss: number; approvalRate: number }`
  - `buildSupplierRatings(pssRows, ssRows, pick): SupplierRatingRow[]`
  - `PerformanceReportData.ratings: { shippers: SupplierRatingRow[]; sellers: SupplierRatingRow[]; window: { start: string; end: string } }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/supplier-ratings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSupplierRatings } from './supplier-ratings'
import type { PerformanceRow } from './performance-data'

const row = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
  approval_date: '2026-03-05T00:00:00Z',
  certificate_number: 'BR-1/26',
  exporter_name: 'Comexim',
  seller_name: 'Volcafe CH',
  importer_name: 'Ahold',
  importer_contract_nr: 'IR1',
  roaster_name: 'Unsold',
  container_nr: 'C1',
  ico_marks: '001',
  bags: 350,
  mt: 21.0,
  is_rejected: false,
  region: 'Cerrado',
  ...over,
})

describe('buildSupplierRatings', () => {
  it('splits PSS and SS counts and computes the approval rate', () => {
    const out = buildSupplierRatings(
      [row({ exporter_name: 'Comexim' }), row({ exporter_name: 'Comexim', is_rejected: true })],
      [row({ exporter_name: 'Comexim' }), row({ exporter_name: 'Comexim' })],
      r => r.exporter_name,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ rank: 1, name: 'Comexim', total: 4, pss: 2, ss: 2, approvalRate: 75 })
  })

  it('ranks by approval rate, then volume, then name', () => {
    const out = buildSupplierRatings(
      [],
      [
        row({ exporter_name: 'Ecom' }),
        row({ exporter_name: 'Ecom' }),
        row({ exporter_name: 'Comexim' }),
        row({ exporter_name: 'Expocacer', is_rejected: true }),
      ],
      r => r.exporter_name,
    )
    expect(out.map(r => [r.rank, r.name, r.approvalRate])).toEqual([
      [1, 'Ecom', 100],
      [2, 'Comexim', 100],
      [3, 'Expocacer', 0],
    ])
  })

  it('groups on the seller when picking seller_name', () => {
    const out = buildSupplierRatings(
      [],
      [row({ seller_name: 'Volcafe CH' }), row({ seller_name: 'Rothfos GmbH' })],
      r => r.seller_name,
    )
    expect(out.map(r => r.name).sort()).toEqual(['Rothfos GmbH', 'Volcafe CH'])
  })

  it('skips rows whose picked name is blank', () => {
    const out = buildSupplierRatings([], [row({ seller_name: null }), row({ seller_name: '  ' })], r => r.seller_name)
    expect(out).toEqual([])
  })

  it('returns an empty list for no rows', () => {
    expect(buildSupplierRatings([], [], r => r.exporter_name)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/supplier-ratings.test.ts`
Expected: FAIL — cannot resolve `./supplier-ratings`.

- [ ] **Step 3: Implement the module**

Create `src/lib/reports/supplier-ratings.ts`:

```ts
/**
 * Year-to-date supplier rating for the performance reports — the report-side
 * equivalent of the supplier-review leaderboard, restricted to one QC client.
 *
 * Pure: callers hand over the already-fetched PSS and SS rows for the window and
 * a picker that selects which party to rate (shipper or seller).
 */
import type { PerformanceRow } from './performance-data'

export interface SupplierRatingRow {
  rank: number
  name: string
  total: number        // certificates evaluated in the window
  pss: number
  ss: number
  approvalRate: number // 0-100, rounded
}

/**
 * Rank the counterparties selected by `pick`, best approval rate first.
 * Ties break on volume (more certificates first), then name, so the order is
 * deterministic across runs.
 */
export function buildSupplierRatings(
  pssRows: PerformanceRow[],
  ssRows: PerformanceRow[],
  pick: (r: PerformanceRow) => string | null,
): SupplierRatingRow[] {
  const acc = new Map<string, { total: number; approved: number; pss: number; ss: number }>()

  const add = (rows: PerformanceRow[], bucket: 'pss' | 'ss') => {
    for (const r of rows) {
      const name = pick(r)?.trim()
      if (!name) continue
      const cur = acc.get(name) ?? { total: 0, approved: 0, pss: 0, ss: 0 }
      cur.total += 1
      if (!r.is_rejected) cur.approved += 1
      if (bucket === 'pss') cur.pss += 1
      else cur.ss += 1
      acc.set(name, cur)
    }
  }
  add(pssRows, 'pss')
  add(ssRows, 'ss')

  const out: SupplierRatingRow[] = [...acc.entries()].map(([name, v]) => ({
    rank: 0,
    name,
    total: v.total,
    pss: v.pss,
    ss: v.ss,
    approvalRate: v.total > 0 ? Math.round((v.approved / v.total) * 100) : 0,
  }))
  out.sort(
    (a, b) => b.approvalRate - a.approvalRate || b.total - a.total || a.name.localeCompare(b.name),
  )
  out.forEach((r, i) => {
    r.rank = i + 1
  })
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reports/supplier-ratings.test.ts`
Expected: PASS.

- [ ] **Step 5: Widen the fetch window in `getPerformanceReportData`**

In `src/lib/reports/performance-data.ts`, add the import:

```ts
import { buildSupplierRatings, type SupplierRatingRow } from '@/lib/reports/supplier-ratings'
```

Add to the `PerformanceReportData` interface, after `origin`:

```ts
  /** Year-to-date supplier rating for this client, both buckets combined.
   *  Same data on every bucket section — it is a client-wide year view. */
  ratings: {
    shippers: SupplierRatingRow[]
    sellers: SupplierRatingRow[]
    window: { start: string; end: string }
  }
```

Directly above the `certificates` query, add the widened window:

```ts
  // The YTD rating needs the whole year, not just the report period, so the
  // certificate query is widened once rather than run twice. `min` guards a
  // period that straddles a year boundary (Dec 28 – Jan 3), where Jan 1 of the
  // end year would otherwise be NARROWER than the report period itself.
  const yearStart = `${new Date(endDate).getUTCFullYear()}-01-01T00:00:00.000Z`
  const ytdStart = new Date(startDate) < new Date(yearStart) ? startDate : yearStart
```

Change the query's lower bound from `.gte('created_at', startDate)` to `.gte('created_at', ytdStart)`.

- [ ] **Step 6: Separate period rows from YTD rows**

Still in `getPerformanceReportData`, replace the block that begins `const bucketRows = (type: ReportBucketKey)` and ends with the `ssRows` assignment with:

```ts
  // `forClient` now spans the whole YTD window. Everything except the rating
  // tables must see ONLY the report period — the defect breakdown and the header
  // origin included, or a weekly report would describe the whole year.
  const periodStartMs = new Date(startDate).getTime()
  const inPeriodRaw = (c: any) => new Date(c.created_at).getTime() >= periodStartMs

  const ytdBucketRows = (type: ReportBucketKey): PerformanceRow[] =>
    forClient
      .filter((c: any) => c.sample.sample_type === type)
      .map((c: any) => toPerformanceRow(c as RawCertSampleRow, { sankeyType, clientDisplay }))

  const ytdPssRows = ytdBucketRows('pss')
  const ytdSsRows = ytdBucketRows('ss')
  const inPeriod = (r: PerformanceRow) => new Date(r.approval_date).getTime() >= periodStartMs

  const pssRows = buckets.includes('pss') ? ytdPssRows.filter(inPeriod) : null
  const ssRows = buckets.includes('ss') ? ytdSsRows.filter(inPeriod) : null

  const forClientPeriod = (forClient as any[]).filter(inPeriodRaw)
```

Then change **both** later uses of `forClient` to `forClientPeriod`:

1. inside `rejectedIdsFor`, the `forClient.filter((c: any) => …)` call;
2. the header-origin loop, `for (const c of forClient as any[])`.

- [ ] **Step 7: Return the ratings**

Still in `getPerformanceReportData`, add to the returned object, directly after `origin`:

```ts
    ratings: {
      shippers: buildSupplierRatings(ytdPssRows, ytdSsRows, r => r.exporter_name),
      // Seller falls back to the shipper, matching `bySeller` and `buildSankey`.
      sellers: buildSupplierRatings(ytdPssRows, ytdSsRows, r => r.seller_name || r.exporter_name),
      window: { start: ytdStart, end: endDate },
    },
```

- [ ] **Step 8: Add the fixture field and verify**

In `src/components/pdf/reports/performance-report.test.ts`, add to the `base()` factory, after `origin: 'Brazil',`:

```ts
  ratings: {
    shippers: [{ rank: 1, name: 'Cooxupe', total: 4, pss: 2, ss: 2, approvalRate: 75 }],
    sellers: [{ rank: 1, name: 'Cooxupe', total: 4, pss: 2, ss: 2, approvalRate: 75 }],
    window: { start: '2026-01-01T00:00:00.000Z', end: '2026-07-01T00:00:00Z' },
  },
```

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/reports/supplier-ratings.ts src/lib/reports/supplier-ratings.test.ts src/lib/reports/performance-data.ts src/components/pdf/reports/performance-report.test.ts
git commit -m "feat(reports): year-to-date supplier rating by shipper and seller"
```

---

## Task 5: Per-bucket Sankey

**Files:**
- Modify: `src/lib/reports/performance-data.ts`
- Test: `src/lib/reports/performance-data.test.ts`
- Modify (fixtures only): `src/components/pdf/reports/performance-report.test.ts`

**Interfaces:**
- Consumes: `buildSankey`, `scorecardFromExporters` (both already exist).
- Produces: `PerformanceBucket` gains `sankey: SankeyLayoutResult | null`, `sankeyColumns: string[]`, `showSankey: boolean`. The top-level `PerformanceReportData.sankey` / `.sankeyColumns` / `.showSankey` are **removed**.

**Why:** the flow is currently built from approved SS rows only and stored once on the report. PSS sections need their own.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/reports/performance-data.test.ts`:

```ts
describe('buildBucketSankey', () => {
  it('builds a flow from approved rows only and reports 3 columns for a roaster', () => {
    const built = buildBucketSankey(
      [
        row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH', importer_name: 'Ahold', bags: 350 }),
        row({ exporter_name: 'Ecom', seller_name: 'Ecom', importer_name: 'Ahold', bags: 360, is_rejected: true }),
      ],
      [
        { name: 'Grano Trading', approvedCount: 1, rejectedCount: 0, approvedBags: 350, rejectedBags: 0, approvedMt: 21, rejectedMt: 0, rejectionRate: 0 },
      ],
      'roaster',
      'Ahold',
    )
    expect(built.sankeyColumns).toEqual(['Shipper', 'Seller', 'Importer'])
    expect(built.showSankey).toBe(true)
    expect(built.sankey).not.toBeNull()
  })

  it('hides a 2-column flow', () => {
    const built = buildBucketSankey([row()], [], 'importer', 'Blaser')
    expect(built.sankeyColumns).toEqual(['Shipper', 'Seller'])
    expect(built.showSankey).toBe(false)
  })
})
```

Add `buildBucketSankey,` to the file's import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/performance-data.test.ts`
Expected: FAIL — `buildBucketSankey is not a function`.

- [ ] **Step 3: Move the Sankey fields onto the bucket**

In `src/lib/reports/performance-data.ts`, add to the `PerformanceBucket` interface, after `cuppingDefects`:

```ts
  /** Supply-chain flow built from this bucket's APPROVED rows, bag-weighted. */
  sankey: SankeyLayoutResult | null
  sankeyColumns: string[]
  /** A 2-column chain (Shipper → Seller) says nothing a table doesn't; hidden. */
  showSankey: boolean
```

Delete these three lines from `PerformanceReportData`:

```ts
  sankey: SankeyLayoutResult | null
  sankeyColumns: string[]
  showSankey: boolean
```

- [ ] **Step 4: Add the builder and wire both buckets**

Add just above `getPerformanceReportData`:

```ts
/**
 * The bucket's supply-chain flow. Built from APPROVED rows only — a rejected lot
 * never moved through the chain — and weighted by bags, which PSS rows carry too
 * (quantities come from the sample, not the shipment stage).
 */
export function buildBucketSankey(
  rows: PerformanceRow[],
  byExporter: GroupPerf[],
  sankeyType: ClientSankeyType,
  clientDisplay: string,
): { sankey: SankeyLayoutResult | null; sankeyColumns: string[]; showSankey: boolean } {
  const approved = rows.filter(r => !r.is_rejected)
  const built = buildSankey(approved, scorecardFromExporters(byExporter), sankeyType, clientDisplay)
  return {
    sankey: built.layout,
    sankeyColumns: built.columns,
    showSankey: built.columns.length > 2,
  }
}
```

Add `type ClientSankeyType,` to the `from '@/lib/report-data'` import block if it is not already imported as a type there (it is — verify).

Replace the `pss` / `ss` bucket construction with:

```ts
  const pss: PerformanceBucket | null = pssRows
    ? {
        ...aggregateBucket(pssRows, 'count'),
        rows: pssRows,
        ...pssBreakdown,
        ...buildBucketSankey(pssRows, groupBy(pssRows, r => r.exporter_name), sankeyType, clientDisplay),
      }
    : null
  const ss: PerformanceBucket | null = ssRows
    ? {
        ...aggregateBucket(ssRows, 'bags'),
        rows: ssRows,
        ...ssBreakdown,
        ...buildBucketSankey(ssRows, groupBy(ssRows, r => r.exporter_name), sankeyType, clientDisplay),
      }
    : null
```

Delete the whole trailing block that begins `// Sankey from approved SS rows; shown only when >2 companies (3+ columns).` and the three `sankey` / `sankeyColumns` / `showSankey` entries in the returned object.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/reports/performance-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Move the fixture fields**

In `src/components/pdf/reports/performance-report.test.ts`:

- Add to the `bucket()` factory (after `rows: [...]`):

```ts
  sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
  sankeyColumns: ['Shipper', 'Seller', 'Importer'],
  showSankey: true,
```

- Delete the `sankey`, `sankeyColumns` and `showSankey` entries from the `base()` factory.
- In the four `base({ … })` call sites that currently pass `sankey: null, sankeyColumns: [], showSankey: false`, remove those three properties. Where the intent was "no Sankey", express it on the bucket instead — e.g. `base({ pss: bucket({ showSankey: false }), ss: null })`.

- [ ] **Step 7: Verify types and full suite**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/components/pdf/reports/performance-report.tsx` (it still reads `data.sankey`). Those are fixed in Task 9. If you want a green tree at this commit, apply the Task 9 Step 4 edit now; otherwise note the expected failure in the commit message.

Run: `npx vitest run src/lib/reports/performance-data.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/reports/performance-data.ts src/lib/reports/performance-data.test.ts src/components/pdf/reports/performance-report.test.ts
git commit -m "feat(reports): build the supply-chain flow per bucket so PSS gets one too"
```

---

## Task 6: Seller column and dual totals in the certificate appendix

**Files:**
- Modify: `src/components/pdf/reports/cert-appendix-table.tsx`
- Test: `src/components/pdf/reports/cert-appendix-table.test.ts`

**Interfaces:**
- Consumes: `WeeklySSCertRow` (unchanged).
- Produces:
  - `HiddenCols` gains `hideSeller?: boolean`
  - `shouldShowSeller(rows: WeeklySSCertRow[]): boolean`
  - `CertAppendixTable` prop `totals` becomes `{ approved: AppendixTotals; rejected: AppendixTotals }` where `AppendixTotals = { certificate_count: number; bag_count: number; mt: number }`
  - `CertAppendixTable` gains prop `hideSellerCol?: boolean`

- [ ] **Step 1: Write the failing test**

Replace the `describe('visibleCols', …)` block in `src/components/pdf/reports/cert-appendix-table.test.ts` with the version below, and add `shouldShowSeller` to the import from `./cert-appendix-table`:

```ts
describe('visibleCols', () => {
  const sums100 = (cols: Array<{ width: string }>) => {
    const sum = cols.reduce((s, c) => s + parseFloat(c.width), 0)
    expect(sum).toBeGreaterThan(99.9)
    expect(sum).toBeLessThan(100.1)
  }
  it('full SS layout has 12 columns summing to ~100%', () => {
    const cols = visibleCols()
    expect(cols.map(c => c.key)).toEqual([
      'date', 'cert', 'shipper', 'seller', 'importer', 'contract', 'roaster',
      'container', 'ico', 'bags', 'mt', 'status',
    ])
    sums100(cols)
  })
  it('drops roaster, container and seller columns on demand, widths renormalized', () => {
    const cols = visibleCols({ hideRoaster: true, hideContainer: true, hideSeller: true })
    expect(cols.find(c => c.key === 'roaster')).toBeUndefined()
    expect(cols.find(c => c.key === 'container')).toBeUndefined()
    expect(cols.find(c => c.key === 'seller')).toBeUndefined()
    sums100(cols)
  })
  it('PSS drops ICO + Container + Importer (single importer) columns', () => {
    const cols = visibleCols({ hideContainer: true, hideIco: true, hideImporter: true })
    expect(cols.find(c => c.key === 'ico')).toBeUndefined()
    expect(cols.find(c => c.key === 'importer')).toBeUndefined()
    expect(cols.find(c => c.key === 'container')).toBeUndefined()
    expect(cols.find(c => c.key === 'shipper')).toBeDefined()
    sums100(cols)
  })
})

describe('shouldShowSeller', () => {
  it('is true when any row has a seller different from its shipper', () => {
    expect(shouldShowSeller([
      row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH' }),
      row({ exporter_name: 'Ecom', seller_name: 'Ecom' }),
    ])).toBe(true)
  })
  it('is false when every seller repeats its shipper', () => {
    expect(shouldShowSeller([
      row({ exporter_name: 'Ecom', seller_name: 'Ecom' }),
      row({ exporter_name: 'Comexim', seller_name: ' comexim ' }),
    ])).toBe(false)
  })
  it('is false when no row records a seller', () => {
    expect(shouldShowSeller([row({ seller_name: null }), row({ seller_name: '  ' })])).toBe(false)
  })
})
```

Then replace both `totals: { certificate_count: 1, bag_count: 333, mt: 20.0 },` occurrences in the render tests with:

```ts
        totals: {
          approved: { certificate_count: 1, bag_count: 333, mt: 20.0 },
          rejected: { certificate_count: 1, bag_count: 333, mt: 20.0 },
        },
```

and add a new render test at the end of the `describe('CertAppendixTable', …)` block:

```ts
  it('renders an all-rejected table without a zeroed approved total', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row({ is_rejected: true }), row({ certificate_number: '36.688/26', is_rejected: true })],
        totals: {
          approved: { certificate_count: 0, bag_count: 0, mt: 0 },
          rejected: { certificate_count: 2, bag_count: 666, mt: 40.0 },
        },
        hideRoasterCol: false,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/reports/cert-appendix-table.test.ts`
Expected: FAIL — `shouldShowSeller is not a function`, and the 12-column assertion fails.

- [ ] **Step 3: Add the seller column**

In `src/components/pdf/reports/cert-appendix-table.tsx`:

Extend the `ColKey` union with `'seller'`:

```ts
type ColKey =
  | 'date' | 'cert' | 'shipper' | 'seller' | 'importer' | 'contract' | 'roaster'
  | 'container' | 'ico' | 'bags' | 'mt' | 'status'
```

Insert into `ALL_COLS` directly after the `shipper` entry, and lower `shipper` to weight 12:

```ts
  { key: 'shipper', label: 'Shipper', weight: 12 },
  { key: 'seller', label: 'Seller', weight: 12 },
```

Extend `HiddenCols` and `visibleCols`:

```ts
export interface HiddenCols {
  hideRoaster?: boolean
  hideContainer?: boolean
  hideIco?: boolean
  hideImporter?: boolean
  hideSeller?: boolean
}

export function visibleCols(hidden: HiddenCols = {}): Array<ColDef & { width: string }> {
  const cols = ALL_COLS.filter(c =>
    (c.key !== 'roaster' || !hidden.hideRoaster) &&
    (c.key !== 'container' || !hidden.hideContainer) &&
    (c.key !== 'ico' || !hidden.hideIco) &&
    (c.key !== 'importer' || !hidden.hideImporter) &&
    (c.key !== 'seller' || !hidden.hideSeller),
  )
  const total = cols.reduce((s, c) => c.weight + s, 0)
  return cols.map(c => ({ ...c, width: `${((c.weight / total) * 100).toFixed(2)}%` }))
}
```

Add the visibility rule below `visibleCols`:

```ts
/**
 * Whether the Seller column earns its width. Seller and shipper are often the
 * same company (Ecom sells and ships its own coffee); a column repeating the
 * shipper name adds nothing. Shown as soon as ONE row differs — e.g. Grano
 * ships what Volcafe sold.
 */
export function shouldShowSeller(rows: WeeklySSCertRow[]): boolean {
  return rows.some(r => {
    const seller = r.seller_name?.trim().toLowerCase()
    if (!seller) return false
    return seller !== (r.exporter_name?.trim().toLowerCase() ?? '')
  })
}
```

Add the cell case in `cellText`, directly after the `shipper` case:

```ts
    case 'seller': return r.seller_name || '—'
```

- [ ] **Step 4: Dual totals rows**

Replace `totalText` with:

```ts
export interface AppendixTotals {
  certificate_count: number
  bag_count: number
  mt: number
}

function totalText(key: ColKey, label: string, totals: AppendixTotals): string {
  switch (key) {
    case 'date': return label
    case 'cert': return String(totals.certificate_count)
    case 'bags': return totals.bag_count.toLocaleString('en-US')
    case 'mt': return totals.mt.toFixed(1)
    default: return ''
  }
}
```

Add a red totals colour beside the existing constants:

```ts
const RED_DARK = '#b91c1c'
```

Change the component signature — replace the `totals` prop type and add `hideSellerCol`:

```ts
export function CertAppendixTable({
  rows,
  totals,
  hideRoasterCol,
  hideContainerCol = false,
  hideIcoCol = false,
  hideImporterCol = false,
  hideSellerCol = false,
  emptyMessage = 'No certificates issued in this period.',
}: {
  rows: WeeklySSCertRow[]
  /** Two separate sums. A period with only rejections used to print a
   *  0 / 0 / 0.0 footer because totals were approved-only. */
  totals: { approved: AppendixTotals; rejected: AppendixTotals }
  hideRoasterCol: boolean
  /** PSS has no container — drop the column. */
  hideContainerCol?: boolean
  /** PSS has no ICO marks (shipment-only) — drop the column. */
  hideIcoCol?: boolean
  /** Single-importer periods drop the redundant Importer column. */
  hideImporterCol?: boolean
  /** Dropped when no row's seller differs from its shipper. */
  hideSellerCol?: boolean
  emptyMessage?: string
}) {
```

Add `hideSeller: hideSellerCol,` to the `visibleCols({ … })` call.

Replace the trailing totals block with:

```ts
      {totals.approved.certificate_count > 0 ? (
        <View style={styles.totalRow}>
          {cols.map(c => (
            <Text
              key={c.key}
              style={[styles.totalCell, { width: c.width }, c.align ? { textAlign: c.align } : {}]}
            >
              {totalText(c.key, 'Total approved', totals.approved)}
            </Text>
          ))}
        </View>
      ) : null}

      {totals.rejected.certificate_count > 0 ? (
        <View style={[styles.totalRow, { backgroundColor: RED_DARK }]}>
          {cols.map(c => (
            <Text
              key={c.key}
              style={[
                styles.totalCell,
                { width: c.width, borderRightColor: RED_DARK },
                c.align ? { textAlign: c.align } : {},
              ]}
            >
              {totalText(c.key, 'Total rejected', totals.rejected)}
            </Text>
          ))}
        </View>
      ) : null}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/pdf/reports/cert-appendix-table.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/pdf/reports/cert-appendix-table.tsx src/components/pdf/reports/cert-appendix-table.test.ts
git commit -m "feat(reports): seller column and separate approved/rejected totals in the appendix"
```

---

## Task 7: MT row in the grouped bar chart

**Files:**
- Modify: `src/components/pdf/charts/vertical-grouped-bar-chart.tsx`
- Create: `src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`

**Interfaces:**
- Produces: `GroupedBarCategory` gains `approvedMt: number`, `rejectedMt: number`.

- [ ] **Step 1: Write the failing test**

Create `src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { VerticalGroupedBarChart, niceAxisMax, type GroupedBarCategory } from './vertical-grouped-bar-chart'

const cat = (over: Partial<GroupedBarCategory> = {}): GroupedBarCategory => ({
  label: 'Comexim',
  approved: 3940,
  rejected: 0,
  approvedMt: 236.4,
  rejectedMt: 0,
  rejectionRate: 0,
  ...over,
})

describe('niceAxisMax', () => {
  it('rounds small maxima up by one', () => {
    expect(niceAxisMax(4)).toBe(5)
  })
  it('rounds large maxima to a clean tick', () => {
    expect(niceAxisMax(4320)).toBe(5000)
  })
  it('never returns zero', () => {
    expect(niceAxisMax(0)).toBe(1)
  })
})

describe('VerticalGroupedBarChart', () => {
  it('renders a grid with an MT row to a non-empty PDF', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(VerticalGroupedBarChart, {
        categories: [cat(), cat({ label: 'Ecom', approved: 4320, approvedMt: 259.2 })],
        metric: 'bags',
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`
Expected: FAIL — TypeScript object-literal excess-property error is not raised by vitest, so this may PASS at runtime. If it passes, that is fine; the assertion in Step 4 (`npx tsc --noEmit` reporting missing `approvedMt`) is the real red step.

- [ ] **Step 3: Add the MT row**

In `src/components/pdf/charts/vertical-grouped-bar-chart.tsx`, extend the interface:

```ts
export interface GroupedBarCategory {
  label: string
  approved: number
  rejected: number
  approvedMt: number // metric tons, 1 decimal
  rejectedMt: number // metric tons, 1 decimal
  rejectionRate: number // 0-100
}
```

Add the MT formatter beside `fmt`:

```ts
const fmtMt = (n: number) => (n > 0 ? n.toFixed(1) : '-')
```

Replace the final grid row (the one currently carrying `borderBottomWidth: 0` and the `Approved` label) with an Approved row followed by an MT row:

```ts
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}>Approved</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{dash(c.approved) === '-' ? '-' : fmt(c.approved, metric)}</Text>)}
        </View>
        {/* MT is listed regardless of the bar metric — the metric selects what
            the BARS encode, not what the grid reports. */}
        <View style={[styles.gridRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.gridLabel}>MT approved</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{fmtMt(c.approvedMt)}</Text>)}
        </View>
```

Update the file's header comment: the grid is now `Rejection rate / Rejected / Approved / MT approved`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/components/pdf/charts/vertical-grouped-bar-chart.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: errors in `src/components/pdf/reports/performance-report.tsx` only (`metricCats` does not yet supply `approvedMt`/`rejectedMt`). Fixed in Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/components/pdf/charts/vertical-grouped-bar-chart.tsx src/components/pdf/charts/vertical-grouped-bar-chart.test.ts
git commit -m "feat(reports): show MT beneath the grouped bar chart"
```

---

## Task 8: Supplier rating table component

**Files:**
- Create: `src/components/pdf/reports/supplier-rating-table.tsx`
- Create: `src/components/pdf/reports/supplier-rating-table.test.ts`

**Interfaces:**
- Consumes: `SupplierRatingRow` from Task 4.
- Produces: `<SupplierRatingTables shippers={…} sellers={…} windowLabel={…} limit={…} />`

- [ ] **Step 1: Write the failing test**

Create `src/components/pdf/reports/supplier-rating-table.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { SupplierRatingTables } from './supplier-rating-table'
import type { SupplierRatingRow } from '@/lib/reports/supplier-ratings'

const r = (over: Partial<SupplierRatingRow> = {}): SupplierRatingRow => ({
  rank: 1, name: 'Comexim', total: 41, pss: 12, ss: 29, approvalRate: 100, ...over,
})

const page = (el: React.ReactElement) =>
  React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' }, el))

describe('SupplierRatingTables', () => {
  it('renders both tables to a non-empty PDF', async () => {
    const buf = await renderToBuffer(page(React.createElement(SupplierRatingTables, {
      shippers: [r(), r({ rank: 2, name: 'Ecom', approvalRate: 97 })],
      sellers: [r({ name: 'Volcafe CH' })],
      windowLabel: 'Jan 01 – Jul 31',
    })) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renders nothing when both sides are empty', async () => {
    const buf = await renderToBuffer(page(React.createElement(SupplierRatingTables, {
      shippers: [], sellers: [], windowLabel: 'Jan 01 – Jul 31',
    })) as any)
    expect(buf.length).toBeGreaterThan(0)
  })

  it('caps each table at the given limit', async () => {
    const many = Array.from({ length: 20 }, (_, i) => r({ rank: i + 1, name: `Shipper ${i}` }))
    const buf = await renderToBuffer(page(React.createElement(SupplierRatingTables, {
      shippers: many, sellers: many, windowLabel: 'Jan 01 – Jul 31', limit: 8,
    })) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/reports/supplier-rating-table.test.ts`
Expected: FAIL — cannot resolve `./supplier-rating-table`.

- [ ] **Step 3: Implement the component**

Create `src/components/pdf/reports/supplier-rating-table.tsx`:

```tsx
/**
 * Year-to-date supplier rating — the report-side twin of the supplier-review
 * leaderboard, printed side by side for shippers and sellers.
 *
 * Inter is registered by certificate-styles.ts in 400/600/700 with NO italic;
 * never set fontStyle here or the whole render aborts.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { SupplierRatingRow } from '@/lib/reports/supplier-ratings'

const GREEN = '#556b2f'
const RED = '#ef4444'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

/** Rows per table. Beyond this the block stops fitting beside the flow chart. */
const DEFAULT_LIMIT = 8

const styles = StyleSheet.create({
  panel: { marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: '#222', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, marginTop: 4,
  },
  windowLabel: { fontSize: 8, color: '#888' },
  cols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  subLabel: {
    fontSize: 8.5, fontWeight: 700, color: '#555', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 4,
  },
  headerRow: { flexDirection: 'row', backgroundColor: '#F4F4F2' },
  headerCell: { fontSize: 7.5, fontWeight: 700, color: '#555', textTransform: 'uppercase', paddingVertical: 3, paddingHorizontal: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  cell: { fontSize: 8, color: '#222', paddingVertical: 3, paddingHorizontal: 4 },
  noneText: { fontSize: 9, color: '#888' },
})

const W_RANK = '8%'
const W_NAME = '42%'
const W_NUM = '12.5%'
const W_RATE = '12.5%'

const rateColor = (rate: number) => (rate >= 95 ? GREEN : rate >= 80 ? '#a9a454' : RED)

function RatingTable({ title, rows, limit }: { title: string; rows: SupplierRatingRow[]; limit: number }) {
  const shown = rows.slice(0, limit)
  return (
    <View style={styles.col}>
      <Text style={styles.subLabel}>{title}</Text>
      {shown.length === 0 ? (
        <Text style={styles.noneText}>No certificates this year.</Text>
      ) : (
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, { width: W_RANK }]}>#</Text>
            <Text style={[styles.headerCell, { width: W_NAME }]}>Name</Text>
            <Text style={[styles.headerCell, { width: W_NUM, textAlign: 'right' }]}>Certs</Text>
            <Text style={[styles.headerCell, { width: W_NUM, textAlign: 'right' }]}>PSS</Text>
            <Text style={[styles.headerCell, { width: W_NUM, textAlign: 'right' }]}>SS</Text>
            <Text style={[styles.headerCell, { width: W_RATE, textAlign: 'right' }]}>Appr.</Text>
          </View>
          {shown.map((r, idx) => (
            <View
              key={r.name}
              style={[styles.row, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#FFFFFF' }]}
              wrap={false}
            >
              <Text style={[styles.cell, { width: W_RANK }]}>{r.rank}</Text>
              <Text style={[styles.cell, { width: W_NAME }]}>{r.name}</Text>
              <Text style={[styles.cell, { width: W_NUM, textAlign: 'right' }]}>{r.total}</Text>
              <Text style={[styles.cell, { width: W_NUM, textAlign: 'right' }]}>{r.pss || '-'}</Text>
              <Text style={[styles.cell, { width: W_NUM, textAlign: 'right' }]}>{r.ss || '-'}</Text>
              <Text style={[styles.cell, { width: W_RATE, textAlign: 'right', color: rateColor(r.approvalRate), fontWeight: 700 }]}>
                {r.approvalRate}%
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

export function SupplierRatingTables({
  shippers,
  sellers,
  windowLabel,
  limit = DEFAULT_LIMIT,
}: {
  shippers: SupplierRatingRow[]
  sellers: SupplierRatingRow[]
  /** Human range, e.g. "Jan 01 – Jul 31". */
  windowLabel: string
  limit?: number
}) {
  if (shippers.length === 0 && sellers.length === 0) return null
  return (
    <View style={styles.panel} wrap={false}>
      <View style={styles.head}>
        <Text style={styles.sectionLabel}>Supplier rating · year to date</Text>
        <Text style={styles.windowLabel}>{windowLabel}</Text>
      </View>
      <View style={styles.cols}>
        <RatingTable title="By shipper" rows={shippers} limit={limit} />
        <RatingTable title="By seller" rows={sellers} limit={limit} />
      </View>
    </View>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/pdf/reports/supplier-rating-table.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pdf/reports/supplier-rating-table.tsx src/components/pdf/reports/supplier-rating-table.test.ts
git commit -m "feat(reports): supplier rating table component"
```

---

## Task 9: Wire the performance report template

**Files:**
- Modify: `src/components/pdf/reports/performance-report.tsx`
- Test: `src/components/pdf/reports/performance-report.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–8.
- Produces: `chartRowLayout(sellerCount, exporterCount)` — the first argument is now the **seller** count; the returned shape's key is renamed `importer` → `seller`.

- [ ] **Step 1: Write the failing test**

In `src/components/pdf/reports/performance-report.test.ts`, replace the `describe('chartRowLayout', …)` block with:

```ts
describe('chartRowLayout', () => {
  it('single seller, multi exporter → seller donut + exporter bars', () => {
    expect(chartRowLayout(1, 5)).toEqual({ mode: 'split', seller: 'donut', exporter: 'bars' })
  })
  it('multi seller, single exporter → seller bars + exporter donut', () => {
    expect(chartRowLayout(4, 1)).toEqual({ mode: 'split', seller: 'bars', exporter: 'donut' })
  })
  it('both multi → 2-up bars', () => {
    expect(chartRowLayout(3, 4)).toEqual({ mode: 'split', seller: 'bars', exporter: 'bars' })
  })
  it('both single → identity card (names nobody via a chart)', () => {
    expect(chartRowLayout(1, 1)).toEqual({ mode: 'identity', seller: 'none', exporter: 'donut' })
  })
  it('empty bucket (0 companies) → identity card', () => {
    expect(chartRowLayout(0, 0)).toEqual({ mode: 'identity', seller: 'none', exporter: 'donut' })
  })
})
```

and add a render test at the end of the `describe('PerformanceReport', …)` block:

```ts
  it('renders a PSS-only report that still carries its own Sankey', async () => {
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ ss: null, pss: bucket({ showSankey: true }) }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/reports/performance-report.test.ts`
Expected: FAIL — `chartRowLayout` still returns an `importer` key.

- [ ] **Step 3: Rename the layout to the seller axis**

In `src/components/pdf/reports/performance-report.tsx`, replace the `ChartRowLayout` interface and `chartRowLayout` function with:

```ts
export interface ChartRowLayout {
  /** `identity` → both sides single company: a bar/donut names nobody, so we
   *  render a counterparty identity card instead. `split` → at least one side
   *  has multiple companies and gets a bar chart. */
  mode: 'identity' | 'split'
  seller: 'donut' | 'bars' | 'none'
  exporter: 'donut' | 'bars'
}

/**
 * Decide the Page-A chart row shape. A side with one (or zero) company is a
 * redundant single bar → compact donut. When BOTH sides are single, bars and
 * donuts name nobody, so the row becomes a counterparty identity card.
 *
 * The first slot shows the SELLER, not the importer: the importer is usually a
 * single company (the QC client itself), so that chart named nobody, while
 * seller and shipper regularly differ and are what the client wants compared.
 * The importer stays visible in the identity card and the appendix table.
 */
export function chartRowLayout(sellerCount: number, exporterCount: number): ChartRowLayout {
  const sellerSingle = sellerCount <= 1
  const exporterSingle = exporterCount <= 1
  if (sellerSingle && exporterSingle) {
    return { mode: 'identity', seller: 'none', exporter: 'donut' }
  }
  return {
    mode: 'split',
    seller: sellerSingle ? 'donut' : 'bars',
    exporter: exporterSingle ? 'donut' : 'bars',
  }
}
```

- [ ] **Step 4: KPI band, chart row, and the MT-aware category mapper**

Replace `metricCats` with:

```ts
function metricCats(groups: PerformanceBucket['byExporter'], metric: 'count' | 'bags'): GroupedBarCategory[] {
  return groups.slice(0, 6).map(g => ({
    label: g.name,
    approved: metric === 'bags' ? g.approvedBags : g.approvedCount,
    rejected: metric === 'bags' ? g.rejectedBags : g.rejectedCount,
    approvedMt: g.approvedMt,
    rejectedMt: g.rejectedMt,
    rejectionRate: g.rejectionRate,
  }))
}
```

Replace the `KpiBand` component with:

```tsx
  const KpiBand = ({ b, kind }: { b: PerformanceBucket; kind: BucketKind }) => {
    // The trade counts contracts, not certificates: one contract carries several
    // containers (FCL), each with its own certificate. PSS has no container, so
    // it carries no FCL item.
    const items: { label: string; value: string | number; color?: string }[] = [
      { label: 'Contracts', value: b.totals.contracts },
    ]
    if (kind === 'SS') items.push({ label: 'FCL', value: b.totals.fcl })
    items.push(
      { label: 'Approved', value: b.totals.approved, color: GREEN },
      { label: 'Rejected', value: b.totals.rejected, color: b.totals.rejected > 0 ? RED : '#222' },
      { label: 'Rej. rate', value: `${b.totals.rejectionRate}%`, color: rateColor(b.totals.rejectionRate) },
      { label: 'Bags', value: b.totals.bagsApproved.toLocaleString('en-US') },
      { label: 'MT', value: b.totals.mtApproved.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
    )
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
```

In `IdentityCard`, replace the `stats` block so both buckets report contracts, bags and MT:

```tsx
    const stats: Array<[string, string, string?]> = [
      ['Contracts', String(b.totals.contracts)],
      ['Approved', String(b.totals.approved), GREEN],
      ['Rejected', String(b.totals.rejected), b.totals.rejected > 0 ? RED : '#222'],
      ['Bags', b.totals.bagsApproved.toLocaleString('en-US')],
      ['MT', b.totals.mtApproved.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })],
    ]
    if (kind === 'SS') stats.splice(1, 0, ['FCL', String(b.totals.fcl)])
```

and delete the `if (kind === 'SS') { stats.push(…) }` block that followed it.

In `ChartsPage`, change the layout call and the first chart slot:

```tsx
    const layout = chartRowLayout(b.bySeller.length, b.byExporter.length)
```

```tsx
            {layout.seller === 'donut' && <StatusDonut b={b} />}
            {layout.seller === 'bars' && (
              <View style={styles.chartFlex}>
                <Text style={styles.chartColTitle}>Seller {kind}</Text>
                <VerticalGroupedBarChart categories={metricCats(b.bySeller, metric)} metric={metric} width={barWidth} />
              </View>
            )}
```

and update the `bothBars` line to read from the renamed key:

```tsx
    const bothBars = layout.seller === 'bars' && layout.exporter === 'bars'
```

- [ ] **Step 5: Page B — per-bucket Sankey, ratings, region MT, appendix wiring**

Add the imports at the top of the file:

```ts
import { SupplierRatingTables } from './supplier-rating-table'
import { shouldShowSeller } from './cert-appendix-table'
import type { GroupedBarCategory } from '@/components/pdf/charts/vertical-grouped-bar-chart'
```

(`GroupedBarCategory` is already imported alongside `VerticalGroupedBarChart` — merge rather than duplicate.)

Add an MT column to `RegionTable` — replace its body with:

```tsx
function RegionTable({ title, rows, metric, accent }: RegionTableProps) {
  const total = rows.reduce((s, r) => s + (metric === 'bags' ? r.bags : r.count), 0)
  const totalMt = Math.round(rows.reduce((s, r) => s + r.mt, 0) * 10) / 10
  return (
    <View style={styles.regionPanel}>
      <Text style={[styles.rHeadCell, { color: accent, marginBottom: 4 }]}>{title}</Text>
      <View style={styles.regionHead}>
        <Text style={[styles.rHeadCell, { flex: 1 }]}>Region</Text>
        {metric === 'bags' && <Text style={[styles.rHeadCell, { width: 50, textAlign: 'right' }]}>Bags</Text>}
        <Text style={[styles.rHeadCell, { width: 44, textAlign: 'right' }]}>MT</Text>
        <Text style={[styles.rHeadCell, { width: 36, textAlign: 'right' }]}>%</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.regionRow}><Text style={[styles.rCell, { color: '#888' }]}>None</Text></View>
      ) : rows.map(r => (
        <View key={r.region} style={styles.regionRow}>
          <Text style={[styles.rCell, { flex: 1 }]}>{r.count} - {r.region}</Text>
          {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right' }]}>{r.bags.toLocaleString('en-US')}</Text>}
          <Text style={[styles.rCell, { width: 44, textAlign: 'right' }]}>{r.mt.toFixed(1)}</Text>
          <Text style={[styles.rCell, { width: 36, textAlign: 'right' }]}>{r.pct}%</Text>
        </View>
      ))}
      <View style={styles.regionTotal}>
        <Text style={[styles.rCell, { flex: 1, fontWeight: 700 }]}>Total</Text>
        {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right', fontWeight: 700 }]}>{total.toLocaleString('en-US')}</Text>}
        <Text style={[styles.rCell, { width: 44, textAlign: 'right', fontWeight: 700 }]}>{totalMt.toFixed(1)}</Text>
        <Text style={[styles.rCell, { width: 36, textAlign: 'right', fontWeight: 700 }]}>100%</Text>
      </View>
    </View>
  )
}
```

Replace the whole `CertsPage` component with:

```tsx
  // Page B: region tables, the bucket's own supply-chain flow, the year-to-date
  // supplier rating, then the all-certs appendix.
  const CertsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => {
    // Hide the region breakdown entirely when no cert carries a real region
    // (everything would collapse to a single "Unspecified" row).
    const hasRegions = [...b.approvedByRegion, ...b.rejectedByRegion].some(r => r.region !== 'Unspecified')
    return (
    <>
      {hasRegions && (
        <View style={styles.twoCol}>
          <RegionTable title="Approved certificates" rows={b.approvedByRegion} metric={metric} accent={GREEN} />
          <RegionTable title="Rejected certificates" rows={b.rejectedByRegion} metric={metric} accent={RED} />
        </View>
      )}
      {b.showSankey && b.sankey && (
        <View style={styles.panel} wrap={false}>
          <Text style={styles.sectionLabel}>Supply chain flow</Text>
          <SankeyChart layout={b.sankey} columnLabels={b.sankeyColumns} />
        </View>
      )}
      <SupplierRatingTables
        shippers={data.ratings.shippers}
        sellers={data.ratings.sellers}
        windowLabel={ytdRange}
      />
      <CertAppendixTable
        rows={sortAppendixRows(b.rows)}
        totals={{
          approved: { certificate_count: b.totals.approved, bag_count: b.totals.bagsApproved, mt: b.totals.mtApproved },
          rejected: { certificate_count: b.totals.rejected, bag_count: b.totals.bagsRejected, mt: b.totals.mtRejected },
        }}
        hideRoasterCol={data.client.is_roaster}
        hideContainerCol={kind === 'PSS'}
        hideIcoCol={kind === 'PSS'}
        hideImporterCol={b.byImporter.length <= 1}
        hideSellerCol={!shouldShowSeller(b.rows)}
        emptyMessage={`No ${kind} certificates issued in this period.`}
      />
    </>
    )
  }
```

Add the YTD range label next to the existing `range` computation near the top of `PerformanceReport`:

```tsx
  const ytdDisplayEnd = new Date(new Date(data.ratings.window.end).getTime() - 86400000)
  const ytdRange = `${formatShortDate(data.ratings.window.start)} – ${formatShortDate(ytdDisplayEnd.toISOString())}`
```

Update the file's header comment: Page B now carries region tables, the bucket Sankey, the YTD supplier rating and the appendix; the Sankey is no longer SS-only.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/pdf/reports/performance-report.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 7: Verify Page-A fit with real Inter**

The KPI band grew by up to two items and the chart grid by one row. **Do not judge fit from the vitest output** — the test environment substitutes a Noto shim for Inter and reports false overflow. Judge it from a PDF produced by the running app, which registers the real Inter through `certificate-styles.ts`:

```bash
npm run dev
# in another shell, signed in so the session cookie is present:
open "http://localhost:3000/api/reports/biweekly?client_id=<AHOLD_COMPANY_ID>&start_date=2026-07-01&end_date=2026-08-01"
```

Get `<AHOLD_COMPANY_ID>` from the client picker on `/dashboard/reports`, or from the `client_id` query parameter the page already sends when you preview a report there.

If the dev server cannot reach the font CDN (IPv6 routing on macOS has bitten this before), the render throws "Could not resolve font" rather than laying out badly — that is a network problem, not a layout one; retry over IPv4.

Confirm on both the PSS and SS Page A: the KPI band fits on one line, the chart grid's MT row is not clipped, and the rejection-reasons block still lands on the same page. If the band wraps, reduce `styles.kpiValue` to `fontSize: 12` and `styles.kpiLabel` to `fontSize: 7`.

- [ ] **Step 8: Commit**

```bash
git add src/components/pdf/reports/performance-report.tsx src/components/pdf/reports/performance-report.test.ts
git commit -m "feat(reports): contracts/FCL/MT band, seller chart, per-bucket Sankey and YTD rating"
```

---

## Task 10: Annual report — seller pages and MT

**Files:**
- Modify: `src/components/pdf/reports/annual-performance-report.tsx`
- Test: `src/components/pdf/reports/annual-performance-report.test.ts` *(create if absent)*

**Interfaces:**
- Consumes: `GroupPerf` with `approvedMt`/`rejectedMt` (Task 3), `AnnualAggregates.bySellerPss` / `.bySellerSs` (already present).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Create `src/components/pdf/reports/annual-performance-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { AnnualPerformanceReport } from './annual-performance-report'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'
import type { AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import type { GroupPerf } from '@/lib/reports/performance-data'

const g = (over: Partial<GroupPerf> = {}): GroupPerf => ({
  name: 'Comexim', approvedCount: 12, rejectedCount: 1,
  approvedBags: 4320, rejectedBags: 360, approvedMt: 259.2, rejectedMt: 21.6,
  rejectionRate: 8, ...over,
})

const bucketAgg = () => ({
  totals: {
    evaluated: 13, approved: 12, rejected: 1, rejectionRate: 8,
    bagsApproved: 4320, mtApproved: 259.2, bagsRejected: 360, mtRejected: 21.6,
    contracts: 7, fcl: 13,
  },
  byImporter: [g({ name: 'Ahold' })],
  bySeller: [g({ name: 'Volcafe CH' })],
  byExporter: [g(), g({ name: 'Ecom', rejectedCount: 0, rejectedBags: 0, rejectedMt: 0, rejectionRate: 0 })],
  rejectionReasons: [{ category: 'Cupping faults', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 12, bags: 4320, mt: 259.2, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 360, mt: 21.6, pct: 100 }],
})

const data: AnnualPerformanceReportData = {
  client: { id: 'c', name: 'Ahold', logo_url: null, is_roaster: true, sankey_type: 'roaster' },
  period: { year: 2026, issued_at: '2026-12-31T00:00:00Z' },
  origin: 'Brazil',
  agg: {
    hero: { samplesEvaluated: 26, overallApprovalRate: 92, bagsCleared: 4320, rejections: 2, overallRejectionRate: 8 },
    pss: bucketAgg(),
    ss: bucketAgg(),
    bySellerPss: [g({ name: 'Volcafe CH' })],
    bySellerSs: [g({ name: 'Volcafe CH' }), g({ name: 'Rothfos GmbH' })],
    byOrigin: [g({ name: 'Brazil' })],
    byLab: [g({ name: 'Santos' })],
    labsCovered: ['Santos'],
    originsCovered: ['Brazil'],
    monthly: [],
    sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
    sankeyColumns: ['Shipper', 'Seller', 'Importer'],
    showSankey: true,
  },
}

describe('AnnualPerformanceReport', () => {
  it('renders the full report including seller pages', async () => {
    const buf = await renderToBuffer(React.createElement(AnnualPerformanceReport, { data }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pdf/reports/annual-performance-report.test.ts`
Expected: FAIL — `bucketAgg()` supplies `bySeller`, which `BucketAggregate` only gained in Task 3; if Task 3 is done this compiles, and the test passes trivially. The real red step is the assertion added in Step 4.

- [ ] **Step 3: Parameterize `PerfTable` and add MT columns**

In `src/components/pdf/reports/annual-performance-report.tsx`, replace `PerfTable` with:

```tsx
// A reusable performance table: <name> | APP | REJ | TOTAL | MT APP | MT REJ | %APP | %REJ + TOTAL GERAL.
function PerfTable({
  rows,
  basisLabel,
  nameHeader = 'Exporter',
}: {
  rows: GroupPerf[]
  basisLabel: 'count' | 'bags'
  nameHeader?: string
}) {
  const val = (g: GroupPerf, kind: 'app' | 'rej' | 'tot') => {
    const app = basisLabel === 'bags' ? g.approvedBags : g.approvedCount
    const rej = basisLabel === 'bags' ? g.rejectedBags : g.rejectedCount
    return kind === 'app' ? app : kind === 'rej' ? rej : app + rej
  }
  const tot = rows.reduce(
    (a, g) => ({
      app: a.app + val(g, 'app'),
      rej: a.rej + val(g, 'rej'),
      mtApp: a.mtApp + g.approvedMt,
      mtRej: a.mtRej + g.rejectedMt,
    }),
    { app: 0, rej: 0, mtApp: 0, mtRej: 0 },
  )
  const grand = tot.app + tot.rej
  const p = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  return (
    <View style={s.table}>
      <View style={s.tr}>
        <Text style={[s.th, s.cellName]}>{nameHeader}</Text>
        <Text style={[s.th, s.cellNum]}>APP</Text>
        <Text style={[s.th, s.cellNum]}>REJ</Text>
        <Text style={[s.th, s.cellNum]}>TOTAL</Text>
        <Text style={[s.th, s.cellNum]}>MT APP</Text>
        <Text style={[s.th, s.cellNum]}>MT REJ</Text>
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
            <Text style={s.cellNum}>{g.approvedMt.toFixed(1)}</Text>
            <Text style={s.cellNum}>{g.rejectedMt.toFixed(1)}</Text>
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
        <Text style={[s.cellNum, s.semibold]}>{tot.mtApp.toFixed(1)}</Text>
        <Text style={[s.cellNum, s.semibold]}>{tot.mtRej.toFixed(1)}</Text>
        <Text style={[s.cellNum, s.semibold]}>{p(tot.app, grand)}%</Text>
        <Text style={[s.cellNum, s.semibold]}>{p(tot.rej, grand)}%</Text>
      </View>
    </View>
  )
}
```

Replace `BreakdownBlock` with the MT-carrying version:

```tsx
// Compact ranked block: name + volume + MT + approval-rate trailing label.
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
            <Text style={s.cellNum}>{g.approvedMt.toFixed(1)} MT</Text>
            <Text style={[s.cellNum, { color: rate >= 90 ? OLIVE : rate >= 70 ? INK : RED }]}>{rate}%</Text>
          </View>
        )
      })}
    </View>
  )
}
```

- [ ] **Step 4: Add the seller pages**

Insert two new `<Page>` blocks directly after the existing page 4 (`Shipment (SS) Performance · by bags`) and before page 5 (`Top Rejection Reasons`):

```tsx
      {/* 4b — PSS seller performance (count) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Pre-Shipment (PSS) Seller Performance · by sample</Text></View>
        <PerfTable rows={agg.bySellerPss} basisLabel="count" nameHeader="Seller" />
        <Footer year={period.year} />
      </Page>

      {/* 4c — SS seller performance (bags) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Shipment (SS) Seller Performance · by bags</Text></View>
        <PerfTable rows={agg.bySellerSs} basisLabel="bags" nameHeader="Seller" />
        <Footer year={period.year} />
      </Page>
```

Add `nameHeader="Exporter"` explicitly to the two existing exporter `PerfTable` call sites so the intent is readable at both.

Update the file's header comment: the page range is now 1–13 (with page 12 the landscape year Sankey), and the Methodology page notes that seller figures share the exporter basis.

Add to the assertion in the test from Step 1, inside `describe('AnnualPerformanceReport', …)`:

```ts
  it('renders with empty seller lists (no seller ever recorded)', async () => {
    const bare = { ...data, agg: { ...data.agg, bySellerPss: [], bySellerSs: [] } }
    const buf = await renderToBuffer(React.createElement(AnnualPerformanceReport, { data: bare }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/components/pdf/reports/annual-performance-report.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 6: Verify the annual PDF visually**

```bash
npm run dev
# with a valid session cookie:
open "http://localhost:3000/api/reports/annual?client_id=<AHOLD_COMPANY_ID>&year=2026"
```

Confirm: the two new Seller pages render with populated tables; MT APP / MT REJ columns are not clipped on the exporter or seller tables; the Sankey page now renders (it was suppressed before the Task 2 fix).

- [ ] **Step 7: Commit**

```bash
git add src/components/pdf/reports/annual-performance-report.tsx src/components/pdf/reports/annual-performance-report.test.ts
git commit -m "feat(annual report): seller performance pages and MT columns"
```

---

## Final verification

- [ ] **Run the whole suite**

Run: `npm run test:run`
Expected: PASS, no skipped report tests.

- [ ] **Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Cross-client Sankey sanity check**

The roaster-precedence change in Task 2 alters the flow shape for **every** client typed both roaster and buyer, not only Ahold. Generate a bi-weekly report for one other QC client and confirm its Sankey columns still read sensibly and the importer column is not mislabelled with the client's own name where a real importer FK exists.

- [ ] **Daily-results email spot check**

From `/certificates`, open the batch send composer for a day with at least one approved and one rejected certificate. Confirm the Quality column appears in the preview for both the buyer and the seller unit, and that a sample with no quality spec renders `—` rather than blank or `undefined`.

- [ ] **Push**

```bash
git push origin main
```

Vercel auto-deploys `main` to production.
