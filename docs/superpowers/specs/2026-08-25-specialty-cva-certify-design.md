# Certifying a specialty lot: a CVA finalize route over a shared pipeline

**Date:** 2026-08-25
**Status:** Approved, ready for implementation planning

## Problem

A specialty (CVA) lot cannot be certified. The journey at `/cupping/cva/[ref]` runs Roast → 8 sections → Score summary and then stops; `ScoreSummary.tsx` says so in the UI: *"The full Coffee Profile (flavor path, AI highlights, whiskey-style label, certificate) arrives in Phase 5."* There is no approve/reject, no `/api/cupping/finalize` call, and no certificate mint on the specialty surface.

The workaround — cupping the lot a second time on the commodity table and finalizing there — was itself broken until `5c043ed`, because a sample living in both a commodity and a CVA session bound every commodity-side lookup to the CVA session.

Three further gaps turned up while scoping this:

1. **The pass mark is decorative.** `quality_templates.cva_min_score` (84 on the Blaser template) drives the journey's tab colour and nothing else. No server-side rule reads it.
2. **Cupping finalize alone never mints a certificate.** With no green-bean grading data the route sets `decision = 'pending'` and parks the lot in `review` (`finalize/route.ts:201-205`). Certification needs both halves.
3. **The certificate would print nothing for the cup.** `certificate-data.ts` builds its attribute rail from commodity score rows; a specialty lot has none, and as of `5c043ed` CVA rows are explicitly excluded from that read.

## What already exists

| Piece | Location | Note |
|---|---|---|
| CVA journey | `src/components/cupping/cva/CvaJourney.tsx` | Roast → 8 sections → Score. Autosaves per sample, tabs like the commodity screen. |
| CVA session + score storage | `cupping_sessions.session_type='cva'`, `cupping_scores.protocol='cva'` | The row's `scores` holds the whole `CvaAssessment`; `cva_score` holds the verified 0–100 number. |
| Server-side scoring | `computeAssessmentScore` in `src/lib/cva/scoring.ts` | `PUT /api/cupping/cva/[id]` already recomputes and never trusts the client's number. |
| Pass mark | `quality_templates.cva_min_score`, `requires_descriptors` | Surfaced to the journey via `GET /api/cupping/cva/[id]`. |
| Commodity finalize | `POST /api/cupping/finalize` | 747 lines. Decision, cup integrity, stage transitions, sys write-back, certificate mint, session close, audit, PDF invalidation. **No tests.** |
| Protocol scoping | `src/lib/cupping-protocol-scope.ts` | `excludeCvaSessions` / `excludeCvaScores` / `isCvaScoreRow`, added in `5c043ed`. |
| Certificate override | `PATCH /api/certificates/[id]/override` | Requires a comment, flips `is_rejected`, updates the sample, invalidates the PDF, writes back to sys. Needs an existing certificate. |
| Cert editor CVA awareness | `use-cert-editor.ts` | Already carries `isCVA`, `cvaMinScore`, `cvaScore`. The public page and PDF have none. |

## Scope

In scope: a specialty finalize route, the shared pipeline extracted beneath it, the Certify step in the CVA journey, the CVA branch of the certificate render, and one migration.

Out of scope: the Phase 5 Coffee Profile (flavor path, AI highlights, whiskey-style label), printing flavor-wheel descriptors on the certificate, the partner portal, and any change to how commodity lots are decided.

---

## Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | Who makes the approve/reject call for a specialty lot? | **Automatic on `cva_min_score`, with an explicit recorded override.** |
| 2 | Does a specialty lot still have to pass green-bean grading? | **Yes — the same two-part gate as commodity.** Cup *and* green bean. |
| 3 | What does the certificate assert? | **The 8 CVA section impressions as the attribute rail and spider, with the 0–100 score leading.** No forked layout, no descriptors yet. |
| 4 | How does CVA plug into the pipeline? | **A parallel `POST /api/cupping/cva/finalize`** — with the non-protocol-specific phases extracted into shared helpers both routes call, so the spine cannot drift. |
| 5 | Where does the override live? | **Both** — at certify time in the journey (the cup call), and the existing `/api/certificates/[id]/override` for post-certificate corrections. |

Decision 4 was taken against a recommendation to make CVA a `ComplianceCriterion` instead. The shared-helper extraction is the mitigation: the separate route is real, but the certificate mint, stage transitions, sys write-back and session close exist once.

---

## Architecture

### One spine, two protocol heads

`finalize/route.ts` is 747 lines, of which roughly a third is protocol-specific:

| Phase | Protocol-specific? | Destination |
|---|---|---|
| Auth, session load, sample-in-session check | no | `assertCanFinalize` |
| Permission + minimum-cupper gate | no | `assertCanFinalize` |
| **Decide** (compliance / pass mark / override) | **yes** | stays in each route |
| **Cup integrity** (clean/uniform) | **yes** | stays in each route |
| Stage transitions (analysis → review → certified/rejected) | no | `applyDecision` |
| Seller comment, sys write-back | no | `applyDecision` |
| Certificate mint (mother + sub-contracts, validity window) | no | `mintCertificates` |
| Session close, master-cupper backfill, audit, PDF invalidation | no | `closeSessionIfComplete` |

New module `src/lib/cupping/finalize-pipeline.ts` exports those four helpers. `POST /api/cupping/finalize` becomes commodity decision logic plus the spine; `POST /api/cupping/cva/finalize` becomes specialty decision logic plus the same spine.

The extraction must be **behaviour-preserving for commodity**. See Testing.

### The specialty decision

