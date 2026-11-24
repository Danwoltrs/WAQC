# Shared company register — Part 2: QC settings per laboratory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each laboratory has its own QC settings (`qc_client_settings`) and quality specs (`client_qualities`) for a client; every reader uses the row of the sample's laboratory, or the user's own laboratory where there is no sample.

**Architecture:** One WAQC migration adds `laboratory_id` to both tables (backfilled to the HQ lab), moves `qc_client_settings`' primary key to `(company_id, laboratory_id)`, re-keys the spec unique indexes, adds RESTRICTIVE lab policies and lab-aware SQL functions. A small TS module picks the right row; each reader is switched to it area by area.

**Tech Stack:** Postgres / Supabase RLS; Next.js route handlers; TypeScript + vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-shared-company-register-lab-scope-design.md` — decision 8 and "Piece 1b". Depends on Part 1 being applied.

## Global Constraints

- Daniel applies the SQL; paste it in full. Read-only MCP checks only.
- Every existing row belongs to the HQ lab (`laboratories.type = 'hq'`); backfill to it, found by type, never by name or code.
- After the PK change PostgREST returns `qc_client_settings` embeds as **arrays** (to-many). Every embed reader must go through `pickLabRow`. The embed must still name the FK: `qc_client_settings!qc_client_settings_company_id_fkey(...)` ([[certificate-client-logo-pgrst201]]).
- Reads **by id** (`samples.quality_spec_id`, `client_qualities.id`) need no change: the id already names one lab's row.
- Reads keyed by `template_id` need no lab filter: `quality_templates` already belongs to a lab.
- The settings lab for a user with no sample in hand = `settingsLabFor(scope, hqLabId)`: own lab; a global admin or user with no lab → HQ.
- Portal (client users, no laboratory): shows the client's specs from **every** lab, labelled with the lab name. Claude's call: the specs are the client's own requirements; a portal user is the client.
- Never render `tracking_number` anywhere (CLAUDE.md).

## Review Focus

1. **Santos and Colombia both have settings for Ahold**: Santos's certificate for an Ahold sample uses Santos's pattern/layout/logo, Colombia's uses Colombia's — covered by `pickLabRow` tests (Task 2) and the SQL check (Task 1).
2. **A lab with no settings row for a client** (Colombia just linked Ahold): intake, tracking-number and certificate generation fall back to defaults and never borrow another lab's row. Test in Task 2 and Task 4.
3. **Upgrading an existing company to a QC client from Colombia**: inserts Colombia's settings row; Santos's row untouched; no 409 because Santos already has one. Test in Task 3.
4. **Spec uniqueness**: Colombia can create an Ahold spec on the same template / quality code Santos already uses. Test in Task 1's check.
5. **HQ user lists clients**: sees each client once, with HQ's settings, not one row per lab. Test in Task 3.

---

### Task 1: Migration — laboratory on settings and specs

**Files:**
- Create: `database/migrations/20261124000001_qc_settings_per_lab.sql`
- Create: `database/checks/20261124_qc_settings_per_lab_check.sql`

**Interfaces — produces (DB):**
- `qc_client_settings.laboratory_id uuid NOT NULL REFERENCES laboratories(id)`; PK `qc_client_settings_pkey (company_id, laboratory_id)`.
- `client_qualities.laboratory_id uuid NOT NULL REFERENCES laboratories(id)`, index on `(client_id, laboratory_id)`.
- Unique indexes rebuilt with the lab: `idx_client_qualities_unique_template_per_client (client_id, laboratory_id, template_id) WHERE is_active`, `idx_client_qualities_unique_code_per_client (client_id, laboratory_id, quality_code) WHERE <same predicate as today>`.
- Column default `laboratory_id DEFAULT public.qc_default_settings_lab()` on both: a STABLE SECURITY DEFINER fn returning the caller's `profiles.laboratory_id`, else the HQ lab id. Keeps old insert paths correct until Task 3–6 pass the lab explicitly.
- RESTRICTIVE policies on both tables: SELECT `scope_read IS NULL OR laboratory_id = scope_read`; INSERT/UPDATE/DELETE `scope_write IS NULL OR laboratory_id = scope_write` (`qc_read_scope_lab` / `qc_write_scope_lab`, read once via `(SELECT …)`). Leave the existing policies.
- SQL functions re-created from their **live** text (`pg_get_functiondef`), changing only the settings lookup to `WHERE company_id = … AND laboratory_id = <lab>`:
  - `generate_certificate_number` and `mint_certificate_number` (have `p_laboratory_id`)
  - `generate_tracking_number` (has `p_laboratory_id`)
  - `mint_origin_certificate_number` — no lab parameter: read the lab from the sample it is given (check its signature in the live text); if it has no sample either, add `p_laboratory_id uuid DEFAULT NULL` and update `assign_certificate_number` (20260925000003) to pass `v_sample.laboratory_id`
  - `calculate_client_fee(client_id, sample_id)` — lab from the sample
  - view `qc_billing_feed`: `JOIN qc_client_settings qcs ON qcs.company_id = s.client_id AND qcs.laboratory_id = s.laboratory_id`
  - the two SQL upserts with `ON CONFLICT (company_id)` (migrations `20260528000002:237`, `20260529000006:36`): find the live function that contains each; switch to `ON CONFLICT (company_id, laboratory_id)`.

- [ ] **Step 1: Dump live definitions** (read-only MCP) of every function above plus `pg_get_viewdef('qc_billing_feed')`; grep all `pg_proc` bodies for `qc_client_settings` and `client_qualities` to catch any function the inventory missed: `select proname from pg_proc where prosrc ilike '%qc_client_settings%' or prosrc ilike '%client_qualities%';`
- [ ] **Step 2: Write the migration** (`BEGIN … COMMIT`, lock_timeout 3s): add nullable column → backfill to HQ → set NOT NULL + default → swap PK / indexes → policies → functions/view. Header: why (decision 8), what changes for nobody today (all rows are HQ's).
- [ ] **Step 3: Write the check** (`BEGIN … ROLLBACK`, returns `(check, pass)`): HQ rows = all rows; insert a Colombia settings row for an existing HQ client succeeds; `generate_certificate_number(<client>, <colombia lab>, …)` uses Colombia's pattern and `(<client>, <hq lab>)` HQ's; a Colombia spec on the same `(client, template)` as an HQ spec succeeds; a second Colombia one fails 23505.
- [ ] **Step 4: Hand to Daniel** with the post-apply counts; wait for "applied" and all checks pass.
- [ ] **Step 5: Commit** `feat(db): QC settings and quality specs belong to a laboratory`

### Task 2: Row picker

**Files:**
- Create: `src/lib/qc-settings/lab-row.ts`, `src/lib/qc-settings/lab-row.test.ts`

**Interfaces — produces:**
- `pickLabRow<T extends { laboratory_id: string | null }>(rows: T[] | T | null | undefined, labId: string | null): T | null` — the row whose `laboratory_id === labId`; never another lab's; `labId` null → null.
- `settingsLabFor(scope: LabScope, hqLabId: string): string` — `scope.ownLabId ?? hqLabId`, and `hqLabId` when `scope.isGlobal && !scope.ownLabId`.
- `loadHqLabId(db: SupabaseClient): Promise<string>` — `laboratories` where `type = 'hq'`, cached per request; throws if none.

- [ ] **Step 1: Failing tests**: `pickLabRow([hq, co], 'co')` → co; `pickLabRow([hq], 'co')` → null (Review Focus 2); `pickLabRow(hq /* object, legacy embed */, 'hq')` → hq; `pickLabRow(null, 'hq')` → null; `settingsLabFor({ownLabId:null,isGlobal:true,isHq:false}, 'hq')` → 'hq'; `settingsLabFor({ownLabId:'co',…}, 'hq')` → 'co'.
- [ ] **Step 2: Run** `npx vitest run src/lib/qc-settings/lab-row.test.ts` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(qc-settings): pick the laboratory's settings row`

