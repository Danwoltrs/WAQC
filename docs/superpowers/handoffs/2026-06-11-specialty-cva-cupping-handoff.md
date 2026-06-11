# Handoff — Specialty CVA cupping: Phase-1 re-skin + full-screen + multi-sample tabs (2026-06-11)

**Resume point:** Phase-1 re-skin + multi-sample tabs are **merged + pushed to `main` (`ca9888e`) and deploying to prod**; the unique-index migration is **applied**. Next session: confirm the deploy renders the re-skin, run the multi-sample smoke test below, then pick up **either** (a) wire the samples-list "Cup" button to auto-route CVA samples into `/cupping/cva` by methodology (small), **or** (b) start **Phase 2** (Describe-the-cup panel + flavor wheel) — that one needs its own brainstorm. Do NOT redesign the journey; the layout is locked to the prototype.

## The work (one paragraph)
A NEW, separate specialty cupping screen implementing SCA CVA 2024 (the standard replacing the old 100-pt SCA sheet), living alongside the commodity cupping screen — samples route by a `methodology` flag on the quality template. The earlier Phase-1 build shipped only the bare functional "affective spine" (roast → 8 nine-point sections → score), which looked nothing like the locked prototype. This session did a **fidelity re-skin** to the prototype, made the journey **full-screen on laptops**, and added **multi-sample tabs like the commodity screen** (pick N specialty samples → one session → tabbed journey, each sample keeping its own scores and its own step, autosaving independently).

## Repo state right now
- **Repo:** WAQC (`/Users/danielwolthers/Documents/GitHub/WAQC`) — single repo, its own `.git`. Branch `main`, working tree **clean**, **in sync with `origin/main`** (no unpushed commits, no stashes).
- **Deploy:** trunk-based — `main` auto-deploys to production (Vercel) at `qc.wolthers.com`. `ca9888e` was pushed ~now, so prod may still be building.
- **DB migration:** `database/migrations/20260611000000_cupping_scores_unique_constraint.sql` — **APPLIED by Daniel**.
- **Enum:** `session_type` needs the value `'cva'`. The `pg_enum` check this session was ambiguous ("1 column" — unclear if a row returned). The idempotent guard `ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'cva';` may or may not have been run — **verify before cupping** (a missing value → 42P01-style failure on session insert).

