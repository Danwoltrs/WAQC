# Bi-Weekly Performance Report — Design

**Date:** 2026-06-22
**Status:** Approved (pending spec review)
**Report type key:** `biweekly` (already reserved in `VALID_REPORT_TYPES`)
**Example:** `docs/report_examples/Brazil_Report_week_4_15_days.pdf`

## 1. Goal

Add a second client-facing report — the **Bi-Weekly Performance Report** — covering a
~15-day window for one QC client. It is a **superset of the Weekly SS report**: it splits
the period into **Pre-Shipment Samples (PSS)** and **Shipment Samples (SS)**, reports
**approved AND rejected** for both, surfaces **rejection reasons**, breaks results down by
**importer**, **exporter (shipper)**, and **region**, and finally appends the Weekly's
approved-SS per-certificate listing.

It reuses the proven Weekly pipeline (`certificates ⋈ samples`, the `@react-pdf/renderer`
template stack, the recipients/preview/send plumbing) and is rendered in the same
**redesigned visual style** (KPI strips, rounded panels, Wolthers green `#556b2f`, Inter).

This is report 2 of 2 remaining. Report 3 (`annual`) is **out of scope** for this spec — it
is larger and its example is a spreadsheet, so its output format is a separate decision.

## 2. Report semantics (data definitions)

The report is run for **one QC client** over **one date window** `[start, end]`. A single
`certificates ⋈ samples` query (mirrors `getWeeklySSCertReportData`, but with **no
`sample_type` filter**) is fetched, then partitioned in memory:

- **PSS bucket** = rows where `sample_type = 'pss'`
- **SS bucket** = rows where `sample_type = 'ss'`

Rows of `sample_type` `'type'` / `'specialty'` are ignored (consistent with the Weekly report,
which is SS-only).

Field mapping (verified against schema + existing code):

| Concept | Source |
|---|---|
| Decision date ("approval date") | `certificates.created_at` |
| Approved vs rejected | `certificates.is_rejected` |
| Importer | `samples.importer (companies.name)`, with the same roaster-client fallback to client name as the Weekly report |
| Exporter / "Shipper" | `samples.exporter (companies.name)` |
| Buyer reference (e.g. `IR0005918-1`) | `samples.buyer_contract_nr` |
| Region | `samples.micro_origin` (labeled "Region" in `certificate-sample-details.tsx`) |
| Shipment month (`Feb'26`) | `samples.shipment_month` (`YYYY-MM`), via the existing month formatter |
| Bags | `bag_count ?? equivalent_60kg_bags`, rounded |
| Rejection reasons | `certificates.compliance_violations` → existing `categorizeViolation()` |

Per bucket (PSS and SS) the fetcher computes:

- **Header totals:** evaluated count, approved count, rejected count, rejection rate (%),
  and (SS only) approved bag count.
- **Per-importer** approved/rejected counts + rejection rate.
- **Per-exporter (shipper)** approved/rejected counts + rejection rate.
- **Rejection reasons** (count per `categorizeViolation` bucket; `Other` filtered from display
  as the Weekly report already does).
- **By-region breakdown**, split approved vs rejected:
  - PSS: by **certificate count** + % of total.
  - SS: by **bag count** + % of total (region table carries a Bags column).

The SS bucket additionally yields the **approved-SS appendix rows** (the existing
`WeeklySSCertRow` shape) for page 3.

**Rejection-reason note:** the example's "Low Balance" is the friendly rendering of a
`Balance below min` compliance violation — confirming `compliance_violations` +
`categorizeViolation()` is the correct, already-built source. No new rejection field.

## 3. Architecture & approach

**Chosen approach: one new fetcher reusing the Weekly pipeline.** Add
`getBiweeklyPerformanceReportData()` next to `getWeeklySSCertReportData()` in
`src/lib/report-data.ts`. Extract the shared bits so the two reports cannot drift:

- `mapCertRowToReportRow(cert)` → `WeeklySSCertRow` (the per-row field mapping currently
  inline in the Weekly fetcher).
- `categorizeViolation()` (already module-private; reused directly).
- `buildSankey()` (already present; reused for the conditional SS Sankey).

Rejected alternative: run `getWeeklySSCertReportData()` for the appendix and a second query
for PSS analytics. More round-trips and two code paths that map the same fields — higher
drift risk. One query + in-memory split is simpler and cheaper.

`report-data.ts` is currently 464 lines; the additions (~250 lines) keep it well under the
2000-line guideline. If it approaches the limit, the bi-weekly fetcher moves to
`src/lib/reports/biweekly-data.ts` with shared helpers exported from `report-data.ts`.

