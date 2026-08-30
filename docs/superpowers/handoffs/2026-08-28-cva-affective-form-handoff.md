> **Superseded 2026-08-30** by `../specs/2026-08-28-cva-affective-cards-design.md` and
> `../plans/2026-08-28-cva-affective-cards.md` (shipped as `1f9e029..22b24dc`). Two claims below
> were wrong when written: the Descriptive component WAS wired (`3468c4d`, via
> `print-cupping-cards-dialog.tsx`), and specialty lots have had no session at all since
> `72b4e2b`. Kept for the task history.

# Handoff — SCA-104 Affective Form for specialty cupping

**Date:** 2026-08-28
**State:** not started. Everything below is context, not work in progress.
**Prerequisite shipped:** `72b4e2b` (live on prod) — specialty lots no longer land in commodity sessions.

---

## The task

Daniel's words, verbatim:

> the QC page stops printing the commodity cards, and instead, prints a full page
> card similar to the original card, scannable per user (optional) with all sample
> info, per person cupping I think is the best way to do, so no more cards, but the
> full page CVA sheet as per their standards, affective form, page 10,
> Documents/Specialty/AW_SCA-104_Affective-Assessment_Sept2024_Secured.pdf

and, a minute later:

> allowing for guests as well to cup, which then prompts guests, and names

Broken out:

1. The QC page stops printing the commodity thermal card **for specialty lots**.
2. It prints the SCA-104 Affective Form instead.
3. The sheet carries all the sample info.
4. One sheet **per cupper**, not one per sample.
5. Scannable per user — a QR — and that part is **optional**.
6. Guests can cup: the flow prompts for guest names and prints their sheets too.

---

## The single most important thing to know first

**`src/components/pdf/cva-descriptive-card.tsx` already exists — 472 lines — and
nothing imports it.**

It implements the *sibling* form: SCA-103 §8.2 **Descriptive**. It already solves
every structural problem this task has:

- two sample blocks per A4 portrait page
- a QR per block, same WAQC payload as the other cards
- one copy of the whole sample set **per cupper**, with Name pre-filled
- the tracking number printed into the SAMPLE NO. box

Read it before writing a line. The Affective form is its sibling, and should be
built as one — same styling constants (`BORDER`, `BAR_BG`, `INK`), same page
header, same block bar, same QR placement.

Someone built it and never wired it up. Worth asking Daniel whether the
Descriptive sheet should be wired up in the same pass or deliberately left out —
the CVA journey captures descriptors on screen, so the paper Descriptive form may
be genuinely unwanted.

---

## The form itself (SCA-104 §7.2, page 10)

Read the PDF directly — it is in the repo at
`Documents/Specialty/AW_SCA-104_Affective-Assessment_Sept2024_Secured.pdf`, page 10.

Structure, top to bottom:

- **Header** — "SCA Coffee Value Assessment" kicker over a large "Affective Form";
  dotted fill lines for Name / Date / Purpose; SCA logo top-right.
- **IMPRESSION OF QUALITY legend bar**, a single row:
  ① EXTREMELY LOW ② VERY LOW ③ MODERATELY LOW ④ SLIGHTLY LOW
  ⑤ NEITHER HIGH NOR LOW ⑥ SLIGHTLY HIGH ⑦ MODERATELY HIGH
  ⑧ VERY HIGH ⑨ EXTREMELY HIGH
- **Two sample columns**, each headed by a dark `SAMPLE NO.` bar with a white field.
- Per column, six bordered sections, each with 1–9 circles, a `FINAL` pill, and a
  Notes area:
  - **Fragrance** and **Aroma** (two scale rows, one large Notes box)
  - **Flavor** and **Aftertaste** (two scale rows, one large Notes box)
  - **Acidity** (one row, smaller Notes)
  - **Sweetness** (one row, smaller Notes)
  - **Mouthfeel** (one row, smaller Notes)
  - **Overall** (one row, smaller Notes)
- **Footer block** per column: `NON-UNIFORM CUPS ☐☐☐☐☐`, `DEFECTIVE CUPS ☐☐☐☐☐`,
  and `DEFECT (IF ANY): ☐ MOLDY ☐ PHENOLIC ☐ POTATO`.
- **Standard footer line:** "SCA Version 2 (June 2024), ©2024 the Specialty Coffee
  Association. All rights reserved, except this document may be reproduced and
  distributed without modification. Learn more: sca.coffee/value-assessment
  Calculate total score: sca.coffee/cuppingscore"

**On "without modification":** the licence permits reproduction *without
modification*, and the plan adds a QR and sample metadata. The existing
Descriptive component already made exactly this call and documented it as
"Wolthers adaptations". Follow that precedent and document it the same way —
do not silently diverge from it.

---

## Where it plugs in

- **`src/app/samples/qc/page.tsx`** — prints the cards today. Grep found **no**
  `methodology` / `cva` / `isSpecialty` awareness anywhere in it. This is the file
  that has to learn the difference.
