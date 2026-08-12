# Reports: contracts/FCL, sellers, Sankey, YTD ratings — and quality in the daily email

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning

## Problem

Six requests, from a buyer and from reviewing the Ahold July reports:

1. The daily-results email lists screen, defects, Type and Cup but never says **which quality** the coffee was graded against. A buyer asked for it.
2. Reports show only the **shipper**. Seller and shipper are frequently different companies (Grano ships, Volcafé sells) and both need to appear.
3. **Sankey charts are missing** from the period reports entirely.
4. There is no **supplier rating** in the reports; that view exists only on the supplier-review dashboard.
5. The KPI band counts **certificates**, which is not how the trade counts. One contract carries several containers (FCL), each with its own certificate.
6. **MT is missing** wherever bags are shown, and the annual report has no seller tables.

A defect surfaced while scoping: the all-rejected appendix table prints a totals row of `0 / 0 / 0.0`, because totals are approved-only.

## Scope

In scope: the performance report family (PSS, SS, SS+PSS / weekly / bi-weekly), the annual performance report, and the batch quality-summary email used by the `/certificates` and `/samples` send flows.

Out of scope: the partner portal, the public certificate page, and the certificate PDF itself.

---

## 1 · Daily-results email: Quality column

**Files:** `src/lib/approval-notification/quality-summary.ts`

`QualitySampleSummary` gains `qualityName: string | null`.

`fetchQualitySampleSummaries` already selects `quality_spec_id`. Add `quality_name` to that select, and one batched lookup over the distinct non-null `quality_spec_id` values:

```
client_qualities: id, custom_name, template:quality_templates(name)
```

Display precedence, matching what the certificate PDF renders:

1. `samples.quality_name` (non-blank)
2. `client_qualities.custom_name`
3. `quality_templates.name`
4. `null` → renders as `—`

Splits inherit the mother's quality unchanged — a commercial split is the same physical coffee, so `buildSubContractSummary` needs no new logic beyond the existing spread.

**Rendering.** A `Quality` column is added to `refColumns()` output for both audiences, positioned after the audience ref columns and before `Container`. `buildQualitySummaryHtml` and `buildQualitySummaryText` pick it up automatically through the `RefColumn` list; `colCount` in the HTML builder is derived from `refCols.length`, so it stays correct.

Both the buyer and the seller table get the column. Both send paths (`/certificates` and `/samples`) share `src/app/api/certificates/batch-send/queue/route.ts`, so no route change is needed.

---

## 2 · Shared data layer

**Files:** `src/lib/report-data.ts`, `src/lib/reports/performance-data.ts`

### `GroupPerf`

Gains `approvedMt: number` and `rejectedMt: number`, accumulated in `groupBy` from `r.mt ?? 0`, rounded to one decimal at the end of the reduce (not per row).

### `BucketTotals`

Gains four fields:

| Field | Definition |
|---|---|
| `contracts` | Count of distinct non-blank `importer_contract_nr` in the bucket, **plus one for each row carrying none**. A certificate with no importer reference is its own contract; this can never under-report. |
| `fcl` | Count of distinct non-blank `container_nr`. Meaningful for SS only; PSS rows carry no container, so it computes to 0 and the PSS KPI band omits the item. |
| `bagsRejected` | Sum of `bags` over rejected rows. |
| `mtRejected` | Sum of `mt` over rejected rows, one decimal. |

`bagsApproved` and `mtApproved` keep their current meaning.

### `BucketAggregate`

Gains `bySeller: GroupPerf[]`, grouped on `seller_name` falling back to `exporter_name` when the seller is unset — the same fallback `buildSankey` already applies, so the chart and the flow name the same companies.

### Client type resolution

`performance-data.ts` and `annual-data.ts` each carry an identical copy of:

```ts
const clientIsRoaster = companyTypes.some(t => t.toLowerCase() === 'roaster')
const clientIsImporter = tradingRoles.includes('buyer')
const sankeyType = clientIsImporter ? 'importer' : clientIsRoaster ? 'roaster' : 'final_buyer'
```

Extract to `resolveClientSankeyType(companyTypes, tradingRoles)` in `report-data.ts`, **with roaster taking precedence over `buyer`**:

```ts
roaster ? 'roaster' : buyer ? 'importer' : 'final_buyer'
```

