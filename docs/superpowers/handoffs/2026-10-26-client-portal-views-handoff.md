# Handoff: Client portal views (2026-10-26, build complete)

**Resume point:** the 11-task build is DONE and reviewed, but not pushed. Next: (1) Daniel runs it live with env (`npm run dev` or `npm run build` in a checkout that has `.env.local`) and checks it by eye using the list at the bottom; (2) Daniel decides on the push; (3) Daniel applies the backfill SQL whenever convenient (it updates 0 rows today). After that comes the Qualities plan (spec §6) and the traceability project (spec §9).

## The work

The client portal (`/portal`, qc.wolthers.com) is now QC-only:
- **Header:** the client logo on the left, the Wolthers logo alone on the right.
- **Overview:** a clickable five-step Sankey (origin → lab → seller → importer → roaster). Single-party steps collapse to tags, and the flow falls back to a seller ranking when fewer than two steps vary.
- **Certificates:** follows the Overview filter and period.
- **Suppliers:** the seller ranking, plus each seller's five named worst rejection reasons.
- **Containers:** from the sys shipments.
- **Team:** unchanged.
- The Samples and Contracts tabs, pages and routes are deleted.

Design: [`../specs/2026-10-26-client-portal-views-design.md`](../specs/2026-10-26-client-portal-views-design.md). Plan: [`../plans/2026-10-26-client-portal-views.md`](../plans/2026-10-26-client-portal-views.md). Mockups: [`../specs/prototypes/client-portal/`](../specs/prototypes/client-portal/).

## Repo state right now

- **Worktree:** `/Users/danielwolthers/Documents/GitHub/WAQC-intake`, branch `main`. `/Users/danielwolthers/Documents/GitHub/WAQC` sits on the old `feat/certificate-print-list`.
- **Commits:** `main` is about 29 commits ahead of `origin/main` (`7e86535b`), and NONE are pushed. Verify with `git -C /Users/danielwolthers/Documents/GitHub/WAQC-intake log --oneline origin/main..HEAD`.
- **Push:** every push to `main` deploys Production. Daniel decides.
- **Verification at HEAD:**
  - vitest: 333 files / 3450 tests pass (baseline before the plan was 319 / 3313; vitest also prints 19 pre-existing unhandled "Errors", unchanged).
  - `tsc --noEmit`: 0 errors. `npm run lint`: 0 errors.
  - `npm run build`: passes compile, type check and lint, then stops at "Collecting page data" with `supabaseUrl is required`, because the worktree has no env. **Run the build where env exists before pushing.**
- **Never run live:** the new PostgREST queries. The aliased `!inner` embed filters and the containers embed have never touched the live DB. The FK names and columns were checked by SQL.

## What's done

| Commits | What |
|---|---|
| `9b3224b7`, `92f8d0e9` | T1: certificate facts (`portal-facts.ts`) and crop-year periods (`portal-period.ts`) |
| `e618265e`, `2af621fb` | T2: overview model (one-party collapse, click filters, ranking fallback) |
| `901ecc0f`, `ba8e330e` | T3: five-column Sankey, `PortalFlow`, `PortalRanking` |
| `84a38631` | T4: overview route |
| `0ae16261`, `8c57e601` | T5: shell, nav, logos, URL filters, `qc_containers` key, Samples/Contracts removed, backfill SQL file |
| `c90302b1`, `ff790d08` | T6: overview page |
| `23db16c3`, `d28e8314` | T7: certificates route and page; shared `portal-filter-bar.tsx` and `portal-filter-params.ts` |
| `b33b66bd`, `ec4865c4` | T8: supplier model (named worst reasons) |
| `047b8d78`, `f033c52d`, `add32af5` | T9: suppliers route and page. `f033c52d` was committed red and fixed by `add32af5` |
| `35d3f96c`, `d7fc96c4` | T10: containers |
| `755d8249`, `7c63486b` | T11: whole-portal no-SAN test; fixture fix |
| `9f8c04cd`, `2c9d919b`, `fbe89a50` | Final-review fixes: period carried across tabs, 6 newest per path, overview error log, Seller/Roaster tags, reports unchanged |

## SQL for Daniel (not applied)

`database/migrations/20261026000000_qc_containers_backfill.sql`. Live `qc_portal_access` has 0 rows, so this changes nothing today. The order of SQL and code doesn't matter: staff view-as gets every view, and the Viewer and Full presets already include `qc_containers`.

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

## Rulings made during the build (Daniel: rework any you disagree with)

