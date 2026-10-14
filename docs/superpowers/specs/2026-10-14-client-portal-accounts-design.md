# Client portal v2, piece 1: client accounts and hardening

**Date:** 2026-10-14
**Status:** design approved in conversation (sections 1 to 4); this document awaits Daniel's review. **Amended 2026-10-14** after sys `origin/main` moved the same day (portal admins & partners D3/D4, invite-only, migration 0871): QC's admin key is now the QC-owned `qc_manage_users` (decision 5), group rows never count as QC access, account status decides invites and accepts, and invitation mail is no longer copied to head office with its link. **Revised again 2026-10-14 (ruling R11):** QC access moves out of sys's `external_user_company_grants` into WAQC's own table `qc_portal_access` (decision 10, §5.1), because sys grants data access on the mere existence of a grant row; the sys change that taught sys to keep `qc_` keys is dropped.
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

1. **Build on sys's identity model.** A QC client user is a sys external user: `auth.users` plus `user_profiles.user_type = 'external'`, with sys's `status` rules. One login serves qc.wolthers.com and, when sys grants them a company, sys.wolthers.com. *Revised 2026-10-14 (ruling R11; was: "plus one row in `external_user_company_grants` per company"):* QC access is one row per company in WAQC's own `qc_portal_access` (decision 10).
2. **A partner is someone working for the client** (consultant, agent, sister company). They see the client's data, possibly with fewer keys. Not a separate supply-chain company.
3. **Invitation only, at every level.** No self-registration, no "register then we approve".
4. **No Wolthers approval on a company admin's invitations.** Head office (`wolthers@wolthers.com`, house rule) gets a copy of every invitation, every change is logged, and global admins get an in-app notification. *Revised 2026-10-14:* the copy is a separate, link-free summary ("<inviter> invited <email> to <company>'s QC portal"), and the invitee's email carries no CC. The accept link sets the account's password, so a copy of it is a credential leak; sys removed the same kind of copy that day (`bf7e59985`).
5. **Only Wolthers staff appoint a QC company admin**, and company admins never create other admins. The QC admin key is QC's own `qc_manage_users`, kept in the person's `qc_portal_access.capabilities`, which sys never reads or writes. *Revised 2026-10-14 (was: "only staff grant sys's shared `manage_users`"):* sys D3 (`6f314e9c0`, the same day) lets any sys portal admin grant `manage_users`, and a QC-only holder of `manage_users` became a sys People-panel admin whose empty sys ceiling strips sys views from the members they edit. With a shared key this decision could not hold. *Revised again the same day (R11):* the key first moved to a `qc_` key on sys's grant rows, then out of sys's tables altogether (decision 10). Cost: a person who should administer both portals needs two switches (sys and QC).
6. **QC client users have no WAQC `profiles` row.** Access comes from their `qc_portal_access` rows only.
7. Never shown to clients: laboratories, finance and fees, internal comments, the real values behind an "approved with comments" lot (buyers see issued values), SAN tracking numbers.
8. **QC access is granted per company** (added 2026-10-14): one `qc_portal_access` row per person and company. sys's group access (migration 0770, copies of a sister company's grant) never touches it. *(Revised by R11; was: "on direct grant rows only; group rows never count and rows WAQC creates set `group_access = false`".)*
9. **WAQC never reads or writes sys's `external_user_company_grants`, nor sys `contacts`** (added 2026-10-14, widened by R11). So it never touches `manage_users`, `staff_locked`, `group_access` or group rows either. *(Was: "never writes `manage_users`, `staff_locked` or `contacts`; its only reading of `manage_users` is the removal rule".)*
10. **QC access lives in WAQC's own table `public.qc_portal_access`** (added 2026-10-14, ruling R11; §5.1). Why: sys grants data access on grant-row **existence**. Its RLS helper `current_user_company_ids()`, `/api/shipments` and `requirePortalRead` without a capability open a company's contracts (prices included), documents and shipments to anyone who has a grant row for that company, whatever keys the row holds, and the group trigger (0770) copies rows to sister companies. Every QC-only grant row WAQC would have created, and every sys Remove that kept a row for its `qc_` keys, would have leaked that data. Fixing sys's gates means changing a core RLS helper plus about 15 sys call sites owned by another active session; a separate table isolates QC completely and needs no sys change. The sys branch that taught sys to keep `qc_` keys (`feat/keep-qc-grant-keys`) is dropped unpushed; its Remove-keeps-row path would itself have leaked. Cost: QC access is not visible on sys staff screens (WAQC's Portal access card shows it), and a person in both portals has two access records.

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
  - **sys grants data access on grant-row existence** (found 2026-10-14 in the Task 3 review; the reason for decision 10): `current_user_company_ids()` (the RLS helper behind external reads), `/api/shipments` and `requirePortalRead` without a capability open a company to anyone with a grant row for it, whatever its `views` and `capabilities`. View keys only shape the sys portal's pages.
  - `current_user_is_external()` is `user_profiles.user_type = 'external'` (plus impersonation and staff preview). Every QC table carries a RESTRICTIVE `<table>_external_deny`, so an external user can read nothing from QC tables with their own JWT.
  - The `handle_new_user` insert into `user_profiles` (internal for `@wolthers.com`, otherwise **external / pending**) is sys's default-deny for strangers. A user with no `user_profiles` row counts as internal to sys and passes `companies_internal_all` and similar policies. **That insert stays.**
  - sys's grant table, for the record (since R11 WAQC never reads or writes it; these facts are why): `external_user_company_grants.views` defaults to `{contracts,shipments,fixations,documents,samples,dashboard}` (0860) and `capabilities` to sys's ten default-on keys (0871); sys backfill migrations (0316, 0354, 0743, 0799, 0860, 0868, 0871) append new default-on keys to **every** grant row; the `source` CHECK is `contact`, `group`, `admin`, `manager`; sys clamps drop any key not in its registry and the staff grant editor rejects unknown keys with 400; group access (0770) copies a direct grant's keys verbatim to every company in a group with `share_portal_access`, as `source = 'group'` rows. None of this reaches `qc_portal_access`.
  - sys D3/D4 (2026-10-14): any sys portal admin may promote or demote `manage_users` within their ceiling; portal routes refuse self, `staff_locked` (Wolthers-appointed admins) and `source = 'group'` rows (`canPortalEditGrant`). This is why QC's admin key is QC's own (decision 5).
  - sys activation (`invited` → `active`) happens at the person's first sys sign-in and applies their staged sys grants then, and only Wolthers switches a `disabled` account back on. WAQC therefore never activates an `invited` account and never revives a `disabled` one (§6.1, §6.4).
  - sys company merges re-point every foreign key to `companies` generically (`024_merge_companies`, refined in 0694), deleting rows that would collide on a unique key; `qc_portal_access` should follow a merge like any other table (to be confirmed on the first merge after ship).
  - `portal_activity` (user_id NOT NULL → `user_profiles`, company_id, action, payload, actor names filled by trigger from `user_id`) is sys's audit table; team actions use `team_invite`, `team_invite_revoked`, `team_update`, `team_remove`.

