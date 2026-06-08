# Approval Send View + sys.wolthers.com write-back — Design

**Date:** 2026-06-03
**Branch context:** WAQC (qc.wolthers.com). Shares ONE Supabase database with sys.wolthers.com (`ojyonxplpmhvcgaycznc`).
**Status:** Approved design — ready for implementation planning.

## 1. Problem

When a master cupper/admin approves (or rejects) a contract-linked sample in WAQC, they should get a send view to email the **seller** and **buyer** the approval with the **certificate attached**, and the corresponding sample on sys.wolthers.com should be marked **approved** automatically.

Two concrete failures observed:

1. **The send module didn't appear.** Anderson created a sample from a sys contract number (linked correctly), then approved the certificate via the **manual certificate override** path. That path sets `samples.status='approved'` but never opens any composer. The current approval composer is mounted in exactly one place — after cupping finalize.
2. **The current composer is too thin.** It's a single To/Cc/Subject/Body modal that sends one combined email. The desired UX is the two-panel send view used for Sale Confirmations on sys.wolthers.com, with the certificate previewed on the right.

## 2. Goals

- Replace the thin composer with a **full-screen split send view**: SELLER panel (top) + BUYER panel (bottom), each with editable TO/CC chips and a per-recipient greeting; certificate PDF previewed on the right.
- Send **two personalized emails** (one per panel), each with the certificate attached.
- **Open the send view from all three approval entry points**: cupping finalize, manual certificate override, and a persistent "Send approval email" button on approved/rejected samples.
- On send, **write the approval back to sys** (`shipment_samples`): update the matching row or create one if missing.
- Use the **sys "Sample approved · {contract}" email wording**.

## 3. Non-goals

- Revised-SC highlighting / drag-select marks, washout/cancellation modes (sys-only features).
- The `company_recipient_memory` last-send prefill table (sys-only; WAQC prefills from `contacts`).
- Changing the certificate template or the cupping/approval decision logic itself.

## 4. Current state (reference)

| Concern | Location |
|---|---|
| Approval decision (auto) | `POST /api/cupping/finalize` → sets `samples.status`, creates certificate |
| Approval decision (manual) | `POST /api/certificates/[id]/override` (`override-status-dialog.tsx`) — **does not open composer** |
| Current composer | `src/components/samples/approval-composer.tsx` (to be replaced) |
| Composer trigger | `cupping-validation-modal.tsx:606-616` (only place mounted) |
| Recipients prefill | `GET /api/samples/[id]/approval-recipients` + `src/lib/approval-notification/recipients.ts` |
| Send + annex + log | `POST /api/samples/[id]/notify-approval` |
| Cert PDF for preview | `GET /api/samples/[id]/certificate` (returns `application/pdf`; UUID or slug; `?contract_id=` for sub-cert) |
| Graph send | `src/lib/graph/send.ts` — sends from `qualitycontrol@wolthers.com`, on behalf of logged-in user |

Shared tables (same DB): `contracts` (has `contract_number`, `buyer_id`, `seller_id`, `buyer_reference`, `seller_reference`), `contacts`, `shipment_samples`, `documents`, `email_messages`.

## 5. Frontend — the send view

Replaces `approval-composer.tsx`. New files, each small and focused:

- `src/components/samples/approval-send-view.tsx` — full-screen overlay container. Loads prefill, holds panel state, renders the two panels + message + preview, owns the Send action.
- `src/components/samples/approval/recipient-panel.tsx` — one panel (seller or buyer): label, TO/CC chip rows, the panel's editable message body, derived greeting target.
- `src/components/samples/approval/recipient-chips.tsx` — chip input (add by typing email + Enter, remove with ×, invalid-email styling).
- `src/components/samples/approval/certificate-preview.tsx` — `<iframe>` pointed at `/api/samples/[id]/certificate`.

