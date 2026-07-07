# Link an SS to a specific sub-contract PSS

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan

## Problem

When registering an SS (Shipment Sample), the "Approved PSS" picker only lets you
link to a **mother** PSS sample. A PSS split across buyers/containers stores its
splits as `sample_contracts` rows (each with its own minted certificate number,
e.g. `BR-036995/26`). Those sub-contracts:

1. are not `samples` rows, so they never appear as picker options, and
2. are not even findable through the mother row — the picker searches a shape
   that lacks the sub-contract cert numbers.

Confirmed case: `BR-036995/26` is a sub-contract of the mother `BR-036991/26`
(mother is `sample_type='pss'`, `status='approved'`). The mother shows in the
dropdown; the sub-contract cannot be found or linked at all.

The picker is not a live DB search — on the SS step the form fetches a fixed list
once via `GET /api/samples?sample_type=pss&status=approved&limit=200`
([sample-intake-form.tsx:314](../../../src/components/samples/sample-intake-form.tsx#L314))
and filters it client-side. That endpoint already returns each mother's rich
`sub_contracts[]` array (with each leaf's `certificate_number`, buyer/importer/
roaster names, contract numbers, ICO, container, `bags_quantity_mt`), so **no
query rework is needed**.

## Goal

Let the user find, select, and link an SS to **any** PSS reference — a mother
sample **or** an individual sub-contract — with prefill and downstream display
that reflect exactly what was picked.

## Non-goals

- No change to how PSS samples or sub-contracts are created.
- No change to the `GET /api/samples` query shape (it already returns
  `sub_contracts[]`).
- Not touching the 200-row/`status='approved'` window semantics (separate concern).

## Decisions (locked with user)

- One SS links to any single PSS reference — mother **or** sub-contract. Both are
  independently selectable rows in the picker.
- Whatever the user picks **is** the link identity. A leaf link shows the leaf's
  cert number (`BR-036995/26`) everywhere the linked PSS surfaces; a mother link
  shows the mother's number.
- Link to the **exact** sub-contract (persisted), and prefill from that
  sub-contract's own buyer/importer/roaster/container/bags data.

## Design

### 1. Data model — one migration

Add a nullable column to `samples`:

```sql
ALTER TABLE samples
  ADD COLUMN linked_pss_sample_contract_id UUID NULL
    REFERENCES sample_contracts(id) ON DELETE SET NULL;
```

Semantics:
- Linked to a **mother** PSS → `linked_pss_sample_id = mother.id`,
  `linked_pss_sample_contract_id = NULL` (exactly today's behavior).
- Linked to a **sub-contract** → `linked_pss_sample_id = mother.id` **and**
  `linked_pss_sample_contract_id = leaf.id`. Keeping `linked_pss_sample_id`
  pointed at the mother means all existing resolution/embeds keep working; the new
  column only refines which leaf.

Fully backward compatible: existing rows keep `NULL` and are unchanged.

Migration file lives in `database/migrations/` (WAQC convention), not
`supabase/migrations/`. Daniel applies migrations manually (pasted SQL).

### 2. Picker options — `src/lib/pss-picker-option.ts`

Today: one row per mother PSS (`buildPssPickerOption(pss)` → single option).

Change: a PSS emits **the mother row + one row per sub-contract**. Introduce a
function that returns an array of options for a PSS (mother first, then each
`pss.sub_contracts[]`):

- **Mother row** — unchanged: `value = pss.id`, label leads with the mother's
  official ref.
- **Sub-contract row** — `value = subContract.id` (a distinct UUID; sample ids and
  sample_contract ids never collide), label leads with the leaf's own
  `certificate_number` (e.g. `BR-036995/26 · <buyer/importer> · <origin>`), and
  `keywords` carry the leaf's tracking/contract/ICO/container numbers so typing
  `36995` matches the leaf row directly.

The caller (`PssLinkStep`) also builds a **value → target index** alongside the
options: `value → { motherId, subContract | null }`, so selection and the linked
badge can resolve any chosen value in O(1).

### 3. Selection + prefill

`handleSelectPss(value)`
([sample-intake-form.tsx:489](../../../src/components/samples/sample-intake-form.tsx#L489))
resolves `value` against the index:

- **Mother chosen** → `linked_pss_sample_id = mother.id`,
  `linked_pss_sample_contract_id = ''` (cleared), prefill =
  `mapPssToFormData(mother)` (unchanged path).
- **Sub-contract chosen** → `linked_pss_sample_id = mother.id`,
  `linked_pss_sample_contract_id = leaf.id`, prefill = `mapPssToFormData(mother)`
  (shared fields: seller, quality, origin, bag type/weight, crop year, cert list…)
  **with a sub-contract override layered on top** for the per-leaf fields:
  - `importer`, `roaster`, `end_client`
  - `importer_contract_nr` (from `buyer_contract_nr`), `roaster_contract_nr`,
    `end_client_contract_nr`, `qc_client_contract_nr`, `supplier_contract_nr`,
    `wolthers_contract_nr`
  - `ico_number`, `container_nr`
  - `bags_quantity_mt`

Implement the override as a small `mapSubContractOverride(subContract)` helper in
`src/lib/pss-intake-mapping.ts` returning `{ patch, prefilled }`, applied via the
existing `applyContractPrefill(...)` mechanism so prefill-tracking (user edits
"claim" a field) works identically. Both patches feed one `applyContractPrefill`
call (mother base, then override keys win).

`handleClearPss` also clears `linked_pss_sample_contract_id`. The Step-1
sample-type-change cleanup ([sample-intake-form.tsx:509](../../../src/components/samples/sample-intake-form.tsx#L509))
clears it too.

Add `linked_pss_sample_contract_id: ''` to `FormData` initial state
([sample-intake-form.tsx:96](../../../src/components/samples/sample-intake-form.tsx#L96))
and the `FormData` type in `src/components/samples/intake/types.ts`.

### 4. Persist — `POST /api/samples`

The submit payload
([sample-intake-form.tsx:790](../../../src/components/samples/sample-intake-form.tsx#L790))
adds `linked_pss_sample_contract_id` (send the value or `null`). The POST handler
inserts it into the new column.

### 5. Display — reflect the exact pick

**Intake badge** (`PssLinkStep`, the `selected` branch): when
`linked_pss_sample_contract_id` is set, resolve and show the **leaf's** cert
number and its buyer/importer, not the mother's. Uses the same value→target index.

**Tracker / cert-editor chip:** `GET /api/samples` builds
`linked_pss = { id, tracking_number }` from `linkedPssMap` (mother tracking) at
[route.ts:192](../../../src/app/api/samples/route.ts#L192). Extend the resolution:
when a sample has `linked_pss_sample_contract_id`, set
`linked_pss.tracking_number` to that leaf's minted `certificate_number` instead of
the mother's tracking number. Resolve leaf cert numbers with one batched query:
`certificates` where `sample_contract_id IN (linked leaf ids)` →
`certificate_number`. Consumers (`cert-editor/use-cert-editor.ts`) read the same
`{ id, tracking_number }` shape unchanged.

## Data flow

```
intake form (SS)
  └─ GET /api/samples?sample_type=pss&status=approved   → mothers + sub_contracts[]
  └─ buildPssPickerOptions(pss)  → [motherRow, ...leafRows] + value→target index
  └─ handleSelectPss(value)
        ├─ mother  → linked_pss_sample_id=mother, leaf=NULL, prefill(mother)
        └─ leaf    → linked_pss_sample_id=mother, leaf=sc.id,
                     prefill(mother) + override(subContract)
  └─ POST /api/samples { linked_pss_sample_id, linked_pss_sample_contract_id }

read paths
  └─ GET /api/samples → linked_pss.tracking_number =
        leaf.certificate_number  (if leaf linked)  else mother.tracking_number
```

## Testing

- **`mapSubContractOverride`** (unit, alongside existing `pss-intake-mapping.test.ts`):
  override sets importer/roaster/end_client + contract numbers + ICO/container/bags;
  leaves shared fields (seller, quality, origin) to the mother base.
- **`buildPssPickerOptions`** (unit, extend `pss-picker-option` coverage): a PSS
  with 2 sub-contracts yields 3 rows; leaf rows are keyword-findable by their own
  cert number; mother row unchanged.
- **Selection index**: choosing a leaf value resolves to `{ motherId, subContract }`;
  choosing a mother value resolves to `{ motherId, null }`.
- **Regression**: linking a mother PSS (no sub-contracts) behaves exactly as before
  (existing `mapPssToFormData` tests stay green).

## Files touched

- `database/migrations/<ts>_samples_linked_pss_sample_contract_id.sql` (new)
- `src/components/samples/intake/types.ts` — `FormData` field
- `src/lib/pss-picker-option.ts` — emit mother + leaf rows, build index
- `src/lib/pss-intake-mapping.ts` — `mapSubContractOverride`
- `src/components/samples/intake/pss-link-step.tsx` — options array, index, leaf badge
- `src/components/samples/sample-intake-form.tsx` — select/clear handlers, initial
  state, submit payload
- `src/app/api/samples/route.ts` — POST insert + `linked_pss` leaf resolution
- Tests: `src/lib/pss-intake-mapping.test.ts`, `src/lib/pss-picker-option.test.ts`
