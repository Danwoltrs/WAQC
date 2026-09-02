# CVA flavour wheel rebuild — camera model, zero-layout renderer, mobile controls

**Date:** 2026-09-02
**Brief:** `Documents/prompts/specialty_wheel/CVA_WHEEL_REBUILD_PROMPT.md` (architecture) and
`CVA_WHEEL_UI_SPEC.md` (interaction). Where they disagree, the UI spec wins on
interaction and the brief wins on architecture. Where this document deviates from
either, it says so and why.
**Replaces:** the "locked v8" dwell-zoom interaction documented in
`docs/superpowers/specs/prototypes/cva-flavor-wheel-prototype.html` and implemented in
`src/components/cupping/cva/wheel/FlavorWheel.tsx` + `zoom-machine.ts`.
**Followed by:** sub-project 2, the flavour wheel as an option on mainstream (commodity)
qualities, with the wheel and descriptors on the commodity certificate. Its locked
decisions are in the appendix; it gets its own spec once this lands.

## Why

The wheel drops a third of its frames on a desktop hover sweep and more than half on a
5K-sized window (Phase 0, 2026-09-02, four Puppeteer traces of the unmodified overlay):

| Run | Frames dropped | Main-frame p95 | Layout | Raster |
|---|---|---|---|---|
| Hover sweep, 2560 px viewport, stage 1200 px | 31% (+28% partial) | 18.4 ms | 935 ms / 433 events | 2,350 ms |
| Same, 5K-sized viewport, stage 2560 px | 54% (+21% partial) | 60.9 ms | 1,745 ms | 6,929 ms |
| Drill hub → Fruity → Other Fruit | 9% | 9.0 ms | 358 ms | 536 ms |
| Mobile 390 px, DPR 3, 4× CPU throttle | 11% (+20% partial) | 18.1 ms | 458 ms / 120 events | 168 ms |

Two causes account for nearly all of it, and neither is the SVG technology:

1. **Every animated frame is a full SVG layout.** The CSS transitions on
   `.cva-wheel-branch`, `.cva-wheel-wedge` and `.cva-wheel-lw` animate `transform` on SVG
   `<g>` elements. Blink treats an SVG transform change as a layout change, so each
   transition frame re-lays-out all 679 nodes and re-shapes all 110 text labels.
2. **Filters re-raster at device resolution on every one of those frames.** 27 Gaussian
   shadow silhouettes, 9 CSS-blurred frost rings, a hover drop-shadow and a
   backdrop-blurred tray. Raster cost scales with stage area, which is why a large
   window is far worse than a laptop.

The remaining findings are real but small: two React state writes per pointer move,
`getBoundingClientRect` inside `onPointerMove` (7–16 forced layouts per run), 73 leaf
labels held at `opacity:0` (still shaped and painted), 110 button groups with `:hover`
rules (a subtree style recalc per crossing). Arc geometry is already static.

The current "sector expands to fill the circle" drill-in cannot be kept on SVG: a
smooth reflow animates 130 path geometries per frame, which is a layout per frame by
construction — the exact pathology measured. The camera model below is therefore not
only cheaper, it is the only drill model consistent with keeping vector text.

## Decisions (Daniel, 2026-09-02)

- Drill model is **fly-camera over a static wheel**. The reflow variant is deferred; it
  would mean a Canvas renderer and is only revisited if the fly feel is rejected.
- **Zoom cap 1.5× on desktop, 3× on mobile.** Family fly-to lands at the cap on
  desktop; on mobile it frames the sector at ~80% of the viewport, clamped to 3×.
- **Thumbstick** on touch devices, default bottom-right, tossable to the left for
  left-handers, side persisted per device, and hideable via a small toggle.
- Work happens in a worktree on `feat/cva-wheel-rebuild`; merge to main when green.
  The main tree carries uncommitted CVA Panel edits that this work must not touch.
- Sub-project 2 decisions: see the appendix.

## Architecture rules (written into the module header, non-negotiable)

1. **Input → camera ref → single rAF → one transform.** Pointer, touch, wheel, keyboard
   and thumbstick handlers only write `camera.target`. One `requestAnimationFrame` loop
   integrates `camera.current` toward it with a critically damped spring and writes one
   `transform` string. React re-renders only when the *selection* changes (a pick, a
   family opened, the breadcrumb). Never on pointer move, never per frame.
