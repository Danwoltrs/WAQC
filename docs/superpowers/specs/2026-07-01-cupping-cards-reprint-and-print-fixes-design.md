# Cupping Cards — Reprint & Print-Fidelity Fixes

**Date:** 2026-07-01
**Status:** Design approved, pending spec review
**Scope:** A4 8-up cupping-card printing on the QC tracker. Fix (1) inability to
easily reprint a batch, (2) intermittently missing cupper names, (3) intermittently
missing / clipped top-right contract reference numbers.

## Problem

Reported by the lab: when cupping cards are printed once, reprinting the same batch
is hard (paper jams, missed sheets, needs a re-run); and some cards print with text
missing — sometimes the cupper names, sometimes the top-right contract reference
numbers. The user suspects the card's outer boundaries need rethinking.

## Root causes (from code investigation)

1. **Reprint friction.** `generateCards()` advances the batch to `analysis` and stamps
   `cards_printed_at` the moment the *preview* is generated
   (`src/components/cupping/print-cupping-cards-dialog.tsx:398-405` →
   `src/app/api/samples/bulk/move-to-cupping/route.ts:85-91`), i.e. before the user has
   confirmed a clean print. When working from a stage-filtered view (e.g. the "Received"
   chip), the batch then disappears on refresh, forcing a chip switch + re-select to
   reprint.

2. **Missing cupper names = timing race.** `effectiveCuppers` falls back to
   `resolvedCuppers`, which is fetched *asynchronously* on dialog open
   (`print-cupping-cards-dialog.tsx:136-145`, `fetchCuppersFromSession`). Clicking Print
   before that resolves prints blank name cells.

3. **Missing / clipped top-right contract numbers = edge clipping.** The A4 8-up grid
   uses `page padding: '0pt'` (`src/components/pdf/thermal-cupping-card-a4.tsx:92`), so
   cards run edge-to-edge and the outer cards' content lands in the printer's ~5 mm
   non-printable margin and is physically cut off — most visibly the top-right contract
   numbers on the right-hand column. The contract block is also `position: 'absolute'`
   with no width limit (`thermal-cupping-card-a4.tsx:140-145`), so long / multiple
   contract numbers can overlap the company name or run off the card edge.

4. **`cards_printed_at` is set unreliably (pre-existing).** The cupper-assign step
   (`handleCuppersAssigned` in `src/app/samples/qc/page.tsx`) can already advance samples
   to `analysis` via the samples-assigned notification. When a sample is already at
   `analysis`, `move-to-cupping` returns early **without** stamping `cards_printed_at`
   (`move-to-cupping/route.ts` idempotency guard), so cards printed for those samples may
   never be flagged as printed (this gates the dashboard "Scan Cupping Cards" button).

## Design

### Part A — Fix clipped text on the A4 8-up sheet ("outer boundaries")

File: `src/components/pdf/thermal-cupping-card-a4.tsx`

- Add a **safe printable margin**: set the A4 `page.padding` to ~24pt (≈8 mm) on all
  sides so no card content sits in the printer's non-printable zone.
- Recompute `CARD_HEIGHT` from the padded content area so the 2×4 grid still fits exactly
  on one page: `CARD_HEIGHT = (842 − 2·padding) / 4 ≈ 198.5pt`. Cards stay 8-up, just
  inset from the paper edge. Column width stays `50%` (of the padded content box).
- **Constrain the contract block** so it can never overlap or run off: give it a
  `maxWidth` (~45% of card width), keep it top-right, and let contract numbers
  **wrap / shrink to always fit** (multiple lines and/or reduced font) instead of
  clipping. Every contract number must render fully.
- Keep the internal shared cut-borders unchanged (guillotine workflow is unaffected).

Explicitly **out of scope:** reducing to 6-up (margin fix alone resolves the clipping
without costing cards per sheet). Thermal A6 and CVA templates are not changed in this
pass (lab uses A4 8-up).

### Part B — Fix missing cupper names

File: `src/components/cupping/print-cupping-cards-dialog.tsx`

- **Wait for cupper resolution before generating cards.** Track whether the session-cupper
  fetch has completed; disable the Print button (with a brief "loading cuppers…" state)
  or have `generateCards` await resolution, so name cells are always populated when
  cuppers exist.
- **Warn on genuinely zero cuppers.** If, after resolution, a sample has no assigned
  cuppers, show a small inline warning in the dialog before printing (rather than
  silently printing blank name rows). Printing is still allowed (blank rows are valid for
  handwritten entry) — the user just isn't surprised.

### Part C — Reprint the whole batch anytime

Files: `src/components/cupping/print-cupping-cards-dialog.tsx`,
`src/app/api/samples/bulk/move-to-cupping/route.ts`, and light touch to
`src/app/samples/qc/page.tsx`.

- **Defer the stage move to confirmed print.** Remove the `updateSampleStatuses()` call
  from `generateCards()` (preview generation). Instead advance the stage + stamp
  `cards_printed_at` only when the user clicks the real Print button in the preview
  (`handlePrintPreview`), on the **first** confirmed print. A jam before printing moves
  nothing.
- **Reliable `cards_printed_at` stamping.** Adjust the `move-to-cupping` route so that
  when a sample is already at `analysis`, it still stamps `cards_printed_at` if missing
  (stamp-if-null), rather than skipping the update entirely. This fixes the pre-existing
  case where the assign step advanced the sample first.
- **Keep the preview open after printing** so the batch can be re-run immediately:
  after a confirmed print the dialog stays open showing the same preview, with a clear
  **"Print again"** action and a separate **"Done"** button. "Print again" re-triggers the
  browser print of the same PDF (no re-selecting, no re-generation). "Done" closes the
  dialog and calls `onSuccess()` to refresh the list. Subsequent prints do not
  re-advance the stage (idempotent).
- **List-level bulk reprint stays available** for already-printed (`analysis`) samples:
  keep the existing bulk "Reprint Cupping Cards" path working and ensure the just-printed
  batch remains selectable (it already is under "All stages"; the in-dialog "Print again"
  covers the immediate re-run case regardless of the active stage chip).

## Affected files

- `src/components/pdf/thermal-cupping-card-a4.tsx` — page margin, card height, contract
  block width/wrap.
- `src/components/cupping/print-cupping-cards-dialog.tsx` — cupper-resolution gating +
  zero-cupper warning; move stage advancement out of `generateCards` into confirmed
  print; keep-open + "Print again" / "Done" controls.
- `src/app/api/samples/bulk/move-to-cupping/route.ts` — stamp `cards_printed_at` when
  missing even if already at `analysis`.
- `src/app/samples/qc/page.tsx` — minor: ensure bulk reprint / selection survives a
  printed batch (verify only; change only if needed).

## Testing

- **A4 layout:** generate an 8-up PDF with (a) long single contract number, (b) 4+
  sub-contracts, (c) right-column + bottom-row cards; verify no text is clipped and the
  grid still fits one page. Print on a real office printer and confirm outer cards are
  intact.
- **Cupper names:** open the dialog for a batch with session cuppers and click Print
  immediately; names must appear (no race). Batch with zero cuppers shows the warning.
- **Reprint:** click Print, jam/cancel at the OS dialog, confirm samples did not move
  until the first successful confirm; confirm "Print again" re-prints the same batch
  without re-selecting; confirm "Done" refreshes the list; confirm `cards_printed_at` is
  set once, including for samples already advanced by the assign step.
- Existing vitest suite stays green.

## Non-goals

- No change to thermal A6 or CVA SCA-103 templates.
- No change to cards-per-sheet (stays 8-up).
- No new database columns / migrations.
