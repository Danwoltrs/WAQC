# One Sample Per Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every commercial contract a physical sample covers becomes its own `samples` row (siblings share one lab unit via `lab_source_sample_id`), so references, quantities, bulk containers and edits belong to exactly one certificate; plus bulk-as-containers+MT and reference auto-increment at intake.

**Architecture:** One nullable self-reference on `samples` replaces `sample_contracts` + `certificates.sample_contract_id`. A pure module `src/lib/sample-group.ts` owns the copy rule and group resolution; every surface that keyed on `sample_contract_id` reads the certificate's own sample row instead, and every lab-data read from a sibling resolves through `labSourceId`. The migration runs in one transaction with verification assertions; code that depends on it is committed locally and pushed only after Daniel applies it.

**Tech Stack:** Next.js 14 App Router (TypeScript), Supabase (Postgres + PostgREST via `@supabase/supabase-js`), vitest (jsdom), `@react-pdf/renderer` for certificates.

**Spec:** `docs/superpowers/specs/2026-08-26-sample-per-contract-design.md` + `docs/superpowers/specs/2026-08-28-sample-per-contract-addendum-design.md`

## Global Constraints

- Files stay under ~2000 lines (2200 acceptable); `src/app/samples/qc/page.tsx` (2310) may only shrink.
- No emojis in UI. No mock data. Server components by default.
- Migrations live in `database/migrations/`, are applied by Daniel, and must be self-verifying (abort on any mismatch). Paste the SQL in the final message.
- Commit to `main` locally. Push ONLY commits that do not depend on the migration (Tasks 1–4 are safe; everything from Task 5 on is NOT pushed by this session).
- Certificate numbers are never regenerated. Rendered certificate content for the 92 migrated certificates must be byte-identical except where the addendum says otherwise (bulk wording).
- Bulk invariant: `equivalent_60kg_bags = round(bags_quantity_mt × 1000 / 60)`, `bag_count = equivalent_60kg_bags`, `bag_weight_kg = 21600`.
- Bulk prints as `N container(s) in bulk (X.X MT)` everywhere.
- Column list of `samples` in production (2026-08-28): assigned_to, awb_number, bag_count, bag_type, bag_weight_kg, bags, bags_quantity_mt, buyer_contract_nr, calculated_client_fee, calculated_lab_fee, cards_printed_at, certificate_generated_at, certifications, client_id, container, container_nr, contract_id, contract_number, courier_name, created_at, crop_year, deleted_at, deleted_by, destination, end_client_contract_nr, end_client_id, equivalent_60kg_bags, exporter_contract_nr, exporter_id, exporter_legacy, exporter_sample_number, hide_exporter_on_label, ico_marks, ico_number, id, importer_id, importer_is_qc_client, importer_legacy, is_quick_look, laboratory_id, linked_pss_sample_contract_id, linked_pss_sample_id, locked, manual_ref_fields, micro_origin, origin, processing_method, qc_client_contract_nr, quality_name, quality_spec_id, roaster_contract_nr, roaster_id, roaster_legacy, same_seller_shipper, sample_category, sample_type, scanned_at, seller_comment, seller_contract_nr, seller_id, shipment_month, shipper_contract_nr, split_numbering, status, storage_position, supplier, supplier_contract_nr, supplier_type, tin_label_printed_at, tracking_number, updated_at, wolthers_contract_nr, workflow_stage.
- Column list of `sample_contracts` in production: bag_count, bag_type (text), bag_weight_kg, bags_quantity_mt, buyer_contract_nr, client_id, container_nr, contract_id, created_at, created_by, end_client_contract_nr, end_client_id, equivalent_60kg_bags, exporter_sample_number, ico_number, id, importer_id, importer_is_qc_client, manual_ref_fields, qc_client_contract_nr, roaster_contract_nr, roaster_id, sample_id, seller_contract_nr, shipment_month, shipper_contract_nr, sort_order, supplier_contract_nr, tracking_number, updated_at, wolthers_contract_nr.
- `src/lib/database.types.ts` is stale and is patched by hand (Task 4), not regenerated.
- Verification before any "done" claim: `npx tsc --noEmit -p tsconfig.json` clean and `npx vitest run` green.

---

## File map

| File | Responsibility after this plan |
| --- | --- |
| `src/lib/sample-group.ts` (new) | Pure copy rule (`buildSiblingRow`), `labSourceId`, group ordering, DB helpers `fetchGroup` / `resolveLabSourceId(s)` / `createSiblingSamples` |
| `src/lib/reference-sequence.ts` (new) | `nextReference`, `suggestContractRefs` |
| `src/lib/bag-quantity.ts` | + `bulkQuantitiesFromContainers`, `formatBulkQuantity`, `formatQuantityLine` |
| `database/migrations/20260828000001_one_sample_per_contract.sql` (new) | schema + data move + verification |
| `src/lib/certificate-data.ts` | renders from the certificate's own sample row; lab data via `labSourceId` |
| `src/lib/cupping/certificate-mint.ts` (new, extracted from finalize-pipeline) | `mintGroupCertificates` used by finalize, CVA finalize, certificate POST, quality-assessment auto-certify |
| `src/app/api/samples/[id]/siblings/route.ts` (new) | `POST` create contracts (siblings) on an existing sample |
| `src/components/samples/intake/bulk-quantity-fields.tsx` (new) | shared Containers + MT inputs with derived equivalent |
| `src/components/certificates/cert-editor/contracts-section.tsx` (new) | "Contracts in this sample" group list in the overlay |
| Deleted | `src/lib/certificate-supply-refs.ts`, `src/components/samples/sample-contracts-section.tsx`, `src/components/samples/intake/sub-contract-card.tsx`, `src/app/api/samples/[id]/contracts/route.ts` (replaced by a 410), `src/components/certificates/cert-editor/split-commercial-payload.ts` |

---

## Stage 1 — Foundation (safe to push)

### Task 1: `sample-group.ts` — the copy rule and group helpers

**Files:**
- Create: `src/lib/sample-group.ts`
- Test: `src/lib/sample-group.test.ts`

**Interfaces:**
- Produces:
  - `labSourceId(s: { id: string; lab_source_sample_id?: string | null }): string`
  - `isLabUnit(s): boolean`
  - `sortGroup<T extends GroupOrderable>(rows: T[]): T[]` — lab unit first, then `contract_ordinal` asc (nulls last), then `created_at`
  - `ContractInput` (all optional/nullable): `importer_id, roaster_id, end_client_id, client_id, importer_is_qc_client, wolthers_contract_nr, buyer_contract_nr, roaster_contract_nr, qc_client_contract_nr, end_client_contract_nr, supplier_contract_nr, seller_contract_nr, shipper_contract_nr, exporter_sample_number, ico_number, container_nr, shipment_month, bag_count, bag_weight_kg, bag_type, bags_quantity_mt, equivalent_60kg_bags, container_count, contract_id, manual_ref_fields, created_at`
  - `buildSiblingRow(mother: Record<string, unknown>, input: ContractInput, opts: { trackingNumber: string; ordinal: number }): Record<string, unknown>`
  - `MOTHER_SHARED_FIELDS`, `SIBLING_COALESCE_FIELDS`, `SIBLING_OWN_FIELDS` (exported const arrays)
  - `fetchGroup(db, sampleId): Promise<GroupMember[]>` (any row of the group → whole group, sorted; `GroupMember = Record<string, any> & { id: string; lab_source_sample_id: string | null; contract_ordinal: number | null }`)
  - `resolveLabSourceId(db, sampleId): Promise<string>`
  - `resolveLabSourceIds(db, ids: string[]): Promise<Map<string, string>>`
  - `groupSampleIds(db, sampleId): Promise<string[]>` (ids of every member, lab unit first)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/sample-group.test.ts
import { describe, it, expect } from 'vitest'
import { labSourceId, isLabUnit, sortGroup, buildSiblingRow, MOTHER_SHARED_FIELDS, SIBLING_OWN_FIELDS, SIBLING_COALESCE_FIELDS } from './sample-group'

const mother = {
  id: 'm', tracking_number: 'SAN-00654/26', origin: 'BR', sample_category: 'quality_control', sample_type: 'pss',
  laboratory_id: 'lab', quality_spec_id: 'q', client_id: 'dunkin', seller_id: 'ofi', exporter_id: 'ofi',
  status: 'approved', workflow_stage: 'certified', crop_year: '26/27', processing_method: 'natural',
  certifications: ['RFA'], seller_contract_nr: 'S664243-13', shipper_contract_nr: null, exporter_contract_nr: 'EX-1',
  exporter_sample_number: '130306', ico_number: null, container_nr: null, shipment_month: '2026-10',
  bag_count: 333, bag_weight_kg: 60, bag_type: 'jute_bag', bags_quantity_mt: 19.98, equivalent_60kg_bags: 333, bags: null,
  importer_id: 'imp', roaster_id: null, end_client_id: null, importer_is_qc_client: false,
  wolthers_contract_nr: 'W-1', buyer_contract_nr: 'S049504-13', storage_position: 'A1', deleted_at: null,
  linked_pss_sample_id: 'x', linked_pss_sample_contract_id: 'y', split_numbering: true, created_at: '2026-08-27T17:52:33Z',
  manual_ref_fields: ['buyer_contract_nr'], contract_id: 'sysc',
}

describe('labSourceId / isLabUnit', () => {
  it('is the row itself for a lab unit and the pointer for a sibling', () => {
    expect(labSourceId({ id: 'a', lab_source_sample_id: null })).toBe('a')
    expect(labSourceId({ id: 'b', lab_source_sample_id: 'a' })).toBe('a')
    expect(isLabUnit({ id: 'a', lab_source_sample_id: null })).toBe(true)
    expect(isLabUnit({ id: 'b', lab_source_sample_id: 'a' })).toBe(false)
  })
})

describe('sortGroup', () => {
  it('puts the lab unit first, then contract order, then creation time', () => {
    const rows = [
      { id: 's3', lab_source_sample_id: 'm', contract_ordinal: null, created_at: '2026-01-03' },
      { id: 's2', lab_source_sample_id: 'm', contract_ordinal: 3, created_at: '2026-01-02' },
      { id: 'm', lab_source_sample_id: null, contract_ordinal: 1, created_at: '2026-01-01' },
      { id: 's1', lab_source_sample_id: 'm', contract_ordinal: 2, created_at: '2026-01-05' },
    ]
    expect(sortGroup(rows).map((r) => r.id)).toEqual(['m', 's1', 's2', 's3'])
  })
})

