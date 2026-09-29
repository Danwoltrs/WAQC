# Handoff — Sieve-name matching + approve-with-comments check (2026-09-29)

**Resume point:** In a NEW worktree branched from `feat/report-layout-rejection-reasons`, WRITE a failing test in `src/lib/compliance-criteria.test.ts` using the Ahold SAX data below (spec "Screen 18" ≥ 30%, grading grams `{17: 71, 18: 25, Pan: 4}`). Expect Screen 18 read as **25.0%**, not 0.0%. Then make spec sieve names and grading keys match in ONE shared helper, and use it everywhere screens are read (compliance, tolerance, certificate values).

## The work (one paragraph)
Quality templates name sieves "Screen 18" while grading saves grams under "18". The compliance check looks up `screen_sizes["Screen 18"]`, finds nothing, and reads **0%**: every minimum fails, every maximum passes, and the printed actual is wrong. The same wrong reading feeds the approve-with-comments tolerance, so a lot that misses a screen minimum by a few points is sent to "new sample required" instead of being approvable. Found while Daniel checked why Ahold SAX lots R-SAX-011863/864/865 (28/08/2026) were approved and only rejected later by Override Status ("Scr. 18"). This job fixes the sieve matching, checks that approve-with-comments works end to end as Daniel describes it below, and answers why those three lots passed on 28/08.

## How Daniel describes approve-with-comments (his words, 2026-09-29)
> "We worked on a session a long time ago, to allow the cuppers to approve with comments, when the results are up to 5% off from the minimum requirements on screen sizes and defect counts on sorting/grading - not cupping. This then sends an e-mail to wolthers@wolthers.com and to the exporter/seller automatically, with the reasons of approval with comments, and asking them to meet the minimum standards (redo it to meet the requirements), and sends the certificate of approval to buyer at the same time, considering it approved."

**Check each point against what is built. Three of them DIFFER from the code; ask Daniel before changing any of them:**

| Daniel's description | What is built (LIVE since 2026-09-11, `6dba8e9..f5a2490`) | Status |
|---|---|---|
| "up to 5% off" | `SCREEN_TOLERANCE_PP = 5` **percentage points** (30% min → 25% approvable) and `DEFECT_TOLERANCE_EQ = 5` **full-defect equivalents above the max** (max 12 → 17), in `src/lib/tolerance/limits.ts`. Not 5% *of* the limit (30% min → 28.5%). Primary defects are never tolerable. | **Ask:** points or percent of the limit? |
| screens + defects from grading, not cupping | Tolerable: screen minimums, pan/screen maximums, defect maximums. No tolerance on cup, taints, faults, moisture. | Matches. |
| "the cuppers" approve | `POST /api/samples/[id]/approve-with-comments` is gated by `isStaffSampleManager`, not by a cupper role. | **Check** who can press it. |
| e-mail to wolthers@wolthers.com + exporter/seller **automatically** | Seller-only block `buildToleranceBlock` ("Aprovado com observações": actual vs required, gap, request for a new sample) is in the SELLER email. wolthers@wolthers.com is CC'd on every QC email (locked, server-side). **But nothing is sent automatically:** since 2026-06-25 every approval/rejection email waits for the end-of-day batch "Send unsent certificates" (Daniel: "no need to send at any time"; memory `finalize-no-send-screen-no-download`). | **Conflict:** automatic send at approval contradicts the batch decision. Ask. |
| certificate of approval to the buyer at the same time, as Approved | Buyer email and QR page show status Approved with the ISSUED values (adjusted into spec), no comments, no mention of tolerance. Also batch-sent. | Content matches; the timing depends on the answer above. |

The original feature brief is untracked at `docs/prompts/approve-with-comments/waqc-tolerance-approval-and-recipients.md` (reference case: StoneX ME-1121, Screen 18 = 28% vs 30%). The brief wanted tolerances on the template; Daniel later chose one uniform tolerance in code ("no need to add more things to adjust on the quality templates").

## Evidence (Daniel's SQL, 2026-09-29)
All three SAX certificates: spec "Ahold SAX", template v10, last updated **05/06/2026** (the rule predates the lots), `approved_with_comments = false`, grading saved 27/08 around 15:05, certificates issued 28/08 16:42–16:43.

