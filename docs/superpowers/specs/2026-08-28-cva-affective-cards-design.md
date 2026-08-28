# SCA-104 Affective cards for specialty lots, with guest cuppers

**Date:** 2026-08-28
**Supersedes:** the paper Descriptive form for specialty lots (`3468c4d`, 2026-06-11).
**Handoff it answers:** `../handoffs/2026-08-28-cva-affective-form-handoff.md`

## Why

A specialty (CVA) lot printed from the QC page comes out on the SCA-103
*Descriptive* form today. The lab wants the SCA-104 *Affective* form (the one
that carries the 1–9 impression-of-quality scales the CVA score is built from),
and Anderson wants it as a **card the same size as the commodity card**, printed
in the same run as the commodity cards, not as a separate A4 sheet.

Two facts found while reading the code shape the design:

1. Since `72b4e2b` (2026-08-28), assigning cuppers to a specialty lot creates
   **no cupping session** — the CVA journey mints its own per-cupper session
   lazily when a cupper opens the lot (`cva/session`, matched on
   `created_by = me`). So a specialty lot has no roster anywhere: a reprint
   already comes out with blank cupper names, and there is nothing to store a
   guest on.
2. The journey's *data* model is already multi-cupper — `cupping_scores` rows
   are keyed by `cupper_id` inside one session and finalize reads them all —
   only the session *lookup* is per-cupper. A roster session created at
   assignment is therefore the stepping stone toward comparing cuppers on
   specialty lots, without touching the journey now.

Daniel's decisions (2026-08-28): Affective **replaces** Descriptive; **one
sample per card** (no 2-up); guests are **stored on the session** so
calibration and score comparison become possible later; cards, not sheets.

## The card

New `src/components/pdf/cva-affective-card.tsx` exports one card **face**,
rendered by both existing card documents in place of the commodity face when
`card.is_cva` is set:

- `ThermalCuppingCardDocument` — A6 landscape, one card per page.
- `ThermalCuppingCardA4Document` — A4, 2×4 grid, cut borders.

A mixed selection (commodity + specialty) therefore prints as **one document**
in the chosen output format. There is no separate "CVA Form" document and no
document switcher for it.

Face content, top to bottom, all on one card, nothing wraps:

| Zone | Content |
|---|---|
| Header | QR (optional, see below) · `WOLTHERS & ASSOCIATES`, contract number(s), print date · sample identifier (same rule as the commodity card: exporter sample nr → lab nr; SS = ICO + container) · importer / exporter / quality per the existing visibility toggles · **Cupper: full name** · a small `SCA CVA · Affective` tag |
| Legend | one line: `1 Extremely low · 2 Very low · 3 Moderately low · 4 Slightly low · 5 Neither · 6 Slightly high · 7 Moderately high · 8 Very high · 9 Extremely high` |
| Scales | eight rows — Fragrance, Aroma, Flavor, Aftertaste, Acidity, Sweetness, Mouthfeel, Overall — each: label · ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ circles · `FINAL` box |
| Footer | `NON-UNIFORM CUPS ☐☐☐☐☐` · `DEFECTIVE CUPS ☐☐☐☐☐` · `DEFECT: ☐ Moldy ☐ Phenolic ☐ Potato` · a `Notes` line |

Same styling constants as the other cards (`CUT_BORDER`, `INNER_BORDER`), so a
cut stack looks uniform. On the A4 card (≈290×198 pt inside the cut border) the
face is measured at ~193 pt; on A6 (420×298 pt) the notes line grows. Fit is
verified by **rendering the PDF and looking at it** — the vitest font shim
serves Noto for Inter and cannot judge layout.

**Licence.** SCA permits reproduction "without modification". The card is a
Wolthers adaptation (sample metadata, cupper name, QR, card size), documented
in the component header exactly as the Descriptive component documented its
own adaptations. The SCA copyright line is kept on the card.

`src/components/pdf/cva-descriptive-card.tsx` stays in the repo, unimported.

## One card per sample per cupper

Cards for specialty lots are expanded **per cupper**: staff cuppers in roster
order, then guests, and within each cupper the samples in selection order —
so each cupper's stack is contiguous and can be handed over as one pile.
Six lots × five cuppers = 30 cards = four A4 sheets.

Pure helper `src/lib/cupping/cva-cards.ts`:

```ts
expandCvaCards(cards, roster, { qr: boolean }) -> ThermalCuppingCardData[]
```

- `roster = { cuppers: {id, full_name}[], guests: {id, name}[] }`
- each output card carries `cupper_name` (full name / guest name as typed)
  and `cupper_key` (`<profile uuid>` for staff, `g:<guest uuid>` for guests)
- commodity cards pass through untouched (one per sample, cupper rows as
  today, guest names appended to the rows)
- `ThermalCuppingCardData` gains `cupper_name?: string` and
  `cupper_key?: string`

The first confirmed print still advances the batch to `analysis` and stamps
`cards_printed_at` — on the **deduplicated** sample ids, since one sample now
yields several cards.

## QR, optional

Print dialog checkbox **"QR code on specialty cards"**, default on, persisted
with the other card visibility settings. Off → the face omits the QR slot and
the header text takes the width.

Payload: `WAQC-CVA:<sample_id>:<tracking_number>:<template_id>:<cupper_key>`.

The prefix differs from the commodity `WAQC:` **on purpose**: the commodity OCR
scanner (`ocr/process-card`) parses only `WAQC:` and would otherwise take the
trailing uuid for a template id, mangle the tracking number and write a
*commodity* score against a specialty lot — the `scores/submit` hole the
handoff records. Nothing reads `WAQC-CVA:` yet; it exists so a scanned card
attributes itself to sample + cupper when something does.

