# One company register for QC and sys, scoped by laboratory

**Date:** 2026-11-24 · **Status:** design, awaiting Daniel's approval
**Repos:** WAQC (qc.wolthers.com) and Wolthers-system/wolthers-app (sys.wolthers.com). Same Supabase project `ojyonxplpmhvcgaycznc`.
**Builds on:** sys spec `2026-10-09-internal-market-titulares-accounts-design.md` (migration 0853), WAQC `20261119000002_lab_scope.sql`, WAQC client page rebuild a5eb1904.

## Why

A company's record is half in QC and half in sys. QC can add a client and tick QC certs, but CNPJ, IE, CPF, holders, bank accounts, staff and the trading/logistics ticks live only in sys. People switch apps to finish one record. Daniel wants either app to be enough: register a company once, with its Brazilian documents and bank accounts, from whichever app you are in.

The laboratories outside Brazil (Buenaventura now, Guatemala and Peru later) use the same QC app. What they register must reach sys, but they must not see sys's or Santos's register.

## What already exists (no sync needed)

- Both apps read and write the same tables: `companies`, `contacts`, `company_titulares`, `company_bank_accounts`. A write in one app is already a write in the other.
- `companies` has `person_type` (F/J), `document_cnpj`, `document_ie`, `vat_number`, `country`.
- `company_titulares`: the legal holders a company trades under (a family producer's CPFs, a co-op's CNPJ), with RG, IE/IPR, farm line, own address. Several per company.
- `company_bank_accounts`: several per company, each the company's own (`titular_id` null) or one holder's; bank, agência, account, type, PIX key. This is what the sys Confirmação de Negócio picks from.
- sys company modal: General (with CNPJ), "Titulares & contas" tab (`titulares-tab.tsx`, `titular-form.tsx`, `bank-account-form.tsx`), contacts tab with List | Matrix.
- QC client page: "Contacts and portal" tab and the Contacts dialog (List | Matrix + Add) show the sys matrix (`contacts.routing_purposes`), but QC may tick only QC certs (`QC_EDITABLE_PURPOSES`).
- QC lab rule: `qc_read_scope_lab()` / `qc_write_scope_lab()` and RESTRICTIVE policies on samples and friends. HQ (Santos, `laboratories.type = 'hq'`) and global admins read everything; other labs read their own; users with no laboratory (all sys users) and portal users are not confined.
- Production on 2026-11-24: 20 QC clients, none with a CNPJ; 2 holders; 4 bank accounts; Buenaventura has no staff and no samples.

## Decisions (Daniel, 2026-11-24)

