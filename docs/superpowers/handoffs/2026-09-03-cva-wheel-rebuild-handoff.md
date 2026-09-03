# Handoff — CVA flavour wheel rebuild (2026-09-03)

**Resume point:** The rebuild and feedback round 1 are LIVE on production. **Round 2 (`ed3b7fe` + its doc commit `e4c17fb`) is committed on `main` but NOT pushed** — a push deploys, and Daniel controls when. So: (1) `git push origin main` when he says so; (2) **physical parity QA** on a real desktop first, then iPad/phone — the smoke test at the bottom of this file, plus Task 12 Step 3 of [../plans/2026-09-02-cva-wheel-rebuild.md](../plans/2026-09-02-cva-wheel-rebuild.md); (3) **sub-project 2**, the wheel on mainstream (commodity) qualities — locked decisions sit in the spec's appendix but there is **no spec yet**, so it starts with a brainstorm, not code.

Spec: [../specs/2026-09-02-cva-wheel-rebuild-design.md](../specs/2026-09-02-cva-wheel-rebuild-design.md) (revised in place, with dated notes for both feedback rounds).

## The work (one paragraph)

The specialty (SCA CVA) flavour wheel — the fullscreen "Describe the cup" overlay a cupper opens from the CVA journey — was unusable at roughly 5 fps on a large window. Phase 0 profiling (four Puppeteer traces of the unmodified wheel) showed two specific pathologies, not SVG itself: CSS `transform` transitions on SVG `<g>` elements make Blink re-lay-out all 679 nodes every animated frame, and 30+ blur filters re-raster at device pixel ratio on each of those frames. The rebuild renders the SVG scene once and never transforms it, drives a single CSS transform on an HTML camera div from one `requestAnimationFrame` spring loop, hit-tests with polar maths through one root listener, deleted every blur, and shows a label only when its arc is at least 14 screen px. Drilling flies the camera across a wheel that stays whole — by click, and again by resting the mouse on a family. Mobile has a real interaction layer: a tossable thumbstick, long-press-to-fly, pinch, two-finger pan, double-tap out, swipe-down to close. Two rounds of Daniel's feedback then restored the hover-dwell zoom, made labels grow with the zoom instead of holding at 15 px, lifted the camera clear of the descriptors tray, and removed the dimming of non-framed families entirely.

## Repo state right now

Sourced from `bash ~/.claude/skills/handoff/scripts/gather-state.sh`, run at the end of the session.

- **Repo:** `WAQC` — one repo; source, `docs/superpowers/{specs,plans,handoffs}/` and `database/migrations/` all live in it. Branch `main`.
- **Upstream:** `origin/main` = `07bca6a`. **Two commits are local-only: `ed3b7fe` (round 2 code) and `e4c17fb` (its handoff commit).** Verify with `git log --oneline @{u}..HEAD`.
- **Working tree:** one modified file that is **NOT this work** — `src/app/cupping/page.tsx`, owned by a concurrent CVA Panel session. Leave it alone and never `git add -A`.
- **Other worktree:** `/Users/danielwolthers/Documents/GitHub/WAQC-main-wt` on branch `qc-detail-fixes` — another session's.
- **Stashes:** none. Never use bare `git stash` here; the stack is shared with that other worktree.
- This work's own branch and worktree are gone (merged fast-forward, removed). Nothing is shelved on disk.

## What's done

Three phases, all on `main`.

**Phase 1 — the rebuild** (22 commits, `e7135bf..4746d26`, LIVE prod). Newest first:

