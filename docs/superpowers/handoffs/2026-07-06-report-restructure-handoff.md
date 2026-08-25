# Handoff: SS / PSS / SS+PSS Unified Report Engine (WAQC)

> **STATUS UPDATE (2026-07-06, later session): EXECUTED.** All 8 tasks + final whole-branch review done
> via subagent-driven-development on local `main` (commits `dde75b6..5954582`, 12 ahead of origin/main,
> **NOT pushed** — push auto-deploys prod). Branch question resolved with evidence: `git cherry` proved all
> `feat/qc-pick-existing` code commits patch-equivalent upstream, so local main was aligned to origin
> `3108ff4` and spec+plan cherry-picked (`8a0e39b`/`d104acf`). Suite 527/527+17, tsc clean, build green;
> real-data probe verified all three reports (big-bag fix confirmed: 360 bags/21.6 MT).
> **Awaiting Daniel:** (1) Sankey Page-B split decision (SS+PSS renders 5 pages, not 4, whenever the Sankey
> shows — structural, options in `.superpowers/sdd/progress.md`); (2) visual QA via /dashboard/reports;
> (3) push. Also: this Mac's IPv6 route is dead → local `npm run build` fails without an IPv4-forcing
> preload (Vercel unaffected). The ledger `.superpowers/sdd/progress.md` is the authoritative record;
> the sections below describe the PRE-EXECUTION state and are kept for history.

**Date:** 2026-07-06
**Spec:** [../specs/2026-07-06-report-restructure-design.md](../specs/2026-07-06-report-restructure-design.md) (commit `300cab1`)
**Plan:** [../plans/2026-07-06-report-restructure.md](../plans/2026-07-06-report-restructure.md) (commit `7d0603f`)

## Resume point

**EXECUTE the 8-task plan in `docs/superpowers/plans/2026-07-06-report-restructure.md` via superpowers:subagent-driven-development** — Daniel asked for subagent-driven execution. One fresh subagent per task, review between tasks. No app code has been written yet; Tasks 1–7 each end in their own commit, Task 8 is manual verification. **Before Task 1, resolve the branch question in Gotcha #1.**

## What this is

Restructure of WAQC's period reports. Today: "Weekly SS Certificates" (SS-only, old template) + "Bi-Weekly Performance" (PSS+SS, newer template). Target: three reports — **SS**, **PSS** (new), **SS+PSS** — all rendered by ONE unified engine (one data fetcher, one PDF template, shared route handlers), plus the untouched Annual card. Fixes bundled in: big-bag counts (20 big bags must show ~333 60kg-equivalent bags + new MT column), split-chart double pagination, and single-importer chart waste (compact donut instead of a one-bar chart).

## Repo state right now (verified 2026-07-06)

- Repo: `/Users/danielwolthers/Documents/GitHub/WAQC` (own `.git`, docs committed in-repo).
- Branch: `feat/qc-pick-existing` — **ahead 6 / behind 16 vs `origin/main`**. NOTHING from this branch is pushed.
- Unpushed commits (oldest→newest): `ad277ea`, `aedb2c6` (cupping-cards), `eb7ddc6`, `221fff1` (qc-certs pick-existing work), `300cab1` (spec), `7d0603f` (plan).
- Working tree is DIRTY with unrelated prior work — do NOT sweep into report commits:
  - `M src/app/api/certificates/[id]/override/route.ts`
  - `?? database/migrations/20260624000000_allow_override_terminal_transitions.sql`
  - `??` five older handoff/plan docs (untracked).
- No stashes.

## What's done

| SHA | What |
|---|---|
| `300cab1` | Design spec written, self-reviewed, approved by Daniel |
| `7d0603f` | Implementation plan (8 tasks, full code per task, TDD steps) |

No implementation code exists yet. All report source files are still in their pre-restructure state.

## Locked decisions (do NOT relitigate)

1. **Approach A** — unified engine. One template + one fetcher; old `weekly-ss-certs-report.tsx` gets DELETED (Task 7), not preserved.
2. **4 cards**: SS Report, PSS Report (new), SS+PSS Report, Annual (unchanged). Existing two cards are relabels of `weekly_ss` / `biweekly` kinds — `reportType` strings and API URLs stay for compatibility.
3. **Same 4 date presets on all three period cards**: Last week (Mon–Fri), This week (Mon–Fri), 1st half (1–15), 2nd half (16–end), + free date pickers.
4. **Single-company side → donut**, 3-up row (donut | bars | rejection reasons). Both sides single → ONE combined donut (no duplicate). Both multi → today's 2-up + full-width reasons below.
5. **Appendix = ONE chronological table of ALL certs** with green/red Status column (not two tables, not approved-only). PSS variant drops the Container column. Totals row = approved-only sums.
6. **Bags rule (kg-first, TypeScript only — NO SQL/migration)**: `equivalent_60kg_bags×60` → `bag_count×bag_weight_kg` → `bags_quantity_mt×1000` → `bag_count×60`; bags = round(kg/60), MT = 1 decimal. MT column in appendix + MT total in SS KPI band.
7. Two-page pair per bucket: Page A charts (all panels `wrap={false}`), Page B regions + Sankey (SS, when 3+ columns) + appendix. This kills the double-pagination bug structurally.
8. Daniel pasted my pseudocode into SQL once — **there is no SQL in this job**; if anything looks like SQL it's TypeScript pseudocode.

