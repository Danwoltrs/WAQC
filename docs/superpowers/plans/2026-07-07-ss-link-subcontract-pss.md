# Link an SS to a specific sub-contract PSS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an SS in the intake flow link to any approved PSS reference — the mother sample *or* an individual sub-contract (e.g. `BR-036995/26`) — with prefill and display that reflect exactly what was picked.

**Architecture:** The SS intake picker fetches approved mother PSS rows once via `GET /api/samples?sample_type=pss&status=approved`; each row already carries a rich `sub_contracts[]` array. We expand each PSS into a mother picker row **plus one row per sub-contract**, add a nullable `samples.linked_pss_sample_contract_id` column to persist the exact leaf, prefill from the leaf's own data layered over the mother's shared data, and resolve the linked-PSS display to the leaf's minted certificate number when a leaf is linked.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres), Vitest, Tailwind. Client-side Supabase `@/lib/supabase`, server-side `@/lib/supabase-server`.

## Global Constraints

- Files stay under ~2000 lines; flag if a change pushes past ~2200.
- Migrations live in `database/migrations/` (NOT `supabase/migrations/`); Daniel applies them manually — the plan hands him paste-ready SQL and does not run it.
- No emojis in UI. No mock data.
- Test runner: `npm test` (vitest). Run a single file with `npx vitest run <path>`.
- Trunk-based: commit directly to `main`.
- A sample's `tracking_number` IS its certificate number; a sub-contract's minted cert number lives on the `certificates` row (`sample_contract_id` set), not on `sample_contracts.tracking_number`.

---

### Task 1: Data model + FormData field

Adds the persistence column and the form field that carries the chosen sub-contract id. No behavior yet — this is the backbone the later tasks wire into.

**Files:**
- Create: `database/migrations/20260707000000_samples_linked_pss_sample_contract_id.sql`
- Modify: `src/components/samples/intake/types.ts` (add field near line 78)
- Modify: `src/components/samples/sample-intake-form.tsx:96` (initial state)

**Interfaces:**
- Produces: `FormData.linked_pss_sample_contract_id: string` (empty string = not a leaf link); DB column `samples.linked_pss_sample_contract_id UUID NULL`.

- [ ] **Step 1: Write the migration file**

Create `database/migrations/20260707000000_samples_linked_pss_sample_contract_id.sql`:

```sql
-- An SS can link to a specific sub-contract (container/buyer split) of an
-- approved PSS, not only the mother sample. linked_pss_sample_id keeps pointing
-- at the mother (so existing resolution/embeds are unchanged); this column pins
-- the exact leaf. NULL = linked to a whole mother PSS (or not an SS).
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS linked_pss_sample_contract_id UUID NULL
    REFERENCES sample_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_linked_pss_sample_contract_id
  ON samples(linked_pss_sample_contract_id)
  WHERE linked_pss_sample_contract_id IS NOT NULL;
```

- [ ] **Step 2: Add the field to the FormData type**

In `src/components/samples/intake/types.ts`, immediately after the `linked_pss_sample_id: string` line (line 78), add:

```typescript
  linked_pss_sample_id: string
  linked_pss_sample_contract_id: string
```

- [ ] **Step 3: Add the field to initial form state**

In `src/components/samples/sample-intake-form.tsx`, after line 96 (`linked_pss_sample_id: '',`), add:

```typescript
  linked_pss_sample_id: '',
  linked_pss_sample_contract_id: '',
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `linked_pss_sample_contract_id`.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/20260707000000_samples_linked_pss_sample_contract_id.sql \
  src/components/samples/intake/types.ts \
  src/components/samples/sample-intake-form.tsx
git commit -m "feat(intake): add linked_pss_sample_contract_id column + form field

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **NOTE for Daniel:** apply the migration SQL above before this ships. It is additive and backward compatible (existing rows get NULL).

---

### Task 2: `mapSubContractOverride` prefill helper

A pure function that produces the per-leaf field overrides layered over the mother's shared prefill.

**Files:**
- Modify: `src/lib/pss-intake-mapping.ts`
- Test: `src/lib/pss-intake-mapping.test.ts`

**Interfaces:**
- Consumes: a `sub_contracts[]` element from `GET /api/samples` with fields `importer_name`, `roaster_name`, `end_client_name`, `qc_client_name`, `buyer_contract_nr`, `wolthers_contract_nr`, `roaster_contract_nr`, `end_client_contract_nr`, `qc_client_contract_nr`, `supplier_contract_nr`, `ico_number`, `container_nr`, `bags_quantity_mt`.
- Produces: `mapSubContractOverride(sc: any): { patch: Partial<FormData>; prefilled: (keyof FormData)[] }`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/pss-intake-mapping.test.ts` (add `mapSubContractOverride` to the import on line 2):

