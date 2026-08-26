# One sample per contract

**Date:** 2026-08-26
**Status:** Approved, ready for implementation planning

## Problem

A single physical sample can cover several commercial contracts. Today that is modelled
as one `samples` row (the "mother", carrying contract #1) plus one `sample_contracts` row
per additional contract, each producing its own certificate.

The references cross. Sample `SAN-00531/26` (exporter sample `AS248426`) carries contract
`41858/26` / `IR0007506-1` on the sample row, and `41859/26` / `IR0007507-1` on its single
sub-contract. It issued two certificates, `R-SAX-011817/26` and `R-SAX-011818/26`. The
sample detail screen can only show one set of references, so staff reading the screen
cannot tell which certificate carries which contract, and an edit made on the sample row
lands on contract #1 whether or not that was the intent.

The same shape explains two other symptoms reported this week:

- **"Mislinked" contract FKs.** `samples.contract_id` is a single column, so a sample
  spanning two contracts can only point at one of them. `SAN-00440/26` and `SAN-00609/26`
  looked mislinked for exactly this reason. There is no bug to fix in the link — the
  column cannot express the truth.
- **Report counts that do not reconcile.** The Pre-Shipment Samples band showed 19
  contracts against 12 approved + 10 rejected = 22, because contracts and certificates are
  counted from different tables with different notions of a unit.

### Current usage

Measured against production on 2026-08-26:

| Metric | Count |
| --- | --- |
| Live samples | 607 |
| Certificates | 677 |
| Samples with at least one sub-contract | 30 |
| `sample_contracts` rows | 83 |

All 30 are PSS. 29 of the 30 carry genuinely different buyer references per row — that is,
they are multiple *contracts*, not multiple containers. Every `container_nr` on
`sample_contracts` is empty. The table is not serving a second purpose that needs
preserving.

Distribution is long-tailed: 17 samples have 1 extra contract, and the largest are
`SAN-00258/26` with 11 and `SAN-00529/26` with 10.

## Decisions

Locked with Daniel on 2026-08-26:

1. **Cup once, results shared.** One sample is the lab unit. It is graded and cupped once
   and the result is shared with every contract sibling. Lab workload does not increase.
2. **Migrate existing data.** All 30 samples and 83 sub-contracts convert to the new shape.
   Already-issued certificates keep their numbers and their rendered content.
3. **Siblings never diverge.** One decision for the group, propagated to every sibling's
   certificate. No per-certificate override that makes one sibling differ from another.

## Data model

One nullable self-reference on `samples`:

```sql
ALTER TABLE samples
  ADD COLUMN lab_source_sample_id uuid NULL REFERENCES samples(id);
```

- `NULL` — this sample is the lab unit. Cupped and graded. Behaves exactly as today.
- non-null — this is a contract sibling. Its lab data lives on the row it points at.

A group is every row sharing `COALESCE(lab_source_sample_id, id)`. There is no group table
and no "exactly one primary" constraint to enforce, because the pointer *is* the
constraint. Single-contract samples keep `NULL` and are unaffected by the whole change.

Lab data stays attached only to the lab unit. The tables concerned:

- `quality_assessments`
- `cupping_scores`
- `cupping_audit_log`
- `roast_profiles`
- `quality_overrides`

Siblings resolve lab data through the pointer. Nothing is copied, so "cup once, shared to
all" holds by construction — there is no second copy that can drift.

### Certificates

`certificates.sample_contract_id` is dropped. Every certificate points at a plain
`sample_id`. One sample, one contract, one certificate.

### Retiring `sample_contracts`

The table stops being written to at cutover and remains readable as an archive. It is
dropped in a separate migration only after the verification below has passed and Daniel is
satisfied. This is the rollback path.

## Behavioural rules

**Cupping queues filter `lab_source_sample_id IS NULL`.** This is the rule that keeps lab
workload flat. Siblings appear in samples lists, certificates, reports, search and
approval emails, but never in a cupping or grading worklist. Without it `SAN-00258/26`
would ask for 12 cuppings instead of 1.

**Decisions propagate across the group.** Approving or rejecting the lab unit applies to
every sibling, and the sys write-back already does this for sub-contracts today.

**Each sibling owns its own commercial fields** — contract number, buyer/seller references,
`contract_id`, quantity, container, ICO, importer, roaster, end client. This is the point
of the change: references cannot cross because there is nowhere for them to cross to.

## Migration

Every `sample_contracts` column already exists on `samples` except `sample_id`,
`sort_order` and `created_by`. Each sub-contract therefore becomes a sibling `samples` row
by direct column copy.

For each of the 83 rows:

1. Insert a `samples` row copying the sub-contract's columns, falling back to the mother
   for any field the sub-contract left blank. This fallback is the same one
   `certificate-data.ts` applies at render time today, so a migrated certificate renders
   identically to how it renders now.
2. Set `lab_source_sample_id` to the mother's id.
3. Copy `status`, `workflow_stage` and the decision fields from the mother (decisions are
   shared, per decision 3).
4. Repoint the existing certificate: `sample_id` = the new sibling, `sample_contract_id` =
   `NULL`.

Certificate numbers are never regenerated. `R-SAX-011818/26` stays `R-SAX-011818/26`.

The migration runs in a transaction. `sample_contracts` is left intact.

### Quantity corrections

`sample_contracts` rows carry a `bag_weight_kg` that is wrong on at least one row: the
sub-contract behind `R-SAX-011818/26` holds `21600` where its mother holds `60`, which is
why that certificate prints "720 × 21600 kg bulk bags". The MT figure (43.2) is correct;
only the bag line is wrong.

The correction rule, stated explicitly so the migration is not making judgement calls:

- A sub-contract's `bag_weight_kg` is replaced by the mother's value when the two differ
  **and** the sub-contract's own `bag_count × bag_weight_kg` contradicts its stored
  `bags_quantity_mt` by more than 1%, while the mother's value reconciles it. That is the
  `21600` case: `720 × 21600 kg` = 15,552 MT against a stored 43.2 MT, whereas
  `720 × 60 kg` = 43.2 MT exactly.
- Every other mismatch is reported and left alone for Daniel to decide.

No quantity is rewritten unless arithmetic proves the stored value wrong.

## Code changes

53 files reference `sample_contracts` or `sample_contract_id`. Most collapse rather than
change — the mother/split duality is what most of that code exists to handle.

**Deleted outright**

- `src/lib/certificate-supply-refs.ts` — resolves supply-side refs across the mother/split
  boundary. With no split, there is no boundary.
- `buildSubContractSummary` in `src/lib/approval-notification/quality-summary.ts`.
- The `contractOverride` branch in `src/lib/certificate-data.ts`. This branch produced the
  crossed references reported this week.

**Substantially simplified**

- `src/lib/certificate-data.ts` — a certificate renders from its own sample row.
- `src/lib/approval-notification/quality-summary.ts` — every certificate is a normal row.
- `src/lib/report-data.ts`, `src/lib/reports/performance-data.ts`,
  `src/lib/reports/annual-data.ts` — count samples rather than mixing tables. This is what
  reconciles the 19-vs-22 mismatch.
- `src/app/api/certificates/*` — no dual-keyed lookups.
- `src/lib/print-selection.ts`, `src/lib/sleeve-label-data.ts`, `src/lib/qr-code.ts`.

**Changed behaviour**

- Intake gains "this sample covers N contracts", creating N siblings in one operation.
  Replaces the add-sub-contract flow in `src/components/samples/sample-contracts-section.tsx`
  and `src/components/samples/add-sub-contract-dialog.tsx`.
- Cupping surfaces filter to lab units: `src/app/api/cupping/my-samples/route.ts`,
  `bulk-data/route.ts`, `src/lib/cupping/finalize-pipeline.ts`.
- `src/lib/approval-notification/sys-decision-writeback.ts` propagates across the group.

**Unaffected**

`contract-ref-sync.ts` keeps the manual-pin behaviour and the FK consistency guard. Once
each sample owns one contract the guard should stop firing, but it stays as a safety net.

## Testing and verification

TDD on the pure pieces:

- sibling-row construction from a sub-contract plus mother fallback
- group resolution from `lab_source_sample_id`
- cupping-queue filtering
- report counting against a fixture that reproduces the 19-vs-22 mismatch

Migration verification, run against a production snapshot before cutover:

- All 677 certificate numbers identical before and after.
- Every certificate's rendered references (buyer, seller, Wolthers number, quantity,
  exporter sample number) byte-identical before and after, except the deliberate
  `bag_weight_kg` corrections, which are listed explicitly.
- Sample count moves from 607 to 690 (607 + 83); no sample lost.
- Every migrated certificate resolves to exactly one sample.
- No sibling appears in a cupping queue.

## Risks

**Repointing 83 issued certificates is the real risk.** If a sibling row is built wrong, a
certificate silently changes what it prints — the failure mode this whole change exists to
eliminate. The verification diff above is part of the migration, not a follow-up.

**Rollback.** `sample_contracts` is untouched by the migration and the whole thing runs in
a transaction. Reverting means restoring `certificates.sample_contract_id` from the archive
and redeploying the previous build.

**A large mixed commit is how production went down on 2026-08-25.** This work ships in
reviewable stages — migration, then render, then reports, then intake — not as one sweep.

## Out of scope

Two UI changes requested alongside this, independent of the migration and queued
separately:

1. **Edit details modal** — move the Quantity block up beside Commodity.
2. **Sample detail header** — show the certificate number instead of the internal lab
   number (`SAN-00531/26`). For SS samples, additionally show the container and ICO
   numbers.

Also out of scope: dropping `sample_contracts` (separate migration once verified), and
restoring the certificate OG preview image, which needs the public certificate route
restructured from a catch-all to nested segments.
