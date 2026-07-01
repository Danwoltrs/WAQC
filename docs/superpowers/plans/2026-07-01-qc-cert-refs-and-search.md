# QC Certificate References + Certificate Search — Plan (2026-07-01)

## Problem (reported by Daniel)
1. Certificates show the **wrong seller (Ecom) reference** when one mother sample serves
   multiple contracts / containers. On the shown cert: seller Ecom `Ref: 4155261514`,
   but the sys.wolthers contract 42274/26 now carries `4155261663`.
2. Certificate-page search **cannot find** certs by the Wolthers contract number (`42274`)
   or the buyer/seller reference (`IR0007882-1`, `4155261514…`).
3. Inserted references should mirror sys.wolthers exactly.

## Root causes (verified in code)
- **Render:** `getCertificateData()` overrides only the *buy-side* entities from the
  sub-contract `sample_contracts` row; the *supply-side* (seller/shipper/exporter) and
  the sample number always fall back to the mother `samples` row
  (`certificate-data.ts` seller L754, shipper L766, exporter L923, sample_number L907).
  `sample_contracts` already stores per-contract `supplier_contract_nr` /
  `seller_contract_nr` / `shipper_contract_nr` / `exporter_sample_number`.
- **Drift:** intake copies sys `contracts.seller_reference` → `seller_contract_nr`
  verbatim (`contract-intake-mapping.ts:166`) but never re-syncs; if sys changes the
  reference after intake, QC keeps the stale value.
- **Search:** the page fetches only the first 100 certs then filters in memory
  (`page.tsx:221`); the buyer reference is neither fetched nor filtered; the server
  filter matches only cert#/issued_to/tracking#/client-name.

## Decisions (Daniel, 2026-07-01)
1. Per-split: each split's cert shows **all** its own supply-side refs, mother as fallback.
2. Drift: **auto re-pull** seller/buyer refs from the linked sys contract **on open + on edit**
   (overwrite stored QC value; sys is source of truth for these two fields).
3. Containers within one sys contract **share** that contract's reference (no sys API change).

## Implementation
### WS1 — per-split supply-side refs (`src/lib/certificate-data.ts`)
- Extract a pure helper `resolveSupplyRefs({ sample, contract })` → seller/shipper/exporter
  contract + exporter_sample_number, choosing the sub-contract's value first
  (seller = `supplier_contract_nr ?? seller_contract_nr`), mother as fallback.
- Feed the helper's output into the supplier/shipper/exporter entities and
  `sample.exporter_sample_number` in the return object (parallel to the existing
  `contractOverride?.importerEntity ?? {...}` pattern).

### WS2 — sys as source of truth for seller/buyer refs (`src/lib/contract-ref-sync.ts` + wiring)
Revised after code review (avoid writes-on-read + clobbering manual sub-contract entries):
- `fetchSysContractRefs(client, {contractId?, contractNumber})` → `{seller_reference,
  buyer_reference}|null`; resolves by contract_id, else **exact** contract_number, and
  returns null when 0 or >1 matches (contract_number is not unique — never guess).
- **Display = read-through (no writes):** `getCertificateData()` resolves the current sys
  refs for the mother sample and (for sub-contract certs) the split's own contract, and
  prefers them over the stored value. Every viewer sees the right number; no DB write on
  the read path. This is what fixes the reported drift on the certificate itself.
- **Persist = mother-only, editor-gated:** `refreshMotherRefsFromSys(sampleId, {admin})`
  runs on the sample PATCH (skipped when the user explicitly edited a ref) purely to keep
  list/search views in step. Sub-contract refs are never overwritten from sys (the user's
  manual entry stands; the cert still read-throughs the live sys value for display).
- Removed the earlier write-on-open (cert GET) and sub-contract POST/PATCH syncs.

### WS3 — server-side certificate search (`route.ts` + `page.tsx`)
- Page passes debounced `search` to `/api/certificates?search=`.
- Server resolves matching sample ids from `samples` + `sample_contracts`
  (wolthers_contract_nr, seller/supplier/buyer refs, tracking, exporter_sample_number,
  ico, container) plus certificate_number/issued_to — across all rows, not a 100 window.
- Add `buyer_contract_nr` / `seller_contract_nr` to the select; extend the client filter.

## Tests (TDD)
- `resolveSupplyRefs` — sub-contract-first, mother fallback, blank handling.
- `resolveSysContractRef` — by id, by unique number, null on ambiguous/missing.
- Certificate search predicate — matches wolthers#, buyer ref, seller ref, sub-contract ref.

## Notes
- No DB migration needed (all columns already exist).
- Not touching sys.wolthers (decision 3).