```typescript
describe('mapSubContractOverride', () => {
  const sub = {
    id: 'sc-1',
    tracking_number: 'BR-036995/26',
    certificate_number: 'BR-036995/26',
    importer_name: 'Leaf Importer',
    roaster_name: 'Leaf Roaster',
    end_client_name: 'Leaf End Client',
    qc_client_name: 'Leaf QC',
    buyer_contract_nr: 'LB-1',
    wolthers_contract_nr: '40995/26',
    roaster_contract_nr: 'LR-1',
    end_client_contract_nr: 'LEC-1',
    qc_client_contract_nr: 'LQC-1',
    supplier_contract_nr: 'LSUP-1',
    ico_number: '999888777',
    container_nr: 'LEAFU7654321',
    bags_quantity_mt: 6.0,
  }

  it('overrides the per-leaf counterparty and quantity fields', () => {
    const { patch, prefilled } = mapSubContractOverride(sub)
    expect(patch.importer).toBe('Leaf Importer')
    expect(patch.roaster).toBe('Leaf Roaster')
    expect(patch.end_client).toBe('Leaf End Client')
    expect(patch.importer_contract_nr).toBe('LB-1') // buyer_contract_nr -> importer_contract_nr
    expect(patch.roaster_contract_nr).toBe('LR-1')
    expect(patch.wolthers_contract_nr).toBe('40995/26')
    expect(patch.ico_number).toBe('999888777')
    expect(patch.container_nr).toBe('LEAFU7654321')
    expect(patch.bags_quantity_mt).toBe('6')
    expect(prefilled).toContain('importer')
    expect(prefilled).toContain('bags_quantity_mt')
  })

  it('does not list empty/missing leaf fields as prefilled', () => {
    const { patch, prefilled } = mapSubContractOverride({ id: 'sc-2', importer_name: 'Only Importer' })
    expect(patch.importer).toBe('Only Importer')
    expect(prefilled).toEqual(['importer'])
    expect(patch.roaster).toBeUndefined()
    expect(patch.container_nr).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/pss-intake-mapping.test.ts`
Expected: FAIL — `mapSubContractOverride is not a function` / import error.

- [ ] **Step 3: Implement `mapSubContractOverride`**

Append to `src/lib/pss-intake-mapping.ts`:

```typescript
// A sub-contract (container/buyer split of a PSS) overrides only the per-leaf
// fields; everything else (seller, quality, origin, bag type, crop year) inherits
// from the mother via mapPssToFormData. Input is a sub_contracts[] element from
// GET /api/samples (entity names already resolved to display names).
export function mapSubContractOverride(
  sc: any
): { patch: Partial<FormData>; prefilled: (keyof FormData)[] } {
  const patch: Partial<FormData> = {}
  const prefilled: (keyof FormData)[] = []

  const setStr = <K extends keyof FormData>(key: K, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') {
      patch[key] = String(value) as FormData[K]
      prefilled.push(key)
    }
  }

  setStr('importer', sc.importer_name)
  setStr('roaster', sc.roaster_name)
  setStr('end_client', sc.end_client_name)
  setStr('qc_client', sc.qc_client_name)
  setStr('importer_contract_nr', sc.buyer_contract_nr)
  setStr('roaster_contract_nr', sc.roaster_contract_nr)
  setStr('end_client_contract_nr', sc.end_client_contract_nr)
  setStr('qc_client_contract_nr', sc.qc_client_contract_nr)
  setStr('supplier_contract_nr', sc.supplier_contract_nr)
  setStr('wolthers_contract_nr', sc.wolthers_contract_nr)
  setStr('ico_number', sc.ico_number)
  setStr('container_nr', sc.container_nr)
  setStr('bags_quantity_mt', sc.bags_quantity_mt)

  return { patch, prefilled }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/pss-intake-mapping.test.ts`
