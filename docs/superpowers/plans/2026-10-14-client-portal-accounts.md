# Client Portal Accounts (piece 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QC clients become sys-style external users with company grants; Wolthers staff invite a company's first person (optionally company admin), company admins invite colleagues and partners, and the existing four portal pages run behind a server-side gate with no SAN numbers. The WAQC API stops trusting "any signed-in user".

**Architecture:** Identity and company access live in sys's tables on the shared Supabase database (`user_profiles.user_type = 'external'`, `external_user_company_grants` with `views[]`/`capabilities[]`). QC owns every key starting with `qc_`; sys owns the rest (`manage_users` is shared and only staff grant it). A SQL function `waqc_access_kind()` classifies each caller as `staff`, `external` or `none`; middleware routes by it, every `/api/portal/*` route runs `requireQcPortal`, and portal data is read with the service role filtered by the company from the grant. Invitations live in a new `portal_invitations` table (token stored as a hash); accepting creates the login server-side.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Microsoft Graph mail (`src/lib/graph/send.ts`), vitest, Tailwind + shadcn/ui. sys repo: Next.js + vitest (`npm test` = `vitest run`; one older file uses `node:test`).

**Spec:** `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md` — read it before any task.

**Parts (each under 2000 lines):**
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
- `route.ts` files export only HTTP handlers and segment config (`src/app/api/route-exports.test.ts` enforces it); helpers live in `src/lib`.
- WAQC writes to `external_user_company_grants` always set both `views` and `capabilities` explicitly (column defaults hand out every sys view and sys's default-on capabilities).
- WAQC never adds or removes a non-`qc_` key, except staff setting or clearing `manage_users`. sys never adds or removes a `qc_` key.
- Never edit a grant row with `source = 'group'` from WAQC (respond 409).
- Every outgoing invitation email appends `HOUSE_CC` (`wolthers@wolthers.com`) server-side; `MICROSOFT_GRAPH_TEST_RECIPIENT` redirects the send and drops the CC, as elsewhere.
- SQL is written for Daniel to paste into the Supabase SQL editor and is also saved under `database/migrations/`. Paste-safety: no `SELECT ... INTO`, no `RETURNING ... INTO`, no `CREATE TABLE` inside functions, and the word "into" appears nowhere (comments and string literals included; split it in regexes as `'i' || 'nto'`). Results are reported with a final `SELECT`, never `RAISE NOTICE`. Daniel applies all SQL; never run it.
- Read live definitions (`pg_get_functiondef`, `pg_policies`) before replacing any function or policy; the migration files have drifted.
- Stage only your own paths (`git add <path>`); Daniel commits concurrently. Commit after each task; push only when Daniel asks (`git push origin HEAD:main`; trunk-based, Vercel deploys `main`).
- Tests: `npx vitest run <path>`; typecheck `npx tsc --noEmit -p .` (delete `.next/types` first if it reports missing files under `.next/`).

## Review Focus

1. **A person who is both a sys portal user and a QC portal user.** After any WAQC grant write (invite, key change, removal) their sys keys are byte-for-byte unchanged, and after any sys team edit their `qc_` keys survive. Pinned by `mergeQcKeys` tests (Task 2), `setQcAccess`/`removeQcAccess` tests (Task 9) and `keepForeignKeys` tests (Task 3).
2. **Invitation link reuse.** Opening an accepted, cancelled, expired or replaced link, or POSTing accept twice, gives one generic "no longer valid" answer and never a second login or grant. Pinned in Task 10 (`invitationState`) and Task 13 (accept route tests).
3. **Email spelling.** `" John.Doe@Client.COM "` invited, then accepted, is one person: invitations, lookups and the login all use the trimmed lowercase email. Pinned in Task 10 (`normalizeEmail`) and Task 12 (invite service test).
4. **A company admin acting on admins.** A crafted request from a company admin that changes or removes another company admin, or themselves, or grants `manage_users`, is refused 403. Pinned in Task 14 (team route tests) and Task 2 (`clampQcKeys` never yields `manage_users`).
5. **Session ending mid-use in the portal.** An expired session makes `/api/portal/*` answer 401; portal pages then send the person to sign in instead of showing empty tables. Pinned in Task 16 (`portalFetch` test).

## Ship order (what must be live before what)

| Step | What | Why first |
|---|---|---|
| 1 | Daniel applies SQL `20261014000001` (Task 4) | middleware (Task 7) calls `waqc_access_kind()`; without it every signed-in API request answers 503 |
| 2 | sys change (Task 3) pushed and deployed on sys | a sys team edit would otherwise strip `qc_` keys written from Part B on |
| 3 | Daniel applies SQL `20261014000002` (Task 5) | independent; any time after Task 5 |
| 4 | WAQC Parts A–E pushed | Daniel decides when |
| 5 | Daniel applies SQL `20261014000003` (Task 20) | only after the staff accept page reads through the server route (Task 20 code) is deployed |
| 6 | Writer inventory, then SQL `20261014000004` (Task 21) | last: the riskiest change to daily lab work |

## Task index

| # | Task | Part |
|---|---|---|
| 1 | Spike: Microsoft sign-in for a server-created external login | A |
| 2 | QC key registry `src/lib/portal/qc-keys.ts` | A |
| 3 | sys: keep foreign `qc_` keys on every sys grant write | A |
| 4 | SQL foundation: `waqc_access_kind()`, `waqc_is_staff()`, `portal_invitations` | A |
| 5 | SQL: sign-up trigger creates no WAQC profile for strangers | A |
| 6 | One rule for creating WAQC profiles (callback, ensure, auth-provider, staff invite) | A |
| 7 | Access kind, route rules, middleware, `/auth/no-access`, landing path | A |
| 8 | Portal gate `requireQcPortal` | B |
| 9 | Grant writes: `setQcAccess`, `removeQcAccess` | B |
| 10 | Invitation tokens and store | B |
| 11 | Invitation email, team activity and notifications | B |
| 12 | Invite service and staff routes `/api/clients/[id]/portal-access/**` | C |
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
