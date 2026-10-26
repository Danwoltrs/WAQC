# Handoff: Client portal views (2026-10-26)

**Resume point:** EXECUTE Tasks 1–11 of [`../plans/2026-10-26-client-portal-views.md`](../plans/2026-10-26-client-portal-views.md) with **superpowers:subagent-driven-development**: a fresh implementer per task, then a fresh reviewer per task, then a whole-branch review at the end. No app code is written yet. Start with Task 1 (certificate facts + periods).

## The work

The client portal (`/portal`, qc.wolthers.com) is today a thin list of samples, contracts and certificates. It is being rebuilt as a QC-only portal:
- **Header:** the client's logo on the left; our logo alone on the right.
- **Overview:** a clickable supply-chain Sankey (origin → lab → seller → importer → roaster). It drops any step with only one party, and falls back to a seller ranking.
- **Certificates.**
- **Suppliers:** each seller's five main rejection reasons, by name.
- **Containers:** from sys shipments.
- **Qualities** (client-owned, versioned specs) is a separate, later plan.

This is piece 2 ("views") of client portal v2. Piece 1 (accounts and access) shipped 2026-10-20.

- Design: [`../specs/2026-10-26-client-portal-views-design.md`](../specs/2026-10-26-client-portal-views-design.md)
- Approved mockups, real app tokens: [`../specs/prototypes/client-portal/`](../specs/prototypes/client-portal/). Open `overview-v3.html` (single origin, Dunkin and Ahold toggle) and `overview-v5.html` (fictional multi-origin Dunkin with click-to-filter) in a browser before Task 6.

## Repo state right now

- **Where to work:** worktree `/Users/danielwolthers/Documents/GitHub/WAQC-intake`, branch `main`.
  - `main` is checked out HERE, not in `/Users/danielwolthers/Documents/GitHub/WAQC`, which sits on the old branch `feat/certificate-print-list`. `git checkout main` there fails.
  - Tree clean at handoff, apart from this handoff and the copied prototypes (commit them first).
- **Upstream:** `origin/main` = `7e86535b`.
- **Local only (not pushed):** `77195c26` (spec), `7f7345c6` (plan), plus the handoff/prototypes commit. Verify with `git -C /Users/danielwolthers/Documents/GitHub/WAQC-intake log --oneline origin/main..HEAD`.
- **Pushing:** Daniel decides when to push. Every push to `main` deploys Production on Vercel.

## What's done

| SHA | What |
|---|---|
| `77195c26` | `docs(spec)`: client portal views design (approved by Daniel) |
| `7f7345c6` | `docs(plan)`: 11-task plan for build steps 1–3 |

No app code, no tests run, no migrations.

## Locked decisions (do NOT relitigate)

1. **QC only.** Remove the Samples and Contracts tabs.
   - Tabs: Overview (`qc_dashboard`), Certificates (`qc_certificates`), Suppliers (`qc_supplier_review`), Containers (new key `qc_containers`), Team (company admin).
   - Qualities is NOT added in this plan.
2. **Header.** Client logo (`companies.logo_url`) on the left; the Wolthers logo alone on the right. No "Quality control by" text.
3. **Overview layout.** Scope tags sit inline after the "Overview" title. Below them, five compact KPI cards (number and label side by side, 20px).
4. **Overview opens on Certificates.** The Quantity (MT) toggle counts **SS certificates only**, so PSS and SS of one contract are never counted twice.
5. **One-party rule.** A step with only one party becomes a tag ("Brazil", "Santos lab", "Importer: Ahold"). When fewer than two steps vary, the flow becomes a seller ranking (Wilson lower bound). Ahold sees the ranking today.
6. **Click any bar to filter the whole page.** Filters stack as dark tags with × and Clear, and the one-party rule re-runs after each change. The filter carries over to Certificates and Suppliers through URL params.
7. **Period.** Crop year September to August, labelled "Crop 26/27", plus a calendar-year option. São Paulo midnights. Mixed-crop lots (26/27 + 27/28) exist: show the lot's crop as an attribute; it never decides the period.
8. **Scope.**
   - Overview and Suppliers count `client_id` only, like the reports (`reportRowClientId`).
   - Certificates and Containers list `client_id OR end_client_id`.