## 4. Who is who

| Person | `user_profiles` (sys) | `profiles` (WAQC) | Access from |
|---|---|---|---|
| Wolthers QC staff | internal, or none (non-Wolthers staff may also carry an external row) | staff `qc_role` with `qc_enabled` true | role and lab, unchanged |
| QC client user | external, active | none | `qc_portal_access` rows (`qc_` keys) |
| Anyone else | whatever sys or the trigger wrote | none | nothing in WAQC |

**Access kind** (`waqc_access_kind()` in SQL, `classifyAccessKind` in TypeScript; the first rule that matches wins):

1. a `user_profiles` row with status `disabled` → **none**;
2. a `profiles` row with a non-null role other than `client`, `supplier`, `buyer` and `qc_enabled` true → **staff**;
3. a `user_profiles` row with `user_type = 'external'` (any other status) → **external**;
4. anyone else → **none**.

Why this order: sys's Disabled is the account kill switch, so it switches WAQC off too; sys writes an external / pending placeholder for every new login, so non-Wolthers lab staff can carry one, and staff therefore comes before external; `qc_enabled` (default false, set only by staff invitations, `@wolthers.com` sign-up and admins, never by the person) keeps the stale `lab_personnel` profiles from the old open sign-up out of staff.

### 4.1 Sign-up trigger (`handle_new_user`)

