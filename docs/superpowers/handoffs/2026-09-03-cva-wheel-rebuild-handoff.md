# Handoff — CVA flavour wheel rebuild (2026-09-03)

**Resume point:** Daniel's first feedback round on the live wheel is implemented and committed on `main` as `a134988` (+ this doc's commit) but **NOT pushed** — pushing `main` deploys to production, and he controls when. Next, in order: (1) `git push` when he says so; (2) **physical parity QA** on a real desktop first (the three revisions below are desktop-felt: hover-dwell fly, labels growing with the zoom, the wheel lifting clear of the tray), then iPad/phone — checklist is Task 12 Step 3 of [../plans/2026-09-02-cva-wheel-rebuild.md](../plans/2026-09-02-cva-wheel-rebuild.md); (3) **sub-project 2** — the wheel on mainstream (commodity) qualities — locked decisions in the spec's appendix, **no spec yet**, starts with a brainstorm.

## Follow-up round 1 — 2026-09-03 (`a134988`)

Daniel's feedback after using the rebuilt wheel on qc.wolthers.com, verbatim: *"It doesn't auto zoom in with the mouse when we mouse over, font doesn't need to reduce size when mousing/zooming in. When we go to the lower part, it must all move up so we have a clear view, moving the container of the description up, otherwise we can't see it."* Three changes, each with dated notes in the spec:

1. **Hover-dwell fly is back (desktop mouse).** The 09-02 draft had deliberately dropped the v8 dwell for click-only drilling; Daniel wants the mouse-over zoom. New pure planner [dwell.ts](../../../src/components/cupping/cva/wheel/dwell.ts): rest → family after 210 ms, family → another family 240 ms, hub → zoom out 220 ms (the v8 bands), inert inside the focused family (clicks pick there). A hovered leaf flies to its FAMILY, not to itself. `FlavorWheel` keeps ONE `setTimeout`, re-armed only when the plan's key (the family) changes — never per move, never in the rAF loop, so rule 1 holds. Cancelled by a press, leaving the wheel, or parking on an overlay button. Touch never dwells. Click behaviour unchanged.
2. **Labels scale with the zoom.** `ringFontSizes` held every ring at 15 px, so at 1.5× the wedges grew and the text visibly shrank against them. `labelPx` now = natural size, floored 11 px, capped 15 px × zoom — the cap is a rest rule. On desktop the scene-unit size is now identical at 1× and 1.5×, so labels grow exactly with their wedges and there is no pop at fly start. The floor still protects phone-sized wheels (a floored label holds 11 px until its natural size catches up). `labelFits` uses the same size.
3. **The camera frames above the tray.** Interpretation chosen: "it must all move up" = the WHEEL moves up so the focused sector is clear of the descriptors card; the card stays where it is. `DescribeOverlay` measures the band the tray covers (stage bottom → tray top, `ResizeObserver` on both, so chips/toast/the phone toggle are tracked) and passes it as `insetBottom`. `flyToNode` centres the sector in the visible region and scales against its height; `clampCamera` keeps the VISIBLE bottom edge on the wheel's padded box (`VIEW/2` — the rim would have shoved a rest wheel off the top by 8 units) and pins to the visible centre when the box fits; `edgePanVelocity` puts the bottom band in the visible region, so mousing toward the tray pans the lower wheel up. At rest on desktop nothing moves. On a portrait phone the rest wheel now centres in the clear area above the thumb band (a small visible change from what shipped). A band change re-clamps: rest re-derives from the centre, a zoomed camera moves only if the new bound demands it (no drift as chips are added).

**Verification actually run:** `npx vitest run` → **132 files / 1554 tests** (was 131 / 1532: +`dwell.test.ts`, +21 tests across camera/labels/FlavorWheel/DescribeOverlay); `npx tsc --noEmit` → 0 errors; `npx eslint src/components/cupping/cva/wheel/` → clean. **Not re-taken:** the perf numbers — none of the three touches the per-frame path (the dwell is a timer, `regionAtScene` replaces `nodeAtScene` which called it anyway, the inset is three arithmetic terms in camera maths). **Also run, in headless Chrome against the public `/embed/wheel-harness` route (1800×1400, dev server, Puppeteer from the chrome-devtools skill):** a 4-family sweep at ~100 ms per family fires nothing; resting on Green/Vegetative flips `data-focus` 262 ms after the move, settles at 1.5× with family labels at 22.5 px (15 px at rest) and the family's lowest wedge at y=1142 against a measured tray top of 1179 (at rest it sits at 1375, under the tray; `data-inset` = 221); hovering a leaf inside the focused family changes nothing; resting on the hub zooms out 271 ms after the move. The script is not in the repo (scratchpad only) — the physical QA on real hardware is still open, for feel, not correctness. **Gotcha for anyone repeating this:** in dev the SSR html is up seconds before the client bundle hydrates; wait for `--wheel-size` on `.wheel-root` and `data-inset != 0` before driving the mouse, or every move lands on a static page.

