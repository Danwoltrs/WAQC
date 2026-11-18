# Seller Result Email: Buyer Sample, Stuffing, Final Word — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an approved PSS's seller email goes out, it can ask the seller to send a sample to the buyer, which counts on sys as a sample request plus a QC pre-approval, and to report the stuffing date, time and place. The defaults come from per-buyer and per-quality "final word" settings. The email gets a full-sieve table and a rich-text cover in EN or BR.

**Architecture:**
- **WAQC** stores the ticks per contract sample (`samples.seller_requests`) and the rules on `qc_client_settings` / `client_qualities`.
- Pure modules under `src/lib/seller-requests/` resolve rules, render the lines and plan the sys writes. The send pipeline (`send-queue` → composer → `sendCertificateUnit`) carries them.
- **sys** gets two columns on `shipment_samples`, a mirror and placeholder exclusion, and a pre-approval label on the grid and the contract modal.
- The sys rich-text editor is ported verbatim into WAQC.

**Tech Stack:** Next.js 15.5 / React 19 / TypeScript, Supabase (one DB shared by WAQC and sys), vitest 2 + Testing Library (jsdom), TipTap 3.31.4, zod.

**Spec:** `docs/superpowers/specs/2026-11-18-seller-email-buyer-sample-stuffing-design.md` (read it first; this plan argues from it).

## Global Constraints

- **Never render `samples.tracking_number` (SAN-xxxxx/yy)** anywhere a person sees it: email, composer, settings, sys tag, logs meant for people. It is used only as a join or claim key.
- **Repos and branches:**
  - WAQC work happens in `/Users/danielwolthers/Documents/GitHub/WAQC-seller-email`, branch `feat/seller-email-requests`.
  - sys work happens in a new worktree `/Users/danielwolthers/Documents/GitHub/Wolthers-system/wolthers-app-qc-preapproval`, branch `feat/qc-pre-approval`, created from sys `origin/main`. The main sys checkout has other sessions' uncommitted work, so don't touch it.
- **Migrations:**
  - SQL is pasted to Daniel, and he applies it. Never run migrations.
  - WAQC migration: `database/migrations/20261118000001_seller_requests_final_word.sql`.
  - sys migration: `supabase/migrations/0960_qc_pre_approval.sql`.
- **Deploy order:** sys migration → sys deploy → WAQC migration → WAQC deploy. Every WAQC read or write of a new column is guarded (a missing column never breaks a send or a decision), the same pattern as `seller_comment` and `approved_by_initials`.
- **Head office CC** (`HOUSE_CC = 'wolthers@wolthers.com'`) on every send, and recipients only from `qc_certificates` contacts. Both are unchanged.
- **Seller-only content:** the request lines, the seller note and the tolerance block only render when `opts.sellerComment === true`.
- **Scope of the ticks:** they apply to PSS lots only (`sample_type = 'pss'`). They print only when the lot is `approved`. They are saved at finalize whatever the outcome.
- **Exact copy:**
  - PT buyer-sample line: `Pré-aprovado pela Wolthers – favor enviar 1 amostra para {Company}:`
  - EN buyer-sample line: `Pre-approved by Wolthers – please send 1 sample to {Company}:`
  - PT stuffing line: `Favor nos informar data, hora e local da estufagem para retirarmos a amostra de embarque (SS).`
  - EN stuffing line: `Please let us know the stuffing date, time and place so we can draw the shipment sample (SS).`
- **Colours:** courier instructions use red `#c0392b`. The draft-markup colours are red `#c0392b`, amber `#b7791f`, green `#2e7d32`, blue `#1a5fb4`, and highlight `#fff3a3`.
- **File size:** keep files under ~2,000 lines. `cupping-validation-modal.tsx` is 1,578 lines, `quality-summary.ts` is 983, and `qc-config-panel.tsx` is 840, so new UI goes in new components.
- **Tests and checks:**
  - WAQC tests: `npx vitest run <path>`; typecheck: `npx tsc --noEmit`.
  - sys tests: `npx vitest run <path>` in the sys worktree.
- **Commits:** frequent, with messages ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push; Daniel says when.

### Spec adjustments found while planning (apply as written here)

1. **sys never sets `company_addresses.is_default`**, and nothing enforces a single default. WAQC does **not** write `is_default` either. The setting's own address pick is the default; `is_default` is only read as one step in the fallback order.
2. **A single sample per contract carries no sys label.** `pssLabelled` requires more than one sample (sys R18), so the buyer request row gets no `exporter_label`, and the email prints none.
3. **`request_batches.origin` allows only `'portal' | 'staff'`.** Use `'staff'`; the request is made by lab staff.
4. **WAQC `sendMail` returns `void` today and uses `/sendMail`**, which yields no message ids. It gains `returnIds`, which forces the existing draft path and returns `{ graphMessageId, internetMessageId, conversationId }`. That lets `request_batches.internet_message_id` match the seller's reply-all through `In-Reply-To`, since the message id is global across mailboxes.
5. **The email table's sieve cells use one decimal**, the way the certificate prints them (`certificate-analysis.tsx:137`, `toFixed(1)`).
6. **`seller_requests` must not appear in any sibling-sync list** (`MOTHER_SHARED_FIELDS`, `SIBLING_COALESCE_FIELDS`, `SIBLING_OWN_FIELDS` in `src/lib/sample-group.ts`). A guard test pins this.

## Review Focus

The five failure modes most likely to bite, each pinned by a test in the owning task:

1. **A lot whose contracts belong to different buyers** (one Blaser Dulce, one Ahold): each contract resolves its own rules. Ahold's buyer-sample stays locked off while Blaser's is locked on. *Task 8 test "resolves each contract against its own client".*
2. **A stale browser posts a change to a fixed tick** (at finalize or at send): the server keeps the locked value, and the save never fails because of it. *Task 5 `enforceLocks` tests, Task 8 `saveSellerRequests` refusal test, Task 11 batch-send test.*
3. **A resend with "Include already sent"** updates the existing sys buyer request, never inserts a second one, and adds a `pss_requests` row. *Task 12 test "resend updates, never duplicates".*
4. **A contract-less lot, or a sandbox send (`MICROSOFT_GRAPH_TEST_RECIPIENT`)**, with buyer-sample ticked: the email lines still print, and nothing is written on sys. *Task 12 tests.*
5. **A group whose samples have different sieve sets, or legacy free-text keys**: the columns are the union; a missing value shows "—"; free-text keys sort after the numbered sieves and before the pan. *Task 9 test.*

---

## Part A — sys (`Wolthers-system/wolthers-app`, deploys first)

### Task 1: sys migration — pre-approval columns and mirror exclusion

**Files:**
- Create: `supabase/migrations/0960_qc_pre_approval.sql`

**Interfaces:**
- Produces:
  - `shipment_samples.qc_pre_approved_at timestamptz NULL`
  - `shipment_samples.pre_approval_of uuid NULL REFERENCES shipment_samples(id) ON DELETE SET NULL`
  - index `shipment_samples_pre_approval_of_idx (pre_approval_of) WHERE pre_approval_of IS NOT NULL`
  - `qc_mirror_sample()` redefined so it never claims a row with `pre_approval_of` set

