# Handoff — "Samples not visible" triage (WAQC) — 2026-07-08

**Resume point:** WAQC users report they **cannot see samples**. Reported first for Anderson, then confirmed **all users** (internal lab staff included). There are **two separate threads** below — do **thread 1 first** (the actual all-users outage; evidence points to a WAQC-side cause, NOT the shared-DB RLS work). Thread 2 is a real but narrower regression the sys "importer portal" work introduced for **external/QC-client** views, which you should also fix.

Context: WAQC (qc.wolthers.com) shares ONE Supabase project with sys (sys.wolthers.com). On 2026-07-07→08 a sys session shipped "Tier 2" access-control work that added external-user RLS across the shared DB (migrations `20260707180000` Part 1 + `20260707190000` Part 2). That work is the reason to suspect the DB — but the all-users outage is most likely WAQC-side (see thread 1). Full sys context: sys repo memory `project_importer_access_portal` + `project_security_audit_2026_07_07`.

---

## Thread 1 — ALL users can't see samples (the outage; likely WAQC-side)

**Why it's probably NOT the shared-DB RLS work:** everything the sys work changed is gated on `current_user_is_external()`, which is FALSE for internal users. Anderson is `anderson@wolthers.com`, `user_type='internal'` (confirmed via `user_profiles`). An external-only policy cannot black out internal lab staff. A total, all-roles blackout is the signature of an app/deploy/query problem, not an external RLS policy.

**First, run this to definitively rule the DB in or out** (reads `samples` as internal Anderson under RLS):
```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  '{"sub":"9b9df326-cca6-4adc-bf5e-fa181dcc5092","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT current_user_is_external() AS is_external, (SELECT count(*) FROM samples) AS samples;
ROLLBACK;
```
- `samples > 0` (and `is_external=false`) → **RLS is fine → look in WAQC app**: recent deploy, the samples list route `src/app/api/samples/route.ts` (uses the RLS-scoped `createClient()`), a new `client_id`/`laboratory_id`/`workflow_stage`/`status` filter, or a WAQC-side migration. WAQC has uncommitted work in the tree (cupping page, scan dialogs, certificate override, `database/migrations/20260624000000_allow_override_terminal_transitions.sql`) — check whether any of that shipped/half-applied.
- `samples = 0` or error → the shared DB IS blocking internal users; escalate back to a sys-DB session with that result (would mean a permissive policy on `samples` got dropped or `current_user_is_external()` is erroring — neither is expected from the sys work, so this would be a new finding).

**WAQC's own recent commits** (context for what changed on the app side): report restructure, cert-editor cupping scores, intake sub-contract PSS linking (`f61e090`…`3ac3a7c`).

## Thread 2 — External/QC-client sample views broken by the sys Part-1 deny (this one IS us)

The sys **Part 1** migration (`20260707180000_tier2_external_default_deny.sql`) ran a blanket loop that added `AS RESTRICTIVE FOR ALL USING (NOT current_user_is_external())` to **every RLS-enabled public table not in its allow-list**. WAQC's core tables were NOT in that allow-list, so they now carry an external-deny. Confirmed present:
- `samples_external_deny`, `cupping_scores_external_deny`, `cupping_sessions_external_deny`, `sample_contracts_external_deny`, `sample_recipients_external_deny`, `cupping_audit_log_external_deny` (all on RLS-enabled tables).

**Effect:** any **external** user (a WAQC QC client / partner-portal user whose `user_profiles.user_type='external'`) reading these tables **through the RLS-scoped client** now gets **zero rows**. Internal users are unaffected (the deny allows them). So WAQC's client-facing / partner-portal sample + certificate + cupping views are the blast radius, not the lab UI.

**How to confirm:** find a real external WAQC user id (a QC client with `user_type='external'` in `user_profiles`) and run the same simulation as thread 1 with their `sub` — `samples`/`cupping_scores` will come back 0 while `is_external=true`. Also check whether WAQC's client/partner-portal sample routes use the RLS client (`createClient()`) vs the service-role client — service-role routes bypass RLS and are unaffected; RLS-client routes are broken. (`src/app/api/clients/me/storage-view/route.ts` uses the RLS client; many `src/app/api/samples/**` routes use `SUPABASE_SERVICE_ROLE_KEY` and are safe.)

**Fix direction (decide in the WAQC session; coordinate with sys since it's shared RLS):**
- Preferred: add proper **external allow policies** for QC clients on these WAQC tables, scoped to the client's own samples (mirror how sys scoped `contracts`/`shipment_samples` for external — a `_external_read` PERMISSIVE policy keyed on the QC client's company/`client_id`), so the restrictive deny no longer zeroes them out. This restores QC-client visibility *with* a real boundary.
- Or, if WAQC's client-facing sample reads all go through **service-role** routes anyway (verify), the deny is harmless in practice and you only need it where an RLS-client path exists.
- Do NOT simply drop the deny policies wholesale — that re-opens the sys security boundary these were added for. Add scoped allows instead.

## Do NOT (guardrails)
- Don't "fix" thread 1 by deleting the external-deny policies — thread 1 is internal users, the deny doesn't affect them; deleting them only masks thread 2's boundary.
- Migrations here are applied by Daniel via pasted SQL (Studio). NOTE the sys gotcha: an explicit `BEGIN;/COMMIT;` inside a Studio-pasted migration silently aborts (Studio wraps its own txn) — omit them or expect a rollback.
- WAQC has uncommitted parallel edits in the tree — stage only your own paths, never `git add -A`.

## Anchors
- WAQC samples list/create (RLS client): `src/app/api/samples/route.ts`
- WAQC client storage view (RLS client): `src/app/api/clients/me/storage-view/route.ts`
- WAQC user model: `profiles` (`client_id`, `qc_role`) — separate from sys `user_profiles`
- sys Part 1 deny migration: `Wolthers-system/wolthers-app/supabase/migrations/20260707180000_tier2_external_default_deny.sql` (the allow-list array is near the top)
- sys Part 2 (grants) migration: `…/20260707190000_external_company_grants.sql`
</content>