Layout (matches sys Sale Confirmation send screen):
- **Left column:** **SELLER panel (top)**, **BUYER panel (bottom)**. Each panel = TO chips, CC chips, and its own message body (greeting auto-rewrites to the panel's first non-group-mailbox TO contact). Below the panels: **Include HTML signature** toggle (default on), **attachment row** showing `{tracking_number}.pdf`, and a **Sandbox** toggle.
- **Right column:** certificate preview (BUYER COPY look) via iframe.
- **Footer:** "Send to both" button → POSTs the panel payload; shows per-panel success/failure.

> Note: the panel order (Seller top, Buyer bottom) follows the latest explicit decision; the original written request said "buyers on top." Trivial to flip — one prop.

## 6. API — recipients prefill

Extend `GET /api/samples/[id]/approval-recipients` to return a per-panel structure plus the email field data, and to use the sys recipient semantics.

Response shape:
```ts
{
  sample: {
    tracking_number, status,            // 'approved' | 'rejected'
    contract_number, sample_code, awb, courier_company,
    seller_reference, buyer_reference,
  },
  panels: {
    seller: { greeting, to: Chip[], cc: Chip[] },
    buyer:  { greeting, to: Chip[], cc: Chip[] },
  },
  certificateAvailable: boolean,
}
// Chip = { email, name, nickname, is_group_mailbox }
```

Recipient resolution upgraded to match sys (`src/lib/samples/resolve-recipients.ts` semantics) so WAQC and sys resolve the same people:
- Pull `contacts` for `[seller_id, buyer_id]` selecting `email, name, nickname, role, is_primary, is_group_mailbox, routing_purposes`.
- **Per panel TO:** contact whose `routing_purposes` includes `'sample_approvals'`, else `is_primary`, else first; union all `'sample_approvals'` contacts for that company. Drop a panel's TO if all candidates are internal (`@wolthers.com`).
- **CC:** the `qualitycontrol@wolthers.com` mailbox plus any group mailboxes / logistics-role contacts for that company; de-dup.
- **Greeting:** first non-group-mailbox TO contact's `nickname ?? name`; fallback `"{company fantasy/legal name} team"`.
- Still 400 when the sample is not contract-linked (client uses this as the open-gate).

Authorization unchanged: SSR `getUser()` → `canUserManageSample` before any service-role read.

## 7. API — send

Rework `POST /api/samples/[id]/notify-approval` to accept panels and send per panel.

Request:
```ts
{
  panels: Array<{
    side: 'seller' | 'buyer',
    to: string[], cc: string[],
    subject: string, bodyText: string,
  }>,
  includeCertificate?: boolean,   // default true
  includeSignature?: boolean,     // default true
  isSandbox?: boolean,
}
```

Server flow:
1. Auth: `getUser()` → `canUserManageSample`. Load sample (`status`, `contract_id`, `tracking_number`); 400 if not approved/rejected or not contract-linked.
2. Resolve cert PDF bytes once (cached → render fallback), reused as the attachment for every panel.
3. For **each panel**: send via `sendMail` from `qualitycontrol@wolthers.com` on behalf of the logged-in user, cert attached, HTML body from `approvalBodyToHtml` (+ signature when enabled). Sandbox interception (`MICROSOFT_GRAPH_TEST_RECIPIENT`) as today. Collect per-panel result.
4. **sys write-back** (section 8) — once, if ≥1 panel sent successfully.
5. Annex cert to the sys contract Docs (existing `documents` insert + `logistics-documents` upload) — once.
6. Log **one `email_messages` row per panel** (`metadata.source='sample_approval'`, `decision`, `side`, `sandbox`, requested values).
7. Return `{ results: [{ side, ok, error? }] }`.

Partial failure is reported per panel; the user can resend (idempotent — section 8).

## 8. sys write-back (`shipment_samples`)

Same DB, so write directly with the service-role client (after the `canUserManageSample` gate). Trigger: **on send**, when ≥1 email succeeded.

Match strategy (idempotent):
1. `contract_id = samples.contract_id` AND `waqc_ref = samples.tracking_number` → if found, UPDATE.
2. Else `contract_id` AND `sample_type='pss'`, latest `created_at` → if found, UPDATE.
3. Else INSERT a new row.

Columns written:
- UPDATE / INSERT: `status='approved'` (or `'rejected'`), `approved_by = <waqc user id string>` (column is `VARCHAR(100)`; sys stores the uuid string), `approved_date = today (YYYY-MM-DD)`, `certificate_url` = the annexed cert path/URL.
- INSERT also sets: `contract_id`, `sample_type='pss'`, `waqc_ref = samples.tracking_number`, `created_by = <waqc user id>`.
- Best-effort (only if the column exists): `approval_comments`, `notification_sent_at`, `notification_sent_by`, `notification_sent_to`. Wrap in try/catch so a missing column never fails the send.

Confirmed `shipment_samples` columns: `id, contract_id (NOT NULL FK contracts), shipment_id, sample_type ('pss'|'ss', default 'pss'), sample_code, courier_company, tracking_number (AWB), sent_date, received_date, bags, description, composition, destination, waqc_ref, status (default 'pending'), approved_by VARCHAR(100), approved_date DATE, certificate_url, rejection_reason, buyer_reference, notes, created_at, updated_at, created_by FK auth.users`. Only `set_updated_at` trigger fires on update — no cascade side-effects.

**Migration (verify first, paste SQL for the user to apply):** if `approval_comments` / `notification_sent_*` are absent, `ALTER TABLE shipment_samples ADD COLUMN IF NOT EXISTS ...`. If present, no migration needed. The write-back code is written to tolerate their absence regardless.

## 9. Email content (sys-style)

Per panel, prefilled subject + body (fully editable in the panel). Mirrors `lib/samples/render-approval-email.ts`:

- **Subject:** `Sample approved · {contract_number}` + (` · {sample_code}` when present). For a rejection: `Sample rejected · {contract_number}`.
- **Body:**
  ```
  Dear {greeting},

  Wolthers has approved the following sample.

  Contract: {contract_number}
  Seller ref: {seller_reference}      // omitted if null/T.B.I.
  Buyer ref: {buyer_reference}        // omitted if null/T.B.I.
  Sample: {SAMPLE_TYPE} · {sample_code|tracking_number}
  AWB: {awb} · {courier_company}      // omitted if null

  Best regards,
  Wolthers & Associates
  ```
- Field sources: `contract_number`, `seller_reference`, `buyer_reference` from the shared `contracts` row; `sample_code`, `awb`, `courier_company` from the matched `shipment_samples` row (or blank if none yet). HTML body via existing `approvalBodyToHtml`, with the user's signature appended when the toggle is on.

> The "Wolthers has approved" line and approver naming are editable; default shown above. Confirm wording during review if a different attributed approver is wanted.

## 10. Triggers (all three)

1. **Cupping finalize** — in `cupping-validation-modal.tsx`, replace `ApprovalComposer` with `ApprovalSendView`; keep the existing `approval-recipients` r.ok open-gate.
2. **Manual certificate override** — after `override-status-dialog.tsx` succeeds, the host (certificate view / sample detail) opens `ApprovalSendView` for the sample via an `onApproved` callback. This closes the gap that bit Anderson.
3. **Persistent "Send approval email" button** — in `sample-detail-modal.tsx` and the QC samples row (`src/app/samples/qc/page.tsx`), shown for `approved`/`rejected` contract-linked samples; opens `ApprovalSendView`. Always available for re-send.

## 11. Certificate (preview + attachment)

- **Preview:** iframe `src=/api/samples/[id]/certificate` (mother cert). Auth-gated; renders or serves cached PDF.
- **Attachment:** the same cert bytes attached to **each** panel email (resolved once server-side). Mother certificate only for v1; sub-contract certs out of scope here.

## 12. Security & correctness

- All server routes gate on `canUserManageSample` (SSR/RLS client) before any service-role action.
- Write-back uses the service-role client; `approved_by`/`created_by` use the WAQC user id (shared `auth.users`).
- Idempotent write-back prevents duplicate `shipment_samples` rows on resend.
- Sandbox path preserved end-to-end (interception + `email_messages.metadata.sandbox`).

## 13. Edge cases

- **No `shipment_samples` row yet** (contract shows 0 samples on sys): INSERT one on send (user-approved behavior).
- **Panel with no resolvable external recipients** (all internal/empty): that panel is shown empty and disabled; Send proceeds for the other panel.
- **Partial send failure:** report per panel; write-back fires if any panel succeeded; resend is safe.
- **Not contract-linked:** prefill 400s; the send view does not open (fall back to silent close).
- **Rejection:** same flow, "rejected" wording, `status='rejected'` write-back, rejection certificate attached.

## 14. Testing

- Unit: recipient resolution (routing_purposes union, internal-only drop, greeting fallback); subject/body builder (conditional ref/AWB lines); `shipment_samples` match/insert decision.
- Integration: `notify-approval` per-panel send (mock Graph), write-back update vs. insert, idempotent resend, sandbox interception, `email_messages` one-row-per-panel.
- Manual: approve via cupping finalize → view opens; approve via override → view opens; persistent button re-opens; sys contract shows the sample approved after send.

## 15. File summary

**New:** `approval-send-view.tsx`, `approval/recipient-panel.tsx`, `approval/recipient-chips.tsx`, `approval/certificate-preview.tsx`; `src/lib/approval-notification/shipment-sample-writeback.ts`.
**Modified:** `approval-recipients/route.ts`, `notify-approval/route.ts`, `lib/approval-notification/recipients.ts`, `cupping-validation-modal.tsx`, `override-status-dialog.tsx` (+ its host), `sample-detail-modal.tsx`, `samples/qc/page.tsx`.
**Removed:** `approval-composer.tsx`.
**Maybe:** migration adding `shipment_samples.approval_comments` / `notification_sent_*` (only if absent).
