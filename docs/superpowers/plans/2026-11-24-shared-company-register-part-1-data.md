# Shared company register — Part 1: data and lab rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-HQ laboratory can read and write only the companies it has a link to and only the contacts, holders and bank accounts it owns; Santos, global admins, sys users and the service role are untouched.

**Architecture:** Two migrations against the shared Supabase project. WAQC migration A adds `company_labs`, `owner_lab_id` on three child tables, stamping triggers, RESTRICTIVE lab policies and QC-staff permissive policies on holders and bank accounts. sys migration B, applied after A, splits the per-company email unique index by owner and teaches sys's two contact RPCs and `merge_companies` about the owner. One small TS helper gives service-role routes the same owner rule.

**Tech Stack:** Postgres 15 / Supabase RLS, plpgsql; TypeScript + vitest (WAQC).

**Spec:** `docs/superpowers/specs/2026-11-24-shared-company-register-lab-scope-design.md` (WAQC). Index plan: `docs/superpowers/plans/2026-11-24-shared-company-register.md`.

## Global Constraints

- Daniel applies all SQL himself. Paste the full SQL in the reply; never run DDL through MCP. Read-only checks through MCP are fine.
- "Confined" = `public.qc_read_scope_lab()` returns a laboratory (non-HQ lab staff). NULL = not confined (HQ staff, global admins, sys users, portal users, service role). Never name a laboratory or country in SQL.
- **Owner column is `owner_lab_id`.** NULL = sys or Santos (HQ) scope; a laboratory id = that confined lab. Stamped from `qc_read_scope_lab()` (NULL for HQ), so sys and Santos rows never carry a lab.
- RESTRICTIVE policies only narrow. Never drop or edit the existing PERMISSIVE or sys deny policies (`*_cobroker_*`, `*_party_deny`, `*_plan_space_deny`, `*_external_deny`).
- Lock discipline: `SET LOCAL lock_timeout = '3s'` inside `BEGIN … COMMIT`; the migration touches `companies`, `contacts`, `samples` (trigger), not `profiles`.
- Nothing is deleted from the register tables: no DELETE grant or policy added.
- WAQC migrations live in `database/migrations/YYYYMMDDNNNNNN_name.sql`; sys in `supabase/migrations/NNNN_name.sql` (next free number at time of writing: check `ls supabase/migrations | tail`, 0960 unless taken).

## Review Focus

1. **Insert … RETURNING by a confined user** (`.insert().select()` on `companies`/`contacts`): the new row must be visible to its creator in the same statement, or the client gets 42501. Test in Task 2's verification script.
2. **Santos adds an email that Colombia already has at the same company** (and the reverse): both rows must coexist; sys's `upsert_recipient_contacts` and group-inbox RPC must still dedupe Santos/sys rows. Test in Task 3's verification script.
3. **A confined lab saves a sample whose exporter is a sys company it never added**: the company becomes visible to that lab (link created), and nothing else on it (contacts/accounts stay hidden). Test in Task 2's script.
4. **sys merge of two companies where each has a contact with the same email but different owners**: both contacts survive on the survivor. Test in Task 3's script.
5. **A sys user (no `profiles` laboratory) and a Santos user** see exactly what they saw before on all four tables: count check before/after in Task 2's script.

---

### Task 1: WAQC migration A — links, owners, lab policies

**Files:**
- Create: `database/migrations/20261124000000_company_register_lab_scope.sql`

**Interfaces:**
- Produces (DB):
  - `public.company_labs (id uuid pk default gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, laboratory_id uuid NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE, created_company boolean NOT NULL DEFAULT false, created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (company_id, laboratory_id))`. RLS on; SELECT for authenticated where `laboratory_id = qc_read_scope_lab() OR qc_read_scope_lab() IS NULL`; no direct INSERT/UPDATE/DELETE for authenticated (writes come from SECURITY DEFINER triggers and the service role); `company_labs_plan_space_deny` RESTRICTIVE like 0919.
  - `owner_lab_id uuid REFERENCES laboratories(id) ON DELETE SET NULL` on `contacts`, `company_titulares`, `company_bank_accounts`, each with a partial index `WHERE owner_lab_id IS NOT NULL`.
  - `public.qc_stamp_owner_lab()` BEFORE INSERT trigger fn: `NEW.owner_lab_id := COALESCE(NEW.owner_lab_id, public.qc_read_scope_lab())`. On UPDATE: `NEW.owner_lab_id := OLD.owner_lab_id` (owner never changes through the API).
  - `public.qc_link_company_to_scope_lab()` AFTER INSERT on `companies`, SECURITY DEFINER: if `qc_read_scope_lab()` is not null insert `company_labs(company_id, laboratory_id, created_company=true)` ON CONFLICT DO NOTHING.
  - `public.qc_link_sample_companies()` AFTER INSERT OR UPDATE OF `laboratory_id, client_id, seller_id, exporter_id, importer_id, roaster_id` on `samples`, SECURITY DEFINER: if NEW.laboratory_id's lab type is not `'hq'`, insert a `company_labs` row (created_company=false, ON CONFLICT DO NOTHING) for each non-null party id. Check `samples` column names first (`information_schema.columns`); include only those that exist.
  - RESTRICTIVE policies, all `TO authenticated`, scope read once via `(SELECT public.qc_read_scope_lab())`:
    - `companies_lab_scope_select` FOR SELECT: `scope IS NULL OR created_by = auth.uid() OR EXISTS (SELECT 1 FROM company_labs cl WHERE cl.company_id = companies.id AND cl.laboratory_id = scope)`. (`created_by` branch = Review Focus 1.)
    - `companies_lab_scope_update` FOR UPDATE: USING/WITH CHECK `scope IS NULL OR EXISTS (… AND cl.created_company)`.
    - No restrictive INSERT policy on `companies` (inserts stay as today). A BEFORE INSERT trigger `companies_qc_stamp_creator` sets `NEW.created_by := COALESCE(NEW.created_by, auth.uid())` when scope is not null, so the `created_by` branch above lets a confined creator read back its insert.
    - `{contacts,company_titulares,company_bank_accounts}_lab_scope` FOR ALL: USING and WITH CHECK `scope IS NULL OR owner_lab_id = scope`.
  - PERMISSIVE policies for QC staff (decision 1): `company_titulares_qc_staff` and `company_bank_accounts_qc_staff` FOR SELECT, INSERT, UPDATE (three policies each, or one FOR ALL minus DELETE — no DELETE grant exists so FOR ALL is safe) `TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()))`.
