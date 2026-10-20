# Client portal accounts (piece 1) — handoff, 2026-10-14

Branch `feat/client-portal-accounts` (worktree `../WAQC-portal`), built from plan
`docs/superpowers/plans/2026-10-14-client-portal-accounts.md` with per-task review and a final
whole-branch review.

**Status 2026-10-20: SHIPPED.** Main was merged in (SAN sweep de6bb5c5, merge 9bdbc45a) and pushed;
Vercel deployed it. SQL 000001 through 000006 are applied and verified, and
`database/checks/2026-10-14-portal-access-checks.sql` passed (external reads nothing, non-staff
update 0 samples, staff still write, both service-role tables closed). Ship step 6 (smoke test
with a real client contact) is still to do.

## What changed against the plan

- **QC access lives in WAQC's own table `qc_portal_access`**, not in sys's company grants. sys
  opens a company's data (contracts with prices, documents, shipments) to anyone holding a grant
  row for it, whatever keys the row holds, so a QC-only grant row would leak sys data. Identity
  stays on sys's model (`auth.users` + `user_profiles`, statuses pending / invited / active /
  disabled). The sys change (keep `qc_` keys) was dropped; its local branch
  `feat/keep-qc-grant-keys` was never pushed.
- **Company admin = `qc_manage_users`** (QC-owned), set only by Wolthers staff. sys's
  `manage_users` plays no part.
- **Access kind** (SQL `waqc_access_kind()` / `waqc_is_staff()`, TS `classifyAccessKind`): a sys
  account switched off (`status = 'disabled'`) gets nothing; staff = global admin, or a staff role
  with `qc_enabled` on; else external if a `user_profiles` external row exists; else none.
  Global admins count as staff with `qc_enabled` off (daniel@ is one).
- Invitation emails go to the invitee only (not saved to Sent Items); head office gets a
  separate link-free copy, because the link sets the account's password.
- Migrations `000007` and `000008` were written and dropped during review; they do not exist.

## Ship steps (in order)

1. **Supabase settings (Dashboard → Authentication):** "Confirm email" ON (the sign-up trigger
   and the accept flow rely on it); URL configuration allows `https://qc.wolthers.com/auth/callback*`;
   a custom SMTP sender for the password-reset mail (the built-in mailer is rate-limited and shared
   with sys); the recovery template links with `{{ .ConfirmationURL }}`.
2. **Read-only pre-check, then the foundation SQL:**
   - Paste `database/checks/20261014-portal-precheck-all.sql`. Review: non-global staff with
     `qc_enabled` off lose the lab app (switch it on for anyone who keeps working); every global
     admin listed must be genuine (self-promotion was possible until 2026-10-14); the live
     `handle_new_user` body must match the base `000002` was written against.
   - Apply `20261014000001_portal_accounts_foundation.sql`, `20261014000002_handle_new_user_no_stranger_profiles.sql`,
     `20261014000006_qc_portal_access.sql`. Each ends with verification rows; all must read ok.
3. **Push** (fast-forward of `main`).
4. **After the deploy:** `database/checks/20261014000003_precheck.sql`, then
   `20261014000003_drop_anon_invitation_listing.sql` (edit the DROP names if the live ones differ).
5. **Write lockdown, last:** `database/checks/2026-10-14-qc-table-writers.sql` (BLOCK 5 must be
   empty or list only people meant to lose write access), then `20261014000004`; after a day of
   normal lab work run BLOCKs 4-5 again, then `20261014000005`; then
   `database/checks/2026-10-14-portal-access-checks.sql`.
6. **Smoke test with a real client contact:** staff invite from the client page's Portal access
   tab → accept link → portal shows only that company → Company admin invites a colleague from
   Team → a non-admin never sees Team; no SAN numbers anywhere; a lab user still has the full app.

When inviting staff from Users, tick "QC Access" — without `qc_enabled` a non-global staff
member lands on the no-access page.

## Open items

- Microsoft sign-in for clients stays off (`NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN` unset) until the
  identity-linking spike (plan Task 1) is run.
- sys: `inviteExternalUser` inserts an `invited` profile right after `generateLink`, but the
  sign-up trigger has already inserted the pending placeholder, so sys invites of brand-new
  addresses likely fail with 23505 → 409. sys-side fix: take over a pending row with no grants.
- The certificate PDF's photo QR still points at `/sample-photo/<SAN slug>` (pre-existing; the
  portal now serves that PDF too).
- Portal overview and contracts lists cap at 1,000 rows (pre-existing Phase A); samples and
  certificates cap at 500. Piece 2 (dashboard, supplier review, reports) should page them.
- Expired invitations disappear from the lists with no "resend" state; invite/resend has no
  rate limit for company admins.
- Pieces 2 (views), 3 (client specs), 4 (cupping) each need their own spec and plan.

## Deferred minors (from the per-task reviews, none blocking)

Auth and middleware
- Middleware uses the old cookie get/set/remove API (pre-existing): chunked session cookies can be
  lost; move to getAll/setAll. The outer-catch redirect drops refreshed cookies. No middleware unit test.
- MainLayout renders children before the access kind resolves: an external user briefly mounts the
  dashboard after a password sign-in (its APIs answer 403). The retry has no backoff.
- TS treats `qc_role = ''` as not staff, SQL as staff (admin-only edge). The qc-portal-gate
  'disabled' branch is unreachable.
- `portalServiceClient()` throws on missing env, so a misconfigured deploy answers a bare 500.
- Staff invitation not marked accepted when the profile already exists; the role select is blank
  for legacy client/supplier/buyer users in the user management panel.
- The sign-up trigger keeps a staff-role deny-list (client/supplier/buyer), not an allow-list.

Access keys and team routes
- `mergeQcKeys` trusts its input: callers must pass `normalizeQcKeys`/`clampQcKeys` output, never
  raw request keys. No test for `mergeQcKeys(undefined, [])`. `isQcKey` (startsWith) is looser than
  the SQL CHECK regex; `qc_keys_only` keeps PUBLIC EXECUTE (no data exposure).
- Read-then-write races: a staff demotion can be undone by a concurrent upsert restoring
  `qc_manage_users`; a PATCH can re-create a row deleted in between; team routes have a gap between
  guard and write.
- Unbounded `Promise.all` per member; `getUserById` failures unlogged and its "not found" fallback
  (`/not found/i`) is broad; an unreachable `escapeLike` catch.
- No route tests for PATCH/DELETE/resend/cancel, nor for the PATCH zero-views 400 after a merge.
- `lab_quality_manager` has no company scope on portal access (the spec allows it): product question.
- Activity log: actor lookup error ignored in `recordQcTeamActivity`; `listQcTeamActivity`'s
  actor_name fallback may name the target for rows from other writers; a failed-send test prints an
  expected console.error.
- `escapeLike`/`isValidEmail` duplicate helpers that exist elsewhere (qc-client-mapper, html.ts).

Portal UI
- No stale-response guard on company switch; Resend has no busy state (repeat clicks send repeat
  mails); the Remove dialog name fallback; AlertDialog buttons not portal-toned.
- Cancel dialog loses the email during its fade-out; the loaded flag is not reset if companyId
  changes while mounted.
- Reset page: save() not wrapped in try/catch; the login form's 30 s timer is untracked; the reset
  hint does not clear on typing.
- Theme cleanup removes light when the root had both classes at mount; the samples failure notice
  hides the search input.