- [ ] **Step 1: Create the worktree.** `git -C /Users/danielwolthers/Documents/GitHub/Wolthers-system/wolthers-app fetch origin && git -C … worktree add ../wolthers-app-qc-preapproval -b feat/qc-pre-approval origin/main`. Expected: the new worktree is at origin/main.
- [ ] **Step 2: Write the migration.**
  - Header: `-- 0960_qc_pre_approval.sql`, followed by a "why" paragraph (WAQC pre-approves a PSS and asks the seller to send a sample to the buyer; see the WAQC spec path above).
  - `SET lock_timeout = '5s';`
  - The two `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, the partial index, and `COMMENT ON COLUMN` for both.
  - Then `CREATE OR REPLACE FUNCTION public.qc_mirror_sample()`, copied **verbatim** from `0814_qc_mirror_rows_follow_sample.sql` lines 60-334, with `AND pre_approval_of IS NULL` added to exactly these five statements:
    - the `v_standalone` count (0814 L275-278)
    - the `v_groups` count (L279-282)
    - the standalone claim UPDATE (L285-291)
    - the `v_group_id` SELECT (L296-300)
    - the group claim UPDATE (L301-306)

  No other change. Statements keyed on `waqc_ref` are unaffected, because buyer requests carry `waqc_ref NULL` and `source 'sys'`.
- [ ] **Step 3: Verify statically.** `grep -c "pre_approval_of IS NULL" supabase/migrations/0960_qc_pre_approval.sql` → `5`. `diff <(sed -n 60,334p supabase/migrations/0814_qc_mirror_rows_follow_sample.sql) <(…function block of 0960…)` shows only those five added conditions.
- [ ] **Step 4: Add a read-only check block** at the foot of the file, commented out, for Daniel to run after applying:
  ```sql
  -- select column_name from information_schema.columns where table_name='shipment_samples' and column_name in ('qc_pre_approved_at','pre_approval_of');
  -- select count(*) from pg_proc where proname='qc_mirror_sample' and prosrc like '%pre_approval_of IS NULL%';
  ```
  Expected after applying: 2 rows, and a count of 1.
- [ ] **Step 5: Commit.** `feat(qc): shipment_samples pre-approval mark + buyer-request link; mirror never claims a buyer request`

### Task 2: sys Request sample never reuses a buyer request

**Files:**
- Modify: `src/lib/requests/placeholder.ts` (`PssRowLite` L22-31, `pickReusableSample` L33-45, `isOpenRequestedLeaf` L57-58, `planPlaceholder` adoptable filter L146)
- Modify: `src/lib/requests/placeholder-exec.ts` (`PSS_ROW_SELECT` L24-25: add `pre_approval_of`)
- Test: `src/lib/requests/placeholder.test.ts`

**Interfaces:**
- Produces: `PssRowLite.pre_approval_of?: string | null`. A row with a truthy `pre_approval_of` is invisible to `pickReusableSample`, `isOpenRequestedLeaf` and `planPlaceholder`.

- [ ] **Step 1: Write the failing tests.**
  - `it('never reuses a buyer pre-approval request')`: rows hold one open `requested` row on the split with `pre_approval_of: 'x'`. Expect `pickReusableSample(rows, split)` → `null`, and `planPlaceholder(rows, split, 1)` → kind `'single'` with `reuseId: null` (a fresh insert).
  - `it('still reuses an ordinary open request next to a buyer request')`: two rows, one with `pre_approval_of`. Expect the ordinary row's id.
- [ ] **Step 2:** `npx vitest run src/lib/requests/placeholder.test.ts`. Expected: the 2 new tests FAIL.
- [ ] **Step 3: Add `!r.pre_approval_of` to the three filters**, and add `pre_approval_of` to `PSS_ROW_SELECT`.
- [ ] **Step 4:** Run the same file. Expected: PASS. Also run `npx vitest run src/lib/requests/send-core.test.ts`. Expected: PASS, unchanged.
- [ ] **Step 5: Commit.** `fix(requests): a QC buyer-sample request is never reused as a lab placeholder`

### Task 3: sys grid — PRE-APP label

**Files:**
- Modify: `src/lib/shipments/leg-sample-summary.ts`
  - `SampleCellInput` (L39-61): add `qc_pre_approved_at?: string | null; pre_approved_to?: string | null`
  - `SampleCell` (L63-113): add `qcPreApprovedTo: string | null`
  - set it where `initials` / `qcApproved` are derived (L301-311), from the winning approved row
- Modify: `src/lib/shipments/sample-cell-content.ts` `sampleStatusLabel` (L38-64), approved branch
- Modify: `src/app/api/shipments/route.ts`
  - `SAMPLE_SELECT` (L525): add `qc_pre_approved_at, pre_approval_of, recipient_company_id, recipient_company_name`
  - build `preApprovedTo: Map<anchorId, name>` from the rows with `pre_approval_of`, using `recipient_company_name ??` the company display name of `recipient_company_id`, the same way that route already names destinations
  - set `pre_approved_to` on each pushed `SampleCellInput` (L689-695)
- Test: `src/lib/shipments/leg-sample-summary.test.ts`, `src/lib/shipments/sample-cell-content.test.ts`

**Interfaces:**
- Produces: `SampleCell.qcPreApprovedTo`. For a pre-approved cell, `sampleStatusLabel` returns `${count}PRE-APP - ${date}${ord} W&AQC → ${qcPreApprovedTo}`. The grid and both PDFs read this label.

- [ ] **Step 1: Write the failing tests.**
  - `deriveSampleCell`: an approved row with `qc_pre_approved_at: '2026-11-12'` and `pre_approved_to: 'Blaser'` gives `cell.qcPreApprovedTo === 'Blaser'`. The same row without the stamp gives `null`.
  - `deriveSampleCell` keeps the two-stage rule: add a second row with `sent_date: '2026-11-14'`, status `pending` and no `approved_date`. Expect `status === 'in_transit'` (unchanged behaviour, pinned).
  - `sampleStatusLabel({...approvedCell, qcPreApprovedTo: 'Blaser', qcApproved: true, date: '2026-11-12'})` gives `'PRE-APP - 12-Nov-26 W&AQC → Blaser'`. Match `formatDdMmmYy`'s real output in the existing tests.
- [ ] **Step 2:** `npx vitest run src/lib/shipments/`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the fields, the label branch, and the route select and map.
- [ ] **Step 4:** Run `npx vitest run src/lib/shipments/ src/app/api/shipments/`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(shipments): PRE-APP label when W&A QC pre-approved and asked a sample to the buyer`

### Task 4: sys contract modal — pre-approval tag

**Files:**
- Create: `src/lib/samples/pre-approval.ts`, exporting `preApprovalRecipients(rows: Array<{ id: string; pre_approval_of?: string | null; recipient_company_name?: string | null; recipient_company_label?: string | null }>): Map<string, string>`. It maps the anchor id to the recipient label; the first non-empty of `recipient_company_label` (resolved company name) or `recipient_company_name` wins.
- Test: `src/lib/samples/pre-approval.test.ts`
- Modify: `src/app/api/contracts/[id]/all-samples/route.ts`
  - select (L95-97): add `qc_pre_approved_at, pre_approval_of`
  - set `pre_approved_to` on each row from `preApprovalRecipients`, resolving `recipient_company_id` names the way the route already resolves names
- Modify: `src/components/samples/contract-modal-sample-group-row.tsx`
  - `GroupLeaf` (L30-53): add `qc_pre_approved_at?: string | null; pre_approved_to?: string | null`
  - new `PreApprovalTag({ to }: { to: string | null })`, rendering `Pre-approved (QC) · sample to {to}` (or `Pre-approved (QC)` when `to` is null). Its style matches `QcOriginTag`, but amber: `border-amber-500/30 text-amber-600`.
  - render it next to `DecidedByMark` (L772-774) and next to the master Status `QcOriginTag` (L674-681) when `qc_pre_approved_at` is set

- [ ] **Step 1: Write failing tests** for `preApprovalRecipients`:
  - an anchor with one request → its name
  - no request → no entry
  - a resolved label wins over the stored name
