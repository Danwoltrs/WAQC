# Contract Search Step in Sample Intake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-10-contract-search-sample-intake-design.md](../specs/2026-05-10-contract-search-sample-intake-design.md)

**Goal:** Add a new first step to the sample-intake wizard that lets users find an existing active contract by number and auto-fills supply-chain / quality / quantity fields, persisting the link via `samples.contract_id`.

**Architecture:** Two new API routes (`GET /api/contracts/search`, `GET /api/contracts/[id]`) handle search + entity resolution server-side. Three new client components (search step, persistent badge, resolution notice) plug into the existing 5-step wizard, expanding it to 6 steps with a new Step 1. Pure mapping helpers live in `src/lib/contract-intake-mapping.ts`. A single migration adds `samples.contract_id` and `sample_contracts.contract_id` as nullable FKs.

**Tech Stack:** Next.js 14 App Router (TS), Supabase JS (`@/lib/supabase`, `@/lib/supabase-server`), Tailwind, Shadcn/ui, existing `lucide-react` icons.

**Test note:** The WAQC repo has no unit-test framework installed (`package.json` only has `lint`, `build`). This plan uses **verification-driven steps** (curl, DB asserts, browser smoke) instead of strict TDD. Adding a test framework is out of scope.

---

## File Structure

**New files:**
- `database/migrations/20260510000000_add_contract_id_to_samples.sql` — schema migration
- `src/lib/contract-intake-mapping.ts` — pure helpers: `parseBagType`, `mapContractToFormData`, contract response types
- `src/app/api/contracts/search/route.ts` — typeahead endpoint
- `src/app/api/contracts/[id]/route.ts` — full contract + entity resolution endpoint
- `src/components/samples/intake/contract-search-step.tsx` — Step 1 UI (typeahead + skip)
- `src/components/samples/intake/contract-link-badge.tsx` — persistent header badge on Steps 2–6
- `src/components/samples/intake/entity-resolution-notice.tsx` — reusable yellow notice for missing/duplicate entity matches

**Modified files:**
- `src/components/samples/intake/types.ts` — add `selected_contract` and `contract_prefilled_fields` to `FormData`
- `src/components/samples/intake/constants.ts` — prepend Contract Search step to `STEPS`
- `src/components/samples/intake/index.ts` — export new components
- `src/components/samples/sample-intake-form.tsx` — renumber steps, wire Step 1, badge, prefill, unlink, include `contract_id` on submit
- `src/components/samples/intake/supply-chain-step.tsx` — surface `<EntityResolutionNotice>` near seller/importer when contract resolution flags issues

---

## Task 1: Database Migration

**Files:**
- Create: `database/migrations/20260510000000_add_contract_id_to_samples.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260510000000_add_contract_id_to_samples.sql
-- Adds optional FK from samples (and sample_contracts) to public.contracts so that
-- samples created via the Contract Search step retain a link to the source contract.

BEGIN;

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS contract_id UUID
    REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_contract_id
  ON samples(contract_id) WHERE contract_id IS NOT NULL;

COMMENT ON COLUMN samples.contract_id IS
  'Optional link to public.contracts. Set when sample was created via the contract-search step in sample intake.';

ALTER TABLE sample_contracts
  ADD COLUMN IF NOT EXISTS contract_id UUID
    REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sample_contracts_contract_id
  ON sample_contracts(contract_id) WHERE contract_id IS NOT NULL;

COMMENT ON COLUMN sample_contracts.contract_id IS
  'Optional link to public.contracts. Reserved for future use; UI does not currently populate this.';

COMMIT;
```

- [ ] **Step 2: Hand to user for application**

The user applies all migrations themselves. Show the SQL above in the response and wait for confirmation that it was applied.

- [ ] **Step 3: Verify via SQL**

User pastes the result of:
```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'samples' AND column_name = 'contract_id';
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'sample_contracts' AND column_name = 'contract_id';
SELECT indexname FROM pg_indexes WHERE tablename IN ('samples','sample_contracts') AND indexname LIKE '%contract_id%';
```
Expected: two `contract_id` UUID nullable columns, two new indexes.

- [ ] **Step 4: Regenerate database.types.ts**

Run:
```bash
npx supabase gen types typescript --project-id ojyonxplpmhvcgaycznc > src/lib/database.types.ts
```
If the user prefers to do this manually, ask them to run it and confirm. Verify `samples.Row` now contains `contract_id: string | null`.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/20260510000000_add_contract_id_to_samples.sql src/lib/database.types.ts
git commit -m "feat(db): add samples.contract_id FK to contracts"
```

---

## Task 2: FormData Type Additions

**Files:**
- Modify: `src/components/samples/intake/types.ts`

- [ ] **Step 1: Add `SelectedContract` type and two `FormData` fields**

Insert after the existing `Roaster` type alias near the top of the file:

```ts
export interface SelectedContract {
  id: string
  contract_number: string
  seller_name: string | null
  buyer_name: string | null
  shipper_name: string | null
  end_buyer_name: string | null
  crop: string | null
  volume_bags: number | null
  bag_type: string | null
  shipment_period_start: string | null
  quality_description: string | null
}
```

Add the two fields to the `FormData` interface (after the `contracts: SubContractFormData[]` line):

```ts
  // Contract Search (Step 1)
  selected_contract: SelectedContract | null
  contract_prefilled_fields: string[]  // keys of FormData that were prefilled; cleared per-key on user edit
```

- [ ] **Step 2: Lint-check**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -50
```
Expected: no new errors at `types.ts`. The form file will error later (we fix it in Task 7) — that's OK for this commit only if no other consumers fail. If other consumers fail, defer the commit until Task 7.

- [ ] **Step 3: Update `initialFormData` in `sample-intake-form.tsx`**

In `src/components/samples/sample-intake-form.tsx`, find `initialFormData` (around line 55) and append before the closing brace:

```ts
  // Contract Search
  selected_contract: null,
  contract_prefilled_fields: [],
```

- [ ] **Step 4: Verify lint**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "error TS" | head -20
```
Expected: no `types.ts` or `sample-intake-form.tsx` errors related to `selected_contract` or `contract_prefilled_fields`.

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/intake/types.ts src/components/samples/sample-intake-form.tsx
git commit -m "feat(intake): add selected_contract + contract_prefilled_fields to FormData"
```

