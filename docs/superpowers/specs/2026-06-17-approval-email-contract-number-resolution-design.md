# Approval/Rejection Email — Resolve Contract by Number

**Date:** 2026-06-17
**Status:** Approved (design)
**Area:** WAQC (qc.wolthers.com) — sample approval/rejection notification pipeline

## Problem

When a cupper (e.g. Anderson) approves or rejects a sample on qc.wolthers.com, the
pre-built approval-email composer is supposed to open automatically, pre-filled with
recipients (from the shared sys contacts book), buyer/seller references, the
rejection/approval reasons, and the certificate PDF (which already contains the cupping
and defect graphs). On send it emails buyer + seller + logistics on behalf of the cupper
and writes the decision back to the shared `shipment_samples` table that sys reads.

**None of this has ever fired in practice.** The entire pipeline is gated on
`samples.contract_id`, and intake never populates that column — it is `NULL` on every
sample. Confirmed in production data: all approved/rejected samples have
`contract_id = NULL`, while `wolthers_contract_nr` (the sys contract *number*, e.g.
`41423/25`, including `…/26QC`-suffixed numbers) is populated.

The gate that silently fails:

- `GET /api/samples/[id]/approval-recipients` — `if (!s.contract_id) return 400`
  ([route.ts:40-41](../../../src/app/api/samples/[id]/approval-recipients/route.ts)).
  The cupping-validation modal opens the composer only when this route returns `r.ok`
  ([cupping-validation-modal.tsx:606-616](../../../src/components/cupping/cupping-validation-modal.tsx)),
  so a 400 means the composer never opens and approval completes with no notification.
- `POST /api/samples/[id]/notify-approval` — identical `if (!s.contract_id) return 400`
  gate ([route.ts:74-76](../../../src/app/api/samples/[id]/notify-approval/route.ts)),
  and derives `contractId` from `s.contract_id` for the cert annex + the sys write-back.

### Confirmed by data

Joining `contracts.contract_number = samples.wolthers_contract_nr` resolves a `contracts`
row — with `buyer_id` and `seller_id` — for **every** sample that has a contract number,
including the `…/26QC`-suffixed ones (exact match). So the contract context the pipeline
needs is fully reachable; it is just keyed off the wrong column.

## Goal

For any sample that carries a wolthers contract number, approving or rejecting it
auto-opens the pre-filled email composer (open-and-review, not auto-send), with reasons
and the certificate (graphs) attached, recipients from the shared contacts book, and —
on send — the decision written back to sys.

Non-goals: auto-send without review; emailing samples that have no contract number;
new chart rendering (the certificate already has the graphs).

## Design

### 1. Shared contract resolver (the core fix)

Introduce one helper, e.g. `resolveSampleContract(supabaseAdmin, sample)` in
`src/lib/approval-notification/` that, given a sample row, returns the contract context:

```
resolveSampleContract(admin, { contract_id, wolthers_contract_nr }) ->
  { contractId, buyerId, sellerId, buyerReference, sellerReference, contractNumber } | null
```

Resolution order:
1. If `sample.contract_id` is set → load that `contracts` row (future-proof).
2. Else if `sample.wolthers_contract_nr` is set → load the `contracts` row where
   `contract_number = sample.wolthers_contract_nr` (exact match). If more than one row
   matches, prefer the most recent / a deterministic order (verify uniqueness during
   implementation; data so far shows a single match per number).
3. Else → return `null` (genuinely no contract → no composer; correct behavior).

Both server routes call this helper instead of reading `s.contract_id` directly:

- **approval-recipients**: replace the `!s.contract_id` 400 gate with "resolve; if null →
  400". Use the resolved `contractId` for the `contracts` lookup it already does, and for
  the `shipment_samples` match (currently `.eq('contract_id', s.contract_id)` →
  resolved id). Select `wolthers_contract_nr` in the sample query.
- **notify-approval**: same — replace the `!s.contract_id` gate, select
  `wolthers_contract_nr`, and feed the resolved `contractId`/`buyerId`/`sellerId` into the
  cert annex (`documents` insert) and `applyShipmentSampleApproval` write-back.

Keep the resolver as the single source of truth so the two routes can never disagree
again.

### 2. Trigger / UX (no new UI)

Once the routes resolve by number, the existing flow starts working unchanged:
- Cupping-validation modal already calls `approval-recipients` after approve/reject and
  opens `ApprovalSendView` on `r.ok`.
- Certificate-override path already does the same check.
- The manual "Send approval email" button (already gated on `wolthers_contract_nr`,
  [sample-detail-modal.tsx:1146](../../../src/components/samples/sample-detail-modal.tsx))
  remains as the re-send affordance.

No component changes expected for the happy path. Verify the override path passes the
resolved id too.

### 3. Reasons + graphs

- **Graphs**: the certificate PDF already renders cupping-attribute charts, defect charts,
  and cup-status visuals ([certificate-cupping-chart.tsx](../../../src/components/pdf/certificate/certificate-cupping-chart.tsx),
  [certificate-defect-chart.tsx](../../../src/components/pdf/certificate/certificate-defect-chart.tsx)),
  and the composer already attaches the cert. "With graphs" = the attached cert; no new
  rendering. Verify the cert exists/generates for these samples before send (the composer
  surfaces `certificateAvailable`).
- **Reasons ("both")**: the email body already pre-fills cupping comments and the composer
  already exposes an editable "Additional message" field. Verify the **rejection** body
  carries the rejection reason/comments the same way the approval body does; fix the body
  builder if rejection drops them.

### 4. Write-back + contacts (consequence of §1)

`applyShipmentSampleApproval` already writes status/approved_by/date/certificate_url to the
shared `shipment_samples`, and recipients already come from the shared `contacts` table by
`buyer_id`/`seller_id` company. These start working as soon as §1 supplies a non-null
contract id; no separate work.

### 5. Hardening (optional, secondary)

Populate `samples.contract_id` at intake going forward (resolve from the selected/pulled
contract) so new samples are clean and don't lean on the number fallback. Not required for
this fix and not a blocker; resolution-by-number covers all existing samples with no
backfill.

## Affected files

- `src/lib/approval-notification/` — new `resolveSampleContract` helper (+ unit test).
- `src/app/api/samples/[id]/approval-recipients/route.ts` — use resolver.
- `src/app/api/samples/[id]/notify-approval/route.ts` — use resolver.
- (verify) certificate-override success handler on `src/app/certificates/page.tsx`.
- (verify) rejection body builder in the email compose path.
- (optional) intake path to set `samples.contract_id`.

## Testing

- Unit: `resolveSampleContract` — contract_id present; number-only; `…/QC` suffix;
  no-contract → null; (decide) multiple-match behavior.
- Integration: `approval-recipients` returns 200 + panels for a number-only sample;
  returns 400 for a sample with no contract number.
- Manual smoke: approve a real number-only sample (e.g. one of the SAN-000xx) → composer
  opens pre-filled (recipients, refs, reasons, cert) → send → email goes out on behalf of
  cupper + `shipment_samples` row flips to approved. Repeat for a rejection (reason
  present in body).

## Risk / edge cases

- Duplicate `contract_number` rows in `contracts` (sub-contracts / QC variants): confirm
  the lookup returns the intended contract; add deterministic ordering if needed.
- Samples whose `wolthers_contract_nr` has a suffix not present on the `contracts` row
  (data shows exact match holds; watch for `QC`/whitespace variance).
