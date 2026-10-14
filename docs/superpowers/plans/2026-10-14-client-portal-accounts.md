# Client Portal Accounts (piece 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Amended 2026-10-14** against sys `origin/main` (portal admins & partners, D3/D4, invite-only, 0871) and the pre-flight scan. **Task 1 (Microsoft-linking spike) is deferred to Daniel after ship:** `NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN` stays unset, so the accept page offers email + password only. Implementers skip Task 1.

> **Amended again 2026-10-14 (ruling R11):** QC access lives in WAQC's own table `qc_portal_access`, not in sys's `external_user_company_grants`. The Task 3 review found that sys grants data access on grant-row **existence** (the RLS helper `current_user_company_ids()`, `/api/shipments`, `requirePortalRead` without a capability), so any grant row holding only `qc_` keys would open the company's sys contracts (prices included), documents and shipments, and sys's group trigger (0770) would copy that to sister companies. **Task 3 (sys change) is dropped**; no sys change is needed. Task 9 now creates the table (SQL `20261014000006`) and writes it. Rulings R2, R3, A1, A2 and A4 are moot; R1 (`qc_manage_users`, staff-only), R4–R8 and P1–P11 stand.

**Goal:** QC clients become sys-style external users (sys identity) whose QC access is a row per company in WAQC's own `qc_portal_access`; Wolthers staff invite a company's first person (optionally company admin), company admins invite colleagues and partners, and the existing four portal pages run behind a server-side gate with no SAN numbers. The WAQC API stops trusting "any signed-in user".

**Architecture:** Identity lives in sys's model on the shared Supabase database: `auth.users` plus `user_profiles` (`user_type = 'external'`, `status` pending / invited / active / disabled). QC access lives in WAQC's own table `public.qc_portal_access`: one row per person and company, `views[]` / `capabilities[]` holding only `qc_` keys (a CHECK enforces it), `qc_manage_users` = QC company admin; RLS on, no policies, service role only (Task 9). WAQC never reads or writes sys's `external_user_company_grants`: sys opens a company's data to anyone who has a grant row for it, whatever keys it holds, so a QC-only grant row would leak sys data (ruling R11). A person in both portals has two access records (a sys grant and a `qc_portal_access` row); neither side touches the other's. A SQL function `waqc_access_kind()` classifies each caller as `staff`, `external` or `none`; middleware routes by it, every `/api/portal/*` data and team route runs `requireQcPortal` (`/api/portal/me` and the public `/api/portal/accept` check the caller themselves), and portal data is read with the service role filtered by the company from the person's `qc_portal_access` row. Invitations live in a new `portal_invitations` table (token stored as a hash); accepting creates the login server-side.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Microsoft Graph mail (`src/lib/graph/send.ts`), vitest, Tailwind + shadcn/ui. No sys repo change in this piece (Task 3 dropped by ruling R11); sys code is only read, on `origin/main`.

**Spec:** `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md` — read it before any task.

**Parts (each under 2200 lines):**
- Part A — `2026-10-14-client-portal-accounts-part-a.md`: Tasks 1–7, foundation (spike, keys, SQL, sign-up rules, middleware; Task 3, the sys change, is dropped by ruling R11 and part A's text for it is history)
- Part B — `2026-10-14-client-portal-accounts-part-b.md`: Tasks 8–11, gate, QC access table `qc_portal_access` and its writes, invitations, email
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
- **WAQC never reads or writes `external_user_company_grants`; QC access lives only in `qc_portal_access`** (ruling R11). sys opens a company's data to anyone who has a grant row for it, whatever keys the row holds, so a QC-only grant row would leak sys data. Code and comments in `src` never even name sys's grant table (Task 22 greps for it); say "sys's company grants". It follows that WAQC never touches sys's `manage_users`, `staff_locked`, `group_access`, group rows or sys backfills.
- `qc_portal_access` holds one row per person (`user_profiles.id`) and company, with only `qc_` keys in `views` and `capabilities` (a CHECK enforces it; `setQcAccess` normalizes keys before writing). Writes go through Task 9 only: `setQcAccess` (upsert), `removeQcAccess` (delete). The table is service role only (RLS on, no policies, no rights for `anon`/`authenticated`): read and write it with the service-role client, never with a session client, and never add a policy to it.
- QC's company admin is `qc_manage_users` in the row's `capabilities`, set only by Wolthers staff (the Company admin switch, the explicit `manageUsers` flag); presets and the ceiling clamp never yield it. sys's `manage_users` never makes anyone a QC admin, and WAQC never grants or removes it.
- Account status (sys `user_profiles.status`) decides every invite and accept: `active` → their `qc_portal_access` row is written; `disabled` → 409 (only Wolthers switches an account back on, in sys); `invited` → 409 (a pending sys invitation; add QC access after their first sign-in); `pending` or no profile → an invitation. WAQC's app code writes `user_profiles` only at accept and only for a profile that is not active yet (the sign-up trigger's `pending` row, or none); an active external profile (a sys portal user) keeps its type, status and name. (The sign-up trigger's own `user_profiles` insert, Task 5, is sys's default-deny and stays as it is.) WAQC never writes sys `contacts`.
- Email: the invitee's invitation or access email goes to the invitee alone, with no CC (the accept link sets the password: it is a credential). Head office gets a separate, link-free copy of every invitation, resend and access email (`sendPortalHouseCopy`, server-side). `MICROSOFT_GRAPH_TEST_RECIPIENT` redirects every send, the house copy included, and adds `[TEST]`. The Supabase password-recovery email is an auth credential, not a QC email, and is exempt from `HOUSE_CC`.
- SQL is written for Daniel to paste into the Supabase SQL editor and is also saved under `database/migrations/` (checks under `database/checks/`). Paste-safety: no `SELECT ... INTO`, no `RETURNING ... INTO`, no `CREATE TABLE` inside functions; the word "into" appears only as `INSERT INTO <table>` (never in comments, string literals or anything else; split it in regexes as `'i' || 'nto'`). Results are reported with a final `SELECT`, never `RAISE NOTICE`. Daniel applies all SQL; never run it.
- Read live definitions (`pg_get_functiondef`, `pg_policies`) before replacing any function or policy; the migration files have drifted. Every task that drops or creates a function or policy starts with a read-only query for Daniel.
- Stage only your own paths (`git add <path>`); Daniel commits concurrently. Commit after each task; push only when Daniel asks (`git push origin HEAD:main`; trunk-based, Vercel deploys `main`). No task changes the sys repo (Task 3 dropped; its branch `feat/keep-qc-grant-keys` stays local and is never pushed).
- Tests: `npx vitest run <path>`; typecheck `npx tsc --noEmit -p .` (delete `.next/types` first if it reports missing files under `.next/`).

