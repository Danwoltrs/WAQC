# Client portal v2, piece 1: client accounts and hardening

**Date:** 2026-10-14
**Status:** design approved in conversation (sections 1 to 4); this document awaits Daniel's review
**Supersedes:** sub-projects B, C and D of `2026-06-22-partner-portal-program-overview.md`. Phase A's `/portal` is the starting point.

## 1. Goal

QC clients get real logins on qc.wolthers.com. Wolthers staff invite the first person at a client company and may make that person the company's admin. A company admin invites colleagues and partners (people working for the client) and manages what each of them can see and do. Nobody registers themselves.

Over five pieces, clients will see their own samples, certificates, dashboard, supplier review and reports; edit their own quality specs; and cup with Wolthers. They never see laboratories, finance, fees, internal comments or SAN numbers.

This document covers **piece 1**: the account model, inviting, the access gate, the security hardening that must exist before the first client logs in, and moving the four existing portal pages (overview, samples, contracts, certificates) onto the new gate.

| Piece | Content | Status |
|---|---|---|
| 1 | Accounts, inviting, gate, hardening, existing pages | this spec |
| 2 | Client views: dashboard, supplier review, reports, sample detail | later spec |
| 3 | Client quality specs (create/edit, version locking) | later spec |
| 4 | Cupping with Wolthers | later spec |

(The conversation numbered security and accounts as two pieces; they merged here because the account model is the security boundary.)

## 2. Locked decisions

1. **Build on sys's external-user model.** A QC client user is a sys external user: `user_profiles.user_type = 'external'` plus one row in `external_user_company_grants` per company, holding `views[]` and `capabilities[]`. One login serves both qc.wolthers.com and sys.wolthers.com.
2. **A partner is someone working for the client** (consultant, agent, sister company). They see the client's data, possibly with fewer keys. Not a separate supply-chain company.
3. **Invitation only, at every level.** No self-registration, no "register then we approve".
4. **No Wolthers approval on a company admin's invitations.** Every invitation email is CC'd to `wolthers@wolthers.com` (house rule), every change is logged, and global admins get an in-app notification.
5. **Only Wolthers staff grant `manage_users`** (company admin). Company admins never create other admins.
6. **QC client users have no WAQC `profiles` row.** Access comes from the grant only.
7. Never shown to clients: laboratories, finance and fees, internal comments, the real values behind an "approved with comments" lot (buyers see issued values), SAN tracking numbers.

## 3. Live state this design starts from (checked 2026-10-14)

- 25 auth users, 8 WAQC profiles (4 global admin, 1 global quality admin, 3 lab personnel). No client, supplier or buyer profile exists. sys has 6 external users (3 active, 3 invited) holding 5 grants. No non-internal user has a WAQC profile.
- **Fixed 2026-10-14** (commit `355faa18`, migration `20261014000000` applied): `/api/users/invite` was open to the internet; any user could rewrite their own `qc_role`.
- Still live:
  - Any signed-in non-external user can update and insert any `samples` row ("Authenticated users can update samples", `auth.uid() IS NOT NULL`), create certificates, insert cupping scores, write `qc_client_settings` ("QC staff full access" only checks that `get_user_qc_role()` is not null) and write `companies` (`companies_internal_all`).
  - Anonymous visitors can list every pending `user_invitations` row with its token ("Public can view pending invitations by token").
  - `middleware.ts` treats every `/api/*` path as public; 38 API routes use the service role, several with only a login check (for example `/api/cupping/scores/aggregate`).
  - The live `handle_new_user()` (on `auth.users`, owned by WAQC, fires for every new login on the shared database) creates a `lab_personnel` profile for any uninvited sign-in. 17 of 25 logins have no profile, so that branch probably fails silently in its `EXCEPTION` handler; it must not be relied on.
  - The existing `/portal` renders the SAN `tracking_number` and builds PDF links from it.
