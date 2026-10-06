# CVA flavour wheel — lag + lower-wheel occlusion (2026-10-06)

Daniel: "it is way too slow, and when we mouse over the lower part of the wheel, we cant see
the buttons. Mouse circling around makes it very laggy, and low FPS — our staff asked me to
even take it off, but I want it there." Worked autonomously (Daniel home sick).

## State
- Commits `62914642` (desktop fix), `f8b9e955` (perf harness), `2beaa2e1` (thumbstick) on the
  local branch, **not pushed**. Full suite 238 files / 2622 tests green, tsc + eslint clean.
- To ship: `git push origin HEAD:main` (Vercel deploys Production).
- **Daniel must look at the desktop side panel first** — it replaces the bottom-centre
  descriptors card he approved in June 2026.

## What was wrong (measured on production builds; `scripts/perf/README.md`)
1. The hover-dwell clock was keyed by family, not rest: plain circling fired 6–7 flies in 11 s,
   each moving the wheel under the moving hand into the next family.
2. A mouse move on a zoomed wheel woke the frame loop every time.
3. Hover changed `stroke-width` (SVG layout) and the cursor was written on the root
   (inherited → whole-subtree restyle); any scene repaint per wedge crossing drops a frame.
4. The desktop tray covered 34/85 leaves at rest (Green/Vegetative and Other entirely) and
   took the pointer; the centre zoom-out pill covered the bottom leaves after a fly.
5. A layout change once a fly is moving makes Blink re-lay out all ~110 labels every
   remaining frame (found while building the panel; guarded with layout effects + flushSync).
6. The phone wheel only reached its 1.7× rest by accident.

## Measured gains
- Circling (1366×650, software raster, 4× CPU): flies 6 → 0 while moving; camera-moving
  frames 323 → 52; hover-frame p95 35.6 → 3.8 ms; raster 1038 → 261 ms.
- Phone stick (4× CPU): Layout 251 → 37 ms, Paint 290 → 21 ms, partial frames 303 → 47,
  worst frame 136 → ~35 ms. Tap-to-fly: parity.

## Not done / next
- Per moving frame Layerize (~4 ms at 4×, ~1 ms real) comes from the labels' `rotate()`
  transform nodes. `<textPath>` was tried and is WORSE (11 ms). The remaining route is labels
  drawn into a canvas — only if a slow lab laptop still stutters during flies.
- Fly start re-lays out the labels once (~20–30 ms at 4×). A two-label-set swap saves only
  ~2 ms real; rejected.
- Phone chrome ("Boxes", "Hide stick") still sits over the top-right wedges — untouched.
- Every visible hover/focus update counts as one PipelineReporter "dropped" frame (one vsync
  late) in any build; compare like with like.
