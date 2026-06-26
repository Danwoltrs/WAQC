# QC Certificate Contacts — Design Spec

- **Date:** 2026-06-26
- **Status:** Approved (brainstorming) — pending implementation plan
- **Repo:** WAQC (qc.wolthers.com)

## Problem

Today, the only way to control who at a counterparty receives QC certificates is the
**Contacts tab on companies in sys.wolthers.com** — specifically the "SENDS → QC certificates"
checkbox, which writes `qc_certificates` into `contacts.routing_purposes`. The WAQC QC team
cannot see or manage that recipient list from their own app, and when a company has **no**
QC-certificate recipient configured, certificates are silently not sent:

- **Batch send** (`Send unsent certificates`): `buildBatchUnits` skips any company whose
  recipient panel has an empty `to`, bucketing it into `skipped.noRecipients`. The unit never
  reaches the UI and no one is prompted.
- **Single send** (`Send approval email`): the empty side is quietly omitted before dispatch.

This spec adds a WAQC-side **QC certificate contacts** feature with two touchpoints that share
one write primitive.

## Key facts (verified)

- WAQC and sys.wolthers.com point at the **same Supabase project** (`ojyonxplpmhvcgaycznc`).
  The `contacts` table is one shared table — any write from WAQC is visible in sys instantly.
  "Always in sync" is automatic; no replication is built.
- The `qc_certificates` tag lives in `contacts.routing_purposes text[]`. It is the **only**
  signal for QC-certificate recipients (no fallback to a "primary" contact) — see
  `src/lib/approval-notification/resolve-panels.ts` (`QC_CERTIFICATES_PURPOSE`, `hasPurpose`,
  `isInternal`, `HOUSE_CC`).
- WAQC's email routing reads base `contacts` filtered by `company_id` (NOT the
  `company_effective_contacts` view), so group-shared contacts are already invisible to routing.
- Live `contacts` columns (from `src/lib/database.types.ts`) include everything we need:
  `id, company_id, email, name, nickname, phone, whatsapp, preferred_language, role, is_group,
  is_primary, is_active, routing_purposes, notes, created_by, created_at, updated_at`. There is a
  partial unique index on `(company_id, lower(email)) WHERE email IS NOT NULL`. **No migration to
  `contacts` is required** (sys owns its lifecycle/schema).
- WAQC already constructs service-role Supabase clients inline in routes
  (`src/app/api/certificates/route.ts:13-15`, env `SUPABASE_SERVICE_ROLE_KEY`), and its sys
  write-back modules take a `SupabaseClient` by dependency injection
  (`src/lib/approval-notification/shipment-sample-writeback.ts`,
  `sys-decision-writeback.ts`).

## Locked decisions

1. **Capability:** View **and manage** QC recipients — add/remove people & group inboxes, toggle
   who receives certificates, edit core fields (name, greeting/nickname, email, language,
   phone/WhatsApp, group flag). The other SENDS settings (sale confirmations, fixation, shipping,
   bag marking, etc.) stay **sys-only**.
2. **Placement:** A **Contacts tab on the company detail page** (`/clients/[id]`), mirroring sys.
   The Clients list already includes all companies (`is_qc_client=all` mode in
   `src/app/api/clients/route.ts`), so sellers/exporters are reachable, not just QC clients.
3. **Write path:** **Approach A** — WAQC server routes + service-role client + a shared
   `upsertQcContact` helper. Authorization enforced in-route (authenticated Wolthers staff). No
   dependency on whatever the sys-side `contacts` RLS gates on; all write logic stays server-side.
4. **Build order:** **Phase 1 (tab) first**, then **Phase 2 (send-flow capture)**.

## Architecture: one primitive, two surfaces

The whole feature reduces to one operation — *"make this email a QC-certificate recipient for
company X"* — an **upsert keyed by `(company_id, email)`** that powers both the management tab and
the reactive send-flow capture.

### Section 1 — shared write module (`src/lib/qc-contacts/`)

A small server module (service-role `SupabaseClient` injected, matching the write-back pattern)
exposing three operations:

