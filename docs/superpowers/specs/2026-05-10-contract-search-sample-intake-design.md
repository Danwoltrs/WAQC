# Contract Search as Step 0 of Sample Intake — Design

**Status:** Draft
**Date:** 2026-05-10
**Author:** Daniel Wolthers + Claude

## Problem

Lab technicians create samples in `sample-intake-form.tsx` by typing every supply-chain entity, contract number, quality description, crop year, bag count, and bag weight by hand. The same data already exists in the `public.contracts` table (synced from sys.wolthers.com), but the intake flow has no way to consume it. Result: slow intake, transcription errors, and no link from a sample back to its commercial contract.

## Goal

Add a first step ("Contract Search") to sample intake that lets the user find an existing contract by number, auto-fill the rest of the form from that contract, and persist the link via `samples.contract_id`. Skipping the step preserves today's manual-entry flow exactly.

## Non-Goals

- Multi-container splitting ("X of N containers sampled") — deferred until sys.wolthers.com nails down where box count is persisted.
- Auto-creating sub-contracts from contract splits — out of scope; Step 6 (sub-contracts) is unchanged.
- Backfilling `samples.contract_id` for historical samples — manual matching only if needed later.
- Modifying the `contracts` table schema. No new columns on sys.wolthers.com tables.

## User Flow

The wizard becomes 6 steps:

1. **Contract Search** *(new)*
2. Supply Chain
3. Quality
4. Quantity
5. Sample Details
6. Sub-Contracts *(optional, unchanged)*

**Step 0 — Contract Search:**

- Single search input with debounced (300 ms) typeahead against `GET /api/contracts/search?q=…`.
- Filter: `status = 'active'`, ordered by `contract_date DESC`.
- Result rows show: `contract_number · seller fantasy_name → buyer fantasy_name · crop · volume_bags bags · contract_date · (N sample[s] already)`.
- Selecting a row → `GET /api/contracts/:id` → run entity resolution → prefill form fields → user can advance or stay.
- A **"Skip — enter manually"** button advances to Step 1 with no prefill. Same outcome as hitting Next with nothing selected.

**Steps 2–6 — Persistent Badge:**

```
┌────────────────────────────────────────────────────────────┐
│  Linked to contract #41966/26                              │
│  Nucoffee → Rucquoy · 26/27 · 320 bags · 60kg Jute      ✕ │
└────────────────────────────────────────────────────────────┘
```

- Olive accent (`#556b2f` dark / lighter shade light).
- Click body → popover with full contract summary (parties, quality_description, shipment window, crop, certifications).
- `✕` → confirm dialog `"Unlink this sample from contract #41966/26? Prefilled fields you haven't touched will be cleared."` → on confirm, clear `selected_contract` and all keys still in `contract_prefilled_fields`. User-edited fields stay.
- Navigating back to Step 0 and picking a different contract → confirm `"Replace linked contract? Untouched prefilled fields will be re-filled; your edits preserved."`

## Schema Change

One migration, two columns:

```sql
-- database/migrations/20260510000000_add_contract_id_to_samples.sql

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS contract_id UUID
    REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_contract_id
  ON samples(contract_id) WHERE contract_id IS NOT NULL;

COMMENT ON COLUMN samples.contract_id IS
  'Optional link to public.contracts. Set when sample was created via the contract-search step in sample intake.';

ALTER TABLE sample_contracts
  ADD COLUMN IF NOT EXISTS contract_id UUID
    REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sample_contracts_contract_id
  ON sample_contracts(contract_id) WHERE contract_id IS NOT NULL;
```

- `ON DELETE SET NULL` — hard-deleting a contract doesn't lose the sample; text contract numbers remain as paper trail.
- Partial indexes — most samples won't have a contract link.
- `sample_contracts.contract_id` added now for forward compatibility; no UI changes in this iteration.
- Existing `wolthers_contract_nr` / `seller_contract_nr` / etc. text columns stay untouched; they're populated on submit from contract data when present, kept for legacy and manual entries.

