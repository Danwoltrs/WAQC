# Tin sleeve label + mobile certificate page — design

Date: 2026-08-05
Status: approved design, ready for planning

## Problem

Two halves of one journey. A tin in the warehouse carries a printed sleeve label
with a QR code; someone scans it and lands on `qc.wolthers.com`. Both ends are
wrong today.

**The label** ([tin-sleeve-label.tsx](../../../src/components/pdf/tin-sleeve-label.tsx))
leads with the internal `SAN-XXXXX/YY` reference, prints the client quality name
and the template name back to back (`Dunkin - Dunkin`), and centres a narrow
content block on a full-width strip. It also omits the fields the lab actually
reads off a tin — container number, roaster, the counterparties' own references.

**The scan destination** never really opens. The QR encodes a multi-line *text*
blob (tracking number, defects, screen split, URL on the last line) built by
[`buildCertificateQRText`](../../../src/lib/qr-code.ts), so phones show text
rather than navigating. And when the page is reached, it buries the verdict: a
large wordmark, a status badge with no reason attached, a radar chart that clips
on a phone, olive on every cupping score whether it passed or failed, and the
cup integrity block twice.

## Decisions taken

| Question | Decision |
|---|---|
| Label layout | Follow `docs/prompts/sleeve_qr/waqc-sleeve-lines.html` |
| Internal reference | `SAN-` appears nowhere — not on the label, not on the page, not in the URL |
| Sheet | 165mm × 40mm labels, **5 per page**, A4 landscape, no page margin |
| 2.5cm size option | Kept, compressed |
| Foot date | Certification date |
| Headline fallback | Certificate number |
| QR payload | URL only |
| Route key | Certificate number |
| Page audience | Public — anyone who scans. No internal detail, no unlock token |
| Sample types on the page | All types, with contract-number fallback |
| Page footer | The mockup's version (integrity strip + PDF modal) |
| Compliance logic | Restructured in place, one source of truth |

## Part 1 — Tin sleeve label

### Layout

Three columns: wordmark `30mm`, QR `27mm`, body `1fr`. Label `165mm × 40mm`,
padding `3mm 4mm 3mm 3mm`, gap `4mm`.

```
              ┌────┐   HASU 155.201-6
  wolthers    │ QR │   Seller: OFI | Client: OFI (P-8037)
  ASSOCIATES  └────┘   Cert.: BR-036991/JUL/26 | Roaster: Mother Parker's
                       ─────────────────────────────────────────────────
                       DDQ | 333 bags in 60 kg jute bags | 20.0 MT | 29/Jul/2026
```

Lines run until they end. No cells, no grid — a long exporter name pushes the
rest of its line along and truncates at the label edge rather than breaking a
column.

### Fields

| Slot | Source | Rule |
|---|---|---|
| headline | SS → `samples.container_nr`; PSS → `samples.exporter_sample_number` | falls back to the certificate number; when it does, the `Cert.:` field omits itself so the number never prints twice |
| `Seller:` | seller/exporter company name | `(exporter_contract_nr)` in parentheses, muted, only when present |
| `Client:` | QC client company (`samples.client_id`) | `(buyer_contract_nr)` in parentheses, muted, only when present |
| `Cert.:` | `certificates.certificate_number` | certified month inserted before the year: `BR-036991/26` → `BR-036991/JUL/26`. With sub-contracts, every certificate number comma-joined — see below |
| `Roaster:` | roaster company name | **entire field omitted** when absent — never an empty label |
| foot | quality; `bag_count` × `bag_weight_kg` × `bag_type`; `bags_quantity_mt`; `certificates.created_at` | quality is the client's `custom_name` when set, otherwise the template name — **never both**. Quality bold, quantity muted with bold numerals |

Buyer/importer name and `wolthers_contract_nr` do not appear. `Dunkin - Dunkin`
cannot recur because only one quality string is printed: the client's custom
name when set, otherwise the template name.

### Printing is gated on certification