`compliance.ts` stays commodity-only. The CVA route computes its own cup verdict:

1. **Cup.** Read the newest `protocol='cva'` score row for `(session, sample)`; take `cva_score`. Read the template's `cva_min_score`. Cup passes when `cva_score >= cva_min_score`. A missing score or a missing mark means the cup verdict is *unknown*, not *passed* — treat as not certifiable and say so.
2. **Green bean.** `evaluateQualityCompliance` unchanged. A specialty lot has no commodity attribute rows, so its cupping criteria do not emit; defect counts, screen sizes, moisture and quakers still apply.
3. **Combined.** `approved` only when the cup passes **and** compliance passes **and** grading data exists. With no grading data the decision is `pending` and the lot parks in `review`, exactly as commodity does.
4. **Cup integrity.** CVA records `u` (non-uniform cups) and `d` (defective cups) in the assessment. These drive `uniform_cup` and `clean_cup` in place of the commodity taint/fault count: `uniform_cup = u === 0`, `clean_cup = d === 0`.
5. **Override.** `{ decision: 'approved' | 'rejected', comment: string }`. The comment is required. The override replaces the *cup* verdict, not the green-bean one — a lot failing on screen size is not certified by overriding the cup.

The verdict is decided by a pure function so it can be tested without a database:

```ts
decideCvaVerdict({
  cvaScore: number | null,
  cvaMinScore: number | null,
  override: { decision: 'approved' | 'rejected'; comment: string } | null,
}): { cupPassed: boolean | null; source: 'auto' | 'override'; reason: string }
```

### Certificate render

`certificate-data.ts` gains a CVA branch, selected on the template's `methodology === 'cva'`:

- The attribute rail and spider are built from the 8 section impressions on a **1–9** scale, not the commodity spec scale.
- The 0–100 score leads, with `cva_passed` and `cva_min_score` read from the persisted assessment rather than recomputed.
- Everything else on the certificate — lot identity, supply chain, green-bean checklist, footer — is unchanged.

Reading the *persisted* mark matters: the certificate then prints the threshold that applied on the day it was issued, not whatever the template says later.

---

## Data model

One migration adds seven columns to `quality_assessments`. It is the right home: per-sample, already read by the certificate, and already holding the adjacent `clean_cup`, `uniform_cup` and `resolved_defects`.

```sql
ALTER TABLE quality_assessments
  ADD COLUMN IF NOT EXISTS cva_score            numeric,
  ADD COLUMN IF NOT EXISTS cva_min_score        numeric,
  ADD COLUMN IF NOT EXISTS cva_passed           boolean,
  ADD COLUMN IF NOT EXISTS cva_override_decision text
    CHECK (cva_override_decision IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS cva_override_comment  text,
  ADD COLUMN IF NOT EXISTS cva_override_by       uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cva_override_at       timestamptz;

COMMENT ON COLUMN quality_assessments.cva_min_score IS
  'The pass mark that applied when this lot was certified. Persisted rather than
   read live from quality_templates, so a later edit to the template cannot
   retroactively change what an issued certificate asserts.';
```

An override is only meaningful with all four `cva_override_*` columns set together; the route writes them as a unit.

---

## UI: the Certify step

A tenth step in the journey, after Score. It shows:

- the score against the mark, and whether the cup passes;
- the green-bean status — graded, or awaiting grading;
- **Certify** (primary) and **Override** (secondary, opening a required-comment field).

It is honest about the outcome rather than implying a certificate always appears: *"Certificate 000123/26 created"* or *"Cup approved — awaiting green-bean grading"*.

`GET /api/cupping/cva/[id]` gains `can_finalize` per the caller's profile, so the step only renders for someone permitted to use it. The permission rule is `assertCanFinalize`'s, unchanged: global admin, master cupper, Q-grader, or a cupper assigned to the session.

---

## Testing

**The spine extraction is the risky part.** `finalize/route.ts` has no tests today, and it is the path that certifies every commodity lot. Order of work:

1. **Characterization tests first, before moving any code.** Cover the phases heading into `finalize-pipeline.ts` against the existing route's behaviour: the permission and cupper-count gate, the `analysis → review → certified` transition chain, certificate mint for a mother lot and for sub-contracts, the no-grading-data `pending` path, and session close. These must pass before and after the extraction, unchanged.
2. **Pure-function tests** for `decideCvaVerdict` — pass, fail, exactly-on-the-mark, missing score, missing mark, override in both directions, override with a blank comment rejected.
3. **CVA rail mapping** — 8 impressions to rail entries on a 1–9 scale; a partial assessment renders what exists rather than throwing.
4. **Route tests** for `/api/cupping/cva/finalize`: approves at or above the mark, rejects below, parks in `review` with no grading data, refuses an override with no comment, and refuses to certify a lot failing green-bean compliance even when the cup is overridden to approved.

Existing suite is 1035 tests; all must stay green.

---

## Risks and open questions

- **`u`/`d` → `clean_cup`/`uniform_cup` is inferred**, not confirmed against how the lab actually judges specialty cup integrity. Confirmed as acceptable during design, but worth a second look when the first real lot goes through.
- **The extraction touches production certification.** If the characterization tests prove hard to write against the route as it stands, that is a signal to stop and reconsider the extraction's boundaries rather than to skip the tests.
- **Sub-contract certificates for specialty lots** follow the same mint path as commodity, untested against a real specialty split. The mint code is shared, so behaviour should be identical, but no specialty lot has yet been split.
- **`requires_descriptors`** already soft-gates the score step in the journey. It does not participate in the certify decision, and this spec does not change that.