| SHA | What |
|---|---|
| `4746d26` | `fix(cva): final review` — tray/stick offset from one flag, loop settles at the clamp, rubber band reachable, a11y + cleanups |
| `c52cbdb` | `docs(spec): rule 2` — the 200 ms family opacity cross-fade is the one transition inside the svg *(superseded by round 2: there are now none)* |
| `2a354c1` | `chore(cva): perf harness` — `/embed/wheel-harness`, `scripts/perf/`, `PROGRESS.md` before/after |
| `1b3e3a5` | `fix(cva): describe tray starts collapsed on every reopen` |
| `81023cc` | `feat(cva): describe tray` — plain background, collapsible on phones, thumb territory, shade logic removed |
| `4a2cf9e` | `fix(cva): FlavorWheel` — clear will-change on hide; labels-only pass at fly start |
| `dc5daa5` | `fix(cva): FlavorWheel` — touch taps settle the loop, overlay bail-out, dt sentinel, full reset on hide |
| `8f44c9b` | `test(cva): hub tap targets the hub's on-screen position after a fly` |
| `7a47160` | `feat(cva): FlavorWheel root` — one listener, one rAF loop, one transform; camera-fly drill; keyboard; thumbstick |
| `8725cc5` | `feat(cva): wheel CSS block` and the `?debug=1` frame HUD |
| `1168209` `5e1c707` | `Thumbstick` — deadzone, squared response, tossable side, idle fade; wake on knob touch, `role=group` |
| `266485b` | `feat(cva): WheelScene` — static SVG rendered once, classes only |
| `0613587` `e1f1cf3` `8f9b0d4` | `gestures` — timer-free touch state machine; survivor reseed on a 2→1 finger transition (up *and* cancel) |
| `ca3cc47` `06bc765` | `labels` — geometry once, canvas measurement once, arc-length visibility; ring-2.5 base fix |
| `462ecf1` | `camera` — spring, anchored zoom, clamps, fly-to, edge pan |
| `51388f3` | `hit-test` — polar maths over a per-ring sorted angle index |
| `f4149de` | `palette` — precomputed muted fills, contrast-checked label colours *(the muted half was deleted in round 2)* |
| `ac5e346` | `docs(plan): pre-flight fixes` |

**Phase 2 — feedback round 1** (`a134988`, LIVE prod; pushed with docs `0a23fea`/`07bca6a`). Daniel, verbatim: *"It doesn't auto zoom in with the mouse when we mouse over, font doesn't need to reduce size when mousing/zooming in. When we go to the lower part, it must all move up so we have a clear view, moving the container of the description up, otherwise we can't see it."*

1. **Hover-dwell fly restored (desktop mouse).** The 09-02 draft had deliberately dropped the v8 dwell for click-only drilling. New pure planner `dwell.ts`: rest → family 210 ms, family → another family 240 ms, hub → zoom out 220 ms (the v8 bands), inert inside the framed family so clicks there still pick. A hovered leaf flies to its FAMILY, not to itself. `FlavorWheel` keeps ONE `setTimeout`, re-armed only when the plan's key (the family) changes — never per move, never in the rAF loop. Cancelled by a press, by leaving the wheel, or by parking on an overlay button. Touch never dwells.
2. **Labels grow with the zoom.** `ringFontSizes` held every ring at 15 px, so at 1.5× the wedges grew and the text visibly shrank against them. `labelPx` is now natural size, floored 11 px, capped **15 px × zoom** — the cap is a rest rule. On desktop the scene-unit size is identical at 1× and 1.5×, so labels scale exactly with their wedges and nothing pops at fly start. The floor still protects phone-sized wheels. `labelFits` uses the same size, so fit decisions match what renders.
3. **The camera frames above the tray.** Interpretation chosen: "it must all move up" = the WHEEL moves up so the framed sector clears the descriptors card; the card stays put. `DescribeOverlay` measures the band the tray covers (stage bottom → tray top, `ResizeObserver` on both, so chips/toast/the phone toggle are tracked) and passes it as `insetBottom`. `flyToNode` centres the sector in the visible region and scales against its height; `clampCamera` keeps the VISIBLE bottom edge on the wheel's padded box (`VIEW/2` — using the rim would shove a rest wheel 8 units off the top) and pins to the visible centre when the box fits; `edgePanVelocity` puts the bottom band in the visible region, so mousing toward the tray pans the lower wheel up. At rest on desktop nothing moves. On a portrait phone the rest wheel now centres in the clear area above the thumb band — a small visible change from what originally shipped.

**Phase 3 — feedback round 2** (`ed3b7fe`, **committed, NOT pushed**). Daniel: *"a lot smoother now, but no need to hide the other sides, let them visible."* Framing a family dimmed the other eight to a muted grey at 0.42 opacity and switched their labels off, throwing away the colour and the note names he wants to keep reading.