This is the root cause of the missing Sankey. Ahold Delhaize Coffee Company is typed both as a roaster and as a buyer; `buyer` won, giving `sankeyType = 'importer'`, whose column list is `['Shipper', 'Seller']` — two columns, below the `showSankey = columns.length > 2` threshold. With roaster winning, Ahold gets `['Shipper', 'Seller', 'Importer']` and the flow renders.

Both call sites switch to the helper, so the annual report gains the same fix.

---

## 3 · Period report — Page A

**Files:** `src/components/pdf/reports/performance-report.tsx`

### KPI band

| Bucket | Items |
|---|---|
| SS | Contracts · FCL · Approved · Rejected · Rej. rate · Bags · MT |
| PSS | Contracts · Approved · Rejected · Rej. rate · Bags · MT |

`Certs` is gone. Approved / Rejected / Rej. rate keep counting **certificates** — they are the figures the rejection rate is computed from and must stay consistent with the appendix. PSS gains Bags and MT, which it currently omits even though its own appendix table totals them.

### Chart row

The **Importer** slot is replaced by **Seller**. The row reads `SELLER {kind}` | `EXPORTER {kind}`. Importer remains visible in the identity card and the appendix table.

`chartRowLayout(sellerCount, exporterCount)` keeps its existing behaviour — a side with ≤1 company collapses to the status donut; both single collapses the row into the identity card. Only the first argument's source changes.

`metricCats` is unchanged; it is fed `b.bySeller` instead of `b.byImporter`.

### Chart tables

`VerticalGroupedBarChart` renders the stats grid beneath each chart (Rejection rate / Rejected / Approved). Its `GroupedBarCategory` gains `approvedMt` / `rejectedMt`, and the grid gains an **MT** row beneath Approved. For count-metric buckets (PSS) the MT row still shows MT — the metric selects what the *bars* encode, not what the grid lists.

### Identity card

Unchanged — it already prints Shipper / Seller / Importer / Roaster.

---

## 4 · Period report — Page B

### Sankey

Rendered for **both** PSS and SS, gated on `showSankey` as today.

