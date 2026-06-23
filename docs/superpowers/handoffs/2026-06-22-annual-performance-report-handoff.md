# Handoff — Annual Performance Report + QR Container Traceability (2026-06-22)

> Supersedes the earlier "start a brainstorm" version of this file. The Annual brainstorm is **done**:
> the design spec is written, committed, and awaiting the user's final read-through. This handoff now
> carries **two ready-to-plan workstreams** the user asked to bundle: (1) the **Annual Performance
> Report** and (2) the **QR container-traceability after shipment** (Dunkin chain-of-custody).

**Resume point:** The Annual report spec is **approved-in-conversation and committed** (`2aec164`).
The single next action is to **invoke `superpowers:writing-plans` to turn
[../specs/2026-06-22-annual-performance-report-design.md](../specs/2026-06-22-annual-performance-report-design.md)
into an implementation plan**, then execute it. (Optional courtesy first: ask the user for a final
read of the spec — the brainstorm reached the "user review gate" but the user pivoted to this handoff
before giving the explicit "looks good, write the plan" sign-off.) The **traceability** workstream
(spec [../specs/2026-06-22-dunkin-container-traceability-design.md](../specs/2026-06-22-dunkin-container-traceability-design.md))
is a **separate, parallel** job — also approved, also ready for its own `writing-plans` pass — do it
after the Annual unless the user reprioritizes.

---

## The two workstreams (one paragraph each)

**1. Annual Performance Report** — report **3 of 3** in the client-reporting set (Weekly + Bi-Weekly
are live in prod). A once-a-year, **per-QC-client** supplier-performance review rendered as a clean,
**Scandinavian-style designed PDF** on the existing `@react-pdf` stack. Its data backbone is the
spreadsheet `docs/report_examples/Performance Year 2025.xlsx` (year-total approval/rejection by
exporter, PSS by sample count + SS by bags, %APP/%REJ + a `TOTAL GERAL` grand-total row); the report
redesigns that as an annual report and adds hero numbers, a top-rejection-reasons layer, a
month-by-month trend layer, and importer/seller/origin/lab breakdowns. **Cross-lab and cross-origin:**
one buyer's coffees from Santos + Colombia + Guatemala and multiple origins all stay on the **one**
report.

**2. QR Container Traceability after shipment** — a **Dunkin-only** (feature-gated) chain-of-custody
trail for green coffee from WAQC certificate → roasting → NDPC departure. Dunkin is the *final buyer*,
not the roaster, and today has zero visibility into the physical journey. Build a **QR-per-container
passport**; the people who handle the coffee (3rd-party warehouse, roaster, NDPC) are **not Wolthers
users**, so they scan a QR on a public no-login `/track/[token]` page and self-identify (name +
location, auto timestamp + optional geo). Events are an **append-only log rendered as a milestone
timeline**, with **blend convergence** (many input containers → one roast batch) tracked through NDPC.
Surfaced to Dunkin as a live per-container timeline tracing back to the WAQC cert.

## Repo state right now

- **Single repo: WAQC** (`/Users/danielwolthers/Documents/GitHub/WAQC`). This is NOT the
  Wolthers-system two-repo layout — `~/.claude/skills/handoff/references/wolthers-repo-facts.md`
  (nested `wolthers-app/.git`, outer `~/.git` for docs) describes the **other** project and does
  **not** apply here. In WAQC, `src/` + `docs/` are one repo; tests run via **`npx vitest run`**;
  HEAD auto-deploys to Vercel prod. Commit spec/plan/code all to **this** repo.
- **Branch `main`**, HEAD `2aec164`.
- **`2aec164` (the Annual spec) is committed locally and is UNPUSHED** (`git log --oneline @{u}..`
  shows it). It does NOT auto-deploy until pushed; docs-only, so pushing is harmless but **only push
  when the user asks** (project rule: trunk-based on main, push directly but only when asked).
- **Working tree — untracked, NOT this Annual work:**
  - `docs/superpowers/specs/2026-06-22-dunkin-container-traceability-design.md` — **the traceability
    spec (workstream 2). Approved design, but still UNTRACKED.** Offer to commit it.
  - `docs/superpowers/specs/2026-06-22-partner-portal-foundation-design.md`,
    `…-partner-portal-program-overview.md`, `docs/superpowers/plans/2026-06-22-partner-portal-foundation.md`
    — a **separate** partner-portal effort, **not** part of either workstream here. Leave them.