1. **R1:** Suppliers labels read "Cup fault" and "Cup taint", not `reasonLabel`'s "Cup (fault)". *If wrong:* label wording only.
2. **R2:** portal facts count only `sample_type` pss/ss, as the reports do. *If wrong:* `type`-sample certificates (17 since Sep 2025, all clients) don't appear in the portal.
3. **R3:** `portal-overview.ts` was deleted in Task 6, not Task 4. *If wrong:* nothing.
4. **R4:** route tests copy the overview route test. *If wrong:* nothing.
5. **R5:** the importer falls back to the client only when `importer_is_qc_client`; there is no roaster-type fallback. *If wrong:* a future roaster-type client with no importer shows "Not recorded".
6. **R6:** an empty company name shows as "Not recorded". *If wrong:* nothing.
7. **R7:** `rejectionDetailOf` now carries `secondaryDefects`. *If wrong:* nothing visible; R19 keeps the reports unchanged.
8. **R8:** the period label is "Crop 26/27". *If wrong:* nothing.
9. **R9:** filters on an aliased embed use the alias (`sample.client_id`); the plan's `samples.` was a plan defect. *If wrong:* one test string.
10. **R10:** in MT mode, band colour is still the certificate approval rate (PSS+SS); only the width uses SS MT. *If wrong:* colours differ from an SS-only reading.
11. **R11:** the filter query rides on every tab link. *If wrong:* a stale param in the Team/Containers URL.
12. **R12:** the `qc_samples` label stays "Samples and contracts". *If wrong:* staff see a toggle that grants no tab.
13. **R13:** no route-level SAN test in Task 7; the guard is tested in facts and in Task 11. *If wrong:* one more test.
14. **R14 (superseded by R19):** let the reports name secondary defects.
15. **R15:** a measured limit keeps its direction ("12, max 8", "9.5%, min 10%"). *If wrong:* one test string.
16. **R16:** on Suppliers, `?seller=` selects the detail and is not a list filter. An Overview seller filter opens that seller's detail, and opening a seller carries `seller=` to the other tabs as a filter. *If wrong:* a client arriving with a seller filter sees all sellers, with that one opened.
17. **R17:** Containers uses only `samples.contract_id → shipments`, with no container-number fallback. *If wrong:* Dunkin sees no containers until its samples are linked on sys.
18. **R18:** one Containers row per container PER SHIPMENT, newest ETD first, each from its own contract. *If wrong:* a reused container appears once per trip.
19. **R19:** the period and annual reports stay exactly as before; only the portal names secondary defects and orders primary by beans. *If wrong:* the reports still don't name secondary defects.
20. **R20:** Latest certificates holds the 6 newest per supply-chain path. *If wrong:* a larger payload.
21. **R21:** "Seller: X" and "Roaster: X" tags appear when there is a single party, with no count tags for them. *If wrong:* a missing count tag.
22. **R22:** the Certificates list keeps pss/ss only and the period window (3 crops plus 2 calendar years). *If wrong:* a client can't find a very old or type-sample certificate.

## Data issues the portal now shows (fix on sys, not WAQC)

- **Dunkin has no containers:** 0 of its 609 2026 samples have `contract_id`, so its Containers tab is empty. Ahold has 76 containers and Blaser 152.
- **Milestones are mostly NULL:** `shipments.transport_milestone` is NULL on 3,214 of 3,357 shipments, so Status shows "—" on most rows.
- **Roasters are missing:** 310 of Dunkin's 2026 certificates have no roaster and show as "Not recorded".
- **Importer names are duplicated:** SUCAFINA and Sucafina are separate importers.
- **Resold split legs:** a split leg resold to another buyer (`shipments.split_id` → `contract_splits.repasse_contract_id`) would show its containers to the mother contract's client. There are 0 live cases (the one such split has no QC samples). Decide before onboarding a client to Containers.

## Deferred minors (reviewed; none blocks the push)

- **Thresholds:** red thresholds differ (KPI < 80, Qualities < 70, legend 90/70). Pick one during the visual check.
- **Not in the URL:** the metric toggle and the search term.
- **Flicker:** the table flickers to "Loading…" on each debounced search and on a seller click on Suppliers.
- **Small UI gaps:** the logo has no `onError` fallback to the name; the legend still shows on the empty flow card; an unknown seller shows nothing on the right.
- **Reports ignore voids:** the reports don't filter `voided_at` (the portal does). It agrees today (0 voided), but will drift on the first void. Fix on the report side.
- **Old URLs:** `/portal/samples` and `/portal/contracts` now 404 (0 external users today).

## Gotchas

- **Route files** export only HTTP handlers. Server routes import the filter parsers from `portal-filter-params.ts`, never from the `'use client'` hook.
- **Aliased embeds:** filters must name the alias (R9).
- **Company switch:** `router.push` to the same path does not remount. Every page tags its data with `{companyId, periodKey, query}` and shows loading on a mismatch. Keep that in any new portal page.
- **Supabase SQL editor** appends `ENABLE RLS`; wrap SQL in BEGIN/COMMIT.
- **sys tables** carry RESTRICTIVE policies; the portal reads them with the service role, scoped by the gate company.

## Manual check (staff view-as, with env)

1. Dunkin: `/portal?company=3b724f42-d742-4048-a37c-f7cf8be0ea29`.
   - Header: the Dunkin logo left, Wolthers right.
   - Tags: Brazil · Santos lab · 1 quality.
   - Flow: seller → importer → roaster.
   - Click Cooxupé, then Sucafina: two dark tags, KPIs and Latest narrow, no jump to the top, and Clear resets.
2. Toggle Quantity (MT): the first KPI reads "MT on SS", and hover reads "… MT on SS".
3. Change the period to Crop 25/26, then open Certificates and Suppliers: the period and tags carry over.
4. Suppliers: pick Cooxupé. Expect five named reasons, "Rejected for more than one reason: N", and a reason that opens showing "12, max 8"-style values.
5. Ahold: `/portal?company=7e288918-6188-4d47-9a74-e49332720a5f`. The flow card reads "Seller performance", with Comexim EU on top, and the tags include "Importer: Ahold" and "Roaster: Not recorded".
6. Containers on Ahold: rows with vessel, BL, ETD/ETA ("(planned)" muted), the milestone in words, and no price fields.
7. In the console on every tab, `document.body.innerText.includes('SAN-')` is `false`.