`PerformanceReportData` currently holds a single `sankey` / `sankeyColumns` pair built from approved SS rows. It becomes per-bucket: `PerformanceBucket` gains `sankey: SankeyLayoutResult | null`, `sankeyColumns: string[]` and `showSankey: boolean`; the top-level fields are removed and the template reads `b.sankey`. The PSS flow is built from approved PSS rows, bag-weighted like the SS one (PSS rows carry bags — `computeBagsAndMt` reads the sample's quantity fields regardless of stage).

### Supplier rating · year to date

New block below the Sankey, printed on **both** bucket sections. Two ranked tables side by side:

```
SUPPLIER RATING · YEAR TO DATE (Jan 01 – Jul 31)

BY SHIPPER                                BY SELLER
#  Name        Samples PSS  SS  Approval  #  Name       Samples PSS  SS  Approval
1  Comexim          41  12  29      100%  1  Volcafé CH       28   6  22     100%
2  Ecom             33   9  24       97%  2  Rothfos GmbH     19   4  15      95%
```

- **Window:** Jan 1 of the report's end-date year → the report's end date.
- **Population:** every certificate for this QC client in that window, both buckets, approved and rejected.
- **Columns:** rank, name, total certificates, PSS count, SS count, approval rate (approved ÷ total, rounded).
- **Ordering:** approval rate descending, then total descending, then name.
- Identical data on the PSS and the SS section — it is a client-wide year view, not a per-bucket one.

**Fetching.** No second round trip. `getPerformanceReportData` widens its certificate query to start at `min(startDate, Jan 1 of the end-date year)`. Period rows are the subset with `created_at >= startDate`; YTD rows are everything from Jan 1 of the end year onward. The `min` guards a period that spans a year boundary (e.g. Dec 28 – Jan 3), where the YTD window would otherwise be narrower than the report period itself.

Sub-contract attachment and the QC-client filter run over the widened set exactly as they do now.

**New files.**

- `src/lib/reports/supplier-ratings.ts` — pure: `buildSupplierRatings(rows, pick)` returning `SupplierRatingRow[]`, plus the shape `{ name, total, pss, ss, approvalRate, rank }`.
- `src/components/pdf/reports/supplier-rating-table.tsx` — the paired table component.

`PerformanceReportData` gains `ratings: { shippers: SupplierRatingRow[]; sellers: SupplierRatingRow[]; window: { start: string; end: string } }`.

### Region tables

`RegionTable` gains an **MT** column beside Bags, with the totals row summing it. `RegionRow` gains `mt: number`.

---

## 5 · Certificate appendix table

**Files:** `src/components/pdf/reports/cert-appendix-table.tsx`

### Seller column

New `seller` column between `shipper` and `importer`, weight 13. Hidden via a new `hideSeller` flag when **no row has a seller distinct from its shipper** — a column repeating the shipper name adds nothing. The check is case-insensitive on trimmed names; rows with a blank seller do not count as distinct.

The caller computes the flag from `b.rows`. Existing width renormalization in `visibleCols` handles the rest.

### Dual totals rows

`totals` changes from one object to two:

```ts
totals: {
  approved: { certificate_count: number; bag_count: number; mt: number }
  rejected: { certificate_count: number; bag_count: number; mt: number }
}
```

Rendered as two rows: `Total approved` (existing dark-green styling) and `Total rejected` (red-tinted). A row is omitted when its certificate count is zero, so an all-approved period looks exactly as it does today and an all-rejected period no longer prints `0 / 0 / 0.0`.

---

## 6 · Annual report

**Files:** `src/components/pdf/reports/annual-performance-report.tsx`, `src/lib/reports/annual-data.ts`

- `PerfTable` takes a `nameHeader` prop (`'Exporter'` / `'Seller'`) instead of the hardcoded `Exporter`, and gains **MT APP** and **MT REJ** columns beside the existing APP / REJ figures, with the `TOTAL GERAL` row summing them.
- Two new pages: **PSS Seller Performance** (by count, `agg.bySellerPss`) and **SS Seller Performance** (by bags, `agg.bySellerSs`), mirroring the existing exporter pages and inserted directly after them.
- `BreakdownBlock` gains an MT figure beside its bags/count figure, so By Importer, By Seller, By Exporter and By Origin all carry it.
- `annual-data.ts` switches to `resolveClientSankeyType`, inheriting the roaster-precedence fix.

`bySellerPss` / `bySellerSs` already exist in `AnnualAggregates` — no new aggregation is required.

---

## Testing

Pure functions are written test-first.

| Test file | Covers |
|---|---|
| `src/lib/reports/performance-data.test.ts` | contracts count (distinct + blank-per-row), FCL count, `bySeller` grouping with shipper fallback, MT rollups on `GroupPerf`, rejected bags/MT totals, per-bucket Sankey |
| `src/lib/reports/supplier-ratings.test.ts` (new) | ranking order, tie-breaking, PSS/SS split, approval-rate rounding, empty input |
| `src/lib/report-data.test.ts` | `resolveClientSankeyType` precedence — roaster beats buyer, buyer beats neither |
| `src/components/pdf/reports/cert-appendix-table.test.ts` | seller-column visibility rule, dual totals rows, width renormalization with the extra column |
| `src/lib/approval-notification/quality-summary.test.ts` | quality-name precedence, split inheritance, column present in both HTML and text output |
| `src/components/pdf/reports/performance-report.test.ts` | existing fixtures move `sankey` / `sankeyColumns` / `showSankey` from the top level onto each bucket, and gain `ratings`; add a PSS-Sankey render case |

Page-A fit is verified by rendering with **real Inter** (curl the gstatic TTFs) — the vitest Noto shim reports false overflow. The KPI band grows by up to two items and the chart tables by one row, so this check is mandatory before shipping.

## Risks

- **Roaster precedence changes flow shape for every dual-typed client**, not only Ahold. Any company typed both roaster and buyer moves from a 2-column to a 3-column Sankey and starts reporting the client name as importer where the importer FK is null. This is the intended fix but should be eyeballed on one non-Ahold client before release.
- **Widened certificate fetch** roughly multiplies the query row count by the number of periods elapsed in the year. Acceptable at current volumes (low thousands of certificates per client-year) but worth watching for the December bi-weekly.
- **Contracts count** treats a missing importer reference as its own contract. If a client routinely omits that field the number degenerates to the certificate count — visible, not silently wrong.