- **`src/components/print/print-preview-dialog.tsx`** — the unified print module;
  all seven print surfaces route through it. New sheets belong here, not in a
  bespoke dialog.
- **`src/components/pdf/thermal-cupping-card.tsx`** — the commodity card being
  replaced for specialty lots, and the source of the `ThermalCuppingCardData`
  type the Descriptive card reuses.

**Deciding which lot is specialty:** use `cvaSampleIds(db, sampleIds)` in
`src/lib/cupping-protocol-scope.ts` (added 2026-08-28, `72b4e2b`). Specialty is a
property of the **quality**, never of the sample row — it resolves
`samples.quality_spec_id → client_qualities.template_id →
quality_templates.methodology = 'cva'`. It **fails closed**: it throws on a query
error rather than reporting "no specialty lots", because failing open routes
specialty lots onto commodity paper. Do not soften that.

Today there are 3 CVA templates and 35 commodity ones.

---

## Settle these with Daniel before building

1. **Two samples per page, or one?** The SCA form is 2-up and the Descriptive
   component follows it, but "full page card" may mean he wants one sample filling
   the page. This decides the whole layout — ask first.
2. **Where do guests get prompted?** Presumably in the print dialog, as "add
   cupper" free-text rows alongside the real cupper list. Are guest names stored
   anywhere (a session roster? `cupping_scores.cupper_id` needs a real user id) or
   do they only ever exist as ink on the sheet?
3. **What does "scannable per user (optional)" toggle?** A checkbox in the print
   dialog that adds or omits the QR, presumably. Confirm the payload should be
   sample + cupper, so a scanned sheet attributes itself.
4. **Does anything read these sheets back?** See the open hole below — today the
   OCR path writes *commodity* scores. If these sheets are meant to be scanned
   into the CVA journey, that is a second, larger piece of work.

---

## Related open items (not part of this task, but adjacent)

**`scores/submit` still accepts a specialty sample.** The OCR / handwritten-card
route (`src/app/api/cupping/scores/submit/route.ts`, ~line 69) takes
`card.sample_id` from the request, checks only that the sample exists and is not
soft-deleted, and — when the card carries no `session_id` — inserts a
`handwritten` session and writes a **commodity** score row (`protocol` null)
against it. A specialty lot then holds both a CVA and a commodity score: the
"cupped on both surfaces" state that previously broke score saving, cupper
validation and certificate rendering. Reachable today precisely *because* the QC
page prints commodity cards for specialty lots — so this task removes the trigger,
but not the hole. Agreed fix, not yet done: refuse a specialty sample there with a
per-card error naming the Specialty (CVA) journey.

`scores/save-digital` has the same shape but **no callers anywhere** — dead code.

**Data cleanup Daniel has not run yet** (SQL was handed over, awaiting his paste):

```sql
DELETE FROM cupping_sessions
WHERE id = 'f8cba19f-7ab0-4592-82f8-49c6b0d8a5e8'
  AND session_type <> 'cva'
  AND NOT EXISTS (
    SELECT 1 FROM cupping_scores sc WHERE sc.session_id = cupping_sessions.id
  );
```

That is the stray `regular` session the assignment bug created for SAN-00762/26
(1 sample, 0 scores). **Left alone deliberately:** session
`f376962d-66ef-4b3f-bae3-93bc58d5f3fd` — completed, 7 samples, 14 real scores, and
it contains 032/26, which genuinely was cupped on both surfaces. Deleting it would
orphan real history.

Also outstanding: 3 **soft-deleted** samples sit inside *active* CVA sessions
(leftovers from before the picker gained its `deleted_at` filter), holding those
sessions open.

**Cosmetic, standing-rule violation:** the CVA picker shows SAN-00762/26 by its
internal lab number, because the lot has no `exporter_sample_number` and the label
falls back to `tracking_number`. House rule is never to show internal numbers —
needs a decision on what to show when the reference is missing.

---

## What shipped today (all live on prod, `72b4e2b`)

- `04955f8` — certificate flavour wheel 96pt → 160pt; picked terms moved to a
  full-width band below the cupping block, one line per group. **160 is measured,
  not chosen:** at 176+ a lot filling all four descriptor groups pushes the
  certificate to a second page, and four groups is the heaviest load in
  production. The reasoning is in the `size` prop's comment — re-measure before
  changing it, with real Inter (the vitest font shim serves Noto and cannot judge
  page fit).
- `2851b44` — that wheel centred in the space beside the attributes chart.
- `28c2158` — CVA journey: a decided lot shows its decision and a View-certificate
  link instead of offering Certify; breadcrumbs out of the fullscreen route;
  Certify moves to the next undecided lot and only leaves for `/cupping/cva` when
  every lot is settled.
- `72b4e2b` — the protocol fix described above.