**`upsertQcRecipient({ companyId, email, name?, nickname?, isGroup, phone?, whatsapp?, preferredLanguage? }, actorId)`**
1. Match an existing row by `company_id` + case-insensitive `email` (mirrors the
   `(company_id, lower(email))` index).
2. **If found:** add `'qc_certificates'` to `routing_purposes` as a **set-union** (never clobbers
   existing sys tags like `shipping_documents`/`fixation_letters`); set `is_active = true`
   (revives a deactivated contact); fill only **blank** fields from the passed values; leave
   existing `is_group` untouched.
3. **If not found:** insert a new row — `routing_purposes: ['qc_certificates']`, `is_active: true`,
   `is_group` from the person/group answer, `created_by: actorId`, `name` falling back to the
   email's local-part when none is given.
4. Returns the resulting contact row.

**`setQcCertTag(contactId, on: boolean)`**
- `on=true`: add `'qc_certificates'` (tab toggle).
- `on=false`: remove **only** `'qc_certificates'` from `routing_purposes`; leave the row alive
  (it may still serve sys's other purposes). **Never deletes.**

**`updateQcContactFields(contactId, { name?, nickname?, email?, phone?, whatsapp?, preferredLanguage?, isGroup? })`**
- Explicit field edits from the tab. Catches unique-violation (`23505`) on an email change and
  returns a friendly "that email already exists for this company."

**Edge cases (all surfaces):**
- **Internal `@wolthers.com` addresses:** allowed but warned in the UI — the resolver treats them
  as automatic head-office CC (`HOUSE_CC`), so they won't appear as a TO recipient.
- **Re-adding a deactivated contact** reactivates it (`is_active = true`).
- **Preserve other tags:** union/removal only ever touches the `qc_certificates` element.
- **Out of scope (v1):** group-shared contacts (`company_groups` / `group_id`). WAQC reads/writes
  base `contacts` by `company_id`, exactly matching current email-routing behavior, so the tab
  shows precisely who actually gets emailed.

### Section 2 — Phase 1: Contacts tab

**API routes** (service-role, auth-gated, delegating to Section 1):
- `GET /api/companies/[id]/qc-contacts` — active `qc_certificates`-tagged contacts for the
  company, split into people vs group inboxes, ordered primary-first then name.
- `POST /api/companies/[id]/qc-contacts` — add a recipient → `upsertQcRecipient`.
- `PATCH /api/companies/[id]/qc-contacts/[contactId]` — edit fields → `updateQcContactFields`.
- `DELETE /api/companies/[id]/qc-contacts/[contactId]` — "remove from QC certificates" →
  `setQcCertTag(false)` (untag, **not** delete).

**UI** — a new `Contacts` tab in `src/components/clients/client-detail-view.tsx` (next to the
existing tabs), implemented in `src/components/clients/qc-contacts-tab.tsx`, following existing
tab + card styling (light/dark per CLAUDE.md palette). Simplified two-pane layout inspired by sys:
- **Left:** list of this company's QC-cert recipients — initials/avatar, name, and a
  `Person` / `Group inbox` sub-label; `+ Add` at top. Empty state: "No one at {company} receives
  QC certificates yet."
- **Right:** detail/edit form for the selected contact — Name, Nickname (greeting), Email, Phone,
  WhatsApp, a Person ⟷ Group-inbox toggle, Preferred language (EN/PT/DE/FR/ES), and a
  "Remove from QC certificates" action. One lifted draft + a single Save (matching the cert-editor
  pattern), Discard to revert.
- **No** `qc_certificates` checkbox grid — being in this list *is* the tag. A small
  "Managed in sys.wolthers.com" hint clarifies that the other SENDS settings live in sys.

### Section 3 — Phase 2: send-flow capture (batch + single)

Core change: **stop silently dropping companies with no recipients.** Every buyer and seller is
surfaced; a missing one becomes an inline capture step.

**Batch path** (`Send unsent certificates` + select-and-send):
- `src/lib/approval-notification/batch-send.ts` — `buildBatchUnits` no longer `continue`s on
  empty `to`; it emits the unit with `needsRecipients: true` plus the resolved `companyId`/side/
  company name. `src/app/api/certificates/batch-send/queue/route.ts` stops bucketing these into
  `skipped.noRecipients`.
- `src/components/certificates/batch-approval-send-view.tsx` — a `needsRecipients` unit renders in
  the normal carousel but is **blocked from Send** until ≥1 recipient is added, replacing today's
  dead-end amber "no recipients configured" text with the capture form.

**Single path** (`src/components/samples/approval-send-view.tsx`):
- The empty side is no longer omitted — it shows the same capture form; Send for that side unlocks
  once a recipient exists. `src/app/api/samples/[id]/approval-recipients/route.ts` already resolves
  `buyerId`/`sellerId`; surface them to the view so the capture form knows which company to write.

**Inline capture form** (shared component used by both composers): the existing free-text email
chip input (`src/components/samples/approval/recipient-chips.tsx`), plus, when an email is entered:
1. **Group or person?** — toggle (person → optional name for the greeting; group → address only).
2. **Save for the future?** — checkbox *"Also save as a QC-certificate recipient for {company}."*
   Checked → `POST /api/companies/[id]/qc-contacts` (the Section 1 upsert) so it's tagged for next
   time; unchecked → used for this send only (today's ephemeral-chip behavior).

The send routes (`src/app/api/samples/[id]/notify-approval/route.ts`,
`src/app/api/certificates/batch-send/route.ts`) are unchanged in **how** they dispatch — they
still receive a final `to`/`cc` list. Persistence happens via the qc-contacts endpoint **before**
send, so a failed save surfaces before the email goes out; the existing `to.length > 0` server
guards stay as the backstop.

## Error handling

- Unique-violation (`23505`) on email → friendly inline message, never a 500.
- Internal-address warning as above.
- Service-role writes are auth-gated in-route to authenticated Wolthers staff (same as all WAQC
  routes); the route resolves the acting user for `created_by`.

## Testing

- **Unit (`src/lib/qc-contacts/`):** `upsertQcRecipient` — new insert; tag-union preserves other
  routing purposes; revive deactivated; blank-fill only. `setQcCertTag(false)` — untags, does not
  delete. `updateQcContactFields` — 23505 mapped to friendly error.
- **Unit (`src/lib/approval-notification/batch-send.ts`):** `buildBatchUnits` now surfaces
  empty-recipient units with `needsRecipients` instead of skipping.
- **Component:** tab CRUD round-trip; capture form's persist-vs-ephemeral branch (group/person +
  save-for-future). Extend the existing `approval-notification` / `batch-send` suites.

## Out of scope (v1)

- Editing the non-QC SENDS settings (sys-only).
- Group-shared contacts via `company_groups` / `group_id`.
- A standalone top-level Contacts directory or command-palette entry (placement is the detail-page
  tab only).

## Key file anchors

| Concern | File |
| --- | --- |
| Recipient resolution / `qc_certificates` tag | `src/lib/approval-notification/resolve-panels.ts` |
| Single recipient prefill (has buyerId/sellerId) | `src/app/api/samples/[id]/approval-recipients/route.ts` |
| Single composer UI | `src/components/samples/approval-send-view.tsx`, `src/components/samples/approval/recipient-panel.tsx`, `recipient-chips.tsx` |
| Single send/dispatch | `src/app/api/samples/[id]/notify-approval/route.ts` |
| Batch queue builder | `src/app/api/certificates/batch-send/queue/route.ts` |
| Batch units (skip-empty today) | `src/lib/approval-notification/batch-send.ts` |
| Batch composer UI | `src/components/certificates/batch-approval-send-view.tsx` |
| Batch send/dispatch | `src/app/api/certificates/batch-send/route.ts` |
| Shared types | `src/lib/approval-notification/types.ts` |
| Client detail tabs (tab host) | `src/components/clients/client-detail-view.tsx` |
| Clients list (all-companies mode) | `src/app/api/clients/route.ts` |
| Service-role client pattern to copy | `src/app/api/certificates/route.ts:13-15` |
