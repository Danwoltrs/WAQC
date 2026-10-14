# Client Portal Accounts (piece 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Amended 2026-10-14** against sys `origin/main` (portal admins & partners, D3/D4, invite-only, 0871) and the pre-flight scan. **Task 1 (Microsoft-linking spike) is deferred to Daniel after ship:** `NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN` stays unset, so the accept page offers email + password only. Implementers skip Task 1.

**Goal:** QC clients become sys-style external users with company grants; Wolthers staff invite a company's first person (optionally company admin), company admins invite colleagues and partners, and the existing four portal pages run behind a server-side gate with no SAN numbers. The WAQC API stops trusting "any signed-in user".

**Architecture:** Identity and company access live in sys's tables on the shared Supabase database (`user_profiles.user_type = 'external'`, `external_user_company_grants` with `views[]`/`capabilities[]`). QC owns every key starting with `qc_`, including its own company-admin key `qc_manage_users`; sys owns the rest and keeps every `qc_` key on its writes (Task 3). QC access comes only from direct grant rows (`source <> 'group'`). A SQL function `waqc_access_kind()` classifies each caller as `staff`, `external` or `none`; middleware routes by it, every `/api/portal/*` data and team route runs `requireQcPortal` (`/api/portal/me` and the public `/api/portal/accept` check the caller themselves), and portal data is read with the service role filtered by the company from the grant. Invitations live in a new `portal_invitations` table (token stored as a hash); accepting creates the login server-side.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Microsoft Graph mail (`src/lib/graph/send.ts`), vitest, Tailwind + shadcn/ui. sys repo: Next.js + vitest (`npm test` = `vitest run`; the include list in `vitest.config.ts` names files one by one).

**Spec:** `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md` — read it before any task.

**Parts (each under 2200 lines):**
- Part A — `2026-10-14-client-portal-accounts-part-a.md`: Tasks 1–7, foundation (spike, keys, sys change, SQL, sign-up rules, middleware)
- Part B — `2026-10-14-client-portal-accounts-part-b.md`: Tasks 8–11, gate, grants, invitations, email
- Part C — `2026-10-14-client-portal-accounts-part-c.md`: Tasks 12–14, staff, accept, team and me routes
- Part D — `2026-10-14-client-portal-accounts-part-d.md`: Tasks 15–17, existing pages onto the gate, portal shell, accept page and password reset
- Part E — `2026-10-14-client-portal-accounts-part-e.md`: Tasks 18–22, staff and team UI, database lockdown, Phase A retirement, end-to-end

## Global Constraints

