# Handoff — CVA mobile UI design canvas (updated 2026-09-04)

**Resume point:** The wheel pass is **done and published** — artboards 3–6 were redrawn against SCA-103 §6.3 and the canvas now holds 11 boards. Nothing is drawn or decided that is still waiting on you. The next move is **Daniel's review of the redrawn wheel**; when he approves, the job becomes **app code**, in the order under "Next". Still **no app code has been written** — the two production changes the design depends on live only in the generator, clearly marked.

Canvas: **https://claude.ai/code/artifact/caf8513a-691d-4e29-9e55-454090ba565a** ("CVA on a Phone", 11 artboards, interactive)
Generators: [../design/cva-mobile/](../design/cva-mobile/) — read its `README.md` FIRST; it has the rebuild, verify and republish commands, plus the one place the mockup deliberately diverges from production.
Related handoff (the perf rebuild that shipped the live wheel): [2026-09-03-cva-wheel-rebuild-handoff.md](2026-09-03-cva-wheel-rebuild-handoff.md).

## The work (one paragraph)

Daniel asked for the mobile UI of the CVA cupping wheel "and other screens", chose the whole journey as a clickable prototype, then re-read the three SCA standards and pushed back on the first draft. That second pass reopened three decisions locked on 2026-06-01 and produced the approved section screen. This session did the same for the wheel: measured the shipped label and camera rules against a real 390 px phone, found the family-name failure is **far worse than recorded** (2 of 9 names visible, not 7), proved no label-geometry fix reaches nine, and took Daniel's own counter-proposal — rest the wheel zoomed in and let the thumbstick travel — which does reach nine. Three production bugs are now quantified, two of them fixed in the drawing.

## Repo state right now

- **Repo:** `WAQC` — one repo; source, `docs/superpowers/{specs,plans,handoffs,design}/` and `database/migrations/` all live in it. Branch `main`.
- **`main` is AHEAD of `origin/main` by 2 commits, both from this work and both unpushed:**
  - `eb75fb2` — the generators + the previous version of this handoff
  - the commit carrying the wheel pass (see "What's done")
  Nothing has been pushed. **Ask before pushing** — pushing `main` auto-deploys Vercel production (though nothing here touches app code, so the deploy would be a no-op).
- **Working tree:** one modified file that is **NOT this work** — `src/app/cupping/page.tsx`, owned by a concurrent CVA Panel session. Leave it alone, never `git add -A`.
- **Other worktree:** `/Users/danielwolthers/Documents/GitHub/WAQC-main-wt` on `qc-detail-fixes` — another session's.

## What's done

**No app code.** The deliverable is the published canvas plus the generators.

| Artboard | State |
|---|---|
| 1 · Roast | Unchanged from the app; fine as-is |
| 2 · Section (Aftertaste) | **APPROVED by Daniel** (previous session) — see "Locked decisions" 4–7 |
| **3 · Describe — at rest** | **REDRAWN.** Rests at 1.7×; all nine family names legible; thumbstick is now the primary navigation and reads like a control |
| **4 · Describe — Fruity framed** | **REDRAWN.** 2.2× floor; all 18 Fruity leaves named |
| **5 · Describe — sheet open** | **REDRAWN.** Same header/stage changes |
| **6 · Describe — official checklist** | **NEW.** The 24 §8.2 CATA boxes, ticked by your wheel picks, with each leaf shown as its §6.3.4 written-in term |
| 7 · Describe — Mouthfeel | Renumbered (was 6); header changes only |
| 8 · Cups & uniformity | From the previous session; implements SCA-104 §5.4.1/§5.4.2 |
| 9 · Score · 10 · Panel · 11 · Certify | Renumbered; not contentious |

The family rail is **gone** — its only job was naming families you could not read, and at 1.7× you can read them. That gave 44 px back to the stage.

### Verification actually run

| Check | Result |
|---|---|
| `node test-tracks.mjs cva-on-a-phone.html` | **29/29 PASS** (was 18), no page errors — the 18 existing assertions plus 11 new ones covering the wheel pass |
| `gen-wheel.ts` self-check | `FORM_BOXES: 24 boxes, matches CATA_BOXES` — the list view cannot drift from the production set |
| `gen-wheel.ts` report | `FAMILY NAMES legible at rest: 2/9 as built (1×) -> 9/9 proposed (1.7×)` |
| `seed-canvas.mjs --check` | ok, 11 artboards + canvas.json; page 3.37 MB against the 16 MB cap |
| Per-artboard PNGs | Inspected. 10 of 11 capture per run — one iframe never mounts (lazy canvas); every board changed this session was captured |