### Task 3: Clients API and mapper

**Files:**
- Modify: `src/lib/qc-client-mapper.ts` (`QC_CLIENT_SELECT` adds `laboratory_id` to the embed; `mapQcClient` / `fetchClientById` take `labId: string` and use `pickLabRow`)
- Modify: `src/app/api/clients/route.ts` (GET :97 maps with the user's settings lab; POST :265 upsert `onConflict: 'company_id,laboratory_id'` with `laboratory_id`; :308 insert with `laboratory_id`; the "already a QC client → 409" check at :226 becomes "already has a settings row **for this lab**")
- Modify: `src/app/api/clients/[id]/route.ts` (:47, :185 upsert, :200, :283 delete — own lab only)
- Modify: `src/app/api/clients/export/route.ts:20`, `src/app/api/clients/import/route.ts:272`, `src/app/api/clients/[id]/origin-pricing/route.ts:26,144`, `src/app/api/clients/[id]/origin-pricing/[origin]/route.ts:47`
- Test: `src/app/api/clients/route.test.ts` (create if absent, mocking the Supabase client like neighbouring route tests)

**Interfaces — consumes:** `pickLabRow`, `settingsLabFor`, `loadHqLabId` (Task 2); `loadLabScope` (`src/lib/auth/lab-scope.ts`).

- [ ] **Step 1: Failing tests** in `route.test.ts`: POST for an existing company that has an HQ settings row, by a Colombia user → 200/201, upsert called with `{ company_id, laboratory_id: 'co', … }` and `onConflict: 'company_id,laboratory_id'` (Review Focus 3); POST by an HQ user for a company that already has an HQ row → 409. GET list by an HQ user with a company carrying `[hqRow, coRow]` → one client whose settings come from `hqRow` (Review Focus 5).
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** across the files listed.
- [ ] **Step 4: Run** `npx vitest run src/app/api/clients` → PASS; `npx tsc --noEmit` → no new errors.
- [ ] **Step 5: Commit** `feat(clients): QC settings read and written for the user's laboratory`

### Task 4: Intake, tracking numbers, specs by client

**Files:**
- Modify: `src/app/api/samples/tracking-numbers/route.ts:48` (embed → `pickLabRow(…, body.laboratory_id)`)
- Modify: `src/app/api/samples/route.ts:516` (spec auto-detect adds `.eq('laboratory_id', body.laboratory_id)`)
- Modify: `src/app/api/clients/[id]/quality-specifications/route.ts` (GET :31 takes `?laboratory_id=`, defaulting to `settingsLabFor`; POST :144 writes `laboratory_id` = user's settings lab) and `[specId]/route.ts` (own-lab check on update/delete)
- Modify: `src/components/samples/intake/basic-info-step.tsx:212,232`, `src/components/samples/intake/link-quality-template-dialog.tsx:116,159` (pass the form's laboratory id)
- Modify: `src/app/api/contracts/[id]/route.ts:189` (accept `?laboratory_id=`; the intake caller passes it)
- Test: `src/app/api/clients/[id]/quality-specifications/route.test.ts`

- [ ] **Step 1: Failing test**: GET with `?laboratory_id=co` queries `.eq('laboratory_id','co')`; GET without it by an HQ user queries the HQ lab; a Colombia lab with no specs gets `[]` (Review Focus 2).
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** the test and `npx vitest run src/components/samples/intake` → PASS
- [ ] **Step 5: Commit** `feat(intake): specs and tracking format from the sample's laboratory`

### Task 5: Grading, certificates, sends, seller requests

**Files:**
- Modify: `src/lib/cupping/certificate-mint.ts:90` — `resolveValidityWindow(db, clientId: string, labId: string)`; callers `src/lib/cupping/finalize-pipeline.ts:194`, `src/lib/sample-group.ts:366` pass the sample's `laboratory_id`
- Modify: `src/lib/certificate-data.ts:372` (embed → `pickLabRow(…, sample.laboratory_id)`)
- Modify: `src/lib/tolerance/auto-approve.ts:153,176` (select `laboratory_id`; settings `.eq('laboratory_id', …)`)
- Modify: `src/lib/approval-notification/send-queue.ts:133,170` (`fetchShareWithAllClients` keyed by `(company_id, laboratory_id)`; sample select adds `laboratory_id`)
- Modify: `src/lib/seller-requests/store.ts:62,78`
- Test: extend `certificate-mint` / `send-queue.test.ts` / `seller-requests` tests where they exist; else `src/lib/cupping/certificate-mint.test.ts`

- [ ] **Step 1: Failing tests**: `resolveValidityWindow(db,'ahold','co')` queries `.eq('laboratory_id','co')` and returns the default when no row; `fetchShareWithAllClients` returns Ahold for an HQ sample when only HQ's row has `certificates_to_all_parties`, and not for a Colombia sample.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run src/lib/cupping src/lib/approval-notification src/lib/seller-requests src/lib/tolerance` → PASS
- [ ] **Step 5: Commit** `feat(certificates): settings of the sample's laboratory in grading, certificates and sends`

### Task 6: Client-qualities API, spec manager, portal

**Files:**
- Modify: `src/app/api/client-qualities/route.ts` (GET :33 `?laboratory_id=` default `settingsLabFor`; duplicate check :93 within the lab; insert :156 with lab), `[id]/route.ts` and `[id]/duplicate/route.ts` (own-lab check on write; duplicate keeps the source lab)
- Modify: `src/components/clients/client-quality-manager.tsx:341`, `src/app/clients/page.tsx:161`, `src/components/quality-assignments/quality-assignment-dialog.tsx:153`, `src/components/certificates/cert-editor/use-cert-editor.ts:483` (pass the sample's lab)
- Modify: `src/lib/portal/portal-qualities-fetch.ts:23` (select `laboratory_id, laboratories(name)`; group or label by lab)
- Modify: portal qualities UI that renders the list (find from `src/app/api/portal/qualities/route.ts` consumers) to show the lab name per spec
- Test: `src/lib/portal/portal-qualities-fetch.test.ts` (or the existing portal qualities test)

- [ ] **Step 1: Failing tests**: client-qualities GET by a Colombia user returns only `laboratory_id='co'` rows; portal fetch returns HQ and Colombia specs each with `labName`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run src/lib/portal src/app/api/client-qualities` → PASS; `npx tsc --noEmit` clean; `npm run build` passes.
- [ ] **Step 5: Commit** `feat(specs): quality specs per laboratory; the portal labels each with its lab`