2. **Exactly one element transforms:** the HTML `#camera` div, via CSS `transform`.
   No element inside the `<svg>` ever carries a transform or an animation. The only
   transition inside the svg is the 200 ms opacity cross-fade on the family groups
   (spec §Interaction; opacity is paint-only — the measured pathology was transform →
   layout). Task 11's traces confirmed no per-frame Layout during the fade.
3. **Geometry is computed once**, at module load, from `flavor-wheel-data.ts` (already
   the single taxonomy source, shared with the certificate). The scene is rendered once
   and memoised; its DOM never changes for camera motion.
4. **No filters, ever**, inside the wheel root: no `filter`, `backdrop-filter`,
   `box-shadow`, `drop-shadow`. Dimming is precomputed muted fills plus opacity.
5. **Zero text measurement at runtime.** Labels are measured once per mount (canvas
   `measureText`, after `document.fonts.ready`) into a `Map` keyed by node id; jsdom
   falls back to a character-width estimate. Fit, wrap and ellipsis decisions are made
   once, not per frame.
6. **Hit testing is math.** Pointer → polar `(r, θ)` around the wheel centre in scene
   space → ring by radius → binary search over a sorted angle index per ring. One
   listener on the root; `pointer-events: none` on every arc and label.
7. **The idle wheel burns nothing.** The rAF loop stops when the camera has settled and
   no input is active; `will-change: transform` is set on `#camera` while moving and
   removed on settle so text re-rasterises crisply at rest.
8. **Performance budget is enforced in code.** A dev-only HUD behind `?debug=1` shows a
   rolling 60-frame p95 frame time, and the repo keeps the Puppeteer harness so the
   numbers can be re-taken. Targets: p95 frame ≤ 8 ms desktop (2560 px logical), ≤ 14 ms
   on a 4×-throttled mobile profile, zero Layout events inside any animation window.

## Structure

```
<div class="wheel-root">                 one pointer/touch/wheel/key listener; math hit-test
  <div class="wheel-camera">             the ONLY thing that transforms (CSS translate+scale)
    <svg class="wheel-scene" viewBox>    rendered once, geometry frozen
      <g class="wheel-arcs">             110 paths; no pointer-events; no filters
      <g class="wheel-labels">           110 texts; display:none below the arc-length threshold
  <div class="wheel-overlay">            fixed, never transforms:
      breadcrumb · centre "zoom out" · picks counter · thumbstick · debug HUD
```

The root fills the overlay's stage region edge to edge (no longer a forced square);
`scale = 1` means the whole wheel fits `min(width, height)`.

### Modules (all under `src/components/cupping/cva/wheel/`, each small and testable)

| Module | Responsibility | Depends on |
|---|---|---|
| `camera.ts` | Pure camera maths: spring step (frame-rate independent), `screenToWorld`, anchored zoom, scale clamp per device class, rubber-band pan clamp, fly-to target for a node (centroid + scale to frame ~80%, clamped), edge-band velocity | geometry constants |
| `hit-test.ts` | Sorted angle index per ring built once from `NODES`; `nodeAtScene(x, y)` via binary search; region classification (hub / node / outside) | `flavor-wheel-data` |
| `palette.ts` | Build-time colour work: muted variant per node (desaturate ~22%, darken toward the surface `#2E2E29`), label colour per wedge by WCAG contrast ≥ 4.5:1, selected-ring colour | `flavor-wheel-data` |
| `labels.ts` | Label geometry per node (tangential inner rings, radial leaf ring, flipped upright on the left half — existing behaviour), one-time measurement cache, visibility threshold (arc ≥ 14 screen px), counter-scale so a label grows only to 15 px | `camera` |
| `gestures.ts` | Pure touch state machine: long-press (260 ms, cancels on 10 px move), pinch (anchored), two-finger drag, double-tap, swipe-down-to-close. Emits camera intents + `fly`, `pick`, `close` events | none |
| `WheelScene.tsx` | The static SVG. `memo` with props limited to `pickedKeys` and `focusFamily`; those toggle classes only (`is-picked`, `is-muted`, `is-focus`). No transforms, no filters | `palette`, `labels` |
| `Thumbstick.tsx` | Well + knob; deadzone 14%; `v = MAX·m²/scale`; drag-the-well to relocate; springs to the nearer side on release; side in `localStorage['waqc.wheel.stickSide']`; idle fade to 35% after 2.5 s; knob tinted with the family under the viewport centre | `camera` |
| `DebugHud.tsx` | `?debug=1` overlay: rolling p95 frame time, last frame's scripting/style/layout/paint split from `PerformanceObserver('long-animation-frame')` where available, layout count | none |
| `FlavorWheel.tsx` | The root: owns the camera ref and rAF loop, the single listener, keyboard focus, breadcrumb/centre chrome, and the React-facing props `picks`, `onToggle`, `active` | all of the above |

