# Annual Quality Performance Review — Design Spec (2026-06-22)

**Report 3 of 3** in the WAQC client-reporting set. Reports 1 (Weekly SS Certificates) and 2
(Bi-Weekly Performance) are built and live in prod. This is the **Annual** report (`annual`
report type) — a once-a-year, per-QC-client supplier-performance review rendered as a clean,
designed PDF.

Related:
- Bi-Weekly spec (structural template): [../specs/2026-06-22-biweekly-performance-report-design.md](2026-06-22-biweekly-performance-report-design.md)
- Bi-Weekly plan: [../plans/2026-06-22-biweekly-performance-report.md](../plans/2026-06-22-biweekly-performance-report.md)
- Handoff that opened this work: [../handoffs/2026-06-22-annual-performance-report-handoff.md](../handoffs/2026-06-22-annual-performance-report-handoff.md)
- Data reference (the numbers, not the look): `docs/report_examples/Performance Year 2025.xlsx`

---

## 1. Purpose

Give each QC client a single, beautiful year-end document that compiles the full year of quality
control: how many samples were assessed, the overall approval rate, total bags cleared, who the
suppliers were and how they performed, why coffee was rejected, where it came from, and how the
year moved month to month. The reference spreadsheet (`Performance Year 2025.xlsx`) defines the
**data backbone** (year-total approval/rejection by exporter, PSS by sample count and SS by bags,
with %APP/%REJ and a `TOTAL GERAL` grand-total row). This report is that data, redesigned as an
annual report rather than a spreadsheet, plus a monthly-trend layer and a rejection-reason layer.

## 2. Locked decisions

1. **Output format: a designed PDF**, built on the existing `@react-pdf` stack (same as
   Weekly/Bi-Weekly). NOT an Excel deliverable. The spreadsheet is the data spec only.
2. **Scope: per QC client, across ALL labs and ALL origins.** One report per client (Dunkin,
   Blaser, …), covering that client's coffees for the chosen calendar year — **regardless of which
   Wolthers lab assessed them (Santos, Colombia/Buenaventura, Guatemala, Peru, …) or which origin
   country they came from.** If the same buyer uses multiple labs and multiple origins, it all
   stays on the one report. The query filters on `client_id` + year window only — NOT on
   `laboratory_id` and NOT on `origin`. Consistent with the other two reports and the
   `report_recipients (client_id, report_type)` keying. The example file's missing client name is
   an internal-draft artifact, not a signal that the report is lab-wide.
3. **Content: year-total hero numbers first, then month-by-month.** Lead with the big year totals,
   then add a monthly-trend section. Both are in scope.
4. **Breakdowns: importer · seller · exporter/shipper · region/origin.** All four. Exporter and
   shipper are treated as the same role (`exporter_name`).
5. **Top rejection reasons this year** is its own section, with a PSS vs SS split.
6. **Aesthetic: Scandinavian.** Minimal, airy, generous whitespace, muted natural palette (olive
   `#556b2f`, beige `#efe4d4`, warm grays), one accent only, clean Inter type, very restrained
   charts. NOT a reskin of the Bi-Weekly PDF — its own bespoke generator.
7. **Year-over-year deltas are OUT of scope for v1** (deferred to v2). Single-year report only.
8. **`annual` is already in `VALID_REPORT_TYPES`** (`src/lib/reports/recipients.ts:12`) and the
   recipients table keys on `(client_id, report_type)` — **no DB migration needed**.

## 3. Architecture (Approach A — reuse the Bi-Weekly engine)

The Bi-Weekly's `aggregateBucket(rows, 'count' | 'bags')` already produces exactly the example's
per-exporter / per-importer / per-region performance, with totals, rejection rates, and
categorized rejection reasons. The Annual reuses it over a full calendar-year window and adds only
what is genuinely new: a **seller breakdown** and a **monthly-trend series**. The visual layer is a
brand-new bespoke generator (Scandinavian style); the data layer is near-total reuse.

New files:
- `src/lib/reports/annual-data.ts` — fetch + aggregate. Reuses `getBiweeklyPerformanceReportData`'s
  query shape and `aggregateBucket` / `mapCertRowToReportRow` from `report-data.ts` and
  `biweekly-data.ts`. Adds `bySeller` (a `groupBy(rows, r => r.seller_name)`) and a
  `MonthlySeries` (12 buckets keyed off `created_at`). Returns `AnnualPerformanceReportData`.
- `src/lib/reports/annual-generator.tsx` — the bespoke `@react-pdf` document. Own component tree;
  does not import the Bi-Weekly generator's layout.
- `src/app/api/reports/annual/route.ts` — GET (preview/download), mirrors `biweekly/route.ts`.
- `src/app/api/reports/annual/send/route.ts` — email send, mirrors `biweekly/send/route.ts`.

Reused as-is (no edits to live reports):
- `aggregateBucket`, `BucketAggregate`, `GroupPerf`, `RegionRow`, `BiweeklyRow`, `regionBreakdown`
  (`src/lib/reports/biweekly-data.ts`).