## What's done
| SHA | What |
|---|---|
| `36fe01b` | `feat(samples): lead Reference column with container/ICO/cert` — unrelated pre-existing `src/app/samples/qc/page.tsx` work (Daniel's), not part of CVA |
| `29d9e00` | `wip(cupping): CVA session refactor and journey/scoring updates` — the bulk re-skin + full-screen + multi-sample tabs (committed by Daniel) |
| `ca9888e` | `fix(cva): make cupping score saves resilient to duplicate rows` — the review fix (resilient GET/PUT) + the migration |

**Verification run this session:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **156/156 pass** (incl. 5 ImpressionScale + 77 scoring tests). `npm run build` was NOT run — it fails locally only on offline Google-Fonts fetch (`next/font` Inter ETIMEDOUT); builds fine on Vercel. **Use `tsc` + `vitest`, not `npm run build`, to verify locally.**

**Why `ca9888e` matters:** the bulk commit `29d9e00` still contained the buggy non-atomic save (`.maybeSingle()` + check-then-insert, no unique constraint). An adversarial review confirmed a cupper saving the same sample from two tabs/devices could create duplicate `cupping_scores` rows; once duplicated, `.maybeSingle()` throws and reads (no ORDER BY) return an arbitrary row. `ca9888e` fixes it in code (resilient, migration-independent) AND adds the durable index.

## Locked decisions (do NOT relitigate)
1. **Design is LOCKED** to `docs/superpowers/specs/prototypes/cva-cupping-prototype.html` (== `cva-prototype-v4.html`, the final layout). Re-skin to match it; do not redesign.
2. **Methodology lives on `quality_templates.methodology`** ('commodity'|'cva'); per-quality pass mark `cva_min_score` (default 84); `requires_descriptors` flag. (Built in Part B, on main.)
3. **Strict SCA scoring:** `S = 0.65625·Σh + 52.75 − 2u − 4d`, round to 0.25. Quality bands in `cvaBand()`: ≥90 Outstanding, ≥85 Excellent, ≥80 Very Good, ≥75 Good, else Below Specialty.
4. **NO sliders** anywhere — click/tap 1–9 + numeric field; tap not drag. Cooling-shift by a second click.
5. **Multi-sample tabs mirror commodity** semantics (per-sample state map, status colors none/in-progress/pass/fail).
6. **`cupping_scores` = one row per (session_id, sample_id, cupper_id)** — now enforced by a partial unique index (`WHERE session_id IS NOT NULL`).
7. **Phasing:** 1 = affective spine (DONE). 2 = Describe-the-cup (7 intensities + 3 CATA boxes Aroma / Flavor&Aftertaste / Mouthfeel) + interactive flavor wheel. 3 = hold-to-talk voice (Web Speech). 4 = Cups & uniformity screen (ceramic-rim discs, −2/−4 penalties — scoring already accepts u/d). 5 = Coffee Profile end screen + AI highlights. 6 = multi-cupper calibration (mirror `cupping-validation-modal.tsx`). Phase 1 stores one `cupping_scores` row per cupper.

## Files created / modified (CVA Phase-1 changeset)
- **New** `src/hooks/useCvaSession.ts` — per-sample assessment map + per-sample journey step + serialized-per-sample debounced autosave. **Replaced** the deleted `src/hooks/useCvaAssessment.ts`.
- **Modify** `src/components/cupping/cva/CvaJourney.tsx` — now the full-screen host (tab strip, branded topbar, `.cva-bleed`, progress, m-auto stage, contextual footer).
- **Modify** `ImpressionScale.tsx`, `SectionScreen.tsx`, `RoastStep.tsx`, `ProgressPath.tsx`, `LiveScore.tsx`, `ScoreSummary.tsx` — re-skinned to the prototype.
- **Modify** `src/lib/cva/scoring.ts` — added `cvaBand()`. `src/lib/cva/sections.ts` — accents reconciled verbatim to prototype + per-section `hint`.
- **Modify** `src/app/api/cupping/cva/session/route.ts` — accepts `sample_ids[]`. `src/app/api/cupping/cva/[id]/route.ts` — GET roster+assessments, PUT resilient per-sample save.
- **Modify** `src/app/cupping/cva/page.tsx` — multi-select index. `src/app/globals.css` — `.cva-root` tokens + keyframes.
- **New** `database/migrations/20260611000000_cupping_scores_unique_constraint.sql`.

## Codebase anchors (saves re-exploring)
- [CvaJourney.tsx](../../../src/components/cupping/cva/CvaJourney.tsx) — host; `tabStatus()` (status colors), `accent` per-step memo, the `samples.length > 1` tab strip, `h-[100dvh]` shell, `m-auto` stage.
- [useCvaSession.ts](../../../src/hooks/useCvaSession.ts) — `persist()` serialized save (inFlight/queued Sets), `flushAll()` on tab-switch/unmount, `activeRef` for setters, `scoreOf()`.
- [ImpressionScale.tsx](../../../src/components/cupping/cva/ImpressionScale.tsx) — 9-pt blocks (78→108px springpop), two-tier hover swell, red→green legend. **Keep the 5 test selectors** (`data-testid="impression-scale"`, `aria-label="Impression N — …"`, `aria-label="Impression value"`, label `Changed as it cooled?`).
- [ScoreSummary.tsx](../../../src/components/cupping/cva/ScoreSummary.tsx) — rAF count-up from 52.75, band pill, accent radial bg, breakdown + penalty, formula, `celebrate()` confetti (WAAPI) at ≥85.
- [scoring.ts](../../../src/lib/cva/scoring.ts) — `cvaScoreFromSum`, `cvaBand`, `computeAssessmentScore`, `effectiveImpression`. `scoring.test.ts` checks the full SCA two-way table.
- [sections.ts](../../../src/lib/cva/sections.ts) — `CVA_SECTIONS` (accent+hint), `IMPRESSION_COLORS`/`LABELS`, `INTENSITY_KEYS`.
- [types/cva.ts](../../../src/types/cva.ts) — `CvaAssessment`; **`CvaDescribe` (7 intensities + 3 CATA) and `CvaCups` payload shapes already exist** — Phase 2/4 plumbing is half-laid.
- [cva/[id]/route.ts](../../../src/app/api/cupping/cva/[id]/route.ts) — `loadPassMarks()` (sample→quality_spec→client_qualities.template_id→quality_templates.cva_min_score), resilient PUT (`findLatest` + prune).
- Prototype source of truth: [cva-cupping-prototype.html](../specs/prototypes/cva-cupping-prototype.html) (Phase-1 CSS ~lines 11–263; reveal ~498–532, 1146–1228; `SECTIONS`/`ROAST_LEVELS`/`bandFor` ~673–681, 848–853, 1164–1170).

## Gotchas
- **WAQC migrations live in `database/migrations/`** (NOT `supabase/migrations/`). Daniel **applies migrations himself** and **prefers pasting SQL** — give him SQL, don't try to run it.
- **CVA route renders OUTSIDE the dashboard shell.** Commodity `/cupping` wraps itself in `MainLayout` per-page; the CVA journey deliberately does not → it owns the full viewport. Don't add `MainLayout` to it.
- **`npm run build` fails locally** on offline Google Fonts only. Verify with `npx tsc --noEmit` + `npx vitest run` (NOT `npm test`, which is watch mode).
- **Keep files under ~2000 lines** (≤~2200 acceptable); refactor into modules past that.
- **No mock data; no emojis in the UI** (project rule).
- The `cupping_scores` unique index is **partial** (`WHERE session_id IS NOT NULL`) — legacy session-less commodity scores stay unconstrained. Don't switch PUT to `.upsert(onConflict)` (a partial index can't be a PostgREST arbiter); the resilient find-latest+prune is intentional and works with or without the index.
- `--cva-accent-soft` uses CSS `color-mix` (fine on modern browsers / iPad Safari 16.2+).
- Pre-existing `src/app/samples/qc/page.tsx` change (`36fe01b`) is Daniel's, unrelated to CVA.