- [ ] **Step 2:** `npx vitest run src/lib/samples/pre-approval.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper, the route and the tag.
- [ ] **Step 4:** Run the test plus `npx tsc --noEmit`. Expected: PASS, with no new type errors.
- [ ] **Step 5: Commit.** `feat(samples): contract modal shows "Pre-approved (QC) · sample to <buyer>"`

---

## Part B — WAQC (`WAQC-seller-email`)

### Task 5: WAQC migration, types and the final-word rules

**Files:**
- Create: `database/migrations/20261118000001_seller_requests_final_word.sql`
- Create: `src/lib/seller-requests/types.ts`
- Create: `src/lib/seller-requests/rules.ts`
- Test: `src/lib/seller-requests/rules.test.ts`
- Modify: `src/lib/sample-group.test.ts`, adding the guard test from spec adjustment 6

**Migration** (no BEGIN; header comment in the house style, explaining the why):
```sql
alter table public.samples add column if not exists seller_requests jsonb;
alter table public.qc_client_settings
  add column if not exists final_word text not null default 'wolthers' check (final_word in ('wolthers','pre_approval')),
  add column if not exists final_word_fixed boolean not null default false,
  add column if not exists buyer_sample_address_id uuid references public.company_addresses(id) on delete set null,
  add column if not exists stuffing_request text not null default 'off' check (stuffing_request in ('off','prechecked','fixed_on'));
alter table public.client_qualities
  add column if not exists final_word text check (final_word in ('wolthers','pre_approval')),
  add column if not exists final_word_fixed boolean,
  add column if not exists buyer_sample_address_id uuid references public.company_addresses(id) on delete set null,
  add column if not exists stuffing_request text check (stuffing_request in ('off','prechecked','fixed_on'));
```

**Interfaces** (`types.ts`, produced for every later task):
```ts
export type Lang = 'en' | 'pt'
export type FinalWord = 'wolthers' | 'pre_approval'
export type StuffingRule = 'off' | 'prechecked' | 'fixed_on'
export interface FinalWordSettings { finalWord: FinalWord; fixed: boolean; addressId: string | null; stuffing: StuffingRule }
export interface FinalWordOverrides { finalWord: FinalWord | null; fixed: boolean | null; addressId: string | null; stuffing: StuffingRule | null }
export interface ResolvedRules extends FinalWordSettings { finalWordFrom: 'quality' | 'buyer' | 'default'; stuffingFrom: 'quality' | 'buyer' | 'default' }
export interface BuyerSampleDestination { companyId: string | null; companyName: string; savedAddressId: string | null; lines: string[]; country: string | null; recipientName: string | null; attention: string | null; phone: string | null; instructions: string | null }
export interface SellerRequests { buyerSample: BuyerSampleDestination | null; stuffing: boolean; setBy: string | null; setAt: string | null }
export interface TickLock { locked: boolean; reason: string | null }
export interface TickLocks { buyerSample: TickLock; stuffing: TickLock }
export function sellerRequestsFromDb(json: unknown): SellerRequests | null   // snake_case jsonb (spec §9) → camel; invalid → null
export function sellerRequestsToDb(r: SellerRequests): Record<string, unknown>
export const sellerRequestsInputSchema: z.ZodType<SellerRequests>          // validates composer/finalize payloads
```

`rules.ts`:
```ts
export function resolveRules(buyer: Partial<FinalWordSettings> | null, quality: FinalWordOverrides | null): ResolvedRules
export function tickLocks(rules: ResolvedRules, names: { clientName: string; qualityName: string | null }): TickLocks
export function startingRequests(rules: ResolvedRules, stored: SellerRequests | null, defaultDestination: BuyerSampleDestination | null): SellerRequests
export function enforceLocks(rules: ResolvedRules, incoming: SellerRequests, current: SellerRequests): { value: SellerRequests; refused: string[] }
```

- [ ] **Step 1: Write the failing tests** in `rules.test.ts`:
  - `resolveRules(null, null)` → `{ finalWord:'wolthers', fixed:false, addressId:null, stuffing:'off', finalWordFrom:'default', stuffingFrom:'default' }`.
  - The quality wins per field: a buyer `{finalWord:'wolthers', stuffing:'prechecked'}` with a quality `{finalWord:'pre_approval', fixed:true, addressId:null, stuffing:null}` gives `finalWord:'pre_approval'`, `fixed:true`, `stuffing:'prechecked'`, `finalWordFrom:'quality'` and `stuffingFrom:'buyer'`.
  - `tickLocks` for Ahold (`wolthers`, fixed, buyer source) gives `buyerSample: { locked:true, reason:'Ahold: Wolthers has the final word' }`.
  - `tickLocks` for Blaser Dulce (`pre_approval`, fixed, quality source) gives `reason:'Blaser · Dulce: pre-approval, sample to Blaser'`.
  - `tickLocks` with `stuffing 'fixed_on'` from the buyer gives `stuffing.reason === 'Blaser: stuffing request always on'`.
  - `startingRequests`:
    - `pre_approval` with no stored value → `buyerSample` = the default destination.
    - `wolthers` with no stored value → `buyerSample: null`.
    - A stored value wins when the rule is not fixed.
    - `wolthers`-fixed nulls a stored destination.
    - `pre_approval`-fixed keeps a stored, changed address.
    - Stuffing: `prechecked` with nothing stored → `true`; `fixed_on` → always `true`.
  - `enforceLocks`:
    - With `wolthers`-fixed, an incoming destination comes back as `null` with `refused: ['buyerSample']`.
    - With `pre_approval`-fixed, an incoming `null` comes back as the current destination, `refused: ['buyerSample']`.
    - With `pre_approval`-fixed, an incoming *changed* address is accepted, `refused: []`.
    - With `fixed_on`, incoming `stuffing:false` comes back `true`.
  - `sellerRequestsFromDb` round-trips `sellerRequestsToDb`, and returns `null` for `{foo:1}`.
  - `sample-group.test.ts`: `it('seller_requests is never synced between siblings')` asserts that none of the three field lists contains `'seller_requests'`.
- [ ] **Step 2:** `npx vitest run src/lib/seller-requests/ src/lib/sample-group.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `types.ts` and `rules.ts`, and write the migration file.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(seller-requests): final-word rules, tick locks, stored request shape + migration`

### Task 6: Language, copy and the request lines

**Files:**
- Create: `src/lib/seller-requests/language.ts`, exporting `sellerLanguage(co: { preferred_language?: string | null; country?: string | null; state?: string | null } | null): Lang`. This is a verbatim port of sys `src/lib/shipment-board/derive.ts:161-173`, including `BRAZIL_UF` (27 UFs including DF) and `norm`.
- Create: `src/lib/seller-requests/copy.ts`, exporting `COPY: Record<Lang, EmailCopy>`, where `EmailCopy` holds:
  - the table headings
  - the result words
  - the two request lines (Global Constraints)
  - the cover lead lines
  - the tolerance-block strings, PT exactly as today (`tolerance-comment-block.ts` :24, :25, :49, :75-78, :102-105, :144, :147, :152) and EN equivalents
  - `pan: 'Fundo' | 'Pan'`

  Values:
  - **Table headings, EN:** Sample, Contract, Buyer Ref, Quality, Def., Type, Cup, Result, APPROVED, REJECTED, Note
  - **Table headings, PT:** Amostra, Contrato, Ref. comprador, Qualidade, Def., Tipo, Bebida, Resultado, APROVADO, REPROVADO, Obs.
  - **Tolerance block, EN:** Approved with comments; Screen / Your sample / Required / Adjusted; Item / Result / Required / Difference; "Please adjust the screen classification to meet the required standard."; "Please send an additional sample."; `min.` / `max.`
  - **Cover note, PT:** greeting `Prezado(a) {greeting},`, or `Prezados,` when the greeting is `'all'`. Leads: `Segue abaixo o resultado de qualidade; os certificados estão anexados.` and `Segue abaixo o resultado de qualidade das amostras analisadas.`
  - **Cover note, EN:** unchanged from today's `buildQualityCoverNote`.
- Create: `src/lib/seller-requests/request-lines.ts`, exporting `buildRequestLines(req: SellerRequests, lang: Lang): { html: string; text: string } | null`. It returns null when there's neither a buyer sample nor a stuffing request.
- Modify: `src/lib/approval-notification/tolerance-comment-block.ts`: `buildToleranceBlock(..., screenRows = [], lang: Lang = 'pt')` and `buildScreenAdjustmentRows(..., lang: Lang = 'pt')` read `COPY[lang]`.
- Tests: `language.test.ts`, `request-lines.test.ts`, and extend `tolerance-comment-block.test.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `sellerLanguage`:
    - `{preferred_language:'pt-BR'}` → `'pt'`; `{country:'Brasil'}` → `'pt'`; `{state:'MG'}` → `'pt'`; `{country:'Switzerland'}` → `'en'`; `null` → `'en'`.
    - `{preferred_language:'en', country:'Brazil'}` → `'en'` (the preference wins).
  - `buildRequestLines`, with the Blaser destination `{companyName:'Blaser', lines:['Guterstrasse 4','CH-3001 Bern'], country:'Switzerland', attention:'QC desk', phone:'+41 31 000', instructions:'DHL only'}` and `stuffing:true`, in PT:
    - `text` contains `Pré-aprovado pela Wolthers – favor enviar 1 amostra para Blaser:\nGuterstrasse 4\nCH-3001 Bern\nSwitzerland\nATTN QC desk · Tel: +41 31 000\nDHL only` and the PT stuffing line.
    - `html` wraps the first line in `<strong>` and the instructions in `color:#c0392b`, and escapes `<` in company names.
  - EN equivalents for the same input.
  - Only `stuffing:false` and `buyerSample:null` → `null`.
  - `buildToleranceBlock(items, [], false, rows, 'en')` contains `Approved with comments` and `Your sample`, and no Portuguese heading. Called without `lang`, the output is byte-identical to the current PT snapshot.
