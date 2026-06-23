# Partner Portal — Sub-project A: Foundation — Design Spec

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation planning
**Program:** WAQC Partner Portal (see `2026-06-22-partner-portal-program-overview.md`)
**Scope:** The authenticated partner-facing shell that later modules (B unified view, C Excel
export, D traceability) mount into.

## Why

QC clients have no authenticated place to follow their coffee. Sub-project A delivers the
**foundation**: a clean, professional, partner-facing portal they log into, scoped to their own
company, with a dashboard overview and two browse modes — plus the staff tooling to onboard
client users at scale. It deliberately does **not** include the deep cross-system lifecycle
timeline (B), Excel export (C), or traceability (D); it provides the shell and navigation those
mount into.

## Locked decisions

- **Audience:** all QC clients (one portal user → one company). Suppliers/buyers deferred (they
  scope by `seller_id`/`exporter_id` rather than `client_id`).
- **Access is read-only** (view + download; no editing of QC data).
- **Information architecture:** an Overview **dashboard** landing + **two browse modes**
  (by contract, by sample).
- **Onboarding:** a **staff-side admin UI** to invite client users is **in scope for A**.
- **Entry:** **one login, role-based redirect** (not a separate subdomain).
- **Visual direction:** the portal has **its own design language** — light & airy, **top
  navigation**, white background, generous whitespace, large readable type, soft shadows
  (not borders), a single restrained **olive `#556b2f`** accent. Distinct from the internal
  dark lab app. Built using the frontend-design approach so it reads as intentional, not
  templated.

## What already exists (reuse, do not rebuild)

- Auth: `/` login (email/password + Microsoft OAuth), `src/components/auth/login-form.tsx`,
  `src/app/auth/callback/route.ts`.
- Onboarding plumbing: `user_invitations` table + accept-invite flow
  (`src/app/auth/accept-invite/page.tsx`) + profile auto-creation trigger
  (`database/migrations/087_*`). Invitations carry `company_id` + `qc_role`.
- Roles incl. external `client` (`src/lib/supabase.ts`); `profiles.client_id` → companies.
- Company scoping: `canUserManageSample()` (`src/lib/auth/sample-access.ts`) + RLS
  (`20260528000010_*`) already restrict a user to samples where `client_id`/`end_client_id`
  matches their company.
- Route protection scaffold: `middleware.ts`.
- Data: existing samples query (`src/app/api/samples/route.ts`) and public certificate
  PDF/page (`src/app/certificate/[slug]`); email infra for sending invites.

## Design

### Entry & routing

- Keep the existing `/` login. Extend the **auth callback** and `middleware.ts` to redirect by
  role after authentication: `qc_role = 'client'` → `/portal`; internal staff → `/dashboard`.
- `middleware.ts` gates `/portal/*` to authenticated client-role users (admins allowed for
  preview); client-role users are redirected away from staff areas (`/dashboard`, `/clients`,
  `/samples`), and staff away from `/portal`.
- Add a small server-side helper (e.g. `getPortalUser()`) resolving the authenticated user's
  company + role for portal pages/APIs.

### Namespace & scoping

- New `/portal` route group, **read-only**. Every query is scoped to the user's company via
  `profiles.client_id`, reusing `canUserManageSample()` / RLS (defence in depth — the DB
  enforces scoping even if a query forgets to).

### Visual design language

- **Light & airy, top-nav.** White / near-white background, generous whitespace, large
  readable Inter, soft shadows instead of 0.5px borders, one olive accent (`#556b2f`) for
  primary actions/active state. Rounded cards consistent with the brand but lighter than the
  internal app. Optional light/dark toggle, light-first.
- This is a **separate component set** from the internal layout (do not reuse the internal
  left-sidebar shell); shared primitives (buttons, inputs, tables) may be reused/restyled.

### Portal shell (`/portal` layout)

- **Top navigation bar**: client logo (`qc_client_settings.logo_url`) on the left; nav items
  **Overview · Contracts · Samples · Certificates**, with **placeholder slots for Traceability
  (D) and Export/Reports (C)**; account menu + theme toggle on the right.
- Content area centered with comfortable max-width and whitespace. Keep the shell as its own
  module so B/C/D drop pages in without touching it.

### Overview dashboard (landing)

- **Status-rollup cards** for the **WAQC-knowable** stages — PSS pending/approved/rejected →
  SS → certified — driven by sample `workflow_stage`/`status`, approvals, and certificates.
- **Recent approvals/rejections** list (last N).
- A **shipped / in-transit** tile and a **recent/upcoming shipments** tile are **scaffolded in
  A but left empty/labelled "coming soon"** — they require the sys.wolthers.com shipment data
  that **B** wires via the cross-system merge. WAQC itself does not track shipped status, so A
  deliberately does not fake it; the dashboard is laid out to accept B's merge without rework.

### Browse modes (A builds the lists; the rich drill-down is B)

- **Contracts list** — the client's contracts with status rollups + search/filter. (Row →
  detailed PSS→SS→shipped timeline is **B**.)
- **Samples list** — flat, searchable, company-scoped table: tracking #, origin, quality,
  stage, approval, cert link. Reuses the existing samples query with client scoping.
- **Certificates** — the client's certificates with PDF download via the existing public cert
  endpoint.

### Onboarding admin UI (staff-side, in scope for A)

- A staff screen (under the existing admin/clients area) to **invite a QC client's users**:
  pick a `companies.is_qc_client` company, enter name/email, role `client` → create a
  `user_invitations` row (`company_id` + token) and email the invite (reuse existing email
  infra + accept-invite flow + profile auto-creation trigger).
- A **pending-invitations** list with resend / cancel.

## Out of scope for A (later sub-projects)

- B: per-contract PSS→SS→shipped→in-transit timeline + full cross-system merge.
- C: full-data Excel export.
- D: container-traceability tab.
- Supplier/buyer portal scoping.

## Modules / isolation

Keep these as focused units: `/portal` layout shell; Overview dashboard page; Contracts list
page; Samples list page; Certificates list page; the staff invite admin page; the
`getPortalUser()` / role-routing helper; portal-specific UI primitives. Each should be
understandable and testable on its own.

## Verification (end-to-end)

- Invite a test client user via the new admin UI → accept the invite → log in → land on
  `/portal` and see **only that company's** samples/contracts/certificates.
- Confirm the user is **blocked** from staff areas (`/dashboard`, `/clients`, `/samples`) and
  cannot read another company's data (RLS + middleware); confirm staff still land on
  `/dashboard`.
- Download a certificate PDF from the portal.
- Tests: role-based post-login redirect; `/portal` gating; company scoping (RLS + app layer);
  invitation create → accept → profile gets correct `client_id`/`qc_role`.
