# Handover — QC "Other Sample" intake ↔ sys.wolthers.com integration

**Date:** 2026-06-08
**Branch / state:** all shipped code is on **`main`** (commit `f0aed7f`, merged via `1b122ed`, pushed). Working tree clean apart from two unrelated untracked `docs/` folders.
**Author of this round:** intake redesign + sys port; remaining integration work is scoped below.

---

## 1. TL;DR — what's done vs. what's left

**DONE (on main):**
- QC sample-intake wizard fixes (fantasy-name dropdowns, modal popover scroll, full-screen-on-laptop + reliable inner scroll, contract-link seller/`=Shipper`/bag-type prefill).
- **"Other Sample" intake rebuilt as a port of sys.wolthers.com's "New sample" modal**, writing the **shared `shipment_samples`** table (Single) / **`create_sample_group` RPC** (Per-container, Choices). Contract-ref search resolves buyer/seller/refs/allocations; courier dropdown reads the shared `couriers` table; dialog shrinks to a proportional `2xl` box for this single-column flow.

**LEFT (this handover) — making qc-added samples show correctly on the sys "Shipments & samples" page:**
1. **Attribution** — sys shows "requested by <name>" but can't name qc users yet. → **Decision: DB sync/trigger** `profiles` → `user_profiles` (user applies the migration).
2. **Source tag** — qc-added rows would read **"SYS"**; they should read **"QC"** ("through qc.wolthers.com"). Driver not yet pinned.
3. **Auto status** — when WAQC quality control approves/rejects, sys should auto-show approved/rejected. → **Decision: stamp `waqc_ref` at creation** so the existing write-back matches the exact row. Has an unresolved design question (below).

---

## 2. Critical architecture facts (verified this session)

- **WAQC (qc.wolthers.com) and sys.wolthers.com share ONE Supabase DB** — project `ojyonxplpmhvcgaycznc` (confirmed in both `.env.local`). Same `auth.users`, so a user's id is identical across both apps.
- The sys "New sample" modal that we mirrored: `Wolthers-system/wolthers-app/src/components/samples/sample-modal.tsx`. Group helpers: `…/sample-groups.ts` (copied byte-for-byte into WAQC as `src/components/samples/intake/sample-groups.ts`).
- **`shipment_samples`** = the dispatch/"sent to buyer" record shown on the sys contract "Shipments & samples" tab. Columns include `contract_id, split_id, sample_type, status, courier_id, courier_company, tracking_number, sent_date, notes, bags, recipient_company_id, recipient_contact_id, created_by, waqc_ref`.
- **`create_sample_group` RPC** (`…/migrations/20260606200100_create_sample_group_rpc.sql`): `GRANT EXECUTE … TO authenticated`, runs as caller (SECURITY INVOKER), stamps `created_by = auth.uid()`. No name stored.
- **RLS** (`…/migrations/20260602120000_qc_contracts_and_external_users.sql`): writes on `shipment_samples`/`sample_groups`/`companies` use `USING/WITH CHECK (NOT current_user_is_external())`. `current_user_is_external()` returns `user_type = 'external'` from `user_profiles`, **defaulting to FALSE when there's no row**. → **A qc lab user (no `user_profiles` row, or `user_type <> 'external'`) CAN read+write — RLS will NOT block the Save.** ✅
  - **Edge:** `couriers_internal_write` (`…/20260606130100_couriers_table.sql`) is stricter — requires `EXISTS(user_profiles WHERE id=auth.uid() AND user_type='internal')`. So **"+ Add courier" fails for a user with no `user_profiles` row**, but saving a sample still works. (Reads of `couriers` are open to any authenticated user — the migration comment even says "dropdown population in sys + qc UIs".)
- **Attribution display:** sys renders **"requested by {created_by_name}"** (e.g. `contract-modal-sample-group-row.tsx`: `by ${group.created_by_name}`). `created_by_name` is **NOT stored** — sys resolves it by joining `created_by → user_profiles` (e.g. `wolthers-app/src/app/api/samples/route.ts:36,207`). No write-time name field exists to bypass this.
- **Profiles tables differ:** **WAQC reads `profiles`** (`src/components/providers/auth-provider.tsx:256,316`); **sys reads `user_profiles`**. They are separate tables in the same DB, both keyed on `auth.users.id`. There is **no trigger auto-creating `user_profiles`** for new auth users. → qc-only users have a `profiles` row but no `user_profiles` row, which is why their name won't resolve on sys.