- **Stashes:** none.
- Earlier concurrent sample-intake commits (`3f62858`, `41f3b35`, `5b66fff`, `34b29e7`) are the
  user's PSS↔SS work, already in history — not this work, don't touch.

## What's done

| SHA | What |
|---|---|
| `2aec164` | **Annual report design spec** — committed (unpushed). Full per-client / cross-lab / cross-origin design. |
| (uncommitted) | **Traceability design spec** — written + approved, **untracked on disk**. |
| `406e4e7..95e9acc` (prod) | Bi-Weekly Performance Report (report 2) — live, the architectural template the Annual reuses. |
| (earlier, prod) | Weekly SS Certificates Report (report 1) — live. |

**No app code written for either workstream.** Both are spec-complete, plan-pending.

## Locked decisions — Annual report (do NOT relitigate)

1. **Output = a designed PDF** on `@react-pdf`. NOT Excel. The spreadsheet is the data spec only.
2. **Scope = per QC client, across ALL labs and ALL origins.** Query filters on `client_id` + year
   window only — never on `laboratory_id` or `origin`. Multi-lab + multi-origin buyers → one report.
3. **Content = year-total hero numbers first, then month-by-month.** Both in scope.
4. **Breakdowns = importer · seller · exporter/shipper · region/origin** (+ a per-lab breakdown shown
   only when the client used >1 lab). Exporter and shipper are the same role (`exporter_name`).
5. **Top rejection reasons** is its own section, PSS vs SS split (data is free —
   `aggregateBucket().rejectionReasons`).
5b. **Whole-year Sankey** — a **full-page LANDSCAPE** page (exporter/shipper → importer →
   roaster/final-buyer, link width = bag volume), reusing `buildSankey` + the existing `@react-pdf`
   Sankey component fed with the full year's approved SS rows; omitted when ≤2 columns resolve. (This
   **reverses** the earlier "Sankey out of scope" note — Sankey is now IN.)
6. **Aesthetic = Scandinavian:** minimal, airy, lots of whitespace, muted natural palette (olive
   `#556b2f`, beige `#efe4d4`, warm grays), **one accent only**, clean Inter, restrained monochrome
   charts. **Bespoke generator — NOT a reskin of the Bi-Weekly PDF.** (User explicitly dropped an
   earlier "Deloitte" framing in favor of "clean / Scandinavian.")
7. **YoY deltas OUT of v1** (deferred to v2). Single-year only.
8. **`annual` already in `VALID_REPORT_TYPES`** (`src/lib/reports/recipients.ts:12`); recipients key
   on `(client_id, 'annual')` → **no DB migration for the Annual report.**
9. **Architecture = Approach A:** reuse the Bi-Weekly `aggregateBucket` engine; the ONLY genuinely
   new data work is the **seller breakdown**, the **12-month trend series**, and **by-origin / by-lab**
   groupings. Do NOT extract a shared core (would edit a live report) and do NOT rebuild from scratch.

### Page spine (Annual, A4 portrait, per client, one year)
1 Cover · 2 Year at a Glance (4 hero numbers) · 3 PSS performance (by exporter, count) · 4 SS
performance (by exporter, bags) · 5 Top rejection reasons (PSS/SS split) · 6 Counterparty breakdowns
(importer/seller/exporter) · 7 Multi-origin (country then region) · 8 Assessed by lab (only if >1 lab)
· 9 The year in motion (monthly approval-rate line + volume bars) · 10 **Year flow Sankey (full-page
LANDSCAPE)** · 11 Methodology.

## Locked decisions — QR traceability (do NOT relitigate)

1. **Tracked unit = the container** (first-class). One cert covers many containers → **one QR per
   container**, each tracing back to its cert. container↔lot is many-to-many; dominant direction is
   cert → many containers.
2. **Scans are anonymous + public** (no accounts); scanner self-identifies name + location (required),
   auto timestamp + optional geo with consent.
3. **Append-only event log → milestone timeline** (not a state machine): absorbs branches, the
   "unsold" gap (`roaster_id IS NULL`), missed/out-of-order scans.
