# Client portal accounts (piece 1) — handoff, 2026-10-14

Branch `feat/client-portal-accounts` (worktree `../WAQC-portal`), built from plan
`docs/superpowers/plans/2026-10-14-client-portal-accounts.md` with per-task review and a final
whole-branch review. Not pushed: the middleware calls `waqc_access_kind()`, so SQL step 2 below
must be live first or every signed-in API request answers 503.

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