---

## 3. Remaining work (with the user's decisions)

### 3a. Attribution — sync `profiles` → `user_profiles`  ·  **Decision: DB migration (user applies)**

Write a migration that **backfills** missing `user_profiles` rows from `profiles`, and a **trigger** to keep them in sync on `profiles` INSERT/UPDATE. Per user prefs: **paste the SQL for the user to apply** (don't run it); the user always applies migrations.

**Schema mapping (`profiles` → `user_profiles`):**
| user_profiles (target) | source / value | notes |
|---|---|---|
| `id` | `profiles.id` | same auth uid (PK / conflict key) |
| `full_name` | `profiles.full_name` | NOT NULL on both — safe |
| `short_name` | `profiles.first_name` | gives a clean "by Anderson" |
| `email` | `profiles.email` | |
| `user_type` | `'internal'` | constant; CHECK = `('internal','co_broker','external')` |
| `is_active` | `true` (or `profiles.qc_enabled`) | NOT NULL |
| `status` | **VERIFY** a valid value (likely `'active'`) | NOT NULL — confirm its CHECK/default before writing |
| `department_ids` | `'{}'` | NOT NULL `text[]` |
| `permissions` | `'{}'` | NOT NULL `text[]` |
| `created_at`/`updated_at` | `now()` | |

**Must-haves / gotchas:**
- **`INSERT … ON CONFLICT (id) DO NOTHING`** for the backfill, and the trigger should only insert when missing (or update a narrow allow-list). **Do NOT clobber** existing sys-managed `user_profiles` rows (e.g. Débora Sabino is a real sys user — leave hers untouched).
- **Verify the `user_profiles.status` column's NOT-NULL default / CHECK** before writing (not captured this session).
- Decide scope: backfill **all** `profiles` or only `qc_enabled = true`. Recommend qc_enabled (or all internal staff) — these are Wolthers lab people = internal.
- This same fix unlocks the "+ Add courier" RLS edge (they become `user_type='internal'`).

### 3b. Source tag "SYS" → "QC"

qc-created rows should show they came **through qc.wolthers.com**. The sys "TYPE" cell shows a **"SYS · PSS"** badge (see screenshot in the thread). **The exact driver was not pinned** — `grep` of `contract-modal-sample-group-row.tsx` for the literal "SYS" came up empty, so it's rendered elsewhere or derived (candidates: a `source`/`origin` column, or **presence of `waqc_ref`**). **Next step:** find where sys computes that badge (search `wolthers-app/src/components/samples/` + the samples API for the `SYS`/`QC` label), then set whatever it keys on when the WAQC modal writes the row. If it keys on `waqc_ref`, 3b and 3c converge.

### 3c. Auto approved/rejected from WAQC QC  ·  **Decision: stamp `waqc_ref` at creation**

- **`waqc_ref` = the WAQC sample's `tracking_number`.** Proof: `src/app/api/samples/[id]/notify-approval/route.ts:203-205` calls `applyShipmentSampleApproval(..., { waqcRef: tracking })`; `…/approval-recipients/route.ts:88` matches `r.waqc_ref === s.tracking_number`. The write-back matcher (`src/lib/approval-notification/shipment-sample-writeback.ts`, `pickShipmentSampleMatch`) prefers an **exact `waqc_ref` match**, else claims **a single unclaimed PSS placeholder**, else inserts a new row.
- **So:** if the qc-created `shipment_samples` row carries `waqc_ref = <the WAQC sample's tracking_number>`, the WAQC approval write-back will land status on **exactly that row** — reliable even with several samples per contract.
- **⚠️ OPEN DESIGN QUESTION (resolve before coding):** the new Other-Sample modal creates **only** a `shipment_samples` row — there is **no WAQC `samples` (cupping) row**, hence no `tracking_number` to use as `waqc_ref`, and nothing in WAQC to "quality control." Decide the model:
  - **(A)** Other-Sample flow ALSO creates a WAQC `samples` row (enters the cupping/approval pipeline); both share a generated `tracking_number`, stamped as `waqc_ref` on the shipment_sample. This is what makes "our QC auto-approves it" actually possible. **Most likely the intended model.**
  - **(B)** Other Samples are buyer-approved only (the sys Approve/Reject = the buyer's call); "auto from our QC" applies only to true QC-Sample intake, not Other. Then 3c is a no-op for this flow.
  - Recommend confirming A vs B with the user, then (if A) generate the ref at creation and write both rows.

---

## 4. Pending verification

- **RLS smoke test** (mostly resolved by reading policies — see §2): log in as a real qc lab user, Other Sample → search a contract → **Save sample** → confirm it lands in `shipment_samples` with no RLS error, and that dropdowns (couriers/companies/contacts/allocations) populate. Expected to pass for internal staff.
- **Production build:** not run this session (skipped on request). Static checks pass: `tsc --noEmit` clean, ESLint 0 errors, dev-compile 200, `vitest` green (incl. `contract-intake-mapping.test.ts`). If CI runs `next build`, that's the real gate.
- The pre-existing `roasterReference` TS error was **fixed** in `7f88112` (cert work) — build is type-clean now.

---

## 5. Key files

**WAQC (this repo):**
- `src/components/samples/intake/other-sample-intake.tsx` — the new modal (contract search + sys body + `shipment_samples`/`create_sample_group` writes). **This is where 3b (source tag) + 3c (`waqc_ref`) get wired.**
- `src/components/samples/intake/sample-groups.ts` — pure split/choice leaf builders (copied from sys).
- `src/components/samples/sample-intake-form.tsx` — early-returns `<OtherSampleIntake>` when category = `other`; QC wizard otherwise.
- `src/components/samples/sample-intake-dialog.tsx` — `INTAKE_DIALOG_CONTENT_CLASS` (responsive full-screen + `has-[data-intake-narrow]` width).
- `src/lib/contract-intake-mapping.ts` (+ `.test.ts`) — QC contract-link mapping (legal-name seller, `=Shipper` placeholder rule, `parseBagType`).
- `src/lib/approval-notification/shipment-sample-writeback.ts` — the existing write-back matcher (`waqc_ref` keyed).
- `src/components/providers/auth-provider.tsx` — WAQC reads **`profiles`** (the table to sync FROM).

**sys (read-only reference) — `~/Documents/GitHub/Wolthers-system/wolthers-app`:**
- `src/components/samples/sample-modal.tsx`, `…/sample-groups.ts` — what we ported.
- `src/app/(dashboard)/contracts/contract-modal-samples-tab.tsx` — how allocations are built (`contract_splits` → `destination_port · N bags`).
- `src/components/samples/contract-modal-sample-group-row.tsx` — renders "by {created_by_name}" + the SYS/type badge (find the badge driver here for 3b).
- `src/app/api/samples/route.ts` — resolves `created_by_name` from `user_profiles`.
- `supabase/migrations/20260602120000_qc_contracts_and_external_users.sql` — `current_user_is_external()` + RLS.
- `supabase/migrations/20260606130100_couriers_table.sql`, `20260606200000_sample_groups.sql`, `20260606200100_create_sample_group_rpc.sql`.

---

## 6. Resume checklist (next session)
1. Confirm 3c model **A vs B** with the user (does Other-Sample also create a WAQC cupping sample?).
2. Pin the **SYS/QC badge driver** (3b) in the sys row component / samples API.
3. Verify `user_profiles.status` valid value, then write the `profiles → user_profiles` backfill + sync migration (3a) — **hand the SQL to the user to apply**, `ON CONFLICT DO NOTHING`.
4. Wire the WAQC modal to set the source tag (3b) and `waqc_ref` (3c, if model A).
5. RLS smoke test as a real qc user.

Memory: see `other-sample-intake-shipment-samples.md` in the project memory dir.
