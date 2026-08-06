# Public certificate page — mobile rebuild (Part 2)

Date: 2026-08-06
Status: approved design, ready for planning

Supersedes nothing. This is the detailed design for **Part 2** of
[`2026-08-05-sleeve-label-and-mobile-certificate-design.md`](2026-08-05-sleeve-label-and-mobile-certificate-design.md),
whose Part 1 shipped on 2026-08-06.

Brief: `docs/prompts/sleeve_qr/waqc-mobile-certificate.md`
Mockup: `docs/prompts/sleeve_qr/waqc-cert-mobile.html` — structure and hierarchy
reference, not a pixel spec.

## Problem

Someone scans the QR on a tin in a warehouse holding the physical sample. They
need one thing fast: **is this lot approved, and if not, why not.**

The page cannot answer the second half at all today. Its verdict comes from
`certificates.is_rejected` — a boolean with no reason attached. It never calls
the compliance engine, so it cannot name a failed criterion. Around that gap it
also buries the verdict under a large wordmark, renders a radar chart that clips
on a phone, colours every cupping score the same olive whether it passed or
failed, repeats cup integrity twice, and omits the lot identity the printed
label already carries.

It also renders wrong numbers. See *Screen sizes* below.

## What Part 1 already settled

Routing and the displayed reference were pulled forward into Part 1 and are
**not in scope here**:

- `src/lib/certificate-slug.ts` — `resolveSampleIdForSlug` (certificate number
  first, tracking number second for tins printed before the switch) and
  `resolvePublicReference` (container nr / exporter sample nr / contract
  fallback / `Reference pending`).
- The internal `SAN-` reference appears nowhere: not in visible text, `alt`
  text, `<title>`, OpenGraph, or the download filename.

Part 2 is purely the visual rebuild plus the compliance work that the verdict
block requires.

## Decisions taken

| Question | Decision |
|---|---|
| Audience | Public, buyer-safe. No unlock token, no internal detail |
| Sample types | All types; contract-number fallback (Part 1) |
| Compliance access | Extract a pure core; the gate delegates to it |
| Checklist rows | Every criterion the template configures |
| Total defects | Always computed `primary + secondary`, never read from storage |
| Screen sizes | Grams → percent, one shared resolver |
| Rail band label | `{min}–{max}`, not `target ± tolerance` |
| Footer | The mockup's version: integrity strip + PDF modal |

## Compliance: pure core, gate delegates

### The problem with the current shape