Nothing was typechecked or linted because no app code changed.

## Locked decisions (do NOT relitigate)

Decisions 1–3 **reopen** rules locked on 2026-06-01. Daniel reopened them himself after re-reading the standards; the June spec ([../specs/2026-06-01-specialty-cva-cupping-design.md](../specs/2026-06-01-specialty-cva-cupping-design.md)) is stale on these three points and its "No sliders anywhere" line should not be quoted back at you.

1. **Tap-OR-drag tracks with integer snapping.** SCA-103 §6.2: *"Tasters may place a tick anywhere along the intensity scale, even in between integer numbers; however, the integer number closest to the tick shall be recorded."*
2. **Step-major navigation.** SCA-102 §7. §4.4: Overall is *"assessed at the end of a cupping."* The section is the page; a sample strip switches lots.
3. **Cups & uniformity is a real step**, between Overall and the reveal.
4. **Nine-point impression is ONE linear row**, rubric printed once and large (SCA-104 §5.2).
5. **Cooled = a second mark on the same track**, never a checkbox that overwrites (SCA-104 §5.2, SCA-103 §6.2).
6. **The score pill counts sections (`4 / 8`)** until all eight are in. Never a partial-sum score.
7. **The Describe button names the box it feeds and the remaining cap** — the list is shared between two sections, not a per-section budget.
8. **The mockup's wheel geometry and camera states come from the production functions.** `gen-wheel.ts` imports `flyToNode`, `clampCamera`, `labelPx`, `arcLengthPx`, `PALETTE`, `LABELS`, `arcPathD`, `CATA_BOXES`. Keep it that way — it is the only reason the mockup can be trusted to reveal real bugs. The **two** deliberate divergences are listed in the README and are themselves the proposal.
9. **Sample references in the mockup are illustrative** (`BR-036991/26`…). Never mint or imply a real certificate number.

### Decided 2026-09-04, this session

10. **The phone wheel rests at 1.7×, not 1×.** Daniel's own proposal, after rejecting all four options put to him: *"Zoom in on center ring giving more room for it, user moves the virtual thumbstick joystick… if he goes up it zooms up there on the top revealing the outer top families, going to the right will slowly move there to the right."* At 1× only OTHER and SWEET clear the 42 px family ring; 1.66× is where the last name clears the 11 px floor, so 1.7×. The wheel is then ~650 px across in a 390 px viewport — **cropped by design** — and the thumbstick becomes primary navigation. `Thumbstick` already reports exactly that vector and `FlavorWheel`'s rAF loop already applies it, so **no new control is needed**.
11. **`ARC_FAMS` goes away.** Green/Vegetative and Sour/Fermented are forced to arc (textPath) labels today and therefore never appear at any zoom: 46 px of arc against names needing 97 and 85 px. Split at the slash and measured radially they fit at 1.66× and 1.52×. This removes a special case rather than adding one.
12. **Framing a family floors at 2.2×.** Daniel picked the floor over the chord fit, accepting that Fruity and Other overflow and need panning. Consistency across families beats fitting the sector on screen — the cupper is reading leaf names.
13. **The lot strip lives in the overlay's top bar**, as its own 44 px row above the tabs. It cannot share the tab row: a lot chip + 3 tabs + 2 icon buttons measures past 390 px. Picks are per lot.
14. **A wheel/list toggle shows the official 24 boxes.** §7 makes the app the recommended instrument and the paper form the fallback, so the list is not required — but the boxes are the record being created, and the list doubles as a fast path for a cupper who already knows the term.
15. **The family rail is deleted** (consequence of 10).

## The three production bugs, all quantified

Measured on a 390×738 stage with the production functions. None is fixed in app code.