- [ ] **Step 2:** `npx vitest run src/lib/seller-requests/ src/lib/approval-notification/tolerance-comment-block.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(seller-requests): EN/BR copy, seller language, request lines; tolerance block speaks English too`

### Task 7: Sample destinations — sys's own address rows

**Files:**
- Create: `src/lib/seller-requests/destinations.ts`
- Create: `src/app/api/companies/[id]/sample-destinations/route.ts` (GET, POST)
- Tests: `src/lib/seller-requests/destinations.test.ts`, `src/app/api/companies/[id]/sample-destinations/route.test.ts`

**Interfaces:**
```ts
// ported verbatim from sys src/lib/requests/saved-destinations.ts (L89-157, L202-248)
export const staffDestinationInputSchema   // label required (1..120), lines required (1..600), etc.
export const MAX_SAVED_SAMPLE_ADDRESSES = 50
export function sameAddressKey(lines: string): string
export function planSampleAddressSave(onFile: Array<{ lines: string; is_active?: boolean | null; kind?: string }>, lines: string): { action: 'insert' } | { action: 'repeat' } | { action: 'full'; error: string }
// new
export interface DestinationOption { key: string; section: 'saved' | 'company' | 'importer' | 'roaster'; sectionTitle: string; destination: BuyerSampleDestination }
export async function listDestinationOptions(admin: SupabaseClient<any>, args: { clientId: string; importerId?: string | null; roasterId?: string | null }): Promise<DestinationOption[]>
export async function defaultDestination(admin: SupabaseClient<any>, args: { clientId: string; addressId: string | null }): Promise<BuyerSampleDestination | null>
export function companyAddressDestination(co: { id: string; name: string; fantasy_name: string | null; street: string | null; street_number: string | null; neighbourhood: string | null; city: string | null; state: string | null; zip_code: string | null; country: string | null }): BuyerSampleDestination | null
```

Behaviour:
- Saved addresses are `company_addresses` with `kind='sample'` and `is_active`, for the client and its group sisters (same `companies.group_id`). They use sys's `SAVED_DESTINATION_COLUMNS`.
- Section titles: `Saved for {client}`, `{client} company address`, `Importer · {name}`, `Roaster · {name}`. Company names come from `companyDisplayName`.
- The default order is spec §4 steps 1-5. `addressId` (from the setting) is step 1/2; then `is_default`; then the newest `updated_at`; then the company address.
- `companyAddressDestination` returns null when street and city are both empty. Lines: `street street_number`, `neighbourhood`, `zip_code city state`, blanks dropped.
- **POST** is staff-only (`isStaffSampleManager`), uses the service role after the check, parses `staffDestinationInputSchema`, plans with `planSampleAddressSave` against the company's `kind='sample'` rows, and inserts `{...data, company_id, kind:'sample', created_by, updated_by}`.
  - Responses: `{destination, duplicate}`; 400 when full or invalid; 403 for non-staff.
  - `created_by` / `updated_by` reference sys `user_profiles(id)`, the same uuid as the auth user. If the insert fails with 23503 (no `user_profiles` row for a WAQC-only user), retry with both set to null.
- **GET** `?importerId=&roasterId=` returns `{ options: DestinationOption[] }`, staff-only.

- [ ] **Step 1: Write the failing tests.**
  - The ported `planSampleAddressSave` cases (repeat, full at 50 including retired rows, insert).
  - `companyAddressDestination` for Blaser `{street:'Guterstrasse 4', zip_code:'CH-3001', city:'Bern', country:'Switzerland'}` → `lines ['Guterstrasse 4','CH-3001 Bern']`, `country 'Switzerland'`, `companyName 'Blaser'`.
  - `defaultDestination` order: setting address > `is_default` > newest active > company address. Use the `fakeSupabase` fixture from `src/lib/storage/__fixtures__/fake-supabase.ts`.
  - Route: POST by non-staff → 403. A duplicate → `{duplicate:true}` with no insert. A 23503 on insert → retried with null `created_by`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(seller-requests): sample destinations read/written on sys's own company_addresses`

### Task 8: Seller-request state per contract (load and save)

**Files:**
- Create: `src/lib/seller-requests/store.ts`
- Create: `src/app/api/samples/[id]/seller-requests/route.ts` (GET)
- Tests: `src/lib/seller-requests/store.test.ts`, `src/app/api/samples/[id]/seller-requests/route.test.ts`

**Interfaces:**
```ts
export interface SellerRequestState {
  sampleId: string; contractNumber: string | null; sampleType: string | null; decision: string | null
  clientId: string | null; clientName: string | null; importerId: string | null; roasterId: string | null
  rules: ResolvedRules; locks: TickLocks; requests: SellerRequests
}
export async function loadSellerRequestStates(admin: SupabaseClient<any>, sampleIds: string[]): Promise<Map<string, SellerRequestState>>
export async function loadGroupSellerRequestStates(admin: SupabaseClient<any>, sampleId: string): Promise<SellerRequestState[]>   // fetchGroup order, PSS members only
export async function saveSellerRequests(admin: SupabaseClient<any>, userId: string, entries: Record<string, SellerRequests>, opts: { allowedIds: Set<string> }): Promise<{ saved: string[]; refused: Record<string, string[]> }>
```

Behaviour:
- Reads `samples` (`id, sample_type, status, client_id, quality_spec_id, importer_id, roaster_id, wolthers_contract_nr`). The `seller_requests` column is read by a separate guarded query.
- Reads `qc_client_settings` (the four new columns, guarded: when the columns are missing, use the defaults) by `company_id`, and `client_qualities` (the four columns, guarded) by `quality_spec_id`.
- Client and quality names come from `companyDisplayName` and `custom_name || template.name`.
- `requests = startingRequests(rules, stored, await defaultDestination(...))`, computed only when `rules.finalWord === 'pre_approval'` or stored has a buyer sample. Otherwise there's no address lookup.
- `saveSellerRequests` ignores ids not in `allowedIds`. For each entry it runs `enforceLocks` against the freshly loaded state, then writes `seller_requests = sellerRequestsToDb({...value, setBy:userId, setAt: now})` per sample. It never throws: a failed write is logged with `console.error` and that id is left out of `saved`.
- GET `/api/samples/[id]/seller-requests` (lab staff, via `isStaffSampleManager`) returns `{ members: SellerRequestState[] }` for the sample's group.

