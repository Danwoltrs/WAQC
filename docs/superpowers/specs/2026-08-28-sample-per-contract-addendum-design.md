# One sample per contract — addendum

**Date:** 2026-08-28
**Extends:** `2026-08-26-sample-per-contract-design.md` (approved)
**Status:** Design fixed for implementation; assumptions flagged for Daniel are marked **[ASSUMPTION]**

## Why an addendum

Anderson registered `SAN-00654/26` (Dunkin, OFI, exporter sample 130306) as one sample
covering thirteen contracts — the mother plus twelve `sample_contracts` rows, certificates
`BR-037250/26` … `BR-037262/26`. The references were saved correctly per contract
(130307 / S049504-14 / S664243-14, …). The quantities were not: every contract carries the
mother's 333 × 60 kg jute bags, while the labels say 20 big bags for the `S664243-xx`
lots and 667 bags for `S667159-3`. When he corrected the bags on one certificate, "all the
certificates changed": the editor showed the mother's bags for every sub-contract and saved
them to the mother.

The stop-gap shipped today (`7827557`, `f4eb5b4`) routes the editor's edit to the
sub-contract row. The approved design removes the split entirely. This addendum records what
production looks like now, the questions the spec left open, and three requests Daniel added
on 2026-08-28:

1. Per-contract quantity must be first-class — "one has 20 big bags, another 40, or 320
   bags, or is in bulk" — and edits must land on that contract only.
2. Bulk asks for total MT (and containers); the 60 kg equivalent is derived and shown to
   staff, and the certificate prints **"2 containers in bulk (43.2 MT)"**.
3. When adding contract N+1, prefill each reference by continuing the sequence
   (`50235-1 → 50236-1`, `1235-231 → 1236-231`, `56542/26 → 56543/26`), adjusting as the
   user types.

## Production on 2026-08-28

| Metric | 2026-08-26 (spec) | 2026-08-28 |
| --- | --- | --- |
| Live samples | 607 | 637 (677 incl. soft-deleted) |
| Certificates | 677 | 719 (92 point at a sub-contract) |
| Mothers with sub-contracts | 30 | 34 (3 soft-deleted) |
| `sample_contracts` rows | 83 | 98 |

Dry run against those 98 rows (read-only, service role):

- Every row has all five quantity columns filled. No row's `bag_count × weight`
  contradicts its stored MT by more than 1 % (the bulk rows use the `count × 60`
  convention). **The spec's `21600` correction rule is moot** — migration `20260814000000`
  already repaired it. The migration copies quantities verbatim and only *reports*.
- The only mother-fallback in play is the seller reference: 81 rows have
  `seller_contract_nr` NULL while the mother's is set, because the sub-contract form writes
  the seller reference into `supplier_contract_nr` and `resolveSupplyRefs` cross-maps it
  at render time. `roaster_id` (1), `shipper_contract_nr` (2) and `buyer_contract_nr` (1)
  fall back on a handful of rows.
- 6 sub-contracts have no certificate and no number (their mothers are `in_progress` /
  `received`). 32 of 34 mothers use `split_numbering = true`.
- No `sample_contracts` row has a `contract_id`, `container_nr` or manual ref pins.

## Sibling row construction (the copy rule)

A sibling starts as a copy of the mother, then takes the sub-contract's own values. Three
independent copies of this rule exist today and they agree: `certificate-data.ts:1028-1045`
(render), `report-data.ts:237-283` (reports) and `pss-intake-mapping.ts:98-146` (SS
prefill, the tested one). The migration and the intake endpoint implement it **once**, in
`src/lib/sample-group.ts`, and the render/report/prefill copies are deleted.

| Column group | Sibling value |
| --- | --- |
| Buy side: `importer_id`, `roaster_id`, `end_client_id`, `importer_is_qc_client` | sub-contract's own (no fallback — matches the render) |
| `client_id` | `COALESCE(sub, mother)` |
| Buy-side refs: `wolthers_contract_nr`, `buyer_contract_nr`, `roaster_contract_nr`, `qc_client_contract_nr`, `end_client_contract_nr` | sub-contract's own |
| `seller_contract_nr` | `COALESCE(sub.supplier_contract_nr, sub.seller_contract_nr, mother.seller_contract_nr)` — the `resolveSupplyRefs` rule, so the seller column prints the same reference it prints today |
| `supplier_contract_nr`, `shipper_contract_nr` | `COALESCE(sub, mother)` |
| `exporter_sample_number`, `ico_number`, `container_nr`, `shipment_month` | `COALESCE(sub, mother)` |
| Quantity: `bag_count`, `bag_weight_kg`, `bag_type`, `bags_quantity_mt`, `equivalent_60kg_bags`, `bags` | `COALESCE(sub, mother)` — copied verbatim, the derivation trigger is **disabled** during the copy |
| `contract_id`, `manual_ref_fields` | sub-contract's own |
| Everything else (origin, lab, quality spec, sample type/category, supply side, status, workflow stage, decision fields, certifications, crop year, processing, `deleted_at`, print/scan timestamps) | mother's |
| `storage_position` | NULL — a sibling occupies no shelf |
| `linked_pss_*` | NULL |
| `created_at` | sub-contract's `created_at` |
| `lab_source_sample_id` | mother id |
| `contract_ordinal` | `sort_order + 2` (mother is 1) |
| `tracking_number`, `split_numbering` | see Numbering |