---

## Task 3: Update STEPS Constant

**Files:**
- Modify: `src/components/samples/intake/constants.ts`

- [ ] **Step 1: Prepend Contract Search step**

Replace the `STEPS` array (lines 3–9 of `constants.ts`):

```ts
export const STEPS: Step[] = [
  { id: 1, name: 'Contract search', description: 'Find an existing contract or skip to enter manually' },
  { id: 2, name: 'Supply chain and contract references', description: '' },
  { id: 3, name: 'Quality, micro-origins, post harvest processes and certificates', description: '' },
  { id: 4, name: 'Quantity and shipment', description: '' },
  { id: 5, name: 'Sample photo and review', description: '' },
  { id: 6, name: 'Sub-contracts', description: '' }
]
```

- [ ] **Step 2: Update step bounds in `sample-intake-form.tsx`**

In `validateStep`, shift every existing `case`:
- `case 1` (was Supply Chain) → `case 2`
- `case 2` (was Quality) → `case 3`
- `case 3` (was Quantity) → `case 4`
- `case 4` (was Review/Details) → `case 5`
- `case 5` (was Sub-Contracts) → `case 6`

And add a new `case 1` at the top:
```ts
case 1:
  // Step 1: Contract Search — always valid; selection is optional, skip is always allowed
  return true
```

In `handleNext`:
```ts
setCurrentStep(prev => Math.min(prev + 1, 6))
```

In `handleSubmit`'s leading guard, change `validateStep(4)` → `validateStep(5)` (final-required step is now Sample Details at index 5).

In `handleGoToContracts`, change `if (validateStep(4))` → `if (validateStep(5))` and `setCurrentStep(5)` → `setCurrentStep(6)`.

In the button block:
- `{currentStep < 4 && ...}` → `{currentStep < 5 && ...}`
- `{currentStep === 4 && ...}` → `{currentStep === 5 && ...}`
- `{currentStep === 5 && ...}` → `{currentStep === 6 && ...}`

And in the step-content conditionals:
- `{currentStep === 1 && <SupplyChainStep ... />}` → `{currentStep === 2 && <SupplyChainStep ... />}`
- `{currentStep === 2 && <QualityStep ... />}` → `{currentStep === 3 && <QualityStep ... />}`
- `{currentStep === 3 && <QuantityStep ... />}` → `{currentStep === 4 && <QuantityStep ... />}`
- `{currentStep === 4 && <SampleDetailsStep ... />}` → `{currentStep === 5 && <SampleDetailsStep ... />}`
- `{currentStep === 5 && <ContractsStep ... />}` → `{currentStep === 6 && <ContractsStep ... />}`

(Step 1 — `<ContractSearchStep />` — is added in Task 7.)

- [ ] **Step 3: Run dev server smoke**

```bash
npm run dev
```
Visit `/samples/new` (or wherever sample intake is opened). Expect: the step-progress bar now shows **6** segments. Clicking "Next" with no Step 1 implemented yet will still advance because `validateStep(1)` returns true. Step 2 should render the existing Supply Chain form.

If the route loads and the bar shows 6 segments, stop the dev server with Ctrl-C and continue.

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/intake/constants.ts src/components/samples/sample-intake-form.tsx
git commit -m "feat(intake): renumber steps to make room for Contract Search at index 1"
```

---

## Task 4: Pure Helpers (`contract-intake-mapping.ts`)

**Files:**
- Create: `src/lib/contract-intake-mapping.ts`

- [ ] **Step 1: Write the helpers**

```ts
// src/lib/contract-intake-mapping.ts
//
// Pure helpers used by the Contract Search step + /api/contracts/[id] endpoint
// to translate a public.contracts row + joined companies into prefill values
// for the sample intake form.

import type { FormData, SelectedContract } from '@/components/samples/intake/types'

export interface ContractCompany {
  id: string
  fantasy_name: string | null
  name: string | null
}

export interface ContractWithParties {
  id: string
  contract_number: string
  status: string
  contract_date: string | null
  crop: string | null
  volume_bags: number
  bag_type: string | null
  bag_weight_kg: number | string | null
  quality_description: string | null
  shipment_period_start: string | null
  shipment_period_end: string | null
  seller_reference: string | null
  buyer_reference: string | null
  certifications: unknown
  seller_id: string | null
  buyer_id: string
  shipper_id: string | null
  end_buyer_id: string | null
  seller: ContractCompany | null
  buyer: ContractCompany | null
  shipper: ContractCompany | null
  end_buyer: ContractCompany | null
}

export interface ContractResolution {
  resolved_client_id: string | null         // clients.id where company_id = contract.buyer_id
  importer_is_qc_client: boolean            // mirrors resolved client's is_qc_client
  resolved_importer_id: string | null       // importers.id matching buyer fantasy_name
  candidate_seller_exporter_ids: string[]   // exporters whose name matches the seller
  candidate_shipper_exporter_ids: string[]  // exporters whose name matches the shipper
  multiple_seller_matches: boolean
  multiple_shipper_matches: boolean
}

/**
 * Map a `contracts.bag_type` string ("60kg Jute", "Bulk", "PP Bag", "Big Bag")
 * to the FormData bag_type enum used by the intake form.
 */
export function parseBagType(input: string | null | undefined): FormData['bag_type'] {
  if (!input) return ''
  const v = input.toLowerCase()
  if (v.includes('jute')) return 'jute_bag'
  if (v.includes('pp')) return 'pp_bag'
  if (v.includes('big')) return 'big_bag'
  if (v.includes('bulk')) return 'bulk'
  return ''
}

/**
 * Pick the display name for a company: fantasy_name first, fall back to name.
 */
export function companyDisplayName(c: ContractCompany | null | undefined): string {
  if (!c) return ''
  return c.fantasy_name?.trim() || c.name?.trim() || ''
}

/**
 * Build a SelectedContract from a fully joined contract row. Used by the badge.
 */
export function toSelectedContract(c: ContractWithParties): SelectedContract {
  return {
    id: c.id,
    contract_number: c.contract_number,
    seller_name: companyDisplayName(c.seller) || null,
    buyer_name: companyDisplayName(c.buyer) || null,
    shipper_name: companyDisplayName(c.shipper) || null,
    end_buyer_name: companyDisplayName(c.end_buyer) || null,
    crop: c.crop,
    volume_bags: c.volume_bags ?? null,
    bag_type: c.bag_type,
    shipment_period_start: c.shipment_period_start,
    quality_description: c.quality_description,
  }
}

