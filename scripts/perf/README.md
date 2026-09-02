# Wheel performance check

Repeatable frame-time measurement of the flavour wheel (spec 2026-09-02, rule 8).

    npm run dev                                   # in one terminal
    node scripts/perf/trace-wheel.mjs --scenario hover  --out /tmp/hover.json
    node scripts/perf/trace-wheel.mjs --scenario drill  --out /tmp/drill.json
    node scripts/perf/trace-wheel.mjs --scenario mobile --out /tmp/mobile.json      # 390×844 @3x, 4× CPU throttle
    node scripts/perf/trace-wheel.mjs --scenario hover --vw 2560 --vh 2900 --out /tmp/hover-5k.json
    node scripts/perf/analyze-trace.mjs /tmp/hover.json

Targets: `main_frame.p95_ms` ≤ 8 (desktop) / ≤ 14 (mobile), `STATE_DROPPED` ≈ 0,
`totals.Layout.events` ≈ 0 during motion. Puppeteer is resolved from the
chrome-devtools skill's node_modules (see the createRequire line); the app has no
Puppeteer dependency. Override the path with the `PUPPETEER_PKG` env var
(pointing at a `puppeteer` package.json) if that skill isn't installed.