`zoom-machine.ts` and its test are deleted. `DescribeOverlay.tsx` keeps its tabs,
counter, chips, free-text field and toast, but loses `backdrop-blur-md`, the
`onShade`/hysteresis tray-hiding (obsolete: the camera pans instead), and on mobile
turns the tray into a collapsed bar that expands on tap, reserving the bottom 140 px as
thumb territory.

## Camera

```ts
type Camera = { x: number; y: number; scale: number }   // scene-space point at viewport centre; 1 = whole wheel fits
```

Two copies, `current` and `target`. Per frame:
`k = 1 − exp(−dt · 9)`, each component `cur += (tgt − cur) · k`; settle when every delta
is under epsilon, snap, stop the loop. Rotation from the UI spec is dropped (YAGNI).

- Scale limits: `MIN 1`; `MAX 1.5` on pointer-fine desktop, `MAX 3` on coarse-pointer /
  ≤ 1023 px (the existing `COMPACT_MQ` rule).
- Anchored zoom (wheel, pinch): keep the scene point under the cursor fixed, exactly
  the formula in the UI spec.
- Pan clamps to the scene bounds with a 60 px rubber band that springs back.
- `prefers-reduced-motion`: every camera move is an instant cut, edge pan is disabled,
  the thumbstick still works.
- The `#camera` div gets `will-change: transform` on the first frame of motion and loses
  it on settle.

## Interaction

**Desktop**

- Hover: paint-only. The wedge brightens one precomputed step and gets a 1 px stroke in
  its own colour; the label brightens. **Deviation from the UI spec's "4 px radial
  offset":** an offset is a transform, and any transform inside the SVG is a layout per
  frame — the root cause just removed. Cursor is `pointer` on leaves only.
- Click a family or group: fly (380 ms spring settle) to its centroid at the framing
  scale; non-focused families cross-fade to their muted fill over 200 ms (opacity +
  class, no filter); their labels go `display:none`. **The dwell-hover zoom is gone**:
  drilling is a click, as the UI spec says. Leaving the wheel no longer springs to rest.
- Click a leaf: toggles the pick; nothing moves. At 5/5 the existing replace-oldest
  behaviour stays (with its toast) and the counter pulses once — no dead taps.
- Edge pan: active only at `scale > 1.05`; band = outer 14%; `v = 900 · easeInOutCubic(p)
  / scale` scene-units/s, corner vector clamped to the same magnitude; applied to
  `target` inside the rAF loop, never a timer.
- Wheel = zoom at pointer; `ctrlKey` wheel = trackpad pinch (smaller factor); a wheel
  event with `deltaX` and no `ctrlKey` pans.
- Keyboard: ←/→ move focus around the current ring, ↑/↓ change ring, Enter drills or
  picks, Esc zooms out one level (family → whole wheel → the overlay's own Esc-to-close
  as today). Focus ring = 2 px stroke in the wedge's own colour drawn on top; `aria-live`
  announces the pick count. Wedges keep `role="button"` + `aria-label` +
  `tabIndex` for assistive tech, with `pointer-events: none`.

**Mobile**

| Gesture | Action |
|---|---|
| Tap a wedge | Drill (family/group) or toggle pick (leaf) |
| Long-press 260 ms | Fly to the point under the finger; a radial progress ring draws around the touch; > 10 px of movement cancels into a pan; a leaf is highlighted, never picked |
| Pinch | Anchored zoom |
| Two-finger drag | Pan |
| Double-tap | Zoom out one level |
| Swipe down from the top band | Close the overlay |
| Thumbstick | Pan with the thumb; see `Thumbstick.tsx` |

Haptics via `navigator.vibrate` where it exists (Android Chrome; iOS Safari has no
vibrate API, so nothing fires there): 8 ms on a pick, 12 ms double pulse at the cap,
4 ms on crossing a ring boundary during a fly. The thumbstick is optional: a small
toggle in the overlay chrome hides it, persisted in `localStorage['waqc.wheel.stick']`.

## Visual treatment

