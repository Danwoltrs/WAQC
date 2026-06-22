# SS → PSS Link & Full Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When creating a Shipment Sample (SS), let the user pick its approved Pre-Shipment Sample (PSS) as the first step, auto-fill every shared contract/quality/quantity field from it, and persist the SS→PSS link in the database.

**Architecture:** A pure mapper (`mapPssToFormData`) turns a flattened PSS sample into a form patch (mirroring the existing `mapContractToFormData`). The intake form's Step 1 becomes adaptive for QC samples: a sample-type selector at the top, then either a searchable PSS picker (SS) or the existing contract search (PSS/Type). The picker reuses the form's existing `applyContractPrefill` prefill-tracking machinery. A nullable self-referential FK `samples.linked_pss_sample_id` persists the link; the sample detail modal surfaces it.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + PostgREST), Tailwind, shadcn/ui, Vitest.

## Global Constraints

- Keep files under ~2000 lines (up to ~2200 acceptable); flag if a file would exceed this.
- WAQC migrations live in `database/migrations/` (NOT `supabase/migrations/`). The user applies all migrations manually — provide SQL, do not run it.
- No emojis in UI. No mock data.
- Counterparties are rows in `companies`; there is no `clients`/`exporters`/`importers`/`roasters` table.
- Deploy order: the migration (Task 1) MUST be applied before the GET self-join embed in Task 3 is deployed, or the samples query 404s.
- `equivalent_60kg_bags` displays as an integer.

---

## File Structure

- `database/migrations/20260622000001_samples_linked_pss_sample_id.sql` — **new**: column + FK + index.
- `src/lib/pss-intake-mapping.ts` — **new**: pure `mapPssToFormData` mapper.
- `src/lib/pss-intake-mapping.test.ts` — **new**: mapper unit tests.
- `src/components/samples/intake/pss-link-step.tsx` — **new**: Step-1 PSS picker + summary card + warning.
- `src/components/samples/intake/index.ts` — **modify**: export the new step.
- `src/components/samples/sample-intake-form.tsx` — **modify**: adaptive Step 1, prefill handlers, fetch limit, submit payload.
- `src/components/samples/intake/supply-chain-step.tsx` — **modify**: remove the old in-step PSS dropdown + `handlePSSSelection`.
- `src/components/samples/intake/sample-details-step.tsx` — **modify**: review-step "no PSS linked" warning.
- `src/app/api/samples/route.ts` — **modify**: persist `linked_pss_sample_id` on POST; embed linked PSS tracking # on GET.
- `src/components/samples/sample-detail-modal.tsx` — **modify**: display "Linked PSS".

---

## Task 1: Database migration — `linked_pss_sample_id`

**Files:**
- Create: `database/migrations/20260622000001_samples_linked_pss_sample_id.sql`

**Interfaces:**
- Produces: column `samples.linked_pss_sample_id uuid NULL`, FK constraint named `samples_linked_pss_sample_id_fkey` referencing `samples(id)`, index `idx_samples_linked_pss_sample_id`. Task 3's PostgREST embed relies on the exact constraint name.

- [ ] **Step 1: Write the migration SQL**

Create `database/migrations/20260622000001_samples_linked_pss_sample_id.sql`:

```sql
-- Link a Shipment Sample (SS) to its approved Pre-Shipment Sample (PSS).
-- Nullable + ON DELETE SET NULL: the link is informational; deleting a PSS must
-- not cascade-delete its SS. Self-referential FK on samples.
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS linked_pss_sample_id uuid NULL;

ALTER TABLE public.samples
  DROP CONSTRAINT IF EXISTS samples_linked_pss_sample_id_fkey;

ALTER TABLE public.samples
  ADD CONSTRAINT samples_linked_pss_sample_id_fkey
  FOREIGN KEY (linked_pss_sample_id)
  REFERENCES public.samples(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_linked_pss_sample_id
  ON public.samples (linked_pss_sample_id);

COMMENT ON COLUMN public.samples.linked_pss_sample_id IS
  'For SS samples: the approved PSS this shipment sample was prefilled from. Informational lineage link.';
```