- Produces (TS): nothing.

- [ ] **Step 1: Read the live shapes the SQL depends on (read-only MCP)**

Run: `select column_name from information_schema.columns where table_name='samples' and column_name in ('client_id','seller_id','exporter_id','importer_id','roaster_id','buyer_id','laboratory_id');` and `select tgname from pg_trigger where tgrelid='public.companies'::regclass and not tgisinternal;`
Expected: the party columns that exist; existing companies triggers (do not collide on names).

- [ ] **Step 2: Write the migration** in the order: functions → `company_labs` → columns + indexes → triggers → policies → grants. `BEGIN; SET LOCAL lock_timeout = '3s'; … COMMIT;`. Header comment in the style of `20261119000002_lab_scope.sql`: why, the rule, who is not touched, "on 2026-11-24 Buenaventura has no staff and no samples: this changes what nobody sees today". End with the read-only post-apply check:

```sql
-- SELECT
--  (SELECT count(*) FROM pg_policy WHERE polname LIKE '%lab_scope%' AND polrelid IN
--     ('public.companies'::regclass,'public.contacts'::regclass,'public.company_titulares'::regclass,'public.company_bank_accounts'::regclass)) AS lab_policies,      -- 5
--  (SELECT count(*) FROM information_schema.columns WHERE column_name='owner_lab_id' AND table_name IN ('contacts','company_titulares','company_bank_accounts')) AS owner_cols, -- 3
--  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('companies_qc_link_scope_lab','samples_qc_link_companies','contacts_qc_stamp_owner','company_titulares_qc_stamp_owner','company_bank_accounts_qc_stamp_owner')) AS triggers; -- 5
```

- [ ] **Step 3: Commit**

```bash
git add database/migrations/20261124000000_company_register_lab_scope.sql
git commit -m "feat(db): company register scoped by laboratory — links, owners, restrictive policies"
```

### Task 2: Verification script for migration A

**Files:**
- Create: `database/checks/20261124_company_register_lab_scope_check.sql`