Expected: PASS (all tests, including the pre-existing `mapPssToFormData` block).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pss-intake-mapping.ts src/lib/pss-intake-mapping.test.ts
git commit -m "feat(intake): mapSubContractOverride for per-leaf PSS prefill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Picker rows per sub-contract + selection resolver

Expand each PSS into `[motherRow, ...leafRows]`, and add a resolver that maps a chosen option value back to its mother + optional sub-contract. Also fixes the dormant key bug (existing mother fold-in read `pss.sample_contracts`, which the API nulls; leaf rows replace that need, so the fold-in is removed).

**Files:**
- Modify: `src/lib/pss-picker-option.ts`
- Test: `src/lib/pss-picker-option.test.ts`

**Interfaces:**
- Consumes: `mapPssToFormData` shape (flattened PSS) with a `sub_contracts?: any[]` array whose elements have `id`, `certificate_number`, `tracking_number`, `importer_name`, `roaster_name`, `qc_client_name`, `buyer_contract_nr`, `wolthers_contract_nr`, `roaster_contract_nr`, `qc_client_contract_nr`, `end_client_contract_nr`, `supplier_contract_nr`, `ico_number`, `container_nr`.
- Produces:
  - `subContractRef(sc: any): string | null` — leaf's official reference (`certificate_number || tracking_number`).
  - `buildPssPickerOptions(pss: any): SearchableSelectOption[]` — mother row first, then one row per `pss.sub_contracts[]`.
  - `resolvePssSelection(list: any[], value: string): { mother: any; subContract: any | null } | null` — finds the mother by id, or the leaf (and its mother) by id.
  - `buildPssPickerOption(pss)` and `pssOfficialRef(pss)` remain exported (mother row builder), with the sub-contract keyword fold-in removed.

- [ ] **Step 1: Write the failing tests**

Replace the existing sub-contract fold-in test in `src/lib/pss-picker-option.test.ts` (the `it('makes Wolthers and other contract numbers from sub-contracts searchable too', ...)` block, lines 89–102) with the block below, and update the import on line 2 to:

```typescript
import { buildPssPickerOption, buildPssPickerOptions, pssOfficialRef, subContractRef, resolvePssSelection } from './pss-picker-option'
```

New tests (append inside the file, after the existing `describe('buildPssPickerOption', ...)` block closes on line 139):