describe('buildSiblingRow', () => {
  it('copies the lab unit, takes the contract\'s own buy side and refs, and cross-maps the seller ref', () => {
    const row = buildSiblingRow(mother, {
      importer_id: 'imp2', importer_is_qc_client: true, buyer_contract_nr: 'S049504-14',
      supplier_contract_nr: 'S664243-14', exporter_sample_number: '130307',
      bag_count: 20, bag_weight_kg: 1000, bag_type: 'big_bag', bags_quantity_mt: 20, equivalent_60kg_bags: 333,
      created_at: '2026-08-28T10:00:00Z',
    }, { trackingNumber: 'SAN-00700/26', ordinal: 2 })
    // identity
    expect(row.id).toBeUndefined()
    expect(row.tracking_number).toBe('SAN-00700/26')
    expect(row.lab_source_sample_id).toBe('m')
    expect(row.contract_ordinal).toBe(2)
    expect(row.split_numbering).toBe(true)
    // inherited
    expect(row.origin).toBe('BR'); expect(row.laboratory_id).toBe('lab'); expect(row.status).toBe('approved')
    expect(row.workflow_stage).toBe('certified'); expect(row.certifications).toEqual(['RFA'])
    expect(row.seller_id).toBe('ofi'); expect(row.exporter_contract_nr).toBe('EX-1')
    // own buy side (no fallback)
    expect(row.importer_id).toBe('imp2'); expect(row.roaster_id).toBeNull(); expect(row.end_client_id).toBeNull()
    expect(row.importer_is_qc_client).toBe(true)
    expect(row.wolthers_contract_nr).toBeNull(); expect(row.buyer_contract_nr).toBe('S049504-14')
    // coalesced
    expect(row.client_id).toBe('dunkin'); expect(row.exporter_sample_number).toBe('130307')
    expect(row.shipment_month).toBe('2026-10'); expect(row.supplier_contract_nr).toBe('S664243-14')
    // seller ref = supplier ref → seller ref → mother seller ref
    expect(row.seller_contract_nr).toBe('S664243-14')
    // quantity: own
    expect(row.bag_count).toBe(20); expect(row.bag_type).toBe('big_bag'); expect(row.bags_quantity_mt).toBe(20)
    expect(row.bags).toBe(20)
    // never inherited
    expect(row.storage_position).toBeNull(); expect(row.linked_pss_sample_id).toBeNull()
    expect(row.linked_pss_sample_contract_id).toBeNull()
    expect(row.manual_ref_fields).toEqual([]); expect(row.contract_id).toBeNull()
    expect(row.created_at).toBe('2026-08-28T10:00:00Z')
    expect(row.calculated_client_fee).toBeUndefined(); expect(row.updated_at).toBeUndefined()
  })

  it('falls back to the lab unit for blank coalesced fields and quantity', () => {
    const row = buildSiblingRow(mother, {}, { trackingNumber: 'SAN-00701/26', ordinal: 3 })
    expect(row.seller_contract_nr).toBe('S664243-13')
    expect(row.exporter_sample_number).toBe('130306')
    expect(row.bag_count).toBe(333); expect(row.bags_quantity_mt).toBe(19.98); expect(row.bag_type).toBe('jute_bag')
    expect(row.client_id).toBe('dunkin')
    expect(row.importer_id).toBeNull()
    expect(row.importer_is_qc_client).toBe(true) // sample_contracts default
    expect(row.created_at).toBeUndefined()
  })

  it('keeps the three field lists disjoint and complete', () => {
    const all = new Set([...MOTHER_SHARED_FIELDS, ...SIBLING_OWN_FIELDS, ...SIBLING_COALESCE_FIELDS])
    expect(all.size).toBe(MOTHER_SHARED_FIELDS.length + SIBLING_OWN_FIELDS.length + SIBLING_COALESCE_FIELDS.length)
    for (const f of ['bag_count', 'bags_quantity_mt', 'client_id', 'exporter_sample_number']) expect(SIBLING_COALESCE_FIELDS).toContain(f)
    for (const f of ['importer_id', 'buyer_contract_nr', 'wolthers_contract_nr', 'contract_id', 'manual_ref_fields']) expect(SIBLING_OWN_FIELDS).toContain(f)
    for (const f of ['origin', 'laboratory_id', 'status', 'workflow_stage', 'quality_spec_id', 'seller_id', 'deleted_at']) expect(MOTHER_SHARED_FIELDS).toContain(f)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/sample-group.test.ts`
Expected: FAIL — cannot resolve `./sample-group`

- [ ] **Step 3: Implement**

```ts
// src/lib/sample-group.ts
/**
 * One sample per contract.
 *
 * A physical sample that covers several commercial contracts is N `samples`
 * rows: one LAB UNIT (cupped and graded, `lab_source_sample_id IS NULL`) and
 * N-1 SIBLINGS that point at it. Lab data lives only on the lab unit; every
 * commercial field lives on the row that owns it. This module is the single
 * home of the copy rule and of group resolution — the migration and the
 * intake/siblings endpoints both use it. (Spec: docs/superpowers/specs/
 * 2026-08-26-sample-per-contract-design.md + 2026-08-28 addendum.)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LabSourceRef { id: string; lab_source_sample_id?: string | null }
export interface GroupOrderable extends LabSourceRef { contract_ordinal?: number | null; created_at?: string | null }

export function labSourceId(s: LabSourceRef): string {
  return s.lab_source_sample_id ?? s.id
}
export function isLabUnit(s: LabSourceRef): boolean {
  return !s.lab_source_sample_id
}

export function sortGroup<T extends GroupOrderable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const au = isLabUnit(a) ? 0 : 1, bu = isLabUnit(b) ? 0 : 1
    if (au !== bu) return au - bu
    const ao = a.contract_ordinal ?? Number.MAX_SAFE_INTEGER, bo = b.contract_ordinal ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
}

/** Columns a sibling always inherits from its lab unit (shared lot / lab state). */
export const MOTHER_SHARED_FIELDS = [
  'assigned_to', 'awb_number', 'cards_printed_at', 'certificate_generated_at', 'certifications',
  'container', 'contract_number', 'courier_name', 'crop_year', 'deleted_at', 'deleted_by', 'destination',
  'exporter_contract_nr', 'exporter_id', 'exporter_legacy', 'hide_exporter_on_label', 'ico_marks',
  'importer_legacy', 'is_quick_look', 'laboratory_id', 'locked', 'micro_origin', 'origin',
  'processing_method', 'quality_name', 'quality_spec_id', 'roaster_legacy', 'same_seller_shipper',
  'sample_category', 'sample_type', 'scanned_at', 'seller_comment', 'seller_id', 'status', 'supplier',
  'supplier_type', 'tin_label_printed_at', 'workflow_stage',
] as const

/** Columns where the contract's own value wins and a blank falls back to the lab unit. */
export const SIBLING_COALESCE_FIELDS = [
  'client_id', 'supplier_contract_nr', 'shipper_contract_nr', 'exporter_sample_number', 'ico_number',
  'container_nr', 'shipment_month', 'bag_count', 'bag_weight_kg', 'bag_type', 'bags_quantity_mt',
  'equivalent_60kg_bags', 'container_count',
] as const

/** Columns that are the contract's own, with NO fallback (a blank is a blank). */
export const SIBLING_OWN_FIELDS = [
  'importer_id', 'roaster_id', 'end_client_id', 'importer_is_qc_client', 'wolthers_contract_nr',
  'buyer_contract_nr', 'roaster_contract_nr', 'qc_client_contract_nr', 'end_client_contract_nr',
  'contract_id', 'manual_ref_fields',
] as const

export type ContractInput = Partial<{
  importer_id: string | null; roaster_id: string | null; end_client_id: string | null; client_id: string | null
  importer_is_qc_client: boolean | null
  wolthers_contract_nr: string | null; buyer_contract_nr: string | null; roaster_contract_nr: string | null
  qc_client_contract_nr: string | null; end_client_contract_nr: string | null
  supplier_contract_nr: string | null; seller_contract_nr: string | null; shipper_contract_nr: string | null
  exporter_sample_number: string | null; ico_number: string | null; container_nr: string | null
  shipment_month: string | null
  bag_count: number | null; bag_weight_kg: number | null; bag_type: string | null
  bags_quantity_mt: number | null; equivalent_60kg_bags: number | null; container_count: number | null
  contract_id: string | null; manual_ref_fields: string[] | null; created_at: string | null
}>

const blank = (v: unknown) => v === null || v === undefined || v === ''
const pick = (...vals: unknown[]) => vals.find((v) => !blank(v)) ?? null

/**
 * The copy rule. Mirrors what certificate-data.ts printed for a sub-contract
 * certificate before the split, so a migrated certificate renders unchanged:
 * buy side and buy-side refs are the contract's own; supply-side identifiers
 * and quantity fall back to the lab unit; the seller reference is the
 * contract's supplier ref → its seller ref → the lab unit's seller ref.
 */
export function buildSiblingRow(
  mother: Record<string, unknown>,
  input: ContractInput,
  opts: { trackingNumber: string; ordinal: number },
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const f of MOTHER_SHARED_FIELDS) row[f] = mother[f] ?? null
  for (const f of SIBLING_COALESCE_FIELDS) row[f] = pick((input as Record<string, unknown>)[f], mother[f])
  for (const f of SIBLING_OWN_FIELDS) row[f] = (input as Record<string, unknown>)[f] ?? null
  row.importer_is_qc_client = input.importer_is_qc_client ?? true
  row.manual_ref_fields = input.manual_ref_fields ?? []
  row.seller_contract_nr = pick(input.supplier_contract_nr, input.seller_contract_nr, mother.seller_contract_nr)
  row.bags = pick(row.bag_count, mother.bags)
  row.storage_position = null
  row.linked_pss_sample_id = null
  row.linked_pss_sample_contract_id = null
  row.tracking_number = opts.trackingNumber
  row.split_numbering = !!mother.laboratory_id
  row.lab_source_sample_id = mother.id
  row.contract_ordinal = opts.ordinal
  if (!blank(input.created_at)) row.created_at = input.created_at
  return row
}

export type GroupMember = Record<string, any> & {
  id: string
  lab_source_sample_id: string | null
  contract_ordinal: number | null
  created_at: string | null
}

/** Every member of the group `sampleId` belongs to, lab unit first. */
export async function fetchGroup(db: SupabaseClient<any>, sampleId: string): Promise<GroupMember[]> {
  const labId = await resolveLabSourceId(db, sampleId)
  const { data, error } = await db
    .from('samples')
    .select('*')
    .or(`id.eq.${labId},lab_source_sample_id.eq.${labId}`)
  if (error) throw error
  return sortGroup((data ?? []) as GroupMember[])
}

export async function groupSampleIds(db: SupabaseClient<any>, sampleId: string): Promise<string[]> {
  const labId = await resolveLabSourceId(db, sampleId)
  const { data, error } = await db
    .from('samples')
    .select('id, lab_source_sample_id, contract_ordinal, created_at')
    .or(`id.eq.${labId},lab_source_sample_id.eq.${labId}`)
  if (error) throw error
  return sortGroup((data ?? []) as GroupMember[]).map((m) => m.id)
}

export async function resolveLabSourceId(db: SupabaseClient<any>, sampleId: string): Promise<string> {
  const { data } = await db.from('samples').select('id, lab_source_sample_id').eq('id', sampleId).maybeSingle()
  return data ? labSourceId(data as LabSourceRef) : sampleId
}

/** Batch form: id → lab unit id (an unknown id maps to itself). */
export async function resolveLabSourceIds(db: SupabaseClient<any>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids)]
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200)
    const { data } = await db.from('samples').select('id, lab_source_sample_id').in('id', chunk)
    for (const r of (data ?? []) as LabSourceRef[]) out.set(r.id, labSourceId(r))
  }
  for (const id of uniq) if (!out.has(id)) out.set(id, id)
  return out
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/sample-group.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sample-group.ts src/lib/sample-group.test.ts
git commit -m "feat(samples): sample-group — the sibling copy rule and lab-unit resolution"
```

---

### Task 2: `reference-sequence.ts` — auto-increment suggestions

**Files:**
- Create: `src/lib/reference-sequence.ts`
- Test: `src/lib/reference-sequence.test.ts`

**Interfaces:**
- Produces:
  - `nextReference(previous: string | null | undefined, before?: string | null): string | null`
  - `SUGGESTED_REF_FIELDS = ['exporter_sample_number','wolthers_contract_nr','supplier_contract_nr','buyer_contract_nr','roaster_contract_nr','qc_client_contract_nr','end_client_contract_nr'] as const`
  - `suggestContractRefs(previous: RefBag, before?: RefBag | null): Partial<Record<SuggestedRefField, string>>` where `RefBag = Partial<Record<SuggestedRefField, string | null | undefined>>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/reference-sequence.test.ts
import { describe, it, expect } from 'vitest'
import { nextReference, suggestContractRefs } from './reference-sequence'

describe('nextReference — single seed increments the first digit run', () => {
  it.each([
    ['50235-1', '50236-1'],
    ['1235-231', '1236-231'],
    ['56542/26', '56543/26'],
    ['IR0007506-1', 'IR0007507-1'],
    ['130306', '130307'],
    ['S664243-13', 'S664244-13'],
    ['AB-0099', 'AB-0100'],
    ['0999', '1000'],
  ])('%s → %s', (prev, next) => expect(nextReference(prev)).toBe(next))

  it('returns null without digits or input', () => {
    expect(nextReference('TBI')).toBeNull()
    expect(nextReference('')).toBeNull()
    expect(nextReference(null)).toBeNull()
    expect(nextReference(undefined)).toBeNull()
  })
})