- Surface stays the warm dark `#2E2E29` band; family colours unchanged (CVA standard).
- Dimming = precomputed muted fill + opacity 0.42, labels `display:none`. No blur.
- Selected = full-saturation fill, 2 px ring in the surface colour, small filled dot at
  the wedge's outer edge. Distinct from hover (stroke in own colour) and focus (2 px
  stroke in own colour on top).
- Labels: vector `<text>` only; a label renders only when its arc is ≥ 14 screen px;
  effective size counter-scales from 11 px up to 15 px and holds. Truncation is
  decided once with a cached ellipsis variant; no clip paths.
- Motion: camera 380 ms with the spec's ease; hover 120 ms; fades 200 ms; knob return
  180 ms.

## Data flow and persistence

Unchanged. `FlavorWheel` receives `picks: WheelPick[]` and calls `onToggle({ path })`;
`DescribeOverlay` applies `addPickCapped`, derives CATA boxes, and `useCvaSession`
autosaves the assessment to `cupping_scores.scores`. Free-text off-wheel descriptors
and the official-form auto-fill line are untouched. The certificate's
`CertificateFlavorWheel` shares `NODES`/`arcPathD` and is untouched.

## Error handling

- Canvas or `document.fonts` unavailable → character-width estimates; nothing throws.
- `ResizeObserver` unavailable (jsdom) → one `getBoundingClientRect` on mount.
- `navigator.vibrate` / `localStorage` absent or throwing → ignored.
- A pointer event with no mapped node (hub, outside the rim) is a no-op; a click on the
  hub or outside the wheel while zoomed in zooms out one level (today's background
  click behaviour).

## Testing

- **Pure modules** (vitest): spring settles and is frame-rate independent; anchored
  zoom keeps the anchor fixed; clamps and rubber band; fly-to target framing and the
  per-device caps (1.5 / 3); hit-test agrees with a brute-force `NODES.find` for a
  sweep of 5,000 random points including ring edges and the seam at −π/2; label
  visibility thresholds and counter-scale; palette contrast ≥ 4.5:1 for every node;
  gesture state machine (long-press fire/cancel, pinch factor, double-tap window).
- **Component** (testing-library): renders 110 wedges with accessible names; click on a
  family sets `data-focus`; click on a leaf calls `onToggle`; keyboard path; picked
  class; reduced-motion makes the fly instant; the DescribeOverlay tests keep passing.
  Pointer tests dispatch coordinates at the root with a mocked rect, as the existing
  hover tests already do.
- **Performance** (repeatable, not in vitest): `scripts/perf/trace-wheel.mjs` +
  `analyze-trace.mjs` drive a dev-only harness route
  (`/embed/wheel-harness`, `notFound()` in production) and print the table above.
  Acceptance = the budget in rule 8, before/after numbers recorded in `PROGRESS.md`.
- **Manual parity checklist** (brief Phase 3), ticked in the PR: three sections,
  shared descriptors tracked per section, three levels, 5-cap with live counter,
  free-text persisted, auto-fill, breadcrumb + centre zoom-out, exact CVA colours,
  selected vs hover vs focus, autosave unchanged.

## Out of scope

- The reflow drill animation (would need Canvas; deferred by decision).
- Camera rotation to point a sector east.
- Voice describe, calibration, guest score entry, and everything in sub-project 2.

## Appendix — sub-project 2 decisions (mainstream qualities), locked 2026-09-02

To be specified separately once the rebuilt wheel lands; recorded here so they are not
relitigated:

1. A **"Flavour wheel" toggle on the quality spec editor's Cupping section**, stored in
   `quality_templates.parameters.flavor_wheel = { enabled: true }` — no migration, and
   it flows to `client_qualities` the way every other cupping parameter does.
2. The **commodity cupping page** gets a "Describe this cup" button per sample when the
   quality has the toggle on, opening the same three-group `DescribeOverlay` unchanged
   (Aroma / Flavour & Aftertaste / Mouthfeel, 5 picks per olfactory group).
3. **Storage**: a new `cupping_scores.describe jsonb` column holding a `CvaDescribe`
   (migration handed to Daniel as SQL). Not nested inside `scores`, which every reader
   treats as an attribute map and where non-attribute keys have leaked as fake
   attributes before.
4. **Certificate**: the commodity certificate prints the wheel at about 120 pt beside
   the box plot plus the existing descriptor band (the `cvaDescriptors` plumbing,
   renamed to `wheelDescriptors`), page-fit checked with real Inter via fontkit. The
   master cupper's picks print; otherwise the union across cuppers.
5. The public QR certificate page is unchanged in this sub-project.