4. **Full chain with blend convergence** (many input containers → one roast batch) through **NDPC
   departure**. **Shop-level fan-out deferred** (Phase 3).
5. **QR lives on a standalone per-container passport PDF**, NOT on the certificate PDF (one cert spans
   many containers).
6. **Dunkin-only**, gated by a new `traceability_enabled` flag on `qc_client_settings`.
7. **New tables** (`database/migrations/`): `tracking_containers`, `tracking_container_lots`,
   `tracking_roast_batches`, `tracking_roast_batch_containers`, `tracking_events`. **This workstream
   DOES need migrations** — hand Daniel the SQL; he applies it.

### Event vocabulary (controlled enum)
Pre-roast (on container): `container_arrived → stored_warehouse → sold_to_roaster →
dispatched_to_roaster → arrived_at_roaster`. Roast+downstream (on batch): `roasted →
dispatched_to_ndpc → arrived_at_ndpc → left_ndpc`. `shop_*` reserved, not implemented.

### Delivery phases (traceability)
Phase 1 = green leg (containers + lots + registration UI + passport PDF/QR + public `/track/[token]`
+ events + pre-roast events + Dunkin read-only timeline + gating). Phase 2 = roast + downstream (roast
batches + blend convergence + roast/NDPC events + Dunkin notifications). Phase 3 = shop fan-out
(deferred).

## Codebase anchors

**Annual report — reuse these:**
- [src/lib/reports/biweekly-data.ts](../../../src/lib/reports/biweekly-data.ts) — `aggregateBucket(rows,'count'|'bags')` → `BucketAggregate` with `byImporter`/`byExporter`/`approvedByRegion`/`rejectionReasons`/`totals`. `groupBy` + `regionBreakdown` helpers. The Annual's core; add `bySeller`, monthly, by-origin, by-lab around it.
- [src/lib/report-data.ts](../../../src/lib/report-data.ts) — `mapCertRowToReportRow` (row already carries `exporter_name`/`seller_name`/`importer_name`; `seller_name` line ~24, mapping ~101), `categorizeViolation`, `companyDisplayName`. **Note `report-data.ts:462`: seller falls back to shipper when unset — for the seller breakdown, group on `seller_name` directly and label unset as 'Unspecified'.**
- [src/lib/reports/biweekly-generator.ts](../../../src/lib/reports/biweekly-generator.ts) + [biweekly/route.ts](../../../src/app/api/reports/biweekly/route.ts) + [biweekly/send/route.ts](../../../src/app/api/reports/biweekly/send/route.ts) — generator + GET + send patterns to clone (new bespoke generator for the Annual visual layer).
- [src/components/reports/preview-report-modal.tsx](../../../src/components/reports/preview-report-modal.tsx) — add `ANNUAL_KIND` (PDF preview works unchanged via the iframe path).
- [src/app/dashboard/reports/page.tsx](../../../src/app/dashboard/reports/page.tsx) — add a 3rd card + a year picker.
- New files to create: `src/lib/reports/annual-data.ts`, `src/lib/reports/annual-generator.tsx`, `src/app/api/reports/annual/route.ts`, `src/app/api/reports/annual/send/route.ts`.

**Traceability — reuse these (do not rebuild):**
- [src/app/certificate/[slug]/page.tsx](../../../src/app/certificate/[slug]/page.tsx) + [api/certificate/[slug]/route.ts](../../../src/app/api/certificate/[slug]/route.ts) — public no-login page+route pattern for `/track/[token]`.
- [src/lib/qr-code.ts](../../../src/lib/qr-code.ts) — `generateQRCode`, `getCertificatePageUrl` (add a `getTrackPageUrl`).
- [middleware.ts](../../../middleware.ts) — public-route bypass; extend to allow `/track/` + `/api/track/`.
- [src/hooks/use-notifications.ts](../../../src/hooks/use-notifications.ts) + `activity_feed`/`notifications` tables — Realtime model for the Dunkin live timeline + milestone notifications.
- `database/migrations/003_phase2_schema.sql` (`storage_history`) — append-only audit-table + RLS shape to mirror for `tracking_events`.

## Gotchas