```typescript
const motherWithSubs = {
  ...basePss,
  id: 'pss-1',
  origin: 'Brazil',
  sub_contracts: [
    {
      id: 'sc-9',
      certificate_number: 'BR-036995/26',
      tracking_number: 'BR-036995/26',
      importer_name: 'Leaf Importer',
      roaster_name: 'Leaf Roaster',
      qc_client_name: 'Dunkin',
      buyer_contract_nr: 'LB-1',
      wolthers_contract_nr: '40995/26',
      ico_number: '999888777',
      container_nr: 'LEAFU7654321',
    },
    {
      id: 'sc-10',
      certificate_number: null,
      tracking_number: 'BR-036996/26',
      importer_name: 'Second Leaf Importer',
    },
  ],
}

describe('buildPssPickerOptions', () => {
  it('emits the mother row plus one row per sub-contract', () => {
    const opts = buildPssPickerOptions(motherWithSubs)
    expect(opts).toHaveLength(3)
    expect(opts[0].value).toBe('pss-1')
    expect(opts[1].value).toBe('sc-9')
    expect(opts[2].value).toBe('sc-10')
  })

  it('leads a leaf row with its own cert number, then buyer and mother origin', () => {
    const opts = buildPssPickerOptions(motherWithSubs)
    expect(opts[1].label).toBe('BR-036995/26 · Leaf Importer · Brazil')
  })

  it('falls back to the leaf tracking number when it has no minted cert', () => {
    const opts = buildPssPickerOptions(motherWithSubs)
    expect(opts[2].label).toBe('BR-036996/26 · Second Leaf Importer · Brazil')
  })

  it('makes a leaf findable by its own cert/tracking/contract numbers', () => {
    const leaf = buildPssPickerOptions(motherWithSubs)[1]
    expect(leaf.keywords).toContain('BR-036995/26')
    expect(leaf.keywords).toContain('40995/26')
    expect(leaf.keywords).toContain('LB-1')
    expect(leaf.keywords).toContain('999888777')
    expect(leaf.keywords).toContain('LEAFU7654321')
  })

  it('returns just the mother row when there are no sub-contracts', () => {
    expect(buildPssPickerOptions(basePss)).toHaveLength(1)
  })
})

describe('resolvePssSelection', () => {
  const list = [motherWithSubs]

  it('resolves a mother id to the mother with no sub-contract', () => {
    const sel = resolvePssSelection(list, 'pss-1')
    expect(sel?.mother.id).toBe('pss-1')
    expect(sel?.subContract).toBeNull()
  })

  it('resolves a sub-contract id to its leaf and mother', () => {
    const sel = resolvePssSelection(list, 'sc-9')
    expect(sel?.mother.id).toBe('pss-1')
    expect(sel?.subContract.id).toBe('sc-9')
  })

  it('returns null for an unknown value', () => {
    expect(resolvePssSelection(list, 'nope')).toBeNull()
  })
})

describe('subContractRef', () => {
  it('prefers the minted cert number, falling back to tracking', () => {
    expect(subContractRef({ certificate_number: 'BR-036995/26', tracking_number: 'x' })).toBe('BR-036995/26')
    expect(subContractRef({ certificate_number: null, tracking_number: 'BR-036996/26' })).toBe('BR-036996/26')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/pss-picker-option.test.ts`
Expected: FAIL — `buildPssPickerOptions`/`resolvePssSelection`/`subContractRef` not exported.

- [ ] **Step 3: Implement the new functions and remove the dead fold-in**

In `src/lib/pss-picker-option.ts`, delete the sub-contract fold-in from `buildPssPickerOption` (the block at lines 65–77, from the `// Sub-contract references` comment through the closing `]),`) so the mother `keywords` array ends at `str(pss.quality_name),`. Then append:

```typescript
// A sub-contract's official reference: its minted certificate number, or its
// tracking number when a cert has not been minted yet.
export function subContractRef(sc: any): string | null {
  return str(sc?.certificate_number) || str(sc?.tracking_number)
}

// One picker row for a single sub-contract (container/buyer split). Leads with
// the leaf's own official ref, then its buyer/importer and the mother's origin.
function buildSubContractOption(sc: any, mother: any): SearchableSelectOption {
  const ref = subContractRef(sc)
  const party = str(sc?.importer_name) || str(sc?.roaster_name) || str(sc?.qc_client_name)
  const label = [ref, party, str(mother?.origin)].filter(Boolean).join(' · ')

  const keywords = [
    str(sc?.certificate_number),
    str(sc?.tracking_number),
    str(sc?.wolthers_contract_nr),
    str(sc?.buyer_contract_nr),
    str(sc?.roaster_contract_nr),
    str(sc?.qc_client_contract_nr),
    str(sc?.end_client_contract_nr),
    str(sc?.supplier_contract_nr),
    str(sc?.ico_number),
    str(sc?.container_nr),
    str(sc?.importer_name),
    str(sc?.roaster_name),
    str(sc?.qc_client_name),
    // Mother context so a leaf is also findable by shared identifiers.
    str(mother?.seller_name),
    str(mother?.origin),
    str(mother?.quality_name),
  ].filter((v): v is string => Boolean(v))

  return { value: sc.id, label, keywords: [...new Set(keywords)] }
}

// A PSS expands into its mother row plus one row per sub-contract, so an SS can
// link either the whole PSS or a specific container/buyer split.
export function buildPssPickerOptions(pss: any): SearchableSelectOption[] {
  const subs = Array.isArray(pss?.sub_contracts) ? pss.sub_contracts : []
  return [
    buildPssPickerOption(pss),
    ...subs.filter((sc: any) => sc?.id).map((sc: any) => buildSubContractOption(sc, pss)),
  ]
}

// Maps a chosen picker value back to its target: a mother sample (subContract
// null) or a specific sub-contract plus the mother it belongs to.
export function resolvePssSelection(
  list: any[],
  value: string
): { mother: any; subContract: any | null } | null {
  if (!value) return null
  const mother = list.find((s: any) => s.id === value)
  if (mother) return { mother, subContract: null }
  for (const m of list) {
    const subs = Array.isArray(m?.sub_contracts) ? m.sub_contracts : []
    const sc = subs.find((c: any) => c?.id === value)
    if (sc) return { mother: m, subContract: sc }
  }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/pss-picker-option.test.ts`