```
template constraints: Pan max 10 · Screen 17 any · Screen 18 min 30
graded grams:  011863 {17: 71, 18: 25, Pan: 4}   011864 same   011865 {17: 74, 18: 23, Pan: 3}
```

Today's code on 011863's data (run 2026-09-29):
```
[["Screen Pan", 4, true], ["Screen 18", 0, false]]   →  "Screen 18: 0.0% is below minimum (30%)"
```
The outcome (rejected) is right by accident; the value (0.0% instead of 25%) is wrong. Pan matches only because both sides call it "Pan".

**Why the lots were APPROVED on 28/08 (unconfirmed):** commit `315dd867` ("lab data resolves through the lab unit", 28/08 11:36 −03) fixed contract siblings being judged against their OWN empty grading, which always passes. The certificates were issued at 16:42, likely before that deploy reached production. Confirm by asking Daniel to run this; a filled `lab_source_sample_id` means they were siblings:
```sql
SELECT id, lab_source_sample_id, tracking_number
FROM samples
WHERE id IN ('3cefad62-7750-4d41-977e-68072c39bf5f',
             'c3692cb1-814b-4516-9562-04dc7ba248c0',
             '48296fe6-8c21-4009-aacf-9ed530db3e77');
```

With correct matching and the current 5-point tolerance: 011863/864 at 25% are exactly 5 points short, so approvable. Watch the edge: the memory says issued screens land 1e-6 inside the limit, and an EXACT 5.0 gap must count as within. 011865 at 23% is 7 points short, so rejected with a new sample required.

## Repo state right now
- **Repo `WAQC`:** branch `feat/report-layout-rejection-reasons`, 5 commits ahead of `main`, **NOT pushed**, not merged. `origin/main` had not moved when this was written.
- Another session may still hold that branch in `/Users/danielwolthers/Documents/GitHub/WAQC`. **Do not switch branches there.** Create a worktree, e.g. `git worktree add ../WAQC-sieves -b fix/sieve-name-matching feat/report-layout-rejection-reasons`, and run Claude in `../WAQC-sieves`.
- Untracked, not yours: `database/check_dunkin_week_2026_09_21.sql`, `docs/prompts/…`, other docs.
- Stashes: none.

| SHA | On the base branch |
|---|---|
| `4e2f35e6` | fix(compliance): one "Screen 16", not "Screen Screen 16". Adds `screenName()` in compliance-criteria.ts; **your helper should absorb it** |
| `3d2f1305` | test: real Dunkin week rejection reasons |
| `fff51822` | period report: named rejection reasons, defects per certificate, volume-weighted supplier rating |
| `1606d3fb` | Rejection Analysis page `/dashboard/metrics/rejections` |
| `a06a3362` | period report: 1000-row read, worst reason per certificate, layout |

Verification at handoff: `npx vitest run` → **225 files / 2,424 tests pass**; `npx tsc --noEmit` clean apart from the pre-existing `use-booking-panel.test.ts` errors (and stale `.next/types` entries while `next dev` runs).

## Locked decisions (do NOT relitigate)
1. Tolerance lives in code, uniform, not on templates (Daniel, 2026-09). Changing "5 points" to "5% of the limit" is Daniel's call; ask, don't assume.
2. **Never widen `evaluateCompliance` to fix a tolerance bug; fix the adjuster** (memory `tolerance-approval-with-comments`). Sieve-name matching is NOT widening: it makes the gate read the right number.
3. Buyer sees Approved + issued values, no comments; seller sees actual vs required + comments. Split enforced at the SQL column list (`fetchIssuedValues` vs `fetchToleranceApproval`).
4. Status stays `'approved'` + `samples.approved_with_comments` boolean. A third enum value would stop the cert-minting trigger and `qc_billing_feed`.
5. Every QC email CCs wolthers@wolthers.com, server-side. Recipients come only from contacts tagged `qc_certificates`.
6. Emails are batch-sent at end of day unless Daniel reverses it (see the table above).
7. Paste SQL; Daniel applies migrations and data fixes. Write a failing test before each fix.