- [ ] **Step 2: Hand the SQL to the user to apply**

Tell the user: "Migration `20260622000001_samples_linked_pss_sample_id.sql` is ready — please apply it. Task 3's GET embed depends on it." Do NOT run it.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/20260622000001_samples_linked_pss_sample_id.sql
git commit -m "feat(samples): add linked_pss_sample_id FK for SS->PSS lineage"
```

---

## Task 2: Pure mapper `mapPssToFormData` (TDD)

**Files:**
- Create: `src/lib/pss-intake-mapping.ts`
- Test: `src/lib/pss-intake-mapping.test.ts`

**Interfaces:**
- Consumes: `FormData` from `@/components/samples/intake/types`. Input is the flattened PSS object returned by `GET /api/samples` (raw `samples.*` columns plus flattened `seller_name`, `exporter_name`, `importer_name`, `roaster_name`, `qc_client_name`, `end_client_name`). Certifications on a WAQC sample are already stored in WAQC vocabulary — pass through as-is.
- Produces: `mapPssToFormData(pss: any): { patch: Partial<FormData>; prefilled: (keyof FormData)[] }`. Task 5 consumes this and feeds it to `applyContractPrefill`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pss-intake-mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapPssToFormData } from './pss-intake-mapping'

const basePss = {
  id: 'pss-1',
  tracking_number: 'BR-036991/26',
  seller_name: 'Louis Dreyfus Company',
  exporter_name: 'COOXUPE',
  importer_name: 'Acme Importers',
  roaster_name: 'Best Roast',
  qc_client_name: 'Acme Importers',
  end_client_name: "Dunkin'",
  same_seller_shipper: false,
  importer_is_qc_client: true,
  client_id: 'client-1',
  seller_contract_nr: 'S-100',
  shipper_contract_nr: 'SH-100',
  exporter_contract_nr: 'EX-100',
  buyer_contract_nr: 'B-100',
  roaster_contract_nr: 'R-100',
  qc_client_contract_nr: 'QC-100',
  end_client_contract_nr: 'EC-100',
  wolthers_contract_nr: '41966',
  exporter_sample_number: 'EXP-77',
  ico_number: '123456789',
  container_nr: null,
  quality_spec_id: 'spec-1',
  quality_name: 'Fine Cup NY2/3',
  origin: 'Brazil',
  micro_origin: 'Sul de Minas',
  processing_method: 'Natural',
  certifications: ['Rainforest Alliance', 'Organic'],
  crop_year: '25/26',
  bag_type: 'jute_bag',
  bag_weight_kg: 60,
  bag_count: 320,
  bags_quantity_mt: 19.2,
  equivalent_60kg_bags: 320,
  shipment_month: '2026-07',
}

describe('mapPssToFormData', () => {
  it('maps the full shared field set onto the SS form', () => {
    const { patch } = mapPssToFormData(basePss)
    expect(patch.seller).toBe('Louis Dreyfus Company')
    expect(patch.importer).toBe('Acme Importers')
    expect(patch.end_client).toBe("Dunkin'")
    expect(patch.roaster).toBe('Best Roast')
    expect(patch.seller_contract_nr).toBe('S-100')
    expect(patch.importer_contract_nr).toBe('B-100') // buyer_contract_nr -> importer_contract_nr
    expect(patch.wolthers_contract_nr).toBe('41966')
    expect(patch.quality_spec_id).toBe('spec-1')
    expect(patch.quality_name).toBe('Fine Cup NY2/3')
    expect(patch.origin).toBe('Brazil')
    expect(patch.certifications).toEqual(['Rainforest Alliance', 'Organic'])
    expect(patch.crop_year).toBe('25/26')
    expect(patch.bag_type).toBe('jute_bag')
    expect(patch.bag_count).toBe('320')
    expect(patch.bag_weight_kg).toBe('60')
  })

  it('sets a distinct shipper when same_seller_shipper is false', () => {
    const { patch } = mapPssToFormData(basePss)
    expect(patch.same_seller_shipper).toBe(false)
    expect(patch.shipper).toBe('COOXUPE')
  })

  it('omits shipper and uses =shipper when same_seller_shipper is true', () => {
    const { patch } = mapPssToFormData({ ...basePss, same_seller_shipper: true })
    expect(patch.same_seller_shipper).toBe(true)
    expect(patch.shipper).toBeUndefined()
  })

  it('sets qc_client only when importer is not the QC client', () => {
    const noQc = mapPssToFormData(basePss)
    expect(noQc.patch.qc_client).toBeUndefined()
    const withQc = mapPssToFormData({ ...basePss, importer_is_qc_client: false, qc_client_name: 'Separate QC' })
    expect(withQc.patch.importer_is_qc_client).toBe(false)
    expect(withQc.patch.qc_client).toBe('Separate QC')
  })

  it('skips bag_count for bulk', () => {
    const { patch } = mapPssToFormData({ ...basePss, bag_type: 'bulk' })
    expect(patch.bag_type).toBe('bulk')
    expect(patch.bag_count).toBeUndefined()
  })

  it('does not list empty/missing fields as prefilled', () => {
    const sparse = { id: 'x', tracking_number: 'T', origin: 'Peru' }
    const { patch, prefilled } = mapPssToFormData(sparse)
    expect(patch.origin).toBe('Peru')
    expect(prefilled).toContain('origin')
    expect(prefilled).not.toContain('seller')
    expect(prefilled).not.toContain('ico_number')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pss-intake-mapping.test.ts`
