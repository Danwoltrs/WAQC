# Client Portal Views (Overview, Certificates, Suppliers, Containers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin `/portal` with the approved shell and four views: Overview with a clickable supply-chain flow, Certificates, Suppliers with named worst rejection reasons, and Containers from sys shipments.

**Architecture:**
- Every portal route reads through `requireQcPortal` with the service role, scoped to the gate company.
- One fetcher turns the company's certificates in a period into flat "facts". Pure model functions turn the facts into what each page draws.
- The Overview route returns aggregated path rows, so all click-to-filter and one-party collapsing happens client-side without a refetch.
- The shared filter lives in the URL query string.

**Tech Stack:** Next.js 14 (app router), TypeScript, Supabase JS, vitest + @testing-library/react, d3-sankey via the existing `src/lib/charts/sankey-layout.ts`, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-26-client-portal-views-design.md`. The visual reference is the mockups `overview-v3.html` and `overview-v5.html` + `.js` in `docs/superpowers/specs/prototypes/client-portal/`. Open them in a browser before Task 6.

**Out of scope:** Qualities (spec §6) has its own plan. Its nav tab is NOT added here.

**Where to work:** worktree `/Users/danielwolthers/Documents/GitHub/WAQC-intake`, branch `main`. Commit to `main`; Daniel decides when to push. Daniel applies all SQL himself: paste it to him, never run it.

## Global Constraints

- **SAN numbers:** never render, return or log a `SAN-` tracking number. Certificate numbers go through `shownCertificateNumber()` (`src/lib/sample-reference.ts`), which returns `null` for a SAN-valued one; show the contract ref instead.
- **Prices:** never return prices, commissions or any other commercial field from sys tables.
- **Company names:** always via `companyDisplayName()` (`src/lib/contract-intake-mapping.ts`): fantasy name first.
- **Analytics scope:** Overview and Suppliers count certificates whose sample has `client_id = companyId`, the same rule as `reportRowClientId()`.
- **List scope:** Certificates and Containers list `client_id = companyId OR end_client_id = companyId`.
- **What counts:**
  - The unit is the certificate: `certificates.voided_at IS NULL` and the sample's `deleted_at IS NULL`.
  - Approved = `is_rejected` false.
  - MT counts SS certificates only, with MT from `computeBagsAndMt()` (`src/lib/report-data.ts`).
- **Period** = crop year, September to August, labelled "Crop 26/27" (use `formatCropYear`). Calendar-year option labelled "2026". Boundaries are São Paulo midnights (`saoPauloMidnight` in `src/lib/reports/periods.ts`). The default is the current crop year.
- **Flow steps, in order:** origin → lab → seller → importer → roaster.
  - A missing party is the literal `Not recorded`.
  - A lab label is `<lab name> lab` (for example "Santos lab").
- **Sankey band colours** come from `DEFAULT_SANKEY_PALETTE`: `#556b2f` at 90% and up, `#a9a454` from 70 to 89%, `#ef4444` below 70%.
- **Look:**
  - Inter. Page title 20px/600, card titles 14px/600, KPI numbers 20px/600, labels 12px.
  - Radius: containers `rounded-[10px]`, controls `rounded-[6px]`, badges and tags `rounded-[4px]`, tables and rows 0.
  - Card background `#F9F9FA`, borders `border-black/10` at 0.5px, muted text `text-black/40`.
  - No emojis, no mock data.
- **File size:** under ~2,000 lines; split above that.
- **Tests:** vitest (`npx vitest run <path>`). Route tests mock `@/lib/portal/qc-portal-gate` the way `src/app/api/portal/samples/route.test.ts` does.

## Review Focus

1. **A company with no certificates in the period:** every card shows an empty state ("No certificates in Crop 26/27"), with no `NaN%`, no empty SVG and no crash. Tested in Task 2 and Task 6.
2. **A filter from the URL that matches nothing** (stale link, renamed seller): the page shows the empty state, the filter tag stays and Clear works. Tested in Task 2 and Task 5.
3. **Null parties:** a seller, importer or roaster that is null becomes a `Not recorded` node that can be clicked and filtered like any other. An importer that is null but has `importer_is_qc_client` true becomes the client's name. Tested in Task 1 and Task 2.
4. **Over 1,000 certificates** in a period: all are counted, because PostgREST caps a page at 1,000. Tested in Task 1 with `selectAllPages`.
5. **A legacy SAN-numbered certificate:** it never appears as text and is shown by its contract ref. Tested in Task 1, Task 7 and Task 9 (a `not.toContain('SAN-')` assertion in every route test).

---

### Task 1: Certificate facts and periods