- [ ] **Step 1: Write the script** as one `BEGIN … ROLLBACK` block Daniel pastes after applying A. Inside: create a throwaway `auth.users` row + `profiles` row on the first non-HQ laboratory (`qc_role` = a lab role, `qc_enabled` true); pick one existing company S (sys, no link) and one existing contact on S; then `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role','authenticated')::text, true);` and return one row per assertion `(check text, pass boolean)`:
  - `confined sees 0 of S` — `select count(*) from companies where id = S` = 0
  - `confined insert returning works` — `insert into companies(name,country) values ('ZZ check co','Colombia') returning id` succeeds; the row is visible; a `company_labs` row with `created_company` exists
  - `contact stamped` — insert a contact on the new company; its `owner_lab_id` = the lab
  - `sample links party` — insert a sample on that lab with `exporter_id = S` (fill required columns from an existing sample's NOT NULL list); now S is visible; S's existing contact still invisible
  - `cannot update linked-only company` — `update companies set notes='x' where id = S` touches 0 rows
  - `bank account write` — insert a PIX-only `company_bank_accounts` row on the new company: succeeds
  - Then `RESET ROLE` and, as a Santos-lab throwaway user, `santos sees S contact` = 1 and `santos sees colombia contact` = 1 (HQ reads all).
- [ ] **Step 2: Hand both SQL files to Daniel** (paste in the reply: A, then the check). Wait for "applied" and the check output; every `pass` must be true. A false → fix A, give a follow-up migration, re-run.
- [ ] **Step 3: Commit** `git add database/checks/… && git commit -m "test(db): rolled-back check for the lab-scoped company register"`

### Task 3: sys migration B — per-owner email uniqueness, RPCs, merge

**Repo:** `Wolthers-system/wolthers-app` (work on `main` per its convention; one commit).

**Files:**
- Create: `supabase/migrations/0960_contacts_owner_lab_uniqueness.sql` (renumber if 0960 is taken)
- Create: `supabase/checks/0960_contacts_owner_lab_check.sql` (or wherever sys keeps ad-hoc checks; else alongside as a commented block at the end of the migration)

**Interfaces:**
- Consumes: `contacts.owner_lab_id`, `company_bank_accounts.owner_lab_id` from Task 1 (A must be applied first; B starts with `DO $$ BEGIN IF NOT EXISTS (… column owner_lab_id …) THEN RAISE EXCEPTION 'apply WAQC 20261124000000 first'; END IF; END $$;`).
- Produces: index `contacts_company_email_unique` redefined `ON contacts (company_id, lower(email)) WHERE email IS NOT NULL AND owner_lab_id IS NULL` (same name: `contacts-tab.tsx:418` matches on it); new `contacts_company_email_lab_unique ON contacts (company_id, lower(email), owner_lab_id) WHERE email IS NOT NULL AND owner_lab_id IS NOT NULL`.

- [ ] **Step 1: Dump the live bodies (read-only MCP)** of `upsert_recipient_contacts` (0396), the group-inbox upsert RPC (0483 — get its name from the file), `_company_merge_dedup_by_email` (0691:124) and `merge_companies` (0691:196) with `pg_get_functiondef`. Work from the live text, not the migration files.
- [ ] **Step 2: Write B** in one `BEGIN … COMMIT` (lock_timeout 3s): drop + recreate the two indexes; `CREATE OR REPLACE` the two RPCs changing ONLY their `ON CONFLICT (company_id, (lower(email))) WHERE email IS NOT NULL` to `… WHERE email IS NOT NULL AND owner_lab_id IS NULL` (and any re-read `WHERE company_id = … AND lower(email) = …` gains `AND owner_lab_id IS NULL`); `_company_merge_dedup_by_email` matches survivor ↔ loser only when `owner_lab_id IS NOT DISTINCT FROM`; `merge_companies` step 5d bank-account dedupe gains `AND t.owner_lab_id IS NOT DISTINCT FROM s.owner_lab_id`. Header comment cites the WAQC spec and says why each change exists.
- [ ] **Step 3: Write the rolled-back check** (Review Focus 2 and 4): as service role inside `BEGIN … ROLLBACK`, create two throwaway companies; on company 1 insert `a@x.test` with owner NULL and again with owner = a non-HQ lab (both succeed); a third insert with owner NULL fails with 23505 (catch in a `DO` block, report pass); call `upsert_recipient_contacts` for company 1 with `a@x.test` → still 2 rows; merge company 2 (with `a@x.test` owner = lab) into company 1 → 2 rows remain on company 1, distinct owners. Return `(check, pass)` rows.
- [ ] **Step 4: Run sys tests touching contacts** — `npm test -- src/lib/contacts src/lib/relay-followup` → all pass (no TS changed; guards against string matches on the index name).
- [ ] **Step 5: Hand B + check to Daniel** after A is confirmed applied; wait for the check output, all pass.
- [ ] **Step 6: Commit (sys repo)** `git commit -m "feat(db): contact email unique per owner lab; RPCs and merge respect it"`

### Task 4: TS owner rule for service-role routes (WAQC)

**Files:**
- Modify: `src/lib/auth/lab-scope.ts`
- Test: `src/lib/auth/lab-scope.test.ts`

**Interfaces:**
- Produces: `export function ownerLabFor(scope: LabScope): string | null` — the `owner_lab_id` a write by this user carries and the only owner they may see: `readsAllLabs(scope) ? null : scope.ownLabId`. And `export function ownsRow(scope: LabScope, ownerLabId: string | null): boolean` — `readsAllLabs(scope) || ownerLabId === scope.ownLabId`.

- [ ] **Step 1: Failing tests** in `lab-scope.test.ts`, `describe('who owns a register row')`:
  - HQ scope → `ownerLabFor` = `null`; `ownsRow(hq, null)` true; `ownsRow(hq, 'lab-co')` true
  - confined `{ownLabId:'lab-co', isGlobal:false, isHq:false}` → `ownerLabFor` = `'lab-co'`; `ownsRow(co, null)` false; `ownsRow(co, 'lab-co')` true; `ownsRow(co, 'lab-gt')` false
  - global admin with a non-HQ lab → `ownerLabFor` = `null`
- [ ] **Step 2: Run** `npx vitest run src/lib/auth/lab-scope.test.ts` → FAIL (not exported)
- [ ] **Step 3: Implement** both functions with a doc comment pointing at migration 20261124000000.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(auth): owner-lab rule for register rows written with the service role"`