- **Removed outright, not softened.** `WheelScene` no longer emits `is-muted` or `--wheel-muted`; `palette.ts` lost `mutedColor`, `SURFACE` and `PaletteEntry.muted`; `globals.css` lost the two dimming rules, the `.is-muted .is-picked` override that existed only to survive them, and the `.wheel-fam` opacity transition they needed. `visibleLabelKeys` lost its `focusFamily` argument — visibility is geometry alone, so zooming only ever ADDS labels. **To restore any dimming, `git revert ed3b7fe`** — it brings the whole mechanism back coherently. Do not rebuild it by hand.
- **Two consequences.** Rule 2 is now literally true: there is NO transition anywhere inside the svg. And `WheelScene` no longer takes `focusFamily` at all — the svg's `data-focus` had no reader, since every test and handler uses the ROOT div's — so a drill reconciles **none** of the scene's ~600 elements, where it previously re-rendered all of them to paint eight families grey.
- **What now identifies the framed family:** the camera being on it, the `← Family` breadcrumb, and `cursor: pointer` on its leaves only. There is no colour cue. `activate()` still picks inside the framed family and re-aims outside it, so a fast click on a neighbour's leaf flies instead of picking. Hover-dwell re-aims within 240 ms, which keeps the window small. **Watch this in QA** — it is the one behaviour round 2 could plausibly have made worse.

### Verification actually run

| Check | Command | Result |
|---|---|---|
| Tests | `npx vitest run` | **132 files / 1556 tests passing**, 0 failures |
| Types | `npx tsc --noEmit` | 0 errors (0 lines of output) |
| Lint | `npx eslint src/components/cupping/cva/wheel/` | clean |

Test-count history: 125 / 1482 before the rebuild → 131 / 1532 after it → 132 / 1554 after round 1 → 132 / 1556 after round 2.

Browser checks, headless Chrome at 1800×1400 against `/embed/wheel-harness` (scripts were scratchpad-only, not committed):

- Round 1: a 4-family sweep at ~100 ms each fires nothing; resting on Green/Vegetative flips `data-focus` 262 ms after the move and settles at 1.5× with family labels at 22.5 px (15 px at rest); the family's lowest wedge lands at y=1142 against a measured tray top of 1179, where at rest it sits at 1375 under the tray (`data-inset` = 221); hovering a leaf inside the framed family changes nothing; resting on the hub zooms out 271 ms after the move.
- Round 2: with Green/Vegetative framed, all nine families render their true fills at opacity 1, zero elements carry `is-muted`, and all 110 labels are displayed across all nine families. A sweep of all 577 elements inside the svg finds no non-zero `transition-duration`, no filter and no CSS transform.

**Not re-taken:** the perf numbers. Neither feedback round touches the per-frame path — the dwell is a timer, `regionAtScene` replaced a `nodeAtScene` call that already invoked it, the inset is three arithmetic terms in camera maths, and round 2 only removes work. Baseline from the rebuild (full table in [PROGRESS.md](../../../PROGRESS.md)):

| Run | Dropped | Main-frame p95 | Layout events |
|---|---|---|---|
| Hover sweep 2560 px | 31% → 6% | 18.4 → 2.0 ms | 433 → 18 |
| Hover sweep 5K-sized | 54% → 7% | 60.9 → 1.8 ms | 451 → 17 |
| Drill hub → Fruity → Other Fruit | 9% → 7% | 9.0 → 3.0 ms | 459 → 30 |
| Mobile 390 px DPR 3, 4× CPU throttle | 11% → 15% | 18.1 → 4.9 ms | 120 → 19 |

Budget was p95 ≤ 8 ms desktop / ≤ 14 ms mobile — met with margin. The mobile dropped-frame figure is raster/compositor side, not main thread.

## Locked decisions (do NOT relitigate)

