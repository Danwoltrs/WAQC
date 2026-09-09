# Handoff — CVA mobile UI design canvas (updated 2026-09-09 pm: first phone test → three fixes, committed)

**Resume point (updated 2026-09-09 pm):** Daniel ran the first phone test and came back with three issues; all three are **fixed and committed on `main`, NOT pushed** (see "2026-09-09 pm" at the bottom — commit SHAs there). The next thing to do is **push and re-test on the phone**: (1) the stick is now a D-pad — push steps the highlight wedge-to-wedge with a tick, release selects; (2) the 1–9 row drags with a tick per integer, the readout sits under the title, nothing auto-advances, Next offers the wheel once per section when its list is empty; (3) roast levels fit. The **iOS haptic** relies on the hidden `<input type=checkbox switch>` trick (iOS ≥ 17.4) — unverified on a device; if nothing buzzes on his iPhone, that is the first thing to look at (`src/lib/haptics.ts`). Still open from before: impression one-row layout is DONE by way of the readout move (decision 4 satisfied); the checklist's tap-to-check half and the SCA-102 §7.2 warning remain.

Canvas: **https://claude.ai/code/artifact/caf8513a-691d-4e29-9e55-454090ba565a** ("CVA on a Phone", 11 artboards, interactive)
Generators: [../design/cva-mobile/](../design/cva-mobile/) — read its `README.md` FIRST; it has the rebuild, verify and republish commands. The mockup no longer diverges from production anywhere.
Related handoff (the perf rebuild that shipped the live wheel): [2026-09-03-cva-wheel-rebuild-handoff.md](2026-09-03-cva-wheel-rebuild-handoff.md).

## The work (one paragraph)

Daniel asked for the mobile UI of the CVA cupping wheel "and other screens", chose the whole journey as a clickable prototype, then re-read the three SCA standards and pushed back on the first draft. That second pass reopened three decisions locked on 2026-06-01 and produced the approved section screen. This session did the same for the wheel: measured the shipped label and camera rules against a real 390 px phone, found the family-name failure is **far worse than recorded** (2 of 9 names visible, not 7), proved no label-geometry fix reaches nine, and took Daniel's own counter-proposal — rest the wheel zoomed in and let the thumbstick travel — which does reach nine. Three production bugs are now quantified, two of them fixed in the drawing.

## Repo state right now

- **Repo:** `WAQC` — one repo; source, `docs/superpowers/{specs,plans,handoffs,design}/` and `database/migrations/` all live in it. Branch `main`.
- **`origin/main == 47b938a`; local `main` is AHEAD and unpushed** (2026-09-09 pm): `8dfd4be` (a writeback fix from another line of work) and then this round's commits — roast fit, section screen, stick D-pad, this handoff. Check with `git log --oneline @{u}..`. Pushing deploys all of it to production; Daniel controls when.
- **Working tree:** one modified file that is **NOT this work** — `src/app/cupping/page.tsx`, owned by a concurrent CVA Panel session. Leave it alone, never `git add -A`.
- **Other worktree:** `/Users/danielwolthers/Documents/GitHub/WAQC-main-wt` on `qc-detail-fixes` — another session's.

## What's done

The canvas (below) was the deliverable of the design pass; the code that implements it shipped 2026-09-09 — see "Shipped".

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
8. **The mockup's wheel geometry and camera states come from the production functions.** `gen-wheel.ts` imports `flyToNode`, `clampCamera`, `labelPx`, `arcLengthPx`, `PALETTE`, `LABELS`, `arcPathD`, `CATA_BOXES`. Keep it that way — it is the only reason the mockup can be trusted to reveal real bugs. The two divergences it briefly carried on 2026-09-04 (rest zoom, `ARC_FAMS` removal) are in production now and the generator is pure production again.
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

## Shipped 2026-09-09 (all TDD — every test watched failing first)