- Never render, return, log to a person, or put in a URL or file name the SAN `tracking_number` (`SAN-01234/26`). Show the certificate number, else the sample's own identifier via `sampleLabelText()` (`src/lib/sample-reference.ts`).
- Every company label uses the fantasy name: `companyDisplayName({ id, fantasy_name, name })` from `src/lib/contract-intake-mapping.ts`.
- No emojis in UI. No mock data.
- Portal visual language: light top-nav shell, white background, single olive accent `#556b2f`, Inter (existing `src/components/portal/*`). Do not use the dark internal `MainLayout` for `/portal`.
- Files stay under ~2000 lines.
- `route.ts` files export only HTTP handlers and segment config (`src/app/api/route-exports.test.ts` enforces it); helpers live in `src/lib`. Client components import only pure modules and types (never a module that pulls in `@/lib/supabase-server` or `@/lib/notifications`).
- WAQC writes to `external_user_company_grants` always set both `views` and `capabilities` explicitly (column defaults hand out every sys view and sys's default-on capabilities). A row WAQC **creates** also sets `group_access = false` (QC access is granted per company; the sys trigger 0770 must not copy it to sister companies).
- WAQC never adds or removes a non-`qc_` key. QC's company admin is `qc_manage_users`, a `qc_` key that only Wolthers staff set (the Company admin switch); presets and the ceiling clamp never yield it. WAQC never grants, removes or reads as QC admin sys's `manage_users`, and never reads or writes `staff_locked`; the one place it looks at `manage_users` is the removal rule (a row that holds it is never deleted, only stripped of `qc_` keys). sys never adds or removes a `qc_` key (Task 3).
- Group rows: never edit a grant row with `source = 'group'` from WAQC (respond 409), and never count one as QC access: the gate, `/api/portal/me` and every member list read only rows with `source <> 'group'`.
- Account status (sys `user_profiles.status`) decides every invite and accept: `active` → keys added; `disabled` → 409 (only Wolthers switches an account back on, in sys); `invited` → 409 (a pending sys invitation; add QC access after their first sign-in); `pending` or no profile → an invitation. WAQC never writes sys `contacts`.
- Email: the invitee's invitation or access email goes to the invitee alone, with no CC (the accept link sets the password: it is a credential). Head office gets a separate, link-free copy of every invitation, resend and access email (`sendPortalHouseCopy`, server-side). `MICROSOFT_GRAPH_TEST_RECIPIENT` redirects every send, the house copy included, and adds `[TEST]`. The Supabase password-recovery email is an auth credential, not a QC email, and is exempt from `HOUSE_CC`.
- SQL is written for Daniel to paste into the Supabase SQL editor and is also saved under `database/migrations/` (checks under `database/checks/`). Paste-safety: no `SELECT ... INTO`, no `RETURNING ... INTO`, no `CREATE TABLE` inside functions; the word "into" appears only as `INSERT INTO <table>` (never in comments, string literals or anything else; split it in regexes as `'i' || 'nto'`). Results are reported with a final `SELECT`, never `RAISE NOTICE`. Daniel applies all SQL; never run it.
- Read live definitions (`pg_get_functiondef`, `pg_policies`) before replacing any function or policy; the migration files have drifted. Every task that drops or creates a function or policy starts with a read-only query for Daniel.
- Stage only your own paths (`git add <path>`); Daniel commits concurrently. Commit after each task; push only when Daniel asks (`git push origin HEAD:main`; trunk-based, Vercel deploys `main`). Task 3 works in a sys worktree on branch `feat/keep-qc-grant-keys`; the controller pushes it to sys `origin/main`.
- Tests: `npx vitest run <path>`; typecheck `npx tsc --noEmit -p .` (delete `.next/types` first if it reports missing files under `.next/`).

## Review Focus

1. **A person who is both a sys portal user and a QC portal user.** After any WAQC grant write (invite, key change, admin switch, removal) their sys keys, `manage_users` included, are byte-for-byte unchanged and `staff_locked` is untouched; after any sys team edit, Remove, re-invite or staff grant edit, their `qc_` keys survive, `qc_manage_users` included. A sys admin is not thereby a QC admin, and a QC admin is not thereby a sys admin. Pinned by `mergeQcKeys`/`isCompanyAdmin` tests (Task 2), `planQcGrantWrite`/`planQcGrantRemoval` tests (Task 9), and `keepForeignKeys` plus the sys route tests (Task 3).
2. **Invitation link reuse.** Opening an accepted, cancelled, expired or replaced link, or POSTing accept twice, gives one generic "no longer valid" answer and never a second login or grant. Pinned in Task 10 (`invitationState`) and Task 13 (`accept-invitation.ts` tests).
3. **Email spelling.** `" John.Doe@Client.COM "` invited, then accepted, is one person: invitations, lookups and the login all use the trimmed lowercase email. Pinned in Task 10 (`normalizeEmail`) and Task 12 (invite service test).
4. **A company admin acting on admins.** A crafted request from a company admin that changes or removes another QC company admin (`qc_manage_users`) or themselves, through PATCH, DELETE or by "inviting" their address, or that grants `qc_manage_users`, is refused (403; 409 for someone already on the team or a group copy). Pinned in Task 14 (team route tests), Task 12 (`teamGuard` and the manager-invite tests) and Task 2 (`clampQcKeys` never yields an admin key).
5. **Session ending mid-use in the portal.** An expired session makes `/api/portal/*` answer 401; portal pages then send the person to sign in instead of showing empty tables. Pinned in Task 16 (`portalFetch` test).
6. **Accounts WAQC must not revive.** A `disabled` or sys-`invited` account is refused at invite and again at accept, and a login nobody confirmed never keeps its password. Pinned in Task 12 (invite service) and Task 13 (accept tests).

## Ship order (what must be live before what)

| Step | What | Why first |
|---|---|---|
| 1 | Daniel applies SQL `20261014000001` (Task 4) | middleware (Task 7) calls `waqc_access_kind()`; without it every signed-in API request answers 503 |
| 2 | sys change (Task 3) pushed to sys `origin/main` and deployed | must be live before any WAQC write of a `qc_` key (Tasks 12–14 deployed); otherwise a sys team edit, Remove, Resend or staff grant edit strips QC access. sys 0871 is **not** a prerequisite: WAQC never reads or writes `staff_locked` |
| 3 | Daniel applies SQL `20261014000002` (Task 5) | independent; any time after Task 5 |
| 4 | WAQC Parts A–E pushed | Daniel decides when; not before step 2 if Part C is included |
| 5 | Daniel applies SQL `20261014000003` (Task 20) | only after the staff accept page reads through the server route (Task 20 code) is deployed |
| 6 | Writer inventory, then SQL `20261014000004` (Task 21, config tables) | the riskiest change to daily lab work starts with the low-traffic tables |
| 7 | SQL `20261014000005` (Task 21, sample tables) | a day after step 6 ran without trouble |
| 8 | End-to-end run (Task 22) | after every step above |

## Task index

| # | Task | Part |
|---|---|---|
| 1 | Spike: Microsoft sign-in for a server-created external login (deferred to Daniel after ship) | A |
| 2 | QC key registry `src/lib/portal/qc-keys.ts` (`qc_manage_users`, direct-row rule) | A |
| 3 | sys: keep foreign `qc_` keys on every sys grant write (against sys `origin/main`) | A |
| 4 | SQL foundation: `waqc_access_kind()`, `waqc_is_staff()`, `portal_invitations` | A |
| 5 | SQL: sign-up trigger creates no WAQC profile for strangers (profile part in its own block) | A |
| 6 | One rule for creating WAQC profiles (callback, ensure, auth-provider, staff invite) | A |
| 7 | Access kind, route rules, middleware, `/auth/no-access`, landing path | A |
| 8 | Portal gate `requireQcPortal` | B |
| 9 | Grant writes: `setQcAccess`, `removeQcAccess`, members | B |
| 10 | Invitation tokens and store | B |
| 11 | Invitation email, head-office copy, team activity and notifications | B |
| 12 | Invite service, team rules and staff routes `/api/clients/[id]/portal-access/**` | C |
| 13 | Accept routes `/api/portal/accept` | C |
| 14 | Team routes `/api/portal/team/**` and `/api/portal/me` | C |
| 15 | Existing portal data routes onto the gate; SAN out; certificate PDF by id | D |
| 16 | Portal shell: identity from `/api/portal/me`, company switcher, nav by keys, `portalFetch` | D |
| 17 | Accept page `/auth/portal-invite`; forgot-password flow | D |
| 18 | Staff Portal access card and shared invite dialog | E |
| 19 | Team page `/portal/team` | E |
| 20 | Staff accept page reads its invitation server-side; SQL drops anonymous listing | E |
| 21 | Writer inventory, restrictive write policies, SQL check scripts | E |
| 22 | Retire Phase A client-role code; end-to-end run; handoff | E |