- [ ] **Step 1: Write the failing tests.**
  - `it('resolves each contract against its own client')` (Review Focus 1): a group with a lab unit for Blaser on Dulce (quality `pre_approval`, fixed) and a sibling for Ahold (buyer `wolthers`, fixed). Blaser's member has `requests.buyerSample` set and `locks.buyerSample.locked`; Ahold's has `buyerSample:null`, locked, with reason `Ahold: Wolthers has the final word`.
  - The settings columns are missing (the select errors with code `42703`), so the rules fall back to the defaults and nothing throws.
  - `saveSellerRequests` refuses a change to a fixed tick (`refused[id] === ['buyerSample']`) and writes the locked value. An id outside `allowedIds` is not written.
  - Route: non-staff → 403. Staff → `members.length === 2`, and SS members are excluded.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(seller-requests): per-contract state from final-word settings; locked save`

### Task 9: Quality table layout A, every sieve, EN/BR

**Files:**
- Create: `src/lib/approval-notification/quality-summary-render.ts`. The pure renderers move here from `quality-summary.ts`: `refColumns`, `buildQualitySummaryText`, `buildQualitySummaryHtml`, `buildQualityCoverNote`, `buildQualitySummarySubject`, the shown-value helpers and the styles. This file has **no Supabase or server imports**, so the composer can import it.
- Modify: `src/lib/approval-notification/quality-summary.ts`. It re-exports the moved names so every existing import keeps working. It removes `collapseScreenRows` and `MAX_SCREEN_LINES`, and `screenRowsFromGrams` returns every sieve, pan included.
- Tests: `src/lib/approval-notification/quality-summary.test.ts` (rewrite the "screen line collapsing" describe at :916 and `screenRowsFromGrams` at :74-99), and a new `quality-summary-render.test.ts`.

**Interfaces:**
```ts
export interface QualityScreenRow { key: string; label: string; pct: number; isPan: boolean; sortKey: number }  // label: "18" for numbered sieves, raw key otherwise; pct one decimal
export function screenRowsFromGrams(screenSizes: Record<string, number> | null | undefined): QualityScreenRow[]   // all sieves incl. pan; % of total incl. pan; round to 1 decimal
export interface SieveColumn { key: string; label: string; isPan: boolean }
export function sieveColumns(samples: QualitySampleSummary[], audience: 'buyer' | 'seller'): SieveColumn[]  // union of shown rows; numbered desc, then free-text keys, pan last
export interface QualitySummaryOpts { sellerComment?: boolean; audience?: 'buyer' | 'seller'; language?: Lang; requests?: Record<string, SellerRequests> }
export function buildQualityCoverNote(greeting: string, attached: boolean, language?: Lang): string   // plain text, default 'en'; callers that put it in the editor wrap it with literalDraftText (Tasks 11, 14)
```
- `QualitySampleSummary` gains `sampleType` (already present) and nothing else; `screen` / `issuedScreen` use the new row type.
- Pan matching keeps today's rule (`b`, `below`, `pan`, `fundo`, a leading `<`). The pan label is `COPY[lang].pan`.

**Columns:**
- Seller: `Sample` (stage · seller sample ref; muted second line `container · ICO n`) | `Contract` (Wolthers nr; muted second line seller ref) | `Quality` | one column per `SieveColumn` | Def. | Type | Cup | Result
- Buyer: `Sample` (same stacking) | `Buyer Ref` | `Quality` | sieves | Def. | Type | Cup | Result

**Rows and cells:**
- Sieve headings are the bare number (`18`), plus the pan word. A muted line under the header row reads `% of sample`.
- A cell is `pct.toFixed(1)`, or `—` when the sample has no value for that sieve.
- Under each sample row, as full-width rows and seller only:
  1. the rejection reason (unchanged place)
  2. the note (`COPY.note`)
  3. the tolerance block (`lang`)
  4. the request lines from `opts.requests[sampleId]`, only when `decision === 'approved'` and `sampleType === 'pss'`
- The text fallback lists `label pct%` for every sieve.

- [ ] **Step 1: Write the failing tests.**
  - `screenRowsFromGrams({ '18': 30, '17': 60, '16': 90, '15': 60, '14': 30, '13': 15, '12': 9, 'Fundo': 6 })` gives 8 rows, the pan last with `isPan`. The pcts are `10.0, 20.0, 30.0, 20.0, 10.0, 5.0, 3.0, 2.0`, and they sum to 100.0.
  - `it('union of sieves across a group')` (Review Focus 5): sample A has 18-12 plus the pan; sample B has 17-13, a legacy key `'Peneira grossa'` and no pan. The columns are `18,17,16,15,14,13,12,Peneira grossa,Fundo`. B's 18 cell renders `—`.
  - The seller HTML has the `Contract` header and no `Buyer Ref`; the buyer HTML has `Buyer Ref` and no `Wolthers`. The buyer audience shows the issued screens when present (keep the existing tests at :768-900 green after adapting the shapes).
  - `language:'pt'` headers include `Amostra`, `Bebida`, `Fundo` and `APROVADO`.
  - The request lines render under an approved PSS row for the seller, never for the buyer, and never for an SS or a rejected row.
  - No output contains `SAN-` (seed `tracking_number: 'SAN-00123/26'` in a fixture and assert it is absent).
- [ ] **Step 2:** `npx vitest run src/lib/approval-notification/`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the move, the re-exports, the new rows and the columns. Adjust `fetchQualitySampleSummaries` (:889, :969-971) to the new row type; it still uses `screenRowsFromGrams`.
- [ ] **Step 4:** Run `npx vitest run src/lib/approval-notification/ src/app/api/certificates/`. Expected: PASS. Also run `npx tsc --noEmit`: clean.
- [ ] **Step 5: Commit.** `feat(email): quality table shows every sieve (pan included), one column per sieve, EN/BR`

### Task 10: Port sys's rich-text editor

**Files:**
- `npm i @tiptap/react@3.31.4 @tiptap/pm@3.31.4 @tiptap/starter-kit@3.31.4 @tiptap/extension-highlight@3.31.4 @tiptap/extension-text-style@3.31.4`
- Copy verbatim from sys, rewriting only the import paths:
  - `src/lib/email/draft-markup.ts` and its test `draft-markup.test.ts`
  - `src/lib/email/markup-doc.ts` and `markup-doc.test.ts`. Drop the test cases that import `@/lib/requests/templates`; keep the rest.
  - `src/lib/email/draft-markup-view.tsx` and `draft-markup-view.test.tsx`
  - `src/components/email/draft-format.ts`: only `BTN`, `SWATCH_CLASS` and `COLOR_ORDER`, from sys `src/app/(dashboard)/documents/draft-markup-preview.tsx`
  - `src/components/email/rich-body-extensions.ts`, from `request-body-extensions.ts`, with its test. Drop the cases that import `@/lib/requests/templates`.
  - `src/components/email/rich-body-editor.tsx`, from `request-body-editor.tsx`. Rename the export to `RichBodyEditor`; same props `{ value: string; onChange: (markup: string) => void; compact?: boolean; baseColor?: DraftColor; ariaLabel?: string }`.
- Modify: `src/lib/email/compose-html.ts`. Add `renderMarkupBodyHtml(markup: string, signatureHtml: string | null): string`, ported from sys `renderRequestHtml`, but with WAQC's font: `font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a1a`. Keep sys's closing-strip when a signature is attached. Existing exports are unchanged.

- [ ] **Step 1: Copy the tests first.** `npx vitest run src/lib/email/ src/components/email/`. Expected: FAIL (modules missing).
- [ ] **Step 2: Copy the sources and install the deps.**
- [ ] **Step 3: Add the `renderMarkupBodyHtml` tests.**
  - `'**Hello** ==world=={red}x{/red}'` renders `<strong>`, a highlight background `#fff3a3` and `color:#c0392b`, inside a Helvetica 10pt wrapper.
  - With a signature, a trailing `Best regards,` line is stripped.
  - `stripDraftMarkup` of the same input → `Hello worldx`.
- [ ] **Step 4:** `npx vitest run src/lib/email/ src/components/email/`. Expected: PASS. Also run `npx tsc --noEmit`: clean.
- [ ] **Step 5: Commit.** `feat(email): port sys rich-text body editor + draft markup (TipTap 3.31.4)`

