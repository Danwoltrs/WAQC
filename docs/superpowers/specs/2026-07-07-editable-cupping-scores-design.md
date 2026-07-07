# Editable cupping scores + spec-scaled spider + inline header

Date: 2026-07-07
Surface: cert-editor "Cupping / sensory" quadrant (`/certificates` and `/samples` fullscreen overlay)

## Problem

In the "Edit cupping / sensory" panel the 8 attribute tiles (Body, Flavor,
Acidity, Balance, Overall, Aftertaste, Sweetness, Fragrance/Aroma) are
read-only. Users trying to correct a score can only select the number, not edit
it — which reads as "the field won't let me click / edit it". Separately the
cup-profile (flavor descriptor) could not be cleared and stayed blank (fixed
earlier, commit `463f4b8`).

## Goals

A. Make every attribute score editable, bounded by the quality spec, blank
   allowed, saved as a master-cupper override, and printed on the certificate.
B. Draw the read-only spider graph across the **spec's** scale (0–10, 1–7, …)
   instead of a hardcoded 0–10 / 0–9.
C. Move Clean cup / Uniform cup chips and the flavor descriptor onto the same
   line as the "Cupping / sensory" title.

## Decisions (locked with user)

- Editable **with a warning** note that it overrides the aggregated session
  scores.
- Bounds come from the quality spec per attribute (`scale.min/max/increment`),
  falling back to the template default range, then unbounded.
- "The number you type is what shows" — no auto-recompute. The cert's overall =
  whatever is typed in the Overall tile.
- Blank = that attribute has no score.
- No flavor descriptor set → the chip simply does not render.

## Design

### Data / hook — `use-cert-editor.ts`
- Extend the `client-qualities/[id]` fetch to also read
  `template.cupping_scale_min/max`, and parse `template.parameters.cupping_attributes`
  into `cuppingScales: Record<name, {min,max,increment?}>`.
- Derive `sensoryScale: {min,max}` for the radar: the shared attribute scale if
  uniform, else `[min(mins), max(maxes)]`, else the template default, else
  `[0,10]` (`[0,9]` for CVA).
- Expose `cuppingScales` and `sensoryScale` on `CertEditorState`.
- Save: when `draft.cupping` changed, write `green_bean_data.cupping_scores =
  draft.cupping` (the master-cupper override the loader already prefers).

### UI — `cupping-quadrant.tsx`
- **CuppingQuadrant (read-only card):** header line becomes
  `title  ✓ Clean cup  ✓ Uniform cup  <descriptor>` with the meta on the right;
  the separate chips row is removed. `SensorySpider` radial domain =
  `sensoryScale` (fallback preserved). Bars fallback (<3 attrs) uses the same
  range.
- **CuppingEditPanel (edit):** the attribute tiles become number inputs
  (`min/max/step` from `cuppingScales`), blank allowed, values clamped to the
  scale on apply; a warning line replaces the "read-only" subtitle. `apply()`
  merges edited numeric scores back into the `cupping` map (non-numeric keys such
  as `Flavor_descriptor` are preserved) and writes it to the draft.

### Certificate render — `certificate-data.ts`
- New pure helper `applyCuppingScoreOverride(cuppingData, override)`: overlays
  each override value onto the matching attribute's `score`; if the override has
  an `Overall` key, it also sets `overallScore`. Returns a new object.
- After `processCuppingScores(...)`, when `green_bean_data.cupping_scores` is a
  non-empty object, apply the overlay so typed scores print. `processCuppingScores`
  itself is untouched.
- Unit test for the overlay (override wins, Overall maps to overallScore,
  missing keys untouched, empty override is a no-op).

## Out of scope / notes
- Wording-scale attributes still edit as raw numbers (bounded by the option
  value range) — no dropdown of wording labels in this pass.
- Edge: a sample with an override but no `cupping_scores` table rows would not
  render cupping on the cert (the cert only enters the cupping block when table
  rows exist). Acceptable; real samples have session rows.
