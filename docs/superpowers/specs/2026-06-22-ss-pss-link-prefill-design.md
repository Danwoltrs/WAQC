# Link SS → PSS at intake with full prefill

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan

## Problem

Every shipment sample (SS) that a client hires Wolthers to check has, by definition, an
already-approved pre-shipment sample (PSS). The two share the same contract: same buyer,
seller, exporter, quality, contract references, origin, etc.

Today the intake form has only a partial version of this:

- Sample type is chosen in Step 3 (Quality).
- A "Link to Approved Pre-Shipment Sample" dropdown is buried in Step 2 (Supply Chain),
  shown only when `sample_type === 'ss'`
  (`src/components/samples/intake/supply-chain-step.tsx:144`).
- Selecting a PSS prefills only ~10 fields (origin, micro-origin, quality spec, ICO,
  seller, shipper, exporter sample #, Wolthers contract #, exporter contract #, processing
  method) — `handlePSSSelection`, `supply-chain-step.tsx:118`.
- The link is **not stored** in the database — it is purely a UI convenience, so there is
  no SS→PSS traceability after creation.

## Goal

When creating an SS, make linking its approved PSS the first and primary action, prefill
**all** contract/quality/quantity details from that PSS, and persist the link for
traceability.

## Decisions (locked)

1. **Placement:** PSS picker is a prominent first step for SS samples.
2. **Prefill scope:** Everything — all counterparties, all contract refs, quality, origin,
   processing, certifications, crop year, ICO, **and** quantity (bags) — all editable after.
3. **Persist:** Add a real `linked_pss_sample_id` foreign key on `samples`.
4. **Requirement:** Strongly encouraged but non-blocking — warn if SS has no PSS, allow
   proceeding.

## Design

### 1. Flow change — sample type and PSS link move to Step 1

Lift the sample-type choice (PSS / SS / Type) to the top of Step 1. Step 1 ("Contract
search") becomes adaptive:

- **SS selected** → a prominent, **searchable** PSS picker replaces the contract-search UI.
  Selecting a PSS:
  - prefills every shared field (see §2),
  - shows a compact, read-only **summary card** of the chosen PSS (tracking #, exporter,
    origin, quality, approval date / cupping score) so the cupper can confirm they picked
    the right one.
- **PSS or Type selected** → the existing contract-search UI shows, unchanged.

The Quality step still shows the sample type (now pre-set from Step 1) and keeps it
editable. The in-step PSS dropdown currently in the Supply Chain step is **removed** —
replaced by the Step-1 picker. The underlying fields (seller, contracts, etc.) remain
editable in their normal places.

Step 1 validation stays "always valid" (selection optional), with the non-blocking warning
from §4 layered on top.

### 2. Full prefill

Expand `handlePSSSelection` from ~10 fields to the full shared set. All source data is
already present in the `/api/samples` GET response, which returns `*` from the sample plus
flattened entity names (`seller_name`, `exporter_name`, `importer_name`, `roaster_name`,
`qc_client_name`, `end_client_name`) — see `src/app/api/samples/route.ts:44` (select) and
the `transformedSamples` map (~line 121). No new read API is required.

Fields to prefill onto the SS form:

| Group        | Fields |
|--------------|--------|
| Counterparties | seller, shipper/exporter (`same_seller_shipper` honored), importer, `importer_is_qc_client`, qc_client, roaster, end_client |
| Contract refs | seller_contract_nr, shipper_contract_nr, importer_contract_nr, qc_client_contract_nr, roaster_contract_nr, end_client_contract_nr, wolthers_contract_nr, exporter_contract_nr |
| Identifiers  | exporter_sample_number, ico_number |
| Quality      | quality_spec_id, quality_name, origin, micro_origin, processing_method, certifications, crop_year |
| Quantity     | bag_count, bag_weight_kg, bag_type (recompute `bags_quantity_mt` / `equivalent_60kg_bags` via existing helpers) |

- **Container #** prefills only if the PSS carries one (usually blank until shipment).
- All prefilled fields are **editable** afterward.
- Prefilled fields reuse the existing `contract_prefilled_fields` mechanism so they get the
  same "auto-filled" highlight and clear-on-edit behavior (`types.ts:110`).

### 3. Persist the link

- **Migration** (WAQC migrations live in `database/migrations/`): add
  `samples.linked_pss_sample_id uuid references samples(id)`, nullable, with an index.
- **POST `/api/samples`** writes `linked_pss_sample_id` from the form payload.
- **Display:** add a small "Linked PSS: `TRACKING#`" line in the sample detail modal so the
  relationship is visible after creation. Payoff: the SS permanently points at its PSS,
  enabling future reporting and showing the PSS score/cert next to the SS.

### 4. Strongly-encouraged, non-blocking

- If type is SS and no PSS is linked: inline warning on Step 1 and a note on the review step
  ("No PSS linked — every shipment sample should reference its approved pre-shipment
  sample"). Next / submit still allowed (edge cases, legacy intake).

### 5. Searchable picker data

- Raise the approved-PSS fetch from `limit=50` (`sample-intake-form.tsx:310`) to a larger
  page (e.g. 200) and filter client-side in a `SearchableSelect` (search by tracking #,
  exporter, origin, contract).
- If approved-PSS volume outgrows a single page later, add a server-side `search` param to
  the GET. Noted now so the cap is explicit, not silent.

## Out of scope

- Server-side PSS search param (only if volumes require it later).
- Backfilling `linked_pss_sample_id` for historical SS samples.
- Surfacing PSS cupping scores in reports/certs (the FK enables it; not built here).

## Affected files (anticipated)

- `database/migrations/` — new migration adding `linked_pss_sample_id`.
- `src/components/samples/intake/constants.ts` — Step 1 naming.
- `src/components/samples/intake/contract-search-step.tsx` (Step 1) — sample-type pick +
  adaptive PSS picker + summary card + warning.
- `src/components/samples/intake/supply-chain-step.tsx` — remove the in-step PSS dropdown;
  move/expand `handlePSSSelection`.
- `src/components/samples/intake/quality-step.tsx` — type stays editable, pre-set.
- `src/components/samples/sample-intake-form.tsx` — fetch limit, prefill wiring, payload.
- `src/app/api/samples/route.ts` — persist `linked_pss_sample_id` on POST.
- Sample detail modal — show linked PSS line.
- `src/components/samples/intake/types.ts` — already has `linked_pss_sample_id`; confirm
  payload mapping.
