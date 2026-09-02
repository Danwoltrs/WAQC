# WAQC progress notes

## 2026-09-02 — CVA flavour wheel rebuild (architecture decision)

**Decision:** SVG scene rendered once + one CSS transform on an HTML camera div
(Option A). No filters. Camera-fly drill model; the old "sector expands" reflow was
dropped because a smooth reflow on SVG is a layout per frame by construction.
Zoom caps 1.5× desktop / 3× mobile (Daniel). Full reasoning:
`docs/superpowers/specs/2026-09-02-cva-wheel-rebuild-design.md`.

**Why not Canvas/WebGL:** Phase 0 showed the cost was two pathologies (CSS transforms
transitioning on SVG groups → full-subtree layout per frame; 30+ blur filters
re-rastering at DPR), not SVG itself. Removing them meets the budget.

| Run | Before: dropped / main p95 / Layout | After: dropped / main p95 / Layout |
|---|---|---|
| Hover sweep, 2560 px | 31% / 18.4 ms / 935 ms (433) | 6% / 2 ms / 1.1 ms (18) |
| Hover sweep, 5K-sized | 54% / 60.9 ms / 1,745 ms (451) | 7% / 1.8 ms / 1.2 ms (17) |
| Drill hub → Fruity → Other Fruit | 9% / 9.0 ms / 358 ms (459) | 7% / 3 ms / 53 ms (30) |
| Mobile 390 px @3×, 4× CPU | 11% / 18.1 ms / 458 ms (120) | 15% / 4.9 ms / 79.7 ms (19) |

Re-take with `scripts/perf/README.md`. Do not relitigate the renderer choice without
re-running these.

**Notes on the after numbers:**
- All four runs meet the `main_frame.p95_ms` budget (≤ 8 ms desktop, ≤ 14 ms mobile)
  with large margin — worst case is drill at 3 ms (desktop) and mobile at 4.9 ms.
  `totals.Layout.events` collapsed from the hundreds (up to 459) to 17–30, and
  `total_ms` for Layout is now single-digit-to-tens of ms instead of hundreds to
  thousands, across all scenarios.
- The after-hover run no longer triggers a zoom — hovering across the family ring
  is hover-only by design in the rebuilt wheel (drilling now requires a click), so
  the hover row compares a cheaper interaction than the Phase-0 "before" row, which
  dwell-zoomed on hover. This is expected and by design, not a measurement error.
- `STATE_DROPPED` fell sharply for hover (31%→6%, 54%→7%) and drill (9%→7%), but
  rose slightly for mobile (11%→15%) even though its main-thread cost fell far
  more (`main_frame.p95_ms` 18.1→4.9 ms, Layout 458 ms→79.7 ms). The main thread is
  not the bottleneck on the "after" mobile run — dropped frames there coincide with
  compositor/raster-thread pacing under the 4× CPU throttle rather than main-thread
  layout cost. Flagged for awareness; not treated as a regression to fix by tuning
  CSS, per this task's scope (perf harness + measurement only).
