# Wheel performance check

Repeatable frame-time measurement of the flavour wheel (spec 2026-09-02, rule 8).

    npm run dev                                   # in one terminal
    node scripts/perf/trace-wheel.mjs --scenario hover  --out /tmp/hover.json
    node scripts/perf/trace-wheel.mjs --scenario drill  --out /tmp/drill.json
    node scripts/perf/trace-wheel.mjs --scenario mobile --out /tmp/mobile.json      # 390×844 @3x, 4× CPU throttle
    node scripts/perf/trace-wheel.mjs --scenario hover --vw 2560 --vh 2900 --out /tmp/hover-5k.json
    node scripts/perf/trace-wheel.mjs --scenario circle --vw 1366 --vh 650 --dpr 1 --throttle 4 --nogpu --out /tmp/circle.json   # a weak lab laptop
    node scripts/perf/trace-wheel.mjs --scenario stick --out /tmp/stick.json                                             # phone thumbstick, 4× CPU
    node scripts/perf/analyze-trace.mjs /tmp/hover.json

Targets: `main_frame.p95_ms` ≤ 8 (desktop) / ≤ 14 (mobile), `STATE_DROPPED` ≈ 0,
`totals.Layout.events` ≈ 0 during motion. Puppeteer is resolved from the
chrome-devtools skill's node_modules (see the createRequire line); the app has no
Puppeteer dependency. Override the path with the `PUPPETEER_PKG` env var
(pointing at a `puppeteer` package.json) if that skill isn't installed.

Measuring a production build (React dev mode inflates script time): the harness 404s in
production unless `WHEEL_HARNESS=1` is set for BOTH `next build` and `next start`, e.g.
`WHEEL_HARNESS=1 npx next build && WHEEL_HARNESS=1 npx next start -p 3400`, then pass
`--url http://localhost:3400/embed/wheel-harness`. Never set it on Vercel.

2026-10-06 lessons (circle/stick work): any layout change made once a camera fly is
already moving makes Blink re-lay out all ~110 SVG labels on every remaining frame; the
per-moving-frame Layerize cost (~4 ms at 4×) is the labels' rotate() transform nodes
(textPath is worse); every visible hover update counts as one PipelineReporter
"dropped" frame (shown one vsync late) in any build — compare like with like.