## Field Mapping (Contract → Form)

When a contract is selected, these fields are prefilled.

| Form field | Source | Notes |
|---|---|---|
| `selected_contract.id` | `contracts.id` | Saved to `samples.contract_id` on submit |
| `wolthers_contract_nr` | `contracts.contract_number` | e.g. `41966/26` |
| `seller_contract_nr` | `contracts.seller_reference` | Nullable |
| `importer_contract_nr` (DB: `buyer_contract_nr`) | `contracts.buyer_reference` | Nullable |
| `seller` *(name)* | `companies.fantasy_name` of `contracts.seller_id`, fall back to `companies.name` | Resolved against `exporters` by `ilike` on submit |
| `shipper` | `companies.fantasy_name` of `contracts.shipper_id` | See `same_seller_shipper` below |
| `same_seller_shipper` | `contracts.shipper_id IS NULL OR = seller_id` | Boolean; when true, `shipper` stays blank |
| `importer` | `companies.fantasy_name` of `contracts.buyer_id` | See importer resolution below |
| `importer_is_qc_client` | Derived from buyer resolution | True if the linked WAQC `clients` row has `is_qc_client = true` |
| `qc_client` | Empty unless `importer_is_qc_client = false` and a separate QC client was found | Usually blank |
| `end_client` | `companies.fantasy_name` of `contracts.end_buyer_id` | Optional |
| `quality_name` | `contracts.quality_description` | e.g. `Fancy Gourmet 17/18 FC` |
| `quality_spec_id` | **not prefilled** | `contracts.quality_id → quality_master` is a different table; user picks in Step 3 |
| `crop_year` | `contracts.crop` | e.g. `26/27` |
| `bag_count` | `contracts.volume_bags`, **blank for bulk** | See bulk handling below |
| `bags_quantity_mt` | Auto-calculated downstream, **blank for bulk** | |
| `bag_weight_kg` | `contracts.bag_weight_kg` | Numeric |
| `bag_type` | `contracts.bag_type` parsed | `"60kg Jute"` → `jute_bag`. Mapping: contains `jute`→`jute_bag`, `pp`→`pp_bag`, `big`→`big_bag`, `bulk`→`bulk`, else empty |
| `shipment_month` | `to_char(contracts.shipment_period_start, 'YYYY-MM')` | First day of shipment window |
| `certifications` | `contracts.certifications` (jsonb array) | Pass through values that are in WAQC's accepted vocab; ignore unknowns |