**Files:**
- Create: `src/lib/portal/portal-period.ts`
- Create: `src/lib/portal/portal-facts.ts`
- Test: `src/lib/portal/portal-period.test.ts`
- Test: `src/lib/portal/portal-facts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // portal-period.ts
  export interface PortalPeriod { key: string; label: string; start: string; end: string } // ISO, end exclusive
  export function parsePortalPeriod(key: string | null, now?: Date): PortalPeriod
  // key 'crop-2026' → Crop 26/27, Sep 1 2026 → Sep 1 2027 (São Paulo midnights); 'year-2026' → calendar 2026;
  // null or malformed → current crop year
  export function portalPeriodOptions(now?: Date): PortalPeriod[] // current + 2 previous crop years, then current + 1 previous calendar year

  // portal-facts.ts
  export const NOT_RECORDED = 'Not recorded'
  export type FlowStep = 'origin' | 'lab' | 'seller' | 'importer' | 'roaster'
  export const FLOW_STEPS: readonly FlowStep[] // in the order above
  export interface PortalCertFact {
    id: string                          // certificate id
    certificateNumber: string | null    // shownCertificateNumber(); null for SAN-valued
    contractRef: string | null          // wolthers_contract_nr
    issuedAt: string
    type: 'pss' | 'ss'
    rejected: boolean
    violations: string[]                // rejectionViolations(is_rejected, compliance_violations, override_comment)
    origin: string; lab: string; seller: string; importer: string; roaster: string  // never empty: NOT_RECORDED
    quality: string                     // samples.quality_name ?? NOT_RECORDED
    crop: string | null                 // samples.crop_year
    containerNr: string | null
    mt: number | null
    labSampleId: string                 // lab_source_sample_id ?? sample id
  }
  export async function fetchPortalCertFacts(
    admin: SupabaseClient,
    params: { companyId: string; period: PortalPeriod; scope: 'client' | 'client_or_end' },
  ): Promise<PortalCertFact[]>
  ```

- [ ] **Step 1: Write the failing period tests** in `portal-period.test.ts`:
  - `parsePortalPeriod('crop-2026')` gives `{ key: 'crop-2026', label: 'Crop 26/27', start: saoPauloMidnight('2026-09-01'), end: saoPauloMidnight('2027-09-01') }`.
  - `parsePortalPeriod('year-2026')` gives `{ label: '2026', start: saoPauloMidnight('2026-01-01'), end: saoPauloMidnight('2027-01-01') }`.
  - `parsePortalPeriod('garbage', new Date('2026-10-26T12:00:00Z')).key === 'crop-2026'`.
  - `parsePortalPeriod(null, new Date('2026-08-31T12:00:00Z')).key === 'crop-2025'`.
  - `portalPeriodOptions(new Date('2026-10-26T12:00:00Z')).map(p => p.key)` equals `['crop-2026','crop-2025','crop-2024','year-2026','year-2025']`.
- [ ] **Step 2: Run** `npx vitest run src/lib/portal/portal-period.test.ts`. Expected: FAIL, the module is not found.
- [ ] **Step 3: Implement `portal-period.ts`** with `formatCropYear` and `saoPauloMidnight`. Use the São Paulo year and month for "now" (`saoPauloYear`, plus the month from `reportDay`), not the server's local time.
- [ ] **Step 4: Write the failing facts tests** in `portal-facts.test.ts`, with a chainable admin mock like the samples route test that records `.eq`/`.or`/`.range` calls:
  - `scope: 'client'` filters `samples.client_id` (`.eq('samples.client_id', CO)`). `scope: 'client_or_end'` uses `.or('client_id.eq.CO,end_client_id.eq.CO', { referencedTable: 'samples' })`.
  - A row with `certificate_number: 'SAN-00231/26'` maps to `certificateNumber: null` and `contractRef: '42089/26'`, and `JSON.stringify(facts)` does not contain `'SAN-'`.
  - These map to `'Not recorded'`: `seller: null`, `roaster: null`, `laboratory: null`. `importer: null` with `importer_is_qc_client: true` maps to the client's display name (read once from `companies`).
  - A lab row `{ name: 'Santos' }` maps to `lab: 'Santos lab'`.
  - A rejected row with `compliance_violations: []` and `override_comment: 'Customer request'` maps to `violations: ['Status override']`.
  - A soft-deleted sample (`deleted_at` set) is dropped, as is a row whose `client_id` differs (the double-check after the DB filter).
  - Paging: the mock returns 1,000 rows for range 0–999 and 3 rows for 1,000–1,999, and the result has 1,003 facts.
- [ ] **Step 5: Run** `npx vitest run src/lib/portal/portal-facts.test.ts`. Expected: FAIL.
- [ ] **Step 6: Implement `fetchPortalCertFacts`** with `selectAllPages` (`src/lib/supabase-paged.ts`):
  - Select `id, certificate_number, created_at, is_rejected, compliance_violations, override_comment, sample:samples!certificates_sample_id_fkey!inner(id, deleted_at, lab_source_sample_id, sample_type, client_id, end_client_id, origin, quality_name, crop_year, container_nr, wolthers_contract_nr, importer_is_qc_client, bag_count, bag_weight_kg, bag_type, equivalent_60kg_bags, bags_quantity_mt, laboratory:laboratories!samples_laboratory_id_fkey(name), seller:companies!samples_seller_id_fkey(name,fantasy_name), exporter:companies!samples_exporter_id_fkey(name,fantasy_name), importer:companies!samples_importer_id_fkey(name,fantasy_name), roaster:companies!samples_roaster_id_fkey(name,fantasy_name))`.
  - Filters: `voided_at is null`, `created_at >= start`, `created_at < end`. Order by `created_at` desc, then `id`.
  - The seller is `seller ?? exporter`, matching the report's `sellerOf`.
  - `type` is `'ss'` when `sample_type === 'ss'`, otherwise `'pss'`.