1. **Anyone with a QC login can do everything**: tick every matrix column (trading, logistics, quality), add contacts, fill documents, add holders and bank accounts, and see bank details. This replaces the 2026-11-09 rule "QC ticks only QC certs" and, for QC users, the sys rule that bank accounts need the `internal_market` or `finance_commissions` module. (sys's own module rule for sys users stays.)
2. **Laboratories see what they add.**
   - Santos (HQ), global admins and sys see every company and everything on it.
   - Any other lab sees only the companies it added. A company it adds appears in sys immediately (same table). A company added in sys or by Santos is invisible to it.
3. **Matching an existing company (option A).** When a lab adds a company that already exists (say Ahold), it is linked to the existing record, not duplicated. The lab then sees the shared record (name, country, documents) but only the contacts, holders and bank accounts **that lab** added. Santos's and sys's Ahold contacts and accounts stay hidden from it.
4. **Enforced in the database (option 1)**, not only in QC's server code: a lab user cannot read another lab's companies, contacts, holders or accounts through any screen, route or browser query.
5. **Bank accounts per person and per company, several of each.** "Per person" means per holder (`company_titulares`), as ruled on 2026-10-09; mail contacts never carry CPF or bank details.
6. **Brazilian fields when the company is in Brazil**, in both apps, at registration time: person type (company / individual), CNPJ or CPF, IE. Any other country: a tax ID (`vat_number`, e.g. a Colombian NIT).
7. **Certificate recipients follow the lab.** Each lab's emails (certificates, approvals, reports) go only to the `qc_certificates`-tagged contacts that lab can own: a confined lab's to the contacts it added; Santos's to contacts added in sys or by Santos, never to another lab's. Applies to service-role send routes too (batch send), which must filter by the sending lab, not rely on RLS.
8. **QC settings are per lab, never shared.** Each origin has its own quality settings. When Buenaventura links to Ahold it starts with no QC settings, quality specs, certificate layout or logo for Ahold and builds its own; it never sees or edits Santos's.
9. **Clicking the company opens its detail view**, in both apps: the company name on sys `/contacts` (List and Matrix) opens the sys company modal; the company name in QC's Contacts dialog / matrix opens the QC company panel. The detail view includes the bank accounts.

## Approaches

**The QC screens.**
- **Chosen: a company panel built inside QC**, writing to the same tables sys uses, porting the behaviour of sys's Titulares & contas tab and matrix.
- Rejected: link out to sys. QC users have no sys login, and avoiding the app switch is the point.
- Rejected: one shared component for both repos. Separate repos, no shared package; too much setup for one panel.

**Enforcing "a lab sees what it adds".**
- **Chosen: in the database.** Rows record which lab added them; RESTRICTIVE policies hide the rest from confined lab users, on top of the existing permissive and sys deny policies. Every existing QC screen that lists companies (intake pickers, reports, send) narrows for a non-HQ lab with no code change.
- Rejected: QC server code only. Faster, but any browser read of `companies` would still show a Colombian user all 900+ Brazilian companies, and bank details would hang on every route remembering the check.

**Lab-added contacts, holders and accounts on a matched company.** Option A (decision 3). Rejected: B (a lab that types a company's name sees all of its bank details) and C (never match, duplicates to merge in sys).

## Design

### Piece 1: data and lab rules (one migration per repo convention; SQL pasted to Daniel, who applies it)

- **`company_labs (company_id, laboratory_id, created_at, created_by)`**, unique on the pair. A lab "has" a company when this row exists. Written when a lab user adds or matches a company in QC. Merge-safe: `merge_companies`' catch-all FK step drops a loser row that would collide with the survivor's, which is the right outcome (the lab is already linked).
- **`created_lab_id uuid REFERENCES laboratories`** on `contacts`, `company_titulares`, `company_bank_accounts`. Null = added in sys. Stamped by a BEFORE INSERT trigger from `qc_write_scope_lab()` when not given, so Santos's QC additions carry Santos's lab and sys's stay null.
- **RESTRICTIVE SELECT/INSERT/UPDATE policies** on `companies`, `contacts`, `company_titulares`, `company_bank_accounts`:
  - not confined (`qc_read_scope_lab()` is null: HQ, global admin, sys user, service role) → no narrowing;
  - confined lab user → `companies` row visible only with a `company_labs` row for their lab; child rows only with `created_lab_id` = their lab.
- **Permissive policies for QC staff** on `company_titulares` and `company_bank_accounts` (today internal sys staff only, and bank accounts also need a sys module): any active QC staff profile (`profiles` with a laboratory or global admin, not a portal role) may select, insert, update. Never delete (same as sys: deactivate).
- **Samples keep their companies visible**: when a confined lab saves a sample whose client / seller / exporter / importer / roaster is a company, that company gets a `company_labs` row for the lab (trigger, SECURITY DEFINER). Otherwise a sample filled from a sys contract would show blank party names to that lab.
- Check before writing: sys `merge_companies` handles the new table and columns; the existing sys RESTRICTIVE deny policies (external / co-broker / freight party) stay; `profiles` lock rules from [[fk-change-on-profiles-deadlocks]] if any DDL touches it.

### Piece 1b: QC settings per lab (decision 8)

- Today `qc_client_settings` (33 rows) and `client_qualities` (58 rows) are keyed by company only; `quality_templates` already carries `laboratory_id`; `client_laboratory_config` (1 row) is keyed by (client, lab).
- Add `laboratory_id` to `qc_client_settings` and `client_qualities`, backfilled with Santos's lab (all existing rows are Santos's). `qc_client_settings` unique on (company_id, laboratory_id) instead of company_id.
- RESTRICTIVE lab policies on both, same shape as the sample policies (confined lab reads and writes its own rows only).
- Every reader resolves settings and specs by the **sample's** lab: intake spec auto-assignment, grading, cupping, certificate render (layout, logo, numbering pattern), portal qualities, reports. The builder inventories these readers first; the `qc_client_settings` embed needs its FK name ([[certificate-client-logo-pgrst201]]).
- `companies.is_qc_client` stays the company-wide flag that it is a QC client somewhere; whether a lab serves it is "that lab has a `qc_client_settings` row".
- sys merge: a unique key on (company_id, laboratory_id) means a loser's settings row colliding with the survivor's for the same lab is dropped by the catch-all step. Check that is acceptable or handled in `merge_companies` before applying.

### Piece 2: QC

- **Company panel** (opened from the company name in the Contacts dialog, the client page and the matrix): General with documents; Holders & bank accounts; Contacts with the full matrix. Every column editable; `QC_EDITABLE_PURPOSES` becomes all purposes; `PURPOSE_GROUPS` stays in step with sys.
- **Add staff**: the existing contact dialog, plus portal mail.
- **Add-company form** (`add-client-modal.tsx` / `POST /api/clients`):
  - Brazil: person type, CNPJ or CPF, IE. Elsewhere: tax ID.
  - Optional holders and bank accounts in the same form, saved right after the company.
  - Server-side match on save (normalized name or same CNPJ / tax ID) → link via `company_labs` instead of inserting. The typeahead suggests only companies the user can already see, so a lab does not browse sys's register by typing.
  - Retire the leftover writes to `/api/exporters`, `/api/importers`, `/api/roasters` (tables dropped 2026-05-28) if they are still live.
- Routes run as the signed-in user wherever possible so the database rule applies. A route that must use the service role checks the same scope (`qc_read_scope_lab`) and stays staff-gated (`isStaffSampleManager`; portal users never reach them).

### Piece 3: sys

- **`/contacts`**: the company name in the List and Matrix headers opens the company modal (already used from inquiries, contracts, fixations).
- **New-company form**: the Brazilian block gains person type and IE next to CNPJ (CPF when individual); other countries keep VAT. Holders and bank accounts can be entered while creating, saved right after the company insert, instead of only after reopening the modal.

## Order

Piece 1 (data and lab rules), then 1b (QC settings per lab), then 2 (QC screens), then 3 (sys). 1 and 1b are SQL Daniel applies before any code that depends on them is pushed. 3 is independent of 1b and can go in parallel with 2.

## Goals / non-goals / anti-goals

- Goal: either app is enough to register a company completely.
- Goal: a non-HQ lab never sees what it did not add.
- Non-goal: changing who in sys may see bank accounts (module rule stays for sys users).
- Non-goal: a QC-wide company directory page; the panel opens from the places named above.
- Anti-goal: a duplicate company per lab; a lab browsing sys's register through a typeahead; bank details reachable through a service-role route without the scope check.

## Calls made in writing this up (Claude, for Daniel to check)

- **Shared company fields.** A confined lab edits the company's own fields (name, country, documents, QC flags) only on companies it created. On a company it only linked to, those fields are read-only; its contacts, holders and accounts stay fully editable. This needs `company_labs.created_company boolean` (true for the lab that inserted the row). Reason: otherwise Buenaventura could rename sys's and Santos's Ahold.
- **Matching on save.** Link silently when the CNPJ / CPF / tax ID matches. With no tax ID, link when exactly one company has the same normalized name and neither side has a different tax ID. Several matches, or a conflicting tax ID → create a new company; it shows in sys for a merge. The user is never shown the matched record's details before saving.
- **sys contracts at intake.** Out of scope here: a confined lab does not get the sys contract lookup in this project; the sample trigger still links any company a sample names. Restricting `contracts` / `shipment_samples` by lab is a follow-up.
- **QC staff without a laboratory.** Every QC staff profile has a laboratory or is a global admin. A global admin's additions stamp `created_lab_id` null, which is visible to HQ and sys only, the same as a sys addition.

## Left to the builder

- Panel layout and component split inside QC's design system (green primary, 10/6/4/0 corners, Inter; no emojis).
- CPF/CNPJ formatting and validation (reuse sys's `formatDoc` / `digitsOf` logic, copied).
- Foreign bank accounts: reuse `bank_name`, `branch`, `account_number`, `routing_code` (SWIFT / ABA); PIX only for Brazil.
- Tests: the RLS rule with a confined, an HQ and a sys user; the match-or-link on add; QC's full-matrix ticks.
- Files stay under ~2,000 lines; sys `company-modal.tsx` is at 1,825, so new sys UI goes in its own files.