## 4. New PDF chart component

`src/components/pdf/charts/vertical-grouped-bar-chart.tsx` — the only new rendering primitive.

- Renders one vertical bar group per category (importer or exporter), with
  **Approved** (`#556b2f`) and **Rejected** (`#ef4444`) bars.
- Below the bars, the small stats grid from the example: **Rejection rate**, **Rejected**,
  **Approved** rows aligned under each category column.
- Props (sketch):
  ```ts
  interface VerticalGroupedBarChartProps {
    categories: Array<{
      label: string
      approved: number   // count or bags depending on `metric`
      rejected: number
    }>
    metric: 'count' | 'bags'   // axis scaling + number formatting
    width?: number
    height?: number
  }
  ```
- Parameterized by `metric` so PSS renders **counts** and SS renders **bags** (the example's
  SS Importer chart axis goes to ~7.000 bags; PSS goes to ~9 samples).

Donut, horizontal-bar, KPI-card, and Sankey components are reused unchanged.

## 5. PDF structure

A4 landscape (matches Weekly). Shared `Header`/`Footer` mirror the Weekly template (Wolthers
logo center, client logo + generation date right, country flag left).

- **Page 1 — Pre-Shipment Samples (PSS)**
  - Title bar: `Pre-Shipment Samples · <date range>`
  - KPI strip: Certificates · Approved · Rejected · Rejection rate (color-coded green/amber/red)
  - `VerticalGroupedBarChart` — **Importer PSS** (metric=count)
  - `VerticalGroupedBarChart` — **Exporter PSS** (metric=count)
  - `HorizontalBarChart` — **Rejection reasons** (red), hidden when there are none
  - Two side-by-side tables: **Approved by region** + **Rejected by region** (count + %)

- **Page 2 — Shipment Samples (SS)**
  - Title bar: `Shipment Samples · <date range>`
  - KPI strip: Certificates · Approved · Rejected · Rejection rate · **Bags approved**
  - `VerticalGroupedBarChart` — **Importer SS** (metric=bags)
  - `VerticalGroupedBarChart` — **Exporter SS** (metric=bags)
  - **Conditional Sankey** (see §6)
  - `HorizontalBarChart` — **Rejection reasons** (red), hidden when none
  - Two side-by-side tables: **Approved by region** + **Rejected by region** (bags + %)

- **Page 3 — SS Certificate appendix**
  - The Weekly's approved-SS per-certificate table, reused. To avoid duplicating ~120 lines
    of table markup, extract the appendix table from `weekly-ss-certs-report.tsx` into a
    shared `src/components/pdf/reports/ss-cert-appendix-table.tsx` and render it from both
    reports. (Targeted refactor of code we're already working in — keeps the two reports
    consistent.)

## 6. Conditional Sankey

Reuse the Weekly's `buildSankey()` output (already returns `sankey` + `sankey_columns`,
shape driven by client type). Render the `SankeyChart` on the **SS page only**, and **only
when more than 2 companies are involved** — i.e. `sankey_columns.length > 2`
(`roaster` = 3 cols, `final_buyer` = 4 cols). For `importer`-type clients (2-col
Shipper→Seller) the Sankey is omitted. This matches "like we already have on the weekly
approvals" while keeping it off when the chain is trivial.

## 7. API routes

Clone the Weekly routes, pointing at a new generator:

- `src/lib/reports/biweekly-generator.ts` — mirror of `weekly-ss-generator.ts`
  (logo/flag/client-logo loading is identical; calls `getBiweeklyPerformanceReportData`,
  renders `BiweeklyPerformanceReport`, filename `<Client>_BiWeekly_<start>_to_<end>.pdf`).
- `GET /api/reports/biweekly` — clone of `weekly-ss/route.ts`.
- `POST /api/reports/biweekly/send` — clone of `weekly-ss/send/route.ts`, with
  `REPORT_TYPE = 'biweekly'` and the subject/body label changed to "Bi-Weekly Performance".

No DB migration. `report_recipients` already keys on `(client_id, report_type)` and
`biweekly` is already in `VALID_REPORT_TYPES`.

## 8. Shared modal refactor

`PreviewReportModal` and `SendReportModal` currently hardcode `weekly_ss`, the endpoint
paths, and the "Weekly SS" labels. Parameterize both with a small config so they serve any
report type:

```ts
interface ReportKind {
  reportType: 'weekly_ss' | 'biweekly'  // = report_recipients key
  previewEndpoint: string               // e.g. '/api/reports/biweekly'
  sendEndpoint: string                  // e.g. '/api/reports/biweekly/send'
  label: string                         // e.g. 'Bi-Weekly Performance'
}
```