**Not prefilled** (user enters in later steps): `origin`, `micro_origin`, `processing_method`, `sample_type`, `linked_pss_sample_id`, `hide_exporter_on_label`, `laboratory_id` (auto-fills from user's lab today), `arrival_date`, `notes`, `photo_file`, all sub-contracts. Rationale: contracts are commercial documents; origin/processing/sample_type belong to the QC sample's intent.

## Entity Resolution

Three patterns. All resolution happens in the new `GET /api/contracts/:id` endpoint server-side, so the form gets back ready-to-use values.

**Pattern 1 — Buyer / End Client (FK + name fallback):**

1. `SELECT id, is_qc_client FROM clients WHERE company_id = <contracts.buyer_id> LIMIT 1`.
2. If found: use that `clients.id` directly, set `importer_is_qc_client = clients.is_qc_client`.
3. If not: fall back to name lookup — `clients` by `ilike fantasy_name`, then `importers` by `ilike name`.
4. Endpoint returns `{ importer_name, importer_is_qc_client, resolved_client_id, resolved_importer_id, multiple_matches: boolean }`.
5. Frontend renders yellow inline notice if `resolved_*` are null or `multiple_matches = true`.

**Pattern 2 — Seller / Shipper (name-based only):**

No FK from `exporters → companies` exists. Endpoint:

1. Look up exporters by `ilike name` on `companies.fantasy_name` (then `companies.name` as fallback).
2. Return `{ seller_name, candidate_exporter_ids: string[] }`.
3. Frontend pre-fills `formData.seller` with the name; the existing submit-time `Promise.all` lookup block in `sample-intake-form.tsx` runs as today.
4. If `candidate_exporter_ids.length > 1`: yellow notice `"X exporters named «Nucoffee» exist — please verify"`.
5. If `candidate_exporter_ids.length === 0`: yellow notice + existing create-exporter dialog.

**Pattern 3 — Same-seller-shipper detection:**

`same_seller_shipper = (contracts.shipper_id IS NULL OR contracts.shipper_id = contracts.seller_id)`. When true, leave `shipper` blank and check the existing same-seller-shipper checkbox.

## Search API

**`GET /api/contracts/search?q=<query>&limit=20`**

- Server-only route in `src/app/api/contracts/search/route.ts`, uses `supabase-server`, respects user session.
- Skip queries with `q.length < 2`.
- Query:
  ```ts
  await supabaseServer
    .from('contracts')
    .select(`
      id, contract_number, contract_date, crop, volume_bags, bag_type,
      quality_description, shipment_period_start,
      seller:companies!contracts_seller_id_fkey(id, fantasy_name, name),
      buyer:companies!contracts_buyer_id_fkey(id, fantasy_name, name)
    `)
    .eq('status', 'active')
    .ilike('contract_number', `%${q}%`)
    .order('contract_date', { ascending: false, nullsFirst: false })
    .limit(limit)
  ```
- Annotate each row with `sample_count` from a grouped count on `samples.contract_id`:
  ```ts
  const { data: counts } = await supabaseServer
    .from('samples')
    .select('contract_id, id.count()')
    .in('contract_id', ids)
  // merge counts[contract_id] onto each result row
  ```
- Response shape:
  ```json
  {
    "contracts": [
      {
        "id": "uuid",
        "contract_number": "41966/26",
        "contract_date": "2026-05-07",
        "crop": "26/27",
        "volume_bags": 320,
        "bag_type": "60kg Jute",
        "quality_description": "Fancy Gourmet 17/18 FC",
        "shipment_period_start": "2027-02-01",
        "seller": { "id": "...", "fantasy_name": "Nucoffee", "name": "Syngenta AVC SA" },
        "buyer":  { "id": "...", "fantasy_name": "Rucquoy",  "name": "Rucquoy Frères N.V." },
        "sample_count": 0
      }
    ]
  }
  ```

**`GET /api/contracts/:id`**

- Returns full contract joined to `companies` for seller / buyer / shipper / end_buyer.
- Performs Pattern-1 resolution (`clients.company_id = buyer_id`) and Pattern-2 candidate lookup (exporters by name).
- Single round-trip from the client when a contract is picked. Avoids the parallel lookup waterfall.
- Response includes `resolved_client_id`, `resolved_importer_id`, `candidate_exporter_ids[]`, `multiple_buyer_matches` flag.

## Frontend Changes

**New files:**

- `src/app/api/contracts/search/route.ts` — typeahead endpoint.
- `src/app/api/contracts/[id]/route.ts` — full contract + resolution endpoint.
- `src/components/samples/intake/contract-search-step.tsx` — Step 0 UI.
- `src/components/samples/intake/contract-link-badge.tsx` — persistent badge on Steps 2–6.
- `src/components/samples/intake/entity-resolution-notice.tsx` — yellow notice component used by Steps 1–3 when resolution returns no/multiple matches.

**Modified files:**

- `src/components/samples/sample-intake-form.tsx`:
  - Add `selected_contract` and `contract_prefilled_fields` to `FormData`.
  - Renumber existing steps (Supply Chain → Step 2, etc.). Update `STEPS` array and `validateStep`, `handleNext`, `handlePrevious` to 6-step bounds.
  - Wrap step content with the `<ContractLinkBadge>` when `selected_contract` is set and `currentStep > 1`.
  - In `updateFormData`, remove field key from `contract_prefilled_fields` when the user touches a prefilled field.
  - In `handleSubmit`, include `contract_id: selected_contract?.id ?? null` in `sampleData`.
- `src/components/samples/intake/index.ts` — export new step + components.
- `src/components/samples/intake/constants.ts` — add `STEPS[0]` for Contract Search.
- `src/components/samples/intake/types.ts` — add the two new `FormData` fields.

## State Model

In `FormData`:

```ts
interface FormData {
  // ... all existing fields ...

  selected_contract: {
    id: string
    contract_number: string
    seller_name: string | null
    buyer_name: string | null
    crop: string | null
    volume_bags: number | null
    bag_type: string | null
    shipment_period_start: string | null
    quality_description: string | null
  } | null

  contract_prefilled_fields: string[]  // keyof FormData; serialized as array for JSON-friendly localStorage
}
```

When prefill runs:
1. Set `selected_contract`.
2. Build the prefilled-fields list, set it.
3. Apply field values via the existing `updateFormData` reducer logic (but bypass the "user touched it" stripping for the prefill itself).

When user edits a field via `updateFormData(field, value)`:
- If `field` is in `contract_prefilled_fields`, remove it.

On unlink:
- For each key in `contract_prefilled_fields`, reset the value to its initial empty form (`''`, `false`, `[]`, etc.).
- Clear `selected_contract` and `contract_prefilled_fields`.

## Edge Cases

| Case | Behavior |
|---|---|
| Search returns 0 results | `"No active contracts match «41966». Type to refine, or hit Skip to enter manually."` |
| Skip with no selection | `selected_contract = null`, advance to Step 2. No badge. |
| `seller_id IS NULL` | Don't prefill seller; inline notice `"Contract has no seller on file"`. |
| `shipper_id IS NULL` or `= seller_id` | `same_seller_shipper = true`, `shipper` blank. |
| Multiple WAQC clients with the same `company_id` | Take first `is_qc_client = true` match; if none, take first row. Log console warning. |
| Multiple exporters match seller name | Pre-fill field, show `"X exporters named «Nucoffee» — please verify"`. |
| Seller name matches no exporter | Existing yellow notice + create-exporter dialog. |
| `bag_type ILIKE '%bulk%'` | Skip `bag_count` and `bags_quantity_mt` prefill; show contract's total in the badge as context. |
| `quality_description` null/empty | Skip `quality_name` prefill. |
| Contract status changes to non-active after sample submitted | No effect on sample. FK + text contract numbers remain. |
| Contract hard-deleted | `ON DELETE SET NULL` keeps sample; text contract numbers preserved. |
| User picks contract A, edits seller, returns to Step 0, picks contract B | Confirm dialog; on confirm, re-fill untouched prefilled fields from contract B, keep user-edited seller. |

## Testing Strategy

- **Unit:** `bag_type` parser; resolution functions (`resolveBuyer`, `resolveSeller`, `mapContractToFormData`); prefilled-fields tracking on `updateFormData`.
- **Integration / API:** `GET /api/contracts/search` filters to active status, orders by date, returns sample_count. `GET /api/contracts/:id` returns full resolution payload including `multiple_buyer_matches` and `candidate_exporter_ids`.
- **E2E (Playwright or manual):**
  - Pick contract → all expected fields prefill → submit → `samples.contract_id` set on row in DB.
  - Pick contract → edit `bag_weight_kg` → unlink → bag_weight_kg keeps the edited value, other prefilled fields clear.
  - Pick bulk contract → `bag_count` and `bags_quantity_mt` blank; other fields prefilled.
  - Skip Step 0 → advance through wizard → submit → existing manual flow unchanged.
  - Search "41966" → result row shows seller/buyer/crop/`sample_count`.

## Rollout

- Single PR.
- Migration applied via the user's "I will always apply migrations" workflow — SQL is provided in this spec.
- No feature flag. The new step is additive and the Skip path preserves today's behavior, so risk of regression is low.

## Open Questions

None for this iteration. The deferred "X of N containers" feature gets its own design once sys.wolthers.com finalizes how `boxes/mo` is persisted.
