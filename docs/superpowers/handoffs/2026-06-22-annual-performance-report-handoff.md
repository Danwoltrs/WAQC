# Handoff — Annual Performance Report (2026-06-22)

**Resume point:** START A BRAINSTORM (use `superpowers:brainstorming`) for the third and final client report — the **Annual Performance Report** (`annual` type). **No spec, no plan, no code exists yet.** Before asking the user anything, read the "Example file — actual structure" section below (the spreadsheet has already been inventoried for you). The brainstorm's job is to resolve four genuinely-open scoping forks (listed under "Open decisions for the brainstorm") — the biggest being **output format (PDF vs Excel vs both)** and **scope (per-QC-client vs lab-wide-across-all-exporters)**.

## The work (one paragraph)

This is **report 3 of 3** in the client-reporting set. Reports 1 (Weekly SS Certificates) and 2 (Bi-Weekly Performance) are **built and live in prod**. The Annual report "compiles everything for the year — full analytics, approval rates with total comparisons" (the user's words). Its reference artifact is a **spreadsheet**, `docs/report_examples/Performance Year 2025.xlsx`, NOT a PDF — which is exactly why this one needs its own brainstorm→spec→plan cycle instead of just cloning the Bi-Weekly pipeline: the output-format decision changes the whole architecture (the `@react-pdf` stack reuses cleanly for a PDF; an Excel deliverable is a different generation library entirely).

## Repo state right now

- **Single repo (WAQC, `/Users/danielwolthers/Documents/GitHub/WAQC`).** This is NOT the Wolthers-system two-repo layout. `~/.claude/skills/handoff/references/wolthers-repo-facts.md` (nested `wolthers-app/.git`, outer `~/.git` for docs, "no `npm test`") describes the *other* project and **does not apply here**. In WAQC `src/` + `docs/` are one repo; tests run via **`npx vitest run`**; HEAD auto-deploys to Vercel prod.
- **Branch `main`**, HEAD `41f3b35` at handoff time. **Two unpushed commits that are NOT this work** — `3f62858` (show linked PSS tracking number) and `41f3b35` (prefill SS seller/shipper from PSS legal name). These are the user's concurrent sample-intake work; **leave them, don't push them, don't build on them.**
- **The Bi-Weekly report (report 2) is fully pushed and live** — everything up to and including `95e9acc` is on `origin/main`. Verify with `git log --oneline origin/main | grep biweekly`.
- **Working tree:** untracked docs only — the bi-weekly spec/plan/handoff, plus a `docs/superpowers/specs/2026-06-22-dunkin-container-traceability-design.md` that **someone else created (not this work)**, plus this new handoff. No app code is dirty.
- **Stashes:** none.

## What's done (toward the Annual report)

**Nothing.** No spec, no plan, no app code. This handoff + the example-file inventory below are the only artifacts.

For context, the two prior reports that the Annual will mirror architecturally are shipped:

| SHA (range) | What |
|---|---|
| `406e4e7..95e9acc` | Bi-Weekly Performance Report (report 2) + UI polish — **live in prod**, 311 vitest green, tsc clean, verified vs real Dunkin data |
| (earlier, prod) | Weekly SS Certificates Report (report 1) |

## Example file — actual structure (ALREADY INVENTORIED — read this before brainstorming)

`docs/report_examples/Performance Year 2025.xlsx` — **one sheet ("Planilha1"), 6 cols × 43 rows.** The Read tool can't open `.xlsx`; it was inventoried with python-zipfile (re-run the snippet under "Gotchas" if you need to re-check). Its real content is **two year-total tables, both broken down ONLY by exporter (trading house)** — there is **no month-by-month, no importer, no region, no Sankey, and no client name anywhere**:

**Table 1 — "PRE-SHIPMENT SAMPLE PERFORMANCE — SAMPLES" (by sample COUNT)**
Columns: `Exporter | APP | REJ | TOTAL | %APP | %REJ`. Rows are trading houses (Comexim, Dreyfus, Eisa, Ofi, Rothfos (Union/Veloso/Exp. Guaxupé/Stockler), Volcafe (Comexim/Capal/Cocatrel/NKG/Grano), Mitsui). Ends with a **`TOTAL GERAL` grand-total row** (133 app / 71 rej / 204 total / 65.2% app / 34.8% rej).

**Table 2 — "SHIPMENT SAMPLE PERFORMANCE — BAGS" (by BAG count)**
Same columns and exporter rows, but values are bags. `TOTAL GERAL` = 124,702 app / 5,600 rej / 130,302 total / 95.7% app / 4.3% rej.

**This is the single most important finding in the handoff:** the example is a **year-total, per-exporter, lab-wide** performance summary (PSS by count, SS by bags, with %app/%rej and a grand-total comparison row). It is **NOT** "month-by-month," it is **NOT** per-QC-client, and it is much closer to the Bi-Weekly's `aggregateBucket` per-exporter table than to a giant new thing. The user's verbal "month-by-month, full analytics" is therefore *broader than the example* — that gap is a brainstorm decision, not a settled requirement.

## Open decisions for the brainstorm (do NOT assume — ask)

1. **Output format** — PDF (matches Weekly/Bi-Weekly house style, reuses `@react-pdf`, emailable) vs **Excel** (matches this example exactly, analyst-pivotable, but a NEW generation library — `exceljs`/`xlsx` — and no PDF-stack reuse) vs **both**. This is the architecture fork; settle it first.
2. **Scope: per-QC-client or lab-wide?** The example has no client name and lists *all* trading houses → it looks like a **lab-internal/management** report across all samples, NOT a per-client deliverable like Weekly/Bi-Weekly. Confirm: is the Annual run per QC client (Dunkin, Blaser…) like the others, or one lab-wide roll-up?
3. **Month-by-month?** The example is year-TOTAL only. The user *said* "month-by-month." Is a per-month breakdown in scope (12 columns / 12 sections), or is the year-total-per-exporter table the real target?
4. **Breakdowns beyond exporter?** Example = exporter only. Add importer/region (like the Bi-Weekly), or keep it exporter-only with the PSS-count / SS-bags split + grand-total comparison?

Also minor: **period UI** — calendar year picker vs rolling-12-months (the Weekly uses Mon–Fri presets, Bi-Weekly uses half-month presets; Annual likely just a year picker).

## Locked decisions (do NOT relitigate)

1. **This is the `annual` report type.** The key `'annual'` is **already in `VALID_REPORT_TYPES`** (`src/lib/reports/recipients.ts:12`) and the `report_recipients` table keys on `(client_id, report_type)` — **no DB migration needed for recipients** regardless of format.
2. **The ADCC "monthly" report is OUT of scope** (the user dropped it earlier; `monthly` stays an unused enum value).
3. **Reports 1 & 2 are done and shipped** — the Annual does not change them. Reuse their patterns; don't refactor them.

## Codebase anchors (what the Annual will mirror / reuse)

- [src/lib/reports/biweekly-data.ts](../../../src/lib/reports/biweekly-data.ts) — `aggregateBucket(rows, 'count'|'bags')` returns per-exporter/importer `GroupPerf` (`approvedCount`/`rejectedCount`/`approvedBags`/`rejectedBags`/`rejectionRate`). **This is almost exactly the example's per-exporter table** (PSS=count, SS=bags). The Annual's aggregation is largely this over a 12-month window — high reuse.
- [src/lib/report-data.ts](../../../src/lib/report-data.ts) — `mapCertRowToReportRow` (now resolves `fantasy_name || name`), the `certificates ⋈ samples` query pattern, `categorizeViolation`, `buildSankey` (all exported).
- [src/lib/reports/biweekly-generator.ts](../../../src/lib/reports/biweekly-generator.ts) + [src/app/api/reports/biweekly/route.ts](../../../src/app/api/reports/biweekly/route.ts) + [send/route.ts](../../../src/app/api/reports/biweekly/send/route.ts) — the generator + GET/send route pattern to clone **if the output is PDF**. If Excel, this is where the architecture diverges (new lib, new route that streams `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
- [src/components/reports/preview-report-modal.tsx](../../../src/components/reports/preview-report-modal.tsx) — `ReportKind` config + `WEEKLY_SS_KIND`/`BIWEEKLY_KIND`; add an `ANNUAL_KIND`. (An Excel report has no in-browser PDF preview — the preview modal assumes an iframe-able PDF; Excel would be download-only, a real UX fork.)
- [src/app/dashboard/reports/page.tsx](../../../src/app/dashboard/reports/page.tsx) — two-card grid today; the Annual becomes a 3rd card with a year picker.
- [docs/superpowers/specs/2026-06-22-biweekly-performance-report-design.md](../specs/2026-06-22-biweekly-performance-report-design.md) + [plan](../plans/2026-06-22-biweekly-performance-report.md) — the structural template for how to spec/plan a report in this codebase.

## Gotchas

- **WAQC is a single repo.** Commit spec/plan/handoff AND code to the WAQC repo (this repo). There is no separate docs repo here; ignore the `~/.git` two-repo machinery in the handoff skill's references.
- **Concurrent user work is on the branch.** `3f62858` and `41f3b35` (unpushed) and the `dunkin-container-traceability-design.md` spec are NOT this work. `git status` first; stage only your own paths (`git add <path>`), never `git add -A`.
- **The example is `.xlsx` — the Read tool can't open it.** Inventory it with python-zipfile. Working snippet:
  ```python
  import zipfile, re, xml.etree.ElementTree as ET
  z = zipfile.ZipFile("docs/report_examples/Performance Year 2025.xlsx")
  ns="{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
  shared=["".join(t.text or "" for t in si.iter(ns+"t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml").decode()).findall(ns+"si")]
  # then walk xl/worksheets/sheet1.xml rows, mapping t="s" cells through `shared`
  ```
- **If Excel is chosen as output:** needs a new dependency (`exceljs` preferred for styling, or `xlsx`/SheetJS). The whole `@react-pdf` template stack does NOT apply. The preview modal can't iframe an xlsx — Annual would be download-(and-email-)only.
- **Security findings still open on the report routes.** The Weekly + Bi-Weekly routes have 2 HIGH (IDOR on download, mail-relay on send) + 1 MEDIUM (SSRF on client-logo fetch), shipped as-is because they're identical to the pre-existing prod Weekly routes. A new Annual route would inherit the same pattern. The user has NOT decided whether to fix; a clean fix is one auth pass across all report families (gate on QC role + restrict recipients to `qc_certificates`-tagged contacts + allowlist the logo host). Flag it; don't silently re-introduce or silently fix.
- **File-size ceiling ~2000 lines** (CLAUDE.md). `report-data.ts` is the shared hub — keep Annual logic in its own `src/lib/reports/annual-*.ts` module, as the Bi-Weekly did.
- **Daniel applies migrations himself and prefers pasted SQL.** The Annual likely needs none (recipients already support `annual`), but if any arises, hand him the SQL.

## Next / suggested next-up

1. **Brainstorm the Annual report** (this handoff's resume point) — resolve the 4 forks, write the spec, then the plan. Highest value; nothing else is blocked on it.
2. **(Independent, user's call) Fix the report-route security findings** across Weekly + Bi-Weekly + Annual in one pass. Worth bundling with the Annual build since a new route is being added anyway.
3. **(Housekeeping) Commit the untracked report docs** — the bi-weekly spec/plan/handoff are still untracked in the WAQC repo. Offer to commit them (`docs:` commit) so the design record is in git.

## Things the user said that should shape future work

- **The report set is exactly three** (user re-scoped mid-project): "1) Weekly = all approved SS (done). 2) Bi-Weekly = all SS and PSS, approved + rejected, rejection reasons (done). 3) Annual = compiles everything, month-by-month, full analytics, approval rates with total comparisons (the Excel)." → ADCC Monthly is dropped.
- On confirming "next is the full year's, right?" the user agreed — the Annual is the immediate next piece, and they were told its output format (PDF vs Excel) is the first real decision because the example is a spreadsheet.
- **Standing prefs (project memory):** trunk-based on `main`, push directly to `main` but **only when asked**; brainstorm in text (no browser visual companion — Daniel declined it before); user applies migrations himself and prefers pasted SQL; no emojis in UI; no mock data; fantasy names preferred for company display (now wired into the shared mapper).
- On visual iteration: Daniel reviews rendered output and gives concrete layout feedback fast (e.g. he caught a bar-misalignment immediately). Expect a render → screenshot → adjust loop for any PDF output. The repeatable self-check is rendering synthetic data to `/tmp/*.pdf` and rasterizing with `pdftoppm -png` (text glyphs don't rasterize offline — verify layout, not copy).

## Manual smoke test

N/A yet — no Annual code exists. (When built: generate for a known window/client, cross-check the per-exporter APP/REJ/%APP/%REJ and the TOTAL GERAL grand-total against `Performance Year 2025.xlsx`.)