Expected: PASS. (The removed fold-in test is gone; all remaining tests pass.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pss-picker-option.ts src/lib/pss-picker-option.test.ts
git commit -m "feat(intake): per-sub-contract PSS picker rows + selection resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the form select/clear/submit logic

Make `handleSelectPss` resolve any picked value (mother or leaf), link + prefill accordingly, clear the leaf id on unlink/type-change, and send the leaf id in the submit payload.

**Files:**
- Modify: `src/components/samples/sample-intake-form.tsx` (imports; handlers ~489–512; submit payload ~790)

**Interfaces:**
- Consumes: `resolvePssSelection` (Task 3), `mapSubContractOverride` (Task 2), `mapPssToFormData` (existing), `applyContractPrefill` (existing).
- Produces: on selecting a leaf → `formData.linked_pss_sample_id = mother.id`, `formData.linked_pss_sample_contract_id = sc.id`; on selecting a mother → leaf id `''`. Submit payload key `linked_pss_sample_contract_id`.

- [ ] **Step 1: Add imports**

In `src/components/samples/sample-intake-form.tsx`, update the mapping import (line 32) and add the resolver import (near the other `@/lib` imports):

```typescript
import { mapPssToFormData, mapSubContractOverride } from '@/lib/pss-intake-mapping'
import { resolvePssSelection } from '@/lib/pss-picker-option'
```

- [ ] **Step 2: Rewrite `handleSelectPss`, `handleClearPss`, `handleStep1TypeChange`**

Replace lines 487–512 with:

```typescript
  // SS → PSS: selecting a mother PSS or a specific sub-contract prefills every
  // shared field via the same prefill-tracking machinery as contracts, so edits
  // clear per-field and reselecting resets stale values. A sub-contract keeps
  // linked_pss_sample_id on the mother and pins the exact leaf via
  // linked_pss_sample_contract_id, layering its per-leaf overrides on top.
  const handleSelectPss = (value: string) => {
    const sel = resolvePssSelection(approvedPSSSamples, value)
    if (!sel) return
    updateFormData('linked_pss_sample_id', sel.mother.id)
    updateFormData('linked_pss_sample_contract_id', sel.subContract ? sel.subContract.id : '')
    const base = mapPssToFormData(sel.mother)
    if (sel.subContract) {
      const override = mapSubContractOverride(sel.subContract)
      applyContractPrefill(
        { ...base.patch, ...override.patch },
        [...base.prefilled, ...override.prefilled]
      )
    } else {
      applyContractPrefill(base.patch, base.prefilled)
    }
  }

  // linked_pss_sample_id / linked_pss_sample_contract_id are cleared via separate
  // updateFormData calls because they are not tracked in contract_prefilled_fields,
  // so applyContractPrefill({}, []) alone would not reset them.
  const handleClearPss = () => {
    applyContractPrefill({}, [])
    updateFormData('linked_pss_sample_id', '')
    updateFormData('linked_pss_sample_contract_id', '')
  }

  // Step-1 sample-type change: leaving SS clears any linked PSS + its prefill.
  const handleStep1TypeChange = (value: string) => {
    updateFormData('sample_type', value as FormData['sample_type'])
    if (value !== 'ss' && formData.linked_pss_sample_id) {
      handleClearPss()
    }
  }
```

- [ ] **Step 3: Add the leaf id to the submit payload**

In `src/components/samples/sample-intake-form.tsx`, immediately after the `linked_pss_sample_id: ...` payload entry (lines 790–793), add:

```typescript
        linked_pss_sample_id:
          formData.linked_pss_sample_id && formData.linked_pss_sample_id !== 'none'
            ? formData.linked_pss_sample_id
            : undefined,
        linked_pss_sample_contract_id:
          formData.linked_pss_sample_contract_id || undefined,
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (`PssLinkStep` still passes the value through; behavior wired fully in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/sample-intake-form.tsx
git commit -m "feat(intake): link + prefill SS from a chosen mother or sub-contract PSS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the picker UI (options + leaf badge)

Feed the multi-row options into the picker, bind its value to the leaf id when present, and show the exact picked reference in the linked badge.

**Files:**
- Modify: `src/components/samples/intake/pss-link-step.tsx`

**Interfaces:**
- Consumes: `buildPssPickerOptions`, `resolvePssSelection`, `subContractRef`, `pssOfficialRef` (Task 3); `formData.linked_pss_sample_contract_id` (Task 1).

- [ ] **Step 1: Update imports and options in `pss-link-step.tsx`**

Replace the import on line 7 with:

```typescript
import { buildPssPickerOptions, pssOfficialRef, subContractRef, resolvePssSelection } from '@/lib/pss-picker-option'
```

Replace lines 18 and 20 (the `selected`/`options` derivations) with:

```typescript
  const pickValue = formData.linked_pss_sample_contract_id || formData.linked_pss_sample_id
  const selection = resolvePssSelection(approvedPSSSamples, pickValue)

  const options = approvedPSSSamples.flatMap(buildPssPickerOptions)
```

- [ ] **Step 2: Update the linked-badge branch**

Replace the `if (selected) { ... }` block (lines 22–49) with a version that renders the picked reference — the leaf's cert number when a sub-contract is linked, otherwise the mother's ref:

```typescript
  if (selection) {
    const sc = selection.subContract
    const ref = sc ? subContractRef(sc) : (pssOfficialRef(selection.mother) || selection.mother.tracking_number)
    const parties = sc
      ? [sc.importer_name || sc.roaster_name || sc.qc_client_name].filter(Boolean)
      : [selection.mother.seller_name || selection.mother.exporter_name, selection.mother.importer_name].filter(Boolean)
    return (
      <div className="rounded-2xl p-3 bg-[#556b2f]/10 border border-[#556b2f]/30 min-w-[300px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">
              Linked PSS #{ref}
              {sc ? <span className="ml-2 text-xs font-normal text-muted-foreground">(sub-contract)</span> : null}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {parties.join(' → ')}
              {selection.mother.origin ? ` · ${selection.mother.origin}` : ''}
              {selection.mother.quality_name ? ` · ${selection.mother.quality_name}` : ''}
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
      </div>
    )
  }
```

- [ ] **Step 3: Bind the SearchableSelect value to the pick value**

In the picker `<SearchableSelect .../>` (line 56), change `value={formData.linked_pss_sample_id || ''}` to:

```typescript
        value={pickValue || ''}
```

- [ ] **Step 4: Verify it typechecks and existing unit tests pass**

Run: `npx tsc --noEmit && npx vitest run src/lib/pss-picker-option.test.ts src/lib/pss-intake-mapping.test.ts`
Expected: no type errors; all unit tests PASS.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open Sample Intake → QC Sample → Sample Type = SS. In "Approved PSS", type `36995`.
Expected: a selectable row `BR-036995/26 · … · Brazil` appears; selecting it shows the badge "Linked PSS #BR-036995/26 (sub-contract)" and prefills the importer/container/bags from that leaf. Typing `36991` still shows and links the mother.

- [ ] **Step 6: Commit**

```bash
git add src/components/samples/intake/pss-link-step.tsx
git commit -m "feat(intake): show sub-contract PSS rows and picked-leaf badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Persist + display the leaf on the API

Insert the leaf id on create, and resolve the linked-PSS display to the leaf's minted cert number so the tracker/cert-editor chip shows exactly what was picked.

**Files:**
- Modify: `src/app/api/samples/route.ts` (POST insert ~438; linked-PSS resolution ~120–134 and ~192–195)

**Interfaces:**
- Consumes: `samples.linked_pss_sample_contract_id` (Task 1); `certificates(sample_contract_id, certificate_number)`.
- Produces: `linked_pss.tracking_number` = leaf cert number when a leaf is linked, else mother tracking number (shape `{ id, tracking_number }` unchanged for consumers).

- [ ] **Step 1: Persist the leaf id on create**

In `src/app/api/samples/route.ts`, after line 438 (`linked_pss_sample_id: body.linked_pss_sample_id || null,`), add:

```typescript
        linked_pss_sample_id: body.linked_pss_sample_id || null,
        linked_pss_sample_contract_id: body.linked_pss_sample_contract_id || null,
```

- [ ] **Step 2: Build a leaf-cert map in the GET transform**

In `src/app/api/samples/route.ts`, immediately after the `linkedPssMap` block ends (after line 134), add:

```typescript
    // Resolve minted cert numbers for SS samples linked to a specific sub-contract,
    // so the linked-PSS chip shows the exact leaf the user picked (e.g. BR-036995/26),
    // not the mother's number. The number lives on the sub-contract's certificate row.
    const linkedLeafIds = [...new Set((samples || [])
      .map((s: any) => s.linked_pss_sample_contract_id)
      .filter(Boolean))] as string[]
    const leafCertMap: Record<string, string> = {}
    if (linkedLeafIds.length > 0) {
      const { data } = await (supabase as any)
        .from('certificates')
        .select('sample_contract_id, certificate_number')
        .in('sample_contract_id', linkedLeafIds)
      for (const r of (data || []) as any[]) {
        if (r.sample_contract_id) leafCertMap[r.sample_contract_id] = r.certificate_number
      }
    }
```

- [ ] **Step 3: Prefer the leaf cert number in `linked_pss`**

In `src/app/api/samples/route.ts`, replace the `linked_pss` assignment (lines 192–195) with:

```typescript
        // Linked PSS (for SS samples) — the leaf's minted cert number when a
        // specific sub-contract was linked, otherwise the mother's tracking number.
        linked_pss: sample.linked_pss_sample_id
          && ((sample.linked_pss_sample_contract_id && leafCertMap[sample.linked_pss_sample_contract_id])
              || linkedPssMap[sample.linked_pss_sample_id])
          ? {
              id: sample.linked_pss_sample_id,
              tracking_number:
                (sample.linked_pss_sample_contract_id && leafCertMap[sample.linked_pss_sample_contract_id])
                || linkedPssMap[sample.linked_pss_sample_id],
            }
          : null,
```

- [ ] **Step 4: Verify it typechecks and the app builds**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Manual verification (end to end)**

With the migration applied: register a new SS linked to `BR-036995/26`, submit it, then confirm on the samples tracker that the new SS's linked-PSS chip reads `BR-036995/26`. Optionally verify persistence:

```sql
SELECT tracking_number, linked_pss_sample_id, linked_pss_sample_contract_id
FROM samples
WHERE linked_pss_sample_contract_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

Expected: the new SS row has `linked_pss_sample_contract_id` = the `sc-…` id for `BR-036995/26`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/samples/route.ts
git commit -m "feat(samples): persist linked sub-contract + show its cert number in linked-PSS chip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Migration / new column → Task 1. ✓
- Picker emits mother + leaf rows, leaf findable by its cert number → Task 3. ✓
- Selection links exact leaf + prefills from leaf over mother → Tasks 2 (override), 4 (wire). ✓
- Persist on POST → Task 6 (insert) + Task 4 (payload). ✓
- Display reflects exact pick (intake badge + tracker chip) → Task 5 (badge) + Task 6 (API `linked_pss`). ✓
- Mother stays selectable → Task 3 (`buildPssPickerOptions` keeps the mother row). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `mapSubContractOverride` (Task 2) and `resolvePssSelection`/`buildPssPickerOptions`/`subContractRef` (Task 3) are consumed with matching names/signatures in Tasks 4–5. `FormData.linked_pss_sample_contract_id` (Task 1) used consistently in Tasks 4–5. API key `linked_pss_sample_contract_id` matches column name in Tasks 1 and 6. ✓

**Note on the removed fold-in (Task 3):** the deleted mother-keyword fold-in read `pss.sample_contracts`, which `GET /api/samples` nulls (data is under `sub_contracts`), so it was already inert in production — removing it changes no live behavior and leaf rows now provide that findability directly.
