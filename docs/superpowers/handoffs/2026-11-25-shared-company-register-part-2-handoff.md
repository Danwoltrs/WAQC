# Handoff — Shared company register, Part 2: QC settings per lab (2026-11-25)

**Resume point:** Check whether the Part 2 **Task 1** implementer finished. Look for the commit `feat(db): QC settings and quality specs belong to a laboratory` on `feat/company-register` and the report `.superpowers/sdd/2026-11-24-shared-company-register-part-2-qc-settings-per-lab/task-1-report.md` (worktree paths below).
- Present → run the task review and continue Tasks 2–7, subagent-driven.
- Absent → re-dispatch Task 1 from its brief.

Also do the **security follow-up migration**, a small task of its own (§ Security follow-up). Do it before any staff are created at a lab other than Santos.

## The work (one paragraph)

QC (qc.wolthers.com, this repo) and sys (sys.wolthers.com, the `wolthers-app` repo) share one Supabase database and one company register. Part 1 (data) is applied and pushed:
- A lab other than Santos ("confined", `qc_read_scope_lab()` returns its lab id) sees only the companies it added or that are linked to it (`company_labs`).
- On those companies it sees only its own contacts, holders (`company_titulares`) and bank accounts (`owner_lab_id`).
- Santos (HQ), global admins and sys see everything.

**Part 2** makes QC settings (`qc_client_settings`) and quality specs (`client_qualities`) belong to a laboratory. The same client then has different settings in each lab: Daniel said "each origin has different quality settings".
- Parts 3 and 4 come later: the QC company screens and directory, then the sys UI.
- Spec: [../specs/2026-11-24-shared-company-register-lab-scope-design.md](../specs/2026-11-24-shared-company-register-lab-scope-design.md) (decision 8, "Piece 1b").
- Plans: [index](../plans/2026-11-24-shared-company-register.md), [Part 2](../plans/2026-11-24-shared-company-register-part-2-qc-settings-per-lab.md), [Part 3](../plans/2026-11-24-shared-company-register-part-3-qc-screens.md), [Part 4](../plans/2026-11-24-shared-company-register-part-4-sys.md).

## Repo state right now (2026-11-25)

**WAQC worktree** `~/Documents/GitHub/WAQC-company-register`, branch `feat/company-register`:
- `origin/main` = `4377e84e` (Part 1, pushed).
- The branch is 1 commit ahead, **local only**: `fd8ccc44 docs(plan): part 2 task 7`.
- The Task 1 implementer may have added commits since. Verify with `git log --oneline origin/main..HEAD`.
- This handoff file is in the same worktree.

**sys worktree** `~/Documents/GitHub/Wolthers-system/wolthers-app-company-register`, branch `feat/company-register-owner`:
- The branch equals `origin/main` `738db47e3` (rebased and pushed). Nothing local.
- Keep the worktree for Part 4.

**WAQC main checkout** `~/Documents/GitHub/WAQC` is on `feat/certificate-print-list` with unrelated dirty and untracked files.
- **Don't touch it.** Work only in the worktree.
- Push with `git push origin HEAD:main` from the worktree, fast-forward only.

**Stashes:** none created. Never `git stash` in these repos.

## What's done

**Part 1, applied on live and pushed:**

| Repo | SHA | What |
|---|---|---|
| WAQC | `f7353c42..4377e84e` (8 commits) | Migration A `database/migrations/20261124000000_company_register_lab_scope.sql`, check `database/checks/20261124_company_register_lab_scope_check.sql`, `ownerLabFor` / `ownsRow` in `src/lib/auth/lab-scope.ts` (20/20 tests) |
| sys | `2eb5943f9..5aaf271de` | `supabase/migrations/0998_contacts_owner_lab_uniqueness.sql`: contact email unique per company and owner, both contact RPCs owner-aware plus a caller guard, merge owner-aware plus `company_labs` 6c. Check: `supabase/checks/0998_contacts_owner_lab_check.sql` |
| sys | `738db47e3` | `1003_upsert_recipient_contacts_uuid_min.sql`: **an old bug.** `upsert_recipient_contacts` used `min(id)` on a uuid column (Postgres has no such aggregate) since 0396, so recipient auto-save never worked. Applied. |

**Live check results:**
- A check: 27/27.
- sys 0998 check: 20/21. Row 7 was the `min(uuid)` bug, now fixed by 1003. Daniel said "push" before re-running it, so it hasn't been re-run since the fix.
- From now on, sys sends auto-create contacts for outside recipients whose email domain matches the contract's buyer, seller or shipper. Flagged to Daniel.