## Numbering

`samples.tracking_number` is NOT NULL and unique per `(client_id, tracking_number)`, so a
sibling cannot reuse the mother's number. Each sibling mints its own internal lab number
from `generate_sample_number(laboratory_id)` (`SAN-00xxx/26`) with `split_numbering = true`,
exactly as the duplicate route creates SS copies today. The certificate keeps its number on
the certificates row; nothing is regenerated. A mother with no laboratory (cannot mint)
gives its siblings `<sub tracking number>` or `<mother number>-<ordinal>`.

**[ASSUMPTION]** Fresh internal numbers over reusing the sub-contract's certificate number
as its tracking number. The internal number is low-visibility (the spec already asks to show
the certificate number in the header instead), and reusing certificate numbers would feed the
certificate series into `generate_tracking_number`'s MAX() scan.

`assign_certificate_number` is untouched: a sibling inserted with `split_numbering = true`
mints a gap-free official number if it ever needs a fresh certificate; existing certificates
are found first and revised in place.

## New columns

```sql
ALTER TABLE samples ADD COLUMN lab_source_sample_id uuid NULL REFERENCES samples(id);
ALTER TABLE samples ADD COLUMN contract_ordinal integer NULL;   -- 1 = lab unit, 2..N siblings
ALTER TABLE samples ADD COLUMN container_count integer NULL;    -- bulk: entered; others: optional
```

`contract_ordinal` gives siblings a deterministic order for certificate minting (the
sequence `BR-037250, 037251, …` follows contract order), tin-sleeve lists and the
"contract 2 of 13" badge — `sample_contracts.sort_order` had this job and `samples` has no
equivalent.

A mapping table records the move and is the rollback path:

```sql
CREATE TABLE sample_contract_migrations (
  sample_contract_id uuid PRIMARY KEY,
  sibling_sample_id  uuid NOT NULL REFERENCES samples(id),
  certificate_id     uuid NULL,
  migrated_at        timestamptz NOT NULL DEFAULT now()
);
```

`certificates.sample_contract_id` and `samples.linked_pss_sample_contract_id` are set to
NULL but **not dropped** in this migration, so the previous build keeps working in the
minutes between applying it and deploying the code. Both columns and `sample_contracts`
go in a later cleanup migration.

## Bulk and containers

Bulk is weight-driven (migration `20260604000003`): net MT is the source of truth and the
60 kg equivalent derives from it. The forms did not follow: intake and the certificate
editor still ask for "equivalent 60 kg bags" and store `bag_weight_kg = 21600`, so the
certificate printed "720 × 21600 kg bulk bags".

Rule, applied on every quantity surface (intake mother step, intake contract panel, the
certificate editor, the cupping-page details dialog, the duplicate popover):

- `bag_type = bulk` asks for **containers** (integer, default 1) and **total MT** (default
  `containers × 21.6`, editable — a lighter grinder coffee is legitimately below 21.6).
  The 60 kg equivalent is shown read-only.
- Stored: `container_count`, `bags_quantity_mt`, `equivalent_60kg_bags = round(MT × 1000 / 60)`,
  `bag_count = equivalent_60kg_bags` (the invariant every report relies on),
  `bag_weight_kg = 21600` (kept for the trigger and legacy readers).
- Printed everywhere: **`2 containers in bulk (43.2 MT)`** — certificate, public QR page,
  lists, sleeves, summaries. One container prints `1 container in bulk (21.6 MT)`. A legacy
  bulk row without `container_count` shows `round(MT / 21.6)`, minimum 1.
- Non-bulk types are unchanged (`320 × 60 kg jute bags / 19.2 MT`); `container_count` is
  stored when the user fills it but never required.

`computeBagQuantities` keeps its count-driven bulk branch for legacy callers; new code uses
`bulkQuantitiesFromContainers(containers, mt)`.

## Reference auto-increment