- sys facts this design depends on:
  - `current_user_is_external()` is `user_profiles.user_type = 'external'` (plus impersonation and staff preview). Every QC table carries a RESTRICTIVE `<table>_external_deny`, so an external user can read nothing from QC tables with their own JWT.
  - The `handle_new_user` insert into `user_profiles` (internal for `@wolthers.com`, otherwise **external / pending**) is sys's default-deny for strangers. A user with no `user_profiles` row counts as internal to sys and passes `companies_internal_all` and similar policies. **That insert stays.**
  - `external_user_company_grants.views` defaults to `{contracts,shipments,fixations,documents,samples}` and `capabilities` defaults to sys's default-on list. **WAQC must always write both arrays explicitly.**
  - `source` CHECK on grants: `contact`, `group`, `admin`, `manager`.
  - sys clamps (`clampToCeiling`, `clampViewsToCeiling` in `src/lib/portal/capabilities.ts`) drop any key not in its registry; the staff grant editor rejects unknown keys with 400.
  - Group access (sys migration 0770) copies a direct grant, including `manage_users`, to every company in a group with `share_portal_access`.
  - `portal_activity` (user_id, company_id, action, payload, actor names filled by trigger) is sys's audit table; team actions use `team_invite`, `team_invite_revoked`, `team_update`, `team_remove`.

## 4. Who is who

| Person | `user_profiles` (sys) | `profiles` (WAQC) | Access from |
|---|---|---|---|
| Wolthers QC staff | internal, or none | staff `qc_role` | role and lab, unchanged |
| QC client user | external, active | none | grants with `qc_` keys |
| Anyone else | whatever sys or the trigger wrote | none | nothing in WAQC |

**Staff** means: a `profiles` row with a non-null role other than `client`, `supplier`, `buyer`, and not external. External always wins: a user marked external is never staff, even if a stale profile exists.

### 4.1 Sign-up trigger (`handle_new_user`)

Rewrite from the live body (do not trust migrations on disk):

- Keep the `user_profiles` insert exactly as live (internal for `@wolthers.com`, external / pending otherwise, `ON CONFLICT DO NOTHING`).
- WAQC `profiles` row only when:
  - a pending, unexpired `user_invitations` row exists for the email **with a staff role** (not `client`, `supplier`, `buyer`), or
  - the email is `@wolthers.com` (unchanged defaults: `lab_personnel`, Santos lab, `qc_enabled`, the three admin emails as global admin).
- Everyone else: no `profiles` row.
- Paste-safety: the live body uses `SELECT ... INTO`; the rewrite must assign with `:=` or a `FOR ... LOOP` (the Supabase editor appends `ALTER TABLE <name> ENABLE RLS` for every `INTO <name>`).

### 4.2 Fallback profile creation

`src/app/auth/callback/route.ts` (`ensureUserProfile`) and `src/app/api/profiles/ensure/route.ts` follow the same rule: no profile for an external user or an uninvited non-`@wolthers.com` email. `auth-provider.tsx` stops trying to set its own `qc_role` (the guard now blocks it anyway).

### 4.3 Retiring Phase A's client role

- The staff invite route (`/api/users/invite`) refuses `client`, `supplier`, `buyer`; clients are invited through section 6.
- `src/app/api/portal/invitations/route.ts` and `src/components/portal/client-invite-dialog.tsx` are replaced by section 6.
- `profiles.client_id` stops being an access path (`src/lib/portal/portal-auth.ts`). The RESTRICTIVE `samples_client_select_own_company` policy stays; it is harmless with no client-role users.
- `resolveLandingPath`: external users land on `/portal`, staff on `/dashboard`.

## 5. Access keys

Each grant row holds sys keys and QC keys side by side.

| Key | Kind | Gives | Ships in |
|---|---|---|---|
| `qc_samples` | view | samples and contracts lists, sample detail (issued values only) | piece 1 (lists), piece 2 (detail) |
| `qc_certificates` | view | certificates list, PDF download | piece 1 |
| `qc_dashboard` | view | approvals, trends, supply-chain Sankey | piece 2 |
| `qc_supplier_review` | view | supplier ranking and performance | piece 2 |
| `qc_reports` | view | weekly, bi-weekly, annual reports | piece 2 |
| `qc_specs` | view | the company's quality specs | piece 3 |
| `qc_cupping` | view | cupping sessions they are invited to | piece 4 |
| `qc_spec_edit` | capability | create and edit the company's specs | piece 3 |
| `qc_cupping_score` | capability | score in those sessions | piece 4 |
| `manage_users` | capability | sys's existing key: manage the company's team; staff-only grant | piece 1 |

The overview page (`/portal`) needs any `qc_` view.

**Presets** (invite dialog, with custom checkboxes below):
- **Full:** every `qc_` key, not `manage_users`
- **Cupper:** `qc_samples`, `qc_certificates`, `qc_cupping`, `qc_cupping_score`
- **Viewer:** `qc_samples`, `qc_certificates`, `qc_dashboard`, `qc_reports`

