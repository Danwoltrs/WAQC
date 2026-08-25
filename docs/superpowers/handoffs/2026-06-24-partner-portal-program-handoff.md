# Handoff — Partner Portal program (2026-06-24): Phase A SHIPPED → start B

**Resume point:** **Phase A is SHIPPED to prod and needs no more code.** The single next thing is to
**start Sub-project B — the unified PSS→SS→shipped→in-transit lifecycle view** — via
`superpowers:brainstorming` → spec → `superpowers:writing-plans` → build. There is **no B spec/plan
yet** (B begins at brainstorming). One Phase-A loose end that is **Daniel's, not code**: he still owes the
in-app smoke test (invite a test client → accept → verify `/portal` scoping). Don't block B on it.

> Companion docs (read for detail): program decomposition
> [../specs/2026-06-22-partner-portal-program-overview.md](../specs/2026-06-22-partner-portal-program-overview.md);
> Phase A spec [../specs/2026-06-22-partner-portal-foundation-design.md](../specs/2026-06-22-partner-portal-foundation-design.md)
> + plan [../plans/2026-06-22-partner-portal-foundation.md](../plans/2026-06-22-partner-portal-foundation.md);
> the Phase-A completion record [2026-06-22-partner-portal-foundation-handoff.md](2026-06-22-partner-portal-foundation-handoff.md)
> (loose ends + every Phase-A commit/decision); module-D spec
> [../specs/2026-06-22-dunkin-container-traceability-design.md](../specs/2026-06-22-dunkin-container-traceability-design.md).

## The work (one paragraph)
The **Partner Portal** is a program giving QC clients an authenticated place to follow their coffee
end-to-end. It's decomposed **A→B→C→D**, each shipping before the next. **A = Foundation: SHIPPED**
(the authenticated light/airy `/portal` shell, overview dashboard, by-sample + by-contract lists,
certificates with scoped PDF download, staff invite UI, role-based routing, and client-scoping RLS).
**B = the unified lifecycle view** — a per-contract **PSS→SS→shipped→in-transit** timeline; this is the
program's core "follow everything" value. **C = full-data `exceljs` export.** **D = Dunkin container
traceability** (the original QR ask, built last as a portal tab).

## Repo state right now (verified 2026-06-24, NOT from memory)
- **Single repo: WAQC** (`/Users/danielwolthers/Documents/GitHub/WAQC`). `src/` + `docs/` are one repo —
  ignore the handoff skill's two-repo `~/.git`/`wolthers-app` machinery. Tests: **`npx vitest run <path>`**;
  typecheck **`npx tsc --noEmit`**; HEAD on `main` auto-deploys to Vercel prod.
