# Handoff — CVA mobile UI design canvas (2026-09-03)

**Resume point:** The **section screen is approved** — Daniel: *"the section 2 is good."* Next job is the **wheel**: the four Describe-overlay artboards (3–6) on the canvas were deliberately left untouched during the standards pass and still carry only the first round's proposals. Give them the same treatment section 2 got — check every element against SCA-103 §6.3, decide the open questions in "The wheel — what is actually open" below, rebuild, re-verify, republish to the **same** artifact URL. This is design work on the canvas; **no app code has been written and none is expected until Daniel approves the drawings.**

Canvas: **https://claude.ai/code/artifact/caf8513a-691d-4e29-9e55-454090ba565a** ("CVA on a Phone", 10 artboards, interactive)
Generators: [../design/cva-mobile/](../design/cva-mobile/) — read its `README.md` FIRST; it has the rebuild, verify and republish commands.
Related handoff (the perf rebuild that shipped the live wheel): [2026-09-03-cva-wheel-rebuild-handoff.md](2026-09-03-cva-wheel-rebuild-handoff.md).

## The work (one paragraph)

Daniel asked for the mobile UI of the CVA cupping wheel "and other screens", chose the whole journey as a clickable prototype, and then re-read the three SCA standards and pushed back hard on the first draft. That second pass is what matters: it reopened three decisions locked back on 2026-06-01, found two real production bugs in the shipped wheel, and found that the score pill has been showing a meaningless number. The canvas now holds a step-major journey (section is the page, a sample strip switches lots), a linear nine-point impression track and a continuous 0–15 intensity track that both take a tap **or** a drag and both carry a cooled second mark, plus a brand-new Cups & uniformity step. The section screen is signed off. The wheel overlay is not — it still shows round one's proposals, unexamined against the standard.

## Repo state right now

