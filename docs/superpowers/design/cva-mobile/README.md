# CVA on a Phone — design canvas generators

Source for the published canvas **[CVA on a Phone](https://claude.ai/code/artifact/caf8513a-691d-4e29-9e55-454090ba565a)**:
clickable 390×844 mockups of the specialty (SCA CVA) cupping journey.

Only the **generators** are tracked here. Everything else — `wheel-data.json`, the
`*.dc.html` artboards, the seeded `cva-on-a-phone.html` — is derived and regenerated
by the two commands below. Do not commit the derived files (the seeded page alone is 3 MB).

## Rebuild

Run from a scratch directory; step 1 must run from the repo root so `@/` resolves.

```bash
SCRATCH=/tmp/cva-design && mkdir -p "$SCRATCH" && cp docs/superpowers/design/cva-mobile/*.{ts,mjs} "$SCRATCH"/

# 1. wheel-data.json — geometry, palette, label visibility and every phone camera
#    state, computed with the PRODUCTION functions (flyToNode / clampCamera /
#    visibleLabelKeys). This is why the mockup frames families exactly as the app would.
cd /Users/danielwolthers/Documents/GitHub/WAQC
npx tsx --tsconfig ./tsconfig.json "$SCRATCH/gen-wheel.ts"      # writes wheel-data.json beside the script

# 2. the artboards + canvas.json
cd "$SCRATCH" && node build.mjs

# 3. seed a fresh copy of the Claude Design payload (path is from the `design` skill's
#    base directory, which changes per session — re-run /design to re-extract it)
node "<design-skill>/seed-canvas.mjs" \
  --template "<design-skill>/payload.template.html" \
  --out cva-on-a-phone.html --title "CVA on a Phone" \
  --artboard Main.dc.html --artboard Roast.dc.html --artboard Wheel.dc.html \
  --artboard WheelFramed.dc.html --artboard WheelSheet.dc.html --artboard WheelList.dc.html \
  --artboard Mouthfeel.dc.html --artboard Cups.dc.html --artboard Score.dc.html \
  --artboard Panel.dc.html --artboard Certify.dc.html \
  --canvas canvas.json
node "<design-skill>/seed-canvas.mjs" --check cva-on-a-phone.html
```

`Main.dc.html` must stay the entry artboard (it is the section screen).

## Verify before publishing

```bash
node shot-boards.mjs cva-on-a-phone.html v1   # per-artboard PNGs → ./shots, named by artboard title
node test-tracks.mjs cva-on-a-phone.html      # 29 interaction assertions, all must PASS
```

One board's iframe usually never mounts (the canvas lazy-loads them), and a frame
caught mid-mount can hang `boundingBox` / `contentFrame` / `screenshot` forever — each
of those is raced against a timeout, so a run always terminates and names the board it
skipped. Both scripts write to `./shots` and use `./chrome-profile`, relative to the
scratch directory they run in; if a run is interrupted, `rm -rf chrome-profile` before
the next one or Puppeteer refuses the profile lock.

`test-tracks.mjs` dispatches pointer events **inside** the artboard iframe using
frame-local coordinates. Page-level `page.mouse` lands in the wrong segment, because
the canvas scales each artboard — that mistake produced six false failures the first time.

Puppeteer resolves from the chrome-devtools skill (`PUPPETEER_PKG`), the same way
`scripts/perf/trace-wheel.mjs` does; it is deliberately not in `package.json`.
The chrome-devtools **MCP** browser is often held by another session — these scripts
launch their own profile instead, so they work either way.

## No divergence from production

`gen-wheel.ts` computes every camera and label state with the production functions,
with **no exceptions** — that is what makes the mockup trustworthy. The two things
that were proposals on 2026-09-04 are now in the code (`REST_SCALE_MOBILE`,
`FLY_FLOOR_MOBILE`, and the removal of `ARC_FAMS`), so the generator simply calls
`restCamera(true)`, `flyToNode(..., FLY_FLOOR_MOBILE)` and `visibleLabelKeys`.

If a future pass needs to draw something production does not do yet, add it here as
a clearly-marked local override and say so in this section — never let the mockup
drift silently, or it stops being evidence.

## Publishing

The canvas already exists. From a new conversation you must pass its `url` (a publish
without it creates a *separate* artifact), and the Artifact tool refuses to publish to
an artifact the conversation has not read — so `action: "read"` it first.

- Always pass `contract: "0.1.31"`.
- **Omit `capabilities`** on a republish; the stored declaration (`self`, `downloads`) carries forward.
- Keep the favicon and the title stable.

If Daniel has saved edits from inside the canvas since the last publish, the repo
generators are behind: `seed-canvas.mjs --extract <saved page> --to <fresh dir>` to get
his artboards back, merge, then re-seed.