Pure helper `nextReference(previous, before?)` in `src/lib/reference-sequence.ts`:

- With one seed, increment the **first** run of digits, preserving zero-padding:
  `50235-1 → 50236-1`, `IR0007506-1 → IR0007507-1`, `56542/26 → 56543/26`.
- With two seeds of the same shape (same non-digit skeleton), find the single digit run
  that changed and continue that step: `S664243-13, S664243-14 → S664243-15`. This is how
  the tool adapts after the user corrects the first suggestion.
- No digits, or ambiguous (several runs changed) → no suggestion (field left blank).

Applied when a contract is added — at intake and from the sample overlay — to
`exporter_sample_number`, `wolthers_contract_nr`, `supplier_contract_nr` (seller ref),
`buyer_contract_nr`, `roaster_contract_nr`, `qc_client_contract_nr`,
`end_client_contract_nr`. Not to `ico_number` or `container_nr`. The mother counts as
contract #1. Suggested values are ordinary editable inputs.

## Group-aware behaviours the spec did not list

Found by reading every `sample_id`-keyed path:

- **Certificate override** (`/api/certificates/[id]/override`) fans the decision out to every
  certificate with the same `sample_id` — that loop *is* decision 3 today. It now resolves
  the group through `lab_source_sample_id` and updates every member's sample status and
  certificate.
- **Approval email attachments** (`notify-approval`) and **approval recipients** gather
  certificates by `sample_id`; both resolve the group.
- **sys write-back** iterates group members instead of `sample_contracts`; a sibling's
  claim ref is its certificate number (what `sample_contracts.tracking_number` held), the
  lab unit keeps its tracking number, dedupe by resolved sys contract stays.
- **Lab data** (`quality_assessments`, `cupping_scores`, `roast_profiles`,
  `quality_overrides`, compliance evaluation, CVA inputs) is read through
  `labSourceId(sample) = lab_source_sample_id ?? id` on every surface a sibling can reach:
  certificate render, public page, JSON summary, QR data, approval email summaries, reports'
  rejection reasons, the embed aggregate, the editor's quality panel. Writes to lab data
  from a sibling context go to the lab unit (siblings never diverge).
- **Batch send / email history**: the send unit becomes the plain sample id. The migration
  rewrites `email_messages.metadata.sample_id` to the sibling id where
  `metadata.sample_contract_id` is set, so already-sent siblings stay "sent".
- **Tin labels** dedupe by lab unit (one tin per physical sample), bag sleeves stay one per
  certificate; sleeve certificate order follows `contract_ordinal`.
- **Cupping/grading queues** (`my-samples`, CVA `eligible`, `samples-assigned`) filter
  `lab_source_sample_id IS NULL`.
- **QC samples list** keeps the grouped presentation: lab units are top-level rows, siblings
  render as the child rows they render as today, sourced from `samples` via a second query
  on `lab_source_sample_id` (a PostgREST self-embed is ambiguous once two samples→samples FKs
  exist). Each child opens the overlay on its own sample id.
- **Portal**: sibling certificates become visible to their QC client. **[ASSUMPTION]** This
  is the intended behaviour — they are that client's certificates; today's
  `sample_contract_id IS NULL` filter hid them by accident of the model.
- **Client deletion impact** counts siblings automatically (they are samples).

## Billing — flagged, not changed

`qc_billing_feed` and the fee trigger see every approved `samples` row. Today
sub-contracts are not billed at all; after the migration each sibling is billed on its own
quantity. Under the quantities-are-additive rule that is right — each contract is separate
coffee. It is wrong wherever a sibling's quantity is a *copy* of the mother's rather than its
own (Anderson's twelve × 333 bags). The migration therefore **reports** every group whose
siblings carry identical quantities to the mother, for Daniel to correct, and the feed is
left as is. Nothing consumes the feed yet (sys finance is not built). **[ASSUMPTION]**

## Deployment order

The code depends on the new columns; Vercel deploys `main` on push. So:

1. Apply `database/migrations/20260828000001_one_sample_per_contract.sql` (single
   transaction; it aborts itself if any verification fails).
2. `git push`. The migration-dependent commits are made locally and **not pushed** by this
   session.

Between 1 and 2 the previous build runs against migrated data: sibling certificates have
`sample_contract_id = NULL` and point at a sibling row that carries every rendered field, so
they render unchanged; the old sub-contract UI reads the untouched archive table. Minutes,
not hours.

## Out of scope (unchanged from the spec)

Dropping `sample_contracts` and the two nulled columns; the sample-header certificate
number; the OG preview image. Also unchanged: `computeBagQuantities`'s legacy bulk branch
and the big-bag wording on existing certificates.