## Guests, stored on the session

Migration `database/migrations/20260828000002_cupping_session_guest_cuppers.sql`:

```sql
ALTER TABLE cupping_sessions
  ADD COLUMN IF NOT EXISTS guest_cuppers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN cupping_sessions.guest_cuppers IS
  'Guest cuppers with no profile: [{"id": uuid, "name": text}]. Printed on cards; no scores are recorded against them yet.';
```

Shape `[{ id, name }]`, ids minted server-side (`crypto.randomUUID()`), names
trimmed, deduplicated case-insensitively on merge, max 60 characters.

### Assign-cuppers dialog

`src/components/samples/assign-cuppers-dialog.tsx` gets a **Guest cuppers**
section under the staff table: a name input (Enter or Add), chips with remove.
`onAssign(cupperIds, cuppers, guests: string[])`. At least one staff cupper is
still required (the assignment route requires `cupper_ids`); guests alone
cannot be assigned.

### Assignment route

`POST /api/notifications/samples-assigned` accepts `guest_cuppers: string[]`.

- **Commodity lots** — guests are written to the commodity session on insert
  and on both update branches (`guest_cuppers` merged, not replaced).
- **Specialty lots** — a **roster session** is created or merged:

  ```
  session_type      'cva'
  status            'setup'          -- never a journey session; those are born 'active'
  created_by        the assigner
  cupper_ids        staff ids            participants = cupper_ids
  guest_cuppers     [{id, name}]
  sample_ids        the specialty ids only
  laboratory_id     first sample's lab
  min_cuppers_required 1, allow_single_cupper true
  ```

  Lookup for merge: `session_type = 'cva' AND status = 'setup'` containing any
  of the specialty ids, newest first. Merge unions `cupper_ids`,
  `guest_cuppers` and `sample_ids`.

  Pure helper `mergeRoster(existing, incoming)` carries the union/dedupe rules
  and is unit-tested; the route stays thin.

Notifications to newly added staff cuppers are unchanged. Workflow-stage
advance is unchanged.

### Reading the roster

`GET /api/cupping/session-cuppers` returns `{ cuppers, guests, session_id }`.
Among sessions containing the requested samples it **prefers a roster**
(`session_type = 'cva' AND status = 'setup'`), else the newest match as today.
Pure helper `pickRosterSession(sessions, sampleIds)`, unit-tested.

Side effect, wanted: `GET /api/cupping/sample-assignments` (the QC page's
"cuppers assigned" badges) sees the roster too, so specialty lots show their
cuppers on the tracker again.

### Keeping the journey out of it

`POST /api/cupping/cva/session` reuses a session only from
`status IN ('active', 'review', 'completed')` — `'setup'` is dropped from the
candidate list, so an assigner who also cups the identical set can never be
handed the roster session (whose `cupper_ids` would then feed the finalize
gate). Journey sessions are always born `'active'`, so nothing else changes.

Roster sessions are inert: they are never completed and hold no scores. They
are `'cva'` typed, so every commodity query already excludes them via
`excludeCvaSessions`.

## Print dialog

`src/components/cupping/print-cupping-cards-dialog.tsx`:

- the Descriptive document, its `cvaCopies` radio and the "CVA Form" switcher
  go; the note becomes *"N specialty lot(s) print as SCA Affective cards, one
  per cupper — M cards"*
- roster = `assignedCuppers` + `assignedGuests` props when opened straight
  after assignment, else `session-cuppers` (which now returns guests)
- the QR checkbox (above)
- `Print N Cards` counts the expanded total
- **fails closed**: if `/api/samples/bulk-details` fails, the dialog shows the
  error and disables Print. Today it falls back to the QC page's rows, which
  carry no `methodology`, so a specialty lot would silently print as a
  commodity card — the exact fail-open `cvaSampleIds` was written to stop.

`src/app/samples/qc/page.tsx` changes by a handful of lines: pass `guests`
from `handleCuppersAssigned` to the route and on to the print dialog. The file
is at 2306 lines, past the 2200 ceiling — its split is a separate job.

## Tests

- `src/lib/cupping/cva-cards.test.ts` — expansion order and count, `cupper_key`
  forms, QR payload, QR off ⇒ no `qr_code`, commodity pass-through with guest
  rows, deduplicated ids for the stage advance.
- `src/components/pdf/cva-affective-card.test.tsx` — A4: 9 mixed cards ⇒ 2
  pages, 8 ⇒ 1; A6: one page per card; renders with QR off. Same
  `renderToStream` + page-count pattern as `tin-sleeve-label.test.tsx`.
- `mergeRoster` and `pickRosterSession` unit tests.
- Whole suite + `tsc` before/after counts quoted in the commit.
- Visual: render one A4 sheet and one A6 card with real Inter and look at
  them before calling the face done.

## Deployment order

1. Apply the migration (additive, defaulted — old code is unaffected).
2. Push `main`; Vercel deploys. The new code reads `guest_cuppers`, so the
   column must exist first.

## Out of scope

- The journey adopting the roster session as a shared multi-cupper session —
  that is what delivers calibration and score comparison on specialty lots.
- Recording scores for guests (`cupping_scores.cupper_id` is an FK to
  `profiles`).
- Reading Affective cards back (OCR).
- Refusing specialty samples in `scores/submit` (still open from the handoff).
- Splitting `qc/page.tsx`.
- Deleting `cva-descriptive-card.tsx`.