[`evaluateQualityCompliance`](../../../src/lib/compliance.ts#L72) is 376 lines
that interleave four Supabase queries with the threshold rules for nine
categories. It has **no tests**, and it gates real approvals from
`/api/cupping/finalize` and `/api/samples/[id]/quality-assessment`. It returns
prose (`"Total defects: 16.9 exceeds limit (12.0)"`) and reports only failures,
never passes — so it cannot drive a checklist.

### The split

New `src/lib/compliance-criteria.ts`, pure and unit-testable:

```ts
export interface ComplianceCriterion {
  key: string                                  // 'total_defects', 'screen_15_plus', …
  label: string                                // 'Total defects'
  sublabel?: string                            // '1 primary + 21 secondary · max 21'
  actual: number | string
  operator: '>' | '<' | 'outside' | null
  limit: number | string | null                // null = no threshold → no pass/fail icon
  passed: boolean
}

export function evaluateCompliance(inputs: ComplianceInputs): ComplianceCriterion[]
export function criteriaToViolations(criteria: ComplianceCriterion[]): string[]
```

`ComplianceInputs` is plain data — template parameters, resolved cupping scores,
green bean data, taint/fault counts. No client, no I/O.

`compliance.ts` keeps `evaluateQualityCompliance`'s exact signature and its four
queries. It assembles `ComplianceInputs`, calls the core, and derives
`violations` via `criteriaToViolations`. The page calls the same core with the
data it has already fetched. **One rule set; the page and the approval gate
cannot disagree by construction.**

The rejected alternative was a parallel read-only evaluator just for the page.
It duplicates every threshold rule and the copies drift from the first edit. A
public page showing "passes" over a rejected certificate is the worst bug
available here.

### Verifying a refactor of an untested approval gate

Characterization tests come **first**, before any restructuring:

1. Pin today's `violations` output for input shapes covering all nine
   categories — cupping attributes (array and object template formats, master
   cupper and mean paths), defect intensities, primary/secondary/total counts,
   screens in both the legacy and constraint formats, moisture, quakers,
   taint/fault counts including `zero_tolerance` and the no-tolerance-configured
   default.
2. Extract the core.
3. Assert the derived strings are byte-identical to the pinned output.

The refactor is correct only if those stay green. This is the whole reason the
extraction is worth doing: today the gate cannot be tested at all.

## The defect rule

Three **independent** checks. Total is always the computed sum:

```
primary   ≤ max_primary
secondary ≤ max_secondary
primary + secondary ≤ max_total
```

Worked example: a quality allowing 1 primary, 21 secondary, 21 total, against a
lot with 1 primary and 21 secondary. Primary passes (1 ≤ 1). Secondary passes
(21 ≤ 21). Total is 22, which exceeds 21 — **rejected on total defects alone**.

Consequences:

- `green_bean_data.defects.total` is never read. It is persisted by grading, but
  the computed sum is authoritative. [compliance.ts:287](../../../src/lib/compliance.ts#L287)
  already does this; the page's `defects.total ?? sum` at
  [page.tsx:84](../../../src/app/certificate/[slug]/page.tsx#L84) is the side
  that changes.
- Primary, secondary and total each get **their own checklist row** when the
  template configures that threshold. Folding primary and secondary into a
  sub-line would let the verdict name "Total defects" with no visible evidence
  that primary and secondary passed — the page would appear to contradict
  itself.

```
Against Dunkin spec
  ✓  Primary defects                    max 1                       1
  ✓  Secondary defects                  max 21                     21
  ✕  Total defects      1 primary + 21 secondary · max 21          22
```

A template configuring only `max_total` shows one row, with the composition
still in the sub-line.

## Three resolver divergences

The page and the compliance engine read the same stored fields differently.

### Screen sizes — a live bug

`green_bean_data.screen_sizes` stores **grams**. Confirmed in code, not
inferred: [grading/page.tsx:106](../../../src/app/grading/page.tsx#L106)
documents the field as grams, keeps a separate `screen_sizes_percentages` for
display, and persists only the grams at
[grading/page.tsx:1007](../../../src/app/grading/page.tsx#L1007). The
percentages are never written and never read outside the grading page.

[compliance.ts:293-304](../../../src/lib/compliance.ts#L293-L304) normalises
grams → percent and is correct. Three public surfaces render the raw grams as
though they were already percentages:

- [certificate/[slug]/page.tsx:79](../../../src/app/certificate/[slug]/page.tsx#L79) → `buildScreenSummary`, which reaches the page and the OpenGraph description
- [certificate/[slug]/opengraph-image.tsx:79](../../../src/app/certificate/[slug]/opengraph-image.tsx#L79)
- [api/certificate/[slug]/route.ts:102](../../../src/app/api/certificate/[slug]/route.ts#L102) — the public JSON

A 71g screen currently displays to the public as "71.0%". All three move to the
shared resolver. The JSON's numbers change; that is a fix, not a break.

### Defect count shape

`compliance.ts` reads `defects.primary` / `defects.secondary`; the page reads
`defects.total_primary ?? defects.primary`. Grading persists the first shape;
`certificate-data.ts` uses the second. One resolver reads both.

### Total defects

Covered above. The gate's arithmetic wins; the page adopts it.

## Page structure

Mobile-first, centred column capped at 420px, dark theme only, tokens from the
brief. Full-bleed blocks with hairline rules, not floating cards. Tabular
numerals on every figure.

1. **Header** — sticky, under 44px. Wordmark left at 15px, `Verified
   certificate` right with a green dot.
2. **Verdict** — eyebrow naming the sample type, reference at 26px/700, status
   pill right-aligned. Below it one flex row per **failed** criterion: metric
   name left, `22 > 21 max` right with the actual value red and bold, operator
   and limit muted, tabular numerals so the values align into a column. Red 3px
   left border on the group, then `Everything else within {quality} spec.` On
   approval the failure lines are omitted entirely — no green equivalent, no
   "0 issues found" row.
3. **Lot identity** — two-column grid, full-bleed with hairline rules: exporter,
   quality, quantity, origin, then a full-width row for certification date and
   bag type. Mirrors the printed label so the scanner can confirm the
   certificate belongs to the tin in their hand.
4. **Spec checklist** — `Against {quality} spec`. One row per configured
   criterion: pass/fail circle, label, sub-line with inputs and threshold, value
   right-aligned. Failing values red, passing values **muted, not green** —
   green on every row makes a rejected certificate read as fine. Defect
   intensities group into the Cup integrity row. A criterion the template omits
   produces no row; a criterion with a value but no threshold renders without a
   pass/fail icon rather than guessing a limit.
5. **Detail** — native `<details>`, no JS. Screen distribution collapsed,
   cupping profile open.
6. **Footer** — fixed, the mockup's single-tier version. Four integrity cells
   (taints, faults, clean, uniform) with hairline dividers, then a square PDF
   button opening a modal that previews the certificate with `Save PDF` and
   Share. Scroll padding equal to footer height so the last rail is never
   trapped behind it.

### Screen distribution

Horizontal bars: label / track / percentage. Screens below the spec floor use
the dim olive. Closes with a spec note stating the requirement and this lot's
rolled-up figure.

### Cupping rails

The radar chart is **replaced**. One rail per attribute, seven readable in a
single downward glance — that is the whole point of dropping the radar.

- Scale from the template's `scale.min` / `scale.max`, defaulting 0–5. Both are
  already read at [page.tsx:215-232](../../../src/app/certificate/[slug]/page.tsx#L215-L232).
- Band from `validation_rule.min_value` / `max_value`.
- Labelled `3.0–5.0`. **Not** the mockup's `target 4 ±1`: real ranges are often
  asymmetric and ± notation would misstate them.
- Tick marks the score. Score and tick neutral comfortably inside, amber within
  0.25 of a bound, red outside.
- Scale labels `0 / 2.5 / 5` under the last attribute only.

## Files

```
src/lib/compliance-criteria.ts       + .test.ts   pure rules, characterization + unit
src/lib/certificate-public-data.ts   + .test.ts   defect / taint / screen / attribute resolvers
src/lib/compliance.ts                             fetch → core → violations (signature unchanged)
src/app/certificate/[slug]/page.tsx               fetch + evaluate, server component
src/app/certificate/[slug]/_components/
    verdict.tsx
    lot-identity.tsx
    spec-checklist.tsx
    screen-distribution.tsx
    cupping-rails.tsx
    certificate-footer.tsx                        the only 'use client' — modal + Web Share
```

`certificate-page-client.tsx` (399 lines) is replaced. Moving the defect
resolution, taint/fault consolidation and attribute averaging out of `page.tsx`
into `certificate-public-data.ts` takes that file from 452 lines to roughly 200
and makes the logic testable — it is currently untested inline server code.

## Quality floor

- Responsive to 320px with no horizontal scroll
- Visible keyboard focus on both buttons and both `<summary>` elements
- `prefers-reduced-motion` respected
- Status conveyed by text and icon, never colour alone
- Renders usefully with no cupping data — some lots are graded on physicals
  only. Hide the rail section and the cupping checklist rows rather than showing
  zeros
- The in-progress state (sample not yet certified) keeps a minimal version of
  the same shell

## Out of scope

Routing and the displayed reference (shipped in Part 1), the certificate PDF
layout, the internal QC app, cupping entry screens, the bag sleeve label,
`print-labels`, and QR generation.

## Open items, not blocking the build

- **Thresholds.** The brief flags the mockup's 12.0 defects / 90% screen 15+ as
  placeholders "almost certainly wrong". Confirm the real Dunkin thresholds with
  Gabriel before rollout. Everything resolves from the template at runtime, so
  this is a data check, not a code change.
- **Stored `defects.total`.** Now unused. Worth checking whether any row has a
  stored total that disagrees with `primary + secondary`; a disagreement would
  mean grading wrote something the gate never honoured.
- **Historical data.** `exporter_sample_number` and `container_nr` need to be
  populated for older samples; those fall back to the contract number.
- **Public certificate enumerability.** `resolveSampleIdForSlug` passes the slug
  into `.ilike` without escaping `%`, so `/certificate/BR-%25` matches an
  arbitrary certificate. Pre-existing and not a regression — the old code had
  the identical unescaped `ilike` on `tracking_number` — but it should be fixed
  with an `.eq()`-then-`.ilike()` pair or a `%` escape when enumerability is
  picked up.