- **Repo:** `WAQC` — one repo; source, `docs/superpowers/{specs,plans,handoffs,design}/` and `database/migrations/` all live in it. Branch `main`.
- **`main` == `origin/main` == `605a68a`.** Nothing unpushed, no stashes. (`605a68a` is another session's commit updating the wheel-rebuild handoff — it landed while this design work was happening.)
- **Working tree:** one modified file that is **NOT this work** — `src/app/cupping/page.tsx`, owned by a concurrent CVA Panel session. Leave it alone, never `git add -A`.
- **Uncommitted from THIS work:** `docs/superpowers/design/cva-mobile/` (4 generators + README) and this handoff. Both new files, no conflict with the co-edited file. Not yet committed — see "Next".
- **Other worktree:** `/Users/danielwolthers/Documents/GitHub/WAQC-main-wt` on `qc-detail-fixes` — another session's.

## What's done

**No app code.** The deliverable is the published canvas, plus the generators now in the repo.

| Artboard | State |
|---|---|
| 1 · Roast | Unchanged from the app; fine as-is |
| **2 · Section (Aftertaste)** | **APPROVED by Daniel.** The redesign — see "Locked decisions" 4–7 |
| 3 · Describe — at rest | **Round-1 proposals only, not reviewed against SCA-103. This is the job.** |
| 4 · Describe — Fruity framed | same |
| 5 · Describe — sheet open | same |
| 6 · Describe — Mouthfeel | same |
| 7 · Cups & uniformity | NEW this session; implements SCA-104 §5.4.1/§5.4.2 validations |
| 8 · Score · 9 · Panel · 10 · Certify | Redrawn for the phone; not contentious |

The two page-2 "scale alternates" that existed in the first publish were **deleted** — Daniel picked the linear track.

### Verification actually run

| Check | Result |
|---|---|
| `node test-tracks.mjs cva-on-a-phone.html` | **18/18 PASS**, no page errors — tap, drag, both cooled second marks, per-lot state via the sample strip, and both cup rules |
| `seed-canvas.mjs --check` | ok, 10 artboards + canvas.json |
| Per-artboard PNGs at native scale | Inspected; everything fits 390×844 with the note field above the fold |

Nothing was typechecked or linted because no app code changed.

## Locked decisions (do NOT relitigate)

Decisions 1–3 **reopen** rules locked on 2026-06-01. Daniel reopened them himself after re-reading the standards; the June spec ([../specs/2026-06-01-specialty-cva-cupping-design.md](../specs/2026-06-01-specialty-cva-cupping-design.md)) is now stale on these three points and its "No sliders anywhere" line should not be quoted back at you.

1. **Tap-OR-drag tracks with integer snapping.** SCA-103 §6.2: *"Tasters may place a tick anywhere along the intensity scale, even in between integer numbers; however, the integer number closest to the tick shall be recorded."* A tap alone still works (the June rule's intent); a drag refines. Applies to the intensity track **and** the nine-point impression track.
2. **Step-major navigation.** SCA-102 §7: *"step 1 is done for all the coffees on the table, next step 2, and finally step 3."* §4.4: Overall is *"assessed at the end of a cupping."* The section is the page; a sample strip under the ribbon switches lots.
3. **Cups & uniformity is a real step**, between Overall and the reveal.
4. **Nine-point impression is ONE linear row** — the affective form is a single row of ①–⑨ with the rubric printed once. The 3×3 grid from draft one is dead. The verbal rubric is displayed large, because SCA-104 §5.2 tells cuppers to use the scale intuitively.
5. **Cooled = a second mark on the same track**, never a checkbox that overwrites. Initial keeps a dashed outline, an arrow runs between them, the readout shows the FINAL, and the shift line reads e.g. `3 → 5 · rose as it cooled · Final 5`. This mirrors SCA-104 §5.2 (second bubble, arrow, FINAL box, original not erased) and SCA-103 §6.2 for intensity.
6. **The score pill counts sections (`4 / 8`) until all eight are in.** Never show a partial-sum score.
7. **The Describe button names the box it feeds and the remaining cap** — "Flavor & Aftertaste 2 / 5 · tastes 1 / 2" — because the list is shared between two sections, not a per-section budget.
8. **The mockup's wheel geometry and camera states come from the production functions**, not from hand-drawn approximations. `gen-wheel.ts` imports `flyToNode`, `clampCamera`, `visibleLabelKeys`, `PALETTE`, `LABELS`, `arcPathD`. Keep it that way — it is the only reason the mockup can be trusted to reveal real bugs.
9. **Sample references in the mockup are illustrative** (`BR-036991/26`…). Never mint or imply a real certificate number. Other cuppers' names are bracketed placeholders.

## The wheel — what is actually open (this is the job)

### Two production bugs the mockup exposed. Both are real, in shipped code, and neither is fixed.

1. **At rest on a 390 px phone, almost every family name is hidden.** `visibleLabelKeys` requires a label to fit its ring *depth*; at the 11 px floor only `SWEET` and `OTHER` clear the 42 px family ring, so the seven labels that survive are Berry, Sour, Burnt, Nutty, Cocoa, SWEET, OTHER. A cupper opening the wheel on a phone cannot read the families — which are the first thing they must tap. Rule lives at [labels.ts:86](../../../src/components/cupping/cva/wheel/labels.ts#L86) (`labelPx`) and [:111](../../../src/components/cupping/cva/wheel/labels.ts#L111) (`visibleLabelKeys`).
2. **Fruity, the widest family, frames at only 1.345×.** `flyToNode` fits the sector's *chord* to 80 % of the width, so a wide family barely zooms and its leaves (Raspberry, Blackberry, Strawberry, Pomegranate, Pineapple) stay unlabeled after the fly. Small families hit the 3× cap. [camera.ts:107](../../../src/components/cupping/cva/wheel/camera.ts#L107). The canvas has a **`zoomFloor` tweak chip** on each wheel artboard that switches to a 2.2× floor so you can compare; the floored version overflows the width and needs panning. Not decided.

### Proposals already drawn but NEVER reviewed against the standard

Treat these as drafts, not decisions:

- **A family rail** — a horizontal, scrollable row of nine colour chips above the descriptors sheet, added to work around bug 1. It may be the right answer or it may be a crutch that the label fix makes redundant.
- **Stick toggle moved into the top bar.** This one is solid: it resolves a real collision (the "Hide stick" button sat at `bottom:150px`, the tray at `bottom:148px` — both flagged in the wheel-rebuild handoff).
- **Tray → bottom sheet**, collapsed to one 52 px row that already shows the picked chips.
- **"Flavor & Aftertaste" shortened to "Flavor"** in the tab, full name in the sheet header — three tabs plus two buttons do not fit 390 px otherwise.
- **Picks counter given the solid pill treatment** (today it is black text on the dark `#2E2E29` wheel ground in light mode).

### Questions to settle before redrawing

- **SCA-103 §6.3 vs. the tab labels.** The "Aroma" tab *is* the shared fragrance+aroma box (≤5 across both sections); "Flavor" is the shared retronasal box (≤5) plus Main Tastes (≤2); Mouthfeel is ≤2; acidity and sweetness have **no CATA at all**, free text only. The model in code is already correct — `addPickCapped` / `cataForPicks` in [flavor-wheel-data.ts](../../../src/lib/cva/flavor-wheel-data.ts) enforce exactly this. Section 2 now *says* it; the overlay's tabs still don't.
- **Does the overlay need a sample strip?** Step-major means the cupper is comparing lots within one section. Describe state is per-sample. Opening the wheel from a section and having no way to switch lots inside it may force a close/switch/reopen loop. Not addressed on the canvas.
- **The descriptive form (SCA-103 §8.2) is flat checkbox lists**, not a wheel. Worth deciding whether the overlay should offer a list view as a fast path for a cupper who already knows the term — the wheel is the showpiece, but the form is what the standard prints.
- **§6.3.4 freely-elicited descriptors** names three situations for writing one (no CATA box exists; a more precise descriptor inside a checked category; a note in no category). The off-wheel field is there but unexplained.

## Codebase anchors

Design generators (new, uncommitted): [../design/cva-mobile/README.md](../design/cva-mobile/README.md) — pipeline; `gen-wheel.ts` — camera/label states; `build.mjs` — every artboard (`buildSection` is the approved one, `buildWheel` is the job, `buildCups` is new); `test-tracks.mjs` — the 18 assertions.

Production code the design implies changing (**none of it touched**):

- [useCvaSession.ts:36](../../../src/hooks/useCvaSession.ts#L36) — `steps` is `Record<sampleId, number>`. Step-major needs ONE shared step. This is the single structural change.
- [LiveScore.tsx:20](../../../src/components/cupping/cva/LiveScore.tsx#L20) — prints `live.score` whenever `count > 0`; must show `n / 8` until `live.complete`.
- [IntensityTrack.tsx](../../../src/components/cupping/cva/IntensityTrack.tsx) — 16 tap cells today; its header comment still says *"never a slider (locked rule)"*, now superseded by decision 1.
- [ImpressionScale.tsx](../../../src/components/cupping/cva/ImpressionScale.tsx) — the cooled model here is already **correct** (`impression` + `impression_final`, arrow, final scores). Only the layout changes. Do not "fix" the data model.
- [types/cva.ts:39](../../../src/types/cva.ts#L39) — `cups.non_uniform` / `cups.defective` exist and **nothing writes them**, so every CVA score in the database has u = d = 0. Intensity has no `_final` field; SCA-103 §6.2 wants one.
- [CvaJourney.tsx](../../../src/components/cupping/cva/CvaJourney.tsx) — the shell, tab strip, progress path and step indices (`SCORE_STEP = 9` is a fixed index that shifts if Cups is inserted).
- Standards, in the repo: `Documents/Specialty/AW_SCA-102_Sample-Preparation_28.10.24_Secured.pdf` (12 pp), `AW_SCA-103_Descriptive-Assessment_Sept2024_Secured.pdf` (12 pp), `AW_SCA-104_Affective-Assessment_Sept2024_Secured.pdf` (11 pp). Read them with the Read tool's `pages` param. The pages that matter: 103 pp. 7–8 (§6.2 intensity, §6.3 CATA) and p. 10 (the form); 104 p. 7–8 (§5.2 scale, §5.4 defects) and p. 10 (the form); 102 p. 10–11 (§6 steps, §7.2 coffees per session).

## Gotchas

**This repo** (the handoff skill's shared `wolthers-repo-facts.md` describes a *different* repo — its numbers are wrong here):

- **`npm test` starts vitest in WATCH mode and hangs.** One-shot is `npx vitest run`. No `npm run verify`, no `npm run typecheck` — use `npx tsc --noEmit` (baseline **0** errors) and `npx eslint <path>`.
- **Migrations live in `database/migrations/`** (not `supabase/migrations/`). Newest is `20260901000001_cva_adopt_roster_sessions.sql`. Daniel applies every migration himself and prefers pasted SQL.
- **The repo is co-edited.** Another session owns `src/app/cupping/page.tsx` and the `qc-detail-fixes` worktree. Stage targeted paths; never `git add -A`; never bare `git stash`.
- **Pushing `main` auto-deploys Vercel production.** Commit freely, ask before pushing.

**This design work:**

- **The scratchpad is session-scoped and will be gone.** That is why the generators were copied into the repo. Rebuild per the README; do not hunt for `/private/tmp/claude-501/.../scratchpad/design`.
- **Publishing from a fresh conversation needs `url` + a prior `action: "read"`.** Without `url` you create a *second* artifact; without the read the publish is refused. Pass `contract: "0.1.31"`, omit `capabilities`, keep the 📱 favicon and the title.
- **The chrome-devtools MCP browser is usually locked** by another session ("browser is already running for … chrome-profile"). Don't fight it — `shot-boards.mjs` / `test-tracks.mjs` launch their own Puppeteer profile.
- **Puppeteer events must be dispatched inside the artboard iframe**, in frame-local coordinates. The canvas scales artboards, so `page.mouse` lands in the wrong segment — this produced six false failures before it was caught.
- **Each wheel artboard inlines the whole 110-node SVG (~122 KB × 4).** The seeded page is 3.1 MB against a 16 MB cap — room to grow, but don't add wheel artboards carelessly.
- **`src/lib/cva/flavor-wheel-data.ts` is shared with the PDF certificate wheel.** Any geometry change hits both surfaces.
- **The live wheel's own locked rules still hold** (from the rebuild): no filters inside `.wheel-root`, zero transitions inside the `<svg>`, nothing ever dims, hover-dwell fly stays, zoom caps 1.5× desktop / 3× mobile. Read the header comment at [FlavorWheel.tsx:3-36](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L3-L36) before touching that folder.

## Things Daniel said that should shape the work

- *"the section 2 is good. Now on the wheel"* — the approval and the assignment.
- *"think of a different approach for section 2 view, maybe a slider on intensity, instead of 16 blocks?"* — the question that started the standards pass. He proposes; he does not merely approve.
- He re-reads the source standards and checks the work against them. Cite section numbers, and verify a claim against the PDF before repeating it — in the last round three of the eight review points were wrong on the facts (the cooled model and the CATA sharing were already correct in code, and the "3 ●●○" badge was a total, not a per-section budget). Pushing back with evidence was the right move and he took it.
- Migrations are pasted and applied by him, never run by Claude. He controls when `main` is pushed.
- Files stay under ~2000 lines; tell him and refactor if something crosses it.

## Next

1. **Commit what is uncommitted** (nothing is): `docs/superpowers/design/cva-mobile/` + this handoff. Suggested: `docs(design): CVA phone canvas generators + handoff — section screen approved, wheel next`. Do not push without asking.
2. **Do the wheel pass.** Settle the four questions above, redraw artboards 3–6, `node build.mjs` → re-seed → `--check` → `test-tracks.mjs` → per-artboard PNGs → republish to the same URL.
3. **Then, and only with Daniel's go-ahead, the code.** Ordered by value-per-effort: the score pill (`n / 8`, one line); the two wheel bugs (label fit, zoom floor); the `CupsStep` (June spec §3.5, Phase 4, never built — it is why every score has u = d = 0); the shared step in `useCvaSession`; `intensity_final`. The last two are the structural ones.
4. **Open and undrawn:** SCA-102 §7.2 — a session using the combined form should run fewer coffees per table. That is a session-setup warning, not a journey screen.