Expected: FAIL — `mapPssToFormData` is not exported / module not found.

- [ ] **Step 3: Write the mapper**

Create `src/lib/pss-intake-mapping.ts`:

```ts
import type { FormData } from '@/components/samples/intake/types'

// A linked PSS prefills an SS with every shared contract/quality/quantity field.
// Input is the flattened sample shape returned by GET /api/samples (raw samples.*
// columns + flattened *_name entity labels). Unlike contracts (which store short
// cert codes), a WAQC sample's certifications are already in WAQC vocabulary, so
// they pass through unchanged.
export function mapPssToFormData(
  pss: any
): { patch: Partial<FormData>; prefilled: (keyof FormData)[] } {
  const patch: Partial<FormData> = {}
  const prefilled: (keyof FormData)[] = []

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    patch[key] = value
    prefilled.push(key)
  }
  // String-coercing setter that skips null/undefined/empty so they don't count as prefilled.
  const setStr = <K extends keyof FormData>(key: K, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') {
      set(key, String(value) as FormData[K])
    }
  }

  const sameShipper = pss.same_seller_shipper ?? true
  const importerIsQc = pss.importer_is_qc_client ?? true

  // Counterparties (names from the GET's flattened *_name fields)
  setStr('seller', pss.seller_name)
  set('same_seller_shipper', sameShipper)
  if (!sameShipper) setStr('shipper', pss.exporter_name)
  setStr('importer', pss.importer_name)
  set('importer_is_qc_client', importerIsQc)
  if (pss.client_id) setStr('client_id', pss.client_id)
  if (!importerIsQc) setStr('qc_client', pss.qc_client_name)
  setStr('roaster', pss.roaster_name)
  setStr('end_client', pss.end_client_name)

  // Contract references (DB column buyer_contract_nr maps to form importer_contract_nr)
  setStr('seller_contract_nr', pss.seller_contract_nr)
  setStr('shipper_contract_nr', pss.shipper_contract_nr)
  setStr('exporter_contract_nr', pss.exporter_contract_nr)
  setStr('importer_contract_nr', pss.buyer_contract_nr)
  setStr('roaster_contract_nr', pss.roaster_contract_nr)
  setStr('qc_client_contract_nr', pss.qc_client_contract_nr)
  setStr('end_client_contract_nr', pss.end_client_contract_nr)
  setStr('wolthers_contract_nr', pss.wolthers_contract_nr)

  // Identifiers
  setStr('exporter_sample_number', pss.exporter_sample_number)
  setStr('ico_number', pss.ico_number)
  setStr('container_nr', pss.container_nr) // usually blank on a PSS

  // Quality
  setStr('quality_spec_id', pss.quality_spec_id)
  setStr('quality_name', pss.quality_name)
  setStr('origin', pss.origin)
  setStr('micro_origin', pss.micro_origin)
  setStr('processing_method', pss.processing_method)
  if (Array.isArray(pss.certifications) && pss.certifications.length > 0) {
    set(
      'certifications',
      pss.certifications.filter((c: unknown): c is string => typeof c === 'string')
    )
  }
  setStr('crop_year', pss.crop_year)

  // Quantity (editable afterward; bag_count skipped for bulk)
  const bagType = pss.bag_type as FormData['bag_type']
  if (bagType) set('bag_type', bagType)
  setStr('bag_weight_kg', pss.bag_weight_kg)
  if (bagType !== 'bulk') setStr('bag_count', pss.bag_count)
  setStr('bags_quantity_mt', pss.bags_quantity_mt)
  setStr('equivalent_60kg_bags', pss.equivalent_60kg_bags)
  setStr('shipment_month', pss.shipment_month)

  return { patch, prefilled }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pss-intake-mapping.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pss-intake-mapping.ts src/lib/pss-intake-mapping.test.ts
git commit -m "feat(intake): pure mapPssToFormData mapper for SS<-PSS prefill"
```