/**
 * Build a partial FormData patch from a contract. Caller merges this onto existing
 * form state and tracks which keys were filled via the `prefilled` array.
 *
 * Bulk contracts intentionally skip bag_count / bags_quantity_mt — the user
 * enters the per-container value manually.
 */
export function mapContractToFormData(
  c: ContractWithParties,
  resolution: ContractResolution
): { patch: Partial<FormData>; prefilled: string[] } {
  const patch: Partial<FormData> = {}
  const prefilled: string[] = []

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    patch[key] = value
    prefilled.push(key)
  }

  // Contract reference numbers
  set('wolthers_contract_nr', c.contract_number)
  if (c.seller_reference) set('seller_contract_nr', c.seller_reference)
  if (c.buyer_reference) set('importer_contract_nr', c.buyer_reference)

  // Seller / shipper
  const sellerName = companyDisplayName(c.seller)
  if (sellerName) set('seller', sellerName)

  const sameSellerShipper = !c.shipper_id || c.shipper_id === c.seller_id
  set('same_seller_shipper', sameSellerShipper)
  if (!sameSellerShipper) {
    const shipperName = companyDisplayName(c.shipper)
    if (shipperName) set('shipper', shipperName)
  }

  // Importer (buyer)
  const buyerName = companyDisplayName(c.buyer)
  if (buyerName) set('importer', buyerName)
  set('importer_is_qc_client', resolution.importer_is_qc_client)
  if (resolution.resolved_client_id) {
    set('client_id', resolution.resolved_client_id)
  }

  // End client
  const endBuyerName = companyDisplayName(c.end_buyer)
  if (endBuyerName) set('end_client', endBuyerName)

  // Quality
  if (c.quality_description) set('quality_name', c.quality_description)

  // Crop
  if (c.crop) set('crop_year', c.crop)

  // Quantity — skip bag_count / bags_quantity_mt for bulk
  const parsedBagType = parseBagType(c.bag_type)
  if (parsedBagType) set('bag_type', parsedBagType)
  if (c.bag_weight_kg != null) set('bag_weight_kg', String(c.bag_weight_kg))

  const isBulk = parsedBagType === 'bulk'
  if (!isBulk && c.volume_bags != null) {
    set('bag_count', String(c.volume_bags))
  }

  // Shipment month — YYYY-MM from shipment_period_start
  if (c.shipment_period_start) {
    set('shipment_month', c.shipment_period_start.slice(0, 7))
  }

  // Certifications — pass through known values only
  const knownCerts = ['Rainforest Alliance', 'Fair Trade', 'FLO Fair Trade', 'Organic', 'EUDR']
  const certMap: Record<string, string> = {
    eudr: 'EUDR',
    rfa: 'Rainforest Alliance',
    fairtrade: 'Fair Trade',
    flo: 'FLO Fair Trade',
    organic: 'Organic',
  }
  if (Array.isArray(c.certifications)) {
    const mapped = (c.certifications as unknown[])
      .filter((x): x is string => typeof x === 'string')
      .map(s => certMap[s.toLowerCase()] ?? s)
      .filter(s => knownCerts.includes(s))
    if (mapped.length > 0) set('certifications', mapped)
  }

  return { patch, prefilled }
}
```

- [ ] **Step 2: Verify with a one-off Node script**

Create a temporary verification script at the repo root:
```bash
cat > /tmp/verify-mapping.mjs <<'EOF'
import { parseBagType, mapContractToFormData, toSelectedContract } from './src/lib/contract-intake-mapping.ts'

// parseBagType cases
const cases = [
  ['60kg Jute', 'jute_bag'],
  ['Bulk', 'bulk'],
  ['PP Bag', 'pp_bag'],
  ['Big Bag', 'big_bag'],
  ['', ''],
  [null, ''],
  [undefined, ''],
]
for (const [input, want] of cases) {
  const got = parseBagType(input)
  console.assert(got === want, `parseBagType(${JSON.stringify(input)}) = ${got}, want ${want}`)
}

// mapContractToFormData — non-bulk contract
const nonBulk = {
  id: 'c1', contract_number: '41966/26', status: 'active', contract_date: '2026-05-07',
  crop: '26/27', volume_bags: 320, bag_type: '60kg Jute', bag_weight_kg: 60,
  quality_description: 'Fancy Gourmet 17/18 FC', shipment_period_start: '2027-02-01',
  shipment_period_end: '2027-02-28', seller_reference: null, buyer_reference: null,
  certifications: ['eudr'], seller_id: 's1', buyer_id: 'b1', shipper_id: null, end_buyer_id: null,
  seller: { id: 's1', fantasy_name: 'Nucoffee', name: 'Syngenta AVC SA' },
  buyer: { id: 'b1', fantasy_name: 'Rucquoy', name: 'Rucquoy Frères N.V.' },
  shipper: null, end_buyer: null,
}
const res = mapContractToFormData(nonBulk, {
  resolved_client_id: 'client-1', importer_is_qc_client: true, resolved_importer_id: null,
  candidate_seller_exporter_ids: ['exp-1'], candidate_shipper_exporter_ids: [],
  multiple_seller_matches: false, multiple_shipper_matches: false,
})
console.assert(res.patch.bag_count === '320', 'non-bulk should prefill bag_count')
console.assert(res.patch.bag_type === 'jute_bag', 'bag_type → jute_bag')
console.assert(res.patch.shipment_month === '2027-02', 'shipment_month from start date')
console.assert(res.patch.same_seller_shipper === true, 'no shipper → same_seller_shipper true')
console.assert(res.patch.certifications?.[0] === 'EUDR', 'eudr → EUDR')

// Bulk contract — bag_count must NOT be prefilled
const bulk = { ...nonBulk, bag_type: 'Bulk', volume_bags: 2160 }
const resBulk = mapContractToFormData(bulk, {
  resolved_client_id: null, importer_is_qc_client: false, resolved_importer_id: null,
  candidate_seller_exporter_ids: [], candidate_shipper_exporter_ids: [],
  multiple_seller_matches: false, multiple_shipper_matches: false,
})
console.assert(resBulk.patch.bag_count === undefined, 'bulk should NOT prefill bag_count')
console.assert(resBulk.patch.bag_type === 'bulk', 'bag_type → bulk')