1. **At rest, a cupper sees 2 of 9 family names** — OTHER and SWEET. (The previous handoff said seven survived; those five were ring-2 labels, not families.) Fixed in the drawing by decisions 10 + 11 → 9 of 9. [labels.ts:86](../../../src/components/cupping/cva/wheel/labels.ts#L86) `labelPx`, [:111](../../../src/components/cupping/cva/wheel/labels.ts#L111) `visibleLabelKeys`, `ARC_FAMS` at [:11](../../../src/components/cupping/cva/wheel/labels.ts#L11).
2. **Fruity frames at 1.345× and leaves 7 of its 18 leaves unnamed** (Other: 1.489×, 3 of 16). Every other family reaches 2.18–3× and names all of them. `flyToNode` fits the sector's *chord* to 80 % of the width, so the widest families barely zoom. Fixed in the drawing by decision 12. [camera.ts:107](../../../src/components/cupping/cva/wheel/camera.ts#L107).
3. **NEW — the 5-pick cap is not the standard's cap, in both directions.** `OLF_CAP` counts **wheel picks**; §6.3.1 caps what is *"selected in this list"*, i.e. checked boxes. Measured: of 85 pickable leaves, 47 tick two boxes and 38 tick one, so five picks can tick **10** boxes — double the cap — while four picks inside Fruity›Berry tick only **2** and the UI still says 4/5 used. Not fixed anywhere; the list view surfaces the real count ("4 ticked by your 2 wheel picks") so it is at least visible. **This one is an interpretation call, not a flat bug — put it to Daniel before changing the cap.**

## Codebase anchors

Design generators: [../design/cva-mobile/README.md](../design/cva-mobile/README.md) — pipeline and the two deliberate divergences; `gen-wheel.ts` — `REST_ZOOM`, `proposedVisibleLabelKeys`, `FORM_BOXES` (self-checked against `CATA_BOXES`); `build.mjs` — `buildSection` is the approved screen, `buildWheel` is the redrawn one, `buildCups`; `test-tracks.mjs` — the 29 assertions; `shot-boards.mjs` — captures named by artboard title, every Puppeteer call timeout-raced.

Production code the design implies changing (**none of it touched**):

- [camera.ts:24](../../../src/components/cupping/cva/wheel/camera.ts#L24) — `restCamera()` is `scale: 1`. Decision 10 makes it 1.7 **on compact viewports only**; desktop rests at 1 and must stay there.
- [camera.ts:107](../../../src/components/cupping/cva/wheel/camera.ts#L107) — `flyToNode` needs the 2.2× floor on mobile (decision 12).
- [labels.ts:11](../../../src/components/cupping/cva/wheel/labels.ts#L11) — delete `ARC_FAMS` and the arc branch in `labelGeoFor` (decision 11).
- [DescribeOverlay.tsx](../../../src/components/cupping/cva/wheel/DescribeOverlay.tsx) — the top bar gains the lot row; `INSET_COLLAPSED` loses the rail's 44 px; the list view is new.
- [useCvaSession.ts:36](../../../src/hooks/useCvaSession.ts#L36) — `steps` is `Record<sampleId, number>`. Step-major needs ONE shared step. The single structural change.
- [LiveScore.tsx:20](../../../src/components/cupping/cva/LiveScore.tsx#L20) — prints `live.score` whenever `count > 0`; must show `n / 8` until `live.complete`.
- [IntensityTrack.tsx](../../../src/components/cupping/cva/IntensityTrack.tsx) — 16 tap cells; its header comment still says *"never a slider (locked rule)"*, superseded by decision 1.
- [ImpressionScale.tsx](../../../src/components/cupping/cva/ImpressionScale.tsx) — the cooled data model is already **correct**. Only the layout changes. Do not "fix" the data model.
- [types/cva.ts:39](../../../src/types/cva.ts#L39) — `cups.non_uniform` / `cups.defective` exist and **nothing writes them**, so every CVA score has u = d = 0. Intensity has no `_final` field; §6.2 wants one.
- [flavor-wheel-data.ts:139](../../../src/lib/cva/flavor-wheel-data.ts#L139) — `CATA_BOXES` (24) and `cataForPick`, which correctly checks family + subcategory and writes the leaf as the §6.3.4 term. **Verified against the printed form this session — do not "fix" it.** `OLF_CAP` is at [:169](../../../src/lib/cva/flavor-wheel-data.ts#L169) (see bug 3).
- [CvaJourney.tsx](../../../src/components/cupping/cva/CvaJourney.tsx) — the shell, tab strip and step indices (`SCORE_STEP = 9` shifts if Cups is inserted).
- Standards, in the repo: `Documents/Specialty/AW_SCA-10{2,3,4}_*.pdf`. Read with the Read tool's `pages` param. The pages that matter: **103 pp. 7–8** (§6.2 intensity, §6.3 CATA — §6.3.4's blueberry example is the key one) and **p. 10** (the form: 24 boxes, Main Tastes only in the Flavor box, acidity/sweetness have no CATA); 104 pp. 7–8 and p. 10; 102 pp. 10–11.

## Gotchas

**This repo** (the handoff skill's shared `wolthers-repo-facts.md` describes a *different* repo — its numbers are wrong here):

- **`npm test` starts vitest in WATCH mode and hangs.** One-shot is `npx vitest run`. No `npm run verify`, no `npm run typecheck` — use `npx tsc --noEmit` (baseline **0** errors) and `npx eslint <path>`.
- **Migrations live in `database/migrations/`.** Daniel applies every migration himself and prefers pasted SQL.
- **The repo is co-edited.** Another session owns `src/app/cupping/page.tsx` and the `qc-detail-fixes` worktree. Stage targeted paths; never `git add -A`; never bare `git stash`.
- **Pushing `main` auto-deploys Vercel production.** Commit freely, ask before pushing.

**This design work:**

- **The scratchpad is session-scoped and will be gone.** Rebuild per the README; do not hunt for the old scratch directory. Two scripts had a *hardcoded* scratch path from a dead session baked in — both are now relative, but check any new script for the same mistake.
- **Publishing from a fresh conversation needs `url` + a prior `action: "read"`.** Without `url` you create a *second* artifact; without the read the publish is refused. Pass `contract: "0.1.31"`, omit `capabilities`, keep the 📱 favicon and the title.
- **Puppeteer: kill the profile between runs.** An interrupted run leaves `chrome-profile` locked and the next launch dies with "browser is already running". `rm -rf chrome-profile` first.
- **Puppeteer events must be dispatched inside the artboard iframe**, in frame-local coordinates — the canvas scales artboards, so `page.mouse` lands in the wrong segment.
- **Each wheel artboard inlines the whole 110-node SVG (~128 KB × 5).** The seeded page is 3.37 MB against a 16 MB cap.
- **`src/lib/cva/flavor-wheel-data.ts` is shared with the PDF certificate wheel.** Any geometry change hits both surfaces — which is exactly why widening the family ring was rejected as the fix for bug 1.
- **The live wheel's own locked rules still hold** (from the rebuild): no filters inside `.wheel-root`, zero transitions inside the `<svg>`, nothing ever dims, hover-dwell fly stays, zoom caps 1.5× desktop / 3× mobile. Read the header comment at [FlavorWheel.tsx:3-36](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L3-L36) before touching that folder.
- **A `},` replacement that leaves `},,`** silently produces a hole in `canvas.json`'s annotations array, and `seed-canvas.mjs --check` rejects it with "an annotation is not an object". That is the error's real cause.

## Things Daniel said that should shape the work

- *"the section 2 is good. Now on the wheel"* — the previous approval and this session's assignment.
- **He rejects the menu and proposes his own option.** Given four ways to fix the family names he took none of them and described a fifth — resting zoomed in with thumbstick travel — which measured better than all four. Put options to him, but expect a fifth, and measure it before arguing.
- He re-reads the source standards and checks the work against them. Cite section numbers, and verify a claim against the PDF before repeating it — in an earlier round three of eight review points were wrong on the facts. Pushing back with evidence was the right move and he took it.
- Migrations are pasted and applied by him, never run by Claude. He controls when `main` is pushed.
- Files stay under ~2000 lines; tell him and refactor if something crosses it.

## Next

1. **Daniel reviews the redrawn wheel** on the canvas. Nothing else should start before that.
2. **Push the two unpushed commits** when he says so.
3. **Then the code**, ordered by value-per-effort:
   - the score pill (`n / 8`) — one line, [LiveScore.tsx:20](../../../src/components/cupping/cva/LiveScore.tsx#L20)
   - `ARC_FAMS` deletion + the compact rest zoom + the 2.2× fly floor — the three wheel changes, all small and all in `camera.ts`/`labels.ts`; **guard the rest zoom on compact only**
   - the overlay's lot row, the rail deletion, and the list view — `DescribeOverlay.tsx`
   - the `CupsStep` (June spec §3.5, Phase 4, never built — it is why every score has u = d = 0)
   - the shared step in `useCvaSession`, and `intensity_final`. The structural two.
   - the cap-unit question (bug 3) — **ask first**, do not just change `OLF_CAP`
4. **Open and undrawn:** SCA-102 §7.2 — a session using the combined form should run fewer coffees per table. A session-setup warning, not a journey screen.