---

## Task 3: Persist link on POST + embed linked PSS on GET

**Files:**
- Modify: `src/app/api/samples/route.ts` (POST `sampleData` ~line 411; GET `select` ~line 44)

**Interfaces:**
- Consumes: `body.linked_pss_sample_id` (string UUID, optional) sent by the form (Task 5).
- Produces: persisted `samples.linked_pss_sample_id`; GET rows gain `linked_pss: { id, tracking_number } | null` (consumed by Task 8).

- [ ] **Step 1: Persist on POST**

In `src/app/api/samples/route.ts`, in the `sampleData` object, immediately after the `sample_type: body.sample_type || null,` line, add:

```ts
        linked_pss_sample_id: body.linked_pss_sample_id || null,
```

- [ ] **Step 2: Embed linked PSS on GET**

In the GET `.select(\`...\`)` block, after the `sample_recipients(id, status)` line, add a new embed line (mind the trailing comma on the preceding line):

```ts
        sample_recipients(id, status),
        linked_pss:samples!samples_linked_pss_sample_id_fkey(id, tracking_number)
```

The `transformedSamples` map already spreads `...sample`, so `linked_pss` flows through to each row unchanged. No transform edit needed.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors in `route.ts`).

- [ ] **Step 4: Manual verify against the live DB (migration must be applied first)**

Confirm with the user that Task 1's migration is applied. Then load `/samples` in the running app and confirm the list still loads (no PostgREST 404 from the embed). If it 404s with `Could not find a relationship`, the migration is not applied — stop and tell the user.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/samples/route.ts
git commit -m "feat(samples): persist linked_pss_sample_id on POST, embed linked PSS on GET"
```

---

## Task 4: `PssLinkStep` component

**Files:**
- Create: `src/components/samples/intake/pss-link-step.tsx`
- Modify: `src/components/samples/intake/index.ts`

**Interfaces:**
- Consumes: `FormData` from `./types`; `SearchableSelect` from `@/components/ui/searchable-select`.
- Produces: `export function PssLinkStep(props: { formData: FormData; approvedPSSSamples: any[]; onSelectPss: (id: string) => void; onClearPss: () => void })`. Task 5 renders it and supplies the handlers.

- [ ] **Step 1: Write the component**

Create `src/components/samples/intake/pss-link-step.tsx`:

```tsx
'use client'

