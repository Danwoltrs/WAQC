# Approval with comments — tolerance, issued values, seller comments

Date: 2026-09-10
Source prompt: `docs/prompts/approve-with-comments/waqc-tolerance-approval-and-recipients.md`
Scope: **Part 1 only.** Part 2 (recipients from sys) gets its own spec later.

---

## Why

A sample that misses a screen minimum by a small margin gets approved anyway, but
QC then writes a manual email explaining the shortfall to the seller — and the
buyer sometimes receives that same email with the shortfall in it. One decision in
WAQC should produce a clean buyer certificate and a seller message that states the
gap and the required action.

Reference case (Anderson, 10/09): StoneX, sample ME-1121, Wolthers 41745/26.
Screen 18 below its 30% minimum. Type OK, cup OK. Approved; seller asked to improve
screen 18 and send an additional sample.

---

## What the repo already determined

These findings come from reading the code and they override the corresponding
assumptions in the source prompt.

1. **Screens are stored as grams.** `green_bean_data.screen_sizes` holds grams per
   screen (`src/app/grading/page.tsx:106`); every percentage is derived as
   `grams / Σgrams × 100` (`screenGramsToPercent`, `src/lib/quality-resolvers.ts:49`).
   The distribution therefore always totals exactly 100%. The prompt's
   `28 + 71 + 4 = 103` cannot be literal stored values, and the prompt's
   "issued = 30 / 69 / 4" is not representable. The invariant we hold instead is the
   prompt's real intent: **the issued distribution totals the same as the raw one.**
2. **Pan is an ordinary entry** in that same distribution (`screen_size: 'Pan'`), so
   it shares the denominator and needs no special storage.
3. **Type is not derived from defects.** `NY 2/3` arrives as contract free text into
   `quality_name` and prints via `buildQualityLine`. The prompt's conditional
   ("if type is graded independently, leave it alone") applies — this sub-feature is
   dropped.
4. **Defect limits are in weighted equivalents,** not raw counts: `count × weight`,
   with secondary weights of 0.1 / 0.2 / 0.33 / 0.34 / 0.5
   (`src/types/defect-configuration.ts`). Reducing integer counts moves the total in
   discrete weight-sized steps, so landing exactly on a limit is frequently
   impossible.
5. **A new `sample_status` enum value would break certification and billing.**
   `status = 'approved'` gates the certificate-minting trigger
   (`database/migrations/20260605000001_gapfree_certificate_numbering.sql:174`) and
   `qc_billing_feed`'s `WHERE s.status = 'approved'`, on top of 71 TypeScript files.
   A sample set to `approved_with_comments` would receive no certificate number.
6. **The public QR page does not share the certificate data builder.** It fetches and
   derives independently (`src/app/certificate/[...path]/page.tsx:327`), which is why
   an earlier cupping-score override reached the PDF only. Buyer/QR parity is real
   work, not a freebie.
7. **A seller-only comment channel already exists.** `quality-summary.ts` carries a
   `sellerComment` field rendered exclusively in seller emails, inside the end-of-day
   batch.
8. **Migrations live in `database/migrations/`,** not `supabase/migrations/` as the
   prompt states.

---

## Decisions

| Decision | Choice |
|---|---|
| Scope | Part 1 only |
| Status model | `status` stays `'approved'`; a separate flag carries "with comments" |
| Tolerance config | One uniform constant pair; **no** per-template columns |
| Screen / pan tolerance | 5 percentage points |
| Defect tolerance | 5.0 full-defect equivalents above the max |
| Inexact adjustment | Land on the nearest achievable value that **meets** the limit |
| Seller delivery | Existing seller batch email, via the `sellerComment` path |
| Comment language | Portuguese prefill, always, editable |

Above tolerance → normal rejection, no banner. At or below tolerance → the lab user
chooses: approve with comments, or reject.

---

## Tolerance evaluation

```ts
// src/lib/tolerance/limits.ts
export const SCREEN_TOLERANCE_PP = 5   // percentage points, screens + pan, min and max
export const DEFECT_TOLERANCE_EQ  = 5  // full-defect equivalents above the max
```

Tolerance is computed **from the existing compliance output, never re-derived.**
`evaluateCompliance()` already returns every criterion with `key`, `actual`,
`operator`, `limit` and `passed`. A pure function reads only the failures:

```ts
evaluateTolerance(criteria: ComplianceCriterion[]): ToleranceAssessment
```

The banner is offered only when **every** failure is a tolerable metric and each sits
within its tolerance.

**Tolerable:** screen minimum and maximum (pan included), `secondary_defects`,
`total_defects`.