describe('nextReference — two seeds continue the run that changed', () => {
  it.each([
    ['S664243-14', 'S664243-13', 'S664243-15'],
    ['S049504-16', 'S049504-14', 'S049504-18'],
    ['5229', '5228', '5230'],
    ['41859/26', '41858/26', '41860/26'],
    ['IR0007507-1', 'IR0007506-1', 'IR0007508-1'],
  ])('%s after %s → %s', (prev, before, next) => expect(nextReference(prev, before)).toBe(next))

  it('falls back to the first-run rule when the shapes differ or nothing changed', () => {
    expect(nextReference('S664243-14', 'X-1')).toBe('S664244-14')
    expect(nextReference('S664243-14', 'S664243-14')).toBe('S664244-14')
  })

  it('gives up when several runs changed', () => {
    expect(nextReference('S664244-15', 'S664243-13')).toBeNull()
  })

  it('never steps backwards', () => {
    expect(nextReference('S664243-13', 'S664243-14')).toBe('S664244-13')
  })
})

describe('suggestContractRefs', () => {
  it('suggests every present reference field and skips blanks', () => {
    expect(suggestContractRefs({ exporter_sample_number: '130306', buyer_contract_nr: 'S049504-13', supplier_contract_nr: 'S664243-13', wolthers_contract_nr: '' })).toEqual({
      exporter_sample_number: '130307', buyer_contract_nr: 'S049505-13', supplier_contract_nr: 'S664244-13',
    })
  })
  it('uses the pair rule per field', () => {
    expect(suggestContractRefs(
      { buyer_contract_nr: 'S049504-14', supplier_contract_nr: 'S664243-14' },
      { buyer_contract_nr: 'S049504-13', supplier_contract_nr: 'S664243-13' },
    )).toEqual({ buyer_contract_nr: 'S049504-15', supplier_contract_nr: 'S664243-15' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/reference-sequence.test.ts` → FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
// src/lib/reference-sequence.ts
/**
 * Suggest the next reference when a sample gains another contract.
 *
 * One seed: bump the FIRST run of digits, keeping its width
 * ("50235-1" → "50236-1", "56542/26" → "56543/26"). Two seeds of the same
 * shape: find the one run that moved and keep stepping it
 * ("S664243-13", "S664243-14" → "S664243-15") — this is how the tool adapts
 * after the user corrects the first guess. Anything else → no suggestion.
 */
const DIGITS = /\d+/g

interface Run { start: number; end: number; text: string }

function runs(s: string): Run[] {
  const out: Run[] = []
  for (const m of s.matchAll(DIGITS)) out.push({ start: m.index!, end: m.index! + m[0].length, text: m[0] })
  return out
}
const skeleton = (s: string) => s.replace(DIGITS, '#')

function bump(s: string, run: Run, step: number): string {
  const next = String(BigInt(run.text) + BigInt(step)).padStart(run.text.length, '0')
  return s.slice(0, run.start) + next + s.slice(run.end)
}

export function nextReference(previous: string | null | undefined, before?: string | null): string | null {
  const prev = (previous ?? '').trim()
  if (!prev) return null
  const prevRuns = runs(prev)
  if (prevRuns.length === 0) return null

  const bef = (before ?? '').trim()
  if (bef && skeleton(bef) === skeleton(prev)) {
    const befRuns = runs(bef)
    const changed = prevRuns
      .map((r, i) => ({ r, step: Number(BigInt(r.text) - BigInt(befRuns[i].text)) }))
      .filter((x) => x.step !== 0)
    if (changed.length > 1) return null
    if (changed.length === 1 && changed[0].step > 0) return bump(prev, changed[0].r, changed[0].step)
  }
  return bump(prev, prevRuns[0], 1)
}

export const SUGGESTED_REF_FIELDS = [
  'exporter_sample_number', 'wolthers_contract_nr', 'supplier_contract_nr', 'buyer_contract_nr',
  'roaster_contract_nr', 'qc_client_contract_nr', 'end_client_contract_nr',
] as const
export type SuggestedRefField = (typeof SUGGESTED_REF_FIELDS)[number]
export type RefBag = Partial<Record<SuggestedRefField, string | null | undefined>>

export function suggestContractRefs(previous: RefBag, before?: RefBag | null): Partial<Record<SuggestedRefField, string>> {
  const out: Partial<Record<SuggestedRefField, string>> = {}
  for (const f of SUGGESTED_REF_FIELDS) {
    const next = nextReference(previous[f], before?.[f])
    if (next) out[f] = next
  }
  return out
}
```

- [ ] **Step 4: Run tests** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/reference-sequence.ts src/lib/reference-sequence.test.ts
git commit -m "feat(intake): reference-sequence — continue a contract reference series"
```

---

### Task 3: Bulk containers in `bag-quantity.ts`

**Files:**
- Modify: `src/lib/bag-quantity.ts` (append)
- Test: `src/lib/bag-quantity.test.ts` (append)

**Interfaces:**
- Produces:
  - `bulkQuantitiesFromContainers(containers: number | null | undefined, mt: number | null | undefined): { container_count: number | null; bags_quantity_mt: number | null; equivalent_60kg_bags: number | null; bag_count: number | null; bag_weight_kg: 21600 }` — when `mt` is blank, default `containers × 21.6`
  - `bulkContainerCount(row: { container_count?: number | null; bags_quantity_mt?: number | null }): number` — stored count, else `max(1, round(MT / 21.6))`
  - `formatBulkQuantity(row: { container_count?: number | null; bags_quantity_mt?: number | null; bag_count?: number | null }): string | null` → `"2 containers in bulk (43.2 MT)"`, `"1 container in bulk (21.6 MT)"`; null when no MT and no bag_count
  - `formatQuantityLine(row: { bag_type?: string | null; bag_count?: number | null; bag_weight_kg?: number | null; bags_quantity_mt?: number | null; container_count?: number | null; equivalent_60kg_bags?: number | null }): string | null` → bulk → `formatBulkQuantity`; otherwise `"320 × 60 kg jute bags (19.2 MT)"` (bag type label via `BAG_TYPE_LABELS`), MT-only `"19.2 MT"` when no bags
  - `BAG_TYPE_LABELS: Record<string,string>` = `{ jute_bag: 'jute bags', pp_bag: 'PP bags', big_bag: 'big bags', bulk: 'bulk' }`

- [ ] **Step 1: Write the failing tests** (append to `src/lib/bag-quantity.test.ts`)

```ts
import { bulkQuantitiesFromContainers, bulkContainerCount, formatBulkQuantity, formatQuantityLine } from './bag-quantity'

describe('bulkQuantitiesFromContainers', () => {
  it('defaults MT to containers × 21.6 and derives the 60kg equivalent', () => {
    expect(bulkQuantitiesFromContainers(2, null)).toEqual({ container_count: 2, bags_quantity_mt: 43.2, equivalent_60kg_bags: 720, bag_count: 720, bag_weight_kg: 21600 })
  })
  it('keeps an entered (lighter) MT', () => {
    expect(bulkQuantitiesFromContainers(1, 19.5)).toEqual({ container_count: 1, bags_quantity_mt: 19.5, equivalent_60kg_bags: 325, bag_count: 325, bag_weight_kg: 21600 })
  })
  it('accepts MT without containers', () => {
    expect(bulkQuantitiesFromContainers(null, 64.8)).toEqual({ container_count: null, bags_quantity_mt: 64.8, equivalent_60kg_bags: 1080, bag_count: 1080, bag_weight_kg: 21600 })
  })
  it('is empty without either', () => {
    expect(bulkQuantitiesFromContainers(null, null)).toEqual({ container_count: null, bags_quantity_mt: null, equivalent_60kg_bags: null, bag_count: null, bag_weight_kg: 21600 })
  })
})

describe('bulkContainerCount / formatBulkQuantity', () => {
  it('prefers the stored count and estimates from MT otherwise (never below 1)', () => {
    expect(bulkContainerCount({ container_count: 3, bags_quantity_mt: 43.2 })).toBe(3)
    expect(bulkContainerCount({ container_count: null, bags_quantity_mt: 43.2 })).toBe(2)
    expect(bulkContainerCount({ container_count: null, bags_quantity_mt: 15 })).toBe(1)
  })
  it('prints the agreed wording', () => {
    expect(formatBulkQuantity({ container_count: 2, bags_quantity_mt: 43.2 })).toBe('2 containers in bulk (43.2 MT)')
    expect(formatBulkQuantity({ container_count: null, bags_quantity_mt: 21.6 })).toBe('1 container in bulk (21.6 MT)')
    expect(formatBulkQuantity({ container_count: null, bags_quantity_mt: null, bag_count: 720 })).toBe('2 containers in bulk (43.2 MT)')
    expect(formatBulkQuantity({ container_count: null, bags_quantity_mt: null, bag_count: null })).toBeNull()
  })
})

describe('formatQuantityLine', () => {
  it('routes bulk to the container wording and bags to the bag wording', () => {
    expect(formatQuantityLine({ bag_type: 'bulk', container_count: 2, bags_quantity_mt: 43.2 })).toBe('2 containers in bulk (43.2 MT)')
    expect(formatQuantityLine({ bag_type: 'jute_bag', bag_count: 320, bag_weight_kg: 60, bags_quantity_mt: 19.2 })).toBe('320 × 60 kg jute bags (19.2 MT)')
    expect(formatQuantityLine({ bag_type: 'big_bag', bag_count: 20, bag_weight_kg: 1000, bags_quantity_mt: 20 })).toBe('20 × 1000 kg big bags (20.0 MT)')
    expect(formatQuantityLine({ bag_type: null, bag_count: null, bags_quantity_mt: 19.2 })).toBe('19.2 MT')
    expect(formatQuantityLine({ bag_type: null })).toBeNull()
  })
})
```

- [ ] **Step 2: Run** → FAIL (exports missing)

- [ ] **Step 3: Implement** (append to `src/lib/bag-quantity.ts`)

```ts
export const BAG_TYPE_LABELS: Record<string, string> = {
  jute_bag: 'jute bags', pp_bag: 'PP bags', big_bag: 'big bags', bulk: 'bulk',
}

/** Bulk container's conventional whole net weight in kg (legacy bag_weight_kg for bulk rows). */
export const BULK_CONTAINER_KG = 21600 as const

export interface BulkQuantities {
  container_count: number | null
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
  /** Invariant every report relies on: bag_count IS the 60kg equivalent for bulk. */
  bag_count: number | null
  bag_weight_kg: typeof BULK_CONTAINER_KG
}

/**
 * Bulk is entered as containers + total MT (the MT defaults to containers × 21.6
 * but a lighter coffee is legitimately below it). Everything else derives.
 */
export function bulkQuantitiesFromContainers(
  containers: number | null | undefined,
  mt: number | null | undefined,
): BulkQuantities {
  const c = Number(containers) || 0
  let m = Number(mt) || 0
  if (m <= 0 && c > 0) m = c * BULK_CONTAINER_MT
  const derived = bulkQuantitiesFromMt(m > 0 ? m : null)
  return {
    container_count: c > 0 ? Math.round(c) : null,
    bags_quantity_mt: derived.bags_quantity_mt,
    equivalent_60kg_bags: derived.equivalent_60kg_bags,
    bag_count: derived.equivalent_60kg_bags,
    bag_weight_kg: BULK_CONTAINER_KG,
  }
}

export function bulkContainerCount(row: { container_count?: number | null; bags_quantity_mt?: number | null }): number {
  if (row.container_count && row.container_count > 0) return Math.round(row.container_count)
  return Math.max(1, approxBulkContainers(row.bags_quantity_mt))
}

/** "2 containers in bulk (43.2 MT)" — the agreed wording on every surface. */
export function formatBulkQuantity(row: {
  container_count?: number | null
  bags_quantity_mt?: number | null
  bag_count?: number | null
}): string | null {
  let mt = Number(row.bags_quantity_mt) || 0
  if (mt <= 0 && row.bag_count && row.bag_count > 0) mt = (row.bag_count * 60) / 1000
  if (mt <= 0) return null
  const n = bulkContainerCount({ container_count: row.container_count, bags_quantity_mt: mt })
  return `${n} container${n === 1 ? '' : 's'} in bulk (${mt.toFixed(1)} MT)`
}

/** One-line quantity for lists, summaries and labels. */
export function formatQuantityLine(row: {
  bag_type?: string | null
  bag_count?: number | null
  bag_weight_kg?: number | null
  bags_quantity_mt?: number | null
  container_count?: number | null
  equivalent_60kg_bags?: number | null
}): string | null {
  if (row.bag_type === 'bulk') return formatBulkQuantity(row)
  const mt = Number(row.bags_quantity_mt) || 0
  const mtText = mt > 0 ? `${mt.toFixed(1)} MT` : null
  if (row.bag_count && row.bag_count > 0 && row.bag_weight_kg) {
    const label = row.bag_type ? BAG_TYPE_LABELS[row.bag_type] ?? row.bag_type.replace(/_/g, ' ') : 'bags'
    return `${row.bag_count} × ${row.bag_weight_kg} kg ${label}${mtText ? ` (${mtText})` : ''}`
  }
  return mtText
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/bag-quantity.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bag-quantity.ts src/lib/bag-quantity.test.ts
git commit -m "feat(quantity): bulk as containers + total MT, printed as 'N containers in bulk (X MT)'"
```

---

### Task 4: Patch `database.types.ts` for the new columns

**Files:**
- Modify: `src/lib/database.types.ts` — `samples` Row/Insert/Update (~13475, ~13543, ~13611), `certificates` Row/Insert/Update (~1585)

- [ ] **Step 1:** In each of the three `samples` blocks add, alphabetically placed:

```ts
          container_count: number | null
          contract_ordinal: number | null
          lab_source_sample_id: string | null
          linked_pss_sample_contract_id: string | null
          linked_pss_sample_id: string | null
          manual_ref_fields: string[]
          seller_comment: string | null
          split_numbering: boolean
          tin_label_printed_at: string | null
```
(In `Insert`/`Update` every one is optional `?:`; `manual_ref_fields?: string[]`, `split_numbering?: boolean`.)

- [ ] **Step 2:** In the three `certificates` blocks add `client_id: string | null` (optional in Insert/Update).

- [ ] **Step 3:** Run `npx tsc --noEmit -p tsconfig.json` — expect clean (additions only widen types).

- [ ] **Step 4: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore(types): samples.lab_source_sample_id / contract_ordinal / container_count + drifted columns"
```

- [ ] **Step 5: Push Tasks 1–4** (nothing here depends on the migration): `git push origin main`

---

### Task 5: The migration

**Files:**
- Create: `database/migrations/20260828000001_one_sample_per_contract.sql`

**Interfaces:**
- Produces: columns `samples.lab_source_sample_id`, `samples.contract_ordinal`, `samples.container_count`; table `sample_contract_migrations(sample_contract_id, sibling_sample_id, certificate_id, migrated_at)`; every `certificates.sample_contract_id` and `samples.linked_pss_sample_contract_id` NULL.

- [ ] **Step 1: Write the migration** (complete file)

```sql
-- Migration 20260828000001: one sample per contract
--
-- Each sample_contracts row becomes a sibling `samples` row pointing at its
-- mother through samples.lab_source_sample_id. The sibling's certificate is
-- repointed at the sibling; certificate numbers and rendered content are
-- verified identical inside this transaction, which ABORTS on any mismatch.
-- sample_contracts is left untouched (archive / rollback). The two legacy
-- columns are nulled, not dropped, so the previous build keeps working until
-- the code is deployed. Spec: docs/superpowers/specs/2026-08-26-... + 2026-08-28 addendum.
--
-- Apply BEFORE pushing the code; nothing in the app reads the new columns
-- until then. Idempotent on the schema part; the data part refuses to run
-- twice (it checks sample_contract_migrations).

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

-- 1. Schema ------------------------------------------------------------------
ALTER TABLE samples ADD COLUMN IF NOT EXISTS lab_source_sample_id uuid NULL
  REFERENCES samples(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_samples_lab_source_sample_id
  ON samples (lab_source_sample_id) WHERE lab_source_sample_id IS NOT NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS contract_ordinal integer NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS container_count integer NULL;
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_container_count_positive;
ALTER TABLE samples ADD CONSTRAINT samples_container_count_positive
  CHECK (container_count IS NULL OR container_count > 0);
COMMENT ON COLUMN samples.lab_source_sample_id IS
  'NULL = lab unit (cupped/graded). Set = contract sibling whose lab data lives on the row it points at.';
COMMENT ON COLUMN samples.contract_ordinal IS '1 = lab unit, 2..N = siblings, in contract order.';
COMMENT ON COLUMN samples.container_count IS 'Bulk: number of containers entered by the lab. Optional otherwise.';

CREATE TABLE IF NOT EXISTS sample_contract_migrations (
  sample_contract_id uuid PRIMARY KEY,
  sibling_sample_id  uuid NOT NULL REFERENCES samples(id),
  certificate_id     uuid NULL,
  migrated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sample_contract_migrations ENABLE ROW LEVEL SECURITY;

-- 2. Guard: never run the data move twice -------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sample_contract_migrations) THEN
    RAISE EXCEPTION 'sample_contract_migrations is not empty: the data move already ran';
  END IF;
END $$;

-- 3. Snapshot what every sub-contract certificate prints TODAY ----------------
-- (the COALESCE rules mirror certificate-data.ts's contractOverride branch)
CREATE TEMP TABLE cert_before ON COMMIT DROP AS
SELECT c.id AS certificate_id, c.certificate_number, c.client_id AS cert_client_id,
       sc.id AS sample_contract_id, s.id AS mother_id,
       COALESCE(sc.supplier_contract_nr, sc.seller_contract_nr, s.seller_contract_nr) AS seller_ref,
       COALESCE(sc.shipper_contract_nr, s.shipper_contract_nr)                       AS shipper_ref,
       sc.buyer_contract_nr, sc.wolthers_contract_nr, sc.roaster_contract_nr,
       sc.qc_client_contract_nr, sc.end_client_contract_nr,
       COALESCE(sc.exporter_sample_number, s.exporter_sample_number) AS exporter_sample_number,
       COALESCE(sc.ico_number, s.ico_number)                         AS ico_number,
       COALESCE(sc.container_nr, s.container_nr)                     AS container_nr,
       COALESCE(sc.bag_count, s.bag_count, s.bags)                   AS bag_count,
       COALESCE(sc.bag_weight_kg, s.bag_weight_kg)                   AS bag_weight_kg,
       COALESCE(NULLIF(sc.bag_type, ''), s.bag_type::text)           AS bag_type,
       COALESCE(sc.bags_quantity_mt, s.bags_quantity_mt)             AS bags_quantity_mt,
       COALESCE(sc.equivalent_60kg_bags, s.equivalent_60kg_bags)     AS equivalent_60kg_bags,
       sc.importer_id, sc.roaster_id, sc.end_client_id, sc.importer_is_qc_client,
       COALESCE(sc.client_id, s.client_id)                           AS client_id,
       s.shipment_month AS mother_shipment_month, sc.shipment_month AS sub_shipment_month
FROM certificates c
JOIN sample_contracts sc ON sc.id = c.sample_contract_id
JOIN samples s ON s.id = sc.sample_id;

CREATE TEMP TABLE cert_numbers_before ON COMMIT DROP AS
SELECT id, certificate_number FROM certificates;

CREATE TEMP TABLE counts_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM samples) AS samples, (SELECT count(*) FROM sample_contracts) AS subs;

-- 4. Copy: one sibling per sub-contract ---------------------------------------
-- Quantity is copied verbatim: the derivation trigger would re-derive MT for
-- non-bulk rows and the 60kg equivalent for bulk rows, and the spec forbids
-- rewriting a stored quantity the arithmetic has not proven wrong.
ALTER TABLE samples DISABLE TRIGGER trigger_update_equivalent_60kg_bags;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_generate_certificate'
             AND tgrelid = 'samples'::regclass AND NOT tgisinternal) THEN
    EXECUTE 'ALTER TABLE samples DISABLE TRIGGER trigger_auto_generate_certificate';
  END IF;
END $$;

DO $$
DECLARE
  sc      RECORD;
  m       samples%ROWTYPE;
  v_id    uuid;
  v_track text;
BEGIN
  FOR sc IN
    SELECT * FROM sample_contracts ORDER BY sample_id, sort_order, created_at
  LOOP
    SELECT * INTO m FROM samples WHERE id = sc.sample_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sample_contract % has no mother sample %', sc.id, sc.sample_id;
    END IF;

    -- Internal lab number: minted per sibling (unique per client). A mother
    -- without a laboratory cannot mint; fall back to the sub's own number.
    IF m.laboratory_id IS NOT NULL THEN
      v_track := generate_sample_number(m.laboratory_id);
    ELSE
      v_track := COALESCE(sc.tracking_number, m.tracking_number || '-' || (sc.sort_order + 2)::text);
    END IF;

    INSERT INTO samples (
      -- inherited from the lab unit (MOTHER_SHARED_FIELDS in src/lib/sample-group.ts)
      assigned_to, awb_number, cards_printed_at, certificate_generated_at, certifications,
      container, contract_number, courier_name, crop_year, deleted_at, deleted_by, destination,
      exporter_contract_nr, exporter_id, exporter_legacy, hide_exporter_on_label, ico_marks,
      importer_legacy, is_quick_look, laboratory_id, locked, micro_origin, origin,
      processing_method, quality_name, quality_spec_id, roaster_legacy, same_seller_shipper,
      sample_category, sample_type, scanned_at, seller_comment, seller_id, status, supplier,
      supplier_type, tin_label_printed_at, workflow_stage,
      -- contract's own, blank falls back (SIBLING_COALESCE_FIELDS)
      client_id, supplier_contract_nr, shipper_contract_nr, exporter_sample_number, ico_number,
      container_nr, shipment_month, bag_count, bag_weight_kg, bag_type, bags_quantity_mt,
      equivalent_60kg_bags,
      -- contract's own, no fallback (SIBLING_OWN_FIELDS)
      importer_id, roaster_id, end_client_id, importer_is_qc_client, wolthers_contract_nr,
      buyer_contract_nr, roaster_contract_nr, qc_client_contract_nr, end_client_contract_nr,
      contract_id, manual_ref_fields,
      -- special
      seller_contract_nr, bags, storage_position, linked_pss_sample_id, linked_pss_sample_contract_id,
      tracking_number, split_numbering, lab_source_sample_id, contract_ordinal, created_at, updated_at
    ) VALUES (
      m.assigned_to, m.awb_number, m.cards_printed_at, m.certificate_generated_at, m.certifications,
      m.container, m.contract_number, m.courier_name, m.crop_year, m.deleted_at, m.deleted_by, m.destination,
      m.exporter_contract_nr, m.exporter_id, m.exporter_legacy, m.hide_exporter_on_label, m.ico_marks,
      m.importer_legacy, m.is_quick_look, m.laboratory_id, m.locked, m.micro_origin, m.origin,
      m.processing_method, m.quality_name, m.quality_spec_id, m.roaster_legacy, m.same_seller_shipper,
      m.sample_category, m.sample_type, m.scanned_at, m.seller_comment, m.seller_id, m.status, m.supplier,
      m.supplier_type, m.tin_label_printed_at, m.workflow_stage,
      COALESCE(sc.client_id, m.client_id),
      COALESCE(NULLIF(sc.supplier_contract_nr, ''), m.supplier_contract_nr),
      COALESCE(NULLIF(sc.shipper_contract_nr, ''), m.shipper_contract_nr),
      COALESCE(NULLIF(sc.exporter_sample_number, ''), m.exporter_sample_number),
      COALESCE(NULLIF(sc.ico_number, ''), m.ico_number),
      COALESCE(NULLIF(sc.container_nr, ''), m.container_nr),
      COALESCE(NULLIF(sc.shipment_month, ''), m.shipment_month),
      COALESCE(sc.bag_count, m.bag_count, m.bags),
      COALESCE(sc.bag_weight_kg, m.bag_weight_kg),
      COALESCE(NULLIF(sc.bag_type, '')::bag_type_enum, m.bag_type),
      COALESCE(sc.bags_quantity_mt, m.bags_quantity_mt),
      COALESCE(sc.equivalent_60kg_bags, m.equivalent_60kg_bags),
      sc.importer_id, sc.roaster_id, sc.end_client_id, COALESCE(sc.importer_is_qc_client, true),
      sc.wolthers_contract_nr, sc.buyer_contract_nr, sc.roaster_contract_nr, sc.qc_client_contract_nr,
      sc.end_client_contract_nr, sc.contract_id, COALESCE(sc.manual_ref_fields, '{}'::text[]),
      COALESCE(NULLIF(sc.supplier_contract_nr, ''), NULLIF(sc.seller_contract_nr, ''), m.seller_contract_nr),
      COALESCE(sc.bag_count, m.bags),
      NULL, NULL, NULL,
      v_track, (m.laboratory_id IS NOT NULL), m.id, sc.sort_order + 2, sc.created_at, now()
    )
    RETURNING id INTO v_id;

    INSERT INTO sample_contract_migrations (sample_contract_id, sibling_sample_id)
    VALUES (sc.id, v_id);
  END LOOP;
END $$;

ALTER TABLE samples ENABLE TRIGGER trigger_update_equivalent_60kg_bags;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_generate_certificate'
             AND tgrelid = 'samples'::regclass AND NOT tgisinternal) THEN
    EXECUTE 'ALTER TABLE samples ENABLE TRIGGER trigger_auto_generate_certificate';
  END IF;
END $$;

-- Mothers that now have siblings are contract #1.
UPDATE samples s SET contract_ordinal = 1
WHERE contract_ordinal IS NULL
  AND EXISTS (SELECT 1 FROM samples x WHERE x.lab_source_sample_id = s.id);

-- 5. Repoint certificates ------------------------------------------------------
UPDATE certificates c
SET sample_id = m.sibling_sample_id, sample_contract_id = NULL
FROM sample_contract_migrations m
WHERE c.sample_contract_id = m.sample_contract_id;

UPDATE sample_contract_migrations m
SET certificate_id = c.id
FROM certificates c
WHERE c.sample_id = m.sibling_sample_id;

-- 6. SS → PSS leaf links now point at the sibling sample -------------------------
UPDATE samples s
SET linked_pss_sample_id = m.sibling_sample_id, linked_pss_sample_contract_id = NULL
FROM sample_contract_migrations m
WHERE s.linked_pss_sample_contract_id = m.sample_contract_id;

-- 7. Sent-email history keyed by sub-contract now keys by the sibling ------------
UPDATE email_messages e
SET metadata = e.metadata
             || jsonb_build_object('sample_id', m.sibling_sample_id::text,
                                   'migrated_from_sample_id', e.metadata->>'sample_id')
FROM sample_contract_migrations m
WHERE e.metadata IS NOT NULL
  AND e.metadata->>'sample_contract_id' = m.sample_contract_id::text;

-- 8. Verification — any failure aborts the whole transaction -------------------
DO $$
DECLARE
  v_subs  bigint; v_mig bigint; v_before bigint; v_after bigint;
  v_bad   bigint; v_row RECORD;
BEGIN
  SELECT subs, samples INTO v_subs, v_before FROM counts_before;
  SELECT count(*) INTO v_mig FROM sample_contract_migrations;
  IF v_mig <> v_subs THEN
    RAISE EXCEPTION 'migrated % siblings for % sub-contracts', v_mig, v_subs;
  END IF;

  SELECT count(*) INTO v_after FROM samples;
  IF v_after <> v_before + v_subs THEN
    RAISE EXCEPTION 'samples went from % to %, expected %', v_before, v_after, v_before + v_subs;
  END IF;

  IF EXISTS (SELECT 1 FROM certificates WHERE sample_contract_id IS NOT NULL) THEN
    RAISE EXCEPTION 'certificates still point at sample_contracts';
  END IF;
  IF EXISTS (SELECT 1 FROM samples WHERE linked_pss_sample_contract_id IS NOT NULL) THEN
    RAISE EXCEPTION 'samples still link a sample_contracts leaf';
  END IF;

  -- Every certificate number unchanged.
  SELECT count(*) INTO v_bad
  FROM cert_numbers_before b JOIN certificates c ON c.id = b.id
  WHERE c.certificate_number IS DISTINCT FROM b.certificate_number;
  IF v_bad > 0 THEN RAISE EXCEPTION '% certificate numbers changed', v_bad; END IF;

  -- Every migrated certificate resolves to exactly one sample, its sibling.
  SELECT count(*) INTO v_bad
  FROM cert_before b JOIN certificates c ON c.id = b.certificate_id
  JOIN sample_contract_migrations m ON m.sample_contract_id = b.sample_contract_id
  WHERE c.sample_id IS DISTINCT FROM m.sibling_sample_id;
  IF v_bad > 0 THEN RAISE EXCEPTION '% certificates not repointed at their sibling', v_bad; END IF;

  -- Rendered references and quantity identical to what the sub-contract printed.
  SELECT count(*) INTO v_bad
  FROM cert_before b
  JOIN sample_contract_migrations m ON m.sample_contract_id = b.sample_contract_id
  JOIN samples s ON s.id = m.sibling_sample_id
  WHERE s.seller_contract_nr        IS DISTINCT FROM b.seller_ref
     OR s.shipper_contract_nr       IS DISTINCT FROM b.shipper_ref
     OR s.buyer_contract_nr         IS DISTINCT FROM b.buyer_contract_nr
     OR s.wolthers_contract_nr      IS DISTINCT FROM b.wolthers_contract_nr
     OR s.roaster_contract_nr       IS DISTINCT FROM b.roaster_contract_nr
     OR s.qc_client_contract_nr     IS DISTINCT FROM b.qc_client_contract_nr
     OR s.end_client_contract_nr    IS DISTINCT FROM b.end_client_contract_nr
     OR s.exporter_sample_number    IS DISTINCT FROM b.exporter_sample_number
     OR s.ico_number                IS DISTINCT FROM b.ico_number
     OR s.container_nr              IS DISTINCT FROM b.container_nr
     OR s.bag_count                 IS DISTINCT FROM b.bag_count
     OR s.bag_weight_kg             IS DISTINCT FROM b.bag_weight_kg
     OR s.bag_type::text            IS DISTINCT FROM b.bag_type
     OR s.bags_quantity_mt          IS DISTINCT FROM b.bags_quantity_mt
     OR s.equivalent_60kg_bags      IS DISTINCT FROM b.equivalent_60kg_bags
     OR s.importer_id               IS DISTINCT FROM b.importer_id
     OR s.roaster_id                IS DISTINCT FROM b.roaster_id
     OR s.end_client_id             IS DISTINCT FROM b.end_client_id
     OR s.importer_is_qc_client     IS DISTINCT FROM COALESCE(b.importer_is_qc_client, true)
     OR s.client_id                 IS DISTINCT FROM b.client_id;
  IF v_bad > 0 THEN
    FOR v_row IN
      SELECT b.certificate_number FROM cert_before b
      JOIN sample_contract_migrations m ON m.sample_contract_id = b.sample_contract_id
      JOIN samples s ON s.id = m.sibling_sample_id
      WHERE s.bag_count IS DISTINCT FROM b.bag_count OR s.seller_contract_nr IS DISTINCT FROM b.seller_ref
         OR s.buyer_contract_nr IS DISTINCT FROM b.buyer_contract_nr LIMIT 10
    LOOP RAISE NOTICE 'mismatch: %', v_row.certificate_number; END LOOP;
    RAISE EXCEPTION '% migrated certificates would render differently', v_bad;
  END IF;

  -- The certificate's denormalised client matches its new sample.
  SELECT count(*) INTO v_bad
  FROM certificates c JOIN samples s ON s.id = c.sample_id
  JOIN sample_contract_migrations m ON m.sibling_sample_id = s.id
  WHERE c.client_id IS NOT NULL AND c.client_id IS DISTINCT FROM s.client_id;
  IF v_bad > 0 THEN RAISE EXCEPTION '% certificates carry a client that differs from their sibling', v_bad; END IF;

  -- No sibling is in a cupping session and none owns lab data.
  IF EXISTS (SELECT 1 FROM cupping_sessions cs, samples s
             WHERE s.lab_source_sample_id IS NOT NULL AND s.id = ANY(cs.sample_ids)) THEN
    RAISE EXCEPTION 'a sibling is enrolled in a cupping session';
  END IF;
  IF EXISTS (SELECT 1 FROM quality_assessments qa JOIN samples s ON s.id = qa.sample_id
             WHERE s.lab_source_sample_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a sibling owns a quality assessment';
  END IF;

  RAISE NOTICE 'OK: % sub-contracts -> siblings, samples % -> %, certificates repointed', v_subs, v_before, v_after;
END $$;

-- 9. Report (NOTICE only) ---------------------------------------------------------
DO $$
DECLARE r RECORD; n int := 0;
BEGIN
  -- Groups whose siblings all repeat the lab unit's quantity: probably copies,
  -- not the contract's own figures (the billing feed will bill each of them).
  FOR r IN
    SELECT m.tracking_number, count(*) AS siblings
    FROM samples m JOIN samples s ON s.lab_source_sample_id = m.id
    WHERE s.bag_count IS NOT DISTINCT FROM m.bag_count
      AND s.bags_quantity_mt IS NOT DISTINCT FROM m.bags_quantity_mt
    GROUP BY m.id, m.tracking_number
    HAVING count(*) = (SELECT count(*) FROM samples x WHERE x.lab_source_sample_id = m.id)
    ORDER BY siblings DESC
  LOOP
    n := n + 1;
    RAISE NOTICE 'REVIEW quantities: % — % sibling(s) carry the lab unit''s exact quantity', r.tracking_number, r.siblings;
  END LOOP;
  RAISE NOTICE '% group(s) flagged for quantity review', n;

  FOR r IN
    SELECT b.certificate_number, b.mother_shipment_month, b.sub_shipment_month FROM cert_before b
    WHERE b.sub_shipment_month IS NOT NULL AND b.sub_shipment_month IS DISTINCT FROM b.mother_shipment_month
  LOOP
    RAISE NOTICE 'NOTE shipment month: % now prints % (was %)', r.certificate_number, r.sub_shipment_month, r.mother_shipment_month;
  END LOOP;
END $$;

COMMIT;
```

- [ ] **Step 2: Syntax check locally** (no DB): `node -e "const s=require('fs').readFileSync('database/migrations/20260828000001_one_sample_per_contract.sql','utf8'); const b=(s.match(/BEGIN;/g)||[]).length, c=(s.match(/COMMIT;/g)||[]).length; if(b!==1||c!==1) throw new Error('tx'); console.log('ok', s.length)"`

- [ ] **Step 3: Dry-run the copy rule in TypeScript against the production snapshot**: run `scratchpad/probe-subcontracts.cjs` output (`subs.json`) through `buildSiblingRow` for all 98 rows and assert every row's rendered fields equal the `cert_before` rule. Script (`scratchpad/dry-run.mjs`, throwaway):

```js
import { readFileSync } from 'node:fs'
import { buildSiblingRow } from '../../src/lib/sample-group.ts' // run with `npx tsx` or vitest --run as a test file
```
(If `tsx` is unavailable, write it as `src/lib/sample-group.dryrun.test.ts` reading `subs.json` when present and `it.skip` otherwise — delete before commit.)

- [ ] **Step 4: Commit (do NOT push)**

```bash
git add database/migrations/20260828000001_one_sample_per_contract.sql
git commit -m "feat(db): one sample per contract — siblings via lab_source_sample_id, certificates repointed"
```

---

## Stage 2 — Render from the certificate's own row

### Task 6: `certificate-data.ts` renders the sample the certificate points at

**Files:**
- Modify: `src/lib/certificate-data.ts` — signature at :225, mother cert query :447-460, contractOverride :891-1023, return block :1025-1130; every lab-data query (`quality_assessments`, `cupping_scores`, `roast_profiles`, `quality_overrides`, `cupping_sessions`) keyed on `sampleId`
- Modify callers: `src/lib/certificate-render.ts:28`, `src/app/api/samples/[id]/certificate/route.ts:116`, `src/app/api/certificates/bulk-download/route.ts:97`, `src/app/api/certificates/send-email/route.ts:208`, `src/lib/certificate-pdf.ts:91`
- Delete: `src/lib/certificate-supply-refs.ts` (+ its test if any)
- Test: existing `src/lib/certificate-data*.test.ts` / `src/components/pdf/certificate/*.test.ts` keep passing; add `src/lib/certificate-data.lab-source.test.ts` if a fake client fixture exists in the repo (see `src/lib/cupping/finalize-pipeline.test.ts` for the fake-Supabase pattern)

**Interfaces:**
- Consumes: `labSourceId` (Task 1), `bulkContainerCount` (Task 3)
- Produces: `getCertificateData(sampleId: string, client?: SupabaseClient)` — the `contractId` parameter is REMOVED. `CertificateData['sample']` gains `container_count: number | null` and `lab_source_sample_id: string | null`.

- [ ] **Step 1:** Change the signature to `getCertificateData(sampleId: string, client?: ...)`. Grep-fix all five callers (pass no contract id).
- [ ] **Step 2:** After the sample row loads (:237-287) compute `const labId = labSourceId(sample)`; add `lab_source_sample_id, contract_ordinal, container_count` to the select. Replace every lab-data `.eq('sample_id', sampleId)` in this file with `.eq('sample_id', labId)` (quality_assessments, cupping_scores aggregate, roast, overrides, sessions). The certificate query (:447-460) stays `.eq('sample_id', sampleId)` and drops `.is('sample_contract_id', null)`.
- [ ] **Step 3:** Delete the whole `contractOverride` declaration and `if (contractId) {...}` block (:891-1023). In the return block replace every `contractOverride?.x ?? y` with `y`; `bags: sample.bag_count || sample.bags`; add `container_count: sample.container_count ?? null`, `lab_source_sample_id: sample.lab_source_sample_id ?? null`. `resolveStatus(sample.status, certificate)` — drop the third argument and its parameter.
- [ ] **Step 4:** Delete `src/lib/certificate-supply-refs.ts` and its import. The seller "Ref:" is `resolveRefForDisplay(sample.seller_contract_nr, sysMotherRefs?.seller_reference, isRefPinned(motherPins,'seller_contract_nr'))` for every sample (that is what the mother path already does; the sibling row now carries the cross-mapped value).
- [ ] **Step 5:** `npx tsc --noEmit` clean; `npx vitest run src/lib src/components/pdf` green.
- [ ] **Step 6: Commit** — `git commit -m "refactor(cert): render a certificate from its own sample row; lab data via the lab unit"`

---

### Task 7: Certificate PDF quantity line

**Files:**
- Modify: `src/components/pdf/certificate/certificate-sample-details.tsx:53-141` (props + `formatQuantity`), `src/components/pdf/certificate/quality-certificate.tsx:168-179`
- Test: `src/components/pdf/certificate/certificate-sample-details.test.ts` (new)

**Interfaces:**
- Consumes: `formatBulkQuantity` (Task 3)
- Produces: `CertificateSampleDetailsProps.containerCount?: number | null`; exported `formatQuantity(props)` for tests

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { formatQuantity } from './certificate-sample-details'
const base = { bagsQuantityMt: null, bags: null, bagType: null, bagWeightKg: null, equivalent60kgBags: null, containerCount: null } as any
describe('certificate quantity line', () => {
  it('bulk prints containers + MT', () => {
    expect(formatQuantity({ ...base, bagType: 'bulk', bagsQuantityMt: 43.2, containerCount: 2, bags: 720 })).toEqual({ mainValue: '2 containers in bulk', packagingInfo: '(43.2 MT)' })
    expect(formatQuantity({ ...base, bagType: 'bulk', bags: 720 })).toEqual({ mainValue: '2 containers in bulk', packagingInfo: '(43.2 MT)' })
  })
  it('bags are unchanged', () => {
    expect(formatQuantity({ ...base, bagType: 'jute_bag', bags: 720, bagWeightKg: 60, bagsQuantityMt: 43.2 })).toEqual({ mainValue: '43.2 MT', packagingInfo: '(720 × 60 kg jute bags)' })
    expect(formatQuantity({ ...base, bagType: 'big_bag', bags: 20, bagWeightKg: 1000, bagsQuantityMt: 20 })).toEqual({ mainValue: '20.0 MT', packagingInfo: '(20 × 1000 kg big bags)' })
  })
})
```

- [ ] **Step 2:** Export `formatQuantity`; make the bulk branch `return`-early: `if (normalizedBagType === 'bulk') { const line = formatBulkQuantity({ container_count: containerCount, bags_quantity_mt: bagsQuantityMt, bag_count: bags }); if (line) { const i = line.indexOf(' ('); return { mainValue: line.slice(0, i), packagingInfo: line.slice(i + 1) } } }`. Leave the non-bulk chains exactly as they are (big-bag wording on existing certificates must not change).
- [ ] **Step 3:** `quality-certificate.tsx`: pass `containerCount={sample.container_count}`.
- [ ] **Step 4:** Run the test + the page-fit tests (`npx vitest run src/components/pdf`) → PASS. **Commit** `fix(cert): bulk prints 'N containers in bulk (X MT)'`.

---

### Task 8: Public page, JSON summary, QR data, sample-photo page

**Files:**
- Modify: `src/app/certificate/[...path]/page.tsx` (:63 select, :105 filter, :511-530 quantity, :576-607 view), `src/app/api/certificate/[slug]/route.ts:98`, `src/lib/qr-code.ts:154`, `src/app/sample-photo/[slug]/page.tsx:40`, `src/lib/certificate-slug.ts` (no change — `resolveSampleIdForSlug` already returns `certificates.sample_id`, which is now the sibling)

- [ ] **Step 1:** Remove every `.is('sample_contract_id', null)` in these files.
- [ ] **Step 2:** In `[...path]/page.tsx` add `lab_source_sample_id, container_count, equivalent_60kg_bags` to `sampleSelect`; every lab-data read (`quality_assessments`, `cupping_scores`, etc.) uses `labSourceId(sample)`; quantity text = `formatQuantityLine(sample)` (bulk → containers wording; bags → `720 bags · 43.2 MT` stays as today — keep the existing two-part layout for bags, only swap the bulk case).
- [ ] **Step 3:** `[slug]/route.ts` and `qr-code.ts`: same filter removal; lab data via `labSourceId`.
- [ ] **Step 4:** tsc + `npx vitest run src/lib/qr-code src/lib/certificate-slug` → green. **Commit** `fix(public): certificate page reads its own sample; lab data via the lab unit`.

---

### Task 9: `/api/samples/[id]` (GET/PATCH/DELETE) and `/api/samples/[id]/certificate`

**Files:**
- Modify: `src/app/api/samples/[id]/route.ts` (GET :40-250, PATCH :253-510, DELETE :512+), `src/app/api/samples/[id]/certificate/route.ts` (GET :21-200, POST :214-495)

**Interfaces:**
- Consumes: `fetchGroup`, `labSourceId`, `groupSampleIds` (Task 1); `mintGroupCertificates` (Task 11 — until it exists, keep the POST's mother-cert path and delete only the sub-contract loop)
- Produces: GET response gains `group: Array<{ id, tracking_number, contract_ordinal, lab_source_sample_id, certificate_number, certificate_id, buyer_contract_nr, wolthers_contract_nr, exporter_sample_number, importer_name, bag_count, bag_type, bags_quantity_mt, container_count, status }>` (lab unit first) and `lab_source_sample_id`, `contract_ordinal`, `container_count`; the `?contract_id=` overlay is REMOVED (a legacy `?contract_id=` resolves through `sample_contract_migrations` to the sibling id and the sibling is returned).

- [ ] **Step 1 (GET):** Delete the `if (contractId) {...}` overlay block. At the top: `const legacy = request.nextUrl.searchParams.get('contract_id'); if (legacy) { const { data } = await supabase.from('sample_contract_migrations').select('sibling_sample_id').eq('sample_contract_id', legacy).maybeSingle(); if (data) id = data.sibling_sample_id }`. `certificate` = the single cert for this sample (drop the `sample_contract_id === null` pick). Add the `group` array via `fetchGroup(supabase, sample.id)` + one `certificates` `.in('sample_id', ids)` query + one `companies` lookup for importer names.
- [ ] **Step 2 (PATCH):** `allowedFields` += `'container_count'`; `certFields` += `'container_count', 'exporter_sample_number', 'supplier_contract_nr'`. When `bag_type === 'bulk'` (body or existing) and any of `container_count | bags_quantity_mt` is in the body: `Object.assign(updateData, bulkQuantitiesFromContainers(container_count ?? existing.container_count, bags_quantity_mt ?? existing.bags_quantity_mt))` (server enforces the invariant; extend the `existingSample` select with `bag_type, container_count, bags_quantity_mt`).
- [ ] **Step 3 (DELETE):** soft-deleting a lab unit soft-deletes its siblings: after the existing guard, `const ids = await groupSampleIds(supabase, id)` and apply the same update to `.in('id', ids)`. Deleting a sibling deletes only itself.
- [ ] **Step 4 (`certificate/route.ts` GET):** drop `contract_id` handling except the legacy resolver above (map to sibling id, then proceed as a plain sample); buyer ref for the filename from the sample row; cert lookup `.eq('sample_id', id)` only.
- [ ] **Step 5 (`certificate/route.ts` POST):** delete `createSubContractCertificates` (:409-494) and both call sites; the mother mint stays (`.eq('sample_id', id)` without the null filter). Task 11 replaces this with `mintGroupCertificates`.
- [ ] **Step 6:** tsc + vitest → green. **Commit** `refactor(api): sample detail and certificate routes read the certificate's own sample`.

---

### Task 10: Certificate editor — no contract plumbing, bulk quantity, contracts section

**Files:**
- Modify: `src/components/certificates/cert-editor/use-cert-editor.ts` (drop `contractId` param; remove `splitCommercialPayload`; bulk recompute), `certificate-edit-overlay.tsx` (drop `contractId` prop + `forceReadOnly`; mount `ContractsSection`), `info-strip.tsx` (:89 `QuantityEditor`, :130-164 tile, :488-509 `DetailsEditPanel` quantity block), `src/app/api/samples/[id]/quality-assessment/route.ts` (GET :408 and POST resolve `labSourceId`), `src/app/api/cupping/scores/aggregate/route.ts`, `src/app/api/cupping/check-edit-permission/route.ts`
- Create: `src/components/certificates/cert-editor/contracts-section.tsx`, `src/components/samples/intake/bulk-quantity-fields.tsx`
- Delete: `src/components/certificates/cert-editor/split-commercial-payload.ts` + test
- Callers: `src/app/certificates/page.tsx` (drop `editContractId`), `src/app/samples/qc/page.tsx` (drop `detailContractId`; child rows call `setDetailSampleId(sc.id)`), `src/app/samples/other/page.tsx`, `src/app/cupping/page.tsx`

**Interfaces:**
- Produces: `<BulkQuantityFields containers mt onChange(next: { container_count: string; bags_quantity_mt: string }) />` showing derived `eq. N × 60 kg bags`; `<ContractsSection sampleId group onAdd onOpen />` listing the group (ordinal, refs, `formatQuantityLine`, certificate number) with "Add contract" opening `AddSubContractDialog` (Task 21) and each row opening the overlay on that member.
- Consumes: GET `/api/samples/[id]` `group` (Task 9), `bulkQuantitiesFromContainers`, `formatQuantityLine`.

- [ ] **Step 1:** `useCertEditor(sampleId, open)`; `COMMERCIAL_FIELDS` += `'container_count'`; in `saveCommercial` replace the `computeBagQuantities` block with: bulk → `Object.assign(payload, bulkQuantitiesFromContainers(draft.sample.container_count, draft.sample.bags_quantity_mt))`; else the existing `computeBagQuantities` call. Single `PATCH /api/samples/${sample.id}`.
- [ ] **Step 2:** `info-strip.tsx`: tile text = `formatQuantityLine(draftSample ?? sample)`; `QuantityEditor` and `DetailsEditPanel` render `<BulkQuantityFields>` when `bag_type === 'bulk'`, else the count/weight inputs.
- [ ] **Step 3:** `quality-assessment/route.ts`: `const labId = await resolveLabSourceId(supabase, sampleId)` and use it for the `quality_assessments` read and upsert (siblings never diverge — a sibling edit writes the lab unit's assessment); same in `cupping/scores/aggregate` and `check-edit-permission`.
- [ ] **Step 4:** `ContractsSection` in the overlay below the supply-chain table; pages drop the contractId state.
- [ ] **Step 5:** Keep `info-strip` under 600 lines; if the details panel grows, move the quantity block into `bulk-quantity-fields.tsx`.
- [ ] **Step 6:** tsc + `npx vitest run src/components/certificates` → green. **Commit** `feat(cert-editor): edit a certificate's own sample; bulk as containers + MT; contracts section`.

---

## Stage 3 — Decisions, minting, queues

### Task 11: `certificate-mint.ts` — one certificate per group member

**Files:**
- Create: `src/lib/cupping/certificate-mint.ts` (extract from `finalize-pipeline.ts:148-393`)
- Modify: `src/lib/cupping/finalize-pipeline.ts` (`applyDecision` :28-80 fans out; `mintCertificates` delegates; `closeSessionIfComplete` unchanged), `src/app/api/samples/[id]/certificate/route.ts` POST, `src/app/api/samples/[id]/quality-assessment/route.ts:198-374` (`autoCertifyIfReady`), `src/app/api/cupping/cva/finalize/route.ts` (already via pipeline)
- Test: `src/lib/cupping/finalize-pipeline.test.ts` (rewrite the two sub-contract tests at :428/:457 as group tests), `src/lib/cupping/certificate-mint.test.ts`

**Interfaces:**
- Produces: `mintGroupCertificates(db, sampleId, opts: { issuedBy: string; isRejected: boolean; validFrom: string; validUntil: string; overrideComment?: string | null }): Promise<{ minted: string[]; revised: string[]; failed: Array<{ sampleId: string; error: string }> }>` — resolves the group via `fetchGroup`, iterates in `sortGroup` order (lab unit first, so the number series follows contract order), per member: existing cert → revise in place (today's :238-310 branch), none → insert `{ sample_id: member.id, certificate_number: null, issued_to: <member's client fantasy_name || name>, issued_by, status: 'issued', valid_from, valid_until, is_rejected }` and check the insert error. `applyDecisionToGroup(db, sampleId, patch: { status; workflow_stage; seller_comment? })` updates every member.
- Consumes: `fetchGroup`, `sortGroup` (Task 1).

- [ ] **Step 1:** Write `certificate-mint.test.ts` with the repo's fake-Supabase pattern (copy the helper from `finalize-pipeline.test.ts:200-260`): (a) a group of lab unit + 2 siblings mints 3 certificates in ordinal order, each `issued_to` its own client; (b) a member with an existing cert is revised, not re-minted; (c) an insert error on one sibling is reported in `failed` and does not stop the others.
- [ ] **Step 2:** Implement; `finalize-pipeline.mintCertificates` becomes a thin wrapper; `applyDecision` calls `applyDecisionToGroup` then `writeDecisionToShipmentSamples` (unchanged call). Delete the `sample_contracts` loop and every `.is('sample_contract_id', null)`.
- [ ] **Step 3:** `certificate/route.ts` POST and `autoCertifyIfReady` call `mintGroupCertificates`.
- [ ] **Step 4:** Update `finalize-pipeline.test.ts`; run `npx vitest run src/lib/cupping` → PASS. **Commit** `refactor(cupping): mint one certificate per group member; decisions apply to the whole group`.

---

### Task 12: Override, approval attachments, recipients, sys write-back

**Files:**
- Modify: `src/app/api/certificates/[id]/override/route.ts:74-142`, `src/app/api/samples/[id]/notify-approval/route.ts:113-118`, `src/app/api/samples/[id]/approval-recipients/route.ts:106`, `src/lib/approval-notification/sys-decision-writeback.ts:95-119`
- Test: `src/lib/approval-notification/sys-decision-writeback.test.ts`

- [ ] **Step 1 (override):** `const ids = await groupSampleIds(supabaseAdmin, certificate.sample_id)`; update `samples` `.in('id', ids)`; the "other certificates" loop becomes `.in('sample_id', ids).neq('id', certificateId)` (same number/comment/violation handling); `invalidateCertificatePdf` per id.
- [ ] **Step 2 (notify-approval, approval-recipients):** certificates `.in('sample_id', ids)` where `ids = await groupSampleIds(...)`; drop the null filter.
- [ ] **Step 3 (write-back):** replace the `sample_contracts` loop with `const members = await fetchGroup(admin, sampleId)`; for each non-lab-unit member resolve `resolveSampleContract(admin, { contract_id: m.contract_id, wolthers_contract_nr: m.wolthers_contract_nr })`, dedupe by `contractId`, `waqcRef = (certNumberById.get(m.id) ?? m.tracking_number).replace(/^R-/, '')` where `certNumberById` comes from one `certificates` `.in('sample_id', memberIds)` read. Lab unit unchanged (`s.tracking_number`).
- [ ] **Step 4:** Rewrite the write-back test's sub-contract case as a sibling case (fake `samples` rows with `lab_source_sample_id`). Run → PASS. **Commit** `fix(decisions): override, approval mail and sys write-back cover the whole contract group`.

---

### Task 13: Queues and lab-data readers

**Files:**
- Modify: `src/app/api/cupping/my-samples/route.ts:155-195`, `src/app/api/cupping/cva/eligible/route.ts:29-42`, `src/app/api/notifications/samples-assigned/route.ts:75-215`, `src/app/api/samples/bulk/move-to-cupping/route.ts`, `src/app/api/cupping/my-samples/bulk-data/route.ts:62-67`, `src/lib/compliance.ts`, `src/lib/cupping/load-cva-certificate-inputs.ts`, `src/lib/embed/quadrant-aggregate.ts:493`, `src/app/api/clients/[id]/defect-summary/route.ts`, `src/components/dashboard/activity-heatmap.tsx`, `src/lib/queries/cupping-assignments.ts`

- [ ] **Step 1:** Add `.is('lab_source_sample_id', null)` to the samples queries in `my-samples`, `cva/eligible`, `samples-assigned` (reject a sibling id with 400 `'Contract siblings are not cupped; assign the lab unit'`) and `move-to-cupping`.
- [ ] **Step 2:** `bulk-data`: drop `.is('sample_contract_id', null)`.
- [ ] **Step 3:** `compliance.ts` `evaluateQualityCompliance(admin, sampleId, ...)`, `load-cva-certificate-inputs.ts`, `quadrant-aggregate.ts`: first line `sampleId = await resolveLabSourceId(db, sampleId)` for the lab-data reads (the certificate/commercial reads keep the original id). `defect-summary` and `activity-heatmap` and `cupping-assignments`: filter `lab_source_sample_id IS NULL` where they count samples cupped.
- [ ] **Step 4:** tsc + `npx vitest run src/lib` → green. **Commit** `fix(cupping): queues list lab units only; lab data resolves through the lab unit`.

---

## Stage 4 — Lists, search, reports, emails, print, portal

### Task 14: `/api/samples` list + intake POST + QC page

**Files:**
- Modify: `src/app/api/samples/route.ts` (GET :30-300, POST :317-597), `src/app/samples/qc/page.tsx` (:82 `SubContract`, :160-162, :609-615 sleeve entries, :963-971 remove, :1454-1470 chevron, :1802-1875 child rows, :2160 dialog, :2299), `src/components/samples/intake/pss-link-step.tsx`, `src/lib/pss-picker-option.ts:72-137`, `src/lib/pss-intake-mapping.ts:88-146` (delete `mapSubContractOverride`), `src/components/samples/sample-intake-form.tsx` (:97-98, :492-523, :784-836, :892-981)
- Test: `src/lib/pss-picker-option.test.ts`, `src/lib/pss-intake-mapping.test.ts`

**Interfaces:**
- Produces: GET returns lab units as top-level rows (`.is('lab_source_sample_id', null)`) and, per row, `sub_contracts: SiblingRow[]` where `SiblingRow = { id (sibling sample id), tracking_number, contract_ordinal, importer_name, roaster_name, end_client_name, qc_client_name, client_id, importer_is_qc_client, buyer_contract_nr, wolthers_contract_nr, roaster_contract_nr, end_client_contract_nr, qc_client_contract_nr, supplier_contract_nr, ico_number, container_nr, exporter_sample_number, bag_count, bag_weight_kg, bag_type, bags_quantity_mt, equivalent_60kg_bags, container_count, shipment_month, has_certificate, certificate_id, certificate_number, status, workflow_stage }`, `contract_count`, `sub_contract_tracking_numbers`. Siblings come from ONE follow-up query `.in('lab_source_sample_id', pageIds)` (no self-embed). POST accepts `contracts: ContractInput[]` and creates siblings server-side via `createSiblingSamples` (Task 19's helper — build it in Task 19 first if executing out of order; here call it).
- SS→PSS: the picker lists every group member as its own option (`buildPssPickerOptions(labUnit)` maps `sub_contracts` to options exactly as today, but `resolvePssSelection` returns `{ sample: member }`), `linked_pss_sample_id` = the chosen member's id; `linked_pss_sample_contract_id` is no longer sent.

- [ ] **Step 1 (GET):** remove the `sample_contracts!...` embed and its entity batch; add `.is('lab_source_sample_id', null)` to the list and count queries; fetch siblings + their certs + importer/roaster/client names in three queries; build `sub_contracts` with the shape above. `linked_pss` resolves from `linked_pss_sample_id` alone (the leaf is a sample now): `certificate_number` of that sample if issued, else its `tracking_number`.
- [ ] **Step 2 (POST):** after the mother insert, `if (Array.isArray(body.contracts) && body.contracts.length) { const r = await createSiblingSamples(supabase, sample, body.contracts, user.id); response.siblings = r }`. Keep `linked_pss_sample_id`; drop `linked_pss_sample_contract_id` from the insert.
- [ ] **Step 3 (QC page):** child rows open `setDetailSampleId(sc.id)`; sleeve entries `{ id: sc.id }`; QR selection keyed by `sc.id`; delete the `detailContractId` state; remove handler at :963 deletes via `DELETE /api/samples/${sc.id}`. `SubContract` type = `SiblingRow`. Keep the chevron and tree-connector rows as they are.
- [ ] **Step 4 (intake form):** send `contracts` in the POST body (map `SubContractFormData` → `ContractInput` with the already-resolved ids; bulk contracts through `bulkQuantitiesFromContainers`); delete the client-side loop (:892-981); surface `siblings.failed` as a warning toast. Remove `linked_pss_sample_contract_id` from `FormData`/state/`pss-link-step`.
- [ ] **Step 5:** Update the two test files (a sibling is a plain sample; `mapSubContractOverride` gone → SS prefill from a sibling uses `mapPssToFormData(sibling)`). tsc + vitest → green. **Commit** `refactor(samples): list groups from sibling rows; intake creates siblings server-side`.

---

### Task 15: `/api/certificates` + page, search

**Files:**
- Modify: `src/app/api/certificates/route.ts` (:16-26 SEARCH_FIELDS stay, :74 select, :165-193 search, :252-306 send-status), `src/app/certificates/page.tsx` (:84, :213 tin note, :500, :619, :805-808, :985-995, :1058, :1077, :1274, :1349), `src/lib/search/cert-search-filter.ts:30-42`, `src/app/api/samples/search/route.ts:37-51`
- Test: `src/lib/search/cert-search-filter.test.ts`, `src/lib/print-selection.test.ts`

- [ ] **Step 1 (API):** select `lab_source_sample_id, contract_ordinal, bag_type, bag_count, bag_weight_kg, bags_quantity_mt, container_count` on `sample`; drop `sample_contract_id`; search scans `samples` only (siblings are samples) → `buildCertificateSearchOr(like, { sampleIds, clientSampleIds })` = `sample_id.in.(…)` branches only; send-status keys by `cert.sample.id` (already).
- [ ] **Step 2 (page):** remove `sample_contract_id` everywhere (no `?contract_id=`); SAMPLE column unchanged code (now reads the sibling's own `exporter_sample_number`); add a muted `formatQuantityLine(cert.sample)` line under the sample cell; `certificatesToTinSampleIds` gets `lab_source_sample_id` (Task 18) — pass it through.
- [ ] **Step 3 (`samples/search`):** drop the `sample_contracts` scan; include `buyer_contract_nr, certificate_number, contract_ordinal` in the projection so sibling rows are distinguishable in the palette.
- [ ] **Step 4:** tests → PASS. **Commit** `refactor(certificates): list and search over the certificate's own sample`.

---

### Task 16: Reports count samples

**Files:**
- Modify: `src/lib/report-data.ts` (:237-283 `mapCertRowToReportRow`, delete :289-338 `fetchSubContractOverrides`/`attachSubContracts`), `src/lib/reports/performance-data.ts` (:177-186 `countContracts`, :382-386 query, :465-496 `rejectedIdsFor`), `src/lib/reports/annual-data.ts:205-207`
- Test: `src/lib/report-data.test.ts`, `src/lib/reports/performance-data.test.ts`, `src/lib/reports/annual-data.test.ts`

- [ ] **Step 1:** `mapCertRowToReportRow(cert)` reads every field from `cert.sample` (quantity via `computeBagsAndMt` unchanged; `container_count` passed through); delete the override plumbing and the `.is('sample_contract_id', null)`-free query stays as is.
- [ ] **Step 2:** `countContracts` = number of certificate rows (each certificate is one contract now). Add the fixture from the spec: 12 approved + 10 rejected must report 22 contracts.
- [ ] **Step 3:** `rejectedIdsFor`: dedupe by `labSourceId(c.sample)` and query `quality_assessments` by those lab ids; `cert.sample` select gains `lab_source_sample_id`.
- [ ] **Step 4:** tests updated (sibling fixtures replace sub-contract fixtures) → PASS. **Commit** `fix(reports): one row per certificate, contracts = certificates, defects via the lab unit`.

---

### Task 17: Approval emails and batch send

**Files:**
- Modify: `src/lib/approval-notification/quality-summary.ts` (:42-43 `certUnitKey` → sample id, delete :364-399 `buildSubContractSummary`, :743-796 lab data via `resolveLabSourceIds`), `src/lib/approval-notification/batch-send.ts:56-201`, `src/app/api/certificates/batch-send/route.ts` (:173, :238, :354), `src/app/api/certificates/batch-send/queue/route.ts` (:42, :94-140, :206-262)
- Test: `src/lib/approval-notification/quality-summary.test.ts`, `batch-send.test.ts`

- [ ] **Step 1:** `certUnitKey(sampleId)` = the id; every summary is built from its own sample row; lab data read once per lab unit (`resolveLabSourceIds` over the batch) and shared by its siblings — the behaviour `buildSubContractSummary` used to clone.
- [ ] **Step 2:** batch-send writes `metadata: { source, sample_id, side }` (no `sample_contract_id`); the queue reads prior sends by `metadata.sample_id` (the migration rewrote history).
- [ ] **Step 3:** tests → PASS. **Commit** `refactor(email): approval summaries per sample; batch units keyed by sample id`.

---

### Task 18: Print, sleeves, labels, portal, client delete, tin-labels

**Files:**
- Modify: `src/lib/print-selection.ts:33-73`, `src/lib/sleeve-label-data.ts:221-310`, `src/app/api/samples/bulk/print-tin-sleeves/route.tsx:200-207`, `src/app/api/samples/bulk/print-bag-sleeves/route.tsx:52`, `src/app/api/samples/[id]/print-tin-sleeve/route.tsx`, `src/app/api/samples/[id]/print-bag-sleeve/route.tsx`, `src/app/api/samples/bulk-details/route.ts:91`, `src/app/api/samples/tin-labels/pending-today/route.ts:30`, `src/app/api/portal/certificates/route.ts:15-16`, `src/lib/portal/portal-certificates.ts:20`, `src/app/api/clients/[id]/route.ts:251-280`, `src/components/cupping/print-cupping-cards-dialog.tsx`, `src/components/pdf/thermal-cupping-card*.tsx`
- Test: `src/lib/print-selection.test.ts`, `src/lib/sleeve-label-data.test.ts`

- [ ] **Step 1:** `certificatesToTinSampleIds(certs)` dedupes by `cert.sample.lab_source_sample_id ?? cert.sample_id` (one tin per physical sample); `certificatesToBagSleeveEntries` = one entry per certificate `{ id: cert.sample_id }` (no `contractId`).
- [ ] **Step 2:** `orderSleeveCertificates(rows, members)` orders by `contract_ordinal` (lab unit first) — `SleeveSubContract` becomes `{ id, contract_ordinal, tracking_number }`. Tin sleeve quantity: `sumSleeveQuantityMt` over the group's `bags_quantity_mt`; for bulk groups print the group container total via `formatBulkQuantity({ container_count: Σ, bags_quantity_mt: Σ })`.
- [ ] **Step 3:** `bulk-details` builds "one card per container" from the group members; `pending-today` and `portal` drop the null filter (siblings visible to their client); `portal-certificates.ts` download URL from the certificate's own sample `tracking_number` (unchanged code, now correct). `clients/[id]` delete: remove the `sample_contracts` count/null — `samples` covers them.
- [ ] **Step 4:** tests → PASS. **Commit** `fix(print): one tin per physical sample, sleeves ordered by contract; portal shows every certificate`.

---

## Stage 5 — Intake, siblings API, bulk UI, auto-increment

### Task 19: `createSiblingSamples` + `POST /api/samples/[id]/siblings`

**Files:**
- Modify: `src/lib/sample-group.ts` (append `createSiblingSamples`)
- Create: `src/app/api/samples/[id]/siblings/route.ts`
- Replace: `src/app/api/samples/[id]/contracts/route.ts` → every method returns `410 { error: 'Sub-contracts are samples now. Use POST /api/samples/[id]/siblings or PATCH /api/samples/[sibling id].' }`
- Test: `src/lib/sample-group.test.ts` (append, fake client)

**Interfaces:**
- Produces: `createSiblingSamples(db, labUnit: GroupMember, inputs: ContractInput[], userId: string): Promise<{ created: GroupMember[]; failed: Array<{ index: number; error: string }> }>` — per input: next ordinal = `max(existing contract_ordinal, 1) + 1`; `trackingNumber` via `db.rpc('generate_sample_number', { p_laboratory_id })` (retry ×3 on unique violation `23505`, as the duplicate route does); bulk inputs normalised with `bulkQuantitiesFromContainers`; insert `buildSiblingRow(labUnit, input, …)`; if the lab unit has a certificate, mint the sibling's via `mintGroupCertificates` (Task 11) — only for the new ids; then `writeDecisionToShipmentSamples(admin, labUnit.id, userId, null, { syncOnly: true })` once. Sets `contract_ordinal = 1` on the lab unit when NULL.
- Route: `POST { contracts: ContractInput[] }` → `requireEditor` (copy from the old contracts route :20-37) → `201 { created, failed }`.

- [ ] **Step 1:** Test with the fake client: two inputs create two siblings with ordinals 2 and 3 and tracking numbers from the rpc; a bulk input stores `container_count: 2, bags_quantity_mt: 43.2, bag_count: 720`.
- [ ] **Step 2:** Implement + route. **Commit** `feat(samples): add contracts to an existing sample as sibling rows`.

---

### Task 20: Intake UI — per-contract quantity, bulk fields, auto-increment

**Files:**
- Modify: `src/components/samples/intake/contracts-step.tsx` (:54-77 `createEmptyContract`, :234-281 effects, :585-700 quantity block, :562 gate), `src/components/samples/intake/quantity-step.tsx` (:56-118, :135-190, :340-350), `src/components/samples/intake/types.ts` (:93-98, :139-145: add `container_count: string` to both; drop `bulk_container_count`), `src/components/samples/sample-intake-form.tsx` (:555-557 validation, :600-603 `handleAddContract`)
- Test: `src/components/samples/intake/contracts-step.test.tsx` (new, RTL): adding a second contract prefills incremented refs; switching a contract to bulk shows Containers + MT and derives the equivalent.

**Interfaces:**
- Consumes: `suggestContractRefs` (Task 2), `bulkQuantitiesFromContainers`, `<BulkQuantityFields>` (Task 10).

- [ ] **Step 1:** `createEmptyContract(formData, previous?, before?)`: start from the mother's values as today, then `Object.assign(contract, suggestContractRefs(previous ?? motherRefs, before))` where `motherRefs` maps `importer_contract_nr → buyer_contract_nr`. `handleAddContract` passes the last two contracts (mother counts as the first).
- [ ] **Step 2:** In both effects and `ContractPanel`: bulk → `<BulkQuantityFields>` writes `container_count` + `bags_quantity_mt`, effect derives `equivalent_60kg_bags`/`bag_count` via `bulkQuantitiesFromContainers`; non-bulk unchanged. Show ICO/container inputs for PSS too (drop the `sampleType !== 'pss'` gate — bulk PSS needs containers).
- [ ] **Step 3:** `QuantityStep`: same bulk fields for the mother; delete `bulk_container_count`.
- [ ] **Step 4:** Validation: each contract with a bag type must have a quantity (`bags_quantity_mt > 0`); message `Contract #N: enter its quantity`.
- [ ] **Step 5:** RTL test → PASS; **Commit** `feat(intake): per-contract quantity with bulk containers; references continue the series`.

---

### Task 21: Add-contract dialog, cupping details dialog, duplicate popover

**Files:**
- Modify: `src/components/samples/add-sub-contract-dialog.tsx` (rename export `AddContractsDialog`, POST to `/api/samples/${sample.id}/siblings` with the whole array; `handleAddContract` uses `suggestContractRefs`; replace the two inline effects with `bulkQuantitiesFromContainers`/`computeBagQuantities`), `src/components/cupping/certificate-edit-dialog.tsx:486-531` (quantity block: bag type select; bulk → `<BulkQuantityFields>`; bags → count/weight; derived via the helpers; PATCH only the quantity quintet + `container_count`, not the legacy `bags`), `src/components/samples/duplicate-count-popover.tsx` (bulk override enters containers + MT)

- [ ] **Step 1–3:** implement each; tsc; existing tests green. **Commit** `feat(samples): add-contracts dialog creates siblings; bulk containers on every edit surface`.

---

## Stage 6 — Cleanup

### Task 22: Delete dead code and legacy plumbing

**Files:**
- Delete: `src/components/samples/sample-contracts-section.tsx`, `src/components/samples/intake/sub-contract-card.tsx`, `src/lib/certificate-supply-refs.ts` (+ tests), `src/components/certificates/cert-editor/split-commercial-payload.*`
- Grep: `sample_contracts|sample_contract_id|linked_pss_sample_contract_id|subContract` across `src` — the only remaining references are the 410 route, `sample_contract_migrations` lookups (legacy `?contract_id=`), and `database.types.ts`.

- [ ] **Step 1:** delete, fix imports, `npx tsc --noEmit`, `npx vitest run` (full) → green.
- [ ] **Step 2: Commit** `chore: remove the sub-contract model`.

### Task 23: Docs, decision log, memory

- [ ] **Step 1:** Append a decision to `~/wolthers-vault/01-projects/waqc/decisions.md` (one sample per contract shipped; bulk wording; auto-increment; billing flag; deployment order).
- [ ] **Step 2:** Memory: new file `sample-per-contract.md` (LIVE when pushed; migration must precede push; siblings; `labSourceId`; `sample_contract_migrations`; open items: billing review groups, drop legacy columns), update `MEMORY.md`; mark `specialty-cva-certify-open-gaps`/reports notes where sub-contracts are mentioned.
- [ ] **Step 3:** Final: `git log --oneline` of unpushed commits listed in the handoff message with the migration SQL pasted.

---

## Self-review

- Spec coverage: data model (T5), sibling rule (T1/T5), numbering (T5), containers/bulk (T3/T7/T8/T10/T20/T21), auto-increment (T2/T20/T21), group-aware behaviours: override/notify/recipients/write-back (T12), lab data (T6/T8/T10/T13/T16/T17), batch metadata (T5/T17), tin/sleeves (T18), queues (T13), QC list grouping (T14), portal (T18), client delete (T18), billing flag (T5 report + final message), deployment order (constraints). Intake N contracts (T14/T19/T20). Legacy `?contract_id=` (T9). Cleanup (T22).
- Names used consistently: `labSourceId`, `resolveLabSourceId(s)`, `fetchGroup`, `groupSampleIds`, `sortGroup`, `buildSiblingRow`, `createSiblingSamples`, `mintGroupCertificates`, `applyDecisionToGroup`, `bulkQuantitiesFromContainers`, `bulkContainerCount`, `formatBulkQuantity`, `formatQuantityLine`, `nextReference`, `suggestContractRefs`, `BulkQuantityFields`, `ContractsSection`, `AddContractsDialog`.