The certificate number is minted at certification
([`20260605000001_gapfree_certificate_numbering.sql`](../../../database/migrations/20260605000001_gapfree_certificate_numbering.sql)),
so a label cannot be produced before then. The Tin Label action is disabled for
samples not in `certified` or `rejected`, with the reason shown. In a bulk
selection, uncertified samples are skipped and reported by count rather than
printed blank.

This is a real workflow change: tins can no longer be labelled on arrival. It is
accepted deliberately — these are the archive tins.

### The 2.5cm variant

Kept, compressed:

- QR shrinks 27mm → ~18mm
- Body fonts 8.5pt → ~6.5pt, headline 15px → ~11px
- `Seller:` / `Client:` merge onto the `Cert.:` line

If that proves illegible on a real printer, dropping the option entirely is the
fallback — the 40mm label is the one that matters.

### Sub-contracts

One label, for the mother sample only. Sub-contracts do not get their own tins.

The `Cert.:` field comma-joins every certificate number belonging to the sample —
the mother's plus each sub-contract's, in `sort_order`. This mirrors what the
label does today with tracking numbers.

The line is allowed to wrap to a second line before truncating, since a sample
with several sub-contracts otherwise loses numbers to the ellipsis. Everything
else on the label stays the mother's: the headline is the mother's container or
exporter sample number, and the foot quantity is the mother plus sub-contract
total, as it is today.

The per-sub-contract columns on `sample_contracts` (`container_nr`,
`exporter_sample_number`, `buyer_contract_nr`, bag counts) are therefore not read
by the label. Only the certificate numbers and the quantity roll-up are.

### QR payload

A new `buildCertificatePageUrl(certificateNumber)` in
[qr-code.ts](../../../src/lib/qr-code.ts) returns
`https://qc.wolthers.com/certificate/<slug>` and nothing else. Shorter payload,
lower QR density, better scanning at 27mm — and it actually navigates.

`buildCertificateQRText` stays as-is. Four other callers use it (bag sleeves ×2,
`print-labels`, and the single-sample bag route) and are out of scope. Only
`print-tin-sleeves` and `[id]/print-tin-sleeve` switch over.

### react-pdf constraints

`@react-pdf/renderer` has no CSS grid and no reliable `text-overflow`. The three
columns become fixed-width flex children; single-line truncation uses `maxLines`
plus `textOverflow: 'ellipsis'`. Rendering will not be pixel-identical to the
browser mockup — the mockup is a structure and hierarchy reference, not a pixel
spec.

## Part 2 — Mobile certificate page

Reference mockup: `docs/prompts/sleeve_qr/waqc-cert-mobile.html`.
Written brief: `docs/prompts/sleeve_qr/waqc-mobile-certificate.md`.

Mobile-first, centred column capped at 420px. No separate wide layout. Dark
theme only, using the brief's tokens.

### Routing and identity

The route stays `/certificate/[slug]`. Resolution order:

1. `certificates.certificate_number` matching the slug — the new path
2. `samples.tracking_number` matching the slug — legacy, keeps tins already in
   the field working

Residual: tins printed between the numbering split (2026-06-05) and this change
carry `SAN-` URLs and will keep resolving through path 2, so `SAN-` stays in the
address bar for those specific tins. Nothing new is minted that way.