| SHA | What |
|---|---|
| `60f8c51` | Compact wheel rests at 1.7× (`REST_SCALE_MOBILE`) → 9/9 family names; `ARC_FAMS` and the `arc` LabelGeo deleted; flies floored at 2.2× (`FLY_FLOOR_MOBILE`) → Fruity names all 18 leaves; `isZoomedIn(scale, restScale)` replaces every `> 1.05`. Desktop untouched. `gen-wheel.ts` now runs against production with zero divergence and reproduces the numbers. |
| `12722df` | Score pill: `Sections 4 / 8` until complete; accessible name always starts "Score". |
| `bf5426b` | Lot strip in the overlay's top bar (own row — a chip + 3 tabs + 2 buttons overflow 390 px); wheel/list toggle with the 24 §8.2 boxes ticked by picks and the leaf as the §6.3.4 written-in term; `FORM_BOXES` beside `CATA_BOXES`, test-asserted equal. |
| `9c1c9af` | Cap on BOXES (§6.3.1): `BOX_CAP`, `addPickBoxCapped` refuses and names the box, wheel counter `Boxes n/5`, pulse on refusal, Describe button "Aroma · 2 / 5 boxes · …" (decision 7). `OLF_CAP`/`addPickCapped` deprecated, no callers. |
| `0745f87` | Cups & uniformity step at index 9 (Score 10, Panel 11, Certify 12). `lib/cva/cups.ts`: §5.4.1 untyped defect not counted but still non-uniform; §5.4.2 defective ⇒ non-uniform unless all five evenly (typed) defective. `setCups` in the hook; PUT route already derives u/d. |
| `90551e8` | Intensity track = slider (tap/drag/keys, nearest integer); `describe.intensities_final`; `effectiveIntensity()`; ONE Cooled toggle per section in `SectionScreen` arming both scales (`ImpressionScale` accepts `cooling`/`onCoolingChange`, uncontrolled when absent). |
| `47b938a` | Step-major: one shared step; strip shows "· rated / · not rated" for the current section + `aria-current`; next lot after certify gets its Certify; descriptors gate fires on arrival by tab switch, "Keep describing" → Cups. |

**Deliberately left open — decide, don't guess:** the checklist is read-only. Every box maps to a wheel node, so ticking could add the pick; but un-ticking "Berry" when it is checked *because Blueberry was picked* would have to delete that note silently. That is a semantics decision.

**Verification of the batch:** `npx vitest run src/components/cupping/cva src/lib src/hooks src/types` → 1364 passed / 95 files; `npx tsc --noEmit` clean; `npx eslint` clean; `npm run build` clean.

## Next

1. **Joystick on a real phone.** Open a CVA lot on a phone, Describe → the wheel rests cropped at 1.7×; push the stick up/right; framing a family should reach ≥ 2.2×; "centre · zoom out" should return to 1.7×, not 1×; pinch-out to 1× still works.
2. **Impression one-row layout** (decision 4) — `ImpressionScale.tsx` layout only; do NOT touch its data model or the cooled model (both correct).
3. **Checklist tap-to-check** — ask Daniel what un-tick means first (delete the backing pick? refuse? only allow un-ticking boxes with no leaf behind them?).
4. **SCA-102 §7.2** session-setup warning.


## 2026-09-09 pm — first phone test: three fixes (all TDD, committed, not pushed)

Daniel opened a CVA lot on his iPhone (qc.wolthers.com) and sent four screenshots. Three issues, fixed in this order of commits (SHAs in `git log`, three commits after `8dfd4be` plus a docs commit):