import { X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { FormData } from './types'

interface Props {
  formData: FormData
  approvedPSSSamples: any[]
  onSelectPss: (id: string) => void
  onClearPss: () => void
}

export function PssLinkStep({ formData, approvedPSSSamples, onSelectPss, onClearPss }: Props) {
  const selected = approvedPSSSamples.find((s: any) => s.id === formData.linked_pss_sample_id)

  const options = approvedPSSSamples.map((s: any) => ({
    value: s.id,
    label: [s.tracking_number, s.seller_name || s.exporter_name, s.origin]
      .filter(Boolean)
      .join(' · '),
  }))

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold mb-1">Link the approved pre-shipment sample</h3>
        <p className="text-xs text-muted-foreground">
          Every shipment sample references an approved PSS. Pick it to auto-fill the contract,
          quality and quantity details below. You can override any value afterward.
        </p>
      </div>

      {selected ? (
        <div className="rounded-2xl p-4 bg-[#556b2f]/10 border border-[#556b2f]/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Linked PSS #{selected.tracking_number}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {[selected.seller_name || selected.exporter_name, selected.importer_name]
                  .filter(Boolean)
                  .join(' → ')}
                {selected.origin ? ` · ${selected.origin}` : ''}
                {selected.quality_name ? ` · ${selected.quality_name}` : ''}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearPss}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4 mr-1" />
              Unlink
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Fields auto-filled in the next steps. Override anything that differs for the shipment.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Approved PSS</Label>
            <SearchableSelect
              options={options}
              value={formData.linked_pss_sample_id || ''}
              onValueChange={onSelectPss}
              placeholder={
                approvedPSSSamples.length
                  ? 'Search by tracking #, exporter, origin...'
                  : 'No approved PSS samples'
              }
              searchPlaceholder="Search approved PSS..."
              className="h-9"
            />
          </div>
          <div className="rounded-2xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
            No PSS linked yet. Every shipment sample should reference its approved pre-shipment
            sample — link one above, or continue if this is an exception.
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Export from the barrel**

In `src/components/samples/intake/index.ts`, after the `export * from './contract-search-step'` line, add:

```ts
export * from './pss-link-step'
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/intake/pss-link-step.tsx src/components/samples/intake/index.ts
git commit -m "feat(intake): PssLinkStep picker with summary card + no-link warning"
```

---

## Task 5: Wire adaptive Step 1, prefill handlers, fetch, and submit payload

**Files:**
- Modify: `src/components/samples/sample-intake-form.tsx`

**Interfaces:**
- Consumes: `mapPssToFormData` (Task 2), `PssLinkStep` (Task 4), existing `applyContractPrefill`, `updateFormData`, `approvedPSSSamples`.
- Produces: `linked_pss_sample_id` in the POST body (consumed by Task 3); the adaptive Step-1 UI.

- [ ] **Step 1: Add imports**

In `src/components/samples/sample-intake-form.tsx`, add `PssLinkStep` to the `'./intake'` import block (after `ContractSearchStep,`):

```ts
  ContractSearchStep,
  PssLinkStep,
```

Then add these imports after the existing `OtherSampleIntake` import (line ~28):

```ts
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { mapPssToFormData } from '@/lib/pss-intake-mapping'
```

- [ ] **Step 2: Raise the approved-PSS fetch limit**

Change the fetch URL (line ~310) from `limit=50` to `limit=200`:

```ts
      const response = await fetch('/api/samples?sample_type=pss&status=approved&limit=200')
```

- [ ] **Step 3: Add the PSS handlers**

Immediately after the `unlinkContract` function definition (ends ~line 481, before `const isOther = ...`), add:

```ts
  // SS → PSS: selecting a PSS prefills every shared field via the same prefill-tracking
  // machinery as contracts, so edits clear per-field and reselecting resets stale values.
  const handleSelectPss = (id: string) => {
    updateFormData('linked_pss_sample_id', id)
    const pss = approvedPSSSamples.find((s: any) => s.id === id)
    if (pss) {
      const { patch, prefilled } = mapPssToFormData(pss)
      applyContractPrefill(patch, prefilled)
    }
  }

  const handleClearPss = () => {
    applyContractPrefill({}, [])
    updateFormData('linked_pss_sample_id', '')
  }

  // Step-1 sample-type change: leaving SS clears any linked PSS + its prefill.
  const handleStep1TypeChange = (value: string) => {
    updateFormData('sample_type', value as FormData['sample_type'])
    if (value !== 'ss' && formData.linked_pss_sample_id) {
      handleClearPss()
    }
  }
```

- [ ] **Step 4: Make Step 1 adaptive**

Replace the current Step-1 render block (lines ~1094-1101):

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

with:

```tsx
              {currentStep === 1 && (
                isOther ? (
                  <ContractSearchStep
                    formData={formData}
                    applyContract={applyContractPrefill}
                    unlinkContract={unlinkContract}
                    onSkip={() => setCurrentStep(2)}
                  />
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">Sample Type *</Label>
                      <Select value={formData.sample_type} onValueChange={handleStep1TypeChange}>
                        <SelectTrigger className="w-[260px] h-9">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pss">PSS (Pre-Shipment Sample)</SelectItem>
                          <SelectItem value="ss">SS (Shipment Sample)</SelectItem>
                          <SelectItem value="type">Type Sample</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.sample_type === 'ss' ? (
                      <PssLinkStep
                        formData={formData}
                        approvedPSSSamples={approvedPSSSamples}
                        onSelectPss={handleSelectPss}
                        onClearPss={handleClearPss}
                      />
                    ) : (
                      <ContractSearchStep
                        formData={formData}
                        applyContract={applyContractPrefill}
                        unlinkContract={unlinkContract}
                        onSkip={() => setCurrentStep(2)}
                      />
                    )}
                  </div>
                )
              )}
```

- [ ] **Step 5: Add `linked_pss_sample_id` to the submit payload**

In the `sampleData` object (~line 758), immediately after `sample_type: formData.sample_type || undefined,` add:

```ts
        linked_pss_sample_id:
          formData.linked_pss_sample_id && formData.linked_pss_sample_id !== 'none'
            ? formData.linked_pss_sample_id
            : undefined,
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Manual smoke test**

In the running app, open New Sample (QC). Confirm Step 1 shows the Sample Type selector. Choose **SS** → the PSS picker appears with the amber "no PSS linked" warning. Pick an approved PSS → a green summary card replaces it; advance through steps and confirm seller, shipper, importer, contract refs, quality, origin, certifications, and bag fields are prefilled (and editable). Choose **PSS** or **Type** → the contract search shows instead. Submit an SS with a PSS linked and confirm success.

- [ ] **Step 8: Commit**

```bash
git add src/components/samples/sample-intake-form.tsx
git commit -m "feat(intake): PSS-first adaptive Step 1 for SS with full prefill"
```

---

## Task 6: Remove the old in-step PSS dropdown from Supply Chain

**Files:**
- Modify: `src/components/samples/intake/supply-chain-step.tsx`

**Interfaces:**
- No new exports. ICO/container inputs remain available in the Quantity step (`quantity-step.tsx:359-372`), so removing the SS blue box here strands nothing.

- [ ] **Step 1: Delete `handlePSSSelection`**

Remove the entire `handlePSSSelection` function (the block starting `// Handle PSS selection and auto-fill` ~line 117 through its closing brace ~line 139).

- [ ] **Step 2: Delete the SS blue box**

Remove the JSX block `{/* PSS Link for SS samples */}` — the whole `{formData.sample_type === 'ss' && ( ... )}` region (~lines 143-197), up to but not including the `{/* Seller Row */}` block.

- [ ] **Step 3: Remove now-unused imports**

Run: `npx tsc --noEmit`
Expected: errors flag any now-unused imports (e.g. `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue`) if they were only used by the removed block. Remove only the imports that `tsc`/lint reports as unused; keep any still referenced elsewhere in the file. Re-run until clean.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual check**

In the running app, choose SS in Step 1, advance to the Supply Chain step, and confirm the old blue "Link to Approved Pre-Shipment Sample" box is gone and the seller/shipper/importer rows render normally with the prefilled values.

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/intake/supply-chain-step.tsx
git commit -m "refactor(intake): drop old in-step PSS dropdown (moved to Step 1)"
```

---

## Task 7: Review-step "no PSS linked" warning

**Files:**
- Modify: `src/components/samples/intake/sample-details-step.tsx`

**Interfaces:**
- Consumes: `formData.sample_type`, `formData.linked_pss_sample_id` (already in scope; component destructures `{ formData, updateFormData, onPhotoUpload }`).

- [ ] **Step 1: Add the warning banner**

In `sample-details-step.tsx`, immediately inside the returned root `<div className="space-y-3">` (after line 28, before the `{/* Arrival date ... */}` block), add:

```tsx
      {formData.sample_type === 'ss' && !formData.linked_pss_sample_id && (
        <div className="rounded-2xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          No PSS linked to this shipment sample. Every SS should reference its approved
          pre-shipment sample — go back to Step 1 to link one, or continue if this is an exception.
        </div>
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual check**

Create an SS without linking a PSS, advance to the review step (Step 5), and confirm the amber warning shows; Next/submit remains enabled. Link a PSS and confirm the warning disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/intake/sample-details-step.tsx
git commit -m "feat(intake): warn on review step when an SS has no linked PSS"
```

---

## Task 8: Show "Linked PSS" in the sample detail modal

**Files:**
- Modify: `src/components/samples/sample-detail-modal.tsx`

**Interfaces:**
- Consumes: `sample.linked_pss` (`{ id, tracking_number } | null`) from the GET embed (Task 3) and `sample.linked_pss_sample_id`.

- [ ] **Step 1: Extend the `Sample` interface**

In `src/components/samples/sample-detail-modal.tsx`, inside `interface Sample` (after the `tracking_number: string` line ~59), add:

```ts
  linked_pss_sample_id?: string | null
  linked_pss?: { id: string; tracking_number: string } | null
```

- [ ] **Step 2: Render the linked PSS**

Find the sample-type display block (the `) : sample.sample_type ? ( ... ) : null}` around lines 843-847) and, immediately after its closing `</div>` (the one closing the row that holds the sample-type badge ~line 848), add a sibling read-only row:

```tsx
                  {sample.linked_pss?.tracking_number && (
                    <div className="flex items-center gap-2 mr-8">
                      <span className="text-xs text-muted-foreground">Linked PSS</span>
                      <Badge variant="outline" className="text-xs">
                        {sample.linked_pss.tracking_number}
                      </Badge>
                    </div>
                  )}
```

(`Badge` is already imported — it is used by the sample-type display directly above.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual check**

Open the detail modal for an SS that was created with a PSS link and confirm "Linked PSS: <tracking#>" shows. Open a PSS or an SS with no link and confirm the row is absent.

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/sample-detail-modal.tsx
git commit -m "feat(samples): show linked PSS tracking number in sample detail modal"
```

---

## Verification (whole feature)

- [ ] `npx vitest run src/lib/pss-intake-mapping.test.ts` — green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Migration applied by the user.
- [ ] Manual end-to-end: create an SS linked to an approved PSS → all shared fields prefill → submit → reopen detail modal → "Linked PSS" shows.
- [ ] Regression: PSS and Type intake still use contract search in Step 1; Other Samples flow unchanged.

## Notes / out of scope

- No server-side PSS search param (client-side filter over a 200-row page). If approved-PSS volume outgrows that, add a `search` param to the GET later — flagged so the cap is explicit.
- No backfill of `linked_pss_sample_id` for historical SS.
- Surfacing PSS cupping scores on reports/certs is enabled by the FK but not built here.
