# Report Restructure — SS / PSS / SS+PSS Unified Engine

**Date:** 2026-07-06
**Status:** Approved by Daniel (brainstorming session)
**Scope:** Web app only. No database migration. Annual report untouched.

## Problem

Today the Reports page offers two period reports built from two separate PDF
templates that have started to drift:

- **Weekly SS Certificates** (`weekly-ss-certs-report.tsx`) — SS-only, older
  visual style.
- **Bi-Weekly Performance** (`biweekly-performance-report.tsx`) — PSS + SS,
  newer style, but its pages overflow (react-pdf auto-wrap splits a chart
  across two pages) and there is no PSS-only report.

Known bugs to fix along the way:

1. **Big-bag counts wrong.** `mapCertRowToReportRow` prefers raw `bag_count`
   over `equivalent_60kg_bags`, so a 20-big-bag contract shows "20" instead of
   ~333. 59 kg bags are also not converted.
2. **Double pagination.** The bi-weekly bucket content exceeds one A4
   landscape page, so react-pdf wraps mid-chart.
3. **Single-importer waste.** For clients like Ahold (always one importer) the
   Importer bar chart is a single redundant bar pair.

## Decision summary

| Question | Decision |
|---|---|
| Report lineup | 4 cards: **SS Report**, **PSS Report** (new), **SS+PSS Report**, **Annual** (unchanged) |
| Date presets | All 3 period cards get the same 4 presets: Last week (Mon–Fri), This week (Mon–Fri), 1st half (1–15), 2nd half (16–end), plus free date pickers |
| Single-company side | Collapse that side's bar chart to a compact approved/rejected **donut**; Rejection Reasons joins the row 3-up |
| Appendix | **One** chronological table of ALL certs with a green/red Status column (not approved-only, not two tables) |
| Bags figure | Always the **60 kg equivalent**, computed kg-first (see below); add **MT** column in appendix + MT total in SS KPI band |
| Architecture | **Approach A** — one unified template + one generalized data fetcher; old route URLs preserved; old weekly-SS template deleted |

## Architecture

### One PDF template, bucket composition

`src/components/pdf/reports/biweekly-performance-report.tsx` →
`performance-report.tsx`, taking `buckets: ('pss' | 'ss')[]`. Each bucket
renders a **two-page pair** (A4 landscape, same header/footer/title-bar
chrome as today):

**Page A — charts**

- Title bar: `Pre-Shipment Samples · <range>` / `Shipment Samples · <range>`.
- KPI band. PSS: Certs · Approved · Rejected · Rej. rate. SS adds: Bags · MT.
- Chart row, adaptive:
  - If importer side has exactly 1 company AND/OR exporter side has exactly
    1 company, the single-company side(s) render as a compact **donut**
    (bucket totals approved vs rejected, existing
    `src/components/pdf/charts/donut-chart.tsx`) and Rejection Reasons joins
    the row → 3-up: `[importer viz] [exporter viz] [rejection reasons]`.
  - If both sides have multiple companies: today's 2-up bar layout stays and
    Rejection Reasons keeps its full-width panel below.
- Every chart panel gets `wrap={false}` so react-pdf can never split one.
  Page A content is fixed-size and always fits one page → kills the
  double-pagination bug structurally.

**Page B — certificates**

- Approved-by-region / Rejected-by-region tables (top, side by side; PSS
  metric = count, SS metric = bags, as today).
- SS only: when the Sankey has 3+ columns it renders as a panel between the
  region tables and the appendix (same `showSankey` rule as today).
- Cert appendix: one chronological table of **all** certs in the bucket.
  - SS columns: Approval date, Certificate #, Shipper, Importer, Importer
    contract, Container, ICO marks, Bags, **MT**, **Status**.
  - PSS columns: same minus Container.
  - Status cell: "Approved" in green `#556b2f` / "Rejected" in red `#ef4444`.
  - Totals row sums Bags and MT (approved only — matches the KPI band).
  - Table paginates row-by-row (the existing `ss-cert-appendix-table.tsx`
    behavior), extended with the new columns and a `hideContainerCol` /
    status support. Only the appendix may flow onto extra pages.

Page composition per report:

- **PSS Report** = PSS pages A+B (2 pages).
- **SS Report** = SS pages A+B (2 pages + appendix overflow).
- **SS+PSS Report** = PSS A, PSS B, SS A, SS B.
- Footer page labels computed from the actual page list ("Page n of m").

`weekly-ss-certs-report.tsx` is **deleted**. Its `donut-chart.tsx` usage
carries over; `kpi-card.tsx` remains unused by this engine.

### Data layer