- `mapCertRowToReportRow`, `categorizeViolation`, `companyDisplayName`, row types
  (`src/lib/report-data.ts`).

Rationale for not extracting a shared core (Approach B) or building standalone (Approach C):
B edits a live report for no new capability (regression risk); C re-implements aggregation and
invites drift. A keeps Annual logic in its own module per the ~2000-line file rule.

## 4. Data model

### 4.1 Source query
Same as Bi-Weekly: pull every `certificates` row (approved + rejected, `sample_contract_id IS NULL`)
whose `created_at` falls in the year window, join `samples` + the four counterparty companies
(`exporter`, `seller`, `importer`, `roaster`), filter to `sample.client_id === clientId`, split into
PSS and SS buckets. **PSS aggregates on `'count'`, SS aggregates on `'bags'`** (matches the example:
Table 1 = samples, Table 2 = bags). The select must include `sample.micro_origin` (region),
`sample.origin`, `sample.laboratory_id`, `created_at`, `seller`, and `compliance_violations`
(`laboratory_id` is the only addition vs the Bi-Weekly query — needed for the per-lab breakdown).

Resolve the lab **name** by joining `laboratories(name)` off `sample.laboratory_id` (or a small
`laboratory_id → name` lookup loaded once); the per-lab breakdown groups on the resolved name.

**Cross-lab, cross-origin (per decision 2):** do NOT add a `laboratory_id` or `origin` filter. A
single client's samples assessed at Santos, Colombia, Guatemala, etc. and sourced from multiple
origin countries all flow into the same aggregates. `laboratory_id` is carried only so the report
can *show* a per-lab and multi-origin breakdown, never to *restrict* the data.

### 4.2 Window
Calendar year. `startDate = {year}-01-01T00:00:00Z`, `endDate = {year+1}-01-01T00:00:00Z`
(half-open `>= start, < end`, same convention as Bi-Weekly).

### 4.3 New: seller breakdown
`bySeller: GroupPerf[] = groupBy(rows, r => r.seller_name)` per bucket. Preserve the existing
seller→shipper fallback semantics noted in `report-data.ts:462` (when seller is unset it falls back
to the shipper); for the breakdown, group on `seller_name` directly and label unset sellers
`'Unspecified'` (do not silently fold them into exporter, to keep the seller view honest).

### 4.4 New: monthly trend series
```
interface MonthlyPoint {
  month: number          // 1-12
  label: string          // 'Jan' … 'Dec'
  evaluated: number      // PSS+SS samples assessed that month
  approved: number
  rejected: number
  approvalRate: number   // 0-100, rounded; 0 when evaluated === 0
  bagsApproved: number   // SS approved bags that month
}
type MonthlySeries = MonthlyPoint[]   // always length 12, zero-filled
```
Bucket each row by `new Date(created_at).getUTCMonth()`. Always emit all 12 months (zero-filled) so
the trend line and volume bars have a continuous x-axis even for sparse months.