### Task 11: Send pipeline carries language, ticks and the markup cover

**Files:**
- Modify: `src/lib/approval-notification/batch-send.ts`
  - `BatchUnit` (:149): add `qcClientId: string | null; language: Lang; summaryGroups?: QualitySummaryGroup[]`
  - `BatchUnitSample` (:140): add `sampleType: string | null; sellerRequest?: { requests: SellerRequests; locks: TickLocks; clientId: string | null; clientName: string | null; importerId: string | null; roasterId: string | null } | null`
  - keep `qcClientId` from the bucket key (:225-226) on the unit
- Modify: `src/lib/approval-notification/send-queue.ts`
  - the companies select (:206) adds `preferred_language, country, state`
  - per unit: `language = sellerLanguage(company of unit.companyId)`; `body = literalDraftText(buildQualityCoverNote(greeting, attached, language))`; `summaryHtml` / `summaryText` with `{language, requests}`; `summaryGroups = groups`
  - for seller units: `loadSellerRequestStates(admin, approved PSS sample ids)` fills `sellerRequest` per sample
- Modify: `src/app/api/certificates/batch-send/route.ts`. The `Body` gains `language?: Lang` (validated `'en' | 'pt'`) and `sellerRequests?: Record<string, unknown>` (each parsed with `sellerRequestsInputSchema`; invalid entries dropped). `bodyText` is now draft markup.
- Modify: `src/lib/approval-notification/send-unit.ts`
  - `SendUnitInput` gains `language?: Lang; sellerRequests?: Record<string, SellerRequests>`
  - `composeQualityBody`: cover HTML = `renderMarkupBodyHtml(coverMarkup, sig)`; text = `stripDraftMarkup(coverMarkup)`; the summary passes `{language, requests}`
  - seller side only, before building the summary:
    1. `saveSellerRequests(supabase, sender.userId, input.sellerRequests ?? {}, { allowedIds: valid ids })`
    2. `requests = loadSellerRequestStates(...)` (the authoritative stored-and-locked values) for rendering
  - `email_messages.metadata` gains `seller_requests: { [sampleId]: sellerRequestsToDb(...) }` (seller side) and `language`
  - per sample with requests, `logSampleEvent(... 'seller_requests_sent', { buyer_sample: company name | null, stuffing })`
- Modify: `src/lib/approval-notification/tolerance-seller-send.ts`. Pass `language: u.language`; the ticks come from storage.
- Tests: `src/app/api/certificates/batch-send/route.test.ts`, `src/app/api/certificates/batch-send/queue/route.test.ts`, `src/lib/approval-notification/tolerance-seller-send.test.ts`, `src/lib/approval-notification/batch-send.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Queue, seller unit for a Brazilian seller (`country:'Brazil'`): `language === 'pt'`, `body` starts with `Prezado`, and an approved PSS sample of a pre-approval client carries `sellerRequest.requests.buyerSample.companyName === 'Blaser'`.
  - Queue, buyer unit: no `sellerRequest` on any sample.
  - batch-send POST, seller side, with `sellerRequests` for a sample whose rule is `wolthers`-fixed and an incoming destination: the stored value stays null, and the HTML sent to `sendMail` has no `Pré-aprovado` line (Review Focus 2).
  - batch-send POST with `bodyText:'**Olá**'`: the HTML has `<strong>Olá</strong>`, and the text part is `Olá`.
  - `email_messages` insert metadata includes `seller_requests` and `language`.
  - tolerance-seller-send passes `language` through to `sendCertificateUnit`.
- [ ] **Step 2:** `npx vitest run src/app/api/certificates/ src/lib/approval-notification/`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same, plus `npx tsc --noEmit`. Expected: PASS and clean.
- [ ] **Step 5: Commit.** `feat(send): seller emails carry EN/BR, the request lines and a rich-text cover; ticks saved on send`

### Task 12: Record the buyer request on sys at send

**Files:**
- Modify: `src/lib/graph/send.ts`
  - `GraphSendParams` gains `returnIds?: boolean`
  - `sendMail(params): Promise<GraphSentIds | null>` with `export interface GraphSentIds { graphMessageId: string; internetMessageId: string | null; conversationId: string | null }`
  - when `returnIds`, always take the existing draft path (POST `/messages` → read `id`, `internetMessageId`, `conversationId` → POST `/send`) and return them; otherwise behave as today and return `null`
  - existing callers ignore the result
- Create: `src/lib/seller-requests/sys-buyer-request.ts`
- Modify: `src/lib/approval-notification/shipment-sample-writeback.ts`
  - `ShipmentSampleRow` gains `pre_approval_of?: string | null`, and `selectShipmentSampleTargets` skips rows with it set
  - the candidate read (:222-225) selects `pre_approval_of`; on error code `42703` / `PGRST204` it retries without it
- Modify: `src/lib/approval-notification/send-unit.ts`, seller side
  - pass `returnIds: true` to `sendMail` when any sample in the unit has a buyer sample
  - after a successful non-sandbox send, for each such approved PSS with a `contractId`, call `recordBuyerSampleRequest`
- Tests: `src/lib/seller-requests/sys-buyer-request.test.ts`, `src/lib/approval-notification/shipment-sample-writeback.test.ts`, the graph send tests (create `src/lib/graph/send.test.ts` if none exists, mocking `fetch`)

**Interfaces:**
```ts
export interface SysPssRow { id: string; waqc_ref: string | null; sample_type: string | null; status: string | null; group_id: string | null; container_slot: number | null; shipment_id: string | null; split_id: string | null; pre_approval_of: string | null; created_at: string }
export function planBuyerRequest(rows: SysPssRow[], waqcRef: string): { claimedIds: string[]; anchorId: string | null; existingRequestId: string | null }
export async function recordBuyerSampleRequest(admin: SupabaseClient<any>, args: {
  sampleId: string; contractId: string; waqcRef: string; sellerId: string | null; destination: BuyerSampleDestination
  userId: string; email: { to: string[]; cc: string[]; subject: string; bodyMarkup: string; language: Lang; ids: GraphSentIds | null }
}): Promise<void>   // never throws
```

`planBuyerRequest`:
- `claimedIds` are the `approved` PSS rows with `waqc_ref === waqcRef` and `pre_approval_of` null (all leaves of a container group).
- `anchorId` is the lowest `container_slot`, else the oldest.
- `existingRequestId` is the row whose `pre_approval_of` is in `claimedIds`.

`recordBuyerSampleRequest`, in order:
1. Read the contract's PSS rows (`ilike sample_type '%pss%'`) and plan. With no anchor, write `insertSyncIssue({stage:'email', reason:'buyer_request_no_target', ...})` and return.
2. Update the claimed rows: `qc_pre_approved_at = now()`.
3. Recipient fields: `recipient_company_id = destination.companyId`, else `recipient_company_name = destination.companyName`.
   - If `existingRequestId` exists, update its recipient fields.
   - Otherwise insert `{ contract_id, shipment_id, split_id (from the anchor), sample_type:'pss', status:'requested', source:'sys', created_by:userId, pre_approval_of: anchorId, ...recipient }`.
4. Insert `request_batches`:
   ```ts
   { idempotency_key: `waqc-buyer-sample:${requestRowId}:${ids?.internetMessageId ?? Date.now()}`,
     kind:'samples', origin:'staff', seller_id, contract_ids:[contractId],
     buyer_company_ids: destination.companyId ? [destination.companyId] : [],
     items: [{ contract_id, sample_destination: destination.companyName, sample_destination_company_id: destination.companyId }],
     requested_by: userId, language, subject, body: bodyMarkup, to_emails: to, cc_emails: cc, status:'sent',
     graph_message_id, internet_message_id, conversation_id, sent_at: now, sent_by: userId }
   ```
   Skip it when `seller_id` is null (NOT NULL on sys).
5. Insert `pss_requests`: `{ requested_by:userId, request_method:'email', email_to:to, email_cc:cc, subject, batch_id, sample_id: requestRowId, contract_id }`.
6. Guards:
   - `requested_by` / `created_by` foreign keys on sys: on 23503, retry with null.
   - Any other error → `insertSyncIssue({stage:'email', reason:'buyer_request_error', detail:{message}})`.
   - **Never write `contract_splits`.**

- [ ] **Step 1: Write the failing tests.**
  - `planBuyerRequest`: a container group of 3 approved leaves gives 3 claimed ids, anchored on slot 1. A rejected row with the same ref is not claimed. A buyer request row is never claimed, and is returned as `existingRequestId`.
  - `it('resend updates, never duplicates')` (Review Focus 3): with an existing request row, the calls include an `update` on that row and **no** `shipment_samples` insert, plus a `pss_requests` insert.
  - A first send writes, in order: the `qc_pre_approved_at` update, the request insert with `source:'sys'` and `pre_approval_of: anchorId`, `request_batches` with `origin:'staff'`, then `pss_requests`. Nothing touches `contract_splits`.
  - No anchor → one `insertSyncIssue` with reason `buyer_request_no_target`, and no writes.
  - send-unit: sandbox (`MICROSOFT_GRAPH_TEST_RECIPIENT` set) → `recordBuyerSampleRequest` is not called. A contract-less sample → not called, but the email HTML still contains the buyer-sample line (Review Focus 4).
  - `selectShipmentSampleTargets` skips a `pre_approval_of` row (an approved anchor and its open request: only the anchor is targeted). The candidate read falls back when the first select errors with `42703`.
  - `sendMail({..., returnIds:true})` posts `/messages` then `/send` and returns `{graphMessageId:'m1', internetMessageId:'<x@y>', conversationId:'c1'}`. Without `returnIds`, it posts `/sendMail` and returns `null`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run src/lib/seller-requests/ src/lib/approval-notification/ src/lib/graph/`, plus `npx tsc --noEmit`. Expected: PASS and clean.
