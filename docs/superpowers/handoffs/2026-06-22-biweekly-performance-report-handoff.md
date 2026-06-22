# Handoff — Bi-Weekly Performance Report (2026-06-22)

**Resume point:** EXECUTE the plan at [../plans/2026-06-22-biweekly-performance-report.md](../plans/2026-06-22-biweekly-performance-report.md) **using the `superpowers:subagent-driven-development` skill** — fresh subagent per task, review between tasks. Start at **Task 1** (refactor `report-data.ts`). **No app code written yet** — only the spec + plan exist.

## The work (one paragraph)

Add the second of two remaining client-facing reports: the **Bi-Weekly Performance Report** (`biweekly` type, ~15-day window for one QC client). It is a **superset of the existing Weekly SS report** — it splits the window into **Pre-Shipment Samples (PSS)** and **Shipment Samples (SS)**, reports **approved + rejected** for both, surfaces **rejection reasons**, breaks results down by **importer / exporter / region**, conditionally draws the supply-chain **Sankey**, and appends the Weekly's approved-SS certificate listing. It reuses the proven Weekly pipeline (`certificates ⋈ samples` → `@react-pdf/renderer` → generator → API routes → preview/send modals) and the same redesigned visual style. Example PDF: [../../report_examples/Brazil_Report_week_4_15_days.pdf](../../report_examples/Brazil_Report_week_4_15_days.pdf). The third report (`annual`) is a separate, later job (see "Next").

## Repo state right now

- **Single repo (WAQC, `/Users/danielwolthers/Documents/GitHub/WAQC`):** branch `main` @ `406e4e7`. Working tree clean except two **untracked** files: the spec and the plan (below). No app code touched.
- **NOT the Wolthers-system two-repo layout.** The `~/.claude/skills/handoff/references/wolthers-repo-facts.md` reference (two nested git repos, "no `npm test`", outer `~/.git` for docs) is for the *other* project and does **not** apply here. In WAQC, `src/` and `docs/` are one repo, and tests run via **`npx vitest run`** (there IS a `test` script).
- **Pushed vs local:** `406e4e7` is the pushed `main` HEAD. The spec + plan are untracked and **not yet committed** (offered to the user; awaiting go-ahead).
- **Stashes:** none.

## What's done

Planning only — **no application code yet**. Brainstorming → spec → plan is complete:

| Artifact | Path | State |
|---|---|---|
| Design spec | [../specs/2026-06-22-biweekly-performance-report-design.md](../specs/2026-06-22-biweekly-performance-report-design.md) | written, **untracked** (uncommitted) |
| Implementation plan | [../plans/2026-06-22-biweekly-performance-report.md](../plans/2026-06-22-biweekly-performance-report.md) | written, **untracked** (uncommitted) — 10 tasks |

Verification: n/a (no code). The plan's tasks each end with `npx vitest run` + `npx tsc --noEmit` gates; final Task 10 adds `npm run build` + a cross-check against the example PDF.

## Locked decisions (do NOT relitigate)