## Codebase anchors
- [compliance-criteria.ts:132](../../../src/lib/compliance-criteria.ts#L132) — `screenName()` (label fix from `4e2f35e6`).
- [compliance-criteria.ts:337](../../../src/lib/compliance-criteria.ts#L337) — legacy template screens: `screenPercentages[size] || 0`.
- [compliance-criteria.ts:374](../../../src/lib/compliance-criteria.ts#L374) — constraint format (block 6b): `screenPercentages[constraint.screen_size] || 0`. **The bug.** `|| 0` also hides "no such sieve".
- [quality-resolvers.ts:49](../../../src/lib/quality-resolvers.ts#L49) — `screenGramsToPercent`: percentages keyed by whatever grading saved ("18").
- [tolerance/evaluate.ts:95](../../../src/lib/tolerance/evaluate.ts#L95) — `evaluateTolerance(criteria)`: reads `c.actual` from the gate's criteria, so it inherits the 0%. `classify` (~line 44) already accepts sizes "digits" or "Screen digits".
- [tolerance/sample-limits.ts:20](../../../src/lib/tolerance/sample-limits.ts#L20) — `toScreenLimits`: limits keyed by the TEMPLATE name ("Screen 18").
- [tolerance/normalize-distribution.ts:39](../../../src/lib/tolerance/normalize-distribution.ts#L39) — `normalizeDistribution`; re-validation `issued[l.screen_size]` (~line 108) compares template names against grading keys: the same mismatch in the adjuster.
- [tolerance/issued-values.ts:62](../../../src/lib/tolerance/issued-values.ts#L62) — `computeIssuedValues`, re-runs the real gate as a safety net.
- [approve-with-comments/route.ts:53](../../../src/app/api/samples/[id]/approve-with-comments/route.ts#L53) — POST; staff gate at line 61.
- `src/lib/approval-notification/tolerance-comment-block.ts` — seller "Aprovado com observações" block; `quality-summary.ts` wires it (`fetchToleranceApproval`).
- `src/app/api/certificates/batch-send/queue/route.ts` (~line 306) — batch send, audience split.
- `src/app/api/certificates/[id]/override/route.ts` — raw update; **never clears `approved_with_comments`** (open gap: a lot re-approved via Override keeps stale issued numbers).
- `src/app/api/cupping/finalize/route.ts:171,307` — `hasGradingData` gate before compliance runs.
- `src/app/grading/page.tsx:1045,1434` — where grading writes/reads `screen_sizes[...]` keys. Find out why some keys are "18" and templates say "Screen 18".

## Gotchas
- vitest fakes accept any column name; a wrong column passes tests and fails live.
- `next build` rejects non-handler exports from `route.ts` (tsc and vitest pass). Keep helpers in `src/lib`.
- Screen keys can be "18", "Screen 18", "Pan", "Peas 10" (the tolerance allowlist names these shapes). Normalize without merging distinct sieves; "Pan" stays Pan.
- Tolerance bugs were mostly seams: float drift, round2 vs raw, adjuster vs gate precedence, preview vs send path. Test the exact 5.0 gap.
- The tolerance preview endpoint has no cupping precondition (UX only: a button that always 409s).
- No browser QA of approve-with-comments has ever been done: approval end to end, pan over max with non-round grams, buyer email vs its attachment, grading-tab race, Portuguese accents through jsonb.
- Stage only your own paths; other sessions commit to this repo. Never bare `git stash`.
- Keep files under ~2,000 lines; tell Daniel if one grows past that.

## Next, in order
1. Failing test (SAX data), then one sieve-name helper used by compliance-criteria (both screen blocks) and the tolerance adjuster; absorb `screenName`.
2. Test the tolerance path on the SAX data: 25% → approvable (exact 5-point gap), 23% → rejected; the ME-1121 reference case (28% vs 30%) still approvable.
3. Close the Override gap: Override Status clears `approved_with_comments` (and the issued values) when it changes status. Failing test first.
4. Put the three questions to Daniel: 5 points vs 5% of the limit; who may approve with comments (cuppers or staff managers); automatic send at approval vs end-of-day batch.
5. Confirm the 28/08 cause with the sibling SQL above.
6. List every template whose sieve names differ from what grading saves, as a read-only SQL query for Daniel, so the blast radius is known.