**Part 2 so far:**
- The ledger is at `.superpowers/sdd/2026-11-24-shared-company-register-part-2-qc-settings-per-lab/progress.md`. Read it first: it holds the pre-flight table and all rulings.
- Task 7 was added to the plan in `fd8ccc44`. It sweeps the client-keyed readers and inserts the plan didn't name: `fee-calculator.ts`, `client-form.tsx`, `client-edit-form.tsx`, `quality-matching.ts`, `contract-intake-mapping.ts`, `private-copy.ts`, and others.
- Task 1 (SQL `20261124000001_qc_settings_per_lab.sql` plus check `database/checks/20261124_qc_settings_per_lab_check.sql`) was dispatched to an opus implementer at base `fd8ccc44`. It may use read-only live MCP SQL for dumps (project `ojyonxplpmhvcgaycznc`), and is told not to hand off to Daniel or push.
- Tasks 2–7: not started.

## Locked decisions (do NOT relitigate)

1. Any QC login edits everything: documents, holders, bank accounts, all matrix columns.
2. Non-HQ labs see only what they added. Matching an existing company **links** it (option A), and the lab sees only its own child rows. This is enforced in the **database** with RESTRICTIVE policies.
3. Each lab's emails go only to contacts it owns. Santos's emails go to sys and Santos contacts.
4. QC settings and quality specs are **per lab, never shared**.
5. Execution is subagent-driven, with a ledger per part, task review after each task, and a final whole-branch review.
6. Code that needs a migration stays on the branch until Daniel has applied the SQL and the check passes. Then fast-forward to `main`. Hand the SQL over at the **end** of a part, as in Part 1: migration, then check, pasted in full.
7. Part 2 rulings in the ledger:
   - Portal users see the client's specs from **every** lab, labelled with the lab name.
   - Settings lab without a sample = `settingsLabFor(scope, hqLabId)`: own lab, or HQ for a global admin or a user with no lab.
   - Backfill goes to the lab with `type='hq'`, found by type, never by name.

## Security follow-up (from the automated review of pushed A; both MEDIUM, both real, neither exploitable today)

Write a small WAQC migration `database/migrations/20261125000000_company_register_lab_scope_fixes.sql` plus a check. Give it a task review like any SDD task, then paste both to Daniel.

