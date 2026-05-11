# Duplicate Sample — Count Popover Design

**Date:** 2026-05-11
**Status:** Approved (pending spec review)

## Problem

The "Duplicate Sample" action in the Samples page context menu currently
shows a browser `confirm()`, then creates exactly one duplicate. Users
splitting a shipment into multiple sub-samples have to click the menu
item once per copy, which is tedious for anything beyond 2–3 copies.

## Goal

Replace the `confirm()` with a small popover positioned at the user's
mouse cursor that asks how many copies to create, then creates that many
in a single round trip.

## UX

- The popover appears at the click coordinates of the context-menu item
  ("Duplicate Sample"), clamped to the viewport so it never gets clipped.
- Width ~240px. Contains:
  - Title: "Duplicate sample"
  - Label: "How many copies?" and a number input
  - Range hint: "(1–20)"
  - Buttons: `Cancel` and `Duplicate`
- Input is autofocused. `Enter` submits, `Escape` cancels, outside-click
  cancels. Submitting again is debounced via the loading state on the
  Duplicate button.
- On submit, the Duplicate button shows a spinner until the backend
  responds. Result feedback uses the existing `useToast` hook (replacing
  the legacy `alert()`). On success: refresh the samples list.
- Count = 1 must produce the same outcome as today's flow (no regression
  for the common single-duplicate case).

## Architecture

### Frontend (`src/app/samples/page.tsx`)

- New state: `duplicatePrompt: { sample: Sample; x: number; y: number } | null`
- `handleDuplicateSample(sample)` becomes `openDuplicatePrompt(sample, event)`;
  it stashes `{ sample, x: event.clientX, y: event.clientY }` in state and
  opens the popover.
- New component `DuplicateCountPopover` (rendered inline in
  `samples/page.tsx`, since there's only ever one prompt at a time).
  Props: `{ sample, x, y, onCancel, onSubmit(count) }`.
- Submit handler issues a single `POST /api/samples/[id]/duplicate` with
  `{ count }` in the body. Closes the popover and toasts the result.

### Backend (`src/app/api/samples/[id]/duplicate/route.ts`)

- Accept optional `count` in JSON body. Validate: integer, `1 <= count <= 20`.
  Default 1 when missing or invalid input is supplied (returns 400 only on
  out-of-range, not on omission).
- Wrap the existing tracking-number-retry insert loop in an outer
  `for (let i = 0; i < count; i++)` loop, accumulating results.
- Response shape:
  ```ts
  {
    samples: Sample[],     // successful inserts (length 0..count)
    failed: number,        // count - samples.length
    errors?: string[]      // optional details for the failures
  }
  ```
- Status code: `201` if any sample was created, `500` if all failed.

### Partial-failure handling

If some inserts succeed and some don't (e.g. tracking-number retries
exhausted on a few), return the partial list and let the frontend toast
something like "Created 17 of 20 duplicates (3 failed)".

## Non-goals

- No background-job mechanism. Synchronous loop is fast enough at count ≤ 20.
- No CSV or bulk-import flow. Larger batches should route through intake.
- No UI change to the sub-contract flow (PSS samples) — only SS samples
  show "Duplicate Sample".

## Testing

- Manual: count = 1, count = 20, count = 0 (rejected), count = 21
  (rejected), popover near screen edges, Escape closes, outside-click
  closes, partial failure path.
- Existing single-duplicate behaviour preserved for count = 1.