**Never tolerable — banner stays hidden:** cupping attributes, moisture, water
activity, taints, faults, quakers, `exact` screen constraints, and `primary_defects`
(primary defects are never reduced, so there is nothing to issue).

The tolerable set is an **allowlist keyed on criterion key** (`screen_*_min`,
`screen_*_max`, the legacy `screen_<size>`, `secondary_defects`, `total_defects`).
Anything not on it — including any criterion added to `compliance-criteria.ts` in
future — is non-tolerable by default, so a new quality check can never silently
become tolerance-approvable.

Reusing the gate's own criteria is what keeps the banner from ever disagreeing with
the approval decision.

---

## Adjustment algorithms

Both pure, both in `src/lib/tolerance/`, both unit tested including every refusal.
Each returns `{ ok: true, issued }` or `{ ok: false, reason }` — never a half-fix.

### `normalizeDistribution(actualPercents, constraints)`

Screens are ordered largest → smallest with pan last, using the canonical order in
`src/types/screen-size-constraints.ts`. Then:

1. **Pan over its maximum.** excess = actual − max. Push it into the smallest non-pan
   screen, then upward. Never lift a receiving screen past its own maximum.
2. **Each screen short of its minimum.** gap = min − actual. Take from the next
   smaller screen, then continue downward, pan last. Never pull a donor below its own
   minimum, never below 0.
3. **Re-validate every limit** on the result.

Percentages are continuous, so screens normally land exactly on the limit. Where
donor capacity is exhausted before the minimum is met, the function refuses.

### `normalizeDefects(counts, defectConfigs, thresholds)`

Operates on raw per-category counts in `green_bean_data.defects.counts` plus the
template's weights.

- Required reduction is computed against **every non-primary limit at once**
  (`max_secondary`, `max_total`); the largest requirement wins.
- Beans are removed one at a time from whichever **secondary** category currently
  contributes the most weighted equivalents, recomputing the ordering after each
  removal, until the total meets every limit.
- Primary counts are never touched. A lot whose primary limit is the failing one
  never reaches here (it is non-tolerable).
- Stops at the first achievable total that **meets** the limit rather than requiring
  an exact landing. With 0.2-weight beans, max 12 lands on exactly 12.0; with
  0.34-weight beans it lands on 11.76 — better than required, never worse.
- Refuses when secondary categories are exhausted with the total still over, or when
  the lot has no per-category counts stored (older assessments). Fails closed.

The issued snapshot carries the reduced per-category counts **and** the recomputed
primary / secondary / total equivalents together, so the certificate's category rows
and its totals reconcile exactly.

### The safety net

Issued values are not trusted because the algorithm produced them. They are re-fed
through the existing `evaluateCompliance()` with the issued distribution and defects
substituted for the raw ones. A single remaining violation refuses the decision. The
same function that judges raw values proves the issued ones, so a buyer certificate
cannot print numbers the gate would have rejected.

### Worked example — ME-1121, real normalized distribution

```
raw     Scr 18  27.2%   (min 30)   Scr 15  68.9%   Pan  3.9%   Σ 100.0
issued  Scr 18  30.0%   ✓          Scr 15  66.1%   Pan  3.9%   Σ 100.0

seller sees:  Screen 18 — 27.2% vs min 30% (−2.8), improve to at least 30%
buyer sees:   30.0%, in spec, no comments
```

---

## Data model

One migration in `database/migrations/`. **Written, not run** — Daniel applies
migrations manually.

**`samples.approved_with_comments boolean not null default false`** — set group-wide
alongside `status = 'approved'`. Because the status stays `'approved'`, the
certificate trigger mints, `qc_billing_feed` bills, reports count it and the portal
shows it, all untouched.

**`sample_tolerance_approvals`** — one append-only row per decision:

| Column | Purpose |
|---|---|
| `sample_id` | the **lab-source** sample |
| `decided_by`, `decided_at` | audit |
| `metrics jsonb` | per metric: actual, limit, gap, tolerance applied |
| `issued_values jsonb` | issued screen percentages, issued defect counts and totals |
| `comments jsonb` | the per-item seller comment lines as confirmed |
| `request_additional_sample boolean` | the checkbox |

This row **is** the audit record. Raw `green_bean_data` is never modified.

Keying on the lab-source sample matters: a lot spanning N contracts is N `samples`
rows sharing one graded lab unit, so the decision is stored once and read through
`resolveLabSourceId`, exactly as `compliance.ts` already does. Every sibling
certificate then shows identical issued values, while the `approved_with_comments`
flag is written across the whole group.

