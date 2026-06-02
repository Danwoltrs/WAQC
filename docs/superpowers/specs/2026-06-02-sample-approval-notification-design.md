# Sample Approval Notification — Design

**Date:** 2026-06-02
**Status:** Approved (ready for implementation plan)
**Author:** brainstorming session

## Summary

When a WAQC lab user approves or rejects a sample that is linked to a
sys.wolthers.com contract, an Outlook-style email composer opens in WAQC,
pre-filled with the buyer/seller/logistics recipients and the quality
certificate. The lab user reviews and sends. The certificate is attached to the
email **and** annexed to the contract's Docs tab on sys.wolthers.com, which also
fires the logistics sidebar notification.

This mirrors the existing fixation / contract-issuing email module on
sys.wolthers.com (`dossier-composer.tsx`), but lives entirely in WAQC because
WAQC already has its own Microsoft Graph sender, generates/stores certificate
PDFs, and shares the database with sys.

Chosen approach: **A — self-contained in WAQC** (no new sys API, no cross-app
auth; integration happens through the shared DB tables `contracts`, `contacts`,
`documents`, `email_messages`).

## Trigger & gating

- Applies only to samples with a non-null `samples.contract_id` (intake done via
  the Contract Search step, linked to a sys `contracts` row).
- When a contract-linked sample is finalized in cupping and lands on `approved`
  or `rejected`, the approval composer **opens automatically** in WAQC right
  after finalize.
- If dismissed, a **"Notify counterparties"** button on the sample re-opens the
  composer (also used for re-sends).
- Non-contract-linked samples are unchanged (no composer).

## Data flow

```
Cupping finalize -> status = approved/rejected (cert already generated, cert# = tracking#)
  └─ if contract_id set -> open Approval Composer (WAQC)
       ├─ read contracts(buyer_id, seller_id) + contacts   (shared DB)
       ├─ lab user reviews recipients / subject / body / attachment
       └─ Send -> POST /api/samples/[id]/notify-approval (WAQC)
             ├─ ensure cert PDF (existing cert PDF path, certificates bucket)
             ├─ sendMail() via WAQC Graph (qualitycontrol@, on behalf of lab user)
             ├─ copy cert PDF -> logistics-documents bucket
             │   + INSERT documents(contract_id, type='Quality Certificate')
             │      └─ sys realtime on documents INSERT -> logistics sidebar badge
             └─ INSERT email_messages (outbound log: contract/buyer/seller)
```

## Recipient resolution

- Buyer side = `contracts.buyer_id` company contacts; seller side =
  `contracts.seller_id` company contacts — read from the shared `contacts`
  table (`is_active = true`, `email` not null).
- Reuse the sys sort logic: primary -> role-tagged -> others, buyer-side first.
- Defaults: **To** = primary contact of each party; **Cc** =
  `qualitycontrol@wolthers.com` + internal logistics. Lab user can edit freely.
- Optional future refinement: a `quality`/`approvals` contact role tag would
  float those contacts to the top. Not required for v1; primary contacts are the
  default.

## Status sync to sys

No extra write needed. The sys contract "Shipment & Samples" tab already merges
WAQC `samples` and shows their status, so the approve/reject outcome appears
automatically. The only push we add is the certificate annex (which also drives
the logistics notification badge).

## Components

### Approval Composer UI
`src/components/samples/approval-composer.tsx` (+ lightweight recipient picker).
Mirrors `dossier-composer.tsx`: centered modal with To/Cc chip pickers (contact
suggestions), Subject, Body textarea, Attachments list, signature toggle, Send.

Pre-filled defaults:
- **Subject:** `Quality {Approval|Rejection} — {tracking_number} — {contract_number} {quality_name}`
- **Body:** short templated note (decision, origin/quality, cupping score,
  cert #, link) built from already-loaded sample/spec data — no extra fetch.
- **Attachment:** cert PDF auto-included (toggleable), filename `{tracking_number}.pdf`.
- Honors sandbox/test mode via `MICROSOFT_GRAPH_TEST_RECIPIENT` (same banner as sys).

### Send route — `POST /api/samples/[id]/notify-approval`
- Guards: sample exists, status in {approved, rejected}, `contract_id` set; else 400.
- Ensure cert PDF exists (reuse existing generation; resolve `certificates.pdf_url`,
  download bytes from `certificates` bucket).
- `sendMail()` via WAQC Graph (`qualitycontrol@`, `senderEmail`/`senderName` =
  lab user) with To/Cc/subject/body + cert attachment (inline path; PDFs small).
- **Order:** send first; on success ->
  (a) upload cert copy into `logistics-documents` at a contract path, then
  `INSERT documents(contract_id, document_type_id='Quality Certificate',
  file_name, storage_path, source='manual')`;
  (b) `INSERT email_messages(direction='outbound', contract_id, buyer_id,
  seller_id, subject, to/cc, metadata)`.
  Annex/log failures after a successful send are logged as warnings, not fatal.
- Migration: add a `document_types` row **"Quality Certificate"** (scope
  `contract`) if absent.

## Rejection variant

Identical path; attaches the rejection certificate (`is_rejected`), and the body
includes the rejection reason / out-of-spec violations from the compliance
result. Same annex + log.

## Edge cases

- No contacts resolved -> composer opens with empty To; inline warning; lab user
  types addresses.
- Cert PDF generation fails -> block send with a clear error (no partial state).
- Graph send fails -> error toast, stay open, allow retry; nothing annexed/logged.
- Re-send -> allowed via "Notify counterparties" button; each send logged
  separately.
- Sample re-finalized (status flips) -> button reflects current decision;
  composer re-opens on the new outcome.

## Testing

- **Unit:** recipient resolution/sort; subject/body templating; document_type lookup.
- **Integration:** `notify-approval` route with mocked Graph + storage — asserts
  a `documents` row and an `email_messages` row are written on success, and that
  a Graph failure writes neither.
- **Manual (sandbox):** finalize a contract-linked sample with
  `MICROSOFT_GRAPH_TEST_RECIPIENT` set -> composer opens -> send -> verify test
  email received, cert visible on the sys contract Docs tab, logistics sidebar
  badge increments.

## Key references

- WAQC Graph sender: `src/lib/graph/send.ts`
- WAQC cert PDF: `src/app/api/certificate/[slug]/pdf/route.ts`,
  `src/lib/certificate-storage.ts` (bucket `certificates`)
- WAQC cupping finalize / approval: `src/app/api/cupping/finalize/route.ts`
- Contract intake mapping: `src/lib/contract-intake-mapping.ts`
- sys composer to mirror: `wolthers-app/src/app/(dashboard)/documents/dossier-composer.tsx`,
  `recipient-picker.tsx`
- sys recipient sort: `wolthers-app/src/lib/fixations/counterparty.ts`
- sys documents table + Docs tab: `documents` table, bucket `logistics-documents`,
  `contract-modal-docs-tab.tsx`
- sys notifications: `wolthers-app/src/components/providers/notifications-provider.tsx`
  (realtime on `documents` INSERT)