**1. A company can become visible through a sample** ([migration A:137](../../../database/migrations/20261124000000_company_register_lab_scope.sql#L137), trigger at :243).
- The gap: a confined user writes the id of a company their lab can't see into a sample party column. Nothing is linked then. A later save by HQ, sys or the server fires `qc_link_sample_companies` and links it.
- The fix: a new BEFORE INSERT/UPDATE trigger on `samples`, **SECURITY INVOKER** (so the user's RLS on `companies` applies).
- It runs only when `qc_read_scope_lab() IS NOT NULL`.
- It covers each of `client_id, seller_id, exporter_id, importer_id, roaster_id, end_client_id`. On INSERT it checks non-null values; on UPDATE only values where `NEW.x IS DISTINCT FROM OLD.x`.
- Rule: if `NOT EXISTS (SELECT 1 FROM companies WHERE id = NEW.x)`, raise 42501.

**2. A lab can delete a company it created** ([migration A:313](../../../database/migrations/20261124000000_company_register_lab_scope.sql#L313)).
- The gap: the delete cascades into sys, Santos and other labs' rows added since.
- The fix: `companies_lab_scope_delete` becomes `USING ((SELECT public.qc_read_scope_lab()) IS NULL)`. Confined labs deactivate, never delete.
- Cost: a lab can't delete a typo company; HQ can.

**Check cases:**
- A confined user's sample naming an unseen company → 42501.
- A confined user's sample naming a visible company → OK.
- A confined user's update of another column on a sample whose party HQ set → OK.
- A confined delete of its own company → 0 rows.

## Files the plan touches (Part 2)

- **New:**
  - `database/migrations/20261124000001_qc_settings_per_lab.sql` and its check
  - `src/lib/qc-settings/lab-row.ts`: `pickLabRow`, `settingsLabFor`, `loadHqLabId`, plus a test
- **Modify:**
  - clients API (`src/app/api/clients/**`) and `src/lib/qc-client-mapper.ts`
  - intake (`src/app/api/samples/route.ts`, `tracking-numbers`, `src/components/samples/intake/*`)
  - certificates and sends (`src/lib/cupping/certificate-mint.ts`, `src/lib/certificate-data.ts`, `src/lib/tolerance/auto-approve.ts`, `src/lib/approval-notification/send-queue.ts`, `src/lib/seller-requests/store.ts`)
  - specs (`src/app/api/client-qualities/**`, `src/lib/portal/portal-qualities-fetch.ts`, the cert editor `use-cert-editor.ts`)
  - plus the Task 7 sweep

## Codebase anchors

- [src/lib/auth/lab-scope.ts](../../../src/lib/auth/lab-scope.ts):
  - `LabScope {ownLabId, isGlobal, isHq}` at :23
  - `readsAllLabs` at :45, `canWriteLab` at :53
  - `ownerLabFor` at :68, `ownsRow` at :78
  - `loadLabScope` at :103, `labWriteBlock` at :130
- Live SQL helpers: `qc_read_scope_lab()` and `qc_write_scope_lab()` (`database/migrations/20261119000002_lab_scope.sql`), and `waqc_is_staff()`.
- After the Part 2 PK change, PostgREST returns `qc_client_settings` embeds as **arrays**. They must still name the FK: `qc_client_settings!qc_client_settings_company_id_fkey(...)`. Two FKs reach `companies`, so an unnamed embed gives PGRST201; the guard test is `src/lib/qc-client-settings-embed.test.ts`.
- Part 4 (sys) carries two more same-address lookups that must add `.is('owner_lab_id', null)`: `src/app/(dashboard)/companies/contacts-tab.tsx:420-426` and `src/lib/contacts/quick-add.ts`.

## Gotchas

- **Daniel applies all SQL himself.** Paste it in full in the reply, never apply it. Use read-only MCP queries to verify after he says "applied".
- **Supabase SQL editor:**
  - It appends `ENABLE RLS`, so a top-level `SELECT … INTO` or `CREATE TABLE … AS` breaks (42P01).
  - It honours BEGIN/COMMIT.
  - Check scripts use one DO block plus a final SELECT plus ROLLBACK, and insert throwaway logins through the assembled string `'INSERT IN' || 'TO '`.
- **Don't trust a local PG mock for built-ins.** Part 1's mock accepted `min(uuid)`; live doesn't. The source of truth is the live `pg_get_functiondef`, so sanity-check expressions with read-only SELECTs on live.
- **sys migration numbers:** 0999–1003 are taken on sys `main`, so the next free one is **1004**. WAQC migrations are date-named.
- **Non-HQ staff setup:** staff with a non-@wolthers.com email become sys `user_type='external'` and see nothing. They must be internal and active. A disabled QC profile on a non-HQ lab still confines, which fails safe.
- **What the sys RPC guard costs:** co-broker, external and freight-forwarder sends no longer auto-save contacts. Internal and field users still do.
- **Carry to Part 3:**
  - Any service-role route that writes samples for a confined lab must check that the party ids are visible to it.
  - `company_bank_accounts.titular_id` must belong to the same company.
  - WAQC `findContactByEmail` `.maybeSingle()` breaks once a lab has its own copy of an email.
- **WAQC tsc baseline:** 36 errors are older and identical on base and head. Report only new ones.
- **Project rules:**
  - Never render `samples.tracking_number` (SAN-…). Show the certificate number or the contract refs.
  - Company labels go through `companyDisplayName()` (fantasy name).
  - No emojis in the UI.
  - Files stay under ~2000 lines (`company-modal.tsx` in sys is already 1,825).
- **SDD helper scripts** are in `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/skills/subagent-driven-development/scripts/`: `sdd-workspace`, `task-brief`, `review-package`. Run them from the worktree with absolute paths.

## Next, in order

1. Finish or re-run Part 2 Task 1, then the task review.
2. Part 2 Tasks 2–7, each with an implementer and a task review. Then the final whole-branch review on the most capable model.
3. Write the security follow-up migration plus check, and review it.
4. Paste to Daniel, in order:
   1. the security fixes and their check
   2. `20261124000001` and its check
5. After every check passes: fast-forward push WAQC to `main`, update memory (`shared-company-register-lab-scope.md`), and delete the Part 2 SDD workspace.
6. Part 3 (QC screens and the QC Contacts directory), then Part 4 (sys UI), each subagent-driven with its own ledger.