Rewrite from the live body (do not trust migrations on disk):

- Keep the `user_profiles` insert exactly as live (internal for `@wolthers.com`, external / pending otherwise, `ON CONFLICT DO NOTHING`), but outside any `EXCEPTION` handler: if it fails, the sign-up fails, because a login with no `user_profiles` row counts as internal to sys.
- WAQC `profiles` row only when:
  - a pending, unexpired `user_invitations` row exists for the email **with a staff role** (not `client`, `supplier`, `buyer`), or
  - the email is `@wolthers.com` (unchanged defaults: `lab_personnel`, Santos lab, `qc_enabled`, the three admin emails as global admin).
- Everyone else: no `profiles` row.
- The WAQC `profiles` part runs in its own `BEGIN ... EXCEPTION` block, so a failure there (it is skipped with a warning; `ensureWaqcProfile` creates the profile at first sign-in) can never roll back the `user_profiles` row. No enum casts: the live `profiles.qc_role` is `character varying`.
- Paste-safety: the live body uses `SELECT ... INTO`; the rewrite must assign with `:=` or a `FOR ... LOOP` (the Supabase editor appends `ALTER TABLE <name> ENABLE RLS` for every `INTO <name>`; `INSERT INTO <table>` is harmless).
- Known sys finding, not fixed in this piece: sys's `inviteExternalUser` (invite-only) inserts an `invited` `user_profiles` row right after `generateLink` creates the auth user, which collides (23505) with this trigger's insert for brand-new addresses. The fix belongs on sys (take over an `external`/`pending` row with no grants).

### 4.2 Fallback profile creation

`src/app/auth/callback/route.ts` (`ensureUserProfile`) and `src/app/api/profiles/ensure/route.ts` follow the same rule: no profile for an external user or an uninvited non-`@wolthers.com` email. `auth-provider.tsx` stops trying to set its own `qc_role` (the guard now blocks it anyway).

### 4.3 Retiring Phase A's client role

- The staff invite route (`/api/users/invite`) refuses `client`, `supplier`, `buyer` (400 for a global admin; a lab quality manager keeps its 403 for any role outside their scope); clients are invited through section 6.
- `src/app/api/portal/invitations/route.ts` and `src/components/portal/client-invite-dialog.tsx` are replaced by section 6.
- `profiles.client_id` stops being an access path (`src/lib/portal/portal-auth.ts`). The RESTRICTIVE `samples_client_select_own_company` policy stays; it is harmless with no client-role users.
- `resolveLandingPath`: external users land on `/portal`, staff on `/dashboard`, everyone else on `/auth/no-access`.

## 5. Access keys

QC keys live in WAQC's own table `qc_portal_access` (§5.1), never on sys's grant rows. sys's grant rows hold sys keys only, and WAQC never reads them.

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
| `qc_manage_users` | capability | QC company admin: manage the company's QC team (`/portal/team`); set only by Wolthers staff through the Company admin switch, never by a preset or the clamp | piece 1 |

sys's own `manage_users` is sys's key: it makes someone a sys portal admin, not a QC admin, and WAQC never grants or removes it (until 2026-10-14 this table listed `manage_users` as a shared key; see decision 5).

The overview page (`/portal`) needs any `qc_` view.