- **WAQC is a single repo.** Ignore the handoff skill's `~/.git` two-repo machinery — that's the other project. Commit everything here.
- **The Annual spec commit `2aec164` is unpushed.** Push only when the user asks.
- **Stage only your own paths.** `git status` first; never `git add -A` — the partner-portal docs and the (still-untracked) traceability spec are different efforts. Use explicit `git add <path>`.
- **The traceability spec is untracked** — if you start that workstream, commit the spec first (`docs(spec): …`).
- **The example is `.xlsx` — the Read tool can't open it.** Inventory with python-zipfile (snippet was in the prior handoff; the file's content is already transcribed into the Annual spec's data section, so you likely don't need to re-open it).
- **`@react-pdf` charts = inline SVG** (same technique the Bi-Weekly uses for its Sankey). Verify layout by rendering synthetic data to `/tmp/annual-*.pdf` then `pdftoppm -png` — text glyphs don't rasterize offline, so check **layout, not copy**.
- **Report-route security findings still open** (pre-existing on Weekly + Bi-Weekly): 2 HIGH (IDOR on download, mail-relay on send) + 1 MEDIUM (SSRF on client-logo fetch). A new Annual route inherits them. The user was asked whether to bundle a one-pass auth fix across all report families into the Annual plan, or keep Annual at feature-parity — **awaiting their answer; do not silently fix or silently re-introduce.**
- **Traceability needs migrations; the Annual does not.** For traceability, hand Daniel pasted SQL — he applies migrations himself.
- **File-size ceiling ~2000 lines** (CLAUDE.md). Keep Annual logic in `annual-*.ts(x)`; do not grow `report-data.ts`.

## Next / suggested next-up

1. **(Optional) Confirm the Annual spec with the user**, then **`writing-plans` → plan → execute the Annual report.** Highest value; spec is done and committed.
2. **Decide the security-fix question** (bundle the report-route auth pass into the Annual plan, or defer). User's call — surfaced, not yet answered.
3. **Commit the traceability spec** (`docs(spec): Dunkin container traceability`), then **`writing-plans` for traceability Phase 1** (green leg). Separate job; do after the Annual unless reprioritized.
4. **(Housekeeping)** Push `2aec164` when the user okays it.

## Things the user said that should shape future work

- **The report set is exactly three:** Weekly (done), Bi-Weekly (done), Annual (this — "compiles
  everything for the year, full analytics, approval rates with total comparisons"). ADCC "monthly" is
  dropped (`monthly` enum stays unused).
- **Annual aesthetic evolved in-conversation:** "clean layout, modern, not a lot of colors" → dropped
  a "Deloitte" reference → settled on **Scandinavian** (minimal, airy, muted naturals). Do not
  reintroduce heavy color or the Bi-Weekly look.
- **Multi-lab / multi-origin buyers stay on one Annual report** (explicit late requirement).
- **Traceability is explicitly part of "everything we planned"** — the user wants the QR
  after-shipment chain-of-custody carried forward alongside the Annual.
- **Standing prefs (project memory):** trunk-based on `main`, push directly but **only when asked**;
  brainstorm in text (no browser visual companion — declined before); **user applies migrations
  himself and prefers pasted SQL**; no emojis in UI; no mock data; fantasy names preferred for company
  display.
- **Visual iteration loop:** Daniel reviews rendered output and gives fast, concrete layout feedback
  (he caught a bar-misalignment immediately on the Bi-Weekly). Expect render → screenshot → adjust on
  the Annual PDF.

## Manual smoke test (when built)

- **Annual:** generate for a known client/year; cross-check per-exporter APP/REJ/%APP/%REJ and the
  `TOTAL GERAL` grand total against `Performance Year 2025.xlsx`; verify a multi-lab/multi-origin
  client rolls up into one report; render to `/tmp` + `pdftoppm` to check the Scandinavian layout.
- **Traceability:** create a test Dunkin cert, register 2+ containers, generate passports, confirm
  each QR resolves to `/track/{token}`; post events through the chain (incl. a 2-container `roasted`
  blend) on the public page with no login; confirm the Dunkin timeline stitches container → batch →
  NDPC live via Realtime; confirm a non-Dunkin client is gated out and the API rejects its events.
