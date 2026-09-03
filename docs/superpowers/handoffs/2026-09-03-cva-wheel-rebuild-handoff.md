# Handoff — CVA flavour wheel rebuild (2026-09-03)

**Resume point:** The rebuild is MERGED AND PUSHED to `main` (`4746d26`) and deploying. Two things remain, in order: (1) **physical parity QA** on a real iPad/phone and a real desktop — the checklist is Task 12 Step 3 of [../plans/2026-09-02-cva-wheel-rebuild.md](../plans/2026-09-02-cva-wheel-rebuild.md); (2) **sub-project 2** — the flavour wheel as an option on mainstream (commodity) qualities — which has locked decisions in the spec's appendix but **no spec of its own yet**, so it starts with a brainstorm, not code.

## The work (one paragraph)

The specialty (SCA CVA) flavour wheel — the fullscreen "Describe the cup" overlay a cupper opens from the CVA journey — was unusable: roughly 5 fps on a large window. Phase 0 profiling (four Puppeteer traces of the unmodified wheel) showed the cost was two specific pathologies, not SVG itself: CSS `transform` transitions on SVG `<g>` elements make Blink re-lay-out all 679 nodes every animated frame, and 30+ blur filters re-raster at device pixel ratio on each of those frames. The rebuild renders the SVG scene once and never transforms it, moves a single CSS transform on an HTML camera div from one `requestAnimationFrame` spring loop, hit-tests with polar maths through one root listener, replaces every blur with precomputed muted fills, and shows labels only when their arc is at least 14 screen px. Drilling changed from a dwell-hover zoom to a click that flies the camera over a wheel that stays visible. Mobile got a real interaction layer: a tossable thumbstick, long-press-to-fly, pinch, two-finger pan, double-tap out, swipe-down to close.

## Repo state right now

- **Repo (`WAQC` — code, docs and migrations all live here):** branch `main`; working tree has **one modified file that is NOT this work** — `src/app/cupping/page.tsx`, belonging to a concurrent CVA Panel session. Leave it alone.
- **Upstream:** `origin/main` = `4746d26` — **everything below is pushed**. Verify with `git log --oneline @{u}..HEAD` (should be empty).
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

- [FlavorWheel.tsx:3-27](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx#L3-L27) — the 8 architecture rules as a header comment. **Read this before editing anything in the folder.**
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
- **Files stay under ~2000 lines.** `FlavorWheel.tsx` is 546 — fine, but it is the file that grows.

## Shelved / explicitly NOT doing

- **The reflow drill animation** (sector expands to fill the circle) — would require Canvas; deferred by decision 1.
- **Camera rotation** to point a sector east — in the UI spec, dropped as YAGNI.
- **The 60 px rubber band is representable but never painted** for pan/pinch/wheel: the loop re-clamps to zero slack before the frame is applied. Parked deliberately; a visible overshoot would need the loop to hold slack while a pointer gesture is down.
- **Camera does not follow keyboard focus** — arrowing while zoomed can put the focus ring off-screen. Deferred minor.

## Next / suggested next-up

1. **Physical parity QA** (Task 12 Step 3 checklist in the plan) — highest value, ~20 minutes on real hardware. Specifically unverifiable in code: the opaque `#2E2E29` wheel ground now covers the overlay's accent glow (intended, but a visible change in light mode); hover vs selected vs focus distinctness; the thumbstick toss and long-press on iOS Safari and Chrome Android; whether the fly feel is right at 1.5× on desktop.
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