- [ ] **Step 7: Run both test files.** Expected: PASS.
- [ ] **Step 8: Commit** `feat(portal): certificate facts and crop-year periods for the portal views`.

### Task 2: Overview model (pure)

**Files:**
- Create: `src/lib/portal/overview-model.ts`
- Test: `src/lib/portal/overview-model.test.ts`

**Interfaces:**
- Consumes: `PortalCertFact`, `FlowStep`, `FLOW_STEPS`, `NOT_RECORDED` (Task 1); `wilsonLowerBound` (`src/lib/reports/supplier-ratings.ts`).
- Produces:
  ```ts
  export interface PathRow { origin: string; lab: string; seller: string; importer: string; roaster: string; quality: string;
    type: 'pss' | 'ss'; certificates: number; approved: number; mt: number }   // mt summed, SS rows only
  export interface LatestCert { id: string; certificateNumber: string | null; contractRef: string | null; type: 'pss'|'ss';
    origin: string; lab: string; seller: string; importer: string; roaster: string; issuedAt: string; rejected: boolean }
  export type FlowFilters = Partial<Record<FlowStep, string>>
  export type OverviewMetric = 'certificates' | 'mt'
  export function toPathRows(facts: PortalCertFact[]): PathRow[]
  export function toLatest(facts: PortalCertFact[], limit?: number): LatestCert[]        // default 50, newest first
  export function filterPaths(rows: PathRow[], filters: FlowFilters): PathRow[]
  export interface ScopeTag { label: string; step?: FlowStep; removable: boolean }
  export interface FlowNode { id: string; step: FlowStep; value: string; label: string; size: number; approvalRate: number }
  export interface FlowLink { source: string; target: string; size: number; approvalRate: number }
  export type FlowModel =
    | { kind: 'sankey'; steps: FlowStep[]; nodes: FlowNode[]; links: FlowLink[] }
    | { kind: 'ranking'; step: FlowStep; rows: { value: string; label: string; certificates: number; rejected: number; approvalRate: number; fewLots: boolean }[] }
    | { kind: 'empty' }
  export interface OverviewKpis { certificates: number; approved: number; approvedPct: number | null; rejected: number;
    pssPct: number | null; ssPct: number | null; mt: number }
  export interface QualityRow { quality: string; origin: string; lab: string; certificates: number;
    pssApproved: number; pssTotal: number; ssApproved: number; ssTotal: number }
  export interface OverviewModel { kpis: OverviewKpis; tags: ScopeTag[]; flow: FlowModel; qualities: QualityRow[] }
  export function buildOverviewModel(rows: PathRow[], filters: FlowFilters, metric: OverviewMetric): OverviewModel
  ```

- [ ] **Step 1: Write the failing tests.** Fixture `DUNKIN` is the 25 Brazil path rows from `overview-v5.js` (first block), all `origin: 'Brazil'`, `lab: 'Santos lab'`, `quality: 'Dunkin'`. Split `type` so PSS totals 163 (114 approved) and SS totals 401 (345 approved). Fixture `AHOLD` is seven sellers into importer `Ahold` and roaster `Not recorded`. Assertions:
  - `buildOverviewModel(DUNKIN, {}, 'certificates')`:
    - kpis: `certificates: 564, approved: 459, approvedPct: 81, rejected: 105, pssPct: 70, ssPct: 86`
    - `flow.kind === 'sankey'`, `flow.steps` equals `['seller','importer','roaster']`
    - tag labels equal `['Brazil','Santos lab','1 quality']`, none removable
  - `buildOverviewModel(AHOLD, {}, 'certificates').flow.kind === 'ranking'`, with step `'seller'`. Rows are ordered by `wilsonLowerBound` (first `Comexim EU` 51/51; `Douqué` 4/4 carries `fewLots: true`). Tags include `'Importer: Ahold'`.
  - A multi-origin fixture (DUNKIN plus one Colombia/Buenaventura lab row) gives steps `['origin','lab','seller','importer','roaster']` and tags starting `['2 origins','2 labs']`.
  - Filter `{ origin: 'Brazil' }` on the multi-origin fixture gives steps `['seller','importer','roaster']`. The first tag is `{ label: 'Brazil', step: 'origin', removable: true }`.
  - Filter `{ seller: 'Nobody' }` gives `flow.kind === 'empty'` and `kpis.certificates === 0`, with `approvedPct`, `pssPct` and `ssPct` all `null`. The tag for the filter is still present.
  - `metric 'mt'`: kpis.mt equals the sum of SS `mt` only. Sankey node sizes use SS mt and ignore PSS rows.
  - A node and link `approvalRate` is a percentage 0–100 (for example `Sucden Brasil` 13/22 gives 59).
  - `qualities` groups by quality+origin+lab with PSS/SS split: DUNKIN gives `[{ quality: 'Dunkin', origin: 'Brazil', lab: 'Santos lab', certificates: 564, pssApproved: 114, pssTotal: 163, ssApproved: 345, ssTotal: 401 }]`.