- **Branch `main`, HEAD `6871667`, in sync with `origin/main`** (nothing unpushed). Phase A is fully
  deployed. (`6871667` is Daniel's PSS-picker fix sitting on top of the portal commits.)
- **Working tree:** one UNTRACKED file — `docs/superpowers/handoffs/2026-06-22-partner-portal-foundation-handoff.md`
  (the Phase-A handoff). The program specs/plan ARE committed. This new handoff is also untracked until
  committed. **Offer to commit both.**
- **Stashes:** none. SDD ledger at `.superpowers/sdd/progress.md` (git-ignored scratch; holds the full
  Phase-A run).
- **Migrations APPLIED to prod:** `20260622000002` (trigger maps invitation `company_id`→`profiles.client_id`)
  and `20260622000003` (RESTRICTIVE RLS `samples_client_select_own_company`). Verified live.

## What's done — Phase A (all on origin/main)
| SHA | What |
|---|---|
| `5da3c9e` | portal auth helpers + `requirePortalCompany` guard |
| `57f9cb8` | OAuth callback: client_id + role-based landing |
| `958a419` | trigger migration: invitation company_id → profiles.client_id |
| `ce5aa1a` | client-invite API + payload builder |
| `9049b35` | staff invite dialog (mounted in `client-detail-view.tsx`) |
| `a4d92b6`+`f31fd82` | light top-nav shell + role guards (+ fix loop) |
| `293ddfd` | overview dashboard |
| `91fff5a` | samples list |
| `b0f32ff` | contracts list |
| `d64092f` | certificates list |
| `09fba02` | scoped cert document routes (closed a Critical doc-link IDOR) |
| `ff75467` | RESTRICTIVE RLS scoping client sample reads |

Built via subagent-driven-development (implementer + independent review per task; Opus whole-branch
review). 13/13 portal tests green, tsc clean. (Interleaved with Daniel's `86d01bf`/`6871667` PSS-picker
commits — not portal work.)

## Operational guide — portal access: companies, invites, logins (how Daniel actually uses it)
This is the as-built operational flow (verified against the code 2026-06-24), plus the management gaps.

**1. Which companies are eligible for portal access.**
There is **no separate "portal-eligible" flag** — eligibility = the company is a **QC client**
(`companies.is_qc_client = true`). Those are exactly the companies that appear in **`/clients`**. To make a
company eligible: create it via the `/clients` "new client" flow (sets `is_qc_client=true`) or flip
`is_qc_client` to true on an existing company. Per-client config (cert pattern, pricing, etc.) lives in
`qc_client_settings` keyed by `company_id`, but that's not required for portal access — `is_qc_client` is.

**2. Who can invite.** Staff only. The entire `/clients` area renders inside the dark internal `MainLayout`,
which redirects any client-role user away to `/portal`. So only staff ever see the invite control.

**3. How to invite a person.** Open the company at **`/clients/[id]`** → in the header click
**"Invite portal user"** → enter **first name, last name, email** → **Send invitation**. That single action:
- inserts a `user_invitations` row with `qc_role='client'`, `company_id` = this company, `qc_enabled=true`,
  `laboratory_id=null`, a unique `invitation_token`, and a **7-day expiry**;
- emails the person via **Resend** (from `Wolthers QC <noreply@qc.wolthers.com>`) a link to
  **`<NEXT_PUBLIC_APP_URL>/auth/accept-invite?token=<token>`**.
- Guards: **409** if a profile already exists for that email; **400** on invalid email / missing fields.
  Email-send failure does NOT fail the invite (the row is still created; they can be re-invited).

**4. Who gets a credential.** Only the person you invite — access is **invitation-only**, no self-signup.
**One portal user = one company** (scoped by `profiles.client_id`). Multiple people at the same company →
invite each one separately. There is no bulk invite.

**5. How the login is actually created.** The invitee opens the accept link
(`src/app/auth/accept-invite/page.tsx`) and picks ONE of two methods:
- **Microsoft** ("Continue with Microsoft" → Azure OAuth), or
- **Password** ("Or continue with password", minimum 8 characters).
Either path creates their Supabase auth user. The `handle_new_user` trigger (matched to the pending
invitation **by email**) — and, on the OAuth path, the `/auth/callback` route — then writes their
`profiles` row with **`qc_role='client'` and `client_id` = the inviting company**, and marks the invitation
accepted. On login they are auto-routed to **`/portal`** (role-based redirect), cannot reach
`/dashboard`/`/clients`, and see only their own company's data (enforced by both the `/api/portal/*` layer
and the `samples_client_select_own_company` RLS policy). *Aware-of:* the password path uses
`supabase.auth.signUp`, so if email confirmation is enabled on the Supabase project the user must confirm
before logging in; Microsoft OAuth skips that. The invite link expires after 7 days.

**6. What a portal user can do.** Read-only: Overview, Samples, Contracts, Certificates (+ download cert
PDFs through the scoped `/api/portal/certificate/[slug]/pdf` route). No writes to QC data.

**7. Managing access — CURRENT GAPS (Phase A intentionally minimal).**
- **No pending-invite list in the UI.** The `GET /api/portal/invitations?company_id=…` endpoint exists
  (built in Task 4) but nothing renders it — the dialog only POSTs. You can't see who's been invited from
  the app yet.