**Presets** (invite dialog, with custom checkboxes below):
- **Full:** every `qc_` view and capability, not `qc_manage_users`
- **Cupper:** `qc_samples`, `qc_certificates`, `qc_cupping`, `qc_cupping_score`
- **Viewer:** `qc_samples`, `qc_certificates`, `qc_dashboard`, `qc_reports` (with `qc_samples` the Viewer sees Contracts too)

**Ceiling:** a company admin can grant only keys they hold, and never `qc_manage_users`. The keys staff give a company's first admin are therefore the company's limit.

**Registry:** WAQC's `src/lib/portal/qc-keys.ts` — `QC_VIEWS`, `QC_CAPABILITIES`, `QC_MANAGE_USERS`, labels, presets, `clampQcKeys(requested, ceiling)`, `hasQcView`, `isCompanyAdmin`. Pure, tested. sys knows nothing of QC keys.

*Superseded 2026-10-14 (R11):* the sys ownership rule (`keepForeignKeys`: sys keeps the `qc_` keys a grant row already has on every sys write, a sys removal strips only sys keys) and WAQC's grant-row helpers (`mergeQcKeys`, `isQcAccessRow`, `holdsQcKey`) are gone. With QC access in its own table, sys has nothing to keep and WAQC nothing to merge.

**Writing QC access** goes through `setQcAccess` (upsert on the person and company: both arrays explicit, keys normalized, `qc_manage_users` added or cleared only by the staff admin flag and otherwise kept, `created_by` set when the row is created) and `removeQcAccess` (delete the row).

### 5.1 `qc_portal_access` table (new, ruling R11)

| Column | Notes |
|---|---|
| `user_id` uuid → `user_profiles(id)` ON DELETE CASCADE | the person (sys identity) |
| `company_id` uuid → `companies(id)` ON DELETE CASCADE | the client company |
| `views`, `capabilities` text[] NOT NULL DEFAULT `'{}'` | `qc_` keys only: a CHECK (`qc_keys_only()`) refuses anything else; `qc_manage_users` in `capabilities` = QC company admin |
| `created_by` uuid → `auth.users(id)` ON DELETE SET NULL | who first gave access |
| `created_at`, `updated_at` timestamptz | |

Primary key `(user_id, company_id)`; index on `company_id`. RLS enabled with no policies, `REVOKE ALL FROM anon, authenticated`: service role only, like `portal_invitations`. Migration `20261014000006`, applied together with `20261014000001` before the WAQC push. Deleting the person or the company deletes their QC access. A row gives no sys access of any kind.

## 6. Inviting and managing people

### 6.1 Staff invite the first person

On `/clients/[id]` (`src/components/clients/client-detail-view.tsx`), a **Portal access** card replaces the Phase A "Invite portal user" button. It lists:
- people with a `qc_portal_access` row on this company (name, email, keys, admin badge, last sign-in from `auth.users`); sys grants never appear
- pending invitations (resend, cancel)
- recent portal activity for this company

**Invite** dialog: first name, last name, email, preset or custom keys, **Company admin** switch (`qc_manage_users`, staff only). Routes: `/api/clients/[id]/portal-access` (GET, POST), `/api/clients/[id]/portal-access/[userId]` (PATCH, DELETE), `/api/clients/[id]/portal-access/invitations/[invitationId]` (resend, cancel); staff only (global admin, global quality admin, lab quality manager).