`src/lib/reports/biweekly-data.ts` → `performance-data.ts`:

- `getPerformanceReportData(supabase, { clientId, startDate, endDate, buckets })`
  — same query and aggregation as today, returning only the requested
  buckets. `BiweeklyRow` → `PerformanceRow`, `BiweeklyPerformanceReportData`
  → `PerformanceReportData` with `pss?: BucketAggregate`, `ss?: BucketAggregate`.
- Appendix rows: expose **all** rows per bucket (approved + rejected), not
  just `ssApprovedRows`; rows carry `is_rejected` already.
- The certificates select adds `bag_weight_kg` to the sample sub-select
  (needed for the bags rule). `micro_origin` stays.
- `weekly-ss-generator.ts` and the weekly-specific fetch path in
  `report-data.ts` are retired where superseded; `mapCertRowToReportRow`,
  `categorizeViolation`, `buildSankey` remain shared in `report-data.ts`.

### Bags & MT rule (fixes all reports at once)

In `mapCertRowToReportRow` (`src/lib/report-data.ts`), replace
`bag_count ?? equivalent_60kg_bags` with a kg-first computation
(TypeScript, not SQL — no migration):

```ts
// Total weight in kg, best available source first:
const kg =
  eq60 != null            ? eq60 * 60 :
  bagCount != null && bagWeightKg != null ? bagCount * bagWeightKg :
  mt != null              ? mt * 1000 :
  bagCount != null        ? bagCount * 60 :   // last resort: assume 60 kg bags
  null

const bags = kg != null ? Math.round(kg / 60) : null   // 60 kg equivalent
const mtOut = kg != null ? Math.round(kg / 100) / 10 : null // 1 decimal
```

- Handles 1000 kg big bags (20 × 1000 kg → 333 bags / 20.0 MT) and 59 kg
  bags (300 × 59 kg → 295 bags / 17.7 MT).
- `WeeklySSCertRow` gains `mt: number | null`; all aggregations
  (`GroupPerf.approvedBags`, KPI `bagsApproved`, Sankey link weights,
  region bags) keep using the corrected `bags`.
- KPI band SS adds `MT` total = sum of approved rows' `mt`.

### Routes & UI

**API routes** (all reuse the one generator/template):

- `GET/POST /api/reports/pss` + `/api/reports/pss/send` — **new**, clones the
  biweekly route pair with `buckets: ['pss']`, label "PSS Report".
- `/api/reports/weekly-ss` (+ `/send`) — re-pointed to the engine with
  `buckets: ['ss']`, label "SS Report". URL unchanged.
- `/api/reports/biweekly` (+ `/send`) — engine with `buckets: ['pss','ss']`,
  label "SS+PSS Report". URL unchanged.
- Filenames: `SS-Report-<client>-<start>.pdf`, `PSS-Report-…`,
  `SS-PSS-Report-…`.

**Reports page** (`src/app/dashboard/reports/page.tsx`):

- Extract `PeriodReportCard` (title, description, own start/end state,
  4 preset buttons, preview button) rendered 3×; Annual card unchanged.
- Grid becomes 4 cards (2×2 on lg).
- `preview-report-modal.tsx`: add `PSS_KIND`; relabel `WEEKLY_SS_KIND` →
  "SS Report", `BIWEEKLY_KIND` → "SS+PSS Report". `reportType` string values
  stay (`weekly_ss` / `biweekly`) to avoid touching the send plumbing;
  new `pss` value added.
- Default dates: SS + PSS cards default to previous work week; SS+PSS card
  defaults to previous half-month (as today).

## Error handling

Unchanged from today's routes: 4xx on missing/invalid params, 404 when the
client is not found. A bucket with zero certificates still renders its pages —
zeroed KPI band, "None" region rows, and an empty appendix ("No certificates
in this period" row) — rather than failing.

## Testing

- **Bags/MT rule** (new unit tests): eq60-set, 59 kg bags, 1000 kg big bags,
  MT-only, bag_count-only, all-null.
- **Aggregation**: existing `biweekly-data.test.ts` migrates to
  `performance-data.test.ts`; add a case asserting appendix rows include
  rejected certs.
- **Layout decision** (pure helper): 1 importer → donut+3-up; multi/multi →
  2-up + full-width reasons.
- **Appendix table**: existing `ss-cert-appendix-table.test.ts` extended for
  Status + MT columns and the PSS (no Container) variant.
- Manual: preview all three reports for Ahold (single-importer donut path,
  big-bag contracts) and a multi-importer client; verify no chart is ever
  split across pages.

## Out of scope

- Annual report rework (separate effort).
- Scheduled/automated delivery.
- Any database schema change.
