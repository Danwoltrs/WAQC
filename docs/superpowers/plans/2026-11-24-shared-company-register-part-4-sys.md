# Shared company register — Part 4: sys.wolthers.com — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In sys, the company name on `/contacts` opens the company modal; a new company is registered with person type, CNPJ/CPF and IE and lands straight on its holders and bank accounts; rows a non-HQ lab added are labelled with that lab.

**Architecture:** UI-only changes in the sys repo, reusing `CompanyModal`, `TitularesTab` and the validators in `src/lib/internal-market/new-company.ts`. No schema change here (Part 1 Task 3 carries sys's SQL).

**Tech Stack:** Next.js, Tailwind, Supabase; vitest (`npm test`; new test files must be added to the `include` allow-list in `vitest.config.ts` if no glob covers them).

**Repo:** `/Users/danielwolthers/Documents/GitHub/Wolthers-system/wolthers-app`.
**Spec:** WAQC `docs/superpowers/specs/2026-11-24-shared-company-register-lab-scope-design.md` — decisions 6, 9 and Piece 3. Independent of Part 2; Task 3 needs Part 1 applied.

## Global Constraints

- `company-modal.tsx` is 1,825 lines: new UI goes in new files; net growth of the modal ≤ ~60 lines.
- sys keeps its own access rules: bank accounts still need `internal_market` or `finance_commissions` for sys users (non-goal to change).
- Brazilian layout is chosen by `getAddressMode(country)` (`src/lib/constants/countries.ts:163`).
- Same validators as the internal-market new-company flow: `isValidCnpj`, `isValidCpf`, `newCompanySchema` (`src/lib/internal-market/new-company.ts:82-119`).

## Review Focus

1. **Opening "New company" right after viewing another company** carries the old company's fields into the form (`editFields` never reset, `company-modal.tsx:751`). Test in Task 2.
2. **A failed insert closes the modal silently** (`companies/page.tsx:290`). Must show the error and keep the form. Test in Task 2.
3. **Person type F with a CNPJ typed** (or J with a CPF) → validation message, no save. Test in Task 2.
4. **Company name click on `/contacts` for a company whose full row fails to load** → toast, no blank modal. Test in Task 1.
5. **A contact owned by Colombia shows in sys's matrix** with a lab chip so staff know Santos's emails won't reach it. Test in Task 3.

---

### Task 1: Company name on /contacts opens the company modal

**Files:**
- Create: `src/app/(dashboard)/contacts/company-modal-host.tsx` — `CompanyModalHost({ companyId, onClose, onSaved })`: loads `companies.select('*').eq('id', companyId).single()`, renders `CompanyModal` with the update pattern of `contracts/page.tsx:1172-1185` (blank → null, update by id, refetch); load error → toast + `onClose()`.
- Modify: `src/app/(dashboard)/contacts/directory-matrix.tsx:502` and `directory-list.tsx:46` — company name becomes a button calling new prop `onOpenCompany(companyId: string)`
- Modify: `src/app/(dashboard)/contacts/page.tsx` — `const [companyModalId, setCompanyModalId] = useState<string | null>(null)`; pass `onOpenCompany`; render the host; `onSaved` reloads the directory
- Test: `src/app/(dashboard)/contacts/company-modal-host.test.tsx` (add to vitest include)

- [ ] **Step 1: Failing tests**: clicking the company name in the matrix calls `onOpenCompany('c1')`; host with a load error calls `onClose` and toasts.
- [ ] **Step 2: Run** `npm test -- src/app/(dashboard)/contacts` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(contacts): company name opens the company`

### Task 2: New company — person type, CNPJ/CPF, IE; then holders and accounts

**Files:**
- Create: `src/app/(dashboard)/companies/br-documents-fields.tsx` — `BrDocumentsFields({ personType, doc, ie, onChange, errors })`: PJ/PF switch; "CNPJ" or "CPF" label by type; "IE" (PJ) / "IE / IPR" (PF)
- Modify: `src/app/(dashboard)/companies/company-modal.tsx` — Brazil layout renders `BrDocumentsFields` in place of the bare CNPJ input (:510-514); `person_type` added to the edit fields; `editFields` reset to blanks when `isNew` (Review Focus 1); after a create, open the `titulares` tab (`setSubModal('titulares')`) with a one-line hint "Add holders and bank accounts"
- Modify: `src/app/(dashboard)/companies/page.tsx:285-290` — validate with `newCompanySchema` (Brazil only) before insert; on insert error keep the modal open and toast the message (Review Focus 2)
- Test: `src/app/(dashboard)/companies/br-documents-fields.test.tsx`, `src/lib/internal-market/new-company.test.ts` (extend if needed)

- [ ] **Step 1: Failing tests**: PF + `'11.222.333/0001-81'` → "CPF inválido"; PJ + valid CNPJ → no error; switching PJ→PF relabels; modal opened as new after an existing company shows empty name (Review Focus 1).
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test -- src/app/(dashboard)/companies src/lib/internal-market` → PASS; `npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(companies): Brazilian documents on a new company; it opens on holders and bank accounts`

### Task 3: Lab chip on rows a non-HQ lab added

**Files:**
- Create: `src/lib/companies/owner-lab.ts` — `ownerLabLabel(ownerLabId: string | null, labs: Map<string, string>): string | null` (lab name, or null for sys/HQ rows) + `useLabNames()` (one `laboratories` select, cached)
- Modify: `src/app/(dashboard)/companies/contacts/contact-list-table.tsx`, `contact-matrix-view.tsx`, `src/app/(dashboard)/contacts/directory-matrix.tsx`, `titulares-tab.tsx` — select `owner_lab_id`; show a small neutral chip with the lab name next to the name
- Modify: `src/app/(dashboard)/companies/contacts-tab.tsx:420-426` and `src/lib/contacts/quick-add.ts` — every "same address already exists at this company" lookup adds `.is('owner_lab_id', null)`, so sys never offers to revive or merge a lab's own copy of an email (Part 1 Task 3 review)
- Test: `src/lib/companies/owner-lab.test.ts` (add to include); extend the quick-add test so a lab-owned duplicate is ignored

- [ ] **Step 1: Failing test**: `ownerLabLabel(null, m)` → null; `ownerLabLabel('co', new Map([['co','Wolthers Colombia']]))` → 'Wolthers Colombia'.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat(contacts): label contacts, holders and accounts a lab added`