Outcomes by email:
- **An `@wolthers.com` address** (with or without an account): refuse (400).
- **Wolthers staff or a partner account** (internal user, staff profile, any non-external user type): refuse (409).
- **An external user, by sys `user_profiles.status`:**
  - `active`: write their `qc_portal_access` row for this company (their `user_profiles` row and any sys grant stay exactly as they are). Email: "the QC portal is now open to you", with a sign-in link. No invitation row.
  - `disabled`: refuse (409, "switched off; Wolthers must switch the account back on"). Only Wolthers switches an account back on, in sys; doing it here would also revive their sys access.
  - `invited`: refuse (409, "pending Wolthers portal invitation; add QC access after their first sign-in"). sys activates the account itself at the first sign-in and applies its staged sys grants then; the QC gate needs an active account anyway.
  - `pending` (the sign-up trigger's row): treated as no account.
- **Otherwise:** create a `portal_invitations` row and send the invitation email.
- A lookup error invites nobody (500).

### 6.2 Company admins invite colleagues and partners

`/portal/team`, shown only to a person holding `qc_manage_users` in their `qc_portal_access` row on the current company (sys's `manage_users` does not count). Same dialog without the admin switch. Keys are clamped to the admin's own keys. Any email domain except `@wolthers.com`. Routes under `/api/portal/team`. Outcomes by email are the same as in 6.1, plus: when the address belongs to an active account that already has a `qc_portal_access` row on this company, that row first passes the team guard below, and a person who already has a row here is refused (409, "edit them in the team list"). Otherwise a company admin could rewrite an admin's QC keys, or their own, by "inviting" that address.

A company admin can:
- invite, resend, cancel invitations (not a staff-issued admin invitation)
- change another member's `qc_` keys within their own ceiling
- remove another member's QC access

A company admin cannot change or remove another QC company admin or themselves (staff do both from the Portal access card). sys portal access, sys admin status included, plays no part on the QC team.

### 6.3 Invitation email

Sent through the existing Microsoft Graph path (`src/lib/graph/send.ts`) from the QC mailbox to the invitee alone, with no CC: the accept link sets the account's password. Content: company fantasy name, inviter name, what they will be able to see, the accept link, the 7-day expiry. Head office (`HOUSE_CC`, house rule) gets a separate copy without the link for every invitation, resend and access email: "<inviter> invited <email> to <company>'s QC portal" and the access list. Sandbox mode (`MICROSOFT_GRAPH_TEST_RECIPIENT`) redirects both, like the other QC emails. The Supabase password-recovery email (§6.4) is an auth credential, not a QC email, and is exempt from the house copy.

### 6.4 Accepting

Link: `https://qc.wolthers.com/auth/portal-invite?token=<token>` (under `/auth`, outside the signed-in portal shell; the API stays `/api/portal/accept`).

- `GET /api/portal/accept?token=` (public, service role): validates the token by hash; returns company fantasy name, inviter name, invited email, expiry. Invalid, used or expired tokens get one generic message.
- The page offers **Continue with Microsoft** or **Set a password**.
- `POST /api/portal/accept` (public, service role), body `{ token, method, password? }`:
  1. Re-validate the token and claim it; every refusal or failure after this releases the claim, so the link works again.
  2. Re-check the account: refuse (409) if the email now belongs to staff, or if the external account is `disabled` or sys-`invited` (same rule as §6.1).
  3. Create the auth user with the admin API (`email_confirm: true`; with the password when given). If an auth user already exists for the email and is external, reuse it: when its email was never confirmed, always replace its password (the chosen one, or a random secret with Microsoft) and confirm it, so a pre-registrant's password never survives; a confirmed login gets the chosen password with the password method and is left alone with Microsoft.
  4. When the profile is not active yet (the sign-up trigger's `external / pending` row, or none), update (or insert) `user_profiles`: `user_type = 'external'`, `status = 'active'`, `is_active = true`, `full_name` = the invitation's name or, when empty, the email (NOT NULL), email. An **active** external profile (someone who already uses the sys portal) is left exactly as it is: its type, status and name belong to sys. WAQC never writes `contacts`.
  5. Write the `qc_portal_access` row: `views`/`capabilities` from the invitation, `qc_manage_users` only if the invitation says company admin and was issued by staff, `created_by` = inviter. Nothing is written to sys's grants.
  6. Mark the invitation accepted; log `team_invite_accepted`.
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

Removing a person deletes their `qc_portal_access` row for that company, `qc_manage_users` included. Their login, their `user_profiles` row and any sys grant are untouched. *(Revised 2026-10-14 twice: first "strip the `qc_` keys from the grant row and delete it only when no sys view and no `manage_users` is left"; then, with R11, there is no grant row to strip.)*

### 6.7 Several companies

A second invitation for another company adds a second `qc_portal_access` row for the same login. The portal shows a company switcher only when the user holds QC views in the rows of more than one company. The chosen company travels as `?company=<id>` and is always checked against those rows.

### 6.8 Logging and notification

Every invite, resend, cancel, accept, key change and removal writes a `portal_activity` row (`action` = `team_invite`, `team_invite_revoked`, `team_invite_accepted`, `team_update`, `team_remove`; `payload` carries `{ app: 'qc', actor_user_id, actor_name, keys_before, keys_after, target_email }`). `portal_activity.user_id` is NOT NULL and references `user_profiles`, and WAQC staff often have none (WAQC never creates one for them: an internal row would open sys). So the row is filed under the actor when they have a `user_profiles` row, else under the target member, else not written (the `portal_invitations` row is then the record); the payload always names the real actor. Each action also creates an in-app notification for global admins through `src/lib/notifications.ts`. The Portal access card reads the same activity rows.

## 7. Hardening

### 7.1 The portal gate

`requireQcPortal(request, { view?, capability? })` in `src/lib/portal/qc-portal-gate.ts`, used by every `/api/portal/*` data and team route (`/api/portal/me` resolves the caller's kind itself, and `/api/portal/accept` is public):

1. Signed-in user, else 401.
2. If the user is external: `user_profiles.status = 'active'`, else 403. Company = `?company=` if given, else their only QC company; they must have a `qc_portal_access` row for it holding at least one `qc_` view and the required key, else 403. Admin routes need `qc_manage_users`. sys grants are never read.
3. If the user is WAQC staff: allowed **read-only** for the company in `?company=` ("view as client"). Any write route rejects staff with 403 and points them to the staff pages.
4. Otherwise 403.

Returns `{ userId, companyId, keys, isCompanyAdmin, isStaffViewAs }`. Data is then read with the service role and filtered by that company on the server (samples where `client_id` or `end_client_id` = company). No portal route reads a company id from the body or trusts one from the browser without step 2.

### 7.2 Middleware

`middleware.ts` resolves the caller's access kind with one call to a new SQL function `waqc_access_kind()` (SECURITY DEFINER, STABLE, returns `staff`, `external` or `none` for `auth.uid()`).

| Kind | Pages | API |
|---|---|---|
| `external` | `/portal/**`, `/auth/**`, `/certificate/**`; anything else redirects to `/portal` | `/api/portal/**` and the public certificate API; anything else 403 |
| `staff` | everything (as today) | everything (as today) |
| `none` (signed in) | `/auth/no-access` (message + sign out) | 403, except `/api/portal/accept` and `/api/profiles/ensure` (which applies 4.2, so a new `@wolthers.com` colleague still gets their first profile) |
| not signed in | as today | public routes as today (`/api/portal/accept`, the staff invitation lookup from 7.3.2, public certificate, embed); other `/api/*` routes keep their own checks (`/api/auth/azure-signin` was removed in `83dd4f40`) |

This closes the "any signed-in user" gap across all API routes, including the service-role routes that only check for a login. The `/embed/*` exception (sys token via postMessage) is unchanged.

### 7.3 Database

1. `handle_new_user` per 4.1.
2. Drop "Public can view pending invitations by token" on `user_invitations`. WAQC's staff accept page (`src/app/auth/accept-invite/page.tsx`) reads its invitation through a new server route instead of the anon client.
3. `waqc_is_staff()` SECURITY DEFINER helper (create it; the older `is_waqc_staff` never reached live): the staff rule of §4 (sys account not disabled, a staff role, `qc_enabled` true).
4. RESTRICTIVE write policies (`FOR INSERT`, `FOR UPDATE`, `FOR DELETE`, `TO authenticated`, `USING/WITH CHECK (waqc_is_staff())`) on `samples`, `certificates`, `quality_assessments`, `cupping_sessions`, `cupping_scores`, `client_qualities`, `quality_templates`, `qc_client_settings`. Service-role routes are unaffected (service role bypasses RLS).
   - **Before writing them:** list every trigger and function that writes these tables (`pg_trigger`, plus sys's decision write-back and sample mirror) and check whether it runs as the invoking user. Any that runs for a sys user without a WAQC profile gets an explicit exception or is made SECURITY DEFINER. Get the live policy list from `pg_policies` first; do not trust migrations on disk.
5. `qc_portal_access` (§5.1) and `portal_invitations` stay service role only: RLS on, no policies, no rights for `anon` or `authenticated`. The check script confirms it, and no policy is ever added to them.
6. All SQL is pasted for Daniel to apply, written paste-safe (no `SELECT ... INTO` or `RETURNING ... INTO`; the word "into" only in `INSERT INTO <table>`; verification as a final result set), and every DROP/CREATE of a function or policy is preceded by a read-only query of the live definitions.

### 7.4 Existing portal pages onto the gate

Overview, samples, contracts, certificates and the certificate PDF route (`src/app/api/portal/*`, `src/app/portal/*`, `src/lib/portal/portal-*.ts`):
- switch from `requirePortalCompany` + session client to `requireQcPortal` + service role with explicit company filters
- **remove every SAN number**: show the certificate number, or the contract refs when there is no certificate yet
- certificate PDF links use the certificate id; the downloaded file is named by certificate number
- the shell (`src/components/portal/portal-shell.tsx`) gets its identity from a new `GET /api/portal/me` (name, companies, keys per company) instead of reading `profiles` in the browser, which external users cannot do
- nav (`src/components/portal/portal-nav.ts`) shows only pages the person's keys allow on the current company; **Team** appears with `qc_manage_users`
- `src/components/layout/main-layout.tsx` redirects by access kind (`waqc_access_kind`): external → `/portal`, none → `/auth/no-access`. Middleware enforces it on every request; the layout covers a password sign-in on `/`, which renders the dashboard client-side without a new request

## 8. Out of scope for piece 1

- Dashboard, supplier review, reports, sample detail (piece 2)
- Client quality specs (piece 3)
- Cupping, including the cupping API roster checks (piece 4)
- The public certificate link that is still guessable by number (report-route security pass)
- sys's `provisionUser` returning early for a user whose `user_profiles` row the trigger pre-created (a sys bug; note for the sys backlog)
- Supplier/exporter logins (sellers seeing their own results)

## 9. Known properties

- **A QC-only person gets no sys data.** sys scopes external reads by grant rows (`current_user_company_ids()`), and WAQC creates none, so their JWT opens no sys company and the sys portal shows them nothing. *(Before R11 this section accepted that a QC-only user could read their own company's sys contracts; with QC access in its own table that no longer happens.)*
- **QC access is not visible on sys staff screens.** sys knows nothing of `qc_portal_access`; WAQC's Portal access card (§6.1) is where QC access is seen and changed. In sys's user lists a QC-only person is an external user with no company grants.
- **A person in both portals has two access records:** a sys grant (sys keys, managed in sys) and a `qc_portal_access` row (QC keys, managed in WAQC). Changing or removing one never touches the other. sys portal admin and QC company admin are separate switches: `manage_users` (sys) and `qc_manage_users` (QC).
- QC access is granted per company. sys's group access (0770) copies sys grants to sister companies and never touches `qc_portal_access`, so a client group needs QC access given per company.
- sys backfills and sys's `staff_locked`, `group_access` and `source` do not exist for QC access; nothing sys does to grant rows changes it.
- Deleting the person's `user_profiles` row or the company deletes their QC access (ON DELETE CASCADE). A sys company merge should re-point it like every other table (§3).

## 10. Risks

1. **Microsoft sign-in for a server-created user.** The accept flow pre-creates the auth user, then the person signs in with Microsoft. That relies on Supabase linking the Azure identity to the existing user by email, which needs a verified email claim from Azure. A spike confirms it; **deferred to Daniel after ship (2026-10-14)**, so invited clients use email + password at launch (`NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN` unset) and Microsoft follows if the spike passes.
2. **Restrictive write policies on busy tables.** A missed writer (trigger, sys path) would fail in production. Mitigation: the writer inventory in 7.3.4, the SQL check script in section 11, and applying table by table.
3. **QC-only people look like orphans on sys** (replaces "two repos, one ownership rule", which R11 made moot: no sys change ships in this piece). An external user with no company grants may look like leftover data to someone tidying sys. If sys switches them off (`disabled`), the QC gate refuses them; if sys deletes their `user_profiles` row, their `qc_portal_access` rows go with it. Mitigation: tell the sys side that such users may be QC clients and check WAQC's Portal access card first; a later piece may show QC access on sys.
4. **Password reset email.** Clients reset passwords through Supabase's recovery email. With the built-in mailer Supabase sends only a few emails an hour; a custom SMTP sender must be configured before clients rely on it.
5. **sys invites of brand-new addresses (sys finding, not fixed here).** sys's `inviteExternalUser` inserts an `invited` `user_profiles` row after `generateLink` creates the auth user, which collides with the sign-up trigger's `user_profiles` insert (23505). This piece keeps the trigger's insert unchanged; the fix belongs on sys.
6. **sys accounts in transition.** A person with a pending sys invitation (`invited`) cannot be given QC access until their first sys sign-in, and a switched-off (`disabled`) account only after Wolthers switches it back on in sys. Staff see a 409 with that reason.
7. **Two access records for people in both portals.** Removing someone from a client company means removing them in both places: the sys grant in sys, the QC row on the Portal access card. Staff must know that the two are separate.

## 11. Testing

- Unit (vitest): `clampQcKeys` and presets (never an admin key); the gate's decision table (external active/invited, no row, row without a QC view, missing key, sys admin is not QC admin, staff view-as read vs write, none); middleware path classification; token hashing and expiry; `qc_portal_access` writes (keys normalized, `qc_manage_users` only by the flag and kept otherwise, `created_by` kept on update, removal deletes the row, no other table touched); the head-office copy carries no link; activity filed under a real `user_profiles` row.
- Route tests for invite (status branching, fail-closed lookups, manager-invite guard, an active account's profile untouched), accept (new user, existing external user, active profile left alone, unconfirmed login, disabled/invited, staff email refused, expired token, reused token), team edits (ceiling, cannot touch admins or themselves, 404 without a row).
- SQL check script, run as each kind by setting `request.jwt.claims` inside a rolled-back transaction: external user reads zero rows from QC tables; a signed-in user with no WAQC profile cannot write QC tables; staff can; `qc_portal_access` and `portal_invitations` have RLS on, no policies and no rights for `anon`/`authenticated`.
- A grep: nothing in WAQC's `src` names sys's grant table.
- One end-to-end run on production after deploy: staff invite a test address, accept with password, see only that company, the test person has no sys grant row and sees nothing on sys, admin invites a colleague, colleague signs in, admin removes them.

## 12. Gotchas for implementers

- Live functions and policies have drifted from the migration files. Read them from `pg_get_functiondef` / `pg_policies` before replacing anything.
- Supabase editor: no `SELECT ... INTO`, no `RETURNING ... INTO`, no `CREATE TABLE` inside functions; top-level `CREATE TABLE` must enable RLS itself. Lint pasted SQL for the word "into": only `INSERT INTO <table>` may remain.
- sys code is read on `origin/main` only (its local `main` is stale). Piece 1 changes nothing in sys (R11).
- Never name sys's grant table in WAQC code or comments, and never read or write it: QC access is `qc_portal_access`.
- `route.ts` files export only handlers (`next build` rejects helper exports).
- Fantasy names for every company label (`companyDisplayName()`).
- Never render `tracking_number`.
- Files stay under ~2000 lines.
- Stage only your own paths; Daniel commits concurrently. Push only when asked.
