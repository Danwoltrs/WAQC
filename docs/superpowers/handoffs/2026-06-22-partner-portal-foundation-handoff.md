# Handoff — Partner Portal · Sub-project A (Foundation) (updated 2026-06-23)

**Resume point:** **Phase A is SHIPPED ✅ (2026-06-23).** All 11 plan tasks + the post-review security
fix (Task 12) are built, reviewed, both migrations APPLIED to prod, and all commits PUSHED to
`origin/main` (in sync at `6871667`) → deployed to Vercel prod. **Only remaining = Daniel's smoke test**
(invite a test client → accept → verify `/portal` shows only their company's data, cert downloads,
staff/clients can't cross over). **Next program step: B — unified PSS→SS→shipped lifecycle view.**

## What happened this session (executed via subagent-driven-development)

Per-task: fresh implementer → task review → fix loop if needed → ledger. Ledger at
`.superpowers/sdd/progress.md` (full detail). Final whole-branch review by opus.

| Task | State | Commit |
|---|---|---|
| 1 Portal auth helpers (+ `requirePortalCompany` guard) | done, reviewed | `5da3c9e` |
| 3 OAuth callback: client_id + role landing | done, reviewed | `57f9cb8` |
| 2 Trigger maps invitation company_id→profiles.client_id (migration FILE; **Daniel applies**) | done, reviewed | `958a419` |
| 4 Client-invite API + payload builder | done, reviewed | `ce5aa1a` |
| 5 Staff client-invite dialog (mounted in `client-detail-view.tsx`, not the thin page wrapper) | done, reviewed | `9049b35` |
| 6 Light/airy top-nav shell + role guards (+ fix loop) | done, reviewed | `a4d92b6` + `f31fd82` |
| 7 Overview dashboard | done, reviewed | `293ddfd` |
| 8 Samples list | done, reviewed | `91fff5a` |
| 9 Contracts list | done, reviewed | `b0f32ff` |
| 10 Certificates list | done, reviewed | `d64092f` |
| **12 Scoped cert document routes (closes the Critical doc-link IDOR from final review)** | done, opus-reviewed | `09fba02` |
| 11 RLS hardening (RESTRICTIVE client-scope; 3-lens adversarially verified) | done, **Daniel applies** | `ff75467` |

Verification: **13/13 portal unit tests green** (8 files), **tsc clean**. (One non-blocking test
warning: the invite `DialogContent` lacks a `Description`/`aria-describedby` — a11y Minor.)

## Repo / deploy state (VERIFY — drifts)
- Single repo WAQC, branch `main`, **`ahead 5`**. Daniel **pushed mid-session** (his `86d01bf` PSS-picker
  commit carried Tasks 1–6 + the docs commit `2835319` to origin → those are **deployed to Vercel prod**).
- **Pushed/deployed:** Tasks 1–6 (incl. Task 2 migration *file*, NOT applied).
- **Local-only / unpushed (5 commits):** Tasks 7, 8, 9, 10, 12 (`293ddfd`, `91fff5a`, `b0f32ff`, `d64092f`, `09fba02`).
- Partial deploy is **benign**: no client users exist yet, the Task 2 trigger isn't applied, staff are
  redirected away from `/portal`, `/portal` page itself isn't deployed yet.
- Owner commits to `main` concurrently → per-task review bases use the actual `^` parent, not the prior
  task's HEAD; the final review was scoped by portal **file paths**, not a commit range.

## GO-LIVE CHECKLIST (Daniel's, in order)
1. ✅ **APPLIED** `20260622000002_handle_new_user_company_id.sql` (Task 2 trigger).
2. ✅ **APPLIED** `20260622000003_portal_client_sample_read_scope.sql` (Task 11 RLS restrictive).
3. **Push the 6 unpushed commits** to deploy the data pages + scoped doc routes (`git push`). (Claude
   pushes only when asked — these are NOT pushed as of 2026-06-23.) Commits: `293ddfd 91fff5a b0f32ff d64092f 09fba02 ff75467`.
4. End-to-end test (from the spec): invite a test client user via a client's detail page → accept →
   land on `/portal` → see only that company's samples/contracts/certificates → download a cert PDF →
   confirm blocked from `/dashboard`/`/clients`; confirm staff still land on `/dashboard`.

## Locked decisions (do NOT relitigate) — unchanged from the plan
Audience = all QC clients (one user → one company via `profiles.client_id`); read-only; one login,
role-based redirect (client→/portal, staff→/dashboard); distinct LIGHT top-nav shell (NOT the dark
MainLayout); olive `#556b2f` accent; sequence A→B→C→D. Plus this session's:
- **Pre-flight:** extracted `requirePortalCompany(supabase)` helper (used by all 4 data routes) instead
  of duplicating the auth preamble.
- **Doc-link IDOR (final-review must-fix):** owner chose scoped portal document routes (Task 12). Portal
  links now hit `/api/portal/certificate/<slug>/pdf` (re-verifies company); the public
  `/api/certificate/<slug>/pdf` stays public by design (emailed cert links). **Residual: the public slug
  endpoint is still enumerable — DEFERRED to the broader report-route security pass, not closed.**

## Codebase anchors (this session's new/changed files)
- `src/lib/portal/{portal-auth,invite,portal-overview,portal-samples,portal-contracts,portal-certificates}.ts` (+ `.test.ts`)
- `src/lib/certificate-pdf.ts` (extracted `buildCertificatePdfResponse`)
- `src/app/api/portal/{invitations,overview,samples,contracts,certificates}/route.ts`
- `src/app/api/portal/certificate/[slug]/pdf/route.ts` (scoped, Task 12); public `src/app/api/certificate/[slug]/pdf/route.ts` now a thin wrapper
- `src/components/portal/{portal-nav.ts,portal-top-nav.tsx,portal-shell.tsx,client-invite-dialog.tsx}` (+ tests)
- `src/app/portal/{layout,page,samples/page,contracts/page,certificates/page}.tsx`
- Modified: `src/app/auth/callback/route.ts`, `src/components/layout/main-layout.tsx`, `src/components/clients/client-detail-view.tsx`
- `database/migrations/20260622000002_handle_new_user_company_id.sql` (Task 2). Task 11 migration TBD.

## Gotchas discovered this session
- **DB drift is real here.** The live `handle_new_user()` was a merged body newer than ANY migration on
  disk (invitation lookup + @wolthers.com auto-provision + user_profiles insert + EXCEPTION handler).
  Live body saved at `.superpowers/sdd/task-2-live-body.sql`. **Expect the same for Task 11's RLS policy
  — get the live policy from `pg_policies` before writing the migration.**
- `profiles.client_id` has **no FK** (DROP TABLE clients CASCADE removed it; never re-added to companies).
  Logic works (it holds a `companies.id`); future orphan risk → consider an FK-to-companies migration.
- All portal `samples` queries filter `.is('deleted_at', null)` (the plan omitted it; added everywhere).
- Don't reuse the dark `MainLayout` for `/portal` (separate light component set).

## Deferred Minors (final review triaged ALL as safe-to-defer; none block merge)
1. `(supabase as any)` casts across portal routes — established convention.
2. **Error handling (recurring, worth a follow-up):** portal data routes discard the Supabase `error`
   (DB error → HTTP 200 + empty list); pages don't clear rows / show an error state on a non-ok fetch
   (stale data on session expiry).
3. **Overview page lacks the olive `#556b2f` accent** (locked-design deviation; landing page). Left for
   Daniel's in-app visual QA pass (he owns visual decisions).
4. portal-certificates: no null-tracking-number test; theoretical array-shape on the `!inner` join (fails closed).
5. Invite route: `request.json()` has no try/catch (malformed body → 500 not 400); duplicate check is
   against `profiles` not pending `user_invitations` (staff can re-send a pending invite).
6. Top-nav active detection is exact-match (fine for the current top-level routes).
7. invite `DialogContent` missing `Description`/`aria-describedby` (a11y test warning).
8. **Route guards are client-side only** (no middleware) — acceptable because portal data routes are each
   independently authz'd; consider middleware for defense-in-depth later.

## Next program steps (after A ships): B (unified PSS→SS→shipped lifecycle), C (exceljs export), D (Dunkin container traceability).