## Codebase anchors

- Bug line to fix (Task 1): [src/lib/report-data.ts:91](../../src/lib/report-data.ts#L91) (`bag_count ?? equivalent_60kg_bags`).
- Fetcher to generalize (Task 2): [src/lib/reports/biweekly-data.ts](../../src/lib/reports/biweekly-data.ts) → new `performance-data.ts`.
- Table to extend (Task 3): [src/components/pdf/reports/ss-cert-appendix-table.tsx](../../src/components/pdf/reports/ss-cert-appendix-table.tsx) → new `cert-appendix-table.tsx`.
- Template to generalize (Task 4): [src/components/pdf/reports/biweekly-performance-report.tsx](../../src/components/pdf/reports/biweekly-performance-report.tsx) → new `performance-report.tsx`. Donut primitive already exists: [src/components/pdf/charts/donut-chart.tsx](../../src/components/pdf/charts/donut-chart.tsx).
- Route bodies to port into shared handlers (Task 5): [src/app/api/reports/biweekly/route.ts](../../src/app/api/reports/biweekly/route.ts) + [send/route.ts](../../src/app/api/reports/biweekly/send/route.ts). Recipients allowlist: [src/lib/reports/recipients.ts:12](../../src/lib/reports/recipients.ts#L12) (add `'pss'`).
- UI (Task 6): [src/app/dashboard/reports/page.tsx](../../src/app/dashboard/reports/page.tsx), [src/components/reports/preview-report-modal.tsx](../../src/components/reports/preview-report-modal.tsx), [src/lib/reports/periods.ts](../../src/lib/reports/periods.ts).

The plan contains the COMPLETE code for every file — subagents should follow it verbatim, not re-derive.

## Gotchas

1. **Branch question (resolve first).** Memory says trunk-based on `main` (Vercel auto-deploys `main` → Production), but the checkout is `feat/qc-pick-existing`, ahead 6/behind 16 vs origin/main, carrying unrelated unpushed qc-certs + cupping-cards commits. Ask Daniel (or check with him) whether to: (a) keep committing report tasks on this branch, or (b) push/merge the existing branch work to main first and run the report plan on fresh `main`. Do NOT silently rebase or push — the 4 non-docs commits are someone's in-flight work.
2. **Dirty working tree** — the override-route edit + terminal-transitions migration are a separate in-flight job. Task commits must `git add` explicit paths (the plan's commit steps already do, except Task 7's `git add -A` — replace that with explicit paths if the tree is still dirty).
3. **No DB migration** in this job. `report_recipients.report_type` is plain TEXT — only the app-side `VALID_REPORT_TYPES` set changes.
4. **Keep the build green between tasks**: old modules (biweekly-*, weekly-ss-*) stay alive until Task 7 deletes them; routes are re-pointed in Task 5 first.
5. **react-pdf Document children**: if `<BucketPages>` (custom component returning a fragment of `<Page>`s) fails to render as a Document child, call it as a plain function — fallback documented in Task 4 Step 4.
6. **Tests**: vitest — `npx vitest run <file>` per task, `npm run test:run` full. Typecheck with `npx tsc --noEmit`. WAQC migrations live in `database/migrations/` (irrelevant here, no migration).
7. Preview/send modals treat `end_date` as EXCLUSIVE (client adds +1 day before calling the API) — the engine keeps that contract; don't "fix" it.
8. Supabase project `ojyonxplpmhvcgaycznc`; client-side `@/lib/supabase`, server-side `@/lib/supabase-server`.

## Next

1. Resolve Gotcha #1 (branch), then run superpowers:subagent-driven-development over the plan, Tasks 1→8 in order (each task's Interfaces block tells the subagent what neighbors expect).
2. Task 8 is manual: preview all three reports for **Ahold** (single-importer donut + big-bag path — the June window matches Daniel's screenshots) and one multi-importer client (e.g. Dunkin).
3. After it ships: Daniel mentioned the **Annual report "still needs a lot of re-work"** — explicitly out of scope here, likely the next job.