## The work (one paragraph)

The specialty (SCA CVA) flavour wheel — the fullscreen "Describe the cup" overlay a cupper opens from the CVA journey — was unusable: roughly 5 fps on a large window. Phase 0 profiling (four Puppeteer traces of the unmodified wheel) showed the cost was two specific pathologies, not SVG itself: CSS `transform` transitions on SVG `<g>` elements make Blink re-lay-out all 679 nodes every animated frame, and 30+ blur filters re-raster at device pixel ratio on each of those frames. The rebuild renders the SVG scene once and never transforms it, moves a single CSS transform on an HTML camera div from one `requestAnimationFrame` spring loop, hit-tests with polar maths through one root listener, replaces every blur with precomputed muted fills, and shows labels only when their arc is at least 14 screen px. Drilling flies the camera over a wheel that stays visible — by click, and (since the 09-03 follow-up) again by resting the mouse on a family. Mobile got a real interaction layer: a tossable thumbstick, long-press-to-fly, pinch, two-finger pan, double-tap out, swipe-down to close.

## Repo state right now

- **Repo (`WAQC` — code, docs and migrations all live here):** branch `main`; working tree has **one modified file that is NOT this work** — `src/app/cupping/page.tsx`, belonging to a concurrent CVA Panel session. Leave it alone.
- **Upstream:** `origin/main` = `9fbd177` (the previous handoff commit). **Three commits are local-only — NOT pushed:** `0d841e7` (the OTHER session's `fix(db): collapse re-cuppings before merging CVA sessions` — a migration under `database/migrations/`, landed on `main` while this round was being built, not ours to judge), then `a134988` and this doc's commit. A push carries all three. Verify with `git log --oneline @{u}..HEAD`.
- **Other worktree:** `/Users/danielwolthers/Documents/GitHub/WAQC-main-wt` on branch `qc-detail-fixes` — another session's, not ours.
- **This work's worktree and branch are gone** (merged fast-forward, `git worktree remove` + `git branch -d`). Nothing is shelved.
- **Stashes:** none created by this work. Never use bare `git stash` in this repo — the stack is shared with the other worktree.

## What's done

22 commits, merged fast-forward to `main` and pushed. Newest first:

| SHA | What |
|---|---|
| `4746d26` | `fix(cva): final review` — tray/stick offset from one flag, loop settles at the clamp, rubber band reachable, a11y + cleanups |
| `c52cbdb` | `docs(spec): rule 2` — the 200 ms family opacity cross-fade is the one transition inside the svg |
| `2a354c1` | `chore(cva): perf harness` — `/embed/wheel-harness`, `scripts/perf/`, `PROGRESS.md` before/after |
| `1b3e3a5` | `fix(cva): describe tray starts collapsed on every reopen` |
| `81023cc` | `feat(cva): describe tray` — plain background, collapsible on phones, thumb territory, shade logic removed |
| `4a2cf9e` | `fix(cva): FlavorWheel` — clear will-change on hide; labels-only pass at fly start |
| `dc5daa5` | `fix(cva): FlavorWheel` — touch taps settle the loop, overlay bail-out, dt sentinel, full reset on hide |
| `8f44c9b` | `test(cva): hub tap targets the hub's on-screen position after a fly` |
| `7a47160` | `feat(cva): FlavorWheel root` — one listener, one rAF loop, one transform; camera-fly drill; keyboard; thumbstick |
| `8725cc5` | `feat(cva): wheel CSS block` (one transform, no filters) and the `?debug=1` frame HUD |
| `1168209` `5e1c707` | `Thumbstick` — deadzone, squared response, tossable side, idle fade; wake on knob touch, `role=group` |
| `266485b` | `feat(cva): WheelScene` — static SVG rendered once, classes only |
| `0613587` `e1f1cf3` `8f9b0d4` | `gestures` — timer-free touch state machine; survivor reseed on a 2→1 finger transition (up *and* cancel) |
| `ca3cc47` `06bc765` | `labels` — geometry once, canvas measurement once, arc-length visibility; ring-2.5 base fix |
| `462ecf1` | `camera` — spring, anchored zoom, clamps, fly-to, edge pan |
| `51388f3` | `hit-test` — polar maths over a per-ring sorted angle index |
| `f4149de` | `palette` — precomputed muted fills, contrast-checked label colours |
| `ac5e346` | `docs(plan): pre-flight fixes` |

**Verification actually run on the merged tree:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **131 files / 1532 tests passing** (baseline before this work: 125 / 1482). There is no `npm run typecheck` in this repo.

**Measured perf** (same scripts, before → after; full table in [PROGRESS.md](../../../PROGRESS.md)):

| Run | Dropped | Main-frame p95 | Layout events |
|---|---|---|---|
| Hover sweep 2560 px | 31% → 6% | 18.4 → 2.0 ms | 433 → 18 |
| Hover sweep 5K-sized | 54% → 7% | 60.9 → 1.8 ms | 451 → 17 |
| Drill hub → Fruity → Other Fruit | 9% → 7% | 9.0 → 3.0 ms | 459 → 30 |
| Mobile 390 px DPR 3, 4× CPU throttle | 11% → 15% | 18.1 → 4.9 ms | 120 → 19 |

Budget was p95 ≤ 8 ms desktop / ≤ 14 ms mobile — met with margin. The mobile dropped-frame number is raster/compositor side, not main-thread.

## Locked decisions (do NOT relitigate)

11. **Hover-dwell fly on desktop is BACK (Daniel, 2026-09-03)** — do not remove it again for "the UI spec says click". Bands 210/240/220 ms are the v8 ones; a shorter band feels laggier because it fires constantly. It is one timer keyed by family, never per-move state.
12. **Labels grow with the zoom** — the 15 px cap is a rest rule (`labelPx`). Do not reintroduce the constant-15-px counter-scale.
13. **The wheel moves, the tray stays** — the tray's band is a measured `insetBottom` on the camera's `Viewport`, and the clamp limit is the padded box (`VIEW/2`), not the rim. The alternative reading of Daniel's sentence (flip the tray to the top when a bottom family is focused) was not built; raise it only if he rejects the lift.

1. **Fly-camera drill, not reflow.** The old "sector expands to fill the circle" cannot be smooth on SVG — animating 130 path geometries is a layout per frame by construction. A reflow drill would mean a Canvas renderer; deferred unless Daniel rejects the fly feel.
2. **Zoom caps 1.5× desktop, 3× mobile** (Daniel, 2026-09-02). Not the spec draft's 6×.
3. **No filters anywhere inside `.wheel-root`.** Dimming is a precomputed muted fill + opacity. This is the single biggest win; do not reintroduce a blur "just for the tray".
4. **One transition inside the `<svg>`:** the 200 ms opacity cross-fade on `.wheel-fam`. Opacity is paint-only; the measured pathology was transform → layout. Static `rotate()` on radial labels is geometry, not animation — do not "fix" it.
5. **Label colours are `#ffffff` / `#000000`.** The softer `#101010` fails WCAG 4.5:1 on Black Tea (recomputed by hand).
6. **One "Picks n/5" counter**, on the wheel with `aria-live`; the tray's duplicate badge was deliberately dropped.
7. **Hover = white 1.1 px stroke; keyboard focus = the wedge's own colour.** The spec's original wording would have made them identical.
8. **Thumbstick is optional and tossable** — default bottom-right, drag the well to the other side, persisted in `localStorage` (`waqc.wheel.stickSide`, `waqc.wheel.stick`).
9. **No schema change, no new rendering dependency** (no d3/framer/pixi). The spring is ~15 hand-rolled lines.
10. **`WheelPick` shape and the autosave path are untouched** — picks still land in `cupping_scores.scores` via `useCvaSession`, and the certificate wheel still shares `NODES`/`arcPathD`.

## Codebase anchors (saves re-exploring)

All under [src/components/cupping/cva/wheel/](../../../src/components/cupping/cva/wheel/):

- [FlavorWheel.tsx:3-34](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L3-L34) — the 8 architecture rules plus the dwell and inset notes as a header comment. **Read this before editing anything in the folder.**
- [dwell.ts:17](../../../src/components/cupping/cva/wheel/dwell.ts#L17) `planDwell` (pure); [FlavorWheel.tsx:263](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L263) `scheduleDwell` (the one timer), armed from `onPointerMove` at [:479](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L479).
- [labels.ts:86](../../../src/components/cupping/cva/wheel/labels.ts#L86) `labelPx` — the floor/cap rule both `ringFontSizes` and `labelFits` use.
- [camera.ts:10](../../../src/components/cupping/cva/wheel/camera.ts#L10) `Viewport.insetBottom`; [:74](../../../src/components/cupping/cva/wheel/camera.ts#L74) `clampCamera` (box limit, visible-centre pin), [:107](../../../src/components/cupping/cva/wheel/camera.ts#L107) `flyToNode` (lift), [:132](../../../src/components/cupping/cva/wheel/camera.ts#L132) `edgePanVelocity` (visible band). [DescribeOverlay.tsx:61](../../../src/components/cupping/cva/wheel/DescribeOverlay.tsx#L61) measures the band; [FlavorWheel.tsx:373](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L373) re-clamps when it changes.
- [FlavorWheel.tsx:170](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L170) `tick` — the only rAF loop; integrates the spring, applies edge-pan/stick velocity, decides `inputActive`, settles.
- [FlavorWheel.tsx:144](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L144) `applyLabels` / [:157](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L157) `onSettle` — label visibility can run at fly start; `data-zoomed`/knob colour only on real settle.
- [FlavorWheel.tsx:244](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L244) `activate` — the pick-vs-fly rule (toggle if the node's family is focused, else fly). [:251](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L251) `tapAt`, [:265](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L265) `handleAction` (the 8 gesture actions), [:464](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L464) `onKeyDown`.
- [camera.ts:9-10](../../../src/components/cupping/cva/wheel/camera.ts#L9-L10) the zoom caps; [:61](../../../src/components/cupping/cva/wheel/camera.ts#L61) `clampCamera`, [:74](../../../src/components/cupping/cva/wheel/camera.ts#L74) `springStep`, [:90](../../../src/components/cupping/cva/wheel/camera.ts#L90) `flyToNode`, [:108](../../../src/components/cupping/cva/wheel/camera.ts#L108) `edgePanVelocity`.
- [globals.css:181](../../../src/app/globals.css#L181) — the `.wheel-*` block starts here (the old `.cva-wheel-*` block was deleted).
- [src/lib/cva/flavor-wheel-data.ts](../../../src/lib/cva/flavor-wheel-data.ts) — the taxonomy + geometry, **unchanged and shared with the PDF certificate wheel**. Touching it changes both surfaces.
- Perf: [scripts/perf/README.md](../../../scripts/perf/README.md), harness route [src/app/embed/wheel-harness/page.tsx](../../../src/app/embed/wheel-harness/page.tsx).

## Gotchas

- **Re-take the numbers before touching the renderer.** `npm run dev`, then `node scripts/perf/trace-wheel.mjs --scenario hover --out /tmp/h.json` and `node scripts/perf/analyze-trace.mjs /tmp/h.json`. Puppeteer resolves from the chrome-devtools skill's `node_modules` via `PUPPETEER_PKG`; it is deliberately **not** in `package.json`.
- **The dev server needs `.env.local`** or every route 500s in `AuthProvider`. A fresh worktree has none — copy it or export placeholder `NEXT_PUBLIC_SUPABASE_*` on the process for harness-only work.
- **`/embed/*` is public in middleware.** The harness route is guarded by `notFound()` when `NODE_ENV === 'production'` — keep that guard if you touch it.
- **The repo is co-edited right now.** Another session owns `src/app/cupping/page.tsx` and the `qc-detail-fixes` worktree. Stage targeted paths, never `git add -A` from the root, and never bare `git stash`.
- **Pushing `main` auto-deploys to Vercel production.** This work is already out.
- **jsdom traps in the wheel tests:** size mocks must be installed on `HTMLElement.prototype` *before* render (the root measures itself in a mount effect); `performance.now()` does not advance under default fake timers, so a spring will not converge — test settle behaviour via the thumbstick under reduced-motion instead; `pev()` builds pointer events as `MouseEvent`s because jsdom's PointerEvent support is patchy.
- **Files stay under ~2000 lines.** `FlavorWheel.tsx` is ~600 — fine, but it is the file that grows.
- **jsdom leave events:** React synthesises `onPointerLeave` from native `pointerout`, so the tests dispatch `pointerout` (a `MouseEvent`) to exercise the dwell cancel — a dispatched `pointerleave` never reaches React.
- **Known dev-console warning, pre-existing, NOT from this round:** Next's dev overlay shows "1 Issue" on the harness — a React hydration-attribute mismatch on wedge `<path d>` strings and `.wheel-dot` `cy` values that differ in the LAST floating-point digit between Node (SSR) and Chrome (`363.2615917054677` vs `363.26159170546777`). It is `Math.cos/sin` ulp drift in the shared geometry (`flavor-wheel-data.ts` → `WheelScene`), harmless (React keeps the server attributes; nothing moves), and it predates `a134988` (the scene has been SSR'd this way since `266485b`). The clean fix is rounding the path/dot coordinates to ~3 decimals where they are formatted — but that file is shared with the PDF certificate wheel, so do it as its own small change with the certificate tests in view, not as a drive-by.
- **`clampCamera` pins when `hi <= lo`** (the box fits the visible region) and that pin ignores the rubber-band slack on purpose. With an inset on a portrait phone the pin is the visible centre, not the root centre — a rest wheel there sits higher than it did before `a134988`.

## Shelved / explicitly NOT doing

- **The reflow drill animation** (sector expands to fill the circle) — would require Canvas; deferred by decision 1.
- **Camera rotation** to point a sector east — in the UI spec, dropped as YAGNI.
- **The 60 px rubber band is representable but never painted** for pan/pinch/wheel: the loop re-clamps to zero slack before the frame is applied. Parked deliberately; a visible overshoot would need the loop to hold slack while a pointer gesture is down.
- **Camera does not follow keyboard focus** — arrowing while zoomed can put the focus ring off-screen. Deferred minor.

## Next / suggested next-up

0. **Push `main`** when Daniel says so (`a134988` + the docs commit). Vercel deploys it.
1. **Physical parity QA** (Task 12 Step 3 checklist in the plan) — highest value, ~20 minutes on real hardware. Desktop first, for the three revisions: rest the mouse on Fruity → it flies within a quarter second; sweep across the wheel → nothing fires; while on Fruity, rest on Roasted → it switches; rest on the hub → zooms out. Zoom with the wheel → labels grow with the wedges (were held at 15 px). Rest on Green/Vegetative or Other → the sector lands above the descriptors card; mouse toward the card while zoomed → the lower wheel pans up. Specifically unverifiable in code: the opaque `#2E2E29` wheel ground now covers the overlay's accent glow (intended, but a visible change in light mode); hover vs selected vs focus distinctness; the thumbstick toss and long-press on iOS Safari and Chrome Android; whether the fly feel is right at 1.5× on desktop.
2. **Two small known collisions worth a look while QAing:** the "Hide stick / Show stick" button sits at `bottom: 150px` and can overlap the tray card on a narrow phone; the tray's offset is applied in a mount effect, so there is a one-frame jump at first paint on mobile.
3. **Sub-project 2 — the wheel on mainstream qualities.** Locked decisions are in the spec's appendix (a `flavor_wheel` toggle in `quality_templates.parameters`, a "Describe this cup" button on the commodity cupping page, a **new `cupping_scores.describe` jsonb column** — one migration, pasted for Daniel — and the wheel at ~120 pt on the commodity certificate). Start with `superpowers:brainstorming`, then its own spec; do not start from the appendix alone.
4. Optional cleanups if you are in the files anyway: export `useMedia` from `FlavorWheel` (duplicated in `DescribeOverlay`), `aria-activedescendant` camera-follow, a component-level test for `swipe-down → onSwipeClose`.

## Things the user said that should shape future work

- "must be smooth on both computers and mobile phones" — the mobile path is not a second-class citizen.
- "on mobile, we want a thumb controller as option, to scroll around with the thumb, like a game — this joystick should be on the right side, but can be 'dragged' to the left side for left handers."
- "we dont need that much zoom in either" → the 1.5× / 3× caps, chosen over the spec draft's 6×.
- The original brief's own instruction, which held up: *"The frame rate is a symptom of specific pathologies, not of the chosen technology. Do not start by rewriting in WebGL."*
- Daniel applies all migrations himself; SQL is pasted, never run by Claude.

## Manual smoke test

1. `npm run dev`, open a specialty (CVA) lot's cupping journey, press **Describe this cup**.
2. Desktop: click a family → camera flies, others fade to muted (no blur). Click a leaf → chip appears, counter increments. Pick 6 → oldest is replaced with a toast and the counter pulses. Mouse toward a viewport edge while zoomed → smooth pan. Escape once → zooms out; Escape again → closes the overlay.
3. Add `?debug=1` to the URL → HUD bottom-left; sweep the wheel and confirm p95 stays under ~8 ms and the HUD stops updating (loop idle) when you stop moving.
4. Phone/tablet: tray starts collapsed; thumbstick bottom-right pans; drag the *well* to the left half and release → it springs left and survives a reload; long-press a wedge → progress ring, then fly; swipe down from the top → closes.