1. **Fly-camera drill, not reflow.** The old "sector expands to fill the circle" cannot be smooth on SVG — animating 130 path geometries is a layout per frame by construction. A reflow drill would mean a Canvas renderer; deferred unless Daniel rejects the fly feel.
2. **Zoom caps 1.5× desktop, 3× mobile** (Daniel, 2026-09-02). Not the spec draft's 6×.
3. **No filters anywhere inside `.wheel-root`.** The single biggest perf win; do not reintroduce a blur "just for the tray".
4. **ZERO transitions inside the `<svg>`** since round 2. The 200 ms `.wheel-fam` opacity cross-fade was the last one and went with the dimming. Static `rotate()` on radial labels is geometry, not animation — do not "fix" it.
5. **Label colours are `#ffffff` / `#000000`.** The softer `#101010` fails WCAG 4.5:1 on Black Tea (recomputed by hand).
6. **One "Picks n/5" counter**, on the wheel with `aria-live`; the tray's duplicate badge was deliberately dropped.
7. **Hover = white 1.1 px stroke; keyboard focus = the wedge's own colour.** The spec's original wording would have made them identical.
8. **Thumbstick is optional and tossable** — default bottom-right, drag the well to the other side, persisted in `localStorage` (`waqc.wheel.stickSide`, `waqc.wheel.stick`).
9. **No schema change, no new rendering dependency** (no d3/framer/pixi). The spring is ~15 hand-rolled lines.
10. **`WheelPick` shape and the autosave path are untouched** — picks still land in `cupping_scores.scores` via `useCvaSession`, and the certificate wheel still shares `NODES`/`arcPathD`.
11. **Hover-dwell fly on desktop is BACK** (Daniel, round 1) — do not remove it again because "the UI spec says click". The 210/240/220 ms bands are the v8 ones; a shorter band feels laggier, not snappier, because it fires constantly. One timer keyed by family, never per-move state.
12. **Labels grow with the zoom** — the 15 px cap is a rest rule (`labelPx`). Do not reintroduce the constant-15-px counter-scale.
13. **The wheel moves, the tray stays** — the tray's band is a measured `insetBottom` on the camera's `Viewport`, and the clamp limit is the padded box (`VIEW/2`), not the rim. The other reading of Daniel's sentence (flip the tray to the top when a bottom family is framed) was not built; raise it only if he rejects the lift.
14. **Nothing dims, ever** (Daniel, round 2) — framing a family leaves all nine in full colour with their labels on. Do not reintroduce muting, a fade, or a "subtle" 0.9 opacity as a focus affordance. `WheelScene` must stay ignorant of the framed family so drilling costs no reconcile.

## Codebase anchors (verified at the end of this session)

All wheel files are under [src/components/cupping/cva/wheel/](../../../src/components/cupping/cva/wheel/).