- [ ] **Step 2: Run** `npx vitest run src/lib/portal/overview-model.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The rules:
    - A step "varies" when the filtered rows hold more than one distinct value for it.
    - Steps that vary, in `FLOW_STEPS` order, are drawn.
    - Two or more varying steps make a sankey. One varying step makes a ranking of that step. None, but rows exist, makes a ranking of `seller`. No rows makes `empty`.
  - Tags, in order:
    - for each step with a filter: a removable tag (lab label as is)
    - for origin and lab when not filtered: either the single value (when only one) or `"N origins"` / `"N labs"`
    - `"Importer: X"` when the importer is a single value and not filtered
    - `"N quality"` / `"N qualities"` last
  - Node ids are `${step}:${value}`. Links join adjacent drawn steps only.
  - `toPathRows` groups facts by all path fields + quality + type.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): overview model: one-party collapse, click filters, ranking fallback`.

### Task 3: Five-column Sankey and the clickable flow chart

**Files:**
- Modify: `src/lib/charts/sankey-layout.ts`, so that `column` on `SankeyInputNode` and `SankeyPositionedNode` becomes `0 | 1 | 2 | 3 | 4`
- Create: `src/components/portal/portal-flow.tsx`
- Test: `src/lib/charts/sankey-layout.test.ts` (extend)
- Test: `src/components/portal/portal-flow.test.tsx`

**Interfaces:**
- Consumes: `FlowModel` (Task 2), `computeSankeyLayout`, `DEFAULT_SANKEY_PALETTE`.
- Produces: `export function PortalFlow(props: { flow: FlowModel; steps?: FlowStep[]; onSelect: (step: FlowStep, value: string) => void; width?: number }): JSX.Element`

- [ ] **Step 1: Write the failing tests.**
  - Layout: five nodes in columns 0–4, chained by links. `computeSankeyLayout(..., { width: 1000, height: 300 })` returns nodes whose `x0` strictly increases by column.
  - Component, sankey flow (render with `@testing-library/react`):
    - `screen.getAllByText(/^(Origin|Lab|Seller|Importer|Roaster)$/)` matches the drawn steps only
    - clicking the label `Brazil 564` calls `onSelect('origin', 'Brazil')`
    - link `stroke` for a 59% link is `#ef4444`
  - Component, ranking flow: a table whose rows show name, certificates, rejected (`—` when 0) and `NN%`. Clicking a row name calls `onSelect(step, value)`.
  - Component, empty flow: the text `No certificates for this selection`.
- [ ] **Step 2: Run** `npx vitest run src/lib/charts src/components/portal/portal-flow.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Widen the column type. Keep the existing ordering logic, and confirm the existing report Sankey tests still pass.
  - `PortalFlow` measures its container with a `ResizeObserver` (fallback 1150). The height is `clamp(260, distinctNodesInMiddleStep * 34 + 80, 600)`.
  - The SVG shows link `title` tooltips (`"A → B: n certificates, r% approved"`). Node rects and labels are clickable, with `cursor-pointer` and hover fill `#556b2f`.
  - Labels read `"<label>  <size>"`, placed right of the node, except in the last column (left).
  - Step headers sit above the chart, spread with `justify-between`.
  - The ranking table follows `overview-v3.html` (Ahold view): bar `w-[90px] h-1.5`, coloured by `bandColor`.
- [ ] **Step 4: Run.** Expected: PASS, including `npx vitest run src/lib/reports` (the report Sankey has not regressed).
- [ ] **Step 5: Commit** `feat(portal): clickable five-column flow chart`.

### Task 4: Overview API route

**Files:**
- Modify (rewrite): `src/app/api/portal/overview/route.ts`
- Delete: `src/lib/portal/portal-overview.ts` and its tests, if any (the status rollup is no longer used)
- Test: `src/app/api/portal/overview/route.test.ts`

**Interfaces:**
- Consumes: `requireQcPortal`, `parsePortalPeriod`, `portalPeriodOptions`, `fetchPortalCertFacts` (scope `'client'`), `toPathRows`, `toLatest`.
- Produces: `GET /api/portal/overview?company=&period=`, which returns `{ period: PortalPeriod; periods: PortalPeriod[]; paths: PathRow[]; latest: LatestCert[] }`.

- [ ] **Step 1: Write the failing route tests.** Mock `fetchPortalCertFacts` via `vi.mock('@/lib/portal/portal-facts', ...)`.
  - The gate is called with `{ view: 'qc_dashboard' }`, and a 403 gate refusal is returned unchanged.
  - The facts call receives `{ companyId: CO, scope: 'client', period: parsePortalPeriod('crop-2025') }` for `?period=crop-2025`.
  - The body has `paths`, `latest`, `period.label === 'Crop 25/26'` and five `periods`.
  - The JSON does not contain `'SAN-'` when a fact had a SAN number.
  - A thrown fetch becomes 500 `{ error: 'Could not load overview' }`.
