# Shared company register — Part 3: QC screens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From qc.wolthers.com a user can register a company completely — documents, holders, bank accounts, staff, every matrix tick — and each lab's emails go only to the contacts it owns.

**Architecture:** Owner-aware contact reads and writes behind one helper; the QC-only tick limit lifted; new WAQC routes for holders and bank accounts running on the user's session (database rules apply); a company panel reused by the client page and a new QC Contacts directory; the add-company form gains documents, holders and accounts and a match-or-link step.

**Tech Stack:** Next.js App Router, shadcn/ui (Dialog, Tabs), Tailwind, Supabase; vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-24-shared-company-register-lab-scope-design.md` — decisions 1, 3, 5, 6, 7, 9 and Piece 2. Depends on Part 1 applied (owner_lab_id, policies) and Part 2 Task 3 (POST /api/clients settings by lab).

## Global Constraints

- Staff-only routes gate with `isStaffSampleManager(supabase, user.id)` → 403; portal users never reach them.
- Routes use the **user's session client** (`@/lib/supabase-server`) wherever the database rules suffice. A route that must use the service role filters with `ownsRow` / `ownerLabFor` (Part 1 Task 4) and sets `owner_lab_id` on every insert.
- Company labels via `companyDisplayName()` (fantasy name first).
- Design: green primary buttons, corners 10/6/4/0 ([[ui-radius-soft-containers-crisp-data]]), Inter, 14/12 px type, no emojis, light + dark.
- Files under ~2,000 lines; new components in their own files.
- Free-typed one-off recipients in the send composers stay allowed (by design); only contact **lookups** are owner-filtered.
- Portuguese labels only where sys uses them for Brazilian documents (CNPJ, CPF, IE, Agência, PIX); the rest English like the QC app.

## Review Focus

1. **Santos sends a certificate to a client Colombia also serves**: Colombia's tagged contacts are not in Santos's panels or queue. Test in Task 1.
2. **A Colombia user adds `qc@ahold.com` which Santos already has**: a new Colombia-owned row is created, Santos's row untouched; the response never reveals Santos's row. Test in Task 1.
3. **PATCH/DELETE on `/api/companies/[id]/qc-contacts/[contactId]` with a contact of another company or another lab** → 404. Test in Task 1.
4. **Add-company with a CNPJ typed with or without punctuation, matching a company Colombia cannot see** → linked, not duplicated, and the response shows only what Colombia now may see. Test in Task 5.
5. **Linked-only company opened by Colombia**: documents read-only, holders/accounts editable; Santos's holders/accounts not listed. Test in Task 4.

---

### Task 1: Owner-aware contacts and recipients

**Files:**
- Create: `src/lib/qc-contacts/owned-rows.ts`, `src/lib/qc-contacts/owned-rows.test.ts`
- Modify: `src/lib/approval-notification/resolve-panels.ts` (`ContactRow` gains `owner_lab_id: string | null`)
- Modify: `src/app/api/samples/[id]/approval-recipients/route.ts:35-39,76-81` (select sample `laboratory_id`; fetch through the helper)
- Modify: `src/lib/approval-notification/send-queue.ts:166-171,262-292` (select sample `laboratory_id`; filter contact rows per unit by the unit's sample lab before `resolvePanel` and `savedContacts`)
- Modify: `src/app/api/companies/[id]/qc-contacts/route.ts` (GET filtered by the caller's owner; POST passes `ownerLabFor(scope)`), `qc-contacts/[contactId]/route.ts` (404 unless `company_id = id` and `ownsRow`), `src/app/api/companies/[id]/contacts/route.ts`, `src/app/api/companies/[id]/people/route.ts` (GET filtered)
- Modify: `src/lib/qc-contacts/upsert.ts` (`findContactByEmail` matches `(company_id, lower(email), owner_lab_id IS NOT DISTINCT FROM owner)`; insert sets `owner_lab_id`)
- Delete: `src/lib/approval-notification/recipients.ts` (no callers)

**Interfaces — produces:**
- `fetchOwnedContacts(db: SupabaseClient, companyIds: string[], ownerLabId: string | null, opts?: { taggedOnly?: boolean; withEmailOnly?: boolean }): Promise<ContactRow[]>` — `.in('company_id', ids).eq('is_active', true)` plus `owner_lab_id IS NULL` when `ownerLabId` is null, else `.eq('owner_lab_id', ownerLabId)`.
- `ownerLabForSample(db: SupabaseClient, labId: string | null): Promise<string | null>` — null when the lab is the HQ lab (type 'hq') or null; else the lab id. Cached per request.

- [ ] **Step 1: Failing tests** in `owned-rows.test.ts` (mock client records the filter calls): HQ owner → `.is('owner_lab_id', null)`; Colombia → `.eq('owner_lab_id','co')`; `taggedOnly` adds `.contains('routing_purposes',['qc_certificates'])`. In `send-queue.test.ts`: a queue with one HQ sample for Ahold and contacts `[{hq, tagged}, {co, tagged}]` resolves only the HQ contact (Review Focus 1). In `upsert` tests: Colombia upsert of an email Santos owns inserts a new row with `owner_lab_id:'co'` (Review Focus 2). Route test for `[contactId]` PATCH with a foreign contact → 404 (Review Focus 3).
- [ ] **Step 2: Run** `npx vitest run src/lib/qc-contacts src/lib/approval-notification` → FAIL
- [ ] **Step 3: Implement** helper, then switch each caller.
- [ ] **Step 4: Run** the same + `npx vitest run src/app/api/companies src/app/api/samples` → PASS
- [ ] **Step 5: Commit** `feat(contacts): each laboratory's emails go to the contacts it owns`