**Ceiling:** a company admin can grant only keys they hold, and never `manage_users` (sys's existing rule). The grant staff give a company's first admin is therefore the company's limit.

**Registry, both repos:**
- WAQC: new `src/lib/portal/qc-keys.ts` — `QC_VIEWS`, `QC_CAPABILITIES`, labels, presets, `clampQcKeys(requested, ceiling)`. Pure, tested.
- sys: `src/lib/portal/capabilities.ts` learns the same keys so its clamps keep them and its staff editor accepts them. They stay out of `DEFAULT_VIEWS`, `DEFAULT_ON_CAPABILITIES` and the sys portal nav. A test on each side pins the key list; keep both lists identical.

**Writing grants from WAQC** always sets `views` and `capabilities` explicitly. Editing QC access on an existing grant replaces only the `qc_` keys and leaves every sys key as it was.

## 6. Inviting and managing people

### 6.1 Staff invite the first person

On `/clients/[id]` (`src/components/clients/client-detail-view.tsx`), a **Portal access** card replaces the Phase A "Invite portal user" button. It lists:
- people with any `qc_` key on this company (name, email, keys, admin badge, last sign-in)
- pending invitations (resend, cancel)
- recent portal activity for this company

**Invite** dialog: first name, last name, email, preset or custom keys, **Company admin** switch (`manage_users`, staff only). Route: `POST /api/clients/[id]/portal-invitations`, staff only (global admin, global quality admin, lab quality manager).

Outcomes by email:
- **Already an external user** (has a sys login): add the `qc_` keys to their grant on this company (create the grant with `source = 'admin'` and explicit arrays if none exists). Email: "the QC portal is now open to you", with a sign-in link. No invitation row.
- **Wolthers staff** (internal user or staff profile): refuse.
- **Otherwise:** create a `portal_invitations` row and send the invitation email.

### 6.2 Company admins invite colleagues and partners

`/portal/team`, shown only to a person holding `manage_users` on the current company. Same dialog without the admin switch. Keys are clamped to the admin's own grant. Any email domain. Routes under `/api/portal/team`. Outcomes by email are the same as in 6.1 (existing external user: keys added directly; staff: refused; otherwise: invitation).

A company admin can:
- invite, resend, cancel invitations
- change another member's `qc_` keys within their own ceiling
- remove another member's QC access

A company admin cannot change or remove another company admin, or themselves (staff do that from the Portal access card).

### 6.3 Invitation email

Sent through the existing Microsoft Graph path (`src/lib/graph/send.ts`) from the QC mailbox, with `HOUSE_CC` appended server-side (house rule). Content: company fantasy name, inviter name, what they will be able to see, the accept link, the 7-day expiry. Sandbox mode (`MICROSOFT_GRAPH_TEST_RECIPIENT`) behaves like the other QC emails.

### 6.4 Accepting

Link: `https://qc.wolthers.com/portal/accept?token=<token>`.

- `GET /api/portal/accept?token=` (public, service role): validates the token by hash; returns company fantasy name, inviter name, invited email, expiry. Invalid, used or expired tokens get one generic message.
- The page offers **Continue with Microsoft** or **Set a password**.
- `POST /api/portal/accept` (public, service role), body `{ token, method, password? }`:
  1. Re-validate the token; refuse if the email now belongs to staff.
  2. Create the auth user with the admin API (`email_confirm: true`; with the password when given). If an auth user already exists for the email and is external, reuse it.
  3. Upsert `user_profiles`: `user_type = 'external'`, `status = 'active'`, name, email. (The sign-up trigger will have inserted `external / pending`; this overwrites it.)
  4. Upsert the grant: explicit `views`/`capabilities` from the invitation, `manage_users` only if the invitation says company admin and was issued by staff, `source = 'admin'` (staff) or `'manager'` (company admin), `created_by` = inviter.
  5. Mark the invitation accepted; log `team_invite_accepted`.
- The page then signs them in (password) or starts the Microsoft sign-in, and lands on `/portal`.
- Because logins are created server-side, the Supabase "allow new users to sign up" setting does not matter to WAQC. That setting is shared with sys and is left alone.
- Later sign-ins: Microsoft, or email + password with "forgot password" (Supabase reset email).

### 6.5 `portal_invitations` table (new)

| Column | Notes |
|---|---|
| `id` uuid PK | |
| `company_id` uuid → companies | |
| `email` text | lowercased |
| `first_name`, `last_name` text | |
| `views`, `capabilities` text[] | QC keys only, already clamped |
| `is_company_admin` boolean | staff-issued only |
| `invited_by` uuid | |
| `invited_by_kind` text | `staff` or `manager` |
| `token_hash` text unique | SHA-256 of a 32-byte random token; the token itself is never stored |
| `status` text | `pending`, `accepted`, `cancelled`, `expired` |
| `expires_at`, `accepted_at`, `created_at` | 7-day expiry |
| `accepted_user_id` uuid | |

RLS enabled with no policies: service role only. One pending invitation per (company, email): a re-invite replaces the old token.

### 6.6 Removing access

Removing a person takes away the `qc_` keys from their grant on that company. If the grant then holds no keys at all and was created by WAQC, the grant row is deleted. Their login and any sys access are untouched. Group-copied rows (`source = 'group'`) are not edited from WAQC; sys owns group access.

### 6.7 Several companies

A second invitation for another company adds a second grant on the same login. The portal shows a company switcher only when the user holds QC keys on more than one company. The chosen company travels as `?company=<id>` and is always checked against the grants.

### 6.8 Logging and notification

Every invite, resend, cancel, accept, key change and removal writes a `portal_activity` row (`action` = `team_invite`, `team_invite_revoked`, `team_invite_accepted`, `team_update`, `team_remove`; `payload` carries `{ app: 'qc', keys_before, keys_after, target_email }`). Each also creates an in-app notification for global admins through `src/lib/notifications.ts`. The Portal access card reads the same activity rows.

## 7. Hardening

### 7.1 The portal gate

`requireQcPortal(request, { view?, capability? })` in `src/lib/portal/qc-portal-gate.ts`, used by every `/api/portal/*` route:

1. Signed-in user, else 401.
2. If the user is external: `user_profiles.status = 'active'`, else 403. Company = `?company=` if given, else their only QC company; it must have a grant holding at least one `qc_` key and the required key, else 403.
3. If the user is WAQC staff: allowed **read-only** for the company in `?company=` ("view as client"). Any write route rejects staff with 403 and points them to the staff pages.
4. Otherwise 403.

Returns `{ userId, companyId, keys, isStaffViewAs }`. Data is then read with the service role and filtered by that company on the server (samples where `client_id` or `end_client_id` = company). No portal route reads a company id from the body or trusts one from the browser without step 2.

### 7.2 Middleware

`middleware.ts` resolves the caller's access kind with one call to a new SQL function `waqc_access_kind()` (SECURITY DEFINER, STABLE, returns `staff`, `external` or `none` for `auth.uid()`).

| Kind | Pages | API |
|---|---|---|
| `external` | `/portal/**`, `/auth/**`, `/certificate/**`; anything else redirects to `/portal` | `/api/portal/**` and the public certificate API; anything else 403 |
| `staff` | everything (as today) | everything (as today) |
| `none` (signed in) | sign-in page with a "no access" message | 403, except `/api/portal/accept` and `/api/profiles/ensure` (which applies 4.2, so a new `@wolthers.com` colleague still gets their first profile) |
| not signed in | as today | public routes as today (`/api/portal/accept`, the staff invitation lookup from 7.3.2, public certificate, embed, `/api/auth/azure-signin`); other `/api/*` routes keep their own checks |

This closes the "any signed-in user" gap across all API routes, including the service-role routes that only check for a login. The `/embed/*` exception (sys token via postMessage) is unchanged.

### 7.3 Database

1. `handle_new_user` per 4.1.
2. Drop "Public can view pending invitations by token" on `user_invitations`. WAQC's staff accept page (`src/app/auth/accept-invite/page.tsx`) reads its invitation through a new server route instead of the anon client.
3. `waqc_is_staff()` SECURITY DEFINER helper (create it; the older `is_waqc_staff` never reached live): caller has a `profiles` row with a staff role and is not external.
4. RESTRICTIVE write policies (`FOR INSERT`, `FOR UPDATE`, `FOR DELETE`, `TO authenticated`, `USING/WITH CHECK (waqc_is_staff())`) on `samples`, `certificates`, `quality_assessments`, `cupping_sessions`, `cupping_scores`, `client_qualities`, `quality_templates`, `qc_client_settings`. Service-role routes are unaffected (service role bypasses RLS).
   - **Before writing them:** list every trigger and function that writes these tables (`pg_trigger`, plus sys's decision write-back and sample mirror) and check whether it runs as the invoking user. Any that runs for a sys user without a WAQC profile gets an explicit exception or is made SECURITY DEFINER. Get the live policy list from `pg_policies` first; do not trust migrations on disk.
5. All SQL is pasted for Daniel to apply, written paste-safe (no `SELECT ... INTO`, no word "into" in comments, verification as a final result set).

### 7.4 Existing portal pages onto the gate

Overview, samples, contracts, certificates and the certificate PDF route (`src/app/api/portal/*`, `src/app/portal/*`, `src/lib/portal/portal-*.ts`):
- switch from `requirePortalCompany` + session client to `requireQcPortal` + service role with explicit company filters
- **remove every SAN number**: show the certificate number, or the contract refs when there is no certificate yet
- certificate PDF links use the certificate id; the downloaded file is named by certificate number
- the shell (`src/components/portal/portal-shell.tsx`) gets its identity from a new `GET /api/portal/me` (name, companies, keys per company) instead of reading `profiles` in the browser, which external users cannot do
- nav (`src/components/portal/portal-nav.ts`) shows only pages the person's keys allow on the current company; **Team** appears with `manage_users`
- `src/components/layout/main-layout.tsx` redirects external users to `/portal` (middleware already enforces it)

## 8. Out of scope for piece 1

- Dashboard, supplier review, reports, sample detail (piece 2)
- Client quality specs (piece 3)
- Cupping, including the cupping API roster checks (piece 4)
- The public certificate link that is still guessable by number (report-route security pass)
- sys's `provisionUser` returning early for a user whose `user_profiles` row the trigger pre-created (a sys bug; note for the sys backlog)
- Supplier/exporter logins (sellers seeing their own results)

## 9. Known properties

- sys RLS scopes external reads by company (`current_user_company_ids()`), not by view keys. A QC-only client user can therefore read their own company's sys contracts through PostgREST with their JWT, even though the sys portal shows them nothing. These are their own contracts; accepted.
- Group access can copy a QC admin's grant (including `manage_users`) to sister companies when the group shares portal access. That is sys's existing behaviour and matches decision 2.

## 10. Risks

1. **Microsoft sign-in for a server-created user.** The accept flow pre-creates the auth user, then the person signs in with Microsoft. That relies on Supabase linking the Azure identity to the existing user by email, which needs a verified email claim from Azure. **First task of the plan: a spike to confirm it.** If it does not link, invited clients use email + password at launch and Microsoft follows.
2. **Restrictive write policies on busy tables.** A missed writer (trigger, sys path) would fail in production. Mitigation: the writer inventory in 7.3.4, the SQL check script in section 11, and applying table by table.
3. **Two repos, one key list.** The sys registry change must ship before or with WAQC's first grant write that includes `qc_` keys, or a sys team-panel edit could strip them. Pinned by tests on both sides.

## 11. Testing

- Unit (vitest): `clampQcKeys` and presets; the gate's decision table (external active/invited, missing grant, missing key, staff view-as read vs write, none); middleware path classification; token hashing and expiry; grant merge that preserves sys keys.
- Route tests for invite, accept (new user, existing external user, staff email refused, expired token, reused token), team edits (ceiling, cannot touch admins).
- SQL check script, run as each kind by setting `request.jwt.claims` inside a rolled-back transaction: external user reads zero rows from QC tables; a signed-in user with no WAQC profile cannot write QC tables; staff can.
- One end-to-end run on production after deploy: staff invite a test address, accept with password, see only that company, admin invites a colleague, colleague signs in, admin removes them.

## 12. Gotchas for implementers

- Live functions and policies have drifted from the migration files. Read them from `pg_get_functiondef` / `pg_policies` before replacing anything.
- Supabase editor: no `SELECT ... INTO`, no `RETURNING ... INTO`, no `CREATE TABLE` inside functions; top-level `CREATE TABLE` must enable RLS itself. Lint pasted SQL for the word "into".
- `route.ts` files export only handlers (`next build` rejects helper exports).
- Fantasy names for every company label (`companyDisplayName()`).
- Never render `tracking_number`.
- Files stay under ~2000 lines.
- Stage only your own paths; Daniel commits concurrently. Push only when asked.