console.log('All assertions passed.')
EOF
npx tsx /tmp/verify-mapping.mjs
```
Expected output: `All assertions passed.`

If `tsx` is not installed, run with `node --experimental-strip-types` or `npx --yes tsx`.

- [ ] **Step 3: Clean up verification script**

```bash
rm /tmp/verify-mapping.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/contract-intake-mapping.ts
git commit -m "feat(intake): add contract→FormData pure mapping helpers"
```

---

## Task 5: Search API Route

**Files:**
- Create: `src/app/api/contracts/search/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/contracts/search/route.ts
//
// GET /api/contracts/search?q=<query>&limit=20
// Typeahead for the Contract Search step in sample intake.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    if (q.length < 2) {
      return NextResponse.json({ contracts: [] })
    }

    // Match against contract_number OR seller_reference OR buyer_reference so the user
    // can paste any of the three reference numbers shown on paperwork.
    const pattern = `%${q}%`
    const { data: contracts, error } = await (supabase as any)
      .from('contracts')
      .select(`
        id,
        contract_number,
        seller_reference,
        buyer_reference,
        contract_date,
        crop,
        volume_bags,
        bag_type,
        quality_description,
        shipment_period_start,
        seller:companies!contracts_seller_id_fkey(id, fantasy_name, name),
        buyer:companies!contracts_buyer_id_fkey(id, fantasy_name, name)
      `)
      .eq('status', 'active')
      .or(`contract_number.ilike.${pattern},seller_reference.ilike.${pattern},buyer_reference.ilike.${pattern}`)
      .order('contract_date', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      console.error('[contracts/search] query error:', error)
      return NextResponse.json({ error: 'Failed to search contracts' }, { status: 500 })
    }

    const ids: string[] = (contracts || []).map((c: any) => c.id)
    let sampleCounts: Record<string, number> = {}

    if (ids.length > 0) {
      const { data: samples, error: countErr } = await (supabase as any)
        .from('samples')
        .select('contract_id')
        .in('contract_id', ids)

      if (countErr) {
        console.warn('[contracts/search] sample-count query error (non-fatal):', countErr)
      } else {
        for (const row of samples || []) {
          if (!row.contract_id) continue
          sampleCounts[row.contract_id] = (sampleCounts[row.contract_id] || 0) + 1
        }
      }
    }

    const annotated = (contracts || []).map((c: any) => ({
      ...c,
      sample_count: sampleCounts[c.id] || 0,
    }))

    return NextResponse.json({ contracts: annotated })
  } catch (err: any) {
    console.error('[contracts/search] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Manual smoke test via curl**

Start the dev server (`npm run dev`). In a logged-in browser session, open DevTools → Application → Cookies and grab the supabase session cookie. Or simpler, hit the endpoint from the same browser session:

Open in browser (while logged in):
```
http://localhost:3000/api/contracts/search?q=41966
```
Expected JSON:
```json
{
  "contracts": [
    {
      "id": "c194398b-6452-4802-b753-416f7751c2f1",
      "contract_number": "41966/26",
      "seller_reference": null,
      "buyer_reference": null,
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

Test the empty-query guard:
```
http://localhost:3000/api/contracts/search?q=
```
Expected: `{ "contracts": [] }`.

Test the 1-char guard:
```
http://localhost:3000/api/contracts/search?q=4
```
Expected: `{ "contracts": [] }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/contracts/search/route.ts
git commit -m "feat(api): add GET /api/contracts/search for intake typeahead"
```

---

## Task 6: Contract Detail + Resolution API Route

**Files:**
- Create: `src/app/api/contracts/[id]/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/contracts/[id]/route.ts
//
// GET /api/contracts/:id
// Returns a full contract joined to companies + entity-resolution payload
// (which WAQC client/importer/exporters match the contract's seller/buyer).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { ContractWithParties, ContractResolution } from '@/lib/contract-intake-mapping'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid contract id' }, { status: 400 })
    }

    const { data: contract, error } = await (supabase as any)
      .from('contracts')
      .select(`
        id, contract_number, status, contract_date, crop,
        volume_bags, bag_type, bag_weight_kg,
        quality_description, shipment_period_start, shipment_period_end,
        seller_reference, buyer_reference, certifications,
        seller_id, buyer_id, shipper_id, end_buyer_id,
        seller:companies!contracts_seller_id_fkey(id, fantasy_name, name),
        buyer:companies!contracts_buyer_id_fkey(id, fantasy_name, name),
        shipper:companies!contracts_shipper_id_fkey(id, fantasy_name, name),
        end_buyer:companies!contracts_end_buyer_id_fkey(id, fantasy_name, name)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('[contracts/[id]] query error:', error)
      return NextResponse.json({ error: 'Failed to load contract' }, { status: 500 })
    }
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    const c = contract as ContractWithParties

    // Buyer / end-client → WAQC clients via clients.company_id FK
    let resolved_client_id: string | null = null
    let importer_is_qc_client = false
    if (c.buyer_id) {
      const { data: clientRow } = await (supabase as any)
        .from('clients')
        .select('id, is_qc_client')
        .eq('company_id', c.buyer_id)
        .order('is_qc_client', { ascending: false })  // prefer is_qc_client=true if multiple
        .limit(1)
        .maybeSingle()
      if (clientRow) {
        resolved_client_id = clientRow.id
        importer_is_qc_client = !!clientRow.is_qc_client
      }
    }

    // Buyer fantasy_name → WAQC importers table (name-based)
    let resolved_importer_id: string | null = null
    const buyerName = c.buyer?.fantasy_name || c.buyer?.name
    if (buyerName) {
      const { data: importerRow } = await (supabase as any)
        .from('importers')
        .select('id')
        .ilike('name', `%${buyerName}%`)
        .limit(1)
        .maybeSingle()
      if (importerRow) resolved_importer_id = importerRow.id
    }

    // Seller / shipper → WAQC exporters (name-based; can return multiple)
    const lookupExporters = async (name: string | null | undefined): Promise<string[]> => {
      if (!name) return []
      const { data } = await (supabase as any)
        .from('exporters')
        .select('id')
        .ilike('name', name)
        .limit(5)
      return (data || []).map((r: any) => r.id)
    }
    const sellerName = c.seller?.fantasy_name || c.seller?.name
    const shipperName = c.shipper?.fantasy_name || c.shipper?.name
    const sameAsSeller = !c.shipper_id || c.shipper_id === c.seller_id

    const candidate_seller_exporter_ids = await lookupExporters(sellerName)
    const candidate_shipper_exporter_ids = sameAsSeller ? [] : await lookupExporters(shipperName)

    const resolution: ContractResolution = {
      resolved_client_id,
      importer_is_qc_client,
      resolved_importer_id,
      candidate_seller_exporter_ids,
      candidate_shipper_exporter_ids,
      multiple_seller_matches: candidate_seller_exporter_ids.length > 1,
      multiple_shipper_matches: candidate_shipper_exporter_ids.length > 1,
    }

    return NextResponse.json({ contract: c, resolution })
  } catch (err: any) {
    console.error('[contracts/[id]] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Smoke test in browser**

While logged into the dev server, visit:
```
http://localhost:3000/api/contracts/c194398b-6452-4802-b753-416f7751c2f1
```
Expected JSON shape:
```json
{
  "contract": {
    "id": "c194398b-6452-4802-b753-416f7751c2f1",
    "contract_number": "41966/26",
    "seller":  { "fantasy_name": "Nucoffee", ... },
    "buyer":   { "fantasy_name": "Rucquoy", ... },
    "shipper": null,
    ...
  },
  "resolution": {
    "resolved_client_id": "...",  // or null if no clients row links to Rucquoy's company_id
    "importer_is_qc_client": true,
    "resolved_importer_id": null,
    "candidate_seller_exporter_ids": ["d9615db3-3704-42f2-a28e-f64f74532c98", "8e8c496f-..."],
    "candidate_shipper_exporter_ids": [],
    "multiple_seller_matches": true,
    "multiple_shipper_matches": false
  }
}
```

Verify a 404 path:
```
http://localhost:3000/api/contracts/00000000-0000-0000-0000-000000000000
```
Expected: `{ "error": "Contract not found" }` with HTTP 404.

Verify a 400 path:
```
http://localhost:3000/api/contracts/not-a-uuid
```
Expected: `{ "error": "Invalid contract id" }` with HTTP 400.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/contracts/\[id\]/route.ts
git commit -m "feat(api): add GET /api/contracts/[id] with entity resolution"
```

---

## Task 7: ContractSearchStep Component

**Files:**
- Create: `src/components/samples/intake/contract-search-step.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/samples/intake/contract-search-step.tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  mapContractToFormData,
  toSelectedContract,
  type ContractWithParties,
  type ContractResolution,
} from '@/lib/contract-intake-mapping'
import type { FormData } from './types'

interface SearchResultRow {
  id: string
  contract_number: string
  seller_reference: string | null
  buyer_reference: string | null
  contract_date: string | null
  crop: string | null
  volume_bags: number | null
  bag_type: string | null
  quality_description: string | null
  shipment_period_start: string | null
  seller: { fantasy_name: string | null; name: string | null } | null
  buyer: { fantasy_name: string | null; name: string | null } | null
  sample_count: number
}

// Helper: which reference field matched the user's query (case-insensitive substring)?
function matchedRef(q: string, row: SearchResultRow): { label: string; value: string } | null {
  const needle = q.trim().toLowerCase()
  if (!needle) return null
  if (row.contract_number?.toLowerCase().includes(needle)) return null  // primary — no "via" hint
  if (row.seller_reference?.toLowerCase().includes(needle)) {
    return { label: 'seller ref', value: row.seller_reference }
  }
  if (row.buyer_reference?.toLowerCase().includes(needle)) {
    return { label: 'buyer ref', value: row.buyer_reference }
  }
  return null
}

interface Props {
  formData: FormData
  applyContract: (patch: Partial<FormData>, prefilled: string[]) => void
  unlinkContract: () => void
  onSkip: () => void
}

export function ContractSearchStep({ formData, applyContract, unlinkContract, onSkip }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null) // id being fetched
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      setError(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(query.trim())
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const runSearch = async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/search?q=${encodeURIComponent(q)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Search failed')
      setResults(body.contracts || [])
    } catch (err: any) {
      setError(err.message || 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = async (row: SearchResultRow) => {
    setSelecting(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${row.id}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load contract')
      const contract = body.contract as ContractWithParties
      const resolution = body.resolution as ContractResolution
      const { patch, prefilled } = mapContractToFormData(contract, resolution)
      patch.selected_contract = toSelectedContract(contract)
      applyContract(patch, prefilled)
    } catch (err: any) {
      setError(err.message || 'Failed to load contract')
    } finally {
      setSelecting(null)
    }
  }

  const linked = formData.selected_contract

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Find a contract</h3>
        <p className="text-xs text-muted-foreground">
          Search by contract number to auto-fill the sample details. Skip to enter everything manually.
        </p>
      </div>

      {linked ? (
        <div className="rounded-2xl p-4 bg-[#556b2f]/10 border border-[#556b2f]/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Linked to contract #{linked.contract_number}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {[linked.seller_name, linked.buyer_name].filter(Boolean).join(' → ')}
                {linked.crop ? ` · ${linked.crop}` : ''}
                {linked.volume_bags ? ` · ${linked.volume_bags} bags` : ''}
                {linked.bag_type ? ` · ${linked.bag_type}` : ''}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={unlinkContract}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4 mr-1" />
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type contract number (e.g. 41966)..."
              className="pl-9 rounded-2xl"
              autoFocus
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {query.trim().length >= 2 && !loading && results.length === 0 && !error && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No active contracts match &laquo;{query}&raquo;. Type to refine, or hit <strong>Skip</strong> below.
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {results.map((row) => {
                const sellerName = row.seller?.fantasy_name || row.seller?.name || '—'
                const buyerName = row.buyer?.fantasy_name || row.buyer?.name || '—'
                const refHit = matchedRef(query, row)
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleSelect(row)}
                    disabled={selecting !== null}
                    className="w-full text-left rounded-2xl p-3 bg-card hover:bg-accent border border-border transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">#{row.contract_number}</div>
                      {row.sample_count > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {row.sample_count} sample{row.sample_count > 1 ? 's' : ''} already
                        </div>
                      )}
                      {selecting === row.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {sellerName} → {buyerName}
                      {row.crop ? ` · ${row.crop}` : ''}
                      {row.volume_bags ? ` · ${row.volume_bags} bags` : ''}
                      {row.bag_type ? ` · ${row.bag_type}` : ''}
                    </div>
                    {refHit && (
                      <div className="text-xs text-muted-foreground/80 mt-1 italic">
                        via {refHit.label} «{refHit.value}»
                      </div>
                    )}
                    {row.quality_description && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {row.quality_description}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      <div className="pt-2">
        <Button type="button" variant="outline" onClick={onSkip}>
          Skip — enter manually
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Export from intake index**

In `src/components/samples/intake/index.ts`, add a new line after the existing exports (before the "Legacy exports" comment):

```ts
export * from './contract-search-step'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/samples/intake/contract-search-step.tsx src/components/samples/intake/index.ts
git commit -m "feat(intake): add ContractSearchStep component (typeahead + skip)"
```

---

## Task 8: ContractLinkBadge Component

**Files:**
- Create: `src/components/samples/intake/contract-link-badge.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/samples/intake/contract-link-badge.tsx
'use client'

import { useState } from 'react'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { SelectedContract } from './types'

interface Props {
  contract: SelectedContract
  onUnlink: () => void
}

export function ContractLinkBadge({ contract, onUnlink }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  const summary = [
    contract.seller_name,
    contract.buyer_name,
  ].filter(Boolean).join(' → ')

  const detail = [
    contract.crop,
    contract.volume_bags != null ? `${contract.volume_bags} bags` : null,
    contract.bag_type,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-2xl p-3 bg-[#556b2f]/10 border border-[#556b2f]/30 flex items-start justify-between gap-3 mb-4">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="flex-1 min-w-0 text-left">
            <div className="text-sm font-semibold flex items-center gap-2">
              Linked to contract #{contract.contract_number}
              <Info className="h-3 w-3 opacity-60" />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {summary}
              {detail ? ` · ${detail}` : ''}
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-xs space-y-1">
          <div><span className="text-muted-foreground">Number:</span> #{contract.contract_number}</div>
          {contract.seller_name && <div><span className="text-muted-foreground">Seller:</span> {contract.seller_name}</div>}
          {contract.buyer_name && <div><span className="text-muted-foreground">Buyer:</span> {contract.buyer_name}</div>}
          {contract.shipper_name && <div><span className="text-muted-foreground">Shipper:</span> {contract.shipper_name}</div>}
          {contract.end_buyer_name && <div><span className="text-muted-foreground">End buyer:</span> {contract.end_buyer_name}</div>}
          {contract.quality_description && <div><span className="text-muted-foreground">Quality:</span> {contract.quality_description}</div>}
          {contract.crop && <div><span className="text-muted-foreground">Crop:</span> {contract.crop}</div>}
          {contract.volume_bags != null && <div><span className="text-muted-foreground">Volume:</span> {contract.volume_bags} bags</div>}
          {contract.bag_type && <div><span className="text-muted-foreground">Bag type:</span> {contract.bag_type}</div>}
          {contract.shipment_period_start && <div><span className="text-muted-foreground">Shipment start:</span> {contract.shipment_period_start}</div>}
        </PopoverContent>
      </Popover>

      {!confirmOpen ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          className="flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button type="button" variant="destructive" size="sm" onClick={() => { setConfirmOpen(false); onUnlink() }}>
            Unlink
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify popover dependency exists**

Check that `@/components/ui/popover` is present:
```bash
ls src/components/ui/popover.tsx
```
If missing, the project uses shadcn — install with:
```bash
npx shadcn@latest add popover
```

- [ ] **Step 3: Export from intake index**

In `src/components/samples/intake/index.ts`:
```ts
export * from './contract-link-badge'
```

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/intake/contract-link-badge.tsx src/components/samples/intake/index.ts
git commit -m "feat(intake): add ContractLinkBadge with confirm-unlink"
```

---

## Task 9: EntityResolutionNotice Component

**Files:**
- Create: `src/components/samples/intake/entity-resolution-notice.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/samples/intake/entity-resolution-notice.tsx
'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  message: string
  action?: { label: string; onClick: () => void }
}

export function EntityResolutionNotice({ message, action }: Props) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs p-2 flex items-start gap-2 mt-1">
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div>{message}</div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="underline mt-1 hover:opacity-80"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Export from intake index**

```ts
export * from './entity-resolution-notice'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/samples/intake/entity-resolution-notice.tsx src/components/samples/intake/index.ts
git commit -m "feat(intake): add EntityResolutionNotice for missing/duplicate matches"
```

---

## Task 10: Wire Step 1 into `sample-intake-form.tsx`

**Files:**
- Modify: `src/components/samples/sample-intake-form.tsx`

- [ ] **Step 1: Import the new components and types**

At the top of the file, extend the existing intake-import block:

```ts
import {
  FormData,
  Client,
  Laboratory,
  Exporter,
  Importer,
  Roaster,
  SampleInsert,
  STEPS,
  SupplyChainStep,
  QualityStep,
  QuantityStep,
  SampleDetailsStep,
  ContractsStep,
  ContractSearchStep,
  ContractLinkBadge,
  createEmptyContract,
  SuccessView
} from './intake'
```

- [ ] **Step 2: Add prefill/unlink handlers**

Below the existing `updateFormData` definition, add:

```ts
  // Apply a contract-prefilled patch and remember which keys came from it
  const applyContractPrefill = (patch: Partial<FormData>, prefilled: string[]) => {
    setFormData(prev => {
      const next: FormData = { ...prev, ...patch }
      // Merge prefilled keys with any existing ones, dedupe
      const existing = new Set(prev.contract_prefilled_fields)
      for (const k of prefilled) existing.add(k)
      // selected_contract is always in patch when prefilling
      next.contract_prefilled_fields = Array.from(existing)
      return next
    })
  }

  // Unlink the current contract — clear selected_contract and any prefilled fields
  // that the user has NOT touched (those keys still appear in contract_prefilled_fields).
  const unlinkContract = () => {
    setFormData(prev => {
      const next: FormData = { ...prev }
      const toClear = new Set(prev.contract_prefilled_fields)
      for (const key of toClear) {
        // Reset each cleared key to its initial value
        const initial = (initialFormData as any)[key]
        ;(next as any)[key] = initial
      }
      next.selected_contract = null
      next.contract_prefilled_fields = []
      return next
    })
  }
```

- [ ] **Step 3: Modify `updateFormData` to strip prefilled keys on user edit**

Replace the existing `updateFormData` with:

```ts
  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => {
      const next: FormData = { ...prev, [field]: value }
      // If the user edits a prefilled field, remove it from the tracking set
      if (prev.contract_prefilled_fields.includes(field as string)) {
        next.contract_prefilled_fields = prev.contract_prefilled_fields.filter(k => k !== field)
      }
      return next
    })
  }
```

- [ ] **Step 4: Render the Step 1 UI in the content block**

Above the existing `{currentStep === 2 && <SupplyChainStep ... />}` block, add:

```tsx
          {currentStep === 1 && (
            <ContractSearchStep
              formData={formData}
              applyContract={applyContractPrefill}
              unlinkContract={unlinkContract}
              onSkip={() => setCurrentStep(2)}
            />
          )}
```

- [ ] **Step 5: Render the badge on steps 2–6**

Wrap the content area's scroll container so the badge sits above the step content but below the error banner. Find the `<div className="flex-1 overflow-y-auto space-y-6 pb-4">` block and add directly above the existing `{currentStep === 1 ...}` (now `currentStep === 2`) block:

```tsx
          {currentStep > 1 && formData.selected_contract && (
            <ContractLinkBadge
              contract={formData.selected_contract}
              onUnlink={unlinkContract}
            />
          )}
```

- [ ] **Step 6: Include `contract_id` on submit**

Find the `sampleData` object inside `handleSubmit` (around line 647). Add this line near the top of the object literal (right under `client_id`):

```ts
        contract_id: formData.selected_contract?.id || undefined,
```

- [ ] **Step 7: Browser smoke**

```bash
npm run dev
```

1. Open sample intake. Step 1 is "Contract search" with a search box and a "Skip" button.
2. Type `4196` → after 300ms debounce, results appear. Pick contract `41966/26`.
3. Form fields prefill (visible if you click Next to Step 2). The Olive badge appears at the top of every subsequent step.
4. Click the badge body → popover with full contract summary.
5. Click ✕ → confirm → "Unlink" → badge disappears, untouched prefilled fields are cleared.
6. Pick the contract again, navigate to Step 2 (Supply Chain), edit the `seller` field to "Test". Go back to Step 1, click ✕ → "Unlink" → seller stays as "Test" (user edit preserved), other fields clear.
7. Skip path: re-load the page, hit "Skip — enter manually" → wizard advances to Step 2 with no prefill, no badge. Old flow works identically.

If all those behaviors check out, stop the dev server.

- [ ] **Step 8: Verify DB write**

After completing a full submit via the contract-search path, in your SQL console:
```sql
SELECT id, tracking_number, contract_id FROM samples ORDER BY created_at DESC LIMIT 1;
```
Expected: the newly created sample has `contract_id = 'c194398b-6452-4802-b753-416f7751c2f1'`.

- [ ] **Step 9: Commit**

```bash
git add src/components/samples/sample-intake-form.tsx
git commit -m "feat(intake): wire Contract Search step, badge, prefill, unlink"
```

---

## Task 11: Surface Resolution Notices in Supply Chain Step

**Files:**
- Modify: `src/components/samples/intake/supply-chain-step.tsx`

This task adds yellow notices next to the seller and importer fields when a contract was selected but the matching WAQC entity was missing or ambiguous.

- [ ] **Step 1: Read the existing component**

```bash
wc -l src/components/samples/intake/supply-chain-step.tsx
```

Open and locate the seller `<Input>` block and the importer `<Input>` block. (Verify by grep:)
```bash
grep -n "seller\|importer" src/components/samples/intake/supply-chain-step.tsx | head -30
```

- [ ] **Step 2: Pass resolution flags from the form**

Extend `ContractSearchStep`'s prefill payload to include resolution flags so the supply-chain step can render notices.

In `src/components/samples/intake/types.ts`, add to `FormData` (alongside the other contract-related fields):

```ts
  contract_resolution: {
    multiple_seller_matches: boolean
    multiple_shipper_matches: boolean
    seller_match_count: number
    shipper_match_count: number
    importer_resolved: boolean
  } | null
```

In `initialFormData` (in `sample-intake-form.tsx`):
```ts
  contract_resolution: null,
```

In `unlinkContract`, ensure `next.contract_resolution = null` is set (alongside `selected_contract = null`).

- [ ] **Step 3: Populate `contract_resolution` in `ContractSearchStep.handleSelect`**

In `src/components/samples/intake/contract-search-step.tsx`, in the `handleSelect` function, just before calling `applyContract`, add:

```ts
      patch.contract_resolution = {
        multiple_seller_matches: resolution.multiple_seller_matches,
        multiple_shipper_matches: resolution.multiple_shipper_matches,
        seller_match_count: resolution.candidate_seller_exporter_ids.length,
        shipper_match_count: resolution.candidate_shipper_exporter_ids.length,
        importer_resolved: resolution.resolved_client_id !== null || resolution.resolved_importer_id !== null,
      }
```

Also include `'contract_resolution'` in the `prefilled` list passed to `applyContract` so the unlink path clears it:
```ts
      applyContract(patch, [...prefilled, 'contract_resolution'])
```

- [ ] **Step 4: Render the notices in `supply-chain-step.tsx`**

Add the import at the top:
```ts
import { EntityResolutionNotice } from './entity-resolution-notice'
```

Below the seller `<Input>` (find the existing block; it's the `formData.seller` input), add:

```tsx
            {formData.contract_resolution && formData.selected_contract && (
              <>
                {formData.contract_resolution.seller_match_count === 0 && (
                  <EntityResolutionNotice
                    message={`No exporter named "${formData.seller}" found in WAQC. Select an existing exporter or create one.`}
                  />
                )}
                {formData.contract_resolution.multiple_seller_matches && (
                  <EntityResolutionNotice
                    message={`${formData.contract_resolution.seller_match_count} exporters named "${formData.seller}" exist — please verify the selection is correct.`}
                  />
                )}
              </>
            )}
```

Below the importer `<Input>`, add:

```tsx
            {formData.contract_resolution && formData.selected_contract && !formData.contract_resolution.importer_resolved && (
              <EntityResolutionNotice
                message={`No WAQC client or importer is linked to "${formData.importer}". Select an existing one or create new.`}
              />
            )}
```

(If the existing supply-chain step does not use a single `<Input>` for seller/importer but a Combobox, place the notices directly after that component instead — the surrounding pattern is what matters, not the exact element.)

- [ ] **Step 5: Browser smoke**

1. `npm run dev`, open sample intake, pick contract `41966/26`.
2. Navigate to Step 2 (Supply Chain). The seller field reads "Nucoffee".
3. **Expected** (because two exporters named Nucoffee exist in WAQC, per earlier verification): yellow notice `'2 exporters named "Nucoffee" exist — please verify the selection is correct.'`
4. Type something different in the seller field. The notice disappears (because `contract_resolution` is keyed off `selected_contract` AND the user has edited).

   *Note:* The current notice only hides when the user *unlinks*, not on edit. That's intentional — the user might want to keep the warning visible until they've explicitly resolved or unlinked. If you'd rather hide on edit, add a check `formData.contract_prefilled_fields.includes('seller')` in front of the seller notice condition.

- [ ] **Step 6: Commit**

```bash
git add src/components/samples/intake/types.ts \
        src/components/samples/sample-intake-form.tsx \
        src/components/samples/intake/contract-search-step.tsx \
        src/components/samples/intake/supply-chain-step.tsx
git commit -m "feat(intake): show resolution notices when contract entities don't map cleanly"
```

---

## Task 12: End-to-End Smoke + Polish

**Files:** none (verification only)

- [ ] **Step 1: Full flow against real data**

```bash
npm run dev
```

Walk through the **happy path** end to end:
1. New sample → Step 1 → search "41966" → pick contract.
2. Step 2 (Supply Chain): `seller=Nucoffee`, `same_seller_shipper=true`, `importer=Rucquoy`, `importer_is_qc_client=true`. Yellow notices show only for Nucoffee (duplicate exporter).
3. Step 3 (Quality): `quality_name="Fancy Gourmet 17/18 FC"`, `crop_year="26/27"`. `quality_spec_id` is blank — pick one. `origin` is blank — pick "Brazil" (or whatever the actual origin is).
4. Step 4 (Quantity): `bag_count=320`, `bag_weight_kg=60`, `bag_type=jute_bag`, `shipment_month=2027-02`. Auto-calc fields compute.
5. Step 5 (Sample Details): photo + arrival date.
6. Click "Create Sample". Tracking number returned. SuccessView shows.
7. Run:
   ```sql
   SELECT id, tracking_number, contract_id, seller_id, importer_id, wolthers_contract_nr
   FROM samples ORDER BY created_at DESC LIMIT 1;
   ```
   Expected: `contract_id` is the picked UUID, `wolthers_contract_nr='41966/26'`, `seller_id` points to a Nucoffee exporter row, `importer_id` and/or `client_id` resolve.

- [ ] **Step 2: Edit-then-unlink flow**

1. New sample → pick contract → Step 2 → edit `seller` to "TEST EXPORTER" → return to Step 1.
2. Click ✕ on the linked-contract block → Unlink.
3. Expected: `seller` stays as "TEST EXPORTER" (it was edited, so out of `contract_prefilled_fields`); other prefilled fields like `bag_count`, `quality_name`, `crop_year` clear back to empty.

- [ ] **Step 3: Skip path regression**

1. New sample → click "Skip — enter manually" without searching.
2. Walk through Steps 2–5 entirely manually as in the pre-feature flow.
3. Submit.
4. Run:
   ```sql
   SELECT id, tracking_number, contract_id FROM samples ORDER BY created_at DESC LIMIT 1;
   ```
   Expected: `contract_id IS NULL`. All other fields populated normally.

- [ ] **Step 4: Empty-state and error UX**

1. Step 1, type `zzzzzzzz` → "No active contracts match «zzzzzzzz»…" appears.
2. Step 1, type `4` (single char) → no search runs, list stays empty.
3. Step 1, with dev server stopped, type `4196` → after debounce, an inline error appears instead of crashing.

- [ ] **Step 5: localStorage persistence**

1. New sample → pick contract → fill a couple of fields manually in Step 2 → close tab.
2. Reopen sample intake.
3. Expected: form restores. `selected_contract` is preserved (badge visible). `contract_prefilled_fields` are preserved (so untouched prefilled fields will still clear on unlink). User-edited fields preserved.

If anything in Steps 1–5 fails, fix and re-verify before continuing.

- [ ] **Step 6: Final commit (if any fixes)**

If you made changes in Step 5 fixes, commit them with a descriptive message such as:
```bash
git commit -am "fix(intake): <specific fix>"
```

If no changes were made, skip this step.

---

## Self-Review Checklist

Run through this once after all tasks are complete:

- **Spec coverage:**
  - [x] New Step 0 with typeahead → Task 7
  - [x] `samples.contract_id` FK → Task 1
  - [x] `sample_contracts.contract_id` FK → Task 1
  - [x] Persistent badge on Steps 2–6 → Task 8 + Task 10 Step 5
  - [x] Confirm dialog on unlink → Task 8
  - [x] Edit-aware unlink (only clear untouched prefilled fields) → Task 10 Steps 2–3
  - [x] Field mapping table → Task 4
  - [x] Bulk contracts skip `bag_count` → Task 4
  - [x] Buyer FK resolution + name fallback → Task 6
  - [x] Seller/shipper name-based candidates + multi-match flag → Task 6
  - [x] Yellow `EntityResolutionNotice` → Task 9 + Task 11
  - [x] Search filter `status='active'` → Task 5
  - [x] Sample-count annotation → Task 5
  - [x] Skip preserves today's flow → Task 7 + Task 12 Step 3
- **No placeholders:** every step has actual code or an exact command.
- **Type consistency:** `applyContract(patch, prefilled)` signature consistent across Task 7 + Task 10. `EntityResolutionNotice` props consistent across Task 9 + Task 11. `ContractWithParties` / `ContractResolution` types defined once in Task 4 and re-imported elsewhere.