### Task 2: Every matrix column editable from QC

**Files:**
- Modify: `src/lib/contacts/people.ts:53-55` (`QC_EDITABLE_PURPOSES` = every purpose in `PURPOSE_GROUPS`; keep the export name; doc comment cites decision 1 and drops "QC ticks only QC certs")
- Modify: `src/app/api/companies/[id]/people/[contactId]/purposes/route.ts` (accepts any purpose from `PURPOSE_GROUPS`; owner check via `ownsRow`)
- Modify: `src/components/clients/client-page/client-people-tab.tsx` (every column a live checkbox; remove the read-only styling and the "edited in sys" hint)
- Test: `src/components/clients/client-page/client-people-tab.test.tsx`, purposes route test

- [ ] **Step 1: Failing tests**: ticking an `SC` (trading) cell PATCHes `purposes` with `sc` added; the route accepts `sc` and rejects `not_a_purpose` with 400.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run src/components/clients src/app/api/companies` → PASS
- [ ] **Step 5: Commit** `feat(contacts): QC edits the whole contact matrix`

### Task 3: Holders and bank accounts API (WAQC)

**Files:**
- Create: `src/lib/company-register/docs.ts` (+ test) — copied from sys `src/lib/internal-market/new-company.ts` / `register.ts`: `digitsOf(s)`, `isValidCpf(s)`, `isValidCnpj(s)`, `formatDoc(s)`, `docVariants(s)`; header comment "copy of sys …, keep in step".
- Create: `src/lib/company-register/schema.ts` (+ test) — zod `titularInput`, `bankAccountInput` matching sys `register-schema.ts:27,53` (CPF for F / CNPJ for J validated; account number or PIX key required; PIX key type enum; account type `corrente|poupanca` only for Brazil, else null; `routing_code` = bank code in Brazil, SWIFT/ABA elsewhere).
- Create: `src/app/api/companies/[id]/titulares/route.ts` (GET, POST), `[titularId]/route.ts` (PATCH); `src/app/api/companies/[id]/bank-accounts/route.ts` (GET, POST), `[accountId]/route.ts` (PATCH). Session client; staff gate; one primary per holder kept like sys (`clearPrimary`/`restorePrimary`); holder must belong to the company; no DELETE (deactivate via `is_active`).
- Types: `src/types/company-register.ts` (copy of sys types + `owner_lab_id`).

- [ ] **Step 1: Failing tests**: `isValidCnpj('11.222.333/0001-81')` true, `'11.222.333/0001-80'` false; `isValidCpf('529.982.247-25')` true; schema rejects an account with neither number nor PIX; POST bank account with `titular_id` of another company → 400.
- [ ] **Step 2: Run** `npx vitest run src/lib/company-register src/app/api/companies` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(companies): holders and bank accounts from QC`

### Task 4: Company panel