## Review Focus

1. **QC access never touches sys grants or sys data access.** No WAQC write (invite, key change, admin switch, removal, accept) reads or writes sys's `external_user_company_grants`: a sys portal user's grant, keys, `manage_users`, `staff_locked` and group copies stay as they are, and a QC-only person gets no grant row on sys, so sys opens no company data to them. Accepting never changes an active external profile's type, status or name. A sys admin is not thereby a QC admin, and a QC admin is not thereby a sys admin. Pinned by the `qc-grants` tests (Task 9: the only table touched is `qc_portal_access`), the invite-service tests (Task 12: an active account's lookups touch no other table), the accept tests (Task 13: an active profile is left alone), the Task 22 grep (nothing in `src` names sys's grant table) and the end-to-end SQL and sys sign-in (Task 22: no grant row, no sys data).
2. **Invitation link reuse.** Opening an accepted, cancelled, expired or replaced link, or POSTing accept twice, gives one generic "no longer valid" answer and never a second login or grant. Pinned in Task 10 (`invitationState`) and Task 13 (`accept-invitation.ts` tests).
3. **Email spelling.** `" John.Doe@Client.COM "` invited, then accepted, is one person: invitations, lookups and the login all use the trimmed lowercase email. Pinned in Task 10 (`normalizeEmail`) and Task 12 (invite service test).
4. **A company admin acting on admins.** A crafted request from a company admin that changes or removes another QC company admin (`qc_manage_users`) or themselves, through PATCH, DELETE or by "inviting" their address, or that grants `qc_manage_users`, is refused (403; 409 for someone already on the team). Pinned in Task 14 (team route tests), Task 12 (`teamGuard` and the manager-invite tests), Task 9 (`planQcAccess` adds `qc_manage_users` only through the flag) and Task 2 (`clampQcKeys` never yields an admin key).
5. **Session ending mid-use in the portal.** An expired session makes `/api/portal/*` answer 401; portal pages then send the person to sign in instead of showing empty tables. Pinned in Task 16 (`portalFetch` test).
6. **Accounts WAQC must not revive.** A `disabled` or sys-`invited` account is refused at invite and again at accept, and a login nobody confirmed never keeps its password. Pinned in Task 12 (invite service) and Task 13 (accept tests).

## Ship order (what must be live before what)

| Step | What | Why first |
|---|---|---|
| 1 | Daniel applies SQL `20261014000001` (Task 4) and `20261014000006` (Task 9, `qc_portal_access`; pre-check first), together | middleware (Task 7) calls `waqc_access_kind()`, without which every signed-in API request answers 503; the gate, `/api/portal/me` and every QC access write (Tasks 8–14) read or write `qc_portal_access` |
| 2 | Daniel applies SQL `20261014000002` (Task 5) | independent; any time after Task 5 |
| 3 | WAQC Parts A–E pushed | Daniel decides when; never before step 1. No sys change is needed (Task 3 dropped by ruling R11) |
| 4 | Daniel applies SQL `20261014000003` (Task 20) | only after the staff accept page reads through the server route (Task 20 code) is deployed |
| 5 | Writer inventory, then SQL `20261014000004` (Task 21, config tables) | the riskiest change to daily lab work starts with the low-traffic tables |
| 6 | SQL `20261014000005` (Task 21, sample tables) | a day after step 5 ran without trouble |
| 7 | End-to-end run (Task 22) | after every step above |

## Task index

| # | Task | Part |
|---|---|---|
| 1 | Spike: Microsoft sign-in for a server-created external login (deferred to Daniel after ship) | A |
| 2 | QC key registry `src/lib/portal/qc-keys.ts` (`qc_manage_users`; its grant-row helpers are removed again in Task 9) | A |
| 3 | ~~sys: keep foreign `qc_` keys on every sys grant write~~ — dropped by ruling R11 (QC access lives in `qc_portal_access`; no sys change) | A |
| 4 | SQL foundation: `waqc_access_kind()`, `waqc_is_staff()`, `portal_invitations` | A |
| 5 | SQL: sign-up trigger creates no WAQC profile for strangers (profile part in its own block) | A |
| 6 | One rule for creating WAQC profiles (callback, ensure, auth-provider, staff invite) | A |
| 7 | Access kind, route rules, middleware, `/auth/no-access`, landing path | A |
| 8 | Portal gate `requireQcPortal` | B |
| 9 | QC access table `qc_portal_access` (SQL `20261014000006`) and its writes: `setQcAccess`, `removeQcAccess`, members; unused grant-row helpers leave `qc-keys.ts` | B |
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