9. **Suppliers.** Five main reasons per seller. Each rejected certificate counts once, under its worst reason, in Daniel's severity order (`classifyRejection`). Reasons are always named ("Cup fault: phenolic", "Primary defects: black beans", "Secondary defects: broken"), followed by "Rejected for more than one reason: N".
10. **Containers.** May show vessel, voyage, booking, BL, ETD/ETA, container and seal numbers. Never prices, commissions or freight.
11. **Never show SAN numbers.** Show certificate numbers, or the contract ref when the number is SAN-valued.
12. **Later work, not in this plan:**
    - Qualities (§6 of the spec): the client owns the spec and can change ANYTHING, now or from a date, and Wolthers gets an email. Each client quality becomes its own copy; old lots keep their version; the version is chosen by contract date, falling back to the newest version in force.
    - Door-QR container traceability (§9): open scanning with photos at every stop, a public journey page.

## Files the plan touches (blast radius)

- **New (lib):** `src/lib/portal/` `portal-period.ts`, `portal-facts.ts`, `overview-model.ts`, `use-portal-filters.ts`, `supplier-review.ts`, `rejection-details-fetch.ts`, `portal-containers.ts`.
- **New (routes):** `/api/portal/suppliers`, `/api/portal/containers`.
- **New (pages):** `/portal/suppliers`, `/portal/containers`.
- **New (components):** `src/components/portal/portal-flow.tsx`, `overview/*`, `suppliers/*`.
- **Modify:**
  - `src/lib/charts/sankey-layout.ts` (column type widened to 0–4)
  - `src/lib/reports/performance-data.ts` (`RejectionDetail.secondaryDefects` + `DETAIL_OF.secondary`)
  - `qc-keys.ts`, `portal-me.ts`, the `me` route
  - `portal-nav.ts`, `portal-top-nav.tsx`, `portal-shell.tsx`
  - the overview and certificates routes and pages
- **Delete:** the portal samples/contracts pages and routes, `portal-contracts.ts`, `portal-samples.ts` (move `certificatePdfUrl` into `portal-certificates.ts` first), `portal-overview.ts`.
- **Migration:** `database/migrations/20261026000000_qc_containers_backfill.sql`. The SQL is in plan Task 5. **Paste it to Daniel; he applies it.** Never run it yourself.

## Codebase anchors