## Shelved / explicitly NOT doing (yet)
- Phases 2–6 (Describe+wheel / voice / cups screen / Coffee Profile+AI / multi-cupper) are deliberately not built — Phase 1 only. Their absence is expected, not a bug.
- Belt-and-suspenders: no global switch of commodity saves to the resilient pattern (only CVA's route was touched); the new partial unique index hardens both paths at the DB level regardless.

## Next / suggested next-up
1. **Smoke-test the deploy** (steps below) once Vercel finishes — confirms the re-skin + tabs render in prod.
2. **Cup-button auto-routing** — small, high value: make a CVA sample's "Cup" action in the samples list route to `/cupping/cva/...` by methodology, instead of only via the sidebar/index. Unblocks the natural entry path.
3. **Phase 2 — Describe-the-cup + flavor wheel** (the prototype's "wow"). Needs its own brainstorm/plan. Payload (`CvaDescribe` in `types/cva.ts`) and the 3-box CATA model are already decided; the flavor wheel is a 2-ring SVG selector in the prototype.
4. Phases 3–6 per the roadmap in `../plans/2026-06-02-specialty-cva-cupping-phase1.md`.

## Things the user (Daniel) said that should shape future work
- Drove this session: *"the UI is not even close to what we planned, and I can't find the last layout"* → the fix was prototype fidelity, not new design.
- *"ensure that on notebooks it goes full screen"* → done (`h-[100dvh]`, outside MainLayout).
- *"allow for multiple samples at the same time, tabbed, just like the commodity"* → done.
- Design is LOCKED — built from the prototype; don't reopen layout questions.
- Next he wants to **"try some things with Fable 5"** — open-ended; let him drive what to explore.

## Manual smoke test (after deploy)
1. Run the enum guard first if unsure: `ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'cva';`
2. `/cupping/cva` → tick **2+** specialty samples → **Start cupping**.
3. A tab strip appears across the top; each tab is independent — set a roast on tab A, switch to tab B, switch back: tab A's roast and journey step are preserved.
4. Rate all 8 sections on a sample → the score reveal **counts up** from 52.75, the band label appears; a ≥85 score throws confetti.
5. The live-score pill colors to the band once complete; the progress track fills as you go.
6. Switch tabs (autosaves) then **reload** the page → saved scores reload per sample.
7. On a laptop, the journey fills the whole window (no dashboard sidebar).