- [ ] **Step 5: Commit.** `feat(sys): seller email with buyer sample records a sys request + QC pre-approval mark`

### Task 13: Finalize — ticks in the modal, saved before anything sends

**Files:**
- Create: `src/components/seller-requests/seller-request-ticks.tsx`, exporting `SellerRequestTicks({ members, value, onChange }: { members: SellerRequestState[]; value: Record<string, SellerRequests>; onChange: (next: Record<string, SellerRequests>) => void })`.
  - One row per member. When there are several, each row has a heading `{contractNumber} · {clientName}`.
  - Two checkboxes: `Send sample to buyer` and `Inform stuffing date/time/place`.
  - A locked checkbox is disabled, with `locks.*.reason` shown beside it in muted 12px.
  - When buyer-sample is ticked, `DestinationPicker` (Task 14 creates it; this task uses a temporary read-only address line if Task 14 isn't done, then swaps in the picker in Task 14).
- Create: `src/components/seller-requests/seller-request-ticks.test.tsx`
- Modify: `src/components/cupping/cupping-validation-modal.tsx`
  - state `sellerRequests`, loaded from `GET /api/samples/${sampleId}/seller-requests` in the open effect (241-247)
  - render `<SellerRequestTicks>` inside the `canFinalize` block above "Comment to seller" (1410), only when `members.length > 0`
  - add `seller_requests: sellerRequests` to the finalize body (555-575)
- Modify: `src/app/api/cupping/finalize/route.ts`
  - parse `body.seller_requests` (each entry through `sellerRequestsInputSchema`; invalid entries dropped)
  - **after the decision is computed and before `approveWithinTolerance` (≈ line 480)**, call `saveSellerRequests(supabaseAdmin, user.id, entries, { allowedIds: new Set(await groupSampleIds(supabaseAdmin, sample_id)) })`
  - never fail the finalize because of it
- Tests: `src/app/api/cupping/finalize/route.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Component: two members (Blaser locked on, Ahold locked off) render two headings. Ahold's buyer-sample checkbox is disabled, with the text `Ahold: Wolthers has the final word`. Ticking stuffing on Blaser calls `onChange` with `stuffing:true` for Blaser's id only.
  - Route: a body with `seller_requests` makes `saveSellerRequests` get called **before** `approveWithinTolerance` (order assertion on the mocks), and with `allowedIds` = the group.
  - Route: a `saveSellerRequests` rejection still returns 200 from finalize.
  - Route: an id outside the group is not saved.
- [ ] **Step 2:** `npx vitest run src/components/seller-requests/ src/app/api/cupping/finalize/`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same, plus `npx tsc --noEmit`. Expected: PASS and clean.
- [ ] **Step 5: Commit.** `feat(cupping): seller request ticks at finalize, saved before the automatic seller email`

### Task 14: Composer — Requests card, destination picker, EN/BR, rich text

**Files:**
- Create: `src/components/seller-requests/destination-picker.tsx`, exporting `DestinationPicker({ clientId, clientName, importerId, roasterId, value, onChange, disabled }: {...; value: BuyerSampleDestination | null; onChange: (d: BuyerSampleDestination) => void; disabled?: boolean })`.
  - A shadcn `Popover` + `Command` combobox. Sections come from `GET /api/companies/${clientId}/sample-destinations`.
  - **Use `value={option.key + ' ' + label}` for `CommandItem`, never a bare uuid.** That avoids the cmdk value trap and keeps type-to-search working.
  - Footer action: `+ New address for {clientName}…`, which opens a small form (label*, lines*, country, recipient, ATTN, phone, instructions) and POSTs to the same route. On `{duplicate:true}`, select the existing address and show "Already saved".
- Create: `src/components/seller-requests/requests-card.tsx`, exporting `RequestsCard({ samples, value, onChange })`. For each approved PSS sample with a `sellerRequest`, it shows the label `{contractNumber} · Cert {certNumber}` and reuses `SellerRequestTicks` row markup.
- Modify: `src/components/seller-requests/seller-request-ticks.tsx`: swap in `DestinationPicker`.
- Modify: `src/components/certificates/batch-approval-send-view.tsx`
  - seller units: render `<RequestsCard>` under the attachments card
  - EN/BR toggle (two small buttons `EN` / `BR`, sys style) above the recipients. On switch, if the cover was not edited by hand (a `coverDirty` ref per unit index, sys's `bodyDirtyRef` rule), replace `body` with `literalDraftText(buildQualityCoverNote(greeting, attached, lang))`.
  - the cover note uses `<RichBodyEditor value={current.body} onChange={…}>` in place of `RecipientPanel`'s textarea. Add a `hideBody` prop to `RecipientPanel`; `approval-send-view` is unaffected.
  - preview: `buildQualitySummaryHtml(current.summaryGroups, { audience, sellerComment: side==='seller', language, requests })`, re-rendered on every change. Import it from `quality-summary-render.ts` only.
  - Send is disabled while any ticked buyer-sample has no destination, with the hint "Pick where the sample goes".
  - `postUnit` adds `language` and `sellerRequests` (values for this unit's samples) to the POST.
- Tests: `src/components/certificates/batch-approval-send-view.test.tsx` (extend), `src/components/seller-requests/destination-picker.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - Composer, seller unit with one Blaser Dulce PSS: the Requests card shows `Send sample to buyer` ticked and disabled (fixed), and the preview contains `Pré-aprovado pela Wolthers – favor enviar 1 amostra para Blaser:`.
  - Switching to `EN` re-renders the preview with `Pre-approved by Wolthers` and replaces an unedited cover. After typing in the editor, switching language leaves the cover alone.
  - Unticking an unlocked buyer-sample removes the line from the preview. With buyer-sample ticked and no destination, Send is disabled.
  - The POST body includes `language:'pt'` and `sellerRequests[sampleId].buyerSample.companyName === 'Blaser'`.
  - Picker: typing `Gut` filters to the Guterstrasse option. Saving a new address POSTs `{label, lines}`, and a `{duplicate:true}` reply selects the existing one.
  - No rendered text contains `SAN-`.
- [ ] **Step 2:** `npx vitest run src/components/certificates/batch-approval-send-view.test.tsx src/components/seller-requests/`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same, plus `npx tsc --noEmit`. Expected: PASS and clean.
- [ ] **Step 5: Commit.** `feat(composer): requests card, sample destination picker, EN/BR switch, rich-text cover`

### Task 15: Final-word settings — buyer panel and quality rows

**Files:**
- Create: `src/components/clients/final-word-fields.tsx`, exporting `FinalWordFields({ value, onChange, inherit, clientId, clientName }: { value: FinalWordOverrides; onChange: (v: FinalWordOverrides) => void; inherit?: FinalWordSettings | null; clientId: string; clientName: string })`.
  - Controls:
    - Final word radio: `Wolthers: our approval is final` / `Pre-approval: seller sends a sample to {client}, {client} decides`
    - `Fixed` checkbox
    - Sample address via `DestinationPicker`, which stores only `savedAddressId` as `addressId`. A company-address pick stores `null`, meaning it falls through to the company address.
    - Stuffing radio: Off / Pre-checked / Fixed on
  - With `inherit` set (quality rows), each field gets an `as {client}` choice that writes `null`, and the summary line reads `as {client}`.
- Create: `src/components/clients/final-word-fields.test.tsx`
- Modify: `src/lib/qc-client-mapper.ts`
  - add `final_word, final_word_fixed, buyer_sample_address_id, stuffing_request` to the `QC_CLIENT_SELECT` embed (:25)
  - map them in `mapCompanyToClient` (:172) with today's defaults
  - add them to the `QC_SETTINGS_FIELDS` set (:313)
  - add them to `buildQcClientCreatePayload` (:504)
- Modify: `src/components/clients/qc-config-panel.tsx`. `QcConfigData` (30-46) gains `finalWord, finalWordFixed, buyerSampleAddressId, stuffingRequest`. Add a `<Group title="Final word">` after "Sending and approval" (≈583-598), rendering `FinalWordFields` without `inherit`.
- Modify: `src/components/clients/client-detail-view.tsx`: `qcSettingsOf` (58-76) and `handleQcConfigSave` (128-166) carry the four fields as snake_case. Make the same change in `src/app/clients/page.tsx:295-311`.
- Modify: `src/lib/clients/qc-settings-summary.ts`: `rulesSummary` appends `· final word: Wolthers|pre-approval (fixed)`.
- Modify: `src/app/api/client-qualities/[id]/route.ts`: add the four columns to `allowedFields` (:96). They are not spec fields, so no spec version is recorded.
- Modify: `src/components/clients/client-quality-manager.tsx`
  - each row gets a `Final word` cell: a summary button (`as {client}` / `Pre-approval · fixed` …) opening a `Popover` with `FinalWordFields` and `inherit` = the buyer's settings
  - saving calls `handleInlineUpdate(id, field, value)` per changed field
  - `ClientQuality` (58-82) gains the four nullable fields
- Tests: `final-word-fields.test.tsx`, `src/lib/qc-client-mapper.test.ts` (extend), `src/app/api/client-qualities/[id]/route.test.ts` (extend)

- [ ] **Step 1: Write the failing tests.**
  - The mapper round-trips the four fields, and `splitClientPayload` routes them to `settingsFields`.
  - Client-qualities PATCH `{final_word:'pre_approval', final_word_fixed:true}` updates the row, and `recordStaffVersion` is not called.
  - `FinalWordFields` with `inherit`: picking `as Blaser` for the final word calls `onChange` with `finalWord:null`. The `Fixed` checkbox is disabled while the final word is inherited.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run src/components/clients/ src/lib/qc-client-mapper.test.ts src/app/api/client-qualities/`, plus `npx tsc --noEmit`. Expected: PASS and clean.
- [ ] **Step 5: Commit.** `feat(clients): final-word settings per buyer and per quality (pre-approval, fixed, sample address, stuffing)`

### Task 16: Reversal after a pre-approval

**Files:**
- Modify: `src/lib/approval-notification/shipment-sample-writeback.ts` `applyShipmentSampleApproval`. When `decision === 'rejected'`, on the targeted rows:
  - set `qc_pre_approved_at = null` (guarded optional update, like the initials)
  - read rows with `pre_approval_of IN targets` and `status = 'requested'`; for each, `insertSyncIssue({ stage:'decision', reason:'buyer_request_open_after_reversal', detail:{ request_id, recipient } })`
- Modify: `src/app/api/certificates/[id]/override/route.ts`. Add a `GET` that returns `{ openBuyerRequests: Array<{ company: string }> }` for the certificate's contracts: open `requested` rows with `pre_approval_of` pointing at our rows. Staff only. This route file exports only handlers.
- Modify: `src/components/certificates/override-status-dialog.tsx`. When switching to rejected, fetch the GET. If any are open, show an amber notice: `A sample request to {company} is open on sys. Tell the seller not to ship.` No automatic email.
- Tests: `shipment-sample-writeback.test.ts`, `src/app/api/certificates/[id]/override/route.test.ts`, `override-status-dialog.test.tsx` (create)

- [ ] **Step 1: Write the failing tests.**
  - A rejection on a pre-approved row clears `qc_pre_approved_at`, and logs one `buyer_request_open_after_reversal` issue when its request is still `requested`, none when it is `pending` or decided.
  - The override GET returns `[{company:'Blaser'}]` for a certificate whose PSS has an open buyer request.
  - The dialog shows the notice text exactly.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run src/lib/approval-notification/ src/app/api/certificates/ src/components/certificates/`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(override): reversing a pre-approval clears the mark, flags the open buyer request, warns in the dialog`

### Task 17: One seller email — the cert editor opens the composer

**Files:**
- Modify: `src/components/certificates/cert-editor/sample-actions.tsx` (:21, :214). Replace `<ApprovalSendView sampleId=… />` with:
  ```tsx
  <BatchApprovalSendView open={a.showApprovalSend} selection={{ sampleIds: [sample.id], parties: ['buyer', 'seller'], includeSent: true }} onClose={() => a.setShowApprovalSend(false)} onSent={() => a.setShowApprovalSend(false)} />
  ```
- Test: extend the cert-editor sample-actions test if one exists, else add `sample-actions.test.tsx` asserting that the send action renders `BatchApprovalSendView` with that selection (mock the component).

- [ ] **Step 1: Write the failing test.**
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** Leave `approval-send-view.tsx` and the `notify-approval` route in place (now unused by this button). Run `grep -rn "ApprovalSendView\b" src` to confirm no other user and note it in the commit message.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit.** `refactor(cert-editor): Send approval email opens the shared composer (one seller email)`

### Task 18: Whole-branch verification and hand-over

- [ ] **Step 1: WAQC.**
  - `npx vitest run`: all green. Record the counts.
  - `npx tsc --noEmit`: clean.
  - `npx next build`: succeeds. Route files export only handlers.
- [ ] **Step 2: sys worktree.** `npx vitest run src/lib/requests/ src/lib/shipments/ src/lib/samples/` passes and `npx tsc --noEmit` is clean.
- [ ] **Step 3: SAN sweep.** `grep -rn "tracking_number" src/lib/seller-requests src/components/seller-requests src/components/clients/final-word-fields.tsx` must show only claim-key uses (`waqcRef` derivation), and no rendered text.
- [ ] **Step 4: Paste to Daniel, in order:**
  1. sys `0960_qc_pre_approval.sql`
  2. WAQC `20261118000001_seller_requests_final_word.sql`

  State the deploy order: sys migration → sys deploy → WAQC migration → WAQC deploy.
- [ ] **Step 5: Report back** on whether the relay can match the seller's reply. `request_batches.internet_message_id` is stamped, and a reply-all reaches wolthers@ (CC). Name the sys relay paths: `0801` trigger `request_relay_notify`, and `relay-server.ts:139-168`.
- [ ] **Step 6:** Don't push. Leave both branches committed, and write a handoff with the `handoff` skill.