1. **The two remaining reports are Bi-Weekly + Annual** — NOT the ADCC "Monthly" report. The user re-scoped mid-conversation; the `ADCC Shipper Performance` PDF and the `monthly` type are **out of scope**.
2. **Bi-Weekly = analytical + appendix (option B):** the analytical charts/tables for PSS and SS **plus** the Weekly's approved-SS per-certificate appendix table, making it a true superset of the Weekly.
3. **Redesigned visual style** (KPI strips, rounded panels, Wolthers green `#556b2f`, Inter) — not a faithful clone of the example PDF's raw layout.
4. **Conditional Sankey:** show it **only when >2 companies are involved**, i.e. `sankeyColumns.length > 2` (`roaster`=3 cols, `final_buyer`=4 cols). Omit for `importer`-type clients (2-col Shipper→Seller). It lives on the **SS page** (bag-weighted flow). Reuses the Weekly's existing `buildSankey` + `SankeyChart`.
5. **Data source = one `certificates ⋈ samples` query, split in memory** by `sample_type` (`pss` / `ss`). No second query, no separate fetcher for the appendix — extract shared helpers so Weekly + Bi-Weekly can't drift.
6. **Rejection reasons come from `compliance_violations` via the existing `categorizeViolation`** (the example's "Low Balance" = a `Balance below min` violation). No new rejection-reason column.
7. **Region = `samples.micro_origin`.** PSS region tables use **counts**; SS region tables use **bags**.
8. **Period UI = half-month presets** (1st half 1–15, 2nd half 16–end), defaulting to the most recently completed half-month.
9. **Execution mode = subagent-driven** (the user explicitly asked for "subagents").

## Files created / modified by the plan

**New**
- `src/lib/reports/biweekly-data.ts` + `.test.ts` — types, pure `aggregateBucket`, async `getBiweeklyPerformanceReportData`.
- `src/lib/reports/periods.ts` + `.test.ts` — `firstHalf` / `secondHalf` / `previousHalfMonth`.
- `src/components/pdf/charts/vertical-grouped-bar-chart.tsx` + `.test.ts` — new chart + `niceAxisMax`.
- `src/components/pdf/reports/ss-cert-appendix-table.tsx` + `.test.ts` — extracted from Weekly.
- `src/components/pdf/reports/biweekly-performance-report.tsx` + `.test.ts` — the 3-page document.
- `src/lib/reports/biweekly-generator.ts` — mirror of `weekly-ss-generator.ts`.
- `src/app/api/reports/biweekly/route.ts` + `send/route.ts` — clones of the weekly-ss routes.

**Modify**
- `src/lib/report-data.ts` — export `categorizeViolation` + `buildSankey`; extract + export `mapCertRowToReportRow` + `RawCertSampleRow`; Weekly fetcher uses the mapper (no behavior change).
- `src/components/pdf/reports/weekly-ss-certs-report.tsx` — render the extracted appendix table (no behavior change).
- `src/components/reports/preview-report-modal.tsx` + `send-report-modal.tsx` — accept a `ReportKind` config (export `WEEKLY_SS_KIND`, `BIWEEKLY_KIND`).
- `src/app/dashboard/reports/page.tsx` — two-card grid + bi-weekly form with half-month presets.

## Codebase anchors (saves re-exploring)

- [src/lib/report-data.ts:101](../../../src/lib/report-data.ts#L101) — `getWeeklySSCertReportData`; row `.map` at ~L183-208 is what Task 1 extracts into `mapCertRowToReportRow`; `categorizeViolation` ~L342, `buildSankey` ~L393 (make both `export`).
- **The Weekly query select (~L138-166) omits `micro_origin` and `shipment_month`.** The bi-weekly query **must add `micro_origin`** (region). See Task 3 — this is an easy thing to miss.
- [src/components/pdf/reports/weekly-ss-certs-report.tsx:524](../../../src/components/pdf/reports/weekly-ss-certs-report.tsx#L524) — the appendix `<View style={styles.table}>` block to extract (Task 5); col-width consts at ~L201-221; reusable styles/header/footer at ~L35-300.
- [src/lib/reports/weekly-ss-generator.ts](../../../src/lib/reports/weekly-ss-generator.ts) — the generator to mirror (logo/flag/client-logo loading is copy-paste).
- [src/app/api/reports/weekly-ss/route.ts](../../../src/app/api/reports/weekly-ss/route.ts) + [send/route.ts](../../../src/app/api/reports/weekly-ss/send/route.ts) — route clones; send route's `REPORT_TYPE`/subject/body are the only edits.
- [src/components/reports/send-report-modal.tsx:35](../../../src/components/reports/send-report-modal.tsx#L35) + [preview-report-modal.tsx:72](../../../src/components/reports/preview-report-modal.tsx#L72) — the hardcoded `weekly_ss` + endpoint strings to parameterize.
- [src/components/pdf/charts/](../../../src/components/pdf/charts/) — existing `kpi-card`, `horizontal-bar-chart`, `donut-chart`, `sankey-chart` (reused as-is); the new vertical bar chart joins them.
- [src/lib/reports/recipients.ts:12](../../../src/lib/reports/recipients.ts#L12) — `VALID_REPORT_TYPES` already includes `biweekly`; the `report_recipients` table keys on `(client_id, report_type)`. **No DB migration needed.**

## Gotchas

- **Add `micro_origin` to the bi-weekly cert→sample select** — the Weekly query doesn't fetch it, and the region tables depend on it. (Repeated here because it's the most likely silent bug.)
- **Tasks 1 + 5 must not change Weekly output** — they're pure refactors (extract mapper, extract appendix table). After each, regenerate the Weekly report and confirm it's pixel-identical (the plan has manual-check steps).
- **Tests:** `npx vitest run <path>` (NOT `npx tsx --test` — that's the other project). Typecheck: `npx tsc --noEmit`. The render-smoke tests import `@/components/pdf/certificate/certificate-styles` to register the Inter font before `renderToBuffer`.
- **Co-edited files:** `src/app/dashboard/reports/page.tsx` and other `page.tsx` files may be edited by the user concurrently. Stage only the exact paths you changed (`git add <path>`), never `git add -A`; `git status` first.
- **File size:** keep files under ~2000 lines. `report-data.ts` is ~464 now; the extractions keep it small. If it ever balloons, split per the spec's note.
- **No emojis in UI; no mock data.** (CLAUDE.md.)
- **Commit to the WAQC repo** (this repo) — there is no separate docs repo here. Don't push without the user's go-ahead (trunk-based: `main` auto-deploys to Vercel prod).
- **Single shared client picker** on the reports page is intentional — each card has its own date range, but one `clientId` selection serves both (Task 9).

## Next / suggested next-up

1. **Execute this plan (Tasks 1–10)** via subagent-driven-development. Highest value; fully specced.
2. **After build:** cross-check the generated Bi-Weekly for Dunkin against the example PDF (Task 10 step 2) — importer/exporter/region/rejection numbers should match.
3. **Then: the Annual report** (`annual` type). Its example is a **spreadsheet** (`docs/report_examples/Performance Year 2025.xlsx`) — "everything, month-by-month, full analytics, approval rates with total comparisons." Its **output format (PDF vs Excel) is an open design question** and needs its own brainstorm → spec → plan cycle. Do not start it without that.

## Things the user said that should shape future work

- **Re-scoped the report set mid-conversation:** "1) Weekly = all approved SS (done). 2) Bi-Weekly = all SS and PSS, approved + rejected, rejection reasons. 3) Annual = compiles everything, month-by-month, full analytics, approval rates with total comparisons (the Excel)." → The ADCC Monthly report is **dropped**.
- Wants the Sankey "when there are more than 2 companies involved like we already have now on the weekly approvals" → reuse, don't reinvent (locked decision #4).
- Chose **option B** for the Bi-Weekly (analytical + appendix) and **redesigned style**.
- Standing prefs (from project memory): trunk-based on `main`, commit/push directly to main but **only when asked**; user applies any migrations himself and prefers pasted SQL (no migration in this plan); brainstorm in text, no browser mockups.

## Manual smoke test (after the plan builds)

1. `npm run dev`, open `/dashboard/reports` → two cards (Weekly SS · Bi-Weekly Performance).
2. **Weekly card** still previews/downloads/sends exactly as before (regression check for Tasks 1 + 5).
3. **Bi-Weekly card:** pick Dunkin → click "1st half" → Preview → 3-page PDF: PSS (page 1), SS with Sankey (page 2, Dunkin = final_buyer so Sankey shows), SS appendix (page 3). Download works.
4. **Send:** opens modal titled "Send Bi-Weekly Performance Report"; pre-fills saved recipients for `report_type=biweekly` (empty on first use); auto-CCs `qualitycontrol@wolthers.com`; sends via Graph.