- [ ] **Step 2: Run** `npx vitest run src/app/api/portal/overview`. Expected: FAIL.
- [ ] **Step 3: Implement the route.** Route files export only HTTP handlers; helpers live in lib.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): overview route returns path rows and latest certificates for a period`.

### Task 5: Shell, nav, logos, URL filters, `qc_containers` key; remove Samples and Contracts

**Files:**
- Modify: `src/lib/portal/qc-keys.ts`
  - add `'qc_containers'` to `QC_VIEWS` after `qc_supplier_review`
  - add a label: `qc_containers: 'Containers'`
  - add it to the Viewer preset (Full gets it through `QC_VIEWS`)
- Modify: `src/lib/portal/qc-keys.test.ts`
- Modify: `src/lib/portal/portal-me.ts`, adding `logoUrl: string | null` to `PortalCompany`
- Modify: `src/app/api/portal/me/route.ts`, which selects `companies(id, name, fantasy_name, logo_url)` for external users, and makes `loadCompanyName` return the logo too for staff
- Modify: `src/components/portal/portal-nav.ts`, setting `PORTAL_NAV` to:
  - Overview `/portal` `qc_dashboard`
  - Certificates `/portal/certificates` `qc_certificates`
  - Suppliers `/portal/suppliers` `qc_supplier_review`
  - Containers `/portal/containers` `qc_containers`
  - Team `/portal/team` (adminOnly)
- Modify: `src/components/portal/portal-top-nav.tsx`, `src/components/portal/portal-shell.tsx`
- Create: `src/lib/portal/use-portal-filters.ts`
- Delete:
  - `src/app/portal/samples/`, `src/app/portal/contracts/`, `src/app/api/portal/samples/`, `src/app/api/portal/contracts/`
  - `src/lib/portal/portal-contracts.ts`
  - `portal-samples.ts`: move `certificatePdfUrl` into `portal-certificates.ts` first, then delete the file and its test
- Create: `database/migrations/20261026000000_qc_containers_backfill.sql`
- Test: `src/components/portal/portal-nav.test.ts`, `src/lib/portal/use-portal-filters.test.ts`, the `me` route test (update)

**Interfaces:**
- Produces:
  ```ts
  export function usePortalFilters(): { filters: FlowFilters; toggle(step: FlowStep, value: string): void;
    remove(step: FlowStep): void; clear(): void; query: string }   // query = 'origin=..&seller=..' for fetches and links
  export function filtersFromSearch(params: URLSearchParams): FlowFilters   // pure, tested
  export function firstVisibleHref(items: PortalNavItem[]): string        // landing when Overview is not granted
  ```

- [ ] **Step 1: Write the failing tests.**
  - `visibleNav` for Viewer keys gives `['Overview','Certificates','Containers']`. For keys without `qc_dashboard` it does not include Overview, and `firstVisibleHref` returns `/portal/certificates`.
  - `filtersFromSearch(new URLSearchParams('origin=Brazil&seller=OFI&company=x&bogus=1'))` equals `{ origin: 'Brazil', seller: 'OFI' }`.
  - `normalizeQcKeys({ views: ['qc_containers'] }).views` equals `['qc_containers']`.
  - The `me` route returns `logoUrl` for external and staff companies.
- [ ] **Step 2: Run** `npx vitest run src/components/portal src/lib/portal src/app/api/portal/me`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Top nav:**
    - Left: the client logo (`<img src={logoUrl} alt={name} className="h-[34px] max-w-[140px] object-contain">`), or the name as 14px/600 text when there is none.
    - Then the tab links: `rounded-[6px] px-3 py-[7px] text-[13px]`; the active one gets `bg-black/[0.04] font-medium text-black`, the others `text-black/60`.
    - Right: `/logos/wolthers-logo-green.svg` at `h-[22px]`, then a divider and Sign out.
    - The company `<select>` stays when there are several companies.
  - **Header:** `border-b border-black/10`, padding `px-8 py-3.5`. `main` becomes `max-w-[1280px] px-8 py-7`.
  - **Links:** nav links keep `company` and the flow filter params (`withCompany(href, id)` plus `query`).
  - **Landing:** when the current path is `/portal` and Overview is not visible, `router.replace(firstVisibleHref(items))`.
- [ ] **Step 4: Write the backfill SQL** for `20261026000000_qc_containers_backfill.sql`:
  ```sql
  -- Gives the new Containers view to everyone who can already see the Overview (spec §3).
  BEGIN;
  UPDATE public.qc_portal_access
     SET views = array_append(views, 'qc_containers')
   WHERE 'qc_dashboard' = ANY(views)
     AND NOT ('qc_containers' = ANY(views));
  COMMIT;
  -- Verification: 0 = done.
  SELECT count(*) AS missing FROM public.qc_portal_access
   WHERE 'qc_dashboard' = ANY(views) AND NOT ('qc_containers' = ANY(views));
  ```
- [ ] **Step 5: Run** all portal tests plus `npx tsc --noEmit`. Expected: PASS, with no imports left pointing at deleted files.
- [ ] **Step 6: Commit** `feat(portal): new shell with client and Wolthers logos, five tabs, URL filters; Samples and Contracts removed`. After the commit, paste the SQL to Daniel.

### Task 6: Overview page

**Files:**
- Modify (rewrite): `src/app/portal/page.tsx`
- Create: `src/components/portal/overview/overview-header.tsx` (title, scope tags, period select, metric toggle)
- Create: `src/components/portal/overview/kpi-row.tsx`
- Create: `src/components/portal/overview/qualities-card.tsx`
- Create: `src/components/portal/overview/latest-certificates-card.tsx`
- Test: `src/components/portal/overview/overview.test.tsx`

**Interfaces:**
- Consumes: `/api/portal/overview` (Task 4), `buildOverviewModel` and `filterPaths` (Task 2), `PortalFlow` (Task 3), `usePortalFilters` (Task 5), `usePortal().fetch`.
- Produces: no new exports beyond the components.

- [ ] **Step 1: Write the failing component tests**, rendering the page body with a mocked fetch that returns the Task 2 `DUNKIN` paths:
  - The tags `Brazil`, `Santos lab` and `1 quality` sit in the same row as the `Overview` heading.
  - The metric toggle shows `Certificates` (pressed by default) and `Quantity (MT)`.
  - The KPI row reads `564 Certificates`, `459 Approved (81%)`, `105 Rejected`, `70% PSS approved`, `86% SS approved`; 105 and 70% carry the red class.
  - Clicking `Quantity (MT)` changes the first KPI label to `MT on SS` and its number to the summed SS MT, formatted with one decimal.
  - The period select lists the `periods` labels. Changing it refetches with `period=<key>`.
  - An empty `paths` shows `No certificates in Crop 26/27` in the flow card and `—` in every percentage KPI.
  - The latest certificates card shows at most 6 rows from `latest` after filtering, with the columns Certificate (or the contract ref when the number is null), Origin, Type, Seller and Issued (`22 Oct`).
- [ ] **Step 2: Run** `npx vitest run src/components/portal/overview`. Expected: FAIL.
- [ ] **Step 3: Implement**, following `overview-v5.html` exactly:
  - KPI cards: `grid-cols-5 gap-2.5`, number and label in one line, `px-3.5 py-2.5`. Red text `text-[#ef4444]` for rejected > 0 and any percentage below 80.
  - Flow card titled `Where your coffee comes from`, with the sub-line `<steps joined by " → ">, sized by <certificates|MT on SS>; colour = approval rate on that path. Click a bar to narrow the page to it.` and the three-band legend.
  - When the flow is a ranking, the title becomes `<Step> performance` and the sub-line `Approval rate on this selection, ranked by confidence (few lots rank lower)`.
  - Filter tags: dark (`bg-[#151618] text-white`), with ×. A `Clear` link appears when any filter is set.
  - The Qualities card links to nothing yet: Qualities ships in its own plan, so it has no "All qualities" link.
  - Below `sm`, the KPIs go to 2 columns and the two cards stack.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Check it by eye.** Run `npm run dev`, then open `/portal?company=3b724f42-d742-4048-a37c-f7cf8be0ea29` as staff (view-as). Compare with `overview-v3.html` (Dunkin) and the Ahold company `7e288918-6188-4d47-9a74-e49332720a5f` (the ranking). Click Cooxupé, then Sucafina: the tags stack and Clear resets.
- [ ] **Step 6: Commit** `feat(portal): overview page with flow, KPIs, qualities and latest certificates`.

### Task 7: Certificates

**Files:**
- Modify: `src/app/api/portal/certificates/route.ts`
- Modify: `src/lib/portal/portal-certificates.ts`
- Modify (rewrite): `src/app/portal/certificates/page.tsx`
- Test: `src/app/api/portal/certificates/route.test.ts` (create), `src/lib/portal/portal-certificates.test.ts` (update)

**Interfaces:**
- Consumes: `fetchPortalCertFacts` (scope `'client_or_end'`), `filtersFromSearch`, `parsePortalPeriod`.
- Produces: `GET /api/portal/certificates?company=&period=&q=&origin=&lab=&seller=&importer=&roaster=`, which returns `{ period, periods, certificates: PortalCertRow[] }`.
  - `PortalCertRow` gains `origin`, `quality`, `seller`, `type: 'PSS' | 'SS'`, `crop: string | null` and `contract: string | null`, and drops `sample`.

- [ ] **Step 1: Write the failing tests.**
  - Facts are called with scope `'client_or_end'`.
  - The flow filters from the query narrow the list.
  - `q=42089` matches on contract ref, `q=BR-0375` on the certificate number and `q=MSNU` on the container, all case-insensitive.
  - A SAN-numbered fact shows `certificateNumber: null` and the body has no `'SAN-'`.
  - `downloadUrl` is still `certificatePdfUrl(id, CO)`.
- [ ] **Step 2: Run** `npx vitest run src/app/api/portal/certificates src/lib/portal/portal-certificates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the route and page.**
  - Page columns: Certificate (bold; the contract ref in muted text when the number is null), Contract, Origin, Quality, Seller, Type, Crop, Status pill (`Approved` green / `Rejected` red, `rounded-[4px]`), Issued, Download.
  - The page carries the same filter tags (`usePortalFilters`), the period select and the search input (`rounded-[6px]`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): certificates list follows the overview filter, with origin, quality, seller, crop`.

### Task 8: Suppliers model (named worst reasons)

**Files:**
- Modify: `src/lib/reports/performance-data.ts`
  - `RejectionDetail` gains `secondaryDefects: string[]`: non-primary green defects, most beans first.
  - `DETAIL_OF` gains `secondary: d => d.secondaryDefects`.
- Modify: `src/lib/reports/performance-data.test.ts` (one assertion for the new field)
- Create: `src/lib/portal/supplier-review.ts`
- Test: `src/lib/portal/supplier-review.test.ts`

**Interfaces:**
- Consumes: `PortalCertFact`, `filterFacts` (add to `overview-model.ts`, same rules as `filterPaths`), `classifyRejection`, `reasonLabel`, `wilsonLowerBound`, `violationDetails` (`src/lib/reports/rejection-overview.ts`), `RejectionDetail`.
- Produces:
  ```ts
  export interface SellerRow { seller: string; certificates: number; rejected: number; approvalRate: number;
    pssRate: number | null; ssRate: number | null; ssMt: number; fewLots: boolean }
  export function buildSellerList(facts: PortalCertFact[]): SellerRow[]   // wilson order, ties: more certificates, then name
  export interface NamedReason { reason: RejectionReasonKey; name: string | null; label: string; count: number;
    certificates: { id: string; certificateNumber: string | null; contractRef: string | null; issuedAt: string;
      measured: { label: string; value: string; limit: string | null }[] }[] }
  export interface SellerDetail { seller: string; row: SellerRow; topReasons: NamedReason[]; multiReason: number;
    rejectedTotal: number; monthly: { month: string; approvalRate: number | null; certificates: number }[] }
  export function buildSellerDetail(facts: PortalCertFact[], seller: string,
    detailByLabSample: Map<string, RejectionDetail>): SellerDetail | null
  ```

- [ ] **Step 1: Write the failing tests** with a fixture seller `Cooxupé`: 10 rejected certificates and 30 approved.
  - Worst reasons: 4 × cup_fault (fault `phenolic` ×3, `ferment` ×1), 3 × primary (`black beans`), 2 × secondary (`broken`), 1 × quakers. Two certificates have two reasons.
  - `topReasons` labels equal `['Cup fault: phenolic', 'Primary defects: black beans', 'Secondary defects: broken', 'Cup fault: ferment', 'Quakers']`, with counts `[3,3,2,1,1]`. Each certificate counts under its single worst reason; the five counts sum to 10 here, and only the top 5 are kept.
  - A worst reason whose detail has no name shows the bare reason label only for reasons outside primary, secondary, fault and taint (for example `Quakers`). For primary, secondary, fault and taint with no recorded name the label is `<Reason>: not named`.
  - `multiReason === 2`, `rejectedTotal === 10`.
  - A certificate behind `Primary defects: black beans` with violation `"Primary defects 12 exceeds limit (8)"` has `measured[0]` equal to `{ label: 'Primary defects', value: '12', limit: '8' }`, built from `violationDetails`.
  - `monthly` covers each month with certificates in the facts, in calendar order, with `approvalRate` 0–100.
  - `buildSellerList` puts a 51/51 seller above a 4/4 one, and `fewLots` is true under 10 certificates.
  - `buildSellerDetail(facts, 'Nobody', map)` returns `null`.
- [ ] **Step 2: Run** `npx vitest run src/lib/portal/supplier-review.test.ts src/lib/reports/performance-data.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - A reason's name is the most frequent name across that seller's certificates for the reason, taken from `DETAIL_OF`-style pickers. Group by (worst reason, first name in that certificate's list for the reason).
  - Sort by count desc, then severity order (`REJECTION_REASONS` index), then name.
  - Format each label as `` `${reasonLabel(key)}: ${name}` ``.
- [ ] **Step 4: Run.** Expected: PASS, with the existing report tests still green.
- [ ] **Step 5: Commit** `feat(portal): supplier review model with named worst rejection reasons`.

### Task 9: Suppliers route and pages

**Files:**
- Create: `src/app/api/portal/suppliers/route.ts`
- Create: `src/lib/portal/rejection-details-fetch.ts`
- Create: `src/app/portal/suppliers/page.tsx`
- Create: `src/components/portal/suppliers/seller-detail.tsx`
- Test: `src/app/api/portal/suppliers/route.test.ts`, `src/components/portal/suppliers/seller-detail.test.tsx`

**Interfaces:**
- Consumes: `fetchPortalCertFacts` (scope `'client'`), `filterFacts`, `buildSellerList`, `buildSellerDetail`, `rejectionDetailOf`, `selectInChunks` (`src/lib/supabase-in-chunks.ts`), the existing helper for long `.in()` lists, which stay under the proxy URI limit.
- Produces:
  ```ts
  // rejection-details-fetch.ts
  export async function fetchRejectionDetails(admin: SupabaseClient, labSampleIds: string[]): Promise<Map<string, RejectionDetail>>
  // reads quality_assessments(sample_id, green_bean_data, resolved_defects, created_at), latest per sample
  ```
  - `GET /api/portal/suppliers?company=&period=&<filters>&seller=` returns `{ period, periods, sellers: SellerRow[], detail: SellerDetail | null }`. The gate needs `qc_supplier_review`.

- [ ] **Step 1: Write the failing tests.**
  - Route:
    - the gate view is `qc_supplier_review`
    - `seller` absent gives `detail: null` and no quality_assessments read
    - `seller=Cooxupé` reads details only for that seller's rejected lab samples
    - the body has no `'SAN-'`
  - Component:
    - lists the five reasons with counts and `Rejected for more than one reason: 2`
    - clicking a reason expands its certificates with `12, max 8`
    - with no rejections, shows `No rejections for Cooxupé in Crop 26/27`
- [ ] **Step 2: Run** `npx vitest run src/app/api/portal/suppliers src/components/portal/suppliers`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Page:** the sellers table on the left (or full width on mobile), in the ranking-table style from Task 3, with columns Seller, Certificates, Rejected, Approval rate (bar), PSS, SS, MT on SS. Selecting a seller sets `?seller=` and shows `SellerDetail` beside or below it.
  - **Detail:** the seller name (14px/600) and its KPIs. Then "Main rejection reasons": up to five rows, each a label, a count and a bar coloured `#ef4444`. Then the `Rejected for more than one reason: N` line.
  - **Expanded reason:** a square table of Certificate / Contract, Issued and Measured vs limit.
  - **Trend:** a small Recharts `LineChart` (height 120, stroke `#151618`, no grid) of `monthly.approvalRate`.
  - The page carries the shared filter tags and the period select.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): suppliers tab with seller ranking and named rejection reasons`.

### Task 10: Containers

**Files:**
- Create: `src/lib/portal/portal-containers.ts`
- Create: `src/app/api/portal/containers/route.ts`
- Create: `src/app/portal/containers/page.tsx`
- Test: `src/lib/portal/portal-containers.test.ts`, `src/app/api/portal/containers/route.test.ts`

**Interfaces:**
- Consumes: `selectInChunks` (`src/lib/supabase-in-chunks.ts`), `shownCertificateNumber`, `companyDisplayName`.
- Produces:
  ```ts
  export const MILESTONE_LABEL: Record<string, string> = {
    empty_to_shipper: 'Empty container at shipper', received_at_cy: 'At container yard',
    loaded_on_vessel: 'Loaded on vessel', departed_awaiting_docs: 'Sailed, awaiting documents' }
  export interface PortalContainerRow { containerNr: string; seal: string | null; certificates: string[]; contractRefs: string[];
    quality: string | null; seller: string | null; vessel: string | null; voyage: string | null; bl: string | null;
    etd: string | null; etdActual: boolean; eta: string | null; etaActual: boolean; milestone: string | null }
  export async function fetchPortalContainers(admin: SupabaseClient, companyId: string): Promise<PortalContainerRow[]>
  ```
  - `GET /api/portal/containers?company=&q=` returns `{ containers: PortalContainerRow[] }`. The gate needs `qc_containers`.

- [ ] **Step 1: Write the failing tests** with a chainable mock that records table names and selected columns.
  - Contract ids come from `samples` with `client_id OR end_client_id = CO`, `deleted_at is null` and `contract_id not null`.
  - `shipments` are read by `contract_id` in chunks, selecting only `id, contract_id, vessel_name, voyage_number, bl_number, etd, etd_actual, eta, eta_actual, transport_milestone`.
  - The selected columns never include `commission`, `price` or `freight`; assert on the recorded select strings.
  - `shipment_containers` join to `containers(container_number, seal_number)`.
  - One row per container number, with the certificates of that contract's samples (non-voided). A SAN-numbered certificate is dropped from `certificates` and its contract ref kept.
  - `etd` uses `etd_actual` when present, with `etdActual: true`. The milestone is mapped through `MILESTONE_LABEL`, and an unknown value passes through as is.
  - A company with no contracts gives `[]` with no shipments query.
  - Rows are sorted by ETD desc, nulls last.
- [ ] **Step 2: Run** `npx vitest run src/lib/portal/portal-containers.test.ts src/app/api/portal/containers`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Before writing the route, confirm the service role reads `shipments`, `shipment_containers` and `containers`: run `select relname, polname, polpermissive from pg_policy join pg_class on pg_class.oid = polrelid where relname in ('shipments','shipment_containers','containers');`. The service role bypasses RLS, but note any RESTRICTIVE policy in the commit message.
  - **Page:** a square table with columns Container, Seal, Certificate(s), Contract, Quality, Seller, Vessel / voyage, BL, ETD, ETA and Status. Actual dates are plain; planned dates are muted with `(planned)`.
  - Search over container, contract, certificate, vessel and BL.
  - Empty state: `No containers linked to your contracts yet.`
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): containers tab from sys shipments (vessel, BL, ETD/ETA, milestone)`.