### 4.5 Return shape
```
interface AnnualPerformanceReportData {
  client: { id; name; logo_url; is_roaster; sankey_type }   // same shape as Bi-Weekly
  period: { year: number; issued_at: string }
  origin: string | null                                     // dominant origin, for header
  hero: {
    samplesEvaluated: number      // pss.evaluated + ss.evaluated
    overallApprovalRate: number   // combined approved / evaluated, 0-100
    bagsCleared: number           // ss.totals.bagsApproved
    rejections: number            // pss.rejected + ss.rejected
    overallRejectionRate: number  // combined, 0-100
  }
  pss: BucketAggregate            // basis: count  (adds bySeller — see below)
  ss:  BucketAggregate            // basis: bags   (adds bySeller — see below)
  bySellerPss: GroupPerf[]
  bySellerSs:  GroupPerf[]
  byOrigin: GroupPerf[]           // origin country, combined PSS+SS, ranked by volume
  byLab: GroupPerf[]              // laboratory; length>1 drives the "Assessed by lab" page
  labsCovered: string[]          // distinct lab names, for cover/methodology
  originsCovered: string[]       // distinct origin countries, for cover/methodology
  monthly: MonthlySeries
}
```
`byOrigin` and `byLab` reuse the same `GroupPerf` shape and `groupBy` helper (keyed on
`origin` and the resolved lab name respectively). `byLab.length > 1` is the gate for rendering the
"Assessed by lab" page.
`bySeller` is carried alongside the existing `BucketAggregate` (either by extending the interface
with an optional `bySeller?` or returning it as a sibling field — implementer's choice in the plan).

## 5. Report layout (page spine)

A4 portrait, multi-page, per client, one calendar year.

1. **Cover** — full page, mostly white. Client name + "Annual Quality Performance Review" + year,
   large. Small Wolthers wordmark, small client logo. One restrained olive rule. No chart.
2. **The Year at a Glance** — 4 hero numbers (Samples QC'd · Overall approval rate · Bags cleared ·
   Rejections), each a large near-black/olive figure with an 11px caption. The screenshot page. No
   YoY in v1.
3. **Pre-Shipment (PSS) performance** — year-total approval/rejection by exporter/shipper, basis =
   sample count. Table with %APP/%REJ + `TOTAL GERAL` grand-total row, beside a ranked horizontal
   bar chart (approved olive / rejected muted-red split, %APP trailing label).
4. **Shipment (SS) performance** — same, by exporter/shipper, basis = bags. %APP/%REJ + grand total.
5. **Top rejection reasons this year** — ranked horizontal bars of the categorized reasons
   (`categorizeViolation` output), PSS and SS as two side-by-side panels, count labels.
6. **Counterparty breakdowns** — importer · seller · exporter/shipper, three compact ranked-bar
   blocks; bar = volume, approval-rate % trailing label.
7. **Where the coffee came from** — multi-origin. Top tier: ranked horizontal bars by **origin
   country** (Brazil, Colombia, Guatemala, …) with volume + approval-rate trailing label; second
   tier: region (`micro_origin`) within the dominant origins. Ranked bars, not a literal map —
   cleaner in print, no mapping dependency. For a single-origin client this collapses gracefully to
   one origin row + its regions.
8. **Assessed by lab** — *(present only when the client used more than one lab)* a compact ranked
   block by `laboratory` (Santos, Colombia/Buenaventura, Guatemala, Peru, …): volume + approval
   rate per lab. Omitted entirely for single-lab clients so the page never shows a lone bar.
9. **The year in motion** — one chart: approval-rate line across 12 months (olive) with monthly
   volume as faint background bars on a secondary axis.
10. **Closing / methodology** — small print: what counts as a sample, how rates are computed, the
    period definition, the labs and origins covered, Wolthers footer.

## 6. Visual system (Scandinavian)

- **Type:** Inter throughout. Scale ≈ hero numbers 32–44px / section titles 16px / body & table
  11px / captions 9px. Semibold for grand-total rows and section titles; regular elsewhere.
- **Palette:** white background; near-black text; **one accent = olive `#556b2f`**; beige
  `#efe4d4` only as a thin section-header wash; warm grays for hairlines/captions. Validation
  green/red reserved strictly for approved/rejected encodings.
- **Charts:** minimal, monochrome + the single olive accent. No gridlines. Subtle rounded bar tops.
  Drawn as inline SVG inside `@react-pdf` (same technique the Bi-Weekly uses for its Sankey).
- **Tables:** hairline horizontal rules only, no vertical borders; grand-total row in semibold.
- **Spacing:** generous; ~20mm page margins; airy section separation.
- **Footer:** page number + "Wolthers — Annual Quality Performance Review {year}".

## 7. UI / entry point

- `src/app/dashboard/reports/page.tsx` gains a **3rd card** ("Annual Performance Review") with a
  **year picker** (calendar-year select; default = current or most recent complete year).
- `src/components/reports/preview-report-modal.tsx` gains an `ANNUAL_KIND` config (PDF preview via
  the existing iframe path — Annual is a PDF, so the preview modal works unchanged).
- Recipients reuse the existing `report_recipients` flow keyed on `(client_id, 'annual')`; the
  recipient set is the client's `qc_certificates`-tagged contacts, with house CC enforced
  server-side (same rules as the other reports).

## 8. Out of scope (v1)

- Year-over-year comparison / deltas (v2).
- Lab-wide / cross-client roll-up (this report is strictly per QC client).
- Excel output.
- The ADCC "monthly" report (`monthly` enum value stays unused).
- A literal origin map.
- Sankey (the Annual is supplier-performance-focused; the Bi-Weekly already carries the Sankey).

## 9. Open / inherited risks

- **Report-route security findings** (pre-existing on Weekly + Bi-Weekly): 2 HIGH (IDOR on
  download, mail-relay on send) + 1 MEDIUM (SSRF on client-logo fetch). A new Annual route inherits
  the same pattern. Not fixed here by default; a clean fix is one auth pass across all report
  families (gate on QC role + restrict recipients to `qc_certificates`-tagged contacts + allowlist
  the logo host). Flag to the user; do not silently re-introduce or silently fix.
- **File-size ceiling ~2000 lines** (CLAUDE.md). Keep Annual logic in its own
  `annual-*.ts(x)` modules; do not grow `report-data.ts`.

## 10. Testing

- Unit-test `annual-data.ts` pure aggregation against synthetic rows: hero totals, per-exporter
  grand total (`TOTAL GERAL`), seller breakdown (incl. Unspecified), 12-month zero-filled series,
  PSS=count vs SS=bags basis.
- Cross-check generated numbers for a real client/year against `Performance Year 2025.xlsx`
  (per-exporter APP/REJ/%APP/%REJ and the `TOTAL GERAL` row).
- Render synthetic data to `/tmp/annual-*.pdf` and rasterize with `pdftoppm -png` to verify layout
  (text glyphs don't rasterize offline — verify layout, not copy).
- Keep the full vitest suite green (`npx vitest run`); tsc clean.