**Files:**
- Create: `src/components/companies/company-panel/company-panel.tsx` — `CompanyPanel({ companyId, open, onOpenChange, initialTab?: 'general' | 'register' | 'contacts' })`, a large Dialog with Tabs: General · Holders & bank accounts · Contacts
- Create: `general-section.tsx` (name, fantasy name, country, address; Brazil → person type PJ/PF, CNPJ or CPF, IE; elsewhere → Tax ID (`vat_number`); read-only with a one-line note when `canEditCompany` is false), `register-section.tsx` (the company's own accounts first, then each holder with its accounts; add/edit forms inline; "Show inactive"), `holder-form.tsx`, `bank-account-form.tsx`
- Contacts tab renders the existing `ClientPeopleTab` (`src/components/clients/client-page/client-people-tab.tsx`) with `companyId`, `companyName`
- Create: `src/app/api/companies/[id]/route.ts` — GET `{ company, canEditCompany }` (session client; `canEditCompany` = caller not confined, or `company_labs.created_company` for their lab); PATCH company fields (name, fantasy_name, country, address fields, `person_type`, `document_cnpj`, `document_ie`, `vat_number`) → 403 when `!canEditCompany`
- Modify: `src/components/clients/client-detail-view.tsx:31` (new tab `{ value: 'company', label: 'Company and bank' }` rendering the General + Holders sections inline, not the dialog)
- Test: `company-panel.test.tsx`, route test

- [ ] **Step 1: Failing tests**: GET for a company linked with `created_company=false` → `canEditCompany:false`; PATCH → 403; panel with `canEditCompany:false` renders CNPJ as text, not an input, and still shows "Add bank account" (Review Focus 5); country "Brazil" shows CNPJ/IE fields, "Colombia" shows Tax ID.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run src/components/companies src/app/api/companies` → PASS
- [ ] **Step 5: Commit** `feat(companies): company panel with documents, holders, bank accounts and contacts`

### Task 5: Add-company form with documents and match-or-link

**Files:**
- Create: `src/lib/company-register/match.ts` (+ test) — `decideCompanyMatch(input: { name: string; taxId: string | null }, candidates: Array<{ id: string; name: string; fantasy_name: string | null; document_cnpj: string | null; vat_number: string | null }>): { kind: 'link'; companyId: string } | { kind: 'create' }` — tax-id digits equal → link; else exactly one candidate with equal normalized name (`lower`, unaccent, collapse spaces, strip punctuation and legal suffixes `ltda|s/?a|sa|inc|llc|bv|gmbh|ltd`) and no conflicting tax id → link; else create.
- Modify: `src/app/api/clients/route.ts` POST — candidates fetched with the **service role** (the lab cannot see them) by tax-id variants and normalized name; `decideCompanyMatch`; on create insert with the given documents; when the caller is confined insert `company_labs(company_id, laboratory_id, created_company = (kind==='create'))` with the service role; then holders/accounts from the body through the Task 3 schema with `owner_lab_id = ownerLabFor(scope)`. Response: the company as read **with the user's session** afterwards (Review Focus 4). Remove the email-match branch (:203-210): an email is a contact, not a company identity.
- Modify: `src/components/clients/add-client-modal.tsx` — Brazil → person type, CNPJ/CPF, IE; elsewhere Tax ID; collapsible "Holders and bank accounts (optional)" with repeatable rows reusing Task 4's forms; drop the fire-and-forget posts to `/api/exporters`, `/api/importers`, `/api/roasters` (:245-280) after checking what they set — move any field they add (`company_types` / `trading_roles`) into the `/api/clients` payload.
- Check: `src/app/api/clients/search/route.ts` uses the session client (it does today) so the typeahead shows only what the lab can see. Keep.
- Test: `match.test.ts`, `src/app/api/clients/route.test.ts`

- [ ] **Step 1: Failing tests**: `decideCompanyMatch({name:'Ahold', taxId:'12.345.678/0001-90'}, [{…document_cnpj:'12345678000190'}])` → link; `{name:'AHOLD DELHAIZE COFFEE COMPANY B.V.'}` vs one candidate `Ahold Delhaize Coffee Company BV` → link; two name matches → create; same name but different CNPJ → create. Route: confined POST that links → inserts `company_labs` with `created_company:false`, no `companies` insert.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run src/lib/company-register src/app/api/clients src/components/clients` → PASS
- [ ] **Step 5: Commit** `feat(clients): register a company with documents and bank accounts; link instead of duplicating`

### Task 6: QC Contacts directory

**Files:**
- Create: `src/app/contacts/page.tsx` — a QC page like sys `/contacts`: all companies the user can see (session client, so a confined lab sees only its own), grouped rows of contacts, the matrix columns from `PURPOSE_GROUPS` plus portal mail, search by company / name / email, filter Buyers · Sellers · All. The company name opens `CompanyPanel`; a contact row opens the existing `contact-dialog.tsx`; "+ Add" per company.
- Create: `src/components/contacts-directory/directory-matrix.tsx` (port of sys `src/app/(dashboard)/contacts/directory-matrix.tsx`, QC styling) and `use-directory.ts` (load + optimistic tick through the purposes route, 409 → reload)
- Create: `src/app/api/contacts/directory/route.ts` — GET `?q=&role=&offset=&limit=` (session client; companies with their active contacts; page size 50 companies)
- Modify: the app sidebar config to add "Contacts" (find where "Clients" is declared)
- Test: `directory-matrix.test.tsx`

- [ ] **Step 1: Failing tests**: clicking a company name calls `onOpenCompany(id)`; ticking a cell calls the purposes PATCH; a company with no contacts shows "no contacts" and "+ Add".
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run src/components/contacts-directory` → PASS; `npx tsc --noEmit`; `npm run build`
- [ ] **Step 5: Commit** `feat(contacts): QC contacts directory with the full matrix; company name opens the company`

### Task 7: Template copies belong to their spec's laboratory

Added 2026-11-25 (Part 2 final review, finding I2). Independent of Tasks 1–6; it must land before any staff exist at a lab other than Santos.

**Live state (2026-11-25, after Daniel applied `20261111000000`):** 88 client specs, each on its own private template copy (`quality_templates.is_client_variant = true`, 88 distinct copies, 85 made that day). The copies' `laboratory_id`: 50 NULL, 38 Santos. All 88 specs are on Santos. 50 copies therefore disagree with their spec's lab. The copies also inherit the source template's `assigned_laboratories`. `quality_templates` RLS ignores the lab: PERMISSIVE "Quality managers can update templates" / "Users can update own templates or admins all" / "Lab-assigned templates visible to lab members" (by `assigned_laboratories`), the copy-read policy `quality_templates_client_copy_select` (staff + a client_qualities row uses it, so it follows client_qualities RLS), and RESTRICTIVE `quality_templates_waqc_staff_{insert,update,delete}` plus the sys deny policies.

**Gap:** a confined (non-HQ) user can edit or delete another lab's client copy (its spec's parameters), and may read one through the inherited `assigned_laboratories`.

**Files:**
- Create: `database/migrations/<date>000000_template_copies_lab.sql` and `database/checks/<date>_template_copies_lab_check.sql` (date = the day you write it; claim the number against disk)
- Modify: `src/lib/quality-spec/private-copy.ts` — `makePrivateCopy(db, sourceTemplateId, edits, laboratoryId)` sets `laboratory_id` on the copy; every caller passes the spec's lab: `src/app/api/clients/[id]/quality-specifications/route.ts`, `[specId]/route.ts`, `src/app/api/client-qualities/route.ts`, `[id]/route.ts`, `[id]/duplicate/route.ts` (a duplicate keeps the source spec's lab — Part 2 ruling)
- Test: `src/lib/quality-spec/private-copy.test.ts` + the callers' route tests

**SQL:**
- Backfill: `UPDATE quality_templates t SET laboratory_id = cq.laboratory_id FROM client_qualities cq WHERE cq.template_id = t.id AND t.is_client_variant AND t.laboratory_id IS DISTINCT FROM cq.laboratory_id` (pause the updated_at trigger like 20261124000001 did, if the table has one). Expect 50 rows.
- RESTRICTIVE policies on `quality_templates`, client copies only (base templates untouched):
  - SELECT: `NOT is_client_variant OR (SELECT qc_read_scope_lab()) IS NULL OR laboratory_id = (SELECT qc_read_scope_lab())`
  - INSERT / UPDATE (USING + WITH CHECK) / DELETE: `NOT is_client_variant OR (SELECT qc_write_scope_lab()) IS NULL OR laboratory_id = (SELECT qc_write_scope_lab())` — HQ's write scope is the HQ lab, so Santos cannot edit another lab's copy (same rule as settings/specs; global admins can)
- Before writing: dump live policy text (`pg_policies` for quality_templates), check `qc_write_scope_lab()` for a global admin is NULL, and check how the portal reads templates (the portal Qualities page) so a RESTRICTIVE SELECT does not blank it.
- Self-check DO block (`v := (SELECT …)`, never `SELECT … INTO`), commented post-apply SELECT: 0 copies whose lab differs from their spec's.

**Check cases** (model: `database/checks/20261124_qc_settings_per_lab_check.sql`): confined user updates/deletes another lab's copy → 0 rows; its own lab's copy → 1 row (twin); confined cannot read another lab's copy; confined insert of a copy on another lab → 42501; HQ updates an HQ copy → 1 row; HQ updates a non-HQ copy → 0 rows; base (non-variant) template edits unchanged for HQ.

- [ ] Step 1: live dumps (read-only MCP)
- [ ] Step 2: failing tests for `makePrivateCopy` lab + callers
- [ ] Step 3: migration + check; lint for `\binto\b`
- [ ] Step 4: `npx vitest run` (FULL suite), `npx tsc --noEmit`
- [ ] Step 5: commit `fix(quality): a client's template copy belongs to its spec's laboratory`