| Issue he saw | Root cause | Fix |
|---|---|---|
| **Roast level did not fit the card** — "Dark" pushed off the right | Five `flex-1` buttons keep their label's min-content width ("Medium-" at 11 px bold), 5 × ~62 + gaps > the card's 278 px inner width on a 390 px phone | `RoastStep.tsx`: `grid grid-cols-5`, `min-w-0`, full-width card with `p-4` below `sm`, centred, `<wbr>` after the hyphen |
| **The stick did nothing** — "I tried going up and it doesn't go up" | `startLoop` reset `lastT` to 0, so the loop's first frame integrated with **dt = 0**, saw no target change and stopped. The stick (and the desktop edge pan!) only ever moved while a fly was in flight. The old test "a held stick does not keep the loop alive" passed *because* the loop was dead. Also: the fake `performance` clock in that suite never advances, so anything time-based had never been exercised | `FlavorWheel.tsx`: first frame gets `FIRST_DT = 1/60`; regression test "a mouse parked in the edge band of a framed wheel pans it" with a `frameClock()` shim. And the stick was **re-designed as Daniel asked**: a D-pad (below) |
| **Section screen** — no drag on 1–9, auto-advanced before the intensity could be placed, did not fit one screen, no haptics | `onCommit` → `goToStep(step+1)` on every pick; layout sized for a desk | `ImpressionScale` drags (pointer capture on the row, nearest block, tick per integer, buttons keep `onClick` only for `detail === 0` = keyboard/AT); `onCommit` deleted everywhere; readout ("7 · Moderately High", or "6 → 8 · Very High") moved to `SectionScreen`'s header in the hint's place (`role=status`); intensity caption shares the numeric row (`IntensityTrack` `label` prop); compact `sm:`-gated sizes throughout; `CvaJourney` header is one row on a phone (trail + subtitle `hidden sm:`, a back chevron Link keeps a way out), progress labels already hid; Next offers the wheel via a `role=dialog` "Add aromas first?" with **Skip / Open the wheel** |

**The stick, as built (spec table updated):** `stick-nav.ts` is pure — `stepFocus(from, fromKey, dir, focusFamily)` picks the nearest candidate inside a 62° cone in the pushed SCREEN direction (score = distance / cos²); candidates are the 9 families at rest, or the framed family's own wedges + every family wedge when framed; `repeatMs(m)` 380 → 150 ms by deflection; `followCamera` shifts the camera only when the highlight leaves the inner 22 % box, then clamps. `FlavorWheel` reuses the keyboard focus ring (`focusKey` / `is-focus`, now white 2.2 units) as the highlight, ticks per step (`hapticTick`), and **letting the knob go selects** (`activate` → family flies in / wedge in the framed family toggles); a tap or long-press on the glass while the knob is held also selects the highlight and disarms the release. A hold that never stepped selects nothing. A push with nothing that way "exhausts" the hold so the loop rests (rule 7 kept). `Thumbstick` gained `onGrab`/`onRelease`; knob 48 → 56 px (`STICK_KNOB` + CSS together).

**Haptics:** `src/lib/haptics.ts` — `hapticTick` (5 ms) / `hapticSelect` (8) / `hapticRefuse` ([12,40,12]). `navigator.vibrate` where it exists (Android); otherwise the iOS trick: a hidden `<label><input type="checkbox" switch></label>` clicked programmatically plays the system switch haptic on iOS ≥ 17.4 *when called from a user-gesture handler*. Every touch surface routes through it (wheel, impression row, intensity track). **Unverified on a real iPhone.** If it does not fire from `pointermove` (transient activation may not extend to it), the fallback is to fire only on `pointerdown`/`pointerup`.

**Interpretations made without asking (Daniel was not interactive):** "hard pressing the screen selects it" → a tap/long-press on the glass *while the knob is held* (the web has no force-touch API); the nudge fires only from the footer's **Next** (progress-path jumps are deliberate navigation), once per lot per section (Fragrance and Aroma are different moments, so skipping at Fragrance still asks at Aroma); Acidity/Sweetness have no wheel and are not asked. The old continuous stick pan is gone (two-finger pan and pinch remain).

**Verification run:** `npx vitest run src/components/cupping/cva src/lib/haptics.test.ts src/lib/cva src/hooks src/types` → 375 passed / 27 files; `npx tsc --noEmit` → 0; `npx eslint src/components/cupping/cva src/lib/haptics.ts` → 0; `npm run build` → compiled. Not verified: anything on a device (fit-on-one-screen is arithmetic: ~634 px for one lot on a 390 px phone, ~673 with the lot strip, against Safari's ~659 small viewport — the strip case may need the address bar collapsed).

**Gotcha found:** `vi.useFakeTimers({ toFake: [... 'performance'] })` does NOT advance `performance.now()` in this jsdom setup. `FlavorWheel.test.tsx` now has `frameClock()` which hands the rAF loop 16 ms per frame; use it for anything that waits on time in the wheel.