- [FlavorWheel.tsx:3-36](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L3-L36) — the 8 architecture rules plus the dwell and inset notes, as a header comment. **Read this before editing anything in the folder.**
- The rAF loop and its settle path: [FlavorWheel.tsx:184](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L184) `tick` (the only loop — integrates the spring, applies edge-pan/stick velocity, decides `inputActive`, settles), [:158](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L158) `applyLabels`, [:171](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L171) `onSettle`. Labels may be recomputed at fly start; `data-zoomed` and the knob colour only on a real settle.
- Hover dwell: [dwell.ts:17](../../../src/components/cupping/cva/wheel/dwell.ts#L17) `planDwell` (pure), [FlavorWheel.tsx:265](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L265) `scheduleDwell` (the one timer) and [:259](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L259) `clearDwell`, armed from `onPointerMove` at [:481](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L481).
- Input rules: [FlavorWheel.tsx:280](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L280) `activate` (pick if the node's family is framed, else fly), [:287](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L287) `tapAt`, [:301](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L301) `handleAction` (the 8 gesture actions), [:518](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L518) `onKeyDown`.
- Camera: [camera.ts:10](../../../src/components/cupping/cva/wheel/camera.ts#L10) `Viewport.insetBottom`, [:14](../../../src/components/cupping/cva/wheel/camera.ts#L14) the zoom caps, [:74](../../../src/components/cupping/cva/wheel/camera.ts#L74) `clampCamera` (box limit, visible-centre pin), [:89](../../../src/components/cupping/cva/wheel/camera.ts#L89) `springStep`, [:107](../../../src/components/cupping/cva/wheel/camera.ts#L107) `flyToNode` (the lift), [:132](../../../src/components/cupping/cva/wheel/camera.ts#L132) `edgePanVelocity` (visible band).
- The tray band: [DescribeOverlay.tsx:61](../../../src/components/cupping/cva/wheel/DescribeOverlay.tsx#L61) measures it; [FlavorWheel.tsx:375](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L375) re-clamps when it changes.
- Labels and colour: [labels.ts:86](../../../src/components/cupping/cva/wheel/labels.ts#L86) `labelPx` (the floor/cap rule both `ringFontSizes` at [:90](../../../src/components/cupping/cva/wheel/labels.ts#L90) and `labelFits` use), [:111](../../../src/components/cupping/cva/wheel/labels.ts#L111) `visibleLabelKeys` (geometry only, no family filter); [palette.ts:49](../../../src/components/cupping/cva/wheel/palette.ts#L49) `PALETTE` (fill + label, no muted).
- [WheelScene.tsx:80](../../../src/components/cupping/cva/wheel/WheelScene.tsx#L80) — the memo'd static SVG. Props are `pickedKeys`, `focusKey`, `onActivate`, `svgRef` only; it takes **no** `focusFamily`.
- [globals.css:186](../../../src/app/globals.css#L186) — the `.wheel-*` block starts here (the old `.cva-wheel-*` block was deleted).
- [src/lib/cva/flavor-wheel-data.ts](../../../src/lib/cva/flavor-wheel-data.ts) — the taxonomy and geometry, **unchanged and shared with the PDF certificate wheel**. Touching it changes both surfaces.
- Perf harness: [scripts/perf/README.md](../../../scripts/perf/README.md), route [src/app/embed/wheel-harness/page.tsx](../../../src/app/embed/wheel-harness/page.tsx).

## Gotchas

**This repo specifically** (the shared `wolthers-repo-facts.md` reference describes a *different* repo — do not trust its numbers here):

- **`npm test` starts vitest in WATCH mode and will hang.** The one-shot is `npx vitest run` (or `npm run test:run`). There is no `npm run verify`, no `npm run typecheck`, no `lint:ratchet` in this repo — use `npx tsc --noEmit` and `npx eslint <path>`.
- **`npx tsc --noEmit` baseline is 0 errors.** Any error is yours. (The `gather-state.sh` script prints a "baseline: 2 pre-existing errors" line that belongs to another repo.)
- **WAQC migrations live in `database/migrations/` (213 files), not `supabase/migrations/` (13 legacy files).** `gather-state.sh` reads the wrong one, so its "newest migration" output is misleading here. Claim a number against `ls database/migrations | tail -1`.
- **Daniel applies every migration himself and prefers pasted SQL.** Shipping a migration file does not apply it.
- **The repo is co-edited right now.** Another session owns `src/app/cupping/page.tsx` and the `qc-detail-fixes` worktree. Stage targeted paths, never `git add -A`, and never bare `git stash`.
- **Pushing `main` auto-deploys to Vercel production.** Round 2 is deliberately unpushed.
- **Files stay under ~2000 lines.** `FlavorWheel.tsx` is 600 — fine, but it is the file that grows.

**The wheel and its tests:**

- **Re-take the perf numbers before touching the renderer.** `npm run dev`, then `node scripts/perf/trace-wheel.mjs --scenario hover --out /tmp/h.json` and `node scripts/perf/analyze-trace.mjs /tmp/h.json`. Puppeteer resolves from the chrome-devtools skill's `node_modules` via `PUPPETEER_PKG`; it is deliberately **not** in `package.json`.
- **The dev server needs `.env.local`** or every route 500s in `AuthProvider`. A fresh worktree has none.
- **`/embed/*` is public in middleware.** The harness route is guarded by `notFound()` when `NODE_ENV === 'production'` — keep that guard.
- **Driving the harness with Puppeteer: wait for hydration, not for the DOM.** In dev the SSR html is up seconds before the client bundle hydrates, and a cold compile of that route took 78 s. Wait for `--wheel-size` on `.wheel-root` *and* `data-inset !== '0'` before moving the mouse, or every event lands on a static page.
- **jsdom traps:** size mocks must be installed on `HTMLElement.prototype` *before* render (the root measures itself in a mount effect); `performance.now()` does not advance under default fake timers, so a spring never converges — test settle behaviour via the thumbstick under reduced-motion instead; `pev()` builds pointer events as `MouseEvent`s because jsdom's PointerEvent support is patchy; React synthesises `onPointerLeave` from native `pointerout`, so tests dispatch `pointerout` (a dispatched `pointerleave` never reaches React).
- **`clampCamera` pins when `hi <= lo`** (the wheel box fits the visible region), and that pin ignores the rubber-band slack on purpose. With an inset on a portrait phone the pin is the visible centre, not the root centre — a rest wheel there sits higher than it did before `a134988`.
- **Known dev-console warning, pre-existing and harmless.** Next's dev overlay shows "1 Issue" on the harness: a React hydration-attribute mismatch on wedge `<path d>` strings and `.wheel-dot` `cy` values differing in the LAST floating-point digit between Node and Chrome (`363.2615917054677` vs `363.26159170546777`). It is `Math.cos/sin` ulp drift in the shared geometry, React keeps the server attributes, and it predates both feedback rounds (the scene has been SSR'd this way since `266485b`). The clean fix is rounding those coordinates to ~3 decimals where they are formatted — but that file is shared with the PDF certificate wheel, so do it as its own change with the certificate tests in view, never as a drive-by.

## Shelved / explicitly NOT doing

- **The reflow drill animation** (sector expands to fill the circle) — would require a Canvas renderer; deferred by decision 1.
- **Camera rotation** to point a sector east — in the UI spec, dropped as YAGNI.
- **The 60 px rubber band is representable but never painted** for pan/pinch/wheel: the loop re-clamps to zero slack before the frame is applied. Parked deliberately; a visible overshoot needs the loop to hold slack while a pointer gesture is down.
- **Camera does not follow keyboard focus** — arrowing while zoomed can put the focus ring off-screen. Deferred minor.
- **The muted/dimmed family treatment** — deleted in round 2 by decision 14. `git revert ed3b7fe` if it is ever wanted back.

## Next / suggested next-up

1. **Push `main`** when Daniel says so — `ed3b7fe` and `e4c17fb`. Vercel deploys it.
2. **Physical parity QA**, ~20 minutes on real hardware, desktop first. Run the smoke test below. Specifically unverifiable in code: whether the fly feel is right at 1.5× on desktop; hover vs selected vs keyboard-focus distinctness now that nothing dims; whether a fast click on a neighbouring family's leaf feels wrong (it re-aims instead of picking — see Phase 3); the thumbstick toss and long-press on iOS Safari and Chrome Android; the opaque `#2E2E29` wheel ground covering the overlay's accent glow (intended, but a visible change in light mode).
3. **Two known small collisions to look at while QAing:** the "Hide stick / Show stick" button sits at `bottom: 150px` and can overlap the tray card on a narrow phone; the tray's offset is applied in a mount effect, so there is a one-frame jump at first paint on mobile.
4. **Sub-project 2 — the wheel on mainstream qualities.** Locked decisions are in the spec's appendix (a `flavor_wheel` toggle in `quality_templates.parameters`, a "Describe this cup" button on the commodity cupping page, a **new `cupping_scores.describe` jsonb column** — one migration, pasted for Daniel — and the wheel at ~120 pt on the commodity certificate). Start with `superpowers:brainstorming`, then its own spec. Do not start from the appendix alone.
5. Optional cleanups if you are already in the files: export `useMedia` from `FlavorWheel` (it is duplicated in `DescribeOverlay`), `aria-activedescendant` camera-follow, a component-level test for `swipe-down → onSwipeClose`.

## Things the user said that should shape future work

- "must be smooth on both computers and mobile phones" — the mobile path is not a second-class citizen.
- "on mobile, we want a thumb controller as option, to scroll around with the thumb, like a game — this joystick should be on the right side, but can be 'dragged' to the left side for left handers."
- "we dont need that much zoom in either" → the 1.5× / 3× caps, chosen over the spec draft's 6×.
- "no need to hide the other sides, let them visible" → decision 14. He wants to read the whole wheel while working one family.
- The original brief's instruction, which held up: *"The frame rate is a symptom of specific pathologies, not of the chosen technology. Do not start by rewriting in WebGL."*
- Daniel applies all migrations himself; SQL is pasted, never run by Claude.
- He controls when `main` is pushed. Commit freely; ask before pushing.

## Manual smoke test

1. `npm run dev`, open a specialty (CVA) lot's cupping journey, press **Describe this cup**.
2. **Hover dwell (desktop).** Rest the mouse on Fruity → the camera flies within about a quarter second. Sweep across several families without pausing → nothing fires. While Fruity is framed, rest on Roasted → it switches. Rest on the hub → it zooms out.
3. **Nothing dims.** While one family is framed, every other family stays in its own colour with its labels on. The framed one is identified by the camera, the `← Family` breadcrumb, and the pointer cursor on its leaves.
4. **Labels scale.** Zoom with the scroll wheel → labels grow with their wedges (they used to hold at 15 px while the wedges grew).
5. **The tray lift.** Rest on Green/Vegetative or Other → the sector lands above the descriptors card, not under it. Mouse toward the card while zoomed → the lower wheel pans up.
6. **Picking.** Click a leaf of the framed family → chip appears, counter increments. Pick a 6th → the oldest is replaced with a toast and the counter pulses. Escape once → zooms out; Escape again → closes the overlay.
7. **Perf.** Add `?debug=1` → HUD bottom-left. Sweep the wheel: p95 stays under ~8 ms, and the HUD stops updating (loop idle) when you stop moving.
8. **Phone/tablet.** Tray starts collapsed; thumbstick bottom-right pans; drag the *well* to the left half and release → it springs left and survives a reload; long-press a wedge → progress ring, then fly; swipe down from the top → closes.