- [`src/lib/portal/qc-portal-gate.ts`](../../../src/lib/portal/qc-portal-gate.ts) `requireQcPortal(request, need)`, around line 120. Returns `ctx.admin` (service role), `ctx.companyId` and `ctx.keys`. Staff view-as is read-only and gets all `QC_VIEWS`.
- [`src/app/api/portal/samples/route.test.ts`](../../../src/app/api/portal/samples/route.test.ts) is the pattern for route tests: mock the gate and use a chainable admin mock.
- [`src/lib/reports/performance-data.ts`](../../../src/lib/reports/performance-data.ts):
  - `rejectionDetailOf`, around line 58
  - `DETAIL_OF`, around line 67
  - how quality_assessments are read latest-first per lab sample, around line 592
  - `getPerformanceReportData`, around line 462 (fetches ALL certificates, then filters by client in JS; don't copy that, filter in the DB)
- [`src/lib/report-data.ts`](../../../src/lib/report-data.ts):
  - `computeBagsAndMt`, around line 190
  - `reportRowClientId`, around line 213
  - `mapCertRowToReportRow`, around line 229 (the importer falls back to the client when `importer_is_qc_client` is set, or the client is a roaster)
- [`src/lib/reports/rejection-reasons.ts`](../../../src/lib/reports/rejection-reasons.ts): `rejectionViolations` (~108), `classifyRejection` (~125), `summarizeWorstReasons` (~158).
- [`src/lib/reports/rejection-overview.ts`](../../../src/lib/reports/rejection-overview.ts) `violationDetails(v)`, around line 51: measured value against limit.
- [`src/lib/reports/supplier-ratings.ts`](../../../src/lib/reports/supplier-ratings.ts) `wilsonLowerBound`.
- [`src/lib/charts/sankey-layout.ts`](../../../src/lib/charts/sankey-layout.ts) `computeSankeyLayout`, `DEFAULT_SANKEY_PALETTE`, `bandColor`.
- [`src/lib/crop-year.ts`](../../../src/lib/crop-year.ts) uses LOCAL dates; the portal uses `saoPauloMidnight` from [`src/lib/reports/periods.ts`](../../../src/lib/reports/periods.ts).
- [`src/lib/supabase-paged.ts`](../../../src/lib/supabase-paged.ts) `selectAllPages` (1,000-row cap). [`src/lib/supabase-in-chunks.ts`](../../../src/lib/supabase-in-chunks.ts) `selectInChunks` (`.in()` URI limit).
- **FK names** (checked on the live DB): `samples_laboratory_id_fkey`, `samples_contract_id_fkey`, `shipments_contract_id_fkey`, `shipment_containers_shipment_id_fkey`, `shipment_containers_container_id_fkey`, `certificates_sample_id_fkey`, `samples_{seller,exporter,importer,roaster}_id_fkey`.
- **Crop field:** `samples.crop_year` (text). `contracts.crop` also exists.

## Gotchas

- **Route files export only HTTP handlers;** `next build` rejects other exports. Helpers go in `src/lib`.
- **The Supabase SQL editor appends `ENABLE RLS`** to some statements. Wrap Daniel's SQL in BEGIN/COMMIT, as the plan does.
- **`qc_portal_access.views` accepts any `^qc_[a-z0-9_]+$`,** so `qc_containers` needs no constraint change.
- **sys tables (`shipments`, `containers`, …) carry RESTRICTIVE deny policies.** The service role bypasses RLS. Check `pg_policy` before Task 10 anyway; WAQC has never read these tables before.
- **`shipment_tracking_events` is EMPTY.** Use `shipments.transport_milestone`: `empty_to_shipper`, `received_at_cy`, `loaded_on_vessel`, `departed_awaiting_docs`.
- **Data the portal will expose, to report to Daniel and fix on sys:**
  - 310 of Dunkin's 564 certificates in 2026 have no roaster; they show as "Not recorded".
  - The importer appears as both "SUCAFINA" and "Sucafina".
  - Only 34% of 2026 samples link to a sys contract.
- **Real numbers for checking by eye** (2026, non-voided):
  - Dunkin `3b724f42-d742-4048-a37c-f7cf8be0ea29`: 564 certificates, 459 approved (81%), PSS 114/163, SS 345/401, Brazil only, Santos only.
  - Ahold `7e288918-6188-4d47-9a74-e49332720a5f`: 285 certificates, 241 approved; 7 sellers, Ahold is its own importer, no roaster.
  - Note the plan's periods are crop years, so the crop-26/27 numbers will be smaller.
- **Files stay under ~2,000 lines.**
- **Supabase MCP** (project `ojyonxplpmhvcgaycznc`) is fine for read-only checks. Daniel applies every write.

## Shelved / explicitly NOT doing

- The **Impeccable design skill** was rejected and deleted on 2026-10-23 ("its not helping us"). Don't reinstall or suggest it. Mockups must use the real app tokens.
- **Qualities tab and the spec-versioning migration:** a separate plan, written after this one ships.
- **Container QR scanning and the public journey page:** a separate brainstorm and spec.

## Next / suggested next-up

1. Commit this handoff and the prototypes, then run the plan with subagent-driven-development (Tasks 1→11).
2. After Task 5, paste the backfill SQL to Daniel.
3. After Task 11, Daniel checks it by eye (Dunkin, Ahold), then decides on the push.
4. Then: brainstorm or plan Qualities (spec §6), and plan the traceability project (spec §9).

## Things Daniel said that should shape this work

- "remove samples, show certificates, remove contracts, this is QC only".
- He wants a big overview across origins for clients who buy from several. Today every client is Brazil + Santos, so the one-party rule is what makes the flow useful now.
- "If they click in Brazil, then the sankey is adjusted to Brazil, and so on" → "perfect".
- "remove the quality control by - just keep our logo there". "replace bags by quantity, they see in MT". "keep certificate first then, but MT shows only on SS".
- Suppliers: "main rejections for cooxupe, all the top 5 … which primary defect, secondary … taints, faults … If more than one per cert., show only the one that has the biggest rejection reason."
- He prefers concrete mockups from the real app over abstract design rounds.

## Manual check after the build (staff view-as)

1. `npm run dev` in WAQC-intake. Open `/portal?company=3b724f42-d742-4048-a37c-f7cf8be0ea29`. Expect:
   - the Dunkin logo left and the Wolthers logo right
   - tags Brazil · Santos lab · 1 quality
   - the flow seller → importer → roaster, with red bands for Sucden, CDN and Cooxupé→Sucafina
2. Click Cooxupé, then Sucafina: two dark tags; the KPIs and latest certificates narrow; Clear resets.
3. Switch to Quantity (MT): the first KPI reads "MT on SS".
4. Open Certificates and Suppliers: the same tags are applied. Pick Cooxupé on Suppliers: five named reasons, the multi-reason line, and a reason opens showing "12, max 8"-style values.
5. Open `/portal?company=7e288918-6188-4d47-9a74-e49332720a5f` (Ahold): the flow card is "Seller performance", with Comexim EU on top.
6. Containers: rows with vessel, BL, ETD/ETA, the milestone in plain words, and no price fields.
7. In the console, `document.body.innerText.includes('SAN-')` is `false` on every tab.