- **No resend button and no cancel/revoke** — the invite route has only GET + POST (no DELETE/PATCH), and
  there's no disable-user UI. Re-inviting the same email just sends another link (no pending-dup guard).
- **To revoke access today = manual:** delete/disable the auth user in Supabase, or clear that user's
  `profiles.client_id` / change their `qc_role` (then RLS + the API stop returning data). 
- These are good candidates for a small follow-up admin enhancement (wire the existing GET into a pending
  list with resend + add a DELETE for cancel/revoke). Not blocking B.

**Precondition (already satisfied):** the `company_id → profiles.client_id` mapping only works because
migration `20260622000002` is applied (it is, in prod). Without it, invited clients would have a NULL
`client_id` and see nothing (fail-closed).

## Locked decisions (do NOT relitigate)
1. **Audience = all QC clients**, one portal user → one company via `profiles.client_id`. Suppliers/buyers
   deferred (they'd scope by `seller_id`/`exporter_id`).
2. **Read-only** portal — no writes to QC data from `/portal`.
3. **Sequence A→B→C→D**, each ships before the next. D = the existing Dunkin traceability spec, built last.
4. **One login, role-based redirect** (NOT a subdomain): `qc_role='client'`→`/portal`, staff→`/dashboard`.
5. **Distinct LIGHT visual language** for `/portal` (top nav, white bg, soft shadows, single olive
   `#556b2f` accent, Inter). **Do NOT reuse the dark internal `MainLayout`.** No emojis, no mock data.
   Fantasy company names for display.
6. Every `/api/portal/*` route: `requirePortalCompany(supabase)` → `'error' in gate` → scope
   `.or('client_id.eq.<id>,end_client_id.eq.<id>')` + `.is('deleted_at', null)`. 401 no user / 403 not-a-client.
7. **B-specific (carried from the program spec):** "shipped"/"in-transit" status lives on **sys.wolthers.com**
   (`shipment_samples.status`, `shipments.load_status`) — do NOT fabricate it in WAQC. Reuse the existing
   cross-system merge endpoint rather than rebuilding it.

## Codebase anchors (what B builds on — reuse, don't rebuild)
- **Portal shell + nav:** `src/components/portal/{portal-shell.tsx,portal-top-nav.tsx,portal-nav.ts}`.
  B adds a nav slot + page in this shell (add to `PORTAL_NAV` in `portal-nav.ts`).
- **The B placeholder already scaffolded in A:** the overview "Shipments & in-transit — coming soon" tile
  in [../../../src/app/portal/page.tsx](../../../src/app/portal/page.tsx) (Task 7) — B replaces this with real data.
  The contracts list [../../../src/app/portal/contracts/page.tsx](../../../src/app/portal/contracts/page.tsx)
  is where the rich per-contract drill-down (B's timeline) naturally lands.
- **API pattern + auth/scope helper:** `src/lib/portal/portal-auth.ts` (`requirePortalCompany`,
  `getPortalCompany`, `isClientRole`, `resolveLandingPath`); existing routes
  `src/app/api/portal/{overview,samples,contracts,certificates}/route.ts` are the template for B's route.
- **Pure-logic + co-located tests pattern:** `src/lib/portal/*.ts` (rollup/mapper/grouping) — B's
  merge/timeline logic should follow this (pure fn + `*.test.ts`, thin route/page).
- **Cross-system shipped/in-transit source (KEY for B):** sys repo
  `Wolthers-system/wolthers-app/src/app/api/contracts/[id]/all-samples/route.ts` already merges WAQC
  samples + sys `shipment_samples` + status history. B should reuse/adapt this rather than re-deriving.
- **Scoped cert documents (A, reuse in B):** `src/app/api/portal/certificate/[slug]/pdf/route.ts` +
  `src/lib/certificate-pdf.ts` (`buildCertificatePdfResponse`).
- **samples columns** (all direct): `sample_type, status, workflow_stage, origin, tracking_number,
  quality_name, wolthers_contract_nr, client_id, end_client_id, created_at, updated_at, deleted_at`.
- **For C (later):** no Excel lib installed (only `jszip`) — add `exceljs`; reuse the per-sample aggregator
  in `src/lib/certificate-data.ts`.

## Gotchas (repo-specific traps)
- **WAQC is a single repo** — commit docs + code here; ignore two-repo `~/.git` machinery.
- **DB drift is real.** Live functions/policies have drifted FAR from the migrations on disk (the live
  `handle_new_user` was a merged body newer than any migration; the `samples` SELECT side had two wide-open
  permissive policies). **Before writing ANY migration that CREATE-OR-REPLACEs a function or DROP/ALTERs a
  policy, get the live definition from prod** (`pg_get_functiondef(...)` / `pg_policies`) — don't trust the
  files. Saved live trigger body: `.superpowers/sdd/task-2-live-body.sql`.
- **Migrations: Daniel applies them by hand and prefers pasted SQL.** Never run them. Write the `.sql` under
  `database/migrations/` AND paste the SQL for him; note applied-status.
- **`profiles.client_id` has NO FK** (DROP TABLE clients CASCADE removed it; never re-added). It holds a
  `companies.id`. Works; future orphan risk.
- **Push only when asked**; trunk-based on `main` deploys to prod. Daniel commits/pushes concurrently —
  stage ONLY your own paths (`git add <path>`, never `-A`); per-task review bases use the actual `^` parent.
- **Don't fabricate shipped/in-transit in WAQC** (it lives on sys) — this is the whole crux of B.
- File ceiling ~2000 lines.

## Deferred from Phase A (NOT blocking B; track them)
- **Public cert slug endpoint (`/api/certificate/<slug>/pdf`) is still enumerable** by tracking number —
  stays public by design for emailed cert links. Bundle the real fix with the broader **report-route
  security pass** (the open Weekly/Bi-Weekly/Annual IDOR + mail-relay + SSRF findings).
- Overview page lacks the olive accent (left for Daniel's in-app visual QA).
- Recurring route error-handling: portal routes discard the Supabase `error` (DB error → HTTP 200 + empty
  list); pages don't clear rows / show an error state on a non-ok fetch.
- Invite route: `request.json()` has no try/catch (malformed body → 500 not 400); duplicate check hits
  `profiles` not pending `user_invitations` (staff can re-send a pending invite).
- invite `DialogContent` missing `Description`/`aria-describedby` (a11y test warning).
- Route guards are client-side only (no middleware) — acceptable (portal routes are independently authz'd);
  consider middleware for defense-in-depth.

## Next / suggested next-up (by value-per-effort)
1. **Start B** — brainstorm the unified per-contract PSS→SS→shipped→in-transit timeline (what to show,
   how to merge WAQC + sys data, where it lives in the portal IA), then spec → plan → build via
   subagent-driven-development. Highest value; it's the program's core promise.
2. **(Daniel) Phase A smoke test** — invite a test client, verify `/portal` scoping end-to-end.
3. **Then C** (exceljs export — largely independent), **then D** (container traceability — nest the
   existing Dunkin spec as a portal tab).
4. **Separately:** the report-route + public-cert security pass (its own workstream).

## Things the user said that should shape future work
- **Phase A executed end-to-end this session and shipped** (migrations applied, pushed on his go-ahead).
  He moves through go-live methodically (applied migrations, verified the RLS policy, then said "push").
- **Standing prefs (project memory):** trunk-based on `main`, push **only when asked**; **Daniel applies
  migrations himself and prefers pasted SQL**; brainstorm in text (no browser visual companion); no emojis;
  no mock data; fantasy names for company display.
- The **report-route security hardening** is a known, still-open item the user owns — Phase A's RLS fixed
  the sample-read IDOR, but the mail-relay/SSRF/public-cert findings remain a separate, deferred workstream.