### Task 11: Whole-portal check

**Files:**
- Create: `src/app/api/portal/no-san.test.ts`

**Interfaces:**
- Consumes: every portal GET route.

- [ ] **Step 1: Write the test.** It calls each portal GET route (overview, certificates, suppliers with seller, containers, me) with mocks seeded with a SAN-numbered certificate and a `SAN-` `tracking_number`, and asserts no response body contains `/SAN-\d/`.
- [ ] **Step 2: Run** `npx vitest run src/app/api/portal src/lib/portal src/components/portal src/lib/reports src/lib/charts`. Expected: PASS.
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npm run lint`. Expected: no errors in changed files.
- [ ] **Step 4: Run** `npm run build`. Expected: success; route files export only handlers.
- [ ] **Step 5: Check** in `npm run dev` as staff view-as for Dunkin and Ahold:
  - all four tabs load
  - a filter set on Overview shows on Certificates and Suppliers
  - the header shows both logos
  - no `SAN-` anywhere in the page text: `document.body.innerText.includes('SAN-') === false`
- [ ] **Step 6: Commit** `test(portal): no SAN number leaves any portal route`. Report to Daniel:
  - the backfill SQL (Task 5) to apply
  - the data issues the portal now shows: roasters missing on Dunkin, SUCAFINA/Sucafina duplicates
