# CVA flavor wheel — smooth render rebuild

**Date:** 2026-06-15
**Status:** approved (Daniel), implementing straight to `main` for online testing
**Files:** `src/components/cupping/cva/wheel/FlavorWheel.tsx`, `src/app/globals.css`, `src/components/cupping/cva/wheel/zoom-machine.ts`

## Problem

The wheel renders ~600 live SVG nodes. Two structural costs make it feel laggy; no
amount of timing/dwell tuning fixes either (tuning only changes how *often* they fire —
which is why shortening the dwell made it worse):

1. **Zoom/pan** animates a CSS `transform` on the bare `<svg>`. SVG roots don't get a
   cheap GPU layer, so the browser repaints all ~600 nodes every frame during the glide.
2. **Moving over notes** runs React on every note-crossing (`setPopped` → re-render the
   focused family `<Branch>` → `reorder()` physically reshuffles the family's wedge nodes
   in the DOM to paint the hovered one last).

## Approved approach — "keep SVG, kill the costs"

Keep the exact structure, look, interaction model and accessibility. Remove both cost
sources.

### Fix 1 — Note hover becomes pure CSS `:hover`
- The hover highlight (brightness + stroke + a *tiny* scale) moves to a CSS rule scoped
  to the focused family in full mode:
  `.cva-wheel-svg[data-zoom-mode="full"] .cva-wheel-branch.is-focused .cva-wheel-wedge:hover`.
- Delete the JS `popped`/`setPopped` state, the `is-popped` plumbing through `<Branch>`,
  and the `reorder()` helper. As the cursor sweeps notes, **nothing fires in React** —
  the browser handles hover natively.
- **Pan (compact/iPad-with-mouse only)** still needs the hovered node's angle. Compute it
  directly from `nodeAt()` in the pointer handler, throttled, tracking the last panned
  node via a ref to avoid redundant `setPanAngle`. `panAngle` re-renders only `FlavorWheel`
  (transform + marker), never the memoized `<Branch>`es.

### Fix 2 — Zoom/pan rides a GPU layer
- Wrap `<svg>` in `<div class="cva-wheel-viewport">`; move the zoom/pan `transform` (and
  the `transition`) from the svg onto that div (an HTML element composites reliably; the
  svg root does not). Transform math is unchanged — the div is the same size/origin as the
  svg (fills the square stage, `transform-origin:50% 50%`).
- Promote to a GPU layer **only during the glide**: `will-change: transform` set while a
  transform transition is active (a `zooming` flag set on `transform` change, cleared
  ~650ms later), removed when idle. During a pure-transform glide the content is static, so
  the browser slides a cached bitmap — no 600-node repaint. When idle (note-browsing via
  CSS `:hover`) there is **no** permanent layer, so hover repaints stay cheap and local.
- Preserve `overflow: visible` on the viewport so the zoomed wheel still bleeds to the
  screen edge ("the frame is the screen").

## Unchanged
Sunburst geometry, colors, labels, dwell-zoom model, family lift, frost ring, the
`role=button`/aria wedges (CSS `:hover` never touches the a11y tree), and the
`--cva-wheel-tdur` pan/zoom duration split.

## Tradeoffs (accepted)
- The **label** no longer scales with the wedge on hover (wedge highlights, label stays).
  Wedge and label live in separate paint groups; linking them via CSS would break
  "labels always paint above wedges." Minor — labels stay fully visible.
- Hover leads with brightness+stroke and only a tiny scale, so dropping `reorder()` causes
  no visible z-order glitch.
- **Risk to watch online:** a `will-change` compositing layer could clip the edge bleed.
  Verify the zoomed wheel still spills past the stage; if clipped, widen the layer bounds
  or drop `will-change` for `transform: translateZ(0)` scoped to the transition.

## Test impact
Two `FlavorWheel.test.tsx` tests assert the deleted JS implementation (the `is-popped`
pop and the reorder-last paint order). They are removed — the behavior is now CSS `:hover`,
which jsdom can't meaningfully exercise. All other tests stay green.

## Delivery
Incremental commits straight to `main` (Daniel tests each online):
- **A:** GPU viewport layer (zoom smoothness) — `popped`/`reorder` untouched, tests intact.
- **B:** CSS `:hover` pop, remove `popped`/`reorder`, update tests (note-browsing smoothness).