`certificate_number` is `TEXT UNIQUE NOT NULL`
([001_initial_schema.sql:205](../../../database/migrations/001_initial_schema.sql#L205)),
so it is a safe key. No new column, no new route.

Displayed reference, by sample type:

| Type | Display | Eyebrow |
|---|---|---|
| PSS | `exporter_sample_number` | `PSS · Exporter sample` |
| SS | `container_nr` | `SS · Container` |
| any other | `buyer_contract_nr` → `wolthers_contract_nr` | type name |
| nothing resolves | `Reference pending`, logged | — |

`SAN-` must not appear in visible text, `alt` text, the `<title>`, the OpenGraph
description, the OG image, or the download filename. The download filename
follows the displayed reference.

### Page structure

1. **Header** — sticky, under 44px. Wordmark left at 15px, `Verified certificate`
   right with a green dot.
2. **Verdict** — eyebrow, reference at 26px/700, status pill right-aligned.
   Below, one flex row per failed criterion: metric name left, `16.9 > 12.0 max`
   right with the actual value red and bold, operator and limit muted, tabular
   numerals so the values align into a column. Red 3px left border on the group,
   then `Everything else within {quality} spec.` On approval the failure lines
   are omitted entirely — no green equivalent, no "0 issues found" row.
3. **Lot identity** — two-column grid, full-bleed with hairline rules: exporter,
   quality, quantity, origin, then a full-width row for certification date and
   bag type. Mirrors the printed label so the scanner can confirm the
   certificate belongs to the tin in their hand.
4. **Spec checklist** — `Against {quality} spec`. One row per criterion:
   pass/fail circle, label, sub-line with inputs and threshold, value
   right-aligned. Failing values red, passing values **muted, not green** —
   green on every row makes a rejected certificate read as fine. Rows are driven
   by the quality template; a criterion the template omits produces no row, and
   a criterion with no threshold renders its value with no pass/fail icon rather
   than guessing a limit.
5. **Detail** — native `<details>`, no JS. Screen distribution collapsed,
   cupping profile open.
   - *Screens*: horizontal bars, label / track / percentage; screens below the
     spec floor use the dim olive; closes with a spec note stating the
     requirement and this lot's rolled-up figure.
   - *Cupping*: the radar chart is **replaced**. One 0–5 rail per attribute with
     an olive band for the target window and a tick for the score. Score and
     tick neutral inside, amber within 0.25 of a bound, red outside. Scale
     labels under the last attribute only. Seven attributes readable in one
     downward glance — that is the whole point of dropping the radar.
6. **Footer** — fixed, the mockup's single-tier version. Four integrity cells
   (taints, faults, clean, uniform) with hairline dividers, then a square PDF
   button. Tapping it opens a modal previewing the certificate with `Save PDF`
   and Share (Web Share API, falling back to copy link). Scroll padding equal to
   footer height so the last rail is never trapped behind it.

### Compliance: one source of truth

[`evaluateQualityCompliance`](../../../src/lib/compliance.ts) already checks
every criterion the checklist needs — cupping attributes, defect intensities,
primary/secondary/total defect counts, screen distribution in both the legacy
and constraint formats, moisture, quakers, taint/fault counts. But it returns
prose (`"Total defects: 16.9 exceeds limit (12.0)"`) and reports only failures,
never passes.

**Restructure it in place.** Build a structured list first:

```ts
interface ComplianceCriterion {
  key: string           // 'total_defects', 'screen_15_plus', …
  label: string         // 'Total defects'
  sublabel?: string     // '3 primary + 13.9 secondary · max 12.0'
  actual: number | string
  operator: '>' | '<' | 'outside'
  limit: number | string | null   // null = no threshold, render without an icon
  passed: boolean
}
```

…then derive the existing `violations: string[]` from it.

The alternative — a parallel read-only function just for the page — was
rejected. It duplicates every threshold rule, and the copies drift from the
first edit onward. A public page that shows "passes" over a rejected certificate
is the worst bug available here; the approval gate and the page must read the
same thing by construction. The derived strings can be asserted byte-identical
to today's output, which makes the refactor verifiable.

### Two inconsistencies to fix while in there

- **Screen sizes, grams vs percent.** `compliance.ts:294` normalises
  `green_bean_data.screen_sizes` from grams to percentages;
  `certificate-page-client.tsx:256` renders the same field as percentages
  directly. Both are only correct if stored values already sum to 100. Verify
  against real rows first, then make one resolver authoritative.
- **Defect counts.** `compliance.ts` reads `defects.primary` / `defects.secondary`;
  the page reads `defects.total_primary ?? defects.primary`. One resolver for
  both.

### File structure

`certificate-page-client.tsx` is 399 lines and would roughly double with rails,
checklist and modal. Split into `src/app/certificate/[slug]/_components/`:
verdict, lot identity, spec checklist, screen distribution, cupping rails,
footer, certificate modal. Data fetching and compliance evaluation stay server-side
in `page.tsx`; only the modal and Share button need `'use client'`.

### Quality floor

- Responsive to 320px with no horizontal scroll
- Visible keyboard focus on both buttons and both `<summary>` elements
- `prefers-reduced-motion` respected
- Status conveyed by text and icon, never colour alone
- Renders usefully with no cupping data — some lots are graded on physicals only.
  Hide the cupping rows and the rail section rather than showing zeros.

## Sequencing

Part 1 and Part 2 ship independently and in that order.

**Correction, made during Part 1's implementation.** This section originally
claimed Part 1 was self-contained because "a scan opens the *existing*
certificate page, which is worse-looking but correct." That was wrong. The
existing page resolved its slug against `samples.tracking_number` only, so once
the QR encoded a certificate number, every scan of every printable label hit the
not-found card. Since migration `20260605000001` every sample has
`split_numbering = true`, so the two numbers never coincide.

The resolver — and the displayed-reference rule that has to accompany it, or the
`SAN-` leak merely moves from the label to the page — were therefore pulled
forward into Part 1. What shipped:

- `src/lib/certificate-slug.ts` — `resolveSampleIdForSlug` (certificate number
  first, tracking number second, for tins printed before the switch) and
  `resolvePublicReference` (container nr / exporter sample nr / contract
  fallback / `Reference pending`).
- All four slug consumers rewired: the page, `api/certificate/[slug]`,
  `lib/certificate-pdf.ts`, `opengraph-image.tsx`.
- The public JSON response now returns `public_reference` instead of
  `tracking_number`.

**Part 2 therefore no longer owns routing or the displayed reference.** It is now
purely the visual rebuild: verdict block, spec checklist, cupping rails replacing
the radar, and the footer modal.

## Out of scope

The certificate PDF layout, the internal cupping flow, the bag sleeve label,
`print-labels`, and the internal QC app.

## Open items, not blocking the build

- **Thresholds.** The brief flags the mockup's 12.0 defects / 90% screen 15+ as
  placeholders that are "almost certainly wrong". Confirm the real Dunkin
  thresholds with Gabriel before rollout. Everything resolves from the template
  at runtime, so this is a data check, not a code change.
- **Historical data.** `exporter_sample_number` and `container_nr` need to be
  populated for older samples, which may only carry the internal reference.
  Check coverage before rolling out; those samples will fall back to the
  contract number.
- **Public certificate enumerability.** Keying the route on the certificate
  number removes the `SAN-` leak but the URL is still guessable. Pre-existing,
  unchanged by this work. Sharpened during Part 1: `resolveSampleIdForSlug`
  passes the slug into `.ilike` without escaping `%`, so `/certificate/BR-%25`
  matches an arbitrary certificate. The pre-existing code had the identical
  unescaped `ilike` on `tracking_number`, so this is not a regression — but when
  the enumerability item is picked up, fix it with an `.eq()`-then-`.ilike()`
  pair or a `%` escape.

- **Portal PDF: split authorization and resolution.**
  `api/portal/certificate/[slug]/pdf/route.ts` gates ownership by resolving the
  slug against `tracking_number`, then `buildCertificatePdfResponse`
  independently re-resolves the same slug certificate-number-first. Today they
  always agree — post-split tracking numbers carry a lab prefix (`SAN-`) and
  certificate numbers a client/quality prefix, so a collision is practically
  impossible — but nothing enforces it. Pass the gate's resolved `sampleId` into
  the helper to remove the class.

- **Deferred minors from the label work.** The `buildSleeveLabelFields`
  call-site mapping is near-duplicated across the two tin routes; a shared
  `sampleRowToSleeveLabelSource` would remove it. The single-sample route
  `[id]/print-tin-sleeve` has no callers anywhere in `src/` — deleting it would
  remove that duplication and the drift risk together. Its download filename is
  `tin-sleeve-<uuid>.pdf` where the certificate number would be friendlier.

- **A weak test assertion.** The sub-contract roll-up test in
  `sleeve-label-data.test.ts` uses a total (`8 + 6 + 6 = 20.0 MT`) that
  coincides with the bag-derived figure (333 × 60 kg = 19.98 → 20.0), so it
  catches a mother-only regression but would also pass if `quantityMt` were
  ignored entirely. Pick a total that differs from the derived value.