RLS follows the existing sample-scoped pattern; the write path is service-role and
staff-gated.

---

## Consumption

### Render parity

Three places derive screen percentages independently today —
`certificate-data.ts:717` hands over raw grams, `quality-certificate.tsx:85` converts
them, and the public page converts them again at `page.tsx:327`. That divergence is
why the earlier cupping-score override reached the PDF only.

One resolver fixes it:

```ts
resolveIssuedGreenBean(greenBean, toleranceApproval)
  → { screenPercentages, defectCounts, defectTotals, isIssued }
```

`certificate-data.ts` fetches the tolerance row (through `resolveLabSourceId`) and
returns **resolved percentages** rather than grams. The PDF component and the public
page both consume those instead of deriving their own.

### Audience

For the pass/fail marks — the red `(min 30%)` annotations, and the public page's
checklist and verdict — `evaluateSampleCompliance` gains an explicit
`values: 'actual' | 'issued'` argument, defaulting to `'actual'` so no existing
caller changes behaviour.

- **Buyer-facing** (public QR page, buyer PDF, portal) pass `'issued'` → all green,
  no comments, no mention of tolerance.
- **Internal** (grading, `/certificates`) keep `'actual'` → real values, with the
  issued figures on a secondary line.

Audience is chosen at the call site, once, over the same underlying data, so
"the tin and the PDF agree" holds by construction rather than by discipline.

### Write path

`POST /api/samples/[id]/approve-with-comments`, staff-gated with
`isStaffSampleManager`.

It **recomputes the tolerance assessment and the issued values server-side** from
stored data and never trusts client-supplied numbers. It writes the audit row against
the lab-source sample and sets `status='approved'` plus `approved_with_comments`
across the group through the existing group-decision path.

Certificate minting, the sys write-back and the billing feed therefore need no
changes — this is an ordinary approval that happens to carry a record.

---

## UI

`src/app/grading/page.tsx` is already 1722 lines, so this lands in new components
under `src/components/grading/`, with only wiring added to the page:

- **`tolerance-banner.tsx`** — amber. A miss confined to one quadrant renders inside
  that quadrant; misses spanning both render one combined banner above the pair.

  > 3 items within tolerance:
  > Screen 18 — 27.2% vs min 30% (−2.8) · Pan — 7% vs max 5% (+2) · Defects — 14 vs max 12 (+2)
  > **[Approve with comments]**

- **`tolerance-confirm-dialog.tsx`** — one table per affected quadrant
  (metric · actual · issued · change), the prefilled editable Portuguese comment
  lines, and `Request additional sample` ticked by default.

Prefilled lines follow the source prompt:
`Melhorar peneira 18 para no mínimo 30%.` ·
`Reduzir fundo para no máximo 5%.` ·
`Reduzir defeitos para no máximo 12.`

Rejecting stays exactly where it is — the banner offers the choice, it does not force
it.

---

## Seller email

The comments ride the end-of-day batch already shipped. A new small module builds the
structured block — per item: metric, actual, required, gap, action — plus the
additional-sample line when ticked. `quality-summary.ts` calls it rather than growing
a 36 KB file further.

The buyer's email and PDF are untouched: issued values, no comments, no mention of
tolerance.

---

## Explicitly out of scope

- Per-template tolerance columns (`screen_tolerance_pp`, `pan_tolerance_pp`,
  `defect_tolerance`) — replaced by one uniform constant pair.
- The `approved_with_comments` enum value.
- All of Part 2: recipient subscriptions, per-event filtering, cross-audience
  duplicate detection, internal trader/logistics CC, the sys contract-page display.
- Type derived from defect count — WAQC takes type from contract text.

---

## Testing

**Pure unit tests** for `evaluateTolerance`, `normalizeDistribution` and
`normalizeDefects`, including every refusal path.

**Acceptance cases**, named:

- ME-1121: banner appears; issued screen 18 = 30.0%; raw stays 27.2%; total unchanged.
- Pan 7% vs max 5% → issued pan 5%, the smallest screen above receives the excess.
- Screen short + pan over on the same sample → one banner, one confirm, one pass.
- Defects 14 vs max 12 → issued meets 12, reduced from the largest secondary
  categories, primary untouched, categories reconcile to the printed total.
- Defect limit set on primary defects → no banner.
- Screen 18 at 24% (gap 6) → no banner, rejection flow.
- Cupping or moisture also failing → no banner.
- Lot with no per-category defect counts → refusal, no banner.

**Parity test:** the PDF and the public page resolve identical issued percentages from
the same helper.