Passed down `ReportsPage → PreviewReportModal → SendReportModal`. Default preserves current
Weekly behavior. No behavioral change to the Weekly path.

## 9. Reports page refactor

`src/app/dashboard/reports/page.tsx` currently renders one hardcoded card (with a comment
anticipating a grid). Refactor to a **two-card grid** (Weekly SS · Bi-Weekly Performance).
Selecting a card reveals its form. Both forms share the client picker + date range; the
Bi-Weekly form swaps the Weekly's Mon–Fri presets for **half-month presets** (§10) and opens
the preview modal with the `biweekly` `ReportKind`.

## 10. Period UI

Bi-Weekly uses the same start/end date inputs as Weekly, with **half-month presets**:

- **1st half** = day 1–15 of a month
- **2nd half** = day 16–end of month

Default to the **most recently completed half-month** relative to today. Both report pages
use the single selected window (the example's slightly different per-page labels are
data-driven and not reproduced).

## 11. File-by-file change list

**New**
- `src/components/pdf/charts/vertical-grouped-bar-chart.tsx`
- `src/components/pdf/reports/biweekly-performance-report.tsx`
- `src/components/pdf/reports/ss-cert-appendix-table.tsx` (extracted from Weekly)
- `src/lib/reports/biweekly-generator.ts`
- `src/app/api/reports/biweekly/route.ts`
- `src/app/api/reports/biweekly/send/route.ts`

**Modified**
- `src/lib/report-data.ts` — add `getBiweeklyPerformanceReportData` + extract
  `mapCertRowToReportRow`; export the bi-weekly data type.
- `src/components/pdf/reports/weekly-ss-certs-report.tsx` — use the extracted appendix table.
- `src/components/reports/preview-report-modal.tsx` — accept `ReportKind`.
- `src/components/reports/send-report-modal.tsx` — accept `ReportKind`.
- `src/app/dashboard/reports/page.tsx` — two-card grid + half-month presets.

## 12. Testing

- **Unit (vitest):** the bi-weekly aggregation helpers — PSS/SS split, per-importer and
  per-exporter approved/rejected + rejection rate, by-region count vs bags, rejection-rate
  rounding, empty-period behavior. Pure functions fed synthetic `certificate ⋈ sample` rows
  (no DB).
- **Render smoke:** `getBiweeklyPerformanceReportData` + `renderToBuffer` produce a non-empty
  PDF for (a) a final_buyer client with rejections (Sankey shown), (b) an importer client
  with none (Sankey hidden, rejection panels hidden).
- **Manual:** generate for Dunkin over a 15-day window with known PSS+SS data; compare
  importer/exporter/region/rejection numbers against the example PDF's figures.

## 12a. Revision 2026-06-22 — UI polish (post-first-render)

After the first live render against real Dunkin data, the user requested four layout
improvements (all approved before implementation):

1. **Slim KPI band.** The five tall `KpiCard`s are replaced by a single thin inline band
   (`29 Certs · 29 Approved · 0 Rejected · 0% · 9,665 Bags`) with subtle dividers; rejection
   rate + rejected count keep their color coding. Frees ~60px per page. `KpiCard` is no longer
   used by this report (still used by the Weekly report).
2. **Importer + Exporter combined.** The two stacked full-width chart panels become one panel
   holding both `VerticalGroupedBarChart`s side by side (`width={360}` each). Halves the
   vertical space.
3. **Sankey moved to page 3.** Page 2 is now pure performance (KPI band · Importer+Exporter ·
   region tables). Page 3 leads with the supply-chain Sankey (when shown), then the SS cert
   appendix. Page-3 title switches to "Supply chain & SS certificates" when the Sankey is
   present, else "SS certificate appendix".
4. **Fantasy names.** Company names resolve to `fantasy_name || name` in the shared
   `mapCertRowToReportRow` (e.g. "Coop. Regional de Cafeicultores em Guaxupé Ltda." → "Cooxupé").
   Both queries (`report-data.ts` + `biweekly-data.ts`) now select `fantasy_name`. This also
   shortens names in the **Weekly** report (shared mapper) — an intentional, consistent change.

## 13. Out of scope

- The `annual` report (separate spec; output format TBD).
- The ADCC `monthly` report (deprioritized by the user).
- Scheduled/automated delivery (all reports remain on-demand).
- Certificate-PDF persistence (unchanged; reports regenerate on the fly).
