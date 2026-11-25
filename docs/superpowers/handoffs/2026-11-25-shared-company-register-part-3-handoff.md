# Handoff — Shared company register, Part 3: QC screens (2026-11-25)

Supersedes [2026-11-25-shared-company-register-part-2-handoff.md](2026-11-25-shared-company-register-part-2-handoff.md). Part 2 is done, applied and pushed.

**Resume point:** START Part 3 subagent-driven from [../plans/2026-11-24-shared-company-register-part-3-qc-screens.md](../plans/2026-11-24-shared-company-register-part-3-qc-screens.md), Tasks 1–7. No Part 3 code is written yet.
- First, create the SDD workspace and ledger.
- Then run the pre-flight scan. Put the "Open questions for pre-flight" below in its table.
- Task 7 (template copies get their spec's lab) is independent of Tasks 1–6 and can go first.

## The work (one paragraph)

QC (qc.wolthers.com, this repo) and sys (sys.wolthers.com, the `wolthers-app` repo) share one Supabase database and one company register. Parts 1 and 2 are live:
- A lab other than Santos ("confined") sees only the companies it added or was linked to, and only its own contacts, holders and bank accounts on them.
- QC settings (`qc_client_settings`) and quality specs (`client_qualities`) now belong to a laboratory.

**Part 3 is the QC screens.** From QC a user can register a company completely: documents, holders, bank accounts, staff, and every matrix tick. Each lab's emails go only to the contacts it owns. There is also a QC Contacts directory.
- **Task 7** closes the last data gap before non-HQ staff exist: client template copies get their spec's lab.
- Part 4 (the sys UI) comes after.
- Spec: [../specs/2026-11-24-shared-company-register-lab-scope-design.md](../specs/2026-11-24-shared-company-register-lab-scope-design.md) (decisions 1, 3, 5, 6, 7, 9, Piece 2).
- Plans: [index](../plans/2026-11-24-shared-company-register.md), [Part 3](../plans/2026-11-24-shared-company-register-part-3-qc-screens.md), [Part 4](../plans/2026-11-24-shared-company-register-part-4-sys.md).

## Repo state right now (2026-11-25, end of day)

**WAQC worktree** `~/Documents/GitHub/WAQC-company-register`, branch `feat/company-register`:
- `origin/main` = `f5ca57a8` (Part 2, pushed).
- The branch is 2 commits ahead, **local only**, docs only: `ba626aa6 docs(plan): part 3 task 7` plus this handoff's commit.
- Verify with `git log --oneline origin/main..HEAD`.
- `node_modules` is a real install inside the worktree, not a symlink. The build needs that, because tiptap didn't resolve through the symlink.
- There is no `.env.local`. `npm run build` needs placeholder `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars.

**sys worktree** `~/Documents/GitHub/Wolthers-system/wolthers-app-company-register`, branch `feat/company-register-owner`:
- At `738db47e3`, 15 commits behind sys `origin/main`. Rebase it before Part 4.
- sys `main` now has migrations up to **1005**, so the next free number is **1006**, not 1004.

**WAQC main checkout** `~/Documents/GitHub/WAQC` is on the old branch `feat/certificate-print-list`, 220+ commits behind, with unrelated dirty files.
- **Don't touch it.** Daniel looks at migrations there in VS Code, and they don't show up because of the old branch.
- It has two untracked files, `20261109000000/1_*.sql`, byte-identical to `main`'s copies. They block `git switch main`. Delete them only if Daniel asks you to switch that checkout.

**Stashes:** none. Never `git stash`.

## What's done

| SHA | What |
|---|---|
| `f7353c42..4377e84e` | Part 1: migration A `20261124000000_company_register_lab_scope.sql` (+ check 27/27), `ownerLabFor` / `ownsRow` in `src/lib/auth/lab-scope.ts` |
| `fd8ccc44..4b903d06` | Part 2: migration `20261124000001_qc_settings_per_lab.sql` (check 42/42 on live) + security fixes `20261125000000_company_register_lab_scope_fixes.sql`. App reads/writes settings and specs per lab, covering clients API, intake, certificates, sends, specs and the portal. |
| `21d2a060`, `f5ca57a8` | Batch-send test fixtures carry `laboratory_id`; `database.types.ts` gets only the changed blocks from live; the `as object` workaround is removed |
| `ba626aa6` | Part 3 plan gains Task 7 (local only) |

**Applied on live by Daniel on 2026-11-25:**
- `20261124000001`
- `20261125000000` (its check output was never seen: Daniel got "no rows", meaning he ran the migration, not the check. The objects were verified live read-only.)
- `20261111000000` (private template copies: `shared_left 0`, `client_copy_select_policy 1`, `old_staff_select_policy 0`)

**Verification at `f5ca57a8`:** full `npx vitest run` gives 5,027 / 5,027 passing; `npx tsc --noEmit` gives **0 errors** (the old baseline of 36 is gone); `npm run build` passed at `4b903d06`.

## Locked decisions (do NOT relitigate)

1. Any QC login edits everything: documents, holders, bank accounts, all matrix columns. This reverses the old rule that QC ticks only the QC certificates column.
2. Non-HQ labs see only what they added. Matching an existing company **links** it (`company_labs`, `created_company=false`), and the lab sees only its own child rows. Enforced in the **database** (RESTRICTIVE policies on `qc_read_scope_lab()` / `qc_write_scope_lab()`).
3. Each lab's emails go only to contacts it owns (`owner_lab_id`). Santos's emails go to sys and Santos contacts (`owner_lab_id IS NULL`).
4. QC settings and quality specs are per lab, never shared. The portal shows a client's specs from every lab, labelled with the lab name.
5. Santos (HQ) staff write only Santos's lab rows; global admins write any lab. HQ's `qc_write_scope_lab()` is the HQ lab id, not NULL.
6. Confined labs never delete companies; they deactivate them. Only HQ and global admins can delete (security fix 20261125000000).
7. A sample's party companies must be visible to the confined writer. A DB trigger (`samples_qc_guard_party_companies`, SECURITY INVOKER) refuses with 42501. Service-role writes skip it by design.
8. Execution is subagent-driven, with a ledger, a task review after each task, and a final whole-branch review on the most capable model. Code that needs SQL stays on the branch until Daniel has applied it and the check passes, then goes straight to `main` with `git push origin HEAD:main` (fast-forward). The SQL is handed over at the end of the part, pasted in full or as `pbcopy` commands (see Gotchas).

## Open questions for pre-flight (Part 2 carried these to Part 3; rule on each or ask Daniel)

- **Confined contract intake:** a non-Santos lab picking a sys contract whose parties it can't see gets 42501 from the guard trigger. It needs a server-side link (`company_labs`), like Task 5's match-or-link.
- **Client list for a confined lab:** it shows linked clients with *default* settings. Should it show only the lab's own clients? Daniel hasn't decided.
- **HQ lab picker:** screens with no sample in hand show the user's own lab (`settingsLabFor(scope, hqLabId)`), so Santos sees only Santos's settings and specs. Do Santos or global admins need a lab picker to see or manage other labs' settings?
- **`canWriteLab` returns true for users with no lab** (`src/lib/auth/lab-scope.ts`). The DB scopes them to HQ, so the screen and the DB can disagree.
- **A PATCH that moves a spec or settings row to another lab** isn't checked against write scope in the app. The DB refuses it, but the message is generic. Task 7 adds a second reason: a copy's lab must follow its spec, so refuse lab moves.
- **A global DELETE of a client** clears `end_client_id` across every lab's samples.
- **Origin pricing is per client, not per lab.** Turning on origin pricing changes HQ fees and implicitly enrols the client.
- **The spec-change email doesn't name the lab.**
- **A non-Santos user who sends another lab's spec** gets "not found" instead of "belongs to another laboratory" (minor).

## Codebase anchors

**Lab-scope helpers:**
- [src/lib/auth/lab-scope.ts](../../../src/lib/auth/lab-scope.ts): `LabScope {ownLabId, isGlobal, isHq}`, `readsAllLabs`, `canWriteLab`, `ownerLabFor`, `ownsRow`, `loadLabScope`, `labWriteBlock`.
- `src/lib/qc-settings/`:
  - `lab-row.ts`: `pickLabRow`, `settingsLabFor`, `loadHqLabId`
  - `user-lab.ts`: `loadSettingsLab`
  - `spec-lab-block.ts`
  - `sample-spec-lab.ts`: `checkSpecLab`
- `src/lib/supabase-service.ts`: `serviceRoleClient()`.

**Plan line references that moved after Part 2.** Re-verify the rest before dispatching.
- `send-queue.ts`: the sample select is at :184; the contacts read is at :236 and :262-292 (the `.from('contacts')` call is at :277).
- `src/app/api/clients/route.ts`: the email-match branch the plan removes is now :209-215, not :203-210.
- `add-client-modal.tsx`: the fire-and-forget exporter, importer and roaster posts are at :245-280 (unchanged).
- `src/lib/contacts/people.ts:53`: `QC_EDITABLE_PURPOSES = ['qc_certificates']`.
- `src/components/clients/client-detail-view.tsx:28-31`: the tabs array.
- `src/lib/qc-contacts/upsert.ts:79-89`: `findContactByEmail` with `.maybeSingle()`. It breaks once a lab owns its own copy of an email. Task 1 fixes it.
- `src/lib/approval-notification/recipients.ts`: still present, with no callers. Task 1 deletes it.
- Sidebar: `src/components/layout/left-sidebar.tsx:160` (the "Clients" group), plus `src/components/command-palette/nav-targets.ts`.

**Template copies (Task 7):**
- `src/lib/quality-spec/private-copy.ts:51`: `makePrivateCopy`.
- Callers: `clients/[id]/quality-specifications/route.ts`, its `[specId]/route.ts`, and `client-qualities/route.ts`, `[id]/route.ts`, `[id]/duplicate/route.ts`.

**Embeds and types:**
- `qc_client_settings` embeds come back as **arrays** and must name the FK: `qc_client_settings!qc_client_settings_company_id_fkey(...)`. The guard test is `src/lib/qc-client-settings-embed.test.ts`.
- `src/lib/database.types.ts` was regenerated only for `client_qualities`, `qc_client_settings`, `generate_certificate_number`, `calculate_client_fee` and `generate_tracking_number`. Anything else may be stale.

## Gotchas

- **Run the FULL suite (`npx vitest run`) before any push.** In Part 2 the implementers ran only the files they touched and reported "457 pass". 3 batch-send route tests were broken and found only after the push: their fixtures lacked `laboratory_id`. Make every implementer and the final gate run the full suite.
- **Implementers must edit with the Edit tool and never rewrite whole files with scripts.** A Part 2 implementer's Python rewrite silently deleted 5 unrelated tests.
- **Never resume a handoff without checking for a live original session.** In Part 2, two controllers wrote to the same branch and ledger at once. Ask Daniel first.
- **Daniel applies all SQL himself.**
  - Never apply SQL. Use only read-only MCP queries (project `ojyonxplpmhvcgaycznc`).
  - Big files can be handed over as `pbcopy < path` commands. Pasting ~2,600 lines in chat risks truncation.
  - Tell him which output to expect. The migration ends with a commented SELECT, so "Success. No rows returned" is normal for it; the **check** must return rows.
- **Supabase SQL editor:**
  - It appends `ENABLE RLS` for names after `SELECT … INTO` / `RETURNING … INTO` (42P01). The migrations' own DO blocks use `v := (SELECT …)`.
  - Function bodies copied verbatim from live can trigger one harmless trailing 42P01 after COMMIT. Say so in the header.
  - Checks follow BEGIN, one DO block, a final SELECT, then ROLLBACK. Throwaway logins are inserted via `'INSERT IN' || 'TO '`.
- **Types:**
  - `npx supabase gen types` has no privileges on this project.
  - MCP `generate_typescript_types` returns ~48k lines, because the database includes every sys table.
  - Splice only the changed table and function blocks into `src/lib/database.types.ts`. Never replace the whole file.
- **Cupping cards:** 19 uncupped lots printed in the last 30 days carry the *base* template id in their QR, not the new copy. The content is identical today; reprint them if the base template is ever edited.
- **sys RESTRICTIVE deny policies** exist on shared tables, including `quality_templates_*_deny`. Policy resets drop only PERMISSIVE ones.
- **Non-HQ staff setup:** staff with a non-@wolthers.com email become sys `user_type='external'` and see nothing. They must be internal and active.
- **Project rules:**
  - Never render `samples.tracking_number` (SAN-…). Use the certificate number or the contract refs.
  - Company labels go through `companyDisplayName()`.
  - No emojis.
  - Green primary buttons, corners 10/6/4/0.
  - Files stay under ~2,000 lines.
- **SDD helper scripts** are in `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/skills/subagent-driven-development/scripts/`: `sdd-workspace`, `task-brief`, `review-package`. Run them by absolute path from the worktree. Delete the Part 3 workspace when it's finished, after the "Rulings I made" list has gone to Daniel.

## Next, in order

1. Check that no other session is running Part 3. Run `git log --oneline origin/main..HEAD` in the worktree and confirm only `ba626aa6` plus this handoff's commit.
2. Create the SDD workspace, the ledger and the pre-flight table. Rule on the open questions above, or put them to Daniel in one AskUserQuestion. The confined-intake and client-list questions are product calls.
3. Tasks 1–7, each with an implementer and a task review, then the final whole-branch review and one fix wave.
4. Hand Daniel the SQL: Task 7's migration and check. Tasks 1–6 need no SQL unless pre-flight finds some.
5. Once Daniel says "applied": verify read-only, push to `main`, update memory (`shared-company-register-lab-scope.md`) and delete the workspace.
6. Part 4 (sys UI): rebase the sys worktree first; the next sys migration is 1006. It carries:
   - `qc-offset-server.ts` per-lab pairing
   - re-creating `dashboard_lab_fees_v` with the lab join on sys
   - `.is('owner_lab_id', null)` in `contacts-tab.tsx:420-426` and `src/lib/contacts/quick-add.ts`
