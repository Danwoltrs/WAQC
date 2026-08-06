# Tin label print workflow — design

Date: 2026-08-06
Status: approved design, ready for planning

Follows on from `2026-08-05-sleeve-label-and-mobile-certificate-design.md` (Part 1),
which is live in production. The label content is correct; this is about getting
it off the screen and onto tins efficiently.

## Problem

Three friction points surfaced the first time real labels were generated.

1. **The cut guides stop at the label.** The dashed rule sits on the 165mm
   `labelContainer`, which is centred on a 297mm page, so the dashes span only
   the middle 55% of the sheet. Someone lining a stack up on a guillotine has no
   edge-to-edge line to register against.
2. **Generating downloads a file.** The action produces
   `tin-labels-4cm-<date>.pdf` in Downloads, which then has to be found and
   opened before it can be printed. The lab wants to print, not to collect PDFs.
3. **No way to ask for "what still needs printing".** Labels are printed in
   batches through the day — a morning run, then another after lunch once more
   samples have finished cupping. Today that means remembering which rows were
   already done.

## Decisions taken

| Question | Decision |
|---|---|
| "Today" | Samples **certified today**, in Santos local time |
| Printed marker | Stamped when **Print is pressed in the modal**, not at generation |
| Filter surface | **One button** that finds, generates and opens the modal |
| Modal actions | **Print only** — no download |

## Part A — Full-width cut guides

Split the label row in two:

- an outer row at full page width carrying `borderBottom: '0.3pt dashed'`
- an inner 165mm block holding the wordmark, QR and body, centred

Add the same dashed rule above the first label so every cut — including the top
edge — has a guide.

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  ← new top rule
│        wolthers  [QR]  MRKU 682.397-2                 │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← now edge to edge
│        wolthers  [QR]  TTNU 111.171-1                 │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

Nothing inside the 165mm block changes. The 2.5cm variant keeps its current
layout — confirmed good in review of the first print.

Row height is unchanged, so five 40mm labels still fit A4 landscape
(5 × 113.39pt = 566.95pt of 595.28pt).

## Part B — Print modal

`TinLabelSizeDialog` becomes a two-step dialog rather than a size picker that
downloads:

1. **Size** — 4cm / 2.5cm, as today.
2. **Preview** — the generated PDF in an `<iframe>`, with a single **Print**
   action.

Print calls `iframe.contentWindow.print()`. On success it stamps the samples
(Part D), then closes.

Both entry points land here: the three existing selection-based **Tin Label**
menu items, and the new button from Part C.

### Consequences, accepted

- **No download.** There is no escape hatch if the print dialog misbehaves; the
  operator cancels and re-runs the action. Chosen deliberately to stop PDFs
  accumulating.
- **The browser's own print dialog still appears** after the modal's Print
  button. Unavoidable for a real print.
- **Blob-URL iframe printing is browser-dependent.** It is reliable in Chrome,
  which is what the lab uses. If Safari support is ever needed, the fallback is
  opening the blob in a new tab and letting the operator print from there.

## Part C — Print today's unprinted

A single button above the samples table on `/samples/qc`, beside the existing
search field:

```
[ Search… ]                         [ ⎙ Print today's unprinted · 12 ]
```

Clicking it resolves the set server-side and opens the same two-step dialog from
Part B, **starting at the size step** — the batch still needs a size, and
defaulting silently to 4cm would eventually print a tray of wrong-sized labels.
It does not touch the current row selection, so it works regardless of what is
filtered or selected.

Hidden entirely when the count is zero — an enabled button that prints nothing
is worse than no button.

The count comes from the same endpoint that supplies the ids, so the badge and
the batch can never disagree. It refreshes after a successful print and on the
same trigger as the existing sample list reload, so the badge drops to reflect
what was just printed.

The existing selection-based Tin Label action is unchanged in purpose: ad-hoc
printing and reprints. It re-stamps when used, which is how a jammed print is
recovered.

### What "today's unprinted" means

- `workflow_stage IN ('certified', 'rejected')` — the existing print gate
- `tin_label_printed_at IS NULL`
- the sample's certificate was issued today

"Today" is the calendar day in `America/Sao_Paulo`, reusing `LABEL_TIME_ZONE`
from `src/lib/sleeve-label-data.ts`. Sharing the constant means a label and the
filter that selected it can never disagree about the date — the same reason that
constant exists.

The day boundary is computed as a UTC instant range and passed to Postgres, so
the query stays index-friendly rather than wrapping the column in a timezone
conversion.

## Part D — Print tracking

### Migration

```sql
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS tin_label_printed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_samples_tin_label_printed_at
  ON samples(tin_label_printed_at)
  WHERE tin_label_printed_at IS NOT NULL;
```

Mirrors the `cards_printed_at` precedent
(`supabase/migrations/20251127000000_add_sample_scan_tracking.sql`). The new file
goes in `database/migrations/`, which is where WAQC migrations belong despite
that precedent living in the other directory.

Nullable with no default: every existing sample reads as never printed, so the
first "today's unprinted" run after deploy offers everything certified that day.
That is correct — nobody has printed a new-format label yet.

### Endpoints

- `GET /api/samples/tin-labels/pending-today` → `{ sample_ids: string[], count: number }`
- `POST /api/samples/tin-labels/mark-printed` with `{ sample_ids }` → stamps
  `tin_label_printed_at = now()`

Both staff-gated the way the existing print routes are.

`mark-printed` stamps only ids the caller could legitimately print — it
re-applies the certified/rejected gate rather than trusting the request body, so
a crafted call cannot mark arbitrary samples.

### Accepted gap

Stamping on Print means a job that reaches the printer and jams still counts as
printed, and the next batch skips it. Recovery is selecting those rows and using
the Tin Label action directly, but someone has to notice. The alternative —
stamping only on confirmed physical output — is not observable from a browser.

## Part E — Trade names, not legal names

The label prints `companies.name`, the legal name — `Syngenta AVC SA`,
`Blaser Trading AG`. Nobody in the trade calls them that. Print the *nome
fantasia* instead, falling back to the legal name when it is absent:

```ts
company?.fantasy_name || company?.name || null
```

This is already the house convention — `src/app/clients/page.tsx:664` and
`src/app/embed/quadrant/[id]/page.tsx:215-223`, the latter applying it to
seller, importer and roaster together.

Applies to **all three party fields on the label**: `Seller:`, `Client:` and
`Roaster:`. The request named sellers and buyers; roaster is included because
leaving one company on its legal name beside two trade names reads as a bug, not
a distinction.

Both tin routes need `fantasy_name` added to their company joins. The resolution
belongs in `src/lib/sleeve-label-data.ts` as a small exported helper with tests,
not repeated at four call sites.

Legal names are unaffected everywhere else — the certificate PDF, contracts and
correspondence keep using `name`, which is what those documents require.

## Not in scope

- The mobile certificate page rebuild (Part 2 of the previous spec). The QR
  resolves correctly today; the page it opens is still the old radar-chart
  layout, which is expected and unchanged by this work.
- The label's internal layout, field set, or the 2.5cm variant.
- The bag sleeve label and `print-labels`.
- Reprint history or an audit trail — `tin_label_printed_at` holds the most
  recent print only.
